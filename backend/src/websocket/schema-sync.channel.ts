/**
 * GK-11 · schema.updated 跨端同步 —— 裸 WebSocket 半通道
 *
 * 背景（关键事实，2026-06-10 实测）：
 *   前端 lib/live.ts 的既有客户端是「裸 WebSocket」（ws://host/api/v1/ws/live，
 *   onopen 后首帧发 JSON {token, ...}），而既有后端 LiveGateway 是 socket.io 网关
 *   （engine.io 协议，raw WebSocket 客户端连上即 socket hang up）——即现状下
 *   前端裸 WS 客户端与服务端从未真正握手成功（大屏按设计静默降级）。
 *
 * 本文件补齐同一通道的服务端裸 WS 半侧：
 *   - 同路径：/api/v1/ws/live（与前端既有 WS_PATH 完全一致，vite proxy ws:true 已放行）
 *   - 同鉴权模式：首帧 JSON {token}（沿用 live.ts 客户端现状；服务端现状为不校验，
 *     此处保持宽松：token 缺失不拒连，仅 warn —— schema.updated payload 仅含
 *     {version, updatedAt} 非敏感元数据，真正的重载数据由 JWT 保护的 GET /scene/schema 下发）
 *   - 不另起新通道：挂在既有 HTTP server 的 upgrade 上；注册先于 engine.io attach
 *     （main.ts 在 app.listen 前调用 attachSchemaSyncChannel，而 socket.io 网关在
 *     listen→init 阶段才注册），engine.io 对非匹配路径仅当 bytesWritten<=0 才销毁，
 *     本通道握手完成后已写字节，二者互不干扰。
 *
 * 广播帧格式（前端 schema-sync.ts 解析）：
 *   {"event":"schema.updated","data":{"version":N,"updatedAt":"ISO"}}
 */

import * as http from 'http';
import { Logger } from '@nestjs/common';
import { WebSocket, WebSocketServer } from 'ws';
import {
  SCHEMA_UPDATED_EVENT,
  SchemaUpdatedPayload,
  onSchemaUpdated,
} from './schema-sync.hub';

// 与前端 frontend/src/lib/live.ts 的 WS_PATH 保持一致（既有通道路径）
export const SYNC_WS_PATH = '/api/v1/ws/live';

const logger = new Logger('SchemaSyncChannel');

/**
 * 把裸 WS 半通道挂到既有 HTTP server 上。必须在 app.listen() 之前调用
 * （保证 upgrade 监听器先于 engine.io 注册）。
 */
export function attachSchemaSyncChannel(httpServer: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '', 'http://localhost').pathname;
    } catch {
      return; // 无法解析的 url 交给其他监听器
    }
    if (pathname !== SYNC_WS_PATH) return; // 非 schema-sync 路径：放行给 engine.io 等

    wss.handleUpgrade(req, socket, head, (client) => {
      logger.log(`schema-sync client connected: ${client.url || 'ws'}`);
      client.on('message', (raw) => {
        // 首帧 {token,...}（live.ts 既有协议）：宽松校验，仅记录，不因缺 token 拒连
        try {
          const msg = JSON.parse(String(raw));
          if (msg && typeof msg === 'object' && 'token' in msg) {
            if (!msg.token || typeof msg.token !== 'string') {
              logger.warn('schema-sync client sent empty token (accepted, lenient)');
            }
          }
        } catch {
          /* 非 JSON 帧忽略 */
        }
      });
      client.on('error', () => {
        /* 单连接异常不致命 */
      });
    });
  });

  onSchemaUpdated((payload: SchemaUpdatedPayload) => {
    const frame = JSON.stringify({ event: SCHEMA_UPDATED_EVENT, data: payload });
    for (const client of wss.clients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(frame);
        }
      } catch (e) {
        logger.warn(`push to client failed: ${(e as Error).message}`);
      }
    }
  });

  logger.log(`schema-sync raw WS channel attached at ${SYNC_WS_PATH}`);
}

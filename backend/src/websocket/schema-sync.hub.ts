/**
 * GK-11 · schema.updated 广播事件枢纽（进程内 hub）
 *
 * 设计：
 *   PUT /api/v1/scene/schema 成功（版本落盘 + 反向写回 + 审计）后，
 *   SchemaController 调 emitSchemaUpdated()；所有订阅方各自把事件投递给自己的客户端：
 *     1. schema-sync.channel.ts —— 裸 WebSocket 半通道（前端 lib/live.ts 既有裸 WS 客户端协议）
 *     2. live.gateway.ts        —— socket.io 命名空间 /api/v1/ws/live 内 server.emit
 *
 * 用普通模块级 hub 而非 DI 服务：SchemaController 无需 import WebsocketModule，
 * 避免模块间新增依赖边；两处订阅方在各自初始化时注册回调。
 *
 * 事件契约（与前端 frontend/src/lib/schema-sync.ts 对齐）：
 *   事件名：schema.updated
 *   payload：{ version: number, updatedAt: string }（version 落盘后的新版本号）
 */

export const SCHEMA_UPDATED_EVENT = 'schema.updated';

export interface SchemaUpdatedPayload {
  version: number;
  updatedAt: string;
}

type SchemaUpdatedHandler = (payload: SchemaUpdatedPayload) => void;

const handlers = new Set<SchemaUpdatedHandler>();

/** 订阅 schema.updated 广播；返回取消订阅函数。 */
export function onSchemaUpdated(handler: SchemaUpdatedHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** 发布 schema.updated（单订阅方异常互不影响，绝不向上抛）。 */
export function emitSchemaUpdated(payload: SchemaUpdatedPayload): void {
  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (e) {
      // 广播失败只记录，不影响 PUT 主链路（版本已落盘）
      // eslint-disable-next-line no-console
      console.warn(
        `[schema-sync] broadcast handler error: ${(e as Error).message}`,
      );
    }
  }
}

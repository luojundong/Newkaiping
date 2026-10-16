// Modbus/TCP 最小实现（基于 Node 内置 net 套接字，避免 modbus-serial 原生编译依赖）。
// 生产环境可直接替换为 modbus-serial；此处实现 FC0x03(读保持寄存器) 的最小 MBAP 帧交互，
// 不可达或超时即返回 null，由 RealConnector 回退 Mock，保证演示不中断（任务4）。
//
// 连接配置来自 env：
//   MODBUS_HOST（必填，否则不可用）
//   MODBUS_PORT（默认 502）
//   MODBUS_UNIT_ID（默认 1）
// 真实寄存器映射待甲方网关/BMS 文档到位后补充（OPEN-DECISIONS 未决项）。

import { Logger } from '@nestjs/common';
import * as net from 'net';
import { AdapterName, errMsg, SourceAdapter } from './types';

interface ModbusConfig {
  host: string;
  port: number;
  unitId: number;
}

export class ModbusAdapter implements SourceAdapter {
  readonly name: AdapterName = 'modbus';
  private available = false;
  private txId = 0;

  constructor(private readonly cfg: ModbusConfig | null, private readonly logger: Logger) {
    this.available = !!cfg;
  }

  isAvailable(): boolean {
    return this.available;
  }

  isConfigured(): boolean {
    return !!this.cfg;
  }

  async connect(): Promise<void> {
    if (!this.cfg) {
      this.logger.warn('[ModbusAdapter] 未配置 MODBUS_HOST，将回退至 Mock 数据源');
      this.available = false;
    }
    // 惰性连接：首次 read 时建立 TCP；此处仅标记可用性
  }

  // 发送一次 Modbus/TCP 读保持寄存器请求并返回完整响应帧
  private request(unitId: number, fc: number, addr: number, count: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.cfg) return reject(new Error('modbus 未配置'));
      const sock = new net.Socket();
      const txId = (this.txId = (this.txId + 1) % 0xffff);
      // MBAP(7): txId(2) proto(2)=0 len(2) unit(1) + PDU(6): fc(1) addr(2) count(2)
      const pduLen = 6;
      const frame = Buffer.alloc(7 + pduLen);
      frame.writeUInt16BE(txId, 0);
      frame.writeUInt16BE(0, 2);
      frame.writeUInt16BE(pduLen, 4);
      frame.writeUInt8(unitId, 6);
      frame.writeUInt8(fc, 7);
      frame.writeUInt16BE(addr, 8);
      frame.writeUInt16BE(count, 10);

      let resp: Buffer = Buffer.alloc(0);
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error('modbus 读取超时'));
      }, 2000);

      sock.on('data', (d) => {
        resp = Buffer.concat([resp, d]);
        // 响应至少 MBAP(7)+fc(1)+byteCount(1)+count*2
        if (resp.length >= 9 + count * 2) {
          clearTimeout(timer);
          sock.destroy();
          resolve(resp);
        }
      });
      sock.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      sock.connect(this.cfg.port, this.cfg.host, () => sock.write(frame));
    });
  }

  async read(collection: string): Promise<any[] | null> {
    if (!this.cfg || !this.available) return null;
    try {
      // 演示：读取少量保持寄存器并归一化为单条原始记录；真实寄存器映射待补充
      const buf = await this.request(this.cfg.unitId, 0x03, 0, 2);
      const reg1 = buf.readUInt16BE(9);
      const reg2 = buf.readUInt16BE(11);
      return [{ collection, registers: [reg1, reg2], quality: 'good', source: 'real' }];
    } catch (err) {
      this.logger.warn(`[ModbusAdapter] 读取 ${collection} 失败，回退 mock: ${errMsg(err)}`);
      return null;
    }
  }

  close(): void {
    this.available = false;
  }
}

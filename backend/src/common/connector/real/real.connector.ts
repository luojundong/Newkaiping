// RealConnector：真实数据源连接器（任务4 / ADR-003）。
// 实现与 MockConnector 完全相同的 Connector 接口；内部持有一组可插拔协议适配器
// (HTTP / MQTT / Modbus)。读取某集合时若所有真实适配器均不可达 / 无数据，则优雅回退
// 到注入的 MockConnector 同类数据（保证演示不中断），并记 warn 日志。
//
// 控制逻辑（下发/订阅/归一化）同样优先走真实适配器，失败回退 Mock。
// 切换方式：DATA_SOURCE_MODE=real 时由 ConnectorFactory 返回本类（默认仍 mock）。

import { Logger } from '@nestjs/common';
import { ControlAck, ControlCommand, Metric } from '../../types';
import {
  AdapterAvailability,
  Collection,
  Connector,
  DataSourceInfo,
  Query,
} from '../connector.interface';
import { MockConnector } from '../mock/mock.connector';
import { HttpAdapter } from './adapters/http.adapter';
import { MqttAdapter } from './adapters/mqtt.adapter';
import { ModbusAdapter } from './adapters/modbus.adapter';
import { AdapterName, errMsg, SourceAdapter } from './adapters/types';
import { SYNTHETIC_COLLECTIONS } from '../synthetic-collections';

// 合成/派生集合：真实源无法生成，统一走 Mock 回退。
// 名单来自 synthetic-collections.ts 单一真源（禁止在此复制常量）。
const SYNTHETIC_SET: ReadonlySet<Collection> = new Set<Collection>(SYNTHETIC_COLLECTIONS);

export class RealConnector implements Connector {
  private readonly adapters: SourceAdapter[] = [];
  private readonly adapterMap = new Map<AdapterName, SourceAdapter>();
  private readonly logger = new Logger('RealConnector');

  constructor(private readonly fallback: MockConnector) {
    const httpBase = process.env.HTTP_BASE_URL;
    const mqttBroker = process.env.MQTT_BROKER_URL;
    const modbusHost = process.env.MODBUS_HOST;
    const modbusPort = Number(process.env.MODBUS_PORT || 502);
    const modbusUnit = Number(process.env.MODBUS_UNIT_ID || 1);

    const http = new HttpAdapter(httpBase, this.logger);
    const mqttAd = new MqttAdapter(mqttBroker, this.logger);
    const modbus = new ModbusAdapter(
      modbusHost ? { host: modbusHost, port: modbusPort, unitId: modbusUnit } : null,
      this.logger,
    );

    this.adapters = [http, mqttAd, modbus];
    this.adapters.forEach((a) => this.adapterMap.set(a.name, a));
  }

  async connect(): Promise<void> {
    // 先就绪回退源，确保任何情况下都能服务
    await this.fallback.connect();
    // 尽力连接各真实适配器；任意失败仅记 warn，不阻断启动
    await Promise.all(
      this.adapters.map((a) =>
        a.connect().catch((e) => {
          this.logger.warn(`适配器 ${a.name} 连接失败，回退 mock: ${errMsg(e)}`);
        }),
      ),
    );
    const avail = this.adapters.filter((a) => a.isAvailable()).map((a) => a.name);
    if (avail.length) {
      this.logger.log(`RealConnector 已启用真实适配器: ${avail.join(', ')}（其余回退 mock）`);
    } else {
      this.logger.warn('RealConnector 未检测到可用真实数据源，全部回退 Mock（演示不受影响）');
    }
  }

  private async tryReadReal<T>(collection: Collection, query?: Query): Promise<T[] | null> {
    for (const a of this.adapters) {
      if (!a.isAvailable()) continue;
      try {
        const recs = await a.read(collection, query);
        if (recs && recs.length) return recs as T[];
      } catch (e) {
        this.logger.warn(`适配器 ${a.name} 读取 ${collection} 异常，继续回退: ${errMsg(e)}`);
      }
    }
    return null;
  }

  async read<T = any>(collection: Collection, query?: Query): Promise<T[]> {
    // 合成集合无法由真实源生成，直接走回退
    if (SYNTHETIC_SET.has(collection)) {
      return this.fallback.read<T>(collection, query);
    }
    const real = await this.tryReadReal<T>(collection, query);
    if (real) return real;
    return this.fallback.read<T>(collection, query);
  }

  async findOne<T = any>(collection: Collection, query?: Query): Promise<T | null> {
    const list = await this.read<T>(collection, query);
    return (list && list.length ? list[0] : null) as T | null;
  }

  async create(collection: Collection, record: any): Promise<any> {
    // 配置/告警处置等写路径：真实源不可达时回退 mock 持久化（演示）
    for (const a of this.adapters) {
      const w = (a as any).create;
      if (a.isAvailable() && typeof w === 'function') {
        try {
          return await w.call(a, collection, record);
        } catch (e) {
          this.logger.warn(`适配器 ${a.name} 写 ${collection} 失败，回退 mock: ${errMsg(e)}`);
        }
      }
    }
    return this.fallback.create(collection, record);
  }

  async update(collection: Collection, query: Query, patch: any): Promise<any> {
    for (const a of this.adapters) {
      const w = (a as any).update;
      if (a.isAvailable() && typeof w === 'function') {
        try {
          return await w.call(a, collection, query, patch);
        } catch (e) {
          this.logger.warn(`适配器 ${a.name} 更新 ${collection} 失败，回退 mock: ${errMsg(e)}`);
        }
      }
    }
    return this.fallback.update(collection, query, patch);
  }

  async remove(collection: Collection, query: Query): Promise<void> {
    for (const a of this.adapters) {
      const w = (a as any).remove;
      if (a.isAvailable() && typeof w === 'function') {
        try {
          await w.call(a, collection, query);
          return;
        } catch (e) {
          this.logger.warn(`适配器 ${a.name} 删除 ${collection} 失败，回退 mock: ${errMsg(e)}`);
        }
      }
    }
    return this.fallback.remove(collection, query);
  }

  async send(target: string, payload: ControlCommand): Promise<ControlAck> {
    for (const a of this.adapters) {
      if (a.isAvailable() && a.send) {
        try {
          const r = await a.send(target, payload);
          if (r) {
            return {
              device_id: payload.device_id || null,
              accepted: true,
              message: `指令已下发(${a.name})`,
              echo: { target, action: payload.action, payload: payload.payload, adapter: a.name },
            };
          }
        } catch (e) {
          this.logger.warn(`适配器 ${a.name} 下发失败，回退 mock: ${errMsg(e)}`);
        }
      }
    }
    // 回退 mock（演示）
    return {
      device_id: payload.device_id || null,
      accepted: true,
      message: '指令已受理(mock 回退)',
      echo: { target, action: payload.action, payload: payload.payload },
    };
  }

  subscribe(topics: string[]): void {
    for (const a of this.adapters) {
      if (a.isAvailable() && a.subscribe) {
        try {
          a.subscribe(topics);
        } catch (e) {
          this.logger.warn(`适配器 ${a.name} 订阅失败: ${errMsg(e)}`);
        }
      }
    }
  }

  // 数据源探查（GK-26）：实际生效模式固定为 'real'；
  // 各真实适配器可用性取其实例 isConfigured()/isAvailable()；
  // 合成集合名单直接来自单一真源 SYNTHETIC_COLLECTIONS。
  getDataSourceInfo(): DataSourceInfo {
    const map = (name: AdapterName): AdapterAvailability => {
      const a = this.adapterMap.get(name);
      return a
        ? { configured: a.isConfigured(), available: a.isAvailable() }
        : { configured: false, available: false };
    };
    return {
      mode: 'real',
      adapters: {
        http: map('http'),
        mqtt: map('mqtt'),
        modbus: map('modbus'),
      },
      syntheticCollections: Array.from(SYNTHETIC_COLLECTIONS),
    };
  }

  normalize(raw: any): Metric {
    if (!raw) return this.fallback.normalize(raw);
    return {
      device_id: raw.device_id ?? raw.id ?? '',
      metric_key: raw.metric_key ?? raw.key ?? '',
      value: Number(raw.value ?? raw.v ?? 0),
      unit: raw.unit ?? '',
      time: raw.time ?? new Date().toISOString(),
      quality: (raw.quality as Metric['quality']) ?? 'good',
      source: 'real',
    };
  }
}

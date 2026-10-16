// MQTT 适配器：订阅设备遥测主题并维护最新消息缓存；控制指令经 publish 下发（任务4）。
// 连接配置来自 env MQTT_BROKER_URL；未配置则不可用，由 RealConnector 回退 Mock。

import { Logger } from '@nestjs/common';
import mqtt from 'mqtt';
import { AdapterName, errMsg, SourceAdapter } from './types';

export class MqttAdapter implements SourceAdapter {
  readonly name: AdapterName = 'mqtt';
  private client: ReturnType<typeof mqtt.connect> | null = null;
  private available = false;
  private readonly cache = new Map<string, any>();
  private readonly topics = new Set<string>();

  constructor(private readonly brokerUrl: string | undefined, private readonly logger: Logger) {}

  isAvailable(): boolean {
    return this.available;
  }

  isConfigured(): boolean {
    return !!this.brokerUrl;
  }

  async connect(): Promise<void> {
    if (!this.brokerUrl) {
      this.logger.warn('[MqttAdapter] 未配置 MQTT_BROKER_URL，将回退至 Mock 数据源');
      this.available = false;
      return;
    }
    try {
      this.client = mqtt.connect(this.brokerUrl, { reconnectPeriod: 2000, connectTimeout: 3000 });
      this.client.on('connect', () => {
        this.available = true;
        this.logger.log(`[MqttAdapter] 已连接 ${this.brokerUrl}`);
        this.topics.forEach((t) => this.client?.subscribe(t));
      });
      this.client.on('message', (topic, payload) => {
        try {
          this.cache.set(topic, JSON.parse(payload.toString()));
        } catch {
          this.cache.set(topic, payload.toString());
        }
      });
      this.client.on('error', (e) => {
        this.available = false;
        this.logger.warn(`[MqttAdapter] 连接错误，回退 mock: ${e.message}`);
      });
    } catch (e) {
      this.available = false;
      this.logger.warn(`[MqttAdapter] 初始化失败，回退 mock: ${errMsg(e)}`);
    }
  }

  async read(collection: string): Promise<any[] | null> {
    const hits = Array.from(this.cache.entries())
      .filter(([t]) => t.includes(collection))
      .map(([, v]) => v);
    return hits.length ? hits : null;
  }

  async send(target: string, payload: any): Promise<any | null> {
    if (!this.client || !this.available) return null;
    const topic = `control/${target}`;
    this.client.publish(topic, JSON.stringify(payload));
    return { published: topic };
  }

  subscribe(topics: string[]): void {
    topics.forEach((t) => this.topics.add(t));
    this.topics.forEach((t) => this.client?.subscribe(t));
  }

  close(): void {
    this.client?.end(true);
    this.client = null;
    this.available = false;
  }
}

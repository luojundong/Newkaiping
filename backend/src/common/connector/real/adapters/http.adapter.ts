// HTTP 适配器：以 axios 拉取 BMS / 第三方 REST 数据源（任务4 必做可用项）。
// 连接配置来自 env HTTP_BASE_URL；未配置则不可用，由 RealConnector 回退 Mock。

import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AdapterName, errMsg, SourceAdapter } from './types';

export class HttpAdapter implements SourceAdapter {
  readonly name: AdapterName = 'http';
  private client: AxiosInstance | null = null;
  private available = false;

  constructor(private readonly baseUrl: string | undefined, private readonly logger: Logger) {
    this.available = !!baseUrl;
  }

  isAvailable(): boolean {
    return this.available;
  }

  isConfigured(): boolean {
    return !!this.baseUrl;
  }

  async connect(): Promise<void> {
    if (!this.baseUrl) {
      this.logger.warn('[HttpAdapter] 未配置 HTTP_BASE_URL，将回退至 Mock 数据源');
      this.available = false;
      return;
    }
    this.client = axios.create({ baseURL: this.baseUrl, timeout: 3000 });
    this.available = true;
    this.logger.log(`[HttpAdapter] 已就绪 baseURL=${this.baseUrl}`);
  }

  async read(collection: string, query?: Record<string, any>): Promise<any[] | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.get(`/${collection}`, { params: query || {} });
      const data = res.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.data)) return data.data;
      if (data && Array.isArray(data.items)) return data.items;
      return null;
    } catch (err) {
      this.logger.warn(`[HttpAdapter] 读取 ${collection} 失败，回退 mock: ${errMsg(err)}`);
      return null;
    }
  }

  async send(target: string, payload: any): Promise<any | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.post(`/${target}/control`, payload);
      return res.data;
    } catch (err) {
      this.logger.warn(`[HttpAdapter] 下发 ${target} 失败，回退 mock: ${errMsg(err)}`);
      return null;
    }
  }

  subscribe(): void {
    // HTTP 为请求-响应模型，实时性由调用方按需 read 实现；无长连接订阅
  }

  close(): void {
    this.client = null;
    this.available = false;
  }
}

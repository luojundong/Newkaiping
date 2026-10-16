// 真实数据源适配器公共契约（任务4 / ADR-003）。
// 每种协议（HTTP / MQTT / Modbus）实现一个 SourceAdapter；RealConnector 按集合路由，
// 任意适配器不可达时返回 null，由 RealConnector 优雅回退 MockConnector。

export type AdapterName = 'http' | 'mqtt' | 'modbus';

export interface SourceAdapter {
  readonly name: AdapterName;
  // 是否已配置（对应 env 是否已提供）；未配置则不可用，由 RealConnector 回退 Mock
  isConfigured(): boolean;
  // 是否已配置且连接可用（不可用则 RealConnector 跳过该适配器）
  isAvailable(): boolean;
  // 建立连接（尽力而为，失败不得抛出阻断启动）
  connect(): Promise<void>;
  // 读取集合：返回 null 表示该适配器不负责此集合或暂无数据（调用方应回退）
  read(collection: string, query?: Record<string, any>): Promise<any[] | null>;
  // 控制指令下发：返回 null 表示不负责（可选）
  send?(target: string, payload: any): Promise<any | null>;
  // 实时订阅（可选）
  subscribe?(topics: string[]): void;
  // 释放资源
  close(): void;
}

// 统一错误描述，避免直接 toString 泄露对象结构
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

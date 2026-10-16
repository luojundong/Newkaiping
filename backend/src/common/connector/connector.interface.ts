// 数据源抽象（ADR-003）：统一 Connector 接口。
// 所有 controller / service 必须经由 Connector（或其包裹的 Repository）访问数据，
// controller 内禁止硬编码数据。切换真实数据源只需实现本接口并由 ConnectorFactory 选择，
// 前端零改动（AC-03）。

import {
  Alarm,
  AlarmRule,
  AlarmRuleConfig,
  AuditLog,
  AuditReview,
  AuditSetting,
  BillingLedgerEntry,
  BillingPrice,
  BillingQuota,
  Building,
  ControlAck,
  ControlCommand,
  Device,
  DevicePoint,
  Metric,
  RoleRecord,
  SceneConfig,
  SceneMarker,
  Subsystem,
  UserRecord,
} from '../types';

// ---------------- 数据源探查（GK-26） ----------------
// 实际生效的数据源模式：由 ConnectorFactory 真正返回的实例决定，而非读取 env 字符串硬猜。
export type DataSourceMode = 'mock' | 'real';

// 单个真实适配器的可用性。
export interface AdapterAvailability {
  /** 配置是否就绪（对应 env 是否已提供，如 HTTP_BASE_URL / MQTT_BROKER_URL / MODBUS_HOST） */
  configured: boolean;
  /** 连接是否真正可用（connect() 成功且可读取） */
  available: boolean;
}

// 数据源探查结果：供 GET /scene/schema 的 dataSource 字段暴露给前端（单一真源，不复制常量）。
export interface DataSourceInfo {
  mode: DataSourceMode;
  adapters: {
    http: AdapterAvailability;
    mqtt: AdapterAvailability;
    modbus: AdapterAvailability;
  };
  /** 合成/派生集合名单（来自 synthetic-collections.ts 单一真源） */
  syntheticCollections: string[];
}

// 集合名（含合成派生集合）。Mock / Real 连接器均按同名集合实现，保证前端无感切换。
export type Collection =
  | 'buildings'
  | 'devices'
  | 'subsystems'
  | 'building_subsystem_config'
  | 'alarm_rules'
  | 'alarms'
  | 'scene_config'
  | 'device_points'
  | 'users'
  | 'roles'
  | 'billing_prices'
  | 'billing_quotas'
  | 'billing_ledger'
  | 'alarm_rule_configs'
  | 'features'
  | 'menus'
  | 'device_types'
  | 'device_brands'
  | 'control_groups'
  | 'work_orders'
  | 'device_metrics'
  | 'subsystem_status'
  | 'regulation_overview'
  | 'lifecycle_equipment'
  | 'lifecycle_maintenance'
  | 'energy_summary'
  | 'energy_trend'
  | 'scene_points'
  | 'scene_markers'
  | 'audit_logs'
  | 'audit_reviews'
  | 'audit_settings'
  | 'live_batch';

export interface Query {
  [key: string]: any;
}

export const CONNECTOR_TOKEN = 'CONNECTOR_TOKEN';

export interface Connector {
  // 建立连接（Mock 为内存就绪；Real 为连接 MQTT/Modbus/HTTP）
  connect(): Promise<void>;

  // 通用读取（含合成派生集合）
  read<T = any>(collection: Collection, query?: Query): Promise<T[]>;
  findOne<T = any>(collection: Collection, query?: Query): Promise<T | null>;

  // 写路径（用于配置持久化、告警处置、规则维护）
  create(collection: Collection, record: any): Promise<any>;
  update(collection: Collection, query: Query, patch: any): Promise<any>;
  remove(collection: Collection, query: Query): Promise<void>;

  // 控制指令下发（返回受理回执）
  send(target: string, payload: ControlCommand): Promise<ControlAck>;

  // 实时订阅（Mock 为本地定时器；Real 为 MQTT topic 订阅）
  subscribe(topics: string[]): void;

  // 原始记录归一化为统一 Metric 模型
  normalize(raw: any): Metric;

  // 数据源探查（GK-26）：返回实际生效模式、各真实适配器可用性、合成集合名单。
  // 由 ConnectorFactory 真正返回的实例实现（Mock → mode:'mock'，Real → mode:'real'）。
  getDataSourceInfo(): DataSourceInfo;
}

// 内存集合数据类型（用于类型提示）
export interface ConnectorCollections {
  buildings: Building;
  devices: Device;
  subsystems: Subsystem;
  building_subsystem_config: any;
  alarm_rules: AlarmRule;
  alarms: Alarm;
  scene_config: SceneConfig;
  device_points: DevicePoint;
  users: UserRecord;
  roles: RoleRecord;
  billing_prices: BillingPrice;
  billing_quotas: BillingQuota;
  billing_ledger: BillingLedgerEntry;
  alarm_rule_configs: AlarmRuleConfig;
  scene_markers: SceneMarker;
  audit_logs: AuditLog;
  audit_reviews: AuditReview;
  audit_settings: AuditSetting;
}

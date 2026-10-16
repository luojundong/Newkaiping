// 领域模型类型定义（与 openapi.yaml / ARCHITECTURE.md 第 7 节对齐）
// 说明：MVP 阶段后端运行于 MockConnector 内存数据，不连接真实 Postgres；
// 这些类型同时作为未来接入 TypeORM 实体时的字段契约参考。

export type SubsystemCode =
  | 'regulation'
  | 'lifecycle'
  | 'hvac'
  | 'lighting'
  | 'power'
  | 'hotwater'
  | 'elevator';

export type DeviceStatus = 'running' | 'stopped' | 'fault' | 'offline' | 'maintenance';

export type AlarmLevel = 'info' | 'warning' | 'critical';
export type AlarmStatus = 'active' | 'acknowledged' | 'cleared' | 'suppressed';
export type MetricQuality = 'good' | 'bad' | 'uncertain';
export type MetricSource = 'mock' | 'real';

export interface Building {
  id: string;
  code: string;
  name: string;
  floors: number;
  gross_area: number;
  local_origin: { x: number; y: number; z: number };
  status: 'active' | 'inactive';
}

export interface Subsystem {
  id: string;
  code: SubsystemCode;
  name: string;
  icon: string;
  sort_order: number;
}

export interface BuildingSubsystemConfig {
  id: string;
  building_id: string;
  subsystem_code: SubsystemCode;
  enabled: boolean;
  config_json: Record<string, any> | null;
  sort_order: number;
}

export interface Device {
  id: string;
  building_id: string;
  subsystem_id: string;
  category_id: string;
  code: string;
  name: string;
  model: string;
  manufacturer: string;
  install_date: string;
  location: { x: number; y: number; z: number; floor: number; room: string };
  specs: Record<string, any>;
  status: DeviceStatus;
  protocol?: string;
  controller_type?: string;
}

export interface Metric {
  device_id: string;
  metric_key: string;
  value: number;
  unit: string;
  time: string;
  quality: MetricQuality;
  source: MetricSource;
}

export interface DevicePoint {
  id: string;
  device_id: string | null;
  building_id: string;
  position: { x: number; y: number; z: number };
  marker_type: string;
  label: string;
  level_of_detail: 'building' | 'subsystem' | 'equipment';
  visible: boolean;
  subsystem_code?: SubsystemCode;
}

// 3D 标记（后台 DIY 点位）：独立集合 scene_markers，支持每栋楼不同楼层、绑定设备、显隐。
// y 由楼层推算：building 锚点地面 + (floor-1) * FLOOR_HEIGHT(4.2)；落点编辑器写入时由后端在 create 时统一计算，
// 但 position.y 仍落库（避免渲染端重复推算、保证与锚点一致）。
export interface SceneMarker {
  id: string;
  building_id: string;
  floor: number;
  position: { x: number; y: number; z: number };
  marker_type: string;
  label: string;
  device_id: string | null;
  visible: boolean;
  color: string;
  // ---- 区域热点（多边形描边）扩展 ----
  shape?: 'point' | 'area'; // 默认 'point'，兼容旧数据
  area_points?: { x: number; y: number; z: number }[]; // 多边形顶点（模型表面坐标）
  link?: {
    type: 'url' | 'internal';
    url?: string; // type=url：外部链接
    target?: string; // type=internal：楼栋 id 或子系统 code
  } | null;
  params?: Record<string, string>; // 自定义键值对参数，点击区域时回传
}

export interface Alarm {
  id: string;
  device_id: string | null;
  building_id: string | null;
  subsystem_id: string | null;
  rule_id?: string | null;
  level: AlarmLevel;
  title: string;
  message: string;
  metric_snapshot?: Record<string, any> | null;
  status: AlarmStatus;
  first_at: string;
  last_at: string;
  acked_by?: string | null;
  acked_at?: string | null;
  cleared_at?: string | null;
}

export interface AlarmRule {
  id: string;
  subsystem: string;
  metric_key: string;
  operator: '>' | '>=' | '<' | '<=' | '==';
  threshold: number;
  level: AlarmLevel;
  enabled: boolean;
  description?: string;
}

// 楼栋每层自定义标签（Phase 1 楼层标签 + 数据联动）
export interface FloorLabel {
  index: number;           // 楼层序号，1 = 1F
  label: string;           // 自定义标签，如 "门诊大厅" / "住院病区"
  bound_fields?: string[]; // 绑定数据字段 key（来自 metrics/runtime，如 "power.kwh"）
  color?: string;          // 该层高亮色（常态；联动告警时覆盖为告警红）
  threshold?: number;      // 指标越阈阈值（与 bound_fields[0] 同单位）；超过则标签变红告警
  opacity?: number;        // 该层楼栋体块透明度覆盖 0~1
  visible?: boolean;       // 默认 true
}

// 楼栋显示 DIY 配置（替代立柱，用框框区域展示；可设背景透明度/边框/尺寸比例）
export interface BuildingDisplay {
  // 全局显示形态：box=立体方框（半透明体块），plane=贴地平面框（半透明地面区域）
  mode: 'box' | 'plane';
  // 兼容字段：全局默认透明度 0~1（旧数据；新逻辑按形态取 box_opacity / plane_opacity）
  background_opacity: number;
  // box 形态的全局默认透明度（各楼未单独覆盖时使用）
  box_opacity: number;
  // plane 形态的全局默认透明度（各楼未单独覆盖时使用）
  plane_opacity: number;
  // 是否显示边框描边
  show_border: boolean;
  // 边框颜色（hex）
  border_color: string;
  // 填充颜色（hex）
  fill_color: string;
  // 尺寸缩放比例（基于真实楼栋数据推导的体块再乘该系数，默认 1）
  size_scale: number;
  // 是否显示楼栋名称标签
  show_labels: boolean;
  // 按楼栋独立覆盖：key=building_id，value 为覆盖项（当前支持透明度）
  per_building?: Record<string, { background_opacity?: number }>;
  // 按楼栋的每层自定义标签：key=building_id，value 为该楼从低到高的楼层标签数组
  floors_by_building?: Record<string, FloorLabel[]>;
}

export interface SceneConfig {
  model_url: string;
  // 场景模型类型：3d(.glb/.gltf) / video(.mp4/.webm) / image(图片) / panorama(360 全景图)
  model_type?: '3d' | 'video' | 'image' | 'panorama';
  building_anchors: Array<Record<string, any>>;
  camera_presets: Array<Record<string, any>>;
  environment: Record<string, any>;
  // 院区真实地理原点（GIS 定位，任务：开平市中心医院本部）
  geo_origin?: {
    latitude: number;
    longitude: number;
    address: string;
    source: string;
  };
  // 子系统显示名覆盖（前端可自定义子系统展示名称，key=subsystem code）
  subsystem_labels?: Record<string, string>;
  // 左侧管理菜单自定义排序（route path 数组）
  menu_order?: string[];
  // 3D 标注显隐开关（后台可定义立柱/彩球开关）
  marker_switch?: {
    show_building_markers: boolean;
    show_device_points: boolean;
  };
  // 楼栋显示 DIY 配置（替代立柱：框框区域 + 背景透明度 + 边框）
  building_display?: BuildingDisplay;
  // 子系统菜单元信息（后台可自定义名称 + 开关）：key=subsystem code
  subsystem_meta?: Record<string, { label?: string; visible?: boolean }>;
  // 大屏模型加载提示文案（可自定义，渲染在 3D 模型加载遮罩上）
  model_loading_hint?: string;
}

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  nickname: string;
  role: string;
  status: 'active' | 'disabled';
  last_login: string | null;
  permissions: string[];
  phone?: string;
  email?: string;
}

export interface RoleRecord {
  id: string;
  code: string;
  name: string;
  permissions: string[];
  description?: string;
  status: 'active' | 'disabled';
}

export interface BillingPrice {
  id: string;
  name: string;
  type: 'peak' | 'flat' | 'valley';
  price: number;
  start: string; // '00:00'
  end: string; // '24:00'
  unit: string; // '元/kWh'
}

export interface BillingQuota {
  id: string;
  scope: 'building' | 'device';
  ref_id: string;
  period: 'month';
  quota_kwh: number;
  warning_pct: number;
}

export interface BillingLedgerEntry {
  id: string;
  scope: 'building' | 'device';
  ref_id: string;
  type: 'recharge' | 'consume';
  amount: number;
  balance_after: number;
  remark?: string;
  ts: string;
}

// 告警异常配置（阶段四新模型，区别于旧 alarm_rules）
export interface AlarmRuleConfig {
  id: string;
  event_code: string;
  event_name: string;
  description?: string;
  subsystem: string;
  device_category?: string;
  notify_enabled: boolean;
  alarm_enabled: boolean;
  level: AlarmLevel;
  threshold: number;
  recovery_threshold: number;
  unit?: string;
  comparator: '>' | '<' | '>=' | '<=';
}

export interface ControlCommand {
  action:
    | 'power_on'
    | 'power_off'
    | 'set_temperature'
    | 'set_mode'
    | 'set_strategy'
    | 'dimming'
    | 'reboot'
    | 'remote';
  payload: Record<string, any>;
  device_id?: string;
  building_id?: string;
  subsystem?: string;
}

export interface ControlAck {
  device_id: string | null;
  accepted: boolean;
  message: string;
  echo?: Record<string, any>;
}

// ===================== 监控运维 / 设备主数据 类型（阶段五） =====================

// 设备类型
export interface DeviceType {
  id: string;
  seq: number;
  name: string;
  description?: string;
  brand_ids?: string[];
}

// 设备品牌
export interface DeviceBrand {
  id: string;
  seq: number;
  name: string;
  description?: string;
}

// 控制群组（群组控制）
export interface ControlGroup {
  id: string;
  name: string;
  description?: string;
  building_ids: string[];
  device_ids: string[];
}

// 工单状态
export type WorkOrderStatus =
  | 'pending'
  | 'processing'
  | 'feedback'
  | 'unfinished'
  | 'completed'
  | 'closed';

// 工单优先级
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';

// 工单
export interface WorkOrder {
  id: string;
  code: string;
  title: string;
  description?: string;
  assignee?: string;
  building_id?: string;
  building_name?: string;
  product_type?: string;
  device_id?: string;
  device_name?: string;
  priority?: WorkOrderPriority;
  status: WorkOrderStatus;
  created_at: string;
  updated_at: string;
}

// 工单统计
export interface WorkOrderStats {
  total: number;
  processing: number;
  feedback: number;
  unfinished: number;
  completed: number;
  closed: number;
}

// 子系统显示名覆盖
export type SubsystemLabelMap = Record<string, string>;

// 审计日志（审查追踪 / 操作日志）
// 合规增强：before/after 记录数据前后值，reason 记录变更理由(Why)，
// prev_hash/hash 组成哈希链用于防篡改校验（见 logs.service.ts）。
export interface AuditLog {
  id: string;
  user_id?: string;
  username: string;
  module: string; // auth / users / roles / devices / buildings / billing / scene / work-orders / control-groups / system / audit / power / hotwater / elevator / regulation / lifecycle
  action: string; // create / update / delete / control / login / logout / config / switch / anchors / upload / export / review ...
  target: string; // 操作对象描述（如 用户: operator1 / 设备: dev-1-xxx）
  detail?: string;
  result: 'success' | 'fail';
  ip?: string;
  created_at: string;
  // ---- 审查追踪增强字段 ----
  before?: Record<string, any> | null; // 修改前原值
  after?: Record<string, any> | null; // 修改后新值
  reason?: string; // 变更理由(Why)：关键数据修改建议必填
  prev_hash?: string; // 哈希链：上一条记录哈希
  hash?: string; // 本条记录哈希（防篡改）
  // ---- GK-26 审计来源标记 ----
  // 区分「人改的」与「自动化脚本/对接系统改的」：'human'(人工，缺省) | 'automation'(自动化)。
  // 历史记录（本功能上线前）均无此字段，读取端一律按 'human' 处理，语义不变。
  // 注意：为保持既有哈希链完整（历史 ~1112 条记录不含此字段），source 不参与哈希计算。
  source?: 'human' | 'automation';
}

// 审计追踪周期性复核记录（GMP/等保：定期复核审计链）。
// 复核动作本身也会写入 audit_logs（module=audit, action=review，纳入哈希链），确保复核记录不可篡改。
export interface AuditReview {
  id: string;
  reviewer: string; // 复核人账号
  reviewer_id?: string;
  reviewed_at: string; // 服务器可信时间戳（ISO）
  from: string; // 复核区间起点（ISO，上次复核时间或链起始）
  to: string; // 复核区间终点（ISO，本次复核时刻）
  record_count: number; // 区间内审计记录条数
  note?: string; // 复核说明/结论
}

// 审计追踪设置（后台可配置项；当前主要用于周期性复核间隔天数）
export interface AuditSetting {
  id: string; // 主键：如 'review-interval'
  key: string;
  reviewIntervalDays: number;
  updated_at: string;
  updated_by?: string;
}

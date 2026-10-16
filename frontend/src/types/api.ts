import { KP_ACCENT } from '@/lib/kp-accent'

// 前后端共享 API 类型契约（依据 docs/phase1/openapi.yaml 生成）
// 统一响应包络：{ code, data, message }

export interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
}

export type SubsystemCode =
  | 'regulation'
  | 'lifecycle'
  | 'hvac'
  | 'lighting'
  | 'power'
  | 'hotwater'
  | 'elevator'

export interface Building {
  id: string
  code: string
  name: string
  floors: number
  gross_area: number
  local_origin?: { x: number; y: number; z: number }
  status: 'active' | 'inactive'
}

export interface Subsystem {
  id: string
  code: SubsystemCode
  name: string
  icon: string // lucide 图标名
  sort_order: number
}

export interface BuildingSubsystem {
  subsystem_code: SubsystemCode
  name: string
  enabled: boolean
  config: Record<string, unknown> | null
  sort_order: number
}

export interface BuildingSubsystemPutItem {
  subsystem_code: SubsystemCode
  enabled: boolean
  config_json?: Record<string, unknown>
}

export type DeviceStatus = 'running' | 'stopped' | 'fault' | 'offline' | 'maintenance'

export interface Device {
  id: string
  building_id: string
  subsystem_id: string
  category_id: string
  code: string
  name: string
  model: string
  manufacturer: string
  install_date: string
  location: { x: number; y: number; z: number; floor: number; room: string }
  status: DeviceStatus
}

export interface Metric {
  device_id: string
  metric_key: string
  value: number
  unit: string
  time: string
  quality: 'good' | 'bad' | 'uncertain'
  source: 'mock' | 'real'
}

export interface DevicePoint {
  id: string
  device_id: string
  building_id: string
  position: { x: number; y: number; z: number }
  marker_type: string
  label: string
  level_of_detail: 'building' | 'subsystem' | 'equipment'
  visible: boolean
}

// 3D 标记（后台 DIY 点位）
export interface SceneMarkerLink {
  type: 'url' | 'internal'
  url?: string // type=url：外部链接
  target?: string // type=internal：楼栋 id 或子系统 code
}
export interface SceneMarker {
  id: string
  building_id: string
  building?: string // 楼栋名称（冗余字段，便于直接回显）
  floor: number
  position: { x: number; y: number; z: number }
  marker_type: string
  label: string
  device_id: string | null
  visible: boolean
  color: string
  // ---- 区域热点（多边形描边）扩展 ----
  shape?: 'point' | 'area' // 默认 'point'，兼容旧数据
  area_points?: { x: number; y: number; z: number }[] // 多边形顶点（模型表面坐标）
  link?: SceneMarkerLink | null
  params?: Record<string, string> // 自定义键值对参数，点击区域时回传
}

// 标注显隐开关
export interface MarkerSwitch {
  show_building_markers: boolean
  show_device_points: boolean
}

// 楼栋显示 DIY（替代立柱：框框区域 + 背景透明度 + 边框）
export interface BuildingDisplay {
  mode: 'box' | 'plane'
  background_opacity: number
  // box 形态的全局默认透明度（各楼未单独覆盖时使用）
  box_opacity: number
  // plane 形态的全局默认透明度（各楼未单独覆盖时使用）
  plane_opacity: number
  show_border: boolean
  border_color: string
  fill_color: string
  size_scale: number
  show_labels: boolean
  // 按楼栋独立覆盖：key=building_id
  per_building?: Record<string, { background_opacity?: number }>
  // 按楼栋的每层自定义标签：key=building_id
  floors_by_building?: Record<string, FloorLabel[]>
}

// 楼栋每层自定义标签（Phase 1 楼层标签 + 数据联动）
export interface FloorLabel {
  index: number
  label: string
  bound_fields?: string[]
  color?: string
  threshold?: number
  opacity?: number
  visible?: boolean
}

export const DEFAULT_BUILDING_DISPLAY: BuildingDisplay = {
  mode: 'box',
  background_opacity: 0.35,
  box_opacity: 0.35,
  plane_opacity: 0.35,
  show_border: true,
  border_color: KP_ACCENT,
  fill_color: '#0d3346',
  size_scale: 1,
  show_labels: true,
  per_building: {},
  // 楼层标签（楼栋 6 后勤楼按 HQL_textured.glb 真实三层建模：1F/2F/3F）
  floors_by_building: {
    '6': [
      { index: 1, label: '后勤一层', color: '#bfefff' },
      { index: 2, label: '后勤二层', color: '#bfefff' },
      { index: 3, label: '后勤三层', color: '#bfefff' },
    ],
  },
}

export interface SceneConfig {
  model_url: string
  // 场景模型类型：3d(.glb/.gltf) / video(.mp4/.webm) / image(图片) / panorama(360 全景图)
  model_type?: '3d' | 'video' | 'image' | 'panorama'
  building_anchors: BuildingAnchor[]
  camera_presets: CameraPreset[]
  environment?: Record<string, unknown>
  geo_origin?: {
    latitude: number
    longitude: number
    address: string
    source: string
  }
  subsystem_labels?: Record<string, string>
  // 子系统菜单元信息（后台可自定义名称 + 开关）：key=subsystem code
  subsystem_meta?: Record<string, SubsystemMetaItem>
  menu_order?: string[]
  marker_switch?: MarkerSwitch
  building_display?: BuildingDisplay
  // 大屏模型加载提示文案（可自定义，渲染在 3D 模型加载遮罩上）
  model_loading_hint?: string
}

// 子系统菜单自定义：label=自定义名称（留空用默认），visible=false 则大屏隐藏该子系统 tab
export interface SubsystemMetaItem {
  label?: string
  visible?: boolean
}

// 站点全局配置（浏览器 tab 标题 + meta description/keywords + 后台页头）
export interface SiteConfig {
  title: string
  description: string
  keywords: string
  showChinese?: boolean // 大屏面板/页眉中文标题显隐（默认 true）
  showEnglish?: boolean // 大屏面板/页眉英文标题显隐（默认 true）
}

// 地图底图配置（Phase 2：合规底图 Key 由后端代理，前端不暴露原始 key）
export type GisProvider = 'tianditu' | 'tencent' | 'gaode' | 'baidu'
export type GisBaseLayer = 'vec' | 'img' | 'ter'
export interface GisConfig {
  provider: GisProvider | ''
  tiandituKey: string
  tencentKey: string
  gaodeKey: string
  baiduKey: string
  baseLayer: GisBaseLayer
  showLabel: boolean
  center: { lng: number; lat: number; zoom: number }
}
export const DEFAULT_GIS_CONFIG: GisConfig = {
  provider: '',
  tiandituKey: '',
  tencentKey: '',
  gaodeKey: '',
  baiduKey: '',
  baseLayer: 'vec',
  showLabel: true,
  center: { lng: 112.698, lat: 22.368, zoom: 16 },
}

export interface BuildingAnchor {
  building_id: string
  building_code: string
  position: { x: number; y: number; z: number }
}

export interface CameraPreset {
  key: string
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

export type AlarmLevel = 'info' | 'warning' | 'critical'
export type AlarmStatus = 'active' | 'acknowledged' | 'cleared' | 'suppressed'

export interface Alarm {
  id: string
  device_id: string
  building_id: string
  subsystem_id: string
  level: AlarmLevel
  title: string
  message: string
  status: AlarmStatus
  first_at: string
  last_at: string
}

export interface EnergySummary {
  building_id: string
  subsystem: string
  period: 'hour' | 'day' | 'month' | 'year'
  kwh: number
  cost: number
  carbon_kg: number
  peak_kw: number
}

export interface EnergyTrendPoint {
  time: string
  kwh: number
}

export interface ControlCommand {
  action: 'power_on' | 'power_off' | 'set_temperature' | 'set_mode' | 'set_strategy' | 'dimming' | 'reboot' | 'remote'
  payload: Record<string, unknown>
  building_id?: string
  device_id?: string
  reason?: string
}

export interface ControlAck {
  device_id: string
  accepted: boolean
  message: string
}

export interface MenuNode {
  id: string
  parent_id: string | null
  name: string
  path: string
  icon: string
  subsystem_code: string
}

export interface AuthUser {
  id: string
  username: string
  role: string
  permissions: string[]
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// ===================== 阶段四扩展：管理后台 CRUD 类型 =====================

// 设备连接（需求5：MQTT/Modbus/HTTP 可换）
export type DeviceConnectionType = 'MQTT' | 'Modbus' | 'HTTP'
export interface DeviceConnection {
  type: DeviceConnectionType
  endpoint: string
  gateway?: string
}

// 设备新增/编辑提交体（与 EXPANSION §2 对齐）
export interface DeviceCreateBody {
  code: string
  name: string
  model: string
  manufacturer: string
  category: string
  building_id: string
  location: { floor: number | string; room: string }
  status: DeviceStatus
  connection: DeviceConnection
  subsystem: string
}

// 设备性质 / 类型本地可选项（需求5）
export const DEVICE_CATEGORIES = [
  '空调',
  '照明',
  '配电',
  '热水',
  '电梯',
  'UPS',
  '其他',
] as const
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number]

// 连接类型可选项
export const CONNECTION_TYPES: DeviceConnectionType[] = ['MQTT', 'Modbus', 'HTTP']

// 设备类型编码 → 中文名（与后端 catalog.CATEGORY_DEFS.name 一致）
export const CATEGORY_LABELS: Record<string, string> = {
  screw_chiller: '螺杆式制冷机组',
  water_pump: '冷冻/冷却水泵',
  cooling_tower: '冷却塔',
  vrf_outdoor: '多联机室外机',
  split_ac: '分体式空调',
  heat_pump_water: '空气能热泵热水机组',
  air_cooled_module: '风冷模块机组',
  lighting_loop: '照明回路',
}

// 指标键 → 中文名（与后端 catalog.default_metrics 对应）
export const METRIC_LABELS: Record<string, string> = {
  cooling_load_kw: '冷负荷',
  cop: '能效比COP',
  supply_temp_c: '供水温度',
  return_temp_c: '回水温度',
  flow_m3h: '水流量',
  power_kw: '功率',
  freq_hz: '频率',
  fan_power_kw: '风机功率',
  outlet_temp_c: '出水温度',
  water_temp_c: '水温',
  cooling_capacity_kw: '制冷量',
  suction_temp_c: '吸气温度',
  room_temp_c: '室内温度',
  set_temp_c: '设定温度',
  tank_temp_c: '水箱温度',
  compressor_power_kw: '压缩机功率',
}

// 用户 / 角色
export type UserRole = 'admin' | 'operator' | 'duty' | 'viewer'

export interface User {
  id: string
  username: string
  name?: string
  role: UserRole
  permissions: string[]
  phone?: string
  email?: string
  status?: 'active' | 'inactive' | 'disabled'
}

export interface Role {
  id: string
  code: string
  name: string
  permissions: string[]
  description?: string
}

// 权限点（角色分配 + 后台菜单/页面按权限过滤）
// 命名约定：<资源>:<动作>，如 device:control、audit:trail
export const PERMISSION_OPTIONS = [
  // 业务核心
  { value: 'device:control', label: '设备控制（含子系统远程遥控）' },
  { value: 'device:edit', label: '设备编辑（增改删/导入）' },
  { value: 'user:manage', label: '用户管理' },
  { value: 'building:config', label: '楼栋子系统配置' },
  { value: 'building:manage', label: '楼栋管理' },
  { value: 'alarm:manage', label: '告警管理' },
  { value: 'alarm:config', label: '告警规则配置' },
  { value: 'billing:manage', label: '计费管理' },
  { value: 'energy:report', label: '能耗报表' },
  { value: 'report:export', label: '报表导出' },
  // 大屏与场景
  { value: 'bigscreen:style', label: '大屏样式配置' },
  { value: 'bigscreen:layout', label: '大屏布局 DIY' },
  { value: 'scene:upload', label: '场景模型上传' },
  { value: 'scene:marker', label: '标记管理' },
  { value: 'scene:display', label: '楼栋显示 DIY' },
  { value: 'scene:menu', label: '子系统菜单（名称/开关）' },
  { value: 'site:config', label: '站点配置（标题/关键字）' },
  // 监控与历史
  { value: 'monitoring:view', label: '监控运维' },
  { value: 'history:view', label: '历史数据' },
  // 合规审计
  { value: 'audit:trail', label: '审查追踪（查询/导出/打印）' },
  { value: 'audit:review', label: '执行复核（GMP 周期性复核）' },
  { value: 'audit:config', label: '审计配置（复核间隔/合规设置）' },
] as const
export type PermissionValue = (typeof PERMISSION_OPTIONS)[number]['value']

// 角色可选项（用户表单用）
export const USER_ROLES: UserRole[] = ['admin', 'operator', 'duty', 'viewer']

// 计费管理
export type BillingPriceType = 'peak' | 'flat' | 'valley'
export const BILLING_PRICE_TYPES: { value: BillingPriceType; label: string }[] = [
  { value: 'peak', label: '峰时' },
  { value: 'flat', label: '平段' },
  { value: 'valley', label: '谷时' },
]

export interface BillingPrice {
  id: string
  name: string
  type: BillingPriceType
  price: number
  start: string
  end: string
  unit: string
}

export type BillingQuotaScope = 'building' | 'device'
export const BILLING_QUOTA_SCOPES: { value: BillingQuotaScope; label: string }[] = [
  { value: 'building', label: '楼栋' },
  { value: 'device', label: '设备' },
]

export interface BillingQuota {
  id: string
  scope: BillingQuotaScope
  ref_id: string
  period: 'month'
  quota_kwh: number
  warning_pct: number
}

export interface BillingAccount {
  id: string
  scope: string
  ref_id: string
  balance?: number
  [key: string]: unknown
}

export interface BillingRecharge {
  scope: string
  ref_id: string
  amount: number
  remark?: string
}

// 历史数据（需求7）
export interface HistoryItem {
  ts: string
  device_id: string
  device_name: string
  building_id: string
  key: string
  value: number
  unit: string
}

// 告警规则（需求8，EXPANSION §7）
export type AlarmRuleLevel = 'info' | 'warning' | 'critical'
export type AlarmRuleComparator = '>' | '<' | '>=' | '<='

export const ALARM_RULE_LEVELS: { value: AlarmRuleLevel; label: string }[] = [
  { value: 'info', label: '提示' },
  { value: 'warning', label: '预警' },
  { value: 'critical', label: '严重' },
]
export const ALARM_RULE_COMPARATORS: AlarmRuleComparator[] = ['>', '<', '>=', '<=']

export interface AlarmRuleFull {
  id: string
  event_code: string
  event_name: string
  description?: string
  subsystem: string
  device_category?: string
  notify_enabled: boolean
  alarm_enabled: boolean
  level: AlarmRuleLevel
  threshold: number
  recovery_threshold: number
  unit?: string
  comparator: AlarmRuleComparator
}

// ===================== 大屏样式 DIY 配置（后台可定制，按系统维度） =====================

// 顶部 header 布局：模块可自由分配到指定行 + 行内左右位置；支持 1/2/3 行；时间可单行/换行
export type HeaderSlot = 'left' | 'center' | 'right'
export type HeaderModuleKey = 'platform' | 'clock' | 'tabs' | 'tools'

export interface HeaderModulePos {
  row: 1 | 2 | 3 // 所在行（从 1 起）
  slot: HeaderSlot // 行内水平停靠位
}

export interface BigscreenHeaderLayout {
  rows: 1 | 2 | 3 // 顶部布局行数
  platform: HeaderModulePos // 系统平台名称
  clock: HeaderModulePos // 实时时钟
  tabs: HeaderModulePos // 子系统菜单
  tools: HeaderModulePos // 工具组（主题/消防/用户）
  clockSingleLine: boolean // 时间单行显示（时分秒与年月日星期一行）；false=换行（上下两行）
}

// 视觉令牌级样式（token-level）：颜色 / 透明度 / 各区域尺寸 / 圆角 / 标题
export interface BigscreenStyle {
  accent: string // 主题强调色（边框/辉光/焦点环）
  bg: string // 背景底色
  panelAlpha: number // 面板背景透明度 0-1
  headerHeight: number // 顶部高度 px
  leftWidth: number // 左栏宽度 px
  rightWidth: number // 右栏宽度 px
  bottomHeight: number // 底部高度 px
  radius: number // 圆角 px
  header: BigscreenHeaderLayout // 顶部三槽位布局（后台 DIY）
}

export interface BigscreenConfigEntry {
  title: string // 大屏标题名（后台自定义）
  titleEn?: string // 大屏英文副标题（后台自定义，显示在中文标题下方）
  titleFontSize: number // 标题字号 px（后台自定义）
  style: BigscreenStyle
}

// 已保存配置映射（部分字段可能缺省，前端需与默认值合并）
export type BigscreenConfigMap = Record<string, Partial<BigscreenConfigEntry>>

// ===================== 大屏布局（17 框可视化拖拽 DIY） =====================

// 8 种样式框（纯 CSS 皮肤，跟随主题强调色变化）
export type FrameStyle =
  | 'tech' // 直角科技框
  | 'wave' // 波浪边角框
  | 'tree' // 树状分支框
  | 'rounded' // 圆角极简框
  | 'bevel' // 斜切角框
  | 'double' // 双线框
  | 'glow' // 发光描边框
  | 'grid' // 虚线网格框

// 单个数据框布局（坐标基于 1920x1080 设计空间）
export interface BigscreenBox {
  key: string
  x: number
  y: number
  w: number
  h: number
  frame: FrameStyle
  // ---- 后台 DIY 自定义（名称与显示样式） ----
  // 自定义框标题（空 = 使用默认 BOX_LABELS）
  title?: string
  // 英文副标题（空 = 不显示英文）
  titleEn?: string
  // 标题字号 px（空 = 默认）
  titleSize?: number
  // 标题颜色（hex，空 = 默认）
  titleColor?: string
  // 外框颜色（hex，空 = 默认）：整个框的外边缘
  borderColor?: string
  // 内边框颜色（hex，空 = 默认）：四角 L 形装饰等内侧边框
  innerBorderColor?: string
  // 内横线颜色（hex，空 = 默认）：标题下划线、列表分隔线等内部横向线
  innerLineColor?: string
  // 绑定子系统（空 = 不绑定）：绑定后默认标题跟随「子系统菜单」自定义名称
  subsystem?: string
  // 数据来源（data_source 框）：该框绑定的数据通道，如 realtime / energy / floor（仅作语义标记，前端按此区分展示）
  data_source?: string
  // 是否支持钻取：floor = 点击可下钻楼层；none/空 = 不可钻取
  drill?: 'floor' | 'none'
}

// 单系统布局配置（17 框）
export interface BigscreenLayoutEntry {
  boxes: Record<string, BigscreenBox>
}

// 已保存布局映射（部分框可能缺省，前端需与默认布局合并）
export type BigscreenLayoutMap = Record<string, Partial<BigscreenLayoutEntry>>

// ===================== Scene Schema（GK-01/03 物化文档；GK-06/GK-08 前端消费） =====================
// 冻结 schema 见 D:\NewPrSz\spec\scene-schema.v1.schema.json。前端只声明本阶段用到的子集，
// 其余段（sceneGraph/bindings/rules/scenarios 等）保持宽松，不透传强类型约束。

// GK-08：Scene Schema cameraPresets 段（120 项：preset_bldg_<楼栋原始id>_overview ×10 +
// preset_floor_<楼栋原始id>_<层号> ×110）。id/命名/pose 契约见 refactor-stories GK-08。
export interface SceneSchemaCameraPresetPose {
  // 相机世界坐标（楼栋原始 id 的局部/园区模型坐标空间）
  position: [number, number, number]
  // 注视点（OrbitControls.target）
  lookAt: [number, number, number]
  // 垂直视场角（度）
  fov: number
}
export interface SceneSchemaCameraPreset {
  id: string
  name?: string
  // orbit = 楼栋全景可环绕；fixed = 楼层近景（语义提示，前端不据此锁定交互）
  mode?: 'orbit' | 'fixed' | string
  pose: SceneSchemaCameraPresetPose
  transitionMs?: number
  [k: string]: unknown
}
export interface SceneSchemaHudWidget {
  id: string
  type: string
  // 权威坐标：rect = [x, y, w, h]（1920x1080 设计坐标系）
  rect: [number, number, number, number]
  title: string
  z?: number
  locked?: boolean
  // additionalProperties（冻结 schema 允许）：GK-06 用于绑定 8 种样式框皮肤 + 子系统
  frame?: string
  subsystem?: string
  // GK-27：面板开关（管理后台关闭后大屏不渲染，但配置保留可随时重新开启）
  enabled?: boolean
  [k: string]: unknown
}
export interface SceneSchemaHudCanvas {
  width: number
  height: number
  theme?: string
  safeArea?: number[]
  displays?: unknown[]
  [k: string]: unknown
}
export interface SceneSchemaHudLayout {
  canvas: SceneSchemaHudCanvas
  widgets: SceneSchemaHudWidget[]
}
// GK-07：Scene Schema scenarios 段（游戏引擎式场景管理）。
// 实测物化形状（backend buildScenarios）：overview 1 项 + sys_<code>_focus 7 项，
// 每项 tracks 为时间轴演出轨道，本阶段前端只消费 action='camera.apply' 的相机轨道。
export interface SceneSchemaScenarioTrack {
  // 轨道触发时刻（秒），当前物化恒为 0
  atSec?: number
  action: string
  // action='camera.apply' 时引用 cameraPresets 段的 preset id
  presetId?: string
  [k: string]: unknown
}
export interface SceneSchemaScenario {
  id: string
  name?: string
  tracks?: SceneSchemaScenarioTrack[]
  [k: string]: unknown
}
export interface SceneSchemaDocument {
  schemaVersion?: string
  meta?: Record<string, unknown>
  dataSources?: unknown[]
  pointTable?: unknown[]
  assets?: unknown[]
  sceneGraph?: unknown[]
  bindings?: unknown[]
  rules?: unknown[]
  hudLayout?: SceneSchemaHudLayout
  cameraPresets?: SceneSchemaCameraPreset[]
  scenarios?: SceneSchemaScenario[]
  [k: string]: unknown
}

// ===================== GK-30：楼层真实模型（additive 资产）类型 =====================
// 妇产儿科楼 1 层真实 FBX→GLB 模型接入 3D 场景。schema `assets` 段 additive 记录形状。
// 说明：后端 materialize() 每次 GET 都会从 sceneConfig 重建 assets，additive 记录不落 GET；
// 前端以本地 lib/floorModels.ts 配置为权威源（schema 驱动为前瞻兼容：若后端未来直接服务
// assets 中的 floor_model 记录则优先采用）。映射参数（position/rotationY/scale）来自实测
// GLB 包围盒，不可在渲染代码中写死魔法数字。

export interface FloorModelMapping {
  // 模型组在场景中的平移（场景世界坐标；模型本体已按包围盒中心归零）
  position: [number, number, number]
  // 绕 Y 轴旋转（弧度）。当前 0 = 保持 Revit 导出原生朝向
  rotationY: number
  // 统一缩放（模型米制 → 场景单位）。= 楼栋盒体 footprint 边长 / 模型最大水平跨度
  scale: number
}

export interface FloorModelAsset {
  id: string
  // 固定 'floor_model'，与 schema assets 段其它 kind 区分
  kind: 'floor_model'
  // 前端静态服务路径（public/models 下）
  url: string
  // 楼栋原始 DB id（'4' = 妇产儿科大楼）
  buildingId: string
  // 楼层号（1 = 1 层）
  floor: number
  mapping: FloorModelMapping
  // 三角面数（Blender 实测）
  triCount: number
  // GLB 字节数（实测）
  byteSize: number
}

// ===================== 监控运维 / 设备主数据 类型（阶段五） =====================

// 设备类型（需求：序号 / 名称 / 描述 / 关联品牌 / 操作）
export interface DeviceType {
  id: string
  seq: number
  name: string
  description?: string
  brand_ids?: string[]
}

// 设备品牌（需求：序号 / 品牌名称 / 描述 / 操作）
export interface DeviceBrand {
  id: string
  seq: number
  name: string
  description?: string
}

// 控制群组（群组控制）
export interface ControlGroup {
  id: string
  name: string
  description?: string
  building_ids: string[]
  device_ids: string[]
}

// ===================== GK-23：空调 / 照明深化增强类型 =====================
// 说明：以下类型用于空调集中控制调度系统与智慧照明管理系统的前端深化。
// 凡带「真实数据」标注的字段均来自后端 REST；标注「待接入」的字段后端当前无对应数据，
// 前端仅显示占位并明确标注，绝不编造数字（项目负责人硬性要求）。

// 空调运行参数（3.2 / 3.4 内机运行参数）
export interface HvacRunParams {
  // 运行功率：真实，来自 deviceApi.metricsLatest 的 power_kw 指标
  power_kw: number | null
  // 运行电流：待接入（后端无 device_metrics 电流点位）
  current_a: number | null
  // 运行时间：待接入（后端无累计运行时长字段）
  runtime_h: number | null
  // 累计用电量：待接入（后端无电量累计点位）
  energy_kwh: number | null
}

// 照明区域状态（4.2 / 4.3 楼栋与区域能耗、智能感应）
export interface LightingZoneStatus {
  zone: string
  on: boolean
  power_kw: number
  // 调光百分比（0-100），无调光能力时为 undefined
  dimming?: number
  // 智能感应：自动/手动模式（硬件接入前仅前端 UI 骨架）
  sensor_mode?: 'auto' | 'manual'
}

export interface LightingStatus {
  building_id: string | null
  subsystem: 'lighting'
  zone_count: number
  on_count: number
  total_power_kw: number
  // 当日能耗：真实（来自照明子系统合成聚合）
  energy_today_kwh?: number
  zones: LightingZoneStatus[]
}

// 空调策略规则（3.5 多条策略组成策略组）
export type StrategyRuleType = 'cool_min' | 'heat_max' | 'on_time' | 'off_time'
export interface StrategyRule {
  type: StrategyRuleType
  // cool_min/heat_max 为温度(℃)，on_time/off_time 为 "HH:mm"
  value: number | string
}

// 控制组增强（3.5 策略组）。
// 注意：后端 ControlGroup 模型当前仅含 name/description/building_ids/device_ids，
// 不含多策略规则字段。前端以 strategies 字段做「策略组列表 + 绑定内机」可交互骨架，
// 规则暂存于 description（JSON）。需后端扩展 ControlGroup 增加 strategies 段（见交付报告缺口清单）。
export interface ControlGroupWithStrategy extends ControlGroup {
  strategies?: StrategyRule[]
}

// 工单状态
export type WorkOrderStatus =
  | 'pending' // 待处理
  | 'processing' // 处理中
  | 'feedback' // 反馈
  | 'unfinished' // 未完成
  | 'completed' // 已完成
  | 'closed' // 关闭

export const WORK_ORDER_STATUSES: { value: WorkOrderStatus; label: string }[] = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'feedback', label: '反馈' },
  { value: 'unfinished', label: '未完成' },
  { value: 'completed', label: '已完成' },
  { value: 'closed', label: '关闭' },
]

// 工单
export interface WorkOrder {
  id: string
  code: string
  title: string
  description?: string
  assignee?: string // 指派给谁
  building_id?: string
  building_name?: string
  product_type?: string // 产品类型
  device_id?: string
  device_name?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  status: WorkOrderStatus
  created_at: string
  updated_at: string
}

// 我的待办统计
export interface WorkOrderStats {
  total: number
  processing: number
  feedback: number
  unfinished: number
  completed: number
  closed: number
}

// 审计日志（审查追踪 / 操作日志）
export interface AuditLog {
  id: string
  user_id?: string
  username: string
  module: string
  action: string
  target: string
  detail?: string
  result: 'success' | 'fail'
  ip?: string
  created_at: string
  // 审查追踪增强字段
  before?: Record<string, any> | null
  after?: Record<string, any> | null
  reason?: string
  prev_hash?: string
  hash?: string
}

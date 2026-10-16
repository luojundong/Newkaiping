// GK-24 补丁：数据来源标识（前端口径，镜像后端部署真相）
//
// 背景（团队复核结论）：后端 backend/.env:8 当前为 DATA_SOURCE_MODE=mock；
// 且 backend/src/common/connector/real/real.connector.ts 的 SYNTHETIC_COLLECTIONS 名单中的
// 12 个集合（含 subsystem_status / regulation_overview / lifecycle_equipment 等）即使切到 real 模式
// 也仍走 Mock 合成。因此「接口存在 ≠ 数据真实」——当前部署下所有展示数值均为「模拟（合成）」值。
// 项目负责人对把合成数据当成真实值展示零容忍，故前端必须对每个数据区块给出可见来源标识。
//
// 约束：禁止改动 backend，且后端未在任何 API 响应中暴露 DATA_SOURCE_MODE / 集合合成标记。
// 故前端以前端配置镜像部署真相（默认 mock，可由 VITE_DATA_SOURCE_MODE 覆盖）。
// 分类三态：
//   - 'pending' 待接入：压根没有接口 / 字段（无 collection）
//   - 'mock'    模拟  ：有接口但当前为 Mock 合成值（mock 模式，或集合在合成名单内）
//   - 'real'    真实  ：real 模式且集合不在合成名单（当前部署不会命中）

export type DataSourceKind = 'real' | 'mock' | 'pending'

// 镜像 backend/src/common/connector/real/real.connector.ts:19 的 SYNTHETIC_COLLECTIONS
export const SYNTHETIC_COLLECTIONS: ReadonlySet<string> = new Set<string>([
  'device_metrics',
  'subsystem_status',
  'regulation_overview',
  'lifecycle_equipment',
  'lifecycle_maintenance',
  'energy_summary',
  'energy_trend',
  'scene_points',
  'scene_config',
  'menus',
  'features',
  'live_batch',
])

// 当前部署数据源模式：优先读 VITE_DATA_SOURCE_MODE，缺省镜像 backend/.env 的 mock。
// GK-24 收尾（GK-26 后）：后端已在 GET /scene/schema 响应中 additive 暴露 dataSource 真值
// （mode 取连接器真实实例 + 适配器可用性 + syntheticCollections 单一真源），
// store.loadSchema() 会调 setBackendDataSourceInfo() 注入；注入后 classifyDataSource 以
// 后端真值为准，本文件的镜像常量仅在 schema 未加载/无 dataSource 段时兜底。
export const DATA_SOURCE_MODE: 'mock' | 'real' =
  (import.meta.env.VITE_DATA_SOURCE_MODE as string | undefined) === 'real' ? 'real' : 'mock'

// 后端真值（GK-26 交付：GET /api/v1/scene/schema → data.dataSource）
export interface BackendDataSourceInfo {
  mode: 'mock' | 'real'
  adapters?: Record<string, { configured: boolean; available: boolean }>
  syntheticCollections?: string[]
}

let backendInfo: BackendDataSourceInfo | null = null

/** store.loadSchema() 拿到 schema 后注入后端数据源真值；传 null/undefined 清除（回退镜像） */
export function setBackendDataSourceInfo(info?: BackendDataSourceInfo | null): void {
  backendInfo = info && info.mode ? info : null
}

/** 是否已注入后端真值（e2e 可用） */
export function hasBackendDataSourceInfo(): boolean {
  return backendInfo !== null
}

function currentMode(): 'mock' | 'real' {
  return backendInfo ? backendInfo.mode : DATA_SOURCE_MODE
}

function currentSynthetic(): ReadonlySet<string> {
  if (backendInfo?.syntheticCollections?.length) return new Set(backendInfo.syntheticCollections)
  return SYNTHETIC_COLLECTIONS
}

// 七子系统 → 后端读取集合（来源：backend/src/subsystems/shared/subsystem.service.ts 与 bigscreen.service.ts）
//   regulation   → regulation_overview   （合成）
//   lifecycle    → lifecycle_equipment  （合成）
//   hvac/lighting/power/hotwater/elevator → subsystem_status（合成）
export const SUBSYSTEM_COLLECTION: Record<string, string> = {
  regulation: 'regulation_overview',
  lifecycle: 'lifecycle_equipment',
  hvac: 'subsystem_status',
  lighting: 'subsystem_status',
  power: 'subsystem_status',
  hotwater: 'subsystem_status',
  elevator: 'subsystem_status',
}

/** 综合概述（overview）页 /bigscreen/panels 聚合告警与右侧指标，后端读 subsystem_status（合成） */
export const BIGSCREEN_PANELS_COLLECTION = 'subsystem_status'

/**
 * 分类数据来源。
 * @param collection 后端读取集合名；为空表示没有接口/字段 → 待接入
 * 优先用后端真值（setBackendDataSourceInfo 注入），无则回退前端镜像常量。
 */
export function classifyDataSource(collection?: string | null): DataSourceKind {
  if (!collection) return 'pending'
  if (currentMode() === 'real' && !currentSynthetic().has(collection)) return 'real'
  return 'mock'
}

// 简短徽标文案（卡片角标）
export const KIND_SHORT: Record<DataSourceKind, string> = {
  real: '真实',
  mock: '模拟',
  pending: '待接入',
}

// 完整脚注文案（tooltip / 脚注行）
export const KIND_FULL: Record<DataSourceKind, string> = {
  real: '数据源：真实设备',
  mock: '数据源：模拟（未接入真实设备）',
  pending: '数据源：待接入（无接口）',
}

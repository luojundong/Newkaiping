// 全部 API 封装（依据 docs/phase1/openapi.yaml）。所有数据来自后端，前端禁止硬编码 mock。
import http, {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
} from '@/lib/request'
import { schemaSync } from '@/lib/schema-sync'
import type {
  Alarm,
  AuthUser,
  Building,
  BuildingSubsystem,
  BuildingSubsystemPutItem,
  ControlAck,
  ControlCommand,
  Device,
  DevicePoint,
  EnergySummary,
  EnergyTrendPoint,
  MenuNode,
  Metric,
  Paginated,
  SceneConfig,
  Subsystem,
  SubsystemCode,
  SubsystemMetaItem,
  DeviceType,
  DeviceBrand,
  ControlGroup,
  WorkOrder,
  WorkOrderStats,
  BigscreenConfigEntry,
  BigscreenConfigMap,
  BigscreenLayoutEntry,
  BigscreenLayoutMap,
  SceneMarker,
  MarkerSwitch,
  BuildingDisplay,
  AuditLog,
  SceneSchemaDocument,
  SceneSchemaHudLayout,
} from '@/types/api'

// ---------- 系统 / 鉴权 / 场景 ----------
export const authApi = {
  login: (username: string, password: string) =>
    apiPost<{ token: string; user: AuthUser }>('/auth/login', { username, password }),
  logout: () => apiPost<null>('/auth/logout'),
  me: () => apiGet<AuthUser>('/auth/me'),
  menus: () => apiGet<{ buildings: Building[]; subsystems: Subsystem[] }>('/auth/menus'),
  features: () => apiGet<Record<string, boolean>>('/features'),
}

export const sceneApi = {
  config: () => apiGet<SceneConfig>('/scene/config'),
  points: (params: { building_id?: string; subsystem?: string }) =>
    apiGet<{ points: DevicePoint[] }>('/scene/points', { params }),
  // 3D 标记 CRUD
  markers: (buildingId?: string) =>
    apiGet<SceneMarker[]>('/scene/markers', { params: buildingId ? { building_id: buildingId } : undefined }),
  createMarker: (body: Partial<SceneMarker>) =>
    apiPost<SceneMarker>('/scene/markers', body),
  updateMarker: (id: string, body: Partial<SceneMarker>) =>
    apiPut<SceneMarker>(`/scene/markers/${id}`, body),
  deleteMarker: (id: string) =>
    apiDelete(`/scene/markers/${id}`),
  // 标注显隐开关
  getMarkerSwitch: () =>
    apiGet<MarkerSwitch>('/scene/marker-switch'),
  setMarkerSwitch: (body: Partial<MarkerSwitch>) =>
    apiPut<MarkerSwitch>('/scene/marker-switch', body),
  // 楼栋显示 DIY（框框区域 + 背景透明度）
  getBuildingDisplay: () =>
    apiGet<BuildingDisplay>('/scene/building-display'),
  setBuildingDisplay: (body: Partial<BuildingDisplay>) =>
    apiPut<BuildingDisplay>('/scene/building-display', body),
  // 大屏模型加载提示文案（自定义）
  getModelLoadingHint: () =>
    apiGet<{ hint: string }>('/scene/model-loading-hint'),
  setModelLoadingHint: (hint: string, reason?: string) =>
    apiPut<{ hint: string }>('/scene/model-loading-hint', { hint, reason }),
  // 楼栋锚点批量写入
  setAnchors: (anchors: Array<Record<string, any>>) =>
    apiPut<Array<Record<string, any>>>('/scene/anchors', anchors),
  // 子系统菜单 DIY（自定义名称 + 开关）
  getSubsystemMeta: () =>
    apiGet<Record<string, SubsystemMetaItem>>('/scene/subsystem-meta'),
  setSubsystemMeta: (body: Record<string, SubsystemMetaItem>) =>
    apiPut<Record<string, SubsystemMetaItem>>('/scene/subsystem-meta', body),
  // Scene Schema 物化文档（GK-01/03；GK-06 用 hudLayout 段驱动大屏 17 框）。
  // GET /api/v1/scene/schema，需 Bearer token（axios 拦截器自动注入）。
  schema: () => apiGet<SceneSchemaDocument>('/scene/schema'),
}

// Scene Schema 版本与编辑（GK-03 PUT / GK-09 Schema Editor 后台）。
// 契约（backend/src/scene/schema.controller.ts）：
//   GET  /scene/schema/version → { version, updatedAt }
//   PUT  /scene/schema         → body 为 SceneSchemaPatchDto（全顶层段 optional，patch 语义：
//                                 仅提交存在的段做段级替换，缺失段保留当前物化结果），
//                                 Header If-Match 必填（缺 → 400；与当前版本不一致 → 412）。
export const schemaEditorApi = {
  get: () => apiGet<SceneSchemaDocument>('/scene/schema'),
  version: () => apiGet<{ version: number; updatedAt: string | null }>('/scene/schema/version'),
  update: async (
    patch: { hudLayout?: SceneSchemaHudLayout } & Record<string, unknown>,
    expectedVersion: number,
  ) => {
    const data = await apiPut<{ version: number; updatedAt: string }>('/scene/schema', patch, {
      headers: { 'If-Match': String(expectedVersion) },
    })
    // GK-11：编辑端防自触发 —— 记录刚保存的版本，schemaSync 收到同版本广播时跳过重载
    schemaSync.noteSavedVersion(data.version)
    return data
  },
}

// ---------- 站点全局配置 ----------
import type { SiteConfig } from '@/types/api'
export const siteConfigApi = {
  get: () => apiGet<SiteConfig>('/site/config'),
  update: (body: Partial<SiteConfig>) => apiPut<SiteConfig>('/site/config', body),
}

// ---------- 地图底图配置（Phase 2：Key 由后端代理，前端不暴露） ----------
import type { GisConfig } from '@/types/api'
export const gisConfigApi = {
  get: () => apiGet<GisConfig>('/gis/config'),
  update: (body: Partial<GisConfig>) => apiPut<GisConfig>('/gis/config', body),
}

// ---------- 楼栋 / 设备 / 指标 / 配置 ----------
export const buildingApi = {
  list: () => apiGet<{ items: Building[] }>('/buildings'),
  detail: (id: string) => apiGet<Building>(`/buildings/${id}`),
  // 该楼启用子系统清单（楼栋子系统可配置，AC-02）
  subsystems: (id: string) => apiGet<{ items: BuildingSubsystem[] }>(`/buildings/${id}/subsystems`),
  // 后台配置楼栋启用子系统（可配置 2/5/7 个等）
  // GK-20 修复：后端 `PUT /buildings/:id/subsystems` 的 @Body() 声明为裸数组
  // （buildings.controller.ts 里 `if (!Array.isArray(items)) throw new BizError(40000, ..., 400)`）。
  // 原先这里发的是 `{ items }` 包裹对象，后端恒定 400 → 「楼栋子系统配置」页保存按钮多年来
  // 实际从未落库（只弹「保存失败，请稍后重试」）。改为裸数组后保存才真正生效。
  updateSubsystems: (id: string, items: BuildingSubsystemPutItem[]) =>
    apiPut<{ items: BuildingSubsystem[] }>(`/buildings/${id}/subsystems`, items),
}

export const deviceApi = {
  list: (params: {
    building_id?: string
    subsystem?: string
    category?: string
    status?: string
    floor?: number
    page?: number
    limit?: number
  }) => apiGet<Paginated<Device>>('/devices', { params }),
  detail: (id: string) => apiGet<Device>(`/devices/${id}`),
  metricsLatest: (id: string) => apiGet<{ metrics: Metric[] }>(`/devices/${id}/metrics/latest`),
  metrics: (id: string, params: { from?: string; to?: string; keys?: string[] }) =>
    apiGet<{ metrics: Metric[] }>(`/devices/${id}/metrics`, { params }),
  control: (id: string, cmd: ControlCommand) => apiPost<ControlAck>(`/devices/${id}/control`, cmd),
}

// ---------- 七子系统 ----------
export const regulationApi = {
  overview: (building_id?: string) => apiGet<Record<string, unknown>>('/regulation/overview', {
    params: building_id ? { building_id } : {},
  }),
}
export const lifecycleApi = {
  equipment: (building_id?: string) => apiGet<Record<string, unknown>>('/lifecycle/equipment', {
    params: building_id ? { building_id } : {},
  }),
  maintenance: () => apiGet<Record<string, unknown>>('/lifecycle/maintenance'),
}
export const hvacApi = {
  status: (building_id?: string) => apiGet<Record<string, unknown>>('/hvac/status', {
    params: building_id ? { building_id } : {},
  }),
  control: (cmd: ControlCommand) => apiPost<ControlAck>('/hvac/control', cmd),
}
export const lightingApi = {
  status: (building_id?: string) => apiGet<Record<string, unknown>>('/lighting/status', {
    params: building_id ? { building_id } : {},
  }),
  control: (cmd: ControlCommand) => apiPost<ControlAck>('/lighting/control', cmd),
}
export const powerApi = {
  status: (building_id?: string) => apiGet<Record<string, unknown>>('/power/status', {
    params: building_id ? { building_id } : {},
  }),
}
export const hotwaterApi = {
  status: (building_id?: string) => apiGet<Record<string, unknown>>('/hotwater/status', {
    params: building_id ? { building_id } : {},
  }),
}
export const elevatorApi = {
  status: (building_id?: string) => apiGet<Record<string, unknown>>('/elevator/status', {
    params: building_id ? { building_id } : {},
  }),
}

// 子系统状态查询统一入口（building view 的 SubsystemPanel 按 code 调用）
export function fetchSubsystemStatus(code: SubsystemCode, building_id?: string) {
  switch (code) {
    case 'regulation':
      return regulationApi.overview(building_id)
    case 'lifecycle':
      return lifecycleApi.equipment(building_id)
    case 'hvac':
      return hvacApi.status(building_id)
    case 'lighting':
      return lightingApi.status(building_id)
    case 'power':
      return powerApi.status(building_id)
    case 'hotwater':
      return hotwaterApi.status(building_id)
    case 'elevator':
      return elevatorApi.status(building_id)
    default:
      return Promise.resolve({} as Record<string, unknown>)
  }
}

// ---------- 能耗与告警 ----------
export const energyApi = {
  summary: (params: { building_id?: string; period?: 'hour' | 'day' | 'month' | 'year' }) =>
    apiGet<EnergySummary>('/energy/summary', { params }),
  trend: (params: { building_id?: string; subsystem?: string; from?: string; to?: string }) =>
    apiGet<{ points: EnergyTrendPoint[] }>('/energy/trend', { params }),
}

export const alarmApi = {
  list: (params: {
    building_id?: string
    subsystem?: string
    level?: string
    status?: string
  }) => apiGet<{ items: Alarm[] }>('/alarms', { params }),
  ack: (id: string) => apiPost<null>(`/alarms/${id}/ack`),
  clear: (id: string) => apiPost<null>(`/alarms/${id}/clear`),
  rules: () => apiGet<Record<string, unknown>[]>('/alarms/rules'),
  createRule: (rule: Record<string, unknown>) => apiPost<unknown>('/alarms/rules', rule),
}

// ===================== 阶段四扩展端点（docs/phase4/EXPANSION.md） =====================

// 大屏面板数据（模拟数据联动）
export const bigscreenApi = {
  panels: (params: { building_id?: string; subsystem?: string } = {}) =>
    apiGet<Record<string, unknown>>('/bigscreen/panels', { params }),
  // 单系统大屏样式配置（合并默认值）
  getConfig: (system: string) =>
    apiGet<BigscreenConfigEntry>('/bigscreen/config', { params: { system } }),
  // 全部系统已保存配置
  getAllConfigs: () => apiGet<BigscreenConfigMap>('/bigscreen/configs'),
  // 保存单系统大屏样式配置
  saveConfig: (system: string, entry: BigscreenConfigEntry) =>
    apiPut<BigscreenConfigEntry>('/bigscreen/config', { system, entry }),
  // 单系统大屏布局（17 框，合并默认值）
  getLayout: (system: string) =>
    apiGet<BigscreenLayoutEntry>('/bigscreen/layout', { params: { system } }),
  // 全部系统已保存布局
  getAllLayouts: () => apiGet<BigscreenLayoutMap>('/bigscreen/layouts'),
  // 保存单系统大屏布局
  saveLayout: (system: string, entry: BigscreenLayoutEntry) =>
    apiPut<BigscreenLayoutEntry>('/bigscreen/layout', { system, entry }),
}

// 设备 CRUD（含连接类型 MQTT/Modbus/HTTP）
export const deviceCrudApi = {
  create: (body: Record<string, unknown>) => apiPost<Device>('/devices', body),
  update: (id: string, body: Record<string, unknown>) => apiPut<Device>(`/devices/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/devices/${id}`),
}

// 楼栋 CRUD
export const buildingCrudApi = {
  create: (body: Record<string, unknown>) => apiPost<Building>('/buildings', body),
  update: (id: string, body: Record<string, unknown>) => apiPut<Building>(`/buildings/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/buildings/${id}`),
  setStatus: (id: string, status: 'active' | 'inactive') =>
    apiPut<Building>(`/buildings/${id}`, { status }),
}

// 用户 / 角色 CRUD
export const userApi = {
  list: (params: { page?: number; limit?: number; keyword?: string } = {}) =>
    apiGet<{ items: Record<string, unknown>[]; total: number }>('/users', { params }),
  create: (body: Record<string, unknown>) => apiPost<Record<string, unknown>>('/users', body),
  update: (id: string, body: Record<string, unknown>) =>
    apiPut<Record<string, unknown>>(`/users/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/users/${id}`),
}

export const roleApi = {
  list: () => apiGet<Record<string, unknown>[]>('/roles'),
  create: (body: Record<string, unknown>) => apiPost<Record<string, unknown>>('/roles', body),
  update: (id: string, body: Record<string, unknown>) =>
    apiPut<Record<string, unknown>>(`/roles/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/roles/${id}`),
}

// 计费管理：电价 / 配额 / 充值
export const billingApi = {
  prices: () => apiGet<Record<string, unknown>[]>('/billing/prices'),
  createPrice: (body: Record<string, unknown>) => apiPost<Record<string, unknown>>('/billing/prices', body),
  updatePrice: (id: string, body: Record<string, unknown>) =>
    apiPut<Record<string, unknown>>(`/billing/prices/${id}`, body),
  removePrice: (id: string) => apiDelete<null>(`/billing/prices/${id}`),
  quotas: () => apiGet<Record<string, unknown>[]>('/billing/quotas'),
  createQuota: (body: Record<string, unknown>) => apiPost<Record<string, unknown>>('/billing/quotas', body),
  updateQuota: (id: string, body: Record<string, unknown>) =>
    apiPut<Record<string, unknown>>(`/billing/quotas/${id}`, body),
  removeQuota: (id: string) => apiDelete<null>(`/billing/quotas/${id}`),
  accounts: (params: { scope?: string; ref_id?: string } = {}) =>
    apiGet<Record<string, unknown>[]>('/billing/accounts', { params }),
  recharge: (body: Record<string, unknown>) => apiPost<Record<string, unknown>>('/billing/recharges', body),
}

// 历史数据查询 + 下载
export const historyApi = {
  query: (params: {
    building_id?: string
    device_id?: string
    subsystem?: string
    from?: string
    to?: string
    keys?: string[]
    page?: number
    limit?: number
  } = {}) => apiGet<{ items: Record<string, unknown>[]; total: number }>('/history', { params }),
  // 返回 CSV 文本（前端用 Blob 触发下载）
  exportCsv: (params: Record<string, unknown> = {}) =>
    apiGet<string>('/history/export', { params, responseType: 'text' as never }),
}

// 告警异常配置（完整 CRUD）
export const alarmRuleApi = {
  list: (params: { subsystem?: string; enabled?: boolean } = {}) =>
    apiGet<Record<string, unknown>[]>('/alarm-rules', { params }),
  create: (body: Record<string, unknown>) => apiPost<Record<string, unknown>>('/alarm-rules', body),
  update: (id: string, body: Record<string, unknown>) =>
    apiPut<Record<string, unknown>>(`/alarm-rules/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/alarm-rules/${id}`),
}

// 报表导出（返回 CSV 文本）
export const reportApi = {
  exportCsv: (params: Record<string, unknown> = {}) =>
    apiGet<string>('/reports/export', { params, responseType: 'text' as never }),
}

// 场景模型上传（.glb）
export const sceneModelApi = {
  // type: 3d / video / image / panorama（前端明确指定，后端据此持久化 model_type）
  upload: (file: File, type: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('type', type)
    return apiPost<{ model_url: string; model_type: string }>(`/scene/model?type=${type}`, form)
  },
}

// ===================== 阶段五：监控运维 / 设备主数据 =====================

// 设备类型
export const deviceTypeApi = {
  list: () => apiGet<{ items: DeviceType[] }>('/device-types'),
  create: (body: Partial<DeviceType>) => apiPost<DeviceType>('/device-types', body),
  update: (id: string, body: Partial<DeviceType>) => apiPut<DeviceType>(`/device-types/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/device-types/${id}`),
}

// 设备品牌
export const deviceBrandApi = {
  list: () => apiGet<{ items: DeviceBrand[] }>('/device-brands'),
  create: (body: Partial<DeviceBrand>) => apiPost<DeviceBrand>('/device-brands', body),
  update: (id: string, body: Partial<DeviceBrand>) => apiPut<DeviceBrand>(`/device-brands/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/device-brands/${id}`),
}

// 控制群组（群组控制）
export const controlGroupApi = {
  list: () => apiGet<{ items: ControlGroup[] }>('/control-groups'),
  create: (body: Partial<ControlGroup>) => apiPost<ControlGroup>('/control-groups', body),
  update: (id: string, body: Partial<ControlGroup>) => apiPut<ControlGroup>(`/control-groups/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/control-groups/${id}`),
  // 群组统一动作：开关机 / 远程遥控 / 电源控制
  control: (id: string, body: { action: string; payload?: Record<string, unknown> }) =>
    apiPost<ControlAck>(`/control-groups/${id}/control`, body),
}

// 工单管理
export const workOrderApi = {
  list: (params: {
    status?: string
    building_id?: string
    keyword?: string
    page?: number
    limit?: number
  } = {}) => apiGet<{ items: WorkOrder[]; total: number }>('/work-orders', { params }),
  create: (body: Partial<WorkOrder>) => apiPost<WorkOrder>('/work-orders', body),
  update: (id: string, body: Partial<WorkOrder>) => apiPut<WorkOrder>(`/work-orders/${id}`, body),
  remove: (id: string) => apiDelete<null>(`/work-orders/${id}`),
  stats: () => apiGet<WorkOrderStats>('/work-orders/stats'),
}

// 子系统显示名（自定义修改，需求：楼栋子系统配置）
export const subsystemLabelApi = {
  list: () => apiGet<Record<string, string>>('/scene/subsystem-labels'),
  update: (body: Record<string, string>) => apiPut<Record<string, string>>('/scene/subsystem-labels', body),
}

// 左侧菜单自定义排序
export const menuOrderApi = {
  get: () => apiGet<string[]>('/menus/order'),
  save: (order: string[]) => apiPut<string[]>('/menus/order', { order }),
}

// 操作日志 / 审查追踪（审计日志）
export const logsApi = {
  list: (params: {
    page?: number
    limit?: number
    username?: string
    module?: string
    action?: string
    keyword?: string
    from?: string
    to?: string
  } = {}) => apiGet<{ items: AuditLog[]; total: number }>('/logs', { params }),
  // 哈希链完整性校验（防篡改）
  integrity: () =>
    apiGet<{
      ok: boolean
      count: number
      checked: number
      legacyCount: number
      brokenAt?: string
      tailHash?: string
    }>('/logs/integrity'),
  // 服务器可信时间与 NTP 同步状态（GMP：审计时间戳基于 NTP 同步的服务器时钟）
  timeSource: () =>
    apiGet<{
      serverTime: string
      ntpSynced: boolean | null
      source: string
      timezone: string
    }>('/logs/time-source'),
  // 周期性复核状态（上次复核 / 间隔 / 是否逾期）
  reviewStatus: () =>
    apiGet<{
      lastReview: { reviewer: string; reviewed_at: string; record_count: number; note?: string } | null
      intervalDays: number
      daysSince: number | null
      dueInDays: number | null
      overdue: boolean
    }>('/logs/review-status'),
  // 执行周期性复核（写入复核结论 + 一条 review 审计，纳入哈希链）
  review: (note?: string) => apiPost<{ review: any; audit: any }>('/logs/review', { note }),
  // 后台更新复核间隔（天数）：写入 audit_settings 并留痕
  setReviewSettings: (intervalDays: number, reason?: string) =>
    apiPut<{ intervalDays: number; before: number; after: number; audit: any }>(
      '/logs/review-settings',
      { intervalDays, reason },
    ),
  // GMP-P1：服务端导出审计轨迹（含哈希链，导出动作本身留痕）。返回文件 Blob，由调用方触发下载。
  exportAudit: (params: Record<string, string>, format: 'csv' | 'json') => {
    const qs = new URLSearchParams()
    if (params.username) qs.set('username', params.username)
    if (params.module) qs.set('module', params.module)
    if (params.action) qs.set('action', params.action)
    if (params.keyword) qs.set('keyword', params.keyword)
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    qs.set('format', format)
    return http.get(`/logs/export?${qs.toString()}`, { responseType: 'blob' }) as Promise<Blob>
  },
}

// 统一设备控制（7 子系统，POST /{code}/control）。变更理由为关键动作建议必填。
export const deviceControlApi = {
  control: (code: SubsystemCode, cmd: ControlCommand) =>
    apiPost<ControlAck>(`/${code}/control`, cmd),
}

export { type MenuNode }

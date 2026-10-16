// GK-10 · 设备弹窗 schema 模板化适配层（纯函数，不持有 store / 组件依赖）
//
// 背景：DeviceDetailDrawer 原为硬编码内容。本模块把 Scene Schema（GK-01/03 物化文档）
// 中该设备的相关段解析为「widget.type 模板区块计划」：
//   - sceneGraph device 节点 semantic.deviceType / meta.{code,room,building_id,marker_type}
//   - pointTable 该设备条目（实时指标点配置，数值仍走现有 REST 实时 API）
//   - bindings 该设备条目（nodeId = `device_<deviceId>`）
// widget.type → 面板种类映射复用 GK-06 lib/schema-hud.ts widgetPanelKind（单一事实源），
// 保证设备弹窗与大屏 17 框对同一冻结枚举的口径一致。
//
// 回退契约：schema 缺失 / sceneGraph 无该设备 / deviceType 未命中计划表 → 返回 null，
// 调用方（DeviceDetailDrawer）退回改造前的硬编码 drawer 内容，行为零回归。
import type { SceneSchemaDocument } from '@/types/api'
import { widgetPanelKind } from './schema-hud'
import type { HudPanelKind } from './schema-hud'

// sceneGraph device 节点 semantic（冻结 schema：semantic.deviceType 为 23 值冻结枚举的子集）
export interface SchemaDeviceSemantic {
  nodeId: string
  deviceId: string
  deviceType: string
  name: string
  meta: { code?: string; room?: string; building_id?: string; marker_type?: string }
}

// pointTable 该设备的点位配置（本物化文档每设备 1 条：`<code>.STATUS`，bool/read）
export interface SchemaDevicePointConfig {
  pointId: string
  name: string
  dataType: string
  access: string
  unit: string
}

// 设备节点在 schema 中是否命中模板（含宽泛 internal 字段，避免把整个 sceneGraph 节点透传给组件）
export interface SchemaDeviceSemanticInternal {
  deviceId?: unknown
  deviceType?: unknown
  meta?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * 在 sceneGraph 中按 REST 设备 id 找 device 节点。
 * 契约：REST /devices 的 Device.id === schema device 节点 semantic.deviceId
 * （实测：dev-1-screw_chiller-001 同时存在于两侧）。
 */
export function findSchemaDeviceSemantic(
  doc: SceneSchemaDocument | null | undefined,
  deviceId: string | null | undefined,
): SchemaDeviceSemantic | null {
  if (!doc || !deviceId || !Array.isArray(doc.sceneGraph)) return null
  for (const raw of doc.sceneGraph) {
    if (!isRecord(raw)) continue
    if (raw.type !== 'device') continue
    const sem = raw.semantic as SchemaDeviceSemanticInternal | undefined
    if (!isRecord(sem) || sem.deviceId !== deviceId) continue
    const meta = isRecord(sem.meta) ? (sem.meta as SchemaDeviceSemantic['meta']) : {}
    return {
      nodeId: typeof raw.id === 'string' ? raw.id : `device_${deviceId}`,
      deviceId,
      deviceType: typeof sem.deviceType === 'string' ? sem.deviceType : '',
      name: typeof raw.name === 'string' ? raw.name : '',
      meta,
    }
  }
  return null
}

/** pointTable 中该设备的点位配置（deviceId 直接关联，一一对应） */
export function schemaDevicePoints(
  doc: SceneSchemaDocument | null | undefined,
  deviceId: string | null | undefined,
): SchemaDevicePointConfig[] {
  if (!doc || !deviceId || !Array.isArray(doc.pointTable)) return []
  const out: SchemaDevicePointConfig[] = []
  for (const raw of doc.pointTable) {
    if (!isRecord(raw)) continue
    if (raw.deviceId !== deviceId) continue
    out.push({
      pointId: typeof raw.pointId === 'string' ? raw.pointId : '',
      name: typeof raw.name === 'string' ? raw.name : '',
      dataType: typeof raw.dataType === 'string' ? raw.dataType : '',
      access: typeof raw.access === 'string' ? raw.access : '',
      unit: typeof raw.unit === 'string' ? raw.unit : '',
    })
  }
  return out
}

/** bindings 中该设备的绑定条数（nodeId = `device_<deviceId>`） */
export function schemaDeviceBindingCount(
  doc: SceneSchemaDocument | null | undefined,
  nodeId: string | null | undefined,
): number {
  if (!doc || !nodeId || !Array.isArray(doc.bindings)) return 0
  let n = 0
  for (const raw of doc.bindings) {
    if (isRecord(raw) && raw.nodeId === nodeId) n++
  }
  return n
}

// deviceType → widget.type 区块序列（冻结枚举子集；其余 type 走 TODO 兜底块）
//   AC     → 主面板 + 状态灯 + 关键数值卡（控制区另接空调遥控器面板）
//   CHILLER/CT/HP/PUMP → 主面板 + 关键数值卡（控制区沿用开关/策略按钮）
//   SENSOR → 状态格 + 关键数值卡（无控制区）
const TYPE_TO_WIDGETS: Record<string, string[]> = {
  AC: ['device_board', 'status_grid', 'stat_card'],
  CHILLER: ['device_board', 'stat_card'],
  CT: ['device_board', 'stat_card'],
  HP: ['device_board', 'stat_card'],
  PUMP: ['device_board', 'stat_card'],
  SENSOR: ['status_grid', 'stat_card'],
}

// 本期已实现渲染的模板种类（widget.type 其余值进 TODO 兜底块）
export const IMPLEMENTED_PANEL_KINDS: readonly HudPanelKind[] = [
  'device_board',
  'status_grid',
  'stat_card',
]

export interface SchemaWidgetBlock {
  /** schema widget.type 原始值（冻结枚举），落在 DOM data-widget-type */
  type: string
  /** 经 GK-06 widgetPanelKind 收敛后的面板种类 */
  kind: HudPanelKind
  /** 本期是否已实现渲染 */
  implemented: boolean
}

export interface SchemaDeviceTemplatePlan {
  semantic: SchemaDeviceSemantic
  blocks: SchemaWidgetBlock[]
  points: SchemaDevicePointConfig[]
  bindingsCount: number
  /** AC 设备：控制区渲染空调遥控器面板（下发仍走现有控制 API） */
  isAc: boolean
}

/**
 * 设备 → 弹窗模板计划。任何一步缺失返回 null（调用方回退旧 drawer 内容）。
 * widget.type → kind 复用 widgetPanelKind（伪 widget：只依赖 id/type 字段）。
 */
export function buildDeviceTemplatePlan(
  doc: SceneSchemaDocument | null | undefined,
  deviceId: string | null | undefined,
): SchemaDeviceTemplatePlan | null {
  const semantic = findSchemaDeviceSemantic(doc, deviceId)
  if (!semantic) return null
  const types = TYPE_TO_WIDGETS[semantic.deviceType]
  if (!types || !types.length) return null
  const blocks: SchemaWidgetBlock[] = types.map((type) => {
    const kind = widgetPanelKind({
      id: `device-drawer-${semantic.deviceType.toLowerCase()}-${type}`,
      type,
      rect: [0, 0, 0, 0],
      title: '',
    })
    return { type, kind, implemented: IMPLEMENTED_PANEL_KINDS.includes(kind) }
  })
  return {
    semantic,
    blocks,
    points: schemaDevicePoints(doc, deviceId),
    bindingsCount: schemaDeviceBindingCount(doc, semantic.nodeId),
    isAc: semantic.deviceType === 'AC',
  }
}

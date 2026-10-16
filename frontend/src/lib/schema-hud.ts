// GK-06 · Scene Schema hudLayout 段 → 现有大屏 17 框的适配层
//
// 背景：后端 GET /api/v1/scene/schema 返回的 `hudLayout.widgets[]` 是 17 个数据框的权威定义
//   { id, type, title, rect:[x,y,w,h], z?, locked?, frame?, subsystem? }
// 现有大屏把 17 框几何/皮肤统一收敛成 `BigscreenBox { key,x,y,w,h,frame,title,subsystem }`（lib/bigscreen-layout.ts），
// 二者坐标同在 1920x1080 设计空间，可直接互相换算。本模块只做「widget → BigscreenBox」降级，
// 不持有任何 store / 组件依赖（纯函数），PanelCard / LeftPanel 复用。
//
// 说明：
//   - 标题语义：后端 widget.title 与前端默认 BOX_LABELS 一致时视为“默认标题”，不抢占既有
//     标题优先级链（subsystem 菜单名 / 调用方 i18n 标题），从而保证中英文切换等旧行为零回归；
//     仅当 widget.title 是该框的自定义文案（≠ BOX_LABELS[key]）时才作为最高优先级覆盖标题。
//   - widget.type → 面板种类映射：GK-10 将做真正的 widget 模板化动态渲染，本期先在此把类型映射
//     落地为“面板种类”并留档到 DOM/data，保证数据可追溯，渲染模板仍由各面板组件静态提供。
import type {
  BigscreenBox,
  FrameStyle,
  SceneSchemaHudWidget,
} from '@/types/api'
import {
  BOX_LABELS,
  DESIGN_H,
  DESIGN_W,
  FRAME_KEYS,
  defaultLayout,
} from './bigscreen-layout'

// 现有面板可承载的面板种类（GK-10 完整模板化前的收敛集合）
export type HudPanelKind =
  | 'stat_card' // 数值 KPI 卡（默认）
  | 'gauge' // 仪表盘（电压稳定度/湿度统计/设备在线量）
  | 'line_chart' // 折线趋势图（温度/负载/用电/流量）
  | 'bar_chart' // 柱状/分类图
  | 'device_board' // 子系统设备板（空调/供配电/电梯等 2x2 KPI）
  | 'alert_list' // 告警列表（监控报警/系统设备与能耗）
  | 'status_grid' // 状态格（数据来源/当前状态/设备在线量/应急响应）
  | 'kpi_ring'
  | 'title_bar'
  | 'ai_panel'

// widget.type（冻结 enum：stat_card/gauge/line_chart/device_board/alert_list/ai_panel/
// title_bar/bar_chart/status_grid/kpi_ring/status_light/carousel）→ 面板种类
const TYPE_TO_KIND: Record<string, HudPanelKind> = {
  stat_card: 'stat_card',
  gauge: 'gauge',
  line_chart: 'line_chart',
  bar_chart: 'bar_chart',
  device_board: 'device_board',
  alert_list: 'alert_list',
  ai_panel: 'ai_panel',
  title_bar: 'title_bar',
  status_grid: 'status_grid',
  kpi_ring: 'kpi_ring',
  status_light: 'status_grid',
  carousel: 'status_grid',
}

// 类型未知时的 id 白名单兜底（与后端 schema.service widgetTypeFor 口径一致）
const ID_KIND_FALLBACK: Record<string, HudPanelKind> = {
  'left-alarm': 'alert_list',
  'bottom-dept-alarm': 'alert_list',
  'bottom-category-trend': 'bar_chart',
  'right-hvac': 'device_board',
  'right-power': 'device_board',
  'right-elevator': 'device_board',
  'right-temp-trend': 'line_chart',
  'right-load-trend': 'line_chart',
  'right-energy-trend': 'line_chart',
  'bottom-traffic-trend': 'line_chart',
  'right-online': 'status_grid',
  'bottom-source': 'status_grid',
  'bottom-status': 'status_grid',
  'right-voltage': 'gauge',
  'right-humidity': 'gauge',
  'right-energy': 'stat_card',
  'bottom-response': 'status_grid',
}

// TODO(GK-10)：完整 widget 模板化渲染后，本函数将替换各面板组件内的静态模板选择。
export function widgetPanelKind(widget: SceneSchemaHudWidget | null | undefined): HudPanelKind {
  if (!widget) return 'stat_card'
  const fromType = widget.type ? TYPE_TO_KIND[widget.type] : undefined
  if (fromType) return fromType
  return ID_KIND_FALLBACK[widget.id] || 'stat_card'
}

function isFrameStyle(v: unknown): v is FrameStyle {
  return typeof v === 'string' && (FRAME_KEYS as string[]).includes(v)
}

function clampNum(v: unknown, min: number, max: number, fb: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fb
  return Math.max(min, Math.min(max, n))
}

function rectVal(rect: unknown, idx: 0 | 1 | 2 | 3, fb: number): number {
  return Array.isArray(rect) ? (rect[idx] as number | undefined) ?? fb : fb
}

/**
 * hudLayout.widget → BigscreenBox（用于 boxToPercent / 8 种皮肤 / 标题 / subsystem）。
 * fallback 提供 rect/frame 等缺失字段时的默认几何（通常是 bigscreen.layout.boxes 或 defaultLayout()）。
 */
export function hudWidgetToBox(
  widget: SceneSchemaHudWidget,
  boxKey: string,
  fallback: BigscreenBox,
): BigscreenBox {
  const x = clampNum(rectVal(widget.rect, 0, fallback.x), 0, DESIGN_W, fallback.x)
  const y = clampNum(rectVal(widget.rect, 1, fallback.y), 0, DESIGN_H, fallback.y)
  const w = clampNum(rectVal(widget.rect, 2, fallback.w), 40, DESIGN_W, fallback.w)
  const h = clampNum(rectVal(widget.rect, 3, fallback.h), 40, DESIGN_H, fallback.h)
  return {
    key: boxKey,
    x,
    y,
    w,
    h,
    frame: isFrameStyle(widget.frame) ? widget.frame : fallback.frame,
    subsystem:
      typeof widget.subsystem === 'string' && widget.subsystem.trim()
        ? widget.subsystem
        : fallback.subsystem,
    title: typeof widget.title === 'string' && widget.title.trim() ? widget.title.trim() : undefined,
    // 透传 fallback 的 DIY 显示样式（标题英文/字号/颜色/边框/内框/内线），
    // 避免将来 17 框回填进 schema widget 时这些字段被整体丢弃（回归防护）。
    ...(fallback.titleEn ? { titleEn: fallback.titleEn } : {}),
    ...(typeof fallback.titleSize === 'number' && fallback.titleSize > 0 ? { titleSize: fallback.titleSize } : {}),
    ...(fallback.titleColor ? { titleColor: fallback.titleColor } : {}),
    ...(fallback.borderColor ? { borderColor: fallback.borderColor } : {}),
    ...(fallback.innerBorderColor ? { innerBorderColor: fallback.innerBorderColor } : {}),
    ...(fallback.innerLineColor ? { innerLineColor: fallback.innerLineColor } : {}),
  }
}

/**
 * 该 widget 的标题是否为「自定义标题」。
 * widget.title === 该框前端默认标签(BOX_LABELS) 时视为默认，不抢占旧标题链（i18n / subsystem 菜单名）。
 */
export function isCustomHudTitle(
  widget: SceneSchemaHudWidget | null | undefined,
  boxKey: string,
): boolean {
  if (!widget?.title?.trim()) return false
  const def = BOX_LABELS[boxKey]
  return !!def && widget.title.trim() !== def
}

// 便捷：schema 存在对应 widget 时返回 widget；否则返回前端默认布局框（永不空）
export function hudWidgetOrDefaultFallback(
  widget: SceneSchemaHudWidget | null | undefined,
  boxKey: string,
  fallback: BigscreenBox,
): BigscreenBox {
  return widget ? hudWidgetToBox(widget, boxKey, fallback) : fallback
}

// 保留 defaultLayout 引用导出，避免调用方为取单框默认值反复重建整个默认布局
export function defaultBox(boxKey: string): BigscreenBox {
  return defaultLayout().boxes[boxKey] as BigscreenBox
}

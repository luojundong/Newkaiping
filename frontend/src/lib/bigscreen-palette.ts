/**
 * 大屏图表序列调色板（参考页 var C = {...} L4295-4298 的令牌化映射）
 *
 * ★ P0 铁律：本文件**不定义任何色值**，只输出 `var(--kp-*)` 引用字符串。
 *   唯一允许定义色值的文件是 styles/design-tokens.css。
 *   SVG 的 stroke/fill 属性不支持 var()，必须通过 `:style="{ fill: color }"` 绑定，
 *   因此这些字符串会作为**内联 style 值**下发，浏览器解析 var() 正常生效。
 *
 * 参考页 → 令牌对照：
 *   C.cyan  #35C5FF → --kp-accent
 *   C.blue  #2E8BFF → --kp-info
 *   C.green #34D98A → --kp-success
 *   C.amber #FFB03A → --kp-warn
 *   C.red   #FF5252 → --kp-danger
 *   C.weak  #62809C → --kp-fg-subtle
 *   #5FE3C0         → --kp-teal
 *   #8FA6BE         → --kp-fg-dim
 */

/** 语义序列色（图表 stroke/fill 用） */
export const SERIES = {
  cyan: 'var(--kp-accent)',
  blue: 'var(--kp-info)',
  green: 'var(--kp-success)',
  amber: 'var(--kp-warn)',
  red: 'var(--kp-danger)',
  weak: 'var(--kp-fg-subtle)',
  teal: 'var(--kp-teal)',
  dim: 'var(--kp-fg-dim)',
  soft: 'var(--kp-info-soft)',
} as const

export type SeriesKey = keyof typeof SERIES

/** 告警等级 → 序列色（u 紧急 / m 重要 / n 一般 / ok 正常） */
export const LEVEL_COLOR: Record<string, string> = {
  u: SERIES.red,
  m: SERIES.amber,
  n: SERIES.blue,
  ok: SERIES.green,
}

/** 告警等级 → 中文标签（参考页 tagHTML） */
export const LEVEL_LABEL: Record<string, string> = {
  u: '紧急',
  m: '重要',
  n: '一般',
  ok: '正常',
}

/** 图表网格线 / 轴线（参考页 rgba(53,197,255,.07) / .22 / .06） */
export const CHART_GRID = 'rgba(var(--kp-accent-rgb), 0.07)'
export const CHART_AXIS = 'rgba(var(--kp-accent-rgb), 0.22)'
export const CHART_GRID_FAINT = 'rgba(var(--kp-accent-rgb), 0.06)'
/** 图表槽底（hbar 轨道 / donut 底环） */
export const CHART_TRACK = 'rgba(var(--kp-edge-rgb), 0.35)'
export const CHART_TRACK_STRONG = 'rgba(var(--kp-edge-rgb), 0.45)'
/** 折线末点描边（参考页 #04101E = 舞台底色） */
export const CHART_DOT_STROKE = 'var(--kp-bg)'
/** 轴标签文字 */
export const CHART_LABEL = 'var(--kp-fg-subtle)'
export const CHART_LABEL_STRONG = 'var(--kp-fg-body)'
export const CHART_LABEL_NAME = 'var(--kp-fg-muted)'

/**
 * 温度热力插值（参考页 tempColor(t)：18℃ 蓝 → 24℃ 橙 → 30℃ 红）。
 * 用 color-mix() 保持零硬编码：两段线性插值，落在 --kp-info / --kp-warn / --kp-danger 之间。
 */
export function tempColor(t: number): string {
  const x = Math.max(0, Math.min(1, (t - 18) / 12))
  if (x < 0.5) {
    const p = Math.round((x / 0.5) * 100)
    return `color-mix(in srgb, var(--kp-warn) ${p}%, var(--kp-info))`
  }
  const p = Math.round(((x - 0.5) / 0.5) * 100)
  return `color-mix(in srgb, var(--kp-danger) ${p}%, var(--kp-warn))`
}

/** 千分位 + 2 位小数（参考页 f2） */
export function f2(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 千分位整数（参考页 f0） */
export function f0(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return Math.round(n).toLocaleString('zh-CN')
}

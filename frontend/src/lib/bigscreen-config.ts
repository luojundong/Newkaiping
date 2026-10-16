// 大屏样式配置：默认值、合并逻辑、系统清单，以及把配置转成可绑定到根元素的 CSS 变量对象。
// 前后端共用同一套默认值（见 backend/src/bigscreen/bigscreen-config.service.ts）。

import type {
  BigscreenConfigEntry,
  BigscreenConfigMap,
  BigscreenHeaderLayout,
  BigscreenStyle,
  HeaderModulePos,
  HeaderSlot,
} from '@/types/api'
import { darken, hexToRgba } from './color'

// 顶部默认布局（1 行）：平台名左、时钟右、子系统菜单中、工具组右；时间换行显示
export const DEFAULT_HEADER_LAYOUT: BigscreenHeaderLayout = {
  rows: 1,
  platform: { row: 1, slot: 'left' },
  clock: { row: 1, slot: 'right' },
  tabs: { row: 1, slot: 'center' },
  tools: { row: 1, slot: 'right' },
  clockSingleLine: false,
}

// 系统维度：overview = 全院综合态势；其余 7 个子系统各一套
export const SYSTEM_KEYS = [
  'overview',
  'regulation',
  'lifecycle',
  'hvac',
  'lighting',
  'power',
  'hotwater',
  'elevator',
] as const

export const SYSTEM_LABELS: Record<string, string> = {
  overview: '全院综合态势',
  regulation: '智慧能源调控',
  lifecycle: '设备生命周期',
  hvac: '空调集中控制',
  lighting: '智慧照明',
  power: '电力监控',
  hotwater: '热水调度',
  elevator: '电梯节能',
}

export const DEFAULT_STYLE: BigscreenStyle = {
  accent: '#35C5FF',
  bg: '#04101E',
  panelAlpha: 0.82,
  headerHeight: 110,
  leftWidth: 280,
  rightWidth: 520,
  bottomHeight: 140,
  radius: 4,
  header: { ...DEFAULT_HEADER_LAYOUT },
}

export function defaultTitle(system: string): string {
  return SYSTEM_LABELS[system] || system
}

export function defaultEntry(system: string): BigscreenConfigEntry {
  return { title: defaultTitle(system), titleFontSize: 30, style: { ...DEFAULT_STYLE } }
}

// 与默认值合并（stored 可能缺字段，或 header 为旧版字符串格式）
function mergeHeader(stored?: Partial<BigscreenHeaderLayout>): BigscreenHeaderLayout {
  const base = DEFAULT_HEADER_LAYOUT
  if (!stored) return { ...base, platform: { ...base.platform }, clock: { ...base.clock }, tabs: { ...base.tabs }, tools: { ...base.tools } }
  // 兼容旧版：header 字段若是字符串位置（platform/clock/tabs 直接是 'left'|'center'|'right'），
  // 自动转换为单行的 ModulePos（row=1, slot=该位置）。
  const toPos = (v: unknown, fallback: 'left' | 'center' | 'right'): HeaderModulePos =>
    v && typeof v === 'object' && 'slot' in (v as object)
      ? (v as HeaderModulePos)
      : { row: 1, slot: (['left', 'center', 'right'].includes(v as string) ? (v as HeaderSlot) : fallback) }
  return {
    rows: ([1, 2, 3].includes(stored.rows as number) ? stored.rows : base.rows) as 1 | 2 | 3,
    platform: toPos(stored.platform, 'left'),
    clock: toPos(stored.clock, 'right'),
    tabs: toPos(stored.tabs, 'center'),
    tools: toPos(stored.tools, 'right'),
    clockSingleLine: stored.clockSingleLine ?? base.clockSingleLine,
  }
}

// 与默认值合并（stored 可能缺字段）
export function mergeEntry(system: string, stored?: Partial<BigscreenConfigEntry>): BigscreenConfigEntry {
  const base = defaultEntry(system)
  if (!stored) return base
  return {
    title: stored.title ?? base.title,
    titleFontSize: stored.titleFontSize ?? base.titleFontSize,
    style: {
      ...base.style,
      ...(stored.style || {}),
      // header 为嵌套对象，需深合并，避免旧数据缺子字段时整体覆盖
      header: mergeHeader(stored.style && stored.style.header),
    },
  }
}

// 把整个配置映射合并成完整 entry 列表（供后台编辑器初始化）
export function mergeAll(stored: BigscreenConfigMap): Record<string, BigscreenConfigEntry> {
  const out: Record<string, BigscreenConfigEntry> = {}
  for (const key of SYSTEM_KEYS) {
    out[key] = mergeEntry(key, stored[key])
  }
  return out
}

// 把 Style 转成挂载到 .bs-scale-wrap 根元素的行内 CSS 变量
// 注意：若用户未自定义强调色（style.accent 等于默认值），**不**输出 --kp-accent 等主题色相关变量，
// 让大屏跟随右上角「主题」开关（dark-navy/green/amber，定义在 design-tokens.css :root / [data-kp-theme]）。
// 否则行内样式会因特异性最高覆盖 [data-kp-theme] 规则，导致主题切换在 bigscreen 上完全失效。
// 仅当 style.accent 显式偏离默认值时，才以行内样式钉住大屏强调色（满足大屏样式 DIY 的"自定义"场景）。
export function styleToCssVars(style: BigscreenStyle): Record<string, string> {
  const vars: Record<string, string> = {
    '--kp-bg': style.bg,
    '--kp-bg-deep': darken(style.bg, 0.7),
    '--kp-panel-alpha': String(style.panelAlpha),
    '--kp-header-h': `${style.headerHeight}px`,
    '--kp-radius-md': `${style.radius}px`,
    // 面板圆角：PanelCard.vue / bigscreen-frames.css 的 .panel-card / .bs-frame 均消费
    // var(--kp-radius-panel)。若不在此以行内变量注入，DIY 圆角滑块（style.radius）将失效，
    // 面板永远停在 design-tokens.css 的 --kp-radius-panel 默认值。行内特异性最高，覆盖令牌常量。
    '--kp-radius-panel': `${style.radius}px`,
  }
  // 仅当强调色被显式自定义（非默认值）时，钉住大屏主题色
  // 比较时忽略大小写
  const accent = (style.accent || '').trim().toLowerCase()
  const defaultAccent = (DEFAULT_STYLE.accent || '').trim().toLowerCase()
  if (accent && accent !== defaultAccent) {
    vars['--kp-accent'] = style.accent
    vars['--kp-accent-secondary'] = style.accent
    vars['--kp-border'] = hexToRgba(style.accent, 0.16)
    vars['--kp-border-strong'] = hexToRgba(style.accent, 0.35)
    vars['--kp-glow'] = hexToRgba(style.accent, 0.35)
    vars['--kp-glow-strong'] = hexToRgba(style.accent, 0.6)
    vars['--kp-glow-soft'] = hexToRgba(style.accent, 0.12)
    vars['--kp-focus-ring'] = `0 0 0 3px ${hexToRgba(style.accent, 0.35)}`
  }
  return vars
}

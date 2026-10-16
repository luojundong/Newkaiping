/**
 * 大屏 JS 运行时强调色「单一真源」。
 *
 * ★ P0 铁律：唯一允许定义色值的 CSS 文件是 styles/design-tokens.css（其 --kp-accent 默认 #35C5FF）。
 * 但 ECharts(canvas) / THREE(WebGL) 等上下文无法解析 CSS var()，JS 运行时只能持有这一个常量作回退真源，
 * 所有图表序列色 / 3D 描边 / 取色 getComputedStyle 兜底统一引用本文件，杜绝 #00e5ff 散落硬编码。
 *
 * 与 design-tokens.css 对齐：默认 --kp-accent = #35C5FF（见 design-tokens.css:20），故本常量取同值，
 * 使 3D / 图表强调色与当前主题强调色一致（旧 #00e5ff 为历史残留，统一收敛到此）。
 */
export const KP_ACCENT = '#35c5ff'
/** 3D 楼栋标签底色（THREE.Sprite 文本，无法用 var()） */
export const KP_ACCENT_LABEL = '#bfefff'
/**
 * ECharts(canvas) / THREE(WebGL) 等无法解析 CSS var() 的上下文里，
 * 生成带透明度的强调色 rgba 字符串（与 --kp-accent-rgb: 53,197,255 同源）。
 * 其余（DOM/CSS）语境请用 rgba(var(--kp-accent-rgb), α)。
 */
export function KP_ACCENT_RGBA(alpha: number): string {
  return `rgba(53, 197, 255, ${alpha})`
}

// ============================================================
// 3D 场景配色「单一真源」（THREE / WebGL 无法解析 CSS var()，集中此处）
// 与 design-tokens.css 对齐：能映射到 --kp-* token 的注明对应 token；否则保留项目既有 3D 视觉值。
// P0 铁律：组件文件内禁止再写这些色值字面量，统一从这里引用（参考 A-2 解决 #00e5ff 散落的同款机制）。
// ============================================================

// —— 场景背景（深蓝，对应 --kp-bg-deep 视觉同类）——
export const KP_SCENE_BG = '#04101f'

// —— 区域标记 选中 / 悬浮（琥珀，对应 --kp-warn 语义）——
export const KP_AREA_SELECTED = '#ffd60a'
export const KP_AREA_HOVER = '#ffe066'

// —— 楼栋悬浮高亮（绿，对应 --kp-success 语义）——
export const KP_BUILDING_HOVER = '#34d399'

// —— 楼栋盒体填充（钢蓝，对应 --kp-panel-fill 视觉同类）——
export const KP_BUILDING_FILL = '#0d3346'

// —— 告警红（对应 --kp-danger 语义）——
export const KP_ALERT = '#ff4d5e'

// —— 设备 / 区域兜底青（3D sprite/点无数据色时的兜底；THREE.Sprite 文本类无法用 var()）——
export const KP_FALLBACK_CYAN = '#00ccff'

// —— 主光辅助青（对应 --kp-accent-secondary）——
export const KP_LIGHT_SECONDARY = 0x1be5ad

// —— 半球光天 / 地色 ——
export const KP_HEMI_SKY = 0x0b2a3a
export const KP_HEMI_GROUND = 0x04101f

// —— 地面材质色 ——
export const KP_GROUND = 0x06121f

// —— 选中环（原 0x00e5ff 历史残留，收敛到 --kp-accent #35C5FF）——
export const KP_SELECT_RING = KP_ACCENT

// —— 楼栋调色板（3D 设备点按楼栋索引回退色；与 --kp-sys-* 同类，保持既有视觉值）——
export const KP_SCENE_PALETTE: number[] = [
  0x00e5ff, 0x1be5ad, 0xf59e0b, 0x3b82f6, 0xfb923c, 0xf43f5e, 0x94a3b8,
]

// —— 子系统着色（3D 设备点按 subsystem code 着色；保持既有视觉值）——
export const KP_SUBSYS_HEX: Record<string, string> = {
  regulation: '#36cfc9',
  lifecycle: '#4e9bff',
  hvac: '#13c2c2',
  lighting: '#ffc53d',
  power: '#ff7a45',
  hotwater: '#40a9ff',
  elevator: '#73d13d',
}

// —— 楼栋显示 DIY · 3D 编辑器（BuildingDisplay3D）专用配色 ——
export const KP_MDED_HEMI_SKY = 0xc0d6ff
export const KP_MDED_HEMI_GROUND = 0x1a2a44
export const KP_MDED_GRID_A = 0x1f4060
export const KP_MDED_GRID_B = 0x112845
export const KP_MDED_INACTIVE = 0x555555
export const KP_MDED_BUILDING = 0x4ea8de
export const KP_MDED_LINE_SEL = 0xffffff
export const KP_MDED_LINE = 0x88c0ff
// 区域描边顶点色（与 MarkerEditor3D 描边共用）
export const KP_DRAW_VERTEX = 0x33ff99

// —— 标记编辑器（MarkerEditor3D）专用配色 ——
export const KP_MARKER_BG = 0x0a1929
export const KP_MARKER_GRID_A = 0x1a3a5a
export const KP_MARKER_GRID_B = 0x0d2238
export const KP_MARKER_EMISSIVE = 0x00ff88

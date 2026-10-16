import type { BigscreenBox, BigscreenLayoutEntry, BigscreenLayoutMap, FrameStyle } from '@/types/api'

// 大屏布局 DIY 前端库：17 框 key/标签、8 种框型、默认布局、合并、坐标换算。
// 与后端 bigscreen-layout.service.ts 的默认几何保持一致（1920x1080 设计空间）。

export const DESIGN_W = 1920
export const DESIGN_H = 1080

// 17 个数据框（与后端 BOX_KEYS 顺序一致）
export const BOX_KEYS: string[] = [
  'left-alarm',
  'right-hvac',
  'right-power',
  'right-temp-trend',
  'right-voltage',
  'right-humidity',
  'right-load-trend',
  'right-energy',
  'right-elevator',
  'right-energy-trend',
  'right-online',
  'bottom-source',
  'bottom-category-trend',
  'bottom-status',
  'bottom-response',
  'bottom-dept-alarm',
  'bottom-traffic-trend',
]

export const BOX_LABELS: Record<string, string> = {
  'left-alarm': '监控报警',
  'right-hvac': '空调系统',
  'right-power': '供配电',
  'right-temp-trend': '温度趋势',
  'right-voltage': '电压稳定度',
  'right-humidity': '湿度统计',
  'right-load-trend': '负载趋势',
  'right-energy': '能耗统计',
  'right-elevator': '电梯运行',
  'right-energy-trend': '用电趋势',
  'right-online': '设备在线量',
  'bottom-source': '数据来源及更新',
  'bottom-category-trend': '数据分类趋势',
  'bottom-status': '当前状态',
  'bottom-response': '应急响应',
  'bottom-dept-alarm': '系统设备与能耗',
  'bottom-traffic-trend': '楼栋能耗',
}

// 布局框 → 子系统绑定（GK-24：补齐到 7 个子系统全覆盖）。
// 此前 schema 仅 4 个框带 subsystem（right-hvac/power/energy/elevator），
// 导致 lighting/hotwater/lifecycle 聚焦时全盘隐藏、左右 HUD 不随子系统切换数据。
// 现把 17 框全部绑定到 7 个子系统之一（互斥，覆盖完整），绑定口径同时用于：
//   - 前端默认布局兜底（defaultBoxes 的 subsystem 字段）
//   - scene store 的「聚焦隐藏 / 面板数据联动」派生（hudWidgetsResolved 叠加层）
// 默认值仅作兜底；真实优先级：schema hudLayout.widget.subsystem > 本表。
// 说明：left-alarm 为「跨子系统通配」框（显示当前子系统告警），不在此静态绑定，
//       其 subsystem 在 scene store 中随 activeSubsystem 动态解析。
export const BOX_SUBSYSTEM_MAP: Record<string, string> = {
  // 左：监控报警（通配，运行时绑定当前子系统）
  // right 列
  'right-hvac': 'hvac',
  'right-temp-trend': 'hvac',
  'right-humidity': 'hvac',
  'right-power': 'power',
  'right-voltage': 'power',
  'right-load-trend': 'power',
  'right-online': 'power',
  'right-elevator': 'elevator',
  'right-energy-trend': 'elevator',
  'right-energy': 'regulation',
  // bottom 列
  'bottom-source': 'regulation',
  'bottom-status': 'regulation',
  'bottom-response': 'regulation',
  'bottom-category-trend': 'lighting',
  'bottom-traffic-trend': 'hotwater',
  'bottom-dept-alarm': 'lifecycle',
}

// 7 个子系统 code（与项目内定一致），供面板/测试引用
export const SUBSYSTEM_CODES: string[] = [
  'regulation',
  'lifecycle',
  'hvac',
  'lighting',
  'power',
  'hotwater',
  'elevator',
]

// 8 种框型
export const FRAME_KEYS: FrameStyle[] = [
  'tech',
  'wave',
  'tree',
  'rounded',
  'bevel',
  'double',
  'glow',
  'grid',
]

export const FRAME_LABELS: Record<FrameStyle, string> = {
  tech: '直角科技框',
  wave: '波浪边角框',
  tree: '树状分支框',
  rounded: '圆角极简框',
  bevel: '斜切角框',
  double: '双线框',
  glow: '发光描边框',
  grid: '虚线网格框',
}

// 默认布局：复刻现有 CSS 网格几何（顶部 110 标题、底部 150、左 300、右 520，间距 10）
function defaultBoxes(): Record<string, BigscreenBox> {
  const G = 10
  const HEADER_H = 110
  const TOP = HEADER_H + G
  const BOTTOM_H = 150
  const BOTTOM_Y = DESIGN_H - BOTTOM_H - G
  const LEFT_W = 300
  const RIGHT_W = 520
  const RIGHT_X = DESIGN_W - RIGHT_W - G
  const MID_H = BOTTOM_Y - TOP - G

  const boxes: Record<string, BigscreenBox> = {}
  const mk = (key: string, x: number, y: number, w: number, h: number) => {
    boxes[key] = { key, x, y, w, h, frame: 'tech', subsystem: BOX_SUBSYSTEM_MAP[key] }
  }

  mk('left-alarm', G, TOP, LEFT_W, MID_H)

  const colW = (RIGHT_W - G) / 2
  const rowH = (MID_H - 4 * G) / 5
  const rightOrder = [
    'right-hvac',
    'right-power',
    'right-temp-trend',
    'right-voltage',
    'right-humidity',
    'right-load-trend',
    'right-energy',
    'right-elevator',
    'right-energy-trend',
    'right-online',
  ]
  rightOrder.forEach((k, i) => {
    const c = i % 2
    const r = Math.floor(i / 2)
    mk(k, RIGHT_X + c * (colW + G), TOP + r * (rowH + G), colW, rowH)
  })

  const bw = (DESIGN_W - 2 * G - 5 * G) / 6
  const bottomOrder = [
    'bottom-source',
    'bottom-category-trend',
    'bottom-status',
    'bottom-response',
    'bottom-dept-alarm',
    'bottom-traffic-trend',
  ]
  bottomOrder.forEach((k, i) => mk(k, G + i * (bw + G), BOTTOM_Y, bw, BOTTOM_H))

  // Phase 3：数据来源框（bottom-source）默认绑定实时通道并支持楼层钻取
  boxes['bottom-source'].data_source = 'realtime'
  boxes['bottom-source'].drill = 'floor'

  return boxes
}

export function defaultLayout(): BigscreenLayoutEntry {
  return { boxes: defaultBoxes() }
}

// 与后端默认值合并（后端已合并，此处为后端不可达兜底，保证大屏永不空屏）
export function mergeLayout(system: string, map?: BigscreenLayoutMap): BigscreenLayoutEntry {
  const base = defaultBoxes()
  const stored = map?.[system]?.boxes || {}
  const boxes: Record<string, BigscreenBox> = {}
  for (const key of BOX_KEYS) {
    const d = base[key]
    const s = stored[key]
    if (s) {
      // 修复：mergeLayout 此前只复制 x/y/w/h/frame/subsystem，丢弃了 title/titleSize/titleColor/borderColor，
      // 导致后台大屏布局 DIY 修改「框框名称/标题字号/标题颜色/边框颜色」后大屏不生效。
      boxes[key] = {
        key,
        x: clamp(s.x ?? d.x, 0, DESIGN_W),
        y: clamp(s.y ?? d.y, 0, DESIGN_H),
        w: clamp(s.w ?? d.w, 40, DESIGN_W),
        h: clamp(s.h ?? d.h, 40, DESIGN_H),
        frame: s.frame || d.frame || 'tech',
        subsystem: s.subsystem || d.subsystem,
        // 后台 DIY 自定义：仅在显式设置时复制（undefined/falsy 即回退默认）
        title: s.title || undefined,
        titleEn: s.titleEn || undefined,
        titleSize: typeof s.titleSize === 'number' ? s.titleSize : undefined,
        titleColor: s.titleColor || undefined,
        borderColor: s.borderColor || undefined,
        innerBorderColor: s.innerBorderColor || undefined,
        innerLineColor: s.innerLineColor || undefined,
        // 数据来源 + 钻取（Phase 3）：仅在显式设置时复制
        data_source: s.data_source || undefined,
        drill: s.drill || undefined,
      }
    } else {
      boxes[key] = d
    }
  }
  return { boxes }
}

// 设计空间坐标 → 百分比（相对全屏绝对定位层）
export function boxToPercent(box: BigscreenBox): Record<string, string> {
  return {
    left: `${(box.x / DESIGN_W) * 100}%`,
    top: `${(box.y / DESIGN_H) * 100}%`,
    width: `${(box.w / DESIGN_W) * 100}%`,
    height: `${(box.h / DESIGN_H) * 100}%`,
  }
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}

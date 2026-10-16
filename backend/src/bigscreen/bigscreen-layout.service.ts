import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { SUBSYSTEMS } from '../common/constants/catalog'

// 大屏布局配置：按「系统」维度独立保存（overview = 全院综合态势；其余 7 个子系统各一套）。
// 存储为单文档 data/bigscreen-layout.json：{ systems: { [key]: { boxes: { [boxKey]: BigscreenBox } } } }。
// 坐标基于 1920x1080 设计空间（前端按百分比映射到任意屏），与样式配置、面板数据三者相互独立。

export type FrameStyle =
  | 'tech' // 直角科技框
  | 'wave' // 波浪边角框
  | 'tree' // 树状分支框
  | 'rounded' // 圆角极简框
  | 'bevel' // 斜切角框
  | 'double' // 双线框
  | 'glow' // 发光描边框
  | 'grid' // 虚线网格框

export interface BigscreenBox {
  key: string
  x: number // 设计空间 px（基准 1920）
  y: number // 设计空间 px（基准 1080）
  w: number
  h: number
  frame: FrameStyle
  // 后台 DIY 名称与显示样式（可选）
  title?: string
  titleEn?: string
  titleSize?: number
  titleColor?: string
  borderColor?: string
  // 框内描边色 / 框内分隔线色（DIY，与前端 PanelCard 的 --box-inner-border/--box-inner-line 对应）
  innerBorderColor?: string
  innerLineColor?: string
  // 绑定的子系统（可选）：绑定后默认标题跟随「子系统菜单」自定义名称
  subsystem?: string
}

export interface BigscreenLayoutEntry {
  boxes: Record<string, BigscreenBox>
}

export type BigscreenLayoutMap = Record<string, Partial<BigscreenLayoutEntry>>

export const DESIGN_W = 1920
export const DESIGN_H = 1080

// 17 个数据框（与前端 lib/bigscreen-layout.ts 的 BOX_KEYS 保持一致）
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

const VALID_FRAMES: FrameStyle[] = ['tech', 'wave', 'tree', 'rounded', 'bevel', 'double', 'glow', 'grid']

// 默认布局：复刻现有 CSS 网格几何（顶部预留 110 标题、底部 150、左 300、右 520，间距 10）
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
    boxes[key] = { key, x, y, w, h, frame: 'tech' }
  }

  // 左列 1 个
  mk('left-alarm', G, TOP, LEFT_W, MID_H)

  // 右列 10 个：2 列 × 5 行
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

  // 底部 6 个：1 × 6
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

  return boxes
}

export function defaultLayout(): BigscreenLayoutEntry {
  return { boxes: defaultBoxes() }
}

const LAYOUT_PATH = path.resolve(process.cwd(), 'data', 'bigscreen-layout.json')

@Injectable()
export class BigscreenLayoutService {
  private readDoc(): { systems: BigscreenLayoutMap } {
    try {
      if (fs.existsSync(LAYOUT_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf-8'))
        if (parsed && typeof parsed === 'object' && parsed.systems) {
          return parsed as { systems: BigscreenLayoutMap }
        }
      }
    } catch {
      // 文件损坏则回退默认
    }
    return { systems: {} }
  }

  private writeDoc(doc: { systems: BigscreenLayoutMap }): void {
    try {
      fs.mkdirSync(path.dirname(LAYOUT_PATH), { recursive: true })
      fs.writeFileSync(LAYOUT_PATH, JSON.stringify(doc, null, 2), 'utf-8')
    } catch {
      // 落盘失败不影响内存读写（演示容错）
    }
  }

  // 返回合并默认值的完整布局（前端可直接套用）
  getLayout(system: string): BigscreenLayoutEntry {
    const doc = this.readDoc()
    const stored = (doc.systems[system] || {}).boxes || {}
    const base = defaultBoxes()
    const boxes: Record<string, BigscreenBox> = {}
    // 以默认 17 框为骨架，叠加已保存的覆盖项
    for (const key of BOX_KEYS) {
      const d = base[key]
      const s = stored[key]
      boxes[key] = s
        ? {
            key,
            x: clamp(s.x ?? d.x, 0, DESIGN_W),
            y: clamp(s.y ?? d.y, 0, DESIGN_H),
            w: clamp(s.w ?? d.w, 40, DESIGN_W),
            h: clamp(s.h ?? d.h, 40, DESIGN_H),
            frame: VALID_FRAMES.includes(s.frame as FrameStyle) ? (s.frame as FrameStyle) : 'tech',
            ...(s.title ? { title: String(s.title) } : {}),
            ...(s.titleEn ? { titleEn: String(s.titleEn) } : {}),
            ...(typeof s.titleSize === 'number' && s.titleSize > 0 ? { titleSize: s.titleSize } : {}),
            ...(s.titleColor ? { titleColor: String(s.titleColor) } : {}),
            ...(s.borderColor ? { borderColor: String(s.borderColor) } : {}),
            ...(s.innerBorderColor ? { innerBorderColor: String(s.innerBorderColor) } : {}),
            ...(s.innerLineColor ? { innerLineColor: String(s.innerLineColor) } : {}),
            ...(s.subsystem ? { subsystem: String(s.subsystem) } : {}),
          }
        : d
    }
    return { boxes }
  }

  getAllLayouts(): BigscreenLayoutMap {
    return this.readDoc().systems
  }

  // B7 修复：重置单系统大屏布局为默认（移除已保存项，回落 defaultBoxes）。
  resetLayout(system: string): BigscreenLayoutEntry {
    const doc = this.readDoc()
    if (doc.systems[system]) {
      delete doc.systems[system]
      this.writeDoc(doc)
    }
    return this.getLayout(system)
  }

  // 保存：全量覆盖该 system 的布局（前端传完整 boxes）
  saveLayout(system: string, entry: BigscreenLayoutEntry): BigscreenLayoutEntry {
    const doc = this.readDoc()
    const boxes: Record<string, BigscreenBox> = {}
    const src = entry?.boxes || {}
    for (const key of BOX_KEYS) {
      const s = src[key]
      if (!s) continue
      boxes[key] = {
        key,
        x: clamp(Number(s.x) || 0, 0, DESIGN_W),
        y: clamp(Number(s.y) || 0, 0, DESIGN_H),
        w: clamp(Number(s.w) || 40, 40, DESIGN_W),
        h: clamp(Number(s.h) || 40, 40, DESIGN_H),
        frame: VALID_FRAMES.includes(s.frame as FrameStyle) ? (s.frame as FrameStyle) : 'tech',
        // 后台 DIY 名称与显示样式（透传，空值省略）
        ...(s.title ? { title: String(s.title) } : {}),
        ...(s.titleEn ? { titleEn: String(s.titleEn) } : {}),
        ...(typeof s.titleSize === 'number' && s.titleSize > 0 ? { titleSize: s.titleSize } : {}),
        ...(s.titleColor ? { titleColor: String(s.titleColor) } : {}),
        ...(s.borderColor ? { borderColor: String(s.borderColor) } : {}),
        ...(s.innerBorderColor ? { innerBorderColor: String(s.innerBorderColor) } : {}),
        ...(s.innerLineColor ? { innerLineColor: String(s.innerLineColor) } : {}),
        ...(s.subsystem ? { subsystem: String(s.subsystem) } : {}),
      }
    }
    doc.systems[system] = { boxes }
    this.writeDoc(doc)
    return this.getLayout(system)
  }
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}

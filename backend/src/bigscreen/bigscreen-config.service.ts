import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { SUBSYSTEMS } from '../common/constants/catalog'

// 大屏样式配置：按「系统」维度独立保存（overview = 全院综合态势；其余 7 个子系统各一套）。
// 存储为单文档 data/bigscreen-config.json：{ systems: { [key]: { title, titleFontSize, style } } }。
// 读取时与默认值合并，前端可直接套用。后端不可达时前端也有内置默认，保证大屏永不空屏。

export interface HeaderModulePos {
  row: 1 | 2 | 3 // 所在行（从 1 起）
  slot: 'left' | 'center' | 'right' // 行内水平停靠位
}

export interface BigscreenHeaderLayout {
  rows: 1 | 2 | 3 // 顶部布局行数
  platform: HeaderModulePos // 系统平台名称
  clock: HeaderModulePos // 实时时钟
  tabs: HeaderModulePos // 子系统菜单
  tools: HeaderModulePos // 工具组（主题/消防/用户）
  clockSingleLine: boolean // 时间单行显示；false=换行（上下两行）
}

export interface BigscreenStyle {
  accent: string // 主题强调色（影响边框/辉光/焦点环）
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
  title: string
  titleEn?: string
  titleFontSize: number
  style: BigscreenStyle
}

export type BigscreenConfigMap = Record<string, Partial<BigscreenConfigEntry>>

export const OVERVIEW_KEY = 'overview'

export const DEFAULT_HEADER_LAYOUT: BigscreenHeaderLayout = {
  rows: 1,
  platform: { row: 1, slot: 'left' },
  clock: { row: 1, slot: 'right' },
  tabs: { row: 1, slot: 'center' },
  tools: { row: 1, slot: 'right' },
  clockSingleLine: false,
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

function defaultTitle(system: string): string {
  if (system === OVERVIEW_KEY) return '开平市中心医院能源管理平台'
  const def = SUBSYSTEMS.find((s) => s.code === system)
  return def ? def.name : system
}

export function defaultEntry(system: string): BigscreenConfigEntry {
  return { title: defaultTitle(system), titleFontSize: 30, style: { ...DEFAULT_STYLE } }
}

const CONFIG_PATH = path.resolve(process.cwd(), 'data', 'bigscreen-config.json')

@Injectable()
export class BigscreenConfigService {
  private readDoc(): { systems: BigscreenConfigMap } {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
        if (parsed && typeof parsed === 'object' && parsed.systems) {
          return parsed as { systems: BigscreenConfigMap }
        }
      }
    } catch {
      // 文件损坏则回退默认
    }
    return { systems: {} }
  }

  private writeDoc(doc: { systems: BigscreenConfigMap }): void {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(doc, null, 2), 'utf-8')
    } catch {
      // 落盘失败不影响内存读写（演示容错）
    }
  }

  // 合并 header（兼容旧版字符串位置格式：platform/clock/tabs 直接是 'left'|'center'|'right'）
  private mergeHeader(stored?: Partial<BigscreenHeaderLayout>): BigscreenHeaderLayout {
    const base = DEFAULT_HEADER_LAYOUT
    if (!stored) {
      return {
        rows: base.rows,
        platform: { ...base.platform },
        clock: { ...base.clock },
        tabs: { ...base.tabs },
        tools: { ...base.tools },
        clockSingleLine: base.clockSingleLine,
      }
    }
    const toPos = (v: unknown, fallback: 'left' | 'center' | 'right'): HeaderModulePos => {
      if (v && typeof v === 'object' && 'slot' in (v as object)) return v as HeaderModulePos
      const ok = v === 'left' || v === 'center' || v === 'right'
      return { row: 1, slot: ok ? (v as 'left' | 'center' | 'right') : fallback }
    }
    return {
      rows: stored.rows === 1 || stored.rows === 2 || stored.rows === 3 ? stored.rows : base.rows,
      platform: toPos(stored.platform, 'left'),
      clock: toPos(stored.clock, 'right'),
      tabs: toPos(stored.tabs, 'center'),
      tools: toPos(stored.tools, 'right'),
      clockSingleLine: stored.clockSingleLine ?? base.clockSingleLine,
    }
  }

  // 返回合并默认值的完整配置（前端可直接套用）
  getConfig(system: string): BigscreenConfigEntry {
    const doc = this.readDoc()
    const stored = doc.systems[system] || {}
    const base = defaultEntry(system)
    return {
      title: stored.title ?? base.title,
      titleEn: stored.titleEn ?? undefined,
      titleFontSize: stored.titleFontSize ?? base.titleFontSize,
      style: {
        ...base.style,
        ...(stored.style || {}),
        // header 为嵌套对象，需深合并，避免旧数据缺子字段时整体覆盖
        header: this.mergeHeader(stored.style && stored.style.header),
      },
    }
  }

  // B7 修复：重置单系统大屏样式为默认（移除已保存项，回落 defaultEntry）。
  resetConfig(system: string): BigscreenConfigEntry {
    const doc = this.readDoc()
    if (doc.systems[system]) {
      delete doc.systems[system]
      this.writeDoc(doc)
    }
    return this.getConfig(system)
  }

  // 返回全部已保存（可能不完整的）配置映射，供后台编辑器列表明细
  getAllConfigs(): BigscreenConfigMap {
    return this.readDoc().systems
  }

  // 保存：全量覆盖该 system 的 entry（前端传完整 entry，含默认值）
  saveConfig(system: string, entry: BigscreenConfigEntry): BigscreenConfigEntry {
    const doc = this.readDoc()
    doc.systems[system] = {
      title: entry.title,
      titleEn: entry.titleEn || undefined,
      titleFontSize: entry.titleFontSize,
      style: { ...entry.style },
    }
    this.writeDoc(doc)
    return this.getConfig(system)
  }
}

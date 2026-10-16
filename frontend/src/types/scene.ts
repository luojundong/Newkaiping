import type { SubsystemCode } from './api'

// 子系统静态注册表（图标来自 lucide-vue-next，名称与颜色来自 design-tokens）
export interface SubsystemMeta {
  code: SubsystemCode
  name: string
  nameEn: string
  lucide: string // lucide-vue-next 导出名
  colorVar: string // --kp-sys-* CSS 变量
  num?: string // 参考页 S 序号（S1–S7），用于「综合概述七大系统」编号展示
}

// 7 大子系统 + 综合概览（Overview）
// 名称与参考页 D:\NewPrSz\bigscreen-portable\index.html 图1 S1–S7 面板逐字对齐（数字名称单一真相源）。
export const SUBSYSTEMS: SubsystemMeta[] = [
  { code: 'regulation', name: '智慧能源一体化调控', nameEn: 'Smart Energy Integration', lucide: 'Gauge', colorVar: '--kp-sys-energy', num: 'S1' },
  { code: 'lifecycle', name: '设备生命周期管理', nameEn: 'Lifecycle Management', lucide: 'ClipboardList', colorVar: '--kp-sys-lifecycle', num: 'S2' },
  { code: 'hvac', name: '空调集中控制调度', nameEn: 'HVAC Central Control', lucide: 'Fan', colorVar: '--kp-sys-hvac', num: 'S3' },
  { code: 'lighting', name: '智慧照明管理', nameEn: 'Smart Lighting', lucide: 'Lightbulb', colorVar: '--kp-sys-lighting', num: 'S4' },
  { code: 'power', name: '医院电力监控', nameEn: 'Hospital Power Monitor', lucide: 'Zap', colorVar: '--kp-sys-power', num: 'S5' },
  { code: 'hotwater', name: '热水集中控制调度', nameEn: 'Hot Water Scheduling', lucide: 'Droplet', colorVar: '--kp-sys-water', num: 'S6' },
  { code: 'elevator', name: '电梯节能管理', nameEn: 'Elevator Energy Saving', lucide: 'MoveVertical', colorVar: '--kp-sys-elevator', num: 'S7' },
]

export const OVERVIEW_META = {
  code: 'overview' as const,
  name: '综合概览',
  nameEn: 'Overview',
  lucide: 'LayoutDashboard',
  colorVar: '--kp-accent',
}

// 楼栋静态元数据（选择器标签 + 3D 局部坐标锚点）。
// 真实建筑列表由 /api/v1/buildings 提供；此处为展示标签与本地坐标 fallback。
// 锚点为模型局部坐标（ADR-001，非经纬度），按 10 栋楼网格合理分布。
export interface BuildingMeta {
  code: string
  shortName: string
  anchor: [number, number, number]
}

const ANCHORS: [number, number, number][] = [
  [-60, 0, -40],
  [-40, 0, -10],
  [-20, 0, 20],
  [0, 0, -40],
  [20, 0, -10],
  [40, 0, 20],
  [60, 0, -30],
  [80, 0, 0],
  [100, 0, 30],
  [120, 0, -20],
]

export const BUILDING_META: BuildingMeta[] = [
  { code: 'B01', shortName: '1号楼·120急救', anchor: ANCHORS[0] },
  { code: 'B02', shortName: '2号楼·门诊', anchor: ANCHORS[1] },
  { code: 'B03', shortName: '3号楼·住院', anchor: ANCHORS[2] },
  { code: 'B04', shortName: '4号楼·医技', anchor: ANCHORS[3] },
  { code: 'B05', shortName: '5号楼·急诊', anchor: ANCHORS[4] },
  { code: 'B06', shortName: '6号楼·行政', anchor: ANCHORS[5] },
  { code: 'B07', shortName: '7号楼·后勤', anchor: ANCHORS[6] },
  { code: 'B08', shortName: '8号楼·食堂', anchor: ANCHORS[7] },
  { code: 'B09', shortName: '9号楼·科研', anchor: ANCHORS[8] },
  { code: 'B10', shortName: '10号楼·宿舍', anchor: ANCHORS[9] },
]

export function getBuildingMeta(code: string): BuildingMeta | undefined {
  return BUILDING_META.find((b) => b.code === code)
}

export function getSubsystemMeta(code: string): SubsystemMeta | undefined {
  return SUBSYSTEMS.find((s) => s.code === code)
}

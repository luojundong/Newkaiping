/**
 * 大屏 7 屏元数据（参考页 index.html 顶栏 .ntab L473-479 一字不差复刻）
 *
 * 产品决策（用户确认）：
 * - 顶栏 = 参考页的 7 屏（图1 主驾驶舱 … 图7 建筑面积表），**不再是** 8 个子系统 tab。
 * - 7 个子系统「降为下钻」：图1 内的 S1–S7 悬浮面板即子系统摘要卡，点卡片下钻进对应详情屏，
 *   面板标题继续读后台自定义名（scene.subsystemName）与显隐开关（scene.visibleSubsystemCodes）。
 *
 * 参考页对应关系（section#scr1..#scr7）：
 *   scr1 主驾驶舱      → 全屏 3D + 悬浮 S1–S7 + 楼栋导航 + 天气/时间
 *   scr2 空调与能源    → HVAC & ENERGY CONTROL
 *   scr3 电梯安全      → ELEVATOR SAFETY
 *   scr4 供配电计量    → POWER & METERING
 *   scr5 告警工单      → ALARM & WORK ORDER
 *   scr6 空间设备运维  → SPACE & ASSET OPS
 *   scr7 建筑面积表    → AUTHORITATIVE GROSS AREA
 */

/** 屏编号 1..7，与参考页 #scr1..#scr7 / data-s="1..7" 对齐 */
export type ScreenNo = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface ScreenMeta {
  /** 屏号（1..7） */
  no: ScreenNo
  /** 顶栏序号徽标文案（参考页 .ni：图1/图2/…） */
  badge: string
  /** 顶栏 tab 文案（参考页 .ntab 正文，一字不差） */
  tab: string
  /** 屏内大标题（参考页 .shead .st；图1 用 #w_title h1） */
  title: string
  /** 屏内英文副标题（参考页 .shead .ss；图1 用 #w_title .sub） */
  titleEn: string
  /**
   * 该屏「主责子系统」code —— 用于图1 的 S 卡下钻映射与场景相机联动。
   * null = 该屏不绑定单一子系统（图1 总览 / 图5 跨系统告警 / 图7 建筑档案）。
   */
  subsystem: string | null
}

/** 7 屏定义（顺序即顶栏顺序，禁止乱序） */
export const SCREENS: ScreenMeta[] = [
  {
    no: 1,
    badge: '图1',
    tab: '主驾驶舱',
    title: '开平市中心医院数字孪生驾驶舱',
    titleEn: 'KAIPING CENTRAL HOSPITAL DIGITAL TWIN OPERATION CENTER',
    subsystem: null,
  },
  {
    no: 2,
    badge: '图2',
    tab: '空调与能源',
    title: '空调与能源管控驾驶舱',
    titleEn: 'HVAC & ENERGY CONTROL',
    subsystem: 'hvac',
  },
  {
    no: 3,
    badge: '图3',
    tab: '电梯安全',
    title: '电梯安全运行驾驶舱',
    titleEn: 'ELEVATOR SAFETY',
    subsystem: 'elevator',
  },
  {
    no: 4,
    badge: '图4',
    tab: '供配电计量',
    title: '供配电与计量驾驶舱',
    titleEn: 'POWER & METERING',
    subsystem: 'power',
  },
  {
    no: 5,
    badge: '图5',
    tab: '告警工单',
    title: '告警工单驾驶舱',
    titleEn: 'ALARM & WORK ORDER',
    subsystem: null,
  },
  {
    no: 6,
    badge: '图6',
    tab: '空间设备运维',
    title: '空间设备运维驾驶舱',
    titleEn: 'SPACE & ASSET OPS',
    subsystem: 'lifecycle',
  },
  {
    no: 7,
    badge: '图7',
    tab: '建筑面积表',
    title: '权威建筑面积表',
    titleEn: 'AUTHORITATIVE GROSS AREA',
    subsystem: null,
  },
]

export function screenMeta(no: ScreenNo): ScreenMeta {
  return SCREENS.find((s) => s.no === no) ?? SCREENS[0]
}

/**
 * 子系统 code → 下钻目标屏号。
 * 图1 的 S1–S7 卡片点击后进入该屏（用户决策：「点面板下钻进该子系统详情屏」）。
 * 未单独成屏的子系统（regulation 调控 / lighting 照明 / hotwater 热水）归口到语义最近的屏：
 *   regulation 智慧能源一体化调控 → 图2（空调与能源，含能效/能耗结构）
 *   lighting   智慧照明管理       → 图4（供配电计量，照明回路计量在配电侧）
 *   hotwater   热水集中控制调度   → 图2（空调与能源，同属冷热源能源站）
 */
export const SUBSYSTEM_SCREEN: Record<string, ScreenNo> = {
  regulation: 2,
  lifecycle: 6,
  hvac: 2,
  lighting: 4,
  power: 4,
  hotwater: 2,
  elevator: 3,
}

/**
 * 图1 S1–S7 悬浮卡定义（参考页 L511-518）。
 * order = 参考页 S 序号；code = 项目子系统 code；title 为参考页原文（运行时优先用后台自定义名）。
 * col/slot 决定几何：左列 4 张（pL1..pL4，h212），右列 3 张（p192/p488/p784，h288）。
 */
export interface HeroCard {
  order: number
  code: string
  /** 参考页面板标题（后台未自定义时的回退文案） */
  refTitle: string
  col: 'l' | 'r'
  /** 几何 class（配合 bigscreen-stage.css） */
  slot: string
}

export const HERO_CARDS: HeroCard[] = [
  { order: 1, code: 'regulation', refTitle: '智慧能源一体化调控', col: 'l', slot: 'pL1 h212' },
  { order: 2, code: 'lifecycle', refTitle: '设备生命周期管理', col: 'l', slot: 'pL2 h212' },
  { order: 3, code: 'hvac', refTitle: '空调集中控制调度', col: 'l', slot: 'pL3 h212' },
  { order: 4, code: 'lighting', refTitle: '智慧照明管理', col: 'l', slot: 'pL4 h212' },
  { order: 5, code: 'power', refTitle: '医院电力监控', col: 'r', slot: 'p192 h288' },
  { order: 6, code: 'hotwater', refTitle: '热水集中控制调度', col: 'r', slot: 'p488 h288' },
  { order: 7, code: 'elevator', refTitle: '电梯节能管理', col: 'r', slot: 'p784 h288' },
]

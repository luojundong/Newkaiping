/**
 * 大屏示意数据集（参考页 MOCK / S2–S6 / DEV_CLASSES 的 1:1 迁移，L4295-4441）
 *
 * ★ 合规声明（GMP / 21 CFR Part 11 / EU Annex 11）：
 *   本文件全部为**示意值（DEMO）**，不得冒充实测。消费方必须：
 *   1) 顶栏挂 useDataMode() 的「演示数据 DEMO DATA」徽章；
 *   2) 所有数值经 useDataMode().v() 包装（empty 模式一律输出 '--'）；
 *   3) 屏底常驻脚注列出示意指标范围。
 *   真实数据（楼栋台账 / 层数 / 建筑面积 / 设备档案）一律走 scene store 与后端接口，
 *   **不在本文件内**（参考页 BUILDINGS 已回填至 backend/data/runtime.json）。
 *
 * 颜色一律引用 lib/bigscreen-palette.ts 的 SERIES（token 字符串），零硬编码。
 */

import { SERIES } from './bigscreen-palette'

/* ---------------- 全院总量（参考页 DEV_TOTAL / AREA_TOTAL / MOCK） ---------------- */

/** 已核建筑面积合计（m²）—— 与 runtime.json 已核 8 栋一致 */
export const AREA_TOTAL = 117245.22
/** 已核栋数 */
export const AREA_VERIFIED = 8
/** 设备台账总数（真实档案口径） */
export const DEV_TOTAL = 1701

/** 设备分类台账（真实档案口径，颜色为展示用） */
export const DEV_CLASSES = [
  { cn: '分体机', n: 1626, c: SERIES.cyan },
  { cn: '多联机', n: 35, c: SERIES.blue },
  { cn: '热泵', n: 20, c: SERIES.green },
  { cn: '螺杆机', n: 10, c: SERIES.amber },
  { cn: '风冷模块', n: 8, c: SERIES.teal },
  { cn: '水泵', n: 8, c: SERIES.red },
  { cn: '冷却塔', n: 2, c: SERIES.dim },
]

/** 楼栋设备分类明细（参考页 BUILDINGS[].dev，顺序同 DEV_KEYS），key = 楼栋序号 */
export const DEV_KEYS = ['SPL', 'CHILLER', 'VRF', 'HP', 'PUMP', 'CT'] as const
export const DEV_CN: Record<string, string> = {
  SPL: '分体机',
  CHILLER: '螺杆机',
  VRF: '多联机',
  HP: '热泵',
  PUMP: '水泵',
  CT: '冷却塔',
}
export const BUILDING_DEV: Record<number, number[]> = {
  1: [66, 2, 2, 1, 2, 2],
  2: [62, 0, 2, 0, 0, 0],
  3: [690, 2, 0, 6, 0, 0],
  4: [236, 4, 23, 4, 3, 0],
  5: [126, 0, 8, 0, 0, 0],
  6: [62, 0, 0, 0, 0, 0],
  7: [75, 2, 0, 0, 3, 0],
  8: [73, 0, 0, 2, 0, 0],
  9: [200, 0, 0, 4, 0, 0],
  10: [36, 0, 0, 3, 0, 0],
}

/* ---------------- 图1 主驾驶舱示意值（参考页 MOCK） ---------------- */
export const MOCK = {
  online: 1667,
  offline: 26,
  alarm: 8,
  power: 18542,
  water: 1257,
  cooling: 6320,
  alarmUrgent: 12,
  alarmMajor: 36,
  alarmMinor: 98,
  woTodo: 28,
  woDoing: 56,
  woCheck: 18,
  woDone: 326,
  beds: 1200,
  weather: { txt: '多云', temp: 26, wind: '东南风 2级', hum: 78 },
  days: ['08-30', '08-31', '09-01', '09-02', '09-03', '09-04', '09-05'],
  power7: [17200, 16500, 17900, 16800, 18400, 17600, 18542],
  water7: [1180, 1240, 1210, 1300, 1257, 1190, 1268],
  cool7: [5800, 6100, 5950, 6400, 6320, 6050, 6250],
  alarmU7: [2, 3, 1, 4, 2, 3, 2],
  alarmM7: [6, 5, 4, 7, 5, 4, 5],
  alarmN7: [13, 15, 11, 18, 14, 12, 15],
  woNew7: [42, 38, 51, 47, 44, 39, 46],
  woDone7: [36, 41, 44, 49, 52, 45, 48],
  woOver7: [6, 4, 8, 5, 7, 6, 5],
  runDays: 256,
  sysCount: 62,
  patrolPts: 1245,
  patrolRate: 98,
  woRate: 92,
  carbon: 8.65,
}

/* ---------------- 图2 空调与能源 ---------------- */
export const S2 = {
  euc: 158.6,
  cop: 4.82,
  total: 18542,
  link: [
    { nm: '冷机', n: 2, load: 78, st: 'run' },
    { nm: '冷却塔', n: 2, load: 60, st: 'run' },
    { nm: '冷冻水泵', n: 8, load: 65, st: 'run' },
    { nm: '热泵', n: 20, load: 70, st: 'run' },
  ],
  /** 8×5 分区温度℃（参考页 8x4 命名实为 40 格） */
  zones: [
    26, 25, 24, 27, 28, 26, 25, 24, 23, 24, 25, 26, 27, 25, 24, 23, 22, 23, 24, 25,
    26, 24, 23, 22, 21, 22, 23, 24, 25, 23, 22, 21, 20, 21, 22, 23, 24, 22, 21, 20,
  ],
  faults: [
    { t: '3号楼 冷机1# 出水温度偏高', lv: 'm' },
    { t: '4号楼 VRF 通讯中断', lv: 'u' },
    { t: '8号楼 冷却塔风扇变频故障', lv: 'm' },
    { t: '5号楼 分体机 E5 告警', lv: 'n' },
  ],
  strategy: ['室外温度联动冷水机组台数', '夜间自然冷却优先策略', '新风机组焓值控制', '非高峰时段错峰蓄冷'],
  invCtrl: '逆控已授权 · 2 路下发成功',
  share: [
    { nm: '空调系统', v: 42, c: SERIES.cyan },
    { nm: '照明插座', v: 23, c: SERIES.blue },
    { nm: '动力设备', v: 21, c: SERIES.amber },
    { nm: '其他', v: 14, c: SERIES.weak },
  ],
  rank: [
    { nm: '3号楼', v: 8920 },
    { nm: '4号楼', v: 6210 },
    { nm: '8号楼', v: 4180 },
    { nm: '5号楼', v: 3120 },
    { nm: '2号楼', v: 2860 },
    { nm: '7号楼', v: 1640 },
    { nm: '6号楼', v: 980 },
    { nm: '10号楼', v: 620 },
  ],
  inWater: [7.8, 7.6, 7.9, 8.1, 7.7, 7.5, 7.8],
  outWater: [12.4, 12.1, 12.6, 12.9, 12.3, 12.0, 12.5],
  health: [
    { n: '冷机A', v: '96', s: '良好', c: SERIES.green },
    { n: '冷机B', v: '92', s: '良好', c: SERIES.green },
    { n: '冷却塔1', v: '88', s: '正常', c: SERIES.green },
    { n: '冷冻泵1', v: '90', s: '正常', c: SERIES.green },
    { n: '冷冻泵2', v: '79', s: '关注', c: SERIES.amber },
    { n: '热泵群', v: '85', s: '正常', c: SERIES.green },
  ],
}

/* ---------------- 图3 电梯安全 ---------------- */
export const S3 = {
  total: 32,
  run: 28,
  fault: 2,
  maint: 2,
  elevators: [
    { id: 'DT-01', b: '3号楼', f: 8, st: '运行' },
    { id: 'DT-02', b: '3号楼', f: 3, st: '运行' },
    { id: 'DT-03', b: '3号楼', f: 11, st: '运行' },
    { id: 'DT-04', b: '4号楼', f: 5, st: '故障' },
    { id: 'DT-05', b: '4号楼', f: 9, st: '运行' },
    { id: 'DT-06', b: '4号楼', f: 2, st: '维保' },
    { id: 'DT-07', b: '2号楼', f: 4, st: '运行' },
    { id: 'DT-08', b: '5号楼', f: 6, st: '运行' },
  ],
  faults: [
    { t: '4号楼 DT-04 门锁异常', lv: 'u' },
    { t: '3号楼 DT-03 平层偏差', lv: 'm' },
  ],
  shafts: [
    { id: 'DT-04', f: 5, mx: 13 },
    { id: 'DT-03', f: 11, mx: 13 },
    { id: 'DT-01', f: 8, mx: 12 },
    { id: 'DT-06', f: 2, mx: 13 },
  ],
  maintain: [
    { t: '4号楼 DT-04 半月保', d: '09-08' },
    { t: '3号楼 DT-01 季度保', d: '09-12' },
    { t: '2号楼 DT-07 年度保', d: '09-20' },
    { t: '5号楼 DT-08 半月保', d: '09-10' },
  ],
  runRate: 96.9,
  resp: 5,
  patrol: 92,
  woNew: [6, 4, 7, 5, 6, 4, 5],
  woDone: [5, 4, 6, 5, 6, 4, 5],
  woOver: [1, 0, 1, 1, 0, 1, 0],
  stat: [
    { k: '运行统计', v: '96.9', u: '%', c: 'green' },
    { k: '平均响应', v: '5', u: 'min', c: 'cyan' },
    { k: '巡检完成', v: '92', u: '%', c: 'blue' },
    { k: '本月工单', v: '38', u: '单', c: 'amber' },
  ],
}

/* ---------------- 图4 供配电计量 ---------------- */
export const S4 = {
  lines: 2,
  trans: 2,
  transLoad: [
    { nm: '1#变压器', v: 58 },
    { nm: '2#变压器', v: 66 },
  ],
  feeders: [
    { nm: '住院楼Ⅰ段', st: 'ok' },
    { nm: '住院楼Ⅱ段', st: 'ok' },
    { nm: '门诊楼段', st: 'ok' },
    { nm: '妇儿楼段', st: 'warn' },
    { nm: '后勤段', st: 'ok' },
    { nm: '放疗楼段', st: 'ok' },
  ],
  abnormal: [
    { t: '妇儿楼段 夜间尖峰超容', lv: 'm' },
    { t: '放疗楼 瞬时冲击负荷', lv: 'n' },
  ],
  tree: [
    {
      nm: '院区总计量',
      v: '1,854 kWh',
      ch: [
        { nm: '动力支路', v: '982 kWh', ch: [{ nm: '空调', v: '620 kWh' }, { nm: '医疗', v: '362 kWh' }] },
        { nm: '照明支路', v: '512 kWh', ch: [{ nm: '公共照明', v: '310 kWh' }, { nm: '应急照明', v: '202 kWh' }] },
        { nm: '特殊用电', v: '360 kWh', ch: [{ nm: '手术室', v: '240 kWh' }, { nm: 'ICU', v: '120 kWh' }] },
      ],
    },
  ],
  demand: [1680, 1540, 1720, 1610, 1850, 1760, 1854],
  quality: [
    { nm: '电压偏差', v: 2.1, u: '%', max: 5, st: 'ok' },
    { nm: '频率偏差', v: 0.03, u: 'Hz', max: 0.2, st: 'ok' },
    { nm: '谐波畸变', v: 3.2, u: '%', max: 5, st: 'ok' },
    { nm: '三相不平衡', v: 1.8, u: '%', max: 4, st: 'ok' },
    { nm: '功率因数', v: 0.96, u: '', max: 1, st: 'ok' },
  ],
  rank: [
    { nm: '3号楼', v: 8920 },
    { nm: '4号楼', v: 6210 },
    { nm: '8号楼', v: 4180 },
    { nm: '5号楼', v: 3120 },
    { nm: '2号楼', v: 2860 },
  ],
  structure: [
    { nm: '空调', v: 48, c: SERIES.cyan },
    { nm: '动力', v: 27, c: SERIES.amber },
    { nm: '照明', v: 15, c: SERIES.blue },
    { nm: '医疗', v: 10, c: SERIES.green },
  ],
}

/* ---------------- 图5 告警工单 ---------------- */
export const S5 = {
  urgent: 24,
  major: 38,
  minor: 56,
  alarms: [
    { t: '3号楼 冷机1# 高温', lv: 'u', tm: '09-05 14:22' },
    { t: '4号楼 DT-04 门锁异常', lv: 'u', tm: '09-05 11:08' },
    { t: '5号楼 VRF E5', lv: 'm', tm: '09-05 09:41' },
    { t: '8号楼 冷却塔风扇', lv: 'm', tm: '09-04 22:15' },
    { t: '2号楼 照明回路', lv: 'n', tm: '09-04 18:33' },
  ],
  levelDist: 118,
  funnel: [
    { nm: '告警产生', v: 118 },
    { nm: '自动派单', v: 110 },
    { nm: '现场响应', v: 98 },
    { nm: '处置中', v: 82 },
    { nm: '闭环', v: 76 },
  ],
  resp: [
    { nm: '<5min', v: 62 },
    { nm: '5-15min', v: 34 },
    { nm: '15-30min', v: 18 },
    { nm: '>30min', v: 4 },
  ],
  closedNew: [42, 38, 51, 47, 44, 39, 46],
  closedDone: [36, 41, 44, 49, 52, 45, 48],
  steps: ['告警接入', '智能派单', '现场处置', '审核验收', '闭环归档'],
  team: 48,
}

/* ---------------- 图6 空间设备运维 ---------------- */
export const S6 = {
  routes: [
    { t: '1号楼→3号楼 急诊巡检', d: '每日 2 次' },
    { t: '3号楼 住院层巡检', d: '每日 3 次' },
    { t: '4号楼 妇儿层巡检', d: '每日 2 次' },
    { t: '8号楼 放疗层巡检', d: '每周 5 次' },
  ],
  assets: { total: 1701, located: 1685, rate: 99 },
  health: 92,
  records: [
    { t: '3号楼 冷机保养', d: '09-03' },
    { t: '4号楼 DT-04 维修', d: '09-05' },
    { t: '5号楼 VRF 加氟', d: '09-01' },
    { t: '8号楼 冷却塔清洗', d: '08-29' },
  ],
  locate: [
    { nm: '分体机', v: 1626, c: SERIES.cyan },
    { nm: '多联机', v: 35, c: SERIES.blue },
    { nm: '热泵', v: 20, c: SERIES.green },
    { nm: '螺杆机', v: 10, c: SERIES.amber },
    { nm: '风冷模块', v: 8, c: SERIES.teal },
    { nm: '水泵', v: 8, c: SERIES.red },
    { nm: '冷却塔', v: 2, c: SERIES.dim },
  ],
  alarms: [
    { t: '3号楼 冷机1# 高温', lv: 'u' },
    { t: '4号楼 DT-04 门锁', lv: 'u' },
    { t: '5号楼 VRF E5', lv: 'm' },
  ],
  /** 房间类型循环（图6 空间树叶子标签） */
  roomTypes: ['护士站', '病房', '设备间', '诊室', '药房', 'CT室', '会议室'],
}

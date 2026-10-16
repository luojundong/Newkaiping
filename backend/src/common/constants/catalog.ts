// 子系统目录、设备类别定义与合成指标模板。
// 设备类别来自 ARCHITECTURE.md 第 1.2 节合同台账；指标模板用于 MockConnector 合成时序。

import { SubsystemCode } from '../types';

export interface SubsystemDef {
  code: SubsystemCode;
  name: string;
  icon: string; // lucide-vue-next 图标名（与前端 UIUX 设计系统对齐，ADR-002）
  sort_order: number;
}

// 顶部子系统页签（7 子系统 + 综合概览由 regulation 承载，overview 视为综合入口）
export const SUBSYSTEMS: SubsystemDef[] = [
  { code: 'regulation', name: '智慧能源调控', icon: 'gauge', sort_order: 1 },
  { code: 'lifecycle', name: '设备生命周期', icon: 'boxes', sort_order: 2 },
  { code: 'hvac', name: '空调集中控制', icon: 'wind', sort_order: 3 },
  { code: 'lighting', name: '智慧照明', icon: 'lightbulb', sort_order: 4 },
  { code: 'power', name: '电力监控', icon: 'zap', sort_order: 5 },
  { code: 'hotwater', name: '热水调度', icon: 'droplets', sort_order: 6 },
  { code: 'elevator', name: '电梯节能', icon: 'arrow-up-down', sort_order: 7 },
];

export interface MetricDef {
  key: string;
  unit: string;
  base: number; // 标称值
  amp: number; // 振幅
  diurnal: number; // 1=跟随昼夜负荷曲线，0=平稳
  min: number;
  max: number;
}

export interface CategoryDef {
  name: string;
  subsystem: SubsystemCode;
  manufacturer: string[];
  models: string[];
  control_capable: boolean;
  default_metrics: MetricDef[];
}

export const CATEGORY_DEFS: Record<string, CategoryDef> = {
  screw_chiller: {
    name: '螺杆式制冷机组',
    subsystem: 'hvac',
    manufacturer: ['开利', '约克', '麦克维尔'],
    models: ['30XW', 'YSPA', 'WSC'],
    control_capable: true,
    default_metrics: [
      { key: 'cooling_load_kw', unit: 'kW', base: 180, amp: 90, diurnal: 1, min: 20, max: 340 },
      { key: 'cop', unit: '', base: 5.2, amp: 0.8, diurnal: 1, min: 3, max: 6.5 },
      { key: 'supply_temp_c', unit: '°C', base: 7, amp: 1.5, diurnal: 0, min: 4, max: 12 },
      { key: 'return_temp_c', unit: '°C', base: 12, amp: 2, diurnal: 0, min: 8, max: 18 },
    ],
  },
  water_pump: {
    name: '冷冻/冷却水泵',
    subsystem: 'hvac',
    manufacturer: ['格兰富', '威乐', '凯泉'],
    models: ['CRE', 'MVI', 'KQL'],
    control_capable: false,
    default_metrics: [
      { key: 'flow_m3h', unit: 'm³/h', base: 120, amp: 40, diurnal: 1, min: 10, max: 200 },
      { key: 'power_kw', unit: 'kW', base: 15, amp: 6, diurnal: 1, min: 1, max: 30 },
      { key: 'freq_hz', unit: 'Hz', base: 45, amp: 8, diurnal: 1, min: 0, max: 50 },
    ],
  },
  cooling_tower: {
    name: '冷却塔',
    subsystem: 'hvac',
    manufacturer: ['马利', 'BAC', '良机'],
    models: ['RT', 'VXT', 'LBC'],
    control_capable: false,
    default_metrics: [
      { key: 'fan_power_kw', unit: 'kW', base: 7.5, amp: 3, diurnal: 1, min: 0, max: 15 },
      { key: 'outlet_temp_c', unit: '°C', base: 30, amp: 4, diurnal: 1, min: 20, max: 40 },
      { key: 'water_temp_c', unit: '°C', base: 34, amp: 5, diurnal: 1, min: 22, max: 44 },
    ],
  },
  vrf_outdoor: {
    name: '多联机室外机',
    subsystem: 'hvac',
    manufacturer: ['大金', '格力', '美的'],
    models: ['VRV', 'GMV', 'MDV'],
    control_capable: true,
    default_metrics: [
      { key: 'cooling_capacity_kw', unit: 'kW', base: 28, amp: 12, diurnal: 1, min: 2, max: 56 },
      { key: 'power_kw', unit: 'kW', base: 9, amp: 4, diurnal: 1, min: 0.5, max: 20 },
      { key: 'suction_temp_c', unit: '°C', base: 5, amp: 3, diurnal: 1, min: -5, max: 15 },
    ],
  },
  split_ac: {
    name: '分体式空调',
    subsystem: 'hvac',
    manufacturer: ['格力', '美的', '海尔'],
    models: ['KFR-35', 'KFR-50', 'KFR-72'],
    control_capable: true,
    default_metrics: [
      { key: 'power_kw', unit: 'kW', base: 1.1, amp: 0.5, diurnal: 1, min: 0, max: 2.5 },
      { key: 'room_temp_c', unit: '°C', base: 26, amp: 2, diurnal: 0, min: 18, max: 32 },
      { key: 'set_temp_c', unit: '°C', base: 24, amp: 0, diurnal: 0, min: 16, max: 30 },
    ],
  },
  heat_pump_water: {
    name: '空气能热泵热水机组',
    subsystem: 'hotwater',
    manufacturer: ['芬尼克兹', '同益', '中广欧特斯'],
    models: ['PASH', 'KRY', 'ZGR'],
    control_capable: true,
    default_metrics: [
      { key: 'water_temp_c', unit: '°C', base: 55, amp: 3, diurnal: 0, min: 45, max: 60 },
      { key: 'cop', unit: '', base: 4.0, amp: 0.6, diurnal: 1, min: 2.5, max: 5.5 },
      { key: 'compressor_power_kw', unit: 'kW', base: 12, amp: 5, diurnal: 1, min: 1, max: 25 },
      { key: 'tank_temp_c', unit: '°C', base: 52, amp: 3, diurnal: 0, min: 40, max: 58 },
      { key: 'flow_m3h', unit: 'm³/h', base: 1.5, amp: 0.5, diurnal: 1, min: 0.2, max: 3 },
    ],
  },
  air_cooled_module: {
    name: '风冷模块机组',
    subsystem: 'hvac',
    manufacturer: ['天加', '盾安', '台佳'],
    models: ['TCA', 'DAN', 'TJ'],
    control_capable: true,
    default_metrics: [
      { key: 'cooling_capacity_kw', unit: 'kW', base: 65, amp: 25, diurnal: 1, min: 5, max: 130 },
      { key: 'power_kw', unit: 'kW', base: 22, amp: 8, diurnal: 1, min: 2, max: 45 },
      { key: 'outlet_temp_c', unit: '°C', base: 7, amp: 1.5, diurnal: 0, min: 4, max: 12 },
    ],
  },
  // GK-23 缺口①补齐（2026-09-05）：照明类别此前缺失，导致照明设备无法入库
  //（devices.service.create 的 subsystem_id 由 CATEGORY_DEFS[category].subsystem 派生，
  //  无照明类别时创建照明设备会被错误归到 lifecycle）。补照明回路类别，subsystem 归 lighting。
  lighting_loop: {
    name: '照明回路',
    subsystem: 'lighting',
    manufacturer: ['欧普', '雷士', '飞利浦'],
    models: ['LED-PANEL', 'LED-TUBE', 'SMART-SW'],
    control_capable: true,
    default_metrics: [
      { key: 'power_kw', unit: 'kW', base: 0.4, amp: 0.25, diurnal: 1, min: 0, max: 1.2 },
      { key: 'dim_level', unit: '%', base: 80, amp: 20, diurnal: 1, min: 0, max: 100 },
    ],
  },
  // GK-23 缺口②补齐（2026-10-02）：电梯 / 供配电此前无设备类别，导致电梯与供配电设备无法入库、
  // 3D 设备级点位（KEY_EQUIPMENT_CATEGORIES）缺失、S3 电梯安全驾驶舱与供配电计量驾驶舱无真实设备源。
  // 补电梯(电梯节能子系统)与供配电设备(电力监控子系统)两类，subsystem 分别归 elevator / power。
  elevator: {
    name: '电梯',
    subsystem: 'elevator',
    manufacturer: ['三菱', '日立', '通力', '奥的斯'],
    models: ['MAXIEZ', 'NPH', 'MonoSpace', 'Gen2'],
    control_capable: true,
    default_metrics: [
      { key: 'rated_speed_m_s', unit: 'm/s', base: 1.75, amp: 1.0, diurnal: 0, min: 0.5, max: 6 },
      { key: 'load_kg', unit: 'kg', base: 1000, amp: 400, diurnal: 0, min: 450, max: 2000 },
      { key: 'door_cycles', unit: '次', base: 1200, amp: 400, diurnal: 1, min: 0, max: 3000 },
      { key: 'energy_kwh', unit: 'kWh', base: 45, amp: 20, diurnal: 1, min: 5, max: 120 },
    ],
  },
  power: {
    name: '供配电设备',
    subsystem: 'power',
    manufacturer: ['施耐德', 'ABB', '西门子', '正泰'],
    models: ['MTZ', 'Emax2', 'SIVACON', 'NM8'],
    control_capable: true,
    default_metrics: [
      { key: 'transformer_load_kw', unit: 'kW', base: 800, amp: 300, diurnal: 1, min: 50, max: 2000 },
      { key: 'voltage_v', unit: 'V', base: 400, amp: 15, diurnal: 0, min: 360, max: 440 },
      { key: 'current_a', unit: 'A', base: 1150, amp: 400, diurnal: 1, min: 50, max: 2500 },
      { key: 'power_factor', unit: '', base: 0.92, amp: 0.05, diurnal: 1, min: 0.7, max: 1.0 },
    ],
  },
};

// 楼栋定义（ARCHITECTURE.md 第 1.2 节）。
// local_origin 现为「院区网格锚点」(任务3)：10 栋楼在 XZ 平面按 5×2 网格排布（间距 40 单位），
// 确定性坐标，公式 anchor(i) = { x:(i%5)*40-80, y:0, z:floor(i/5)*40-20 }（i 为楼栋序号 0-based）。
// 该坐标为 3D 场景与设备点位的唯一空间基准（后端 scene 数据驱动，前端不再随机生成）。
export interface BuildingDef {
  id: string;
  code: string;
  name: string;
  floors: number;
  gross_area: number;
  local_origin: { x: number; y: number; z: number };
}

// 院区网格锚点（任务3）：单一真源，供 seed / scene 复用。
export function buildingAnchor(buildingIndex: number): { x: number; y: number; z: number } {
  return {
    x: (buildingIndex % 5) * 40 - 80,
    y: 0,
    z: Math.floor(buildingIndex / 5) * 40 - 20,
  };
}

export const BUILDINGS: BuildingDef[] = [
  { id: '1', code: 'B1', name: '120急救中心', floors: 6, gross_area: 12000, local_origin: buildingAnchor(0) },
  { id: '2', code: 'B2', name: '门诊大楼', floors: 12, gross_area: 28000, local_origin: buildingAnchor(1) },
  { id: '3', code: 'B3', name: '住院大楼', floors: 18, gross_area: 42000, local_origin: buildingAnchor(2) },
  { id: '4', code: 'B4', name: '妇产儿科大楼', floors: 15, gross_area: 36000, local_origin: buildingAnchor(3) },
  { id: '5', code: 'B5', name: '张襯大楼', floors: 10, gross_area: 22000, local_origin: buildingAnchor(4) },
  { id: '6', code: 'B6', name: '后勤楼', floors: 3, gross_area: 9000, local_origin: buildingAnchor(5) },
  { id: '7', code: 'B7', name: '药剂楼', floors: 8, gross_area: 14000, local_origin: buildingAnchor(6) },
  { id: '8', code: 'B8', name: '余锦炯大楼(放疗楼)', floors: 11, gross_area: 20000, local_origin: buildingAnchor(7) },
  { id: '9', code: 'B9', name: '综合大楼', floors: 16, gross_area: 38000, local_origin: buildingAnchor(8) },
  { id: '10', code: 'B10', name: '宿舍楼', floors: 9, gross_area: 16000, local_origin: buildingAnchor(9) },
];

// 各楼设备台账计划（合同确认数量）。键为楼栋 id，值为 类别->数量。
// 1 号楼(120急救中心)按 R1 决策共用 2 号楼(门诊大楼)台账结构：完全相同的设备类型分解与数量（约 139 台）。
export const BUILDING_DEVICE_PLAN: Record<string, Record<string, number>> = {
  '1': { screw_chiller: 2, water_pump: 2, cooling_tower: 2, vrf_outdoor: 4, split_ac: 128, heat_pump_water: 1, elevator: 3, power: 2 }, // R1：共用 2 号楼台账
  '2': { screw_chiller: 2, water_pump: 2, cooling_tower: 2, vrf_outdoor: 4, split_ac: 128, heat_pump_water: 1, elevator: 4, power: 2 },
  '3': { air_cooled_module: 2, split_ac: 690, heat_pump_water: 6, elevator: 6, power: 3 },
  '4': { air_cooled_module: 4, water_pump: 3, vrf_outdoor: 23, split_ac: 236, heat_pump_water: 4, elevator: 5, power: 2 },
  '5': { vrf_outdoor: 8, split_ac: 126, elevator: 3, power: 1 },
  '6': { split_ac: 62, elevator: 1, power: 1 },
  '7': { air_cooled_module: 2, water_pump: 3, split_ac: 75, elevator: 2, power: 1 },
  '8': { split_ac: 73, heat_pump_water: 2, elevator: 3, power: 2 },
  '9': { split_ac: 200, heat_pump_water: 4, elevator: 6, power: 3 },
  '10': { split_ac: 36, heat_pump_water: 3, elevator: 2, power: 1 },
};

// 关键设备类别（用于 3D 设备级点位 LOD，非分体机/照明等海量设备）
// 2026-10-02：补 elevator / power，使电梯与供配电设备在大屏 3D 场景中按楼栋/楼层落位（GK-23 缺口②）。
export const KEY_EQUIPMENT_CATEGORIES = [
  'screw_chiller',
  'water_pump',
  'cooling_tower',
  'vrf_outdoor',
  'heat_pump_water',
  'air_cooled_module',
  'elevator',
  'power',
];

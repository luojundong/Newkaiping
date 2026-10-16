// 内存种子数据构建：10 栋楼 + 约 1701 台设备 + 子系统配置 + 告警 + 场景 + 用户 + 灰度。
// 1 号楼(120急救中心)台账待现场调研补充，设备置空、子系统配置全 false（架构预留）。

import * as bcrypt from 'bcryptjs';
import {
  Alarm,
  AlarmRule,
  AlarmRuleConfig,
  AuditLog,
  BillingLedgerEntry,
  BillingPrice,
  BillingQuota,
  Building,
  BuildingSubsystemConfig,
  ControlGroup,
  Device,
  DeviceBrand,
  DevicePoint,
  DeviceType,
  RoleRecord,
  SceneConfig,
  SceneMarker,
  Subsystem,
  AuditReview,
  AuditSetting,
  UserRecord,
  WorkOrder,
  WorkOrderStatus,
} from '../../types';
import {
  BUILDINGS,
  BUILDING_DEVICE_PLAN,
  CATEGORY_DEFS,
  KEY_EQUIPMENT_CATEGORIES,
  SUBSYSTEMS,
} from '../../constants/catalog';

// 固定种子的伪随机，保证每次启动数据一致、可复现。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedStore {
  buildings: Building[];
  subsystems: Subsystem[];
  devices: Device[];
  buildingSubsystemConfig: BuildingSubsystemConfig[];
  alarmRules: AlarmRule[];
  alarms: Alarm[];
  sceneConfig: SceneConfig;
  devicePoints: DevicePoint[];
  users: UserRecord[];
  roles: RoleRecord[];
  billingPrices: BillingPrice[];
  billingQuotas: BillingQuota[];
  billingLedger: BillingLedgerEntry[];
  alarmRuleConfigs: AlarmRuleConfig[];
  features: Record<string, boolean>;
  deviceTypes: DeviceType[];
  deviceBrands: DeviceBrand[];
  controlGroups: ControlGroup[];
  workOrders: WorkOrder[];
  sceneMarkers: SceneMarker[];
  auditLogs: AuditLog[];
  auditReviews: AuditReview[];
  auditSettings: AuditSetting[];
}

const STATUS_POOL: Device['status'][] = ['running', 'running', 'running', 'running', 'running', 'running', 'running', 'running', 'running', 'running', 'stopped', 'fault', 'maintenance', 'offline'];

export function buildSeedStore(): SeedStore {
  const rng = mulberry32(20260817);
  const buildings: Building[] = BUILDINGS.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    floors: b.floors,
    gross_area: b.gross_area,
    local_origin: b.local_origin,
    status: 'active',
  }));

  const subsystems: Subsystem[] = SUBSYSTEMS.map((s) => ({
    id: s.code,
    code: s.code,
    name: s.name,
    icon: s.icon,
    sort_order: s.sort_order,
  }));

  // 楼栋-子系统配置：R1 决策后 10 栋楼全部 enabled=true（含 1 号楼 120急救中心，共用 2 号楼台账）。
  const buildingSubsystemConfig: BuildingSubsystemConfig[] = [];
  for (const b of buildings) {
    for (const s of SUBSYSTEMS) {
      const enabled = true;
      buildingSubsystemConfig.push({
        id: `bsc-${b.id}-${s.code}`,
        building_id: b.id,
        subsystem_code: s.code,
        enabled,
        config_json: enabled ? { auto_schedule: true } : null,
        sort_order: s.sort_order,
      });
    }
  }

  // 楼栋内设备总数（用于任务3 的确定性楼内网格偏移分布）
  const buildingTotals: Record<string, number> = {};
  for (const b of buildings) {
    const plan = BUILDING_DEVICE_PLAN[b.id] || {};
    buildingTotals[b.id] = Object.values(plan).reduce((s, n) => s + n, 0);
  }
  // 每台设备在楼内的序号计数器（0-based），用于映射到楼内小范围 XZ 网格
  const buildingDeviceCounter: Record<string, number> = {};
  // 楼内网格偏移：在 anchor 周围 ±20 单位内按 sqrt 网格确定性排布（任务3）
  function deviceGridOffset(index: number, total: number): { dx: number; dz: number } {
    if (total <= 0) return { dx: 0, dz: 0 };
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.ceil(total / cols);
    const unitX = 40 / cols;
    const unitZ = 40 / rows;
    const dx = (index % cols) * unitX - 20 + unitX / 2;
    const dz = Math.floor(index / cols) * unitZ - 20 + unitZ / 2;
    return { dx, dz };
  }

  // 设备台账生成
  const devices: Device[] = [];
  const devicePoints: DevicePoint[] = [];
  for (const b of buildings) {
    const plan = BUILDING_DEVICE_PLAN[b.id] || {};
    const bdef = BUILDINGS.find((x) => x.id === b.id)!;
    const anchor = bdef.local_origin; // 院区网格锚点（任务3）
    for (const [cat, count] of Object.entries(plan)) {
      const cdef = CATEGORY_DEFS[cat];
      for (let i = 1; i <= count; i++) {
        const seq = String(i).padStart(3, '0');
        const floor = 1 + Math.floor(rng() * b.floors);
        const roomNo = `${floor}${String(1 + (i % 9)).padStart(2, '0')}`;
        const status = STATUS_POOL[Math.floor(rng() * STATUS_POOL.length)];
        const devId = `dev-${b.id}-${cat}-${seq}`;
        // 任务3：确定性坐标 = 楼栋锚点(anchor) + 楼内网格偏移(dx/dz) + 楼层 Y 偏移(floor*3.5)
        const bIdx = (buildingDeviceCounter[b.id] = (buildingDeviceCounter[b.id] || 0) + 1) - 1;
        const { dx, dz } = deviceGridOffset(bIdx, buildingTotals[b.id]);
        const locX = anchor.x + dx;
        const locY = floor * 3.5;
        const locZ = anchor.z + dz;
        const manufacturer = cdef.manufacturer[Math.floor(rng() * cdef.manufacturer.length)];
        const model = cdef.models[Math.floor(rng() * cdef.models.length)];
        const installYear = 2018 + Math.floor(rng() * 7);
        const device: Device = {
          id: devId,
          building_id: b.id,
          subsystem_id: cdef.subsystem,
          category_id: cat,
          code: `${b.code}-${cat.toUpperCase()}-${seq}`,
          name: `${b.name} ${cdef.name} #${seq}`,
          model,
          manufacturer,
          install_date: `${installYear}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
          location: {
            x: locX,
            y: locY,
            z: locZ,
            floor,
            room: roomNo,
          },
          specs: {
            rated_power_kw: Math.round((cdef.default_metrics[0]?.base || 1) * 1.1 * 100) / 100,
            rated_capacity: cdef.default_metrics[0]?.key,
          },
          status,
          protocol: cdef.control_capable ? (rng() > 0.5 ? 'modbus-tcp' : 'mqtt') : undefined,
          controller_type: cdef.control_capable ? 'gateway' : undefined,
        };
        devices.push(device);

        // 关键设备生成 3D 设备级点位（LOD）
        if (KEY_EQUIPMENT_CATEGORIES.includes(cat)) {
          devicePoints.push({
            id: `pt-${devId}`,
            device_id: devId,
            building_id: b.id,
            position: { x: device.location.x, y: device.location.y + 1, z: device.location.z },
            marker_type: cat,
            label: device.name,
            level_of_detail: 'equipment',
            visible: true,
            subsystem_code: cdef.subsystem,
          });
        }
      }
    }

    // 每楼每启用子系统生成聚合点位（子系统级 LOD）；坐标基于院区网格锚点 + 楼顶高度（R1 + 任务3）
    for (const s of SUBSYSTEMS) {
      const cfg = buildingSubsystemConfig.find((x) => x.building_id === b.id && x.subsystem_code === s.code);
      if (cfg && cfg.enabled) {
        devicePoints.push({
          id: `pt-${b.id}-${s.code}`,
          device_id: null,
          building_id: b.id,
          position: {
            x: anchor.x,
            y: anchor.y + bdef.floors * 3.5 + 6,
            z: anchor.z,
          },
          marker_type: 'subsystem',
          label: `${b.name} - ${s.name}`,
          level_of_detail: 'subsystem',
          visible: true,
          subsystem_code: s.code,
        });
      }
    }
  }

  // 告警规则（后台阈值配置种子）
  const alarmRules: AlarmRule[] = [
    { id: 'rule-1', subsystem: 'hvac', metric_key: 'supply_temp_c', operator: '>', threshold: 12, level: 'warning', enabled: true, description: '冷冻供水温度偏高' },
    { id: 'rule-2', subsystem: 'hvac', metric_key: 'cop', operator: '<', threshold: 3.5, level: 'critical', enabled: true, description: '制冷机组COP过低' },
    { id: 'rule-3', subsystem: 'power', metric_key: 'voltage_v', operator: '<', threshold: 198, level: 'critical', enabled: true, description: '电压低于下限' },
    { id: 'rule-4', subsystem: 'power', metric_key: 'thd_percent', operator: '>', threshold: 5, level: 'warning', enabled: true, description: '谐波畸变率超标' },
    { id: 'rule-5', subsystem: 'hotwater', metric_key: 'water_temp_c', operator: '<', threshold: 45, level: 'warning', enabled: true, description: '热水温度偏低' },
    { id: 'rule-6', subsystem: 'elevator', metric_key: 'standby_kwh', operator: '>', threshold: 8, level: 'info', enabled: true, description: '电梯待机能耗偏高' },
    { id: 'rule-7', subsystem: 'hvac', metric_key: 'room_temp_c', operator: '>', threshold: 30, level: 'warning', enabled: true, description: '室内温度偏高' },
    { id: 'rule-8', subsystem: 'lighting', metric_key: 'power_kw', operator: '>', threshold: 40, level: 'info', enabled: true, description: '照明功率偏高' },
  ];

  // 告警种子（引用真实设备，状态 active）
  const alarms: Alarm[] = [];
  const sampleDevices = devices.filter((d) => d.status !== 'offline');
  const alarmTemplates: Array<{ level: Alarm['level']; title: string; message: string; subsystem: string }> = [
    { level: 'warning', title: '冷冻供水温度偏高', message: '2号楼螺杆机组供水温度超过12°C阈值', subsystem: 'hvac' },
    { level: 'critical', title: '制冷机组COP过低', message: '3号楼风冷模块机组COP跌至3.2', subsystem: 'hvac' },
    { level: 'warning', title: '热水温度偏低', message: '4号楼热泵机组出水温度低于45°C', subsystem: 'hotwater' },
    { level: 'info', title: '照明功率偏高', message: '门诊大楼照明区域功率偏高', subsystem: 'lighting' },
    { level: 'warning', title: '室内温度偏高', message: '住院大楼部分分体机室内温度30°C', subsystem: 'hvac' },
    { level: 'critical', title: '电压低于下限', message: '综合大楼配电电压低于198V', subsystem: 'power' },
    { level: 'warning', title: '谐波畸变率超标', message: '妇产儿科大楼谐波THD>5%', subsystem: 'power' },
    { level: 'info', title: '电梯待机能耗偏高', message: '后勤楼电梯待机能耗偏高', subsystem: 'elevator' },
    { level: 'warning', title: '设备通讯中断', message: '放疗楼1台分体机通讯中断', subsystem: 'hvac' },
    { level: 'critical', title: '压缩机过载', message: '宿舍楼热泵压缩机功率超限', subsystem: 'hotwater' },
    { level: 'info', title: '滤网脏堵提醒', message: '门诊大楼多联机滤网建议清洗', subsystem: 'hvac' },
    { level: 'warning', title: '冷却塔出水温度高', message: '门诊大楼冷却塔出水温度偏高', subsystem: 'hvac' },
  ];
  const now = Date.now();
  alarmTemplates.forEach((t, idx) => {
    const dev = sampleDevices[(idx * 37) % sampleDevices.length];
    const firstAt = new Date(now - (idx + 1) * 3600_000);
    alarms.push({
      id: `alarm-${String(idx + 1).padStart(3, '0')}`,
      device_id: dev ? dev.id : null,
      building_id: dev ? dev.building_id : '2',
      subsystem_id: t.subsystem,
      rule_id: alarmRules[idx % alarmRules.length].id,
      level: t.level,
      title: t.title,
      message: t.message,
      metric_snapshot: { value: 12.4, threshold: 12 },
      status: 'active',
      first_at: firstAt.toISOString(),
      last_at: new Date(now - idx * 600_000).toISOString(),
      acked_by: null,
      acked_at: null,
      cleared_at: null,
    });
  });

  // 3D 场景配置（任务3）：building_anchors 坐标即院区网格锚点(确定性)，前端直接消费、不再随机生成
  // geo_origin：院区真实地理原点，由 GIS 检索"开平市中心医院"定位（腾讯地图，2026-08-17）
  const sceneConfig: SceneConfig = {
    model_url: '/models/hospital.glb',
    building_anchors: buildings.map((b) => ({
      building_id: b.id,
      code: b.code,
      name: b.name,
      position: b.local_origin,
      camera_target: { x: b.local_origin.x, y: (b.floors * 3.5) / 2, z: b.local_origin.z },
    })),
    camera_presets: [
      // 院区 5x2 网格跨度 x[-80,80] z[-20,20]，总览相机居中俯视
      { id: 'overview', name: '全院总览', position: { x: 0, y: 170, z: 235 }, target: { x: 0, y: 0, z: 0 } },
      { id: 'building', name: '单楼视角', position: { x: 0, y: 60, z: 80 }, target: { x: 0, y: 0, z: 0 } },
    ],
    environment: { ambient: 0.6, skybox: 'navy', grid: true },
    geo_origin: {
      latitude: 22.373833,
      longitude: 112.668708,
      address: '广东省江门市开平市长沙街道三江开发区A7号',
      source: '腾讯地图 GIS (2026-08-17)',
    },
    // 子系统显示名（默认 = SUBSYSTEMS 名称，前端可在楼栋子系统配置中自定义覆盖）
    subsystem_labels: SUBSYSTEMS.reduce<Record<string, string>>((acc, s) => {
      acc[s.code] = s.name;
      return acc;
    }, {}),
    // 左侧管理菜单默认排序（与前端 AdminLayout 菜单顺序一致）
    menu_order: [
      '/admin/building-subsystem',
      '/admin/device',
      '/admin/alarm',
      '/admin/energy',
      '/admin/user',
      '/admin/role',
      '/admin/log',
      '/admin/building',
      '/admin/billing',
      '/admin/history',
      '/admin/alarm-rules',
      '/admin/reports',
      '/admin/scene',
      '/admin/marker',
    ],
    // 3D 标注显隐开关（默认全部开启）
    marker_switch: {
      show_building_markers: true,
      show_device_points: true,
    },
  };

  // 角色（阶段五：固定 4 种角色，role 使用 code 字符串）
  const FULL_PERMS = [
    'device:control',
    'device:edit',
    'user:manage',
    'building:config',
    'alarm:config',
    'billing:manage',
    'report:export',
    // GMP 审计合规权限点（仅管理员具备复核/配置）
    'audit:trail',
    'audit:review',
    'audit:config',
  ];
  const MAINTAINER_PERMS = [
    'device:control',
    'device:edit',
    'alarm:config',
    'billing:manage',
    'report:export',
    'building:config',
    'audit:trail',
  ];
  const DUTY_PERMS = ['device:control', 'alarm:config', 'billing:manage', 'report:export', 'audit:trail'];
  const LEADER_PERMS = ['report:export', 'audit:trail'];
  const roles: RoleRecord[] = [
    {
      id: 'role-admin',
      code: 'admin',
      name: '系统管理员',
      permissions: FULL_PERMS,
      description: '平台全部权限',
      status: 'active',
    },
    {
      id: 'role-maintainer',
      code: 'maintainer',
      name: '运维工程师',
      permissions: MAINTAINER_PERMS,
      description: '设备控制、编辑、告警与计费运维',
      status: 'active',
    },
    {
      id: 'role-duty',
      code: 'duty',
      name: '医院后勤/能源管理值班人员',
      permissions: DUTY_PERMS,
      description: '值班期间设备控制、告警与计费处理',
      status: 'active',
    },
    {
      id: 'role-leader',
      code: 'leader',
      name: '院领导',
      permissions: LEADER_PERMS,
      description: '查看报表与导出',
      status: 'active',
    },
  ];

  // 用户（admin / admin123，bcrypt 哈希；role 绑定到上述 4 种 code）
  const users: UserRecord[] = [
    {
      id: 'user-admin',
      username: 'admin',
      password_hash: bcrypt.hashSync('admin123', 10),
      nickname: '系统管理员',
      role: 'admin',
      status: 'active',
      last_login: null,
      permissions: FULL_PERMS,
      phone: '13800000000',
      email: 'admin@kp-hospital.com',
    },
    {
      id: 'user-op1',
      username: 'operator1',
      password_hash: bcrypt.hashSync('op123456', 10),
      nickname: '运维员-甲',
      role: 'maintainer',
      status: 'active',
      last_login: null,
      permissions: MAINTAINER_PERMS,
      phone: '13800000001',
      email: 'op1@kp-hospital.com',
    },
    {
      id: 'user-op2',
      username: 'operator2',
      password_hash: bcrypt.hashSync('op123456', 10),
      nickname: '运维员-乙',
      role: 'duty',
      status: 'active',
      last_login: null,
      permissions: DUTY_PERMS,
      phone: '13800000002',
      email: 'op2@kp-hospital.com',
    },
    {
      id: 'user-viewer',
      username: 'viewer',
      password_hash: bcrypt.hashSync('view123456', 10),
      nickname: '院领导-丙',
      role: 'leader',
      status: 'active',
      last_login: null,
      permissions: LEADER_PERMS,
      phone: '13800000003',
      email: 'viewer@kp-hospital.com',
    },
  ];

  // 计费：峰/平/谷 电价
  const billingPrices: BillingPrice[] = [
    { id: 'price-peak', name: '峰时电价', type: 'peak', price: 1.2, start: '08:00', end: '22:00', unit: '元/kWh' },
    { id: 'price-flat', name: '平时电价', type: 'flat', price: 0.8, start: '22:00', end: '08:00', unit: '元/kWh' },
    { id: 'price-valley', name: '谷时电价', type: 'valley', price: 0.4, start: '23:00', end: '07:00', unit: '元/kWh' },
  ];

  // 计费：配额（楼栋 + 设备）
  const billingQuotas: BillingQuota[] = [
    { id: 'quota-b2', scope: 'building', ref_id: '2', period: 'month', quota_kwh: 500000, warning_pct: 80 },
    { id: 'quota-b3', scope: 'building', ref_id: '3', period: 'month', quota_kwh: 800000, warning_pct: 80 },
    { id: 'quota-b9', scope: 'building', ref_id: '9', period: 'month', quota_kwh: 600000, warning_pct: 75 },
    { id: 'quota-d1', scope: 'device', ref_id: 'dev-2-screw_chiller-001', period: 'month', quota_kwh: 3000, warning_pct: 85 },
  ];

  // 计费：账户账本（初始充值）
  const billingLedger: BillingLedgerEntry[] = [
    { id: 'led-1', scope: 'building', ref_id: '2', type: 'recharge', amount: 100000, balance_after: 100000, remark: '期初充值', ts: new Date(Date.now() - 30 * 86400_000).toISOString() },
    { id: 'led-2', scope: 'device', ref_id: 'dev-2-screw_chiller-001', type: 'recharge', amount: 5000, balance_after: 5000, remark: '设备预存', ts: new Date(Date.now() - 20 * 86400_000).toISOString() },
  ];

  // 告警异常配置（阶段四，区别于旧 alarm_rules）
  const alarmRuleConfigs: AlarmRuleConfig[] = [
    { id: 'arc-temp-high', event_code: 'TEMP_HIGH', event_name: '温度过高', description: '送风/回风温度超过上限', subsystem: 'hvac', notify_enabled: true, alarm_enabled: true, level: 'warning', threshold: 30, recovery_threshold: 26, unit: '°C', comparator: '>' },
    { id: 'arc-temp-low', event_code: 'TEMP_LOW', event_name: '温度过低', description: '环境温度低于下限', subsystem: 'hvac', notify_enabled: true, alarm_enabled: true, level: 'warning', threshold: 16, recovery_threshold: 18, unit: '°C', comparator: '<' },
    { id: 'arc-humidity', event_code: 'HUMIDITY', event_name: '湿度异常', description: '相对湿度超出舒适区间', subsystem: 'hvac', notify_enabled: false, alarm_enabled: true, level: 'info', threshold: 80, recovery_threshold: 70, unit: '%', comparator: '>' },
    { id: 'arc-voltage', event_code: 'VOLTAGE', event_name: '电压越限', description: '配电电压低于安全下限', subsystem: 'power', notify_enabled: true, alarm_enabled: true, level: 'critical', threshold: 198, recovery_threshold: 205, unit: 'V', comparator: '<' },
    { id: 'arc-current', event_code: 'CURRENT', event_name: '电流越限', description: '回路电流超过额定值', subsystem: 'power', notify_enabled: true, alarm_enabled: true, level: 'critical', threshold: 400, recovery_threshold: 360, unit: 'A', comparator: '>' },
    { id: 'arc-water-pressure', event_code: 'WATER_PRESS', event_name: '水压异常', description: '供水压力低于阈值', subsystem: 'hotwater', notify_enabled: true, alarm_enabled: true, level: 'warning', threshold: 0.2, recovery_threshold: 0.25, unit: 'MPa', comparator: '<' },
    { id: 'arc-device-offline', event_code: 'DEVICE_OFFLINE', event_name: '设备离线', description: '设备通讯中断', subsystem: 'lifecycle', notify_enabled: true, alarm_enabled: true, level: 'warning', threshold: 1, recovery_threshold: 0, unit: '台', comparator: '>=' },
    { id: 'arc-energy-over', event_code: 'ENERGY_OVER', event_name: '能耗超阈值', description: '单位时间能耗超过预算', subsystem: 'regulation', notify_enabled: false, alarm_enabled: true, level: 'warning', threshold: 1000, recovery_threshold: 900, unit: 'kWh', comparator: '>' },
  ];

  // 设备类型（阶段五：设备主数据，默认 10 类，后续可自定义增改）
  const deviceTypeNames = [
    '分体机空调',
    '多联机空调',
    '空气能热泵热水机组',
    '水泵',
    '冷却塔',
    '中央空调主机',
    '照明灯具',
    '配电柜',
    '电梯',
    'UPS电源',
  ];
  const deviceTypes: DeviceType[] = deviceTypeNames.map((name, i) => ({
    id: `dtype-${String(i + 1).padStart(2, '0')}`,
    seq: i + 1,
    name,
  }));

  // 设备品牌（阶段五：设备主数据，默认 10 个）
  const deviceBrandNames = [
    '格力',
    '美的',
    '海尔',
    '约克(York)',
    '特灵(Trane)',
    '大金(Daikin)',
    '施耐德(Schneider)',
    '西门子(Siemens)',
    '飞利浦',
    '松下',
  ];
  const deviceBrands: DeviceBrand[] = deviceBrandNames.map((name, i) => ({
    id: `dbrand-${String(i + 1).padStart(2, '0')}`,
    seq: i + 1,
    name,
  }));

  // 控制群组（阶段五：群组控制，初始一个示例群组）
  const controlGroups: ControlGroup[] = [
    {
      id: 'cgroup-01',
      name: '门诊大楼空调群组',
      description: '门诊大楼 1~3 层分体空调统一调控',
      building_ids: ['2'],
      device_ids: ['dev-2-split_ac-001', 'dev-2-split_ac-002', 'dev-2-vrf-001'],
    },
  ];

  // 工单（阶段五：运维工单，示例数据分布于不同状态）
  const woNow = Date.now();
  const day = 86400_000;
  const woDefs: Array<{
    code: string;
    title: string;
    description?: string;
    assignee?: string;
    building_id: string;
    building_name: string;
    product_type?: string;
    device_id?: string;
    device_name?: string;
    priority?: WorkOrder['priority'];
    status: WorkOrderStatus;
    ageDays: number;
  }> = [
    {
      code: 'WO-20260810-001',
      title: '中央空调主机异常停机',
      description: '门诊大楼中央空调主机显示高压保护，需现场检修',
      assignee: '运维员-甲',
      building_id: '2',
      building_name: '门诊大楼',
      product_type: '中央空调主机',
      device_id: 'dev-2-screw_chiller-001',
      device_name: '门诊大楼 螺杆机组 #001',
      priority: 'urgent',
      status: 'processing',
      ageDays: 1,
    },
    {
      code: 'WO-20260809-002',
      title: '照明回路检修',
      description: '住院大楼 5 层公共区照明回路偶发闪烁',
      assignee: '运维员-乙',
      building_id: '3',
      building_name: '住院大楼',
      product_type: '照明灯具',
      priority: 'normal',
      status: 'pending',
      ageDays: 2,
    },
    {
      code: 'WO-20260808-003',
      title: '电梯年度安检',
      description: '妇产儿科大楼 2 号电梯年度特种设备安检',
      assignee: '外包维保',
      building_id: '4',
      building_name: '妇产儿科大楼',
      product_type: '电梯',
      priority: 'high',
      status: 'completed',
      ageDays: 3,
    },
    {
      code: 'WO-20260807-004',
      title: '冷却塔出水温度过高反馈',
      description: '门诊大楼冷却塔出水温度偏高，待厂家远程确认',
      assignee: '运维员-甲',
      building_id: '2',
      building_name: '门诊大楼',
      product_type: '冷却塔',
      priority: 'high',
      status: 'feedback',
      ageDays: 4,
    },
    {
      code: 'WO-20260806-005',
      title: '配电柜巡检未完成',
      description: '后勤楼配电柜季度巡检因备件未到货暂停',
      assignee: '运维员-乙',
      building_id: '6',
      building_name: '后勤楼',
      product_type: '配电柜',
      priority: 'low',
      status: 'unfinished',
      ageDays: 5,
    },
    {
      code: 'WO-20260805-006',
      title: '水泵异响处理',
      description: '放疗楼冷冻水泵异响，已更换轴承并闭环',
      assignee: '运维员-甲',
      building_id: '8',
      building_name: '余锦炯大楼(放疗楼)',
      product_type: '水泵',
      priority: 'normal',
      status: 'closed',
      ageDays: 6,
    },
  ];
  const workOrders: WorkOrder[] = woDefs.map((d) => {
    const { ageDays, ...rest } = d;
    const created = new Date(woNow - ageDays * day).toISOString();
    return {
      ...rest,
      id: `wo-${d.code}`,
      created_at: created,
      updated_at: created,
    } as WorkOrder;
  });

  // 灰度开关
  const features: Record<string, boolean> = {
    'scene-3d': true,
    'energy-carbon': true,
    'remote-control': true,
    'alarm-ai': false,
    'report-export': false,
    'maintenance-plan': true,
  };

  // 3D 标记种子（scene_markers 集合）：每栋楼取 1~2 个关键设备生成标记，支持楼层差异化
  const MARKER_COLORS = ['#ff4444', '#ffaa00', '#00ccff', '#00ff88', '#ff44aa', '#88aaff', '#aaff00'];
  const sceneMarkers: SceneMarker[] = [];
  for (const b of buildings) {
    const bdef = BUILDINGS.find((x) => x.id === b.id)!;
    const anchor = bdef.local_origin;
    // 每栋楼取前 2 个关键设备生成标记（GK-23 缺口②增强，2026-10-02）：
    // 旧逻辑按 KEY_EQUIPMENT_CATEGORIES 数组顺序 slice(0,2)，多数楼不显式出现电梯 / 供配电点位
    // （仅 building 6 因设备生成顺序恰命中 elevator+power）。现改为优先电梯 / 供配电排序后再取前 2，
    // 确保每栋楼的电梯 / 供配电 3D 标记显式落位，其余关键设备补齐空位。
    const PRIORITY_CATS = ['elevator', 'power'];
    const keyAll = devices.filter((d) => d.building_id === b.id && KEY_EQUIPMENT_CATEGORIES.includes(d.category_id));
    const keyDevs = [
      ...keyAll.filter((d) => PRIORITY_CATS.includes(d.category_id)),
      ...keyAll.filter((d) => !PRIORITY_CATS.includes(d.category_id)),
    ].slice(0, 2);
    keyDevs.forEach((dev, i) => {
      const floor = dev.location.floor;
      sceneMarkers.push({
        id: `mk-${dev.id}`,
        building_id: b.id,
        floor,
        position: {
          x: dev.location.x,
          y: anchor.y + (floor - 1) * 4.2 + 2,
          z: dev.location.z,
        },
        marker_type: dev.category_id,
        label: dev.name,
        device_id: dev.id,
        visible: true,
        color: MARKER_COLORS[i % MARKER_COLORS.length],
      });
    });
  }

  // 审计日志种子（audit_logs 集合）：近几天的登录与配置操作示例，前端操作日志页可直接看到数据
  const nowTs = Date.now();
  const H = 3600 * 1000;
  const iso = (msAgo: number) => new Date(nowTs - msAgo).toISOString();
  const auditLogs: AuditLog[] = [
    { id: 'al-seed-1', username: 'admin', module: 'auth', action: 'login', target: '系统登录', detail: '管理员登录系统', result: 'success', ip: '127.0.0.1', created_at: iso(2 * H) },
    { id: 'al-seed-2', username: 'admin', module: 'users', action: 'create', target: '用户: operator2', detail: '新增值班用户 operator2', result: 'success', ip: '127.0.0.1', created_at: iso(26 * H) },
    { id: 'al-seed-3', username: 'operator1', module: 'devices', action: 'update', target: '设备: 住院大楼 1# 螺杆机组', detail: '更新设备状态为 运行中', result: 'success', ip: '10.0.3.21', created_at: iso(30 * H) },
    { id: 'al-seed-4', username: 'admin', module: 'billing', action: 'update', target: '电价: 峰时电价', detail: '峰时电价调整为 1.08 元/kWh', result: 'success', ip: '127.0.0.1', created_at: iso(50 * H) },
    { id: 'al-seed-5', username: 'admin', module: 'scene', action: 'switch', target: '标记开关', detail: '关闭设备点位显示失败（演示数据）', result: 'fail', ip: '127.0.0.1', created_at: iso(74 * H) },
    { id: 'al-seed-6', username: 'operator1', module: 'work-orders', action: 'create', target: '工单: WO-20260812-001', detail: '新建维修工单', result: 'success', ip: '10.0.3.21', created_at: iso(98 * H) },
    { id: 'al-seed-7', username: 'viewer', module: 'auth', action: 'login', target: '系统登录', detail: '访客登录系统', result: 'success', ip: '10.0.5.8', created_at: iso(120 * H) },
  ];

  return {
    buildings,
    subsystems,
    devices,
    buildingSubsystemConfig,
    alarmRules,
    alarms,
    sceneConfig,
    devicePoints,
    users,
    roles,
    billingPrices,
    billingQuotas,
    billingLedger,
    alarmRuleConfigs,
    features,
    deviceTypes,
    deviceBrands,
    controlGroups,
    workOrders,
    sceneMarkers,
    auditLogs,
    auditReviews: [],
    auditSettings: [{ id: 'review-interval', key: 'review-interval', reviewIntervalDays: 30, updated_at: new Date().toISOString() }],
  };
}

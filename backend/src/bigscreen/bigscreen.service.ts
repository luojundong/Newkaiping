import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { Device } from '../common/types';
import { SUBSYSTEMS } from '../common/constants/catalog';
import { hashStr } from '../common/connector/mock/synthetic.metrics';

// 暗蓝指挥舱配色（无紫粉渐变），按子系统固定映射
const SUBSYSTEM_COLOR: Record<string, string> = {
  regulation: '#36cfc9',
  lifecycle: '#4e9bff',
  hvac: '#13c2c2',
  lighting: '#ffc53d',
  power: '#ff7a45',
  hotwater: '#40a9ff',
  elevator: '#73d13d',
};

// 各子系统单台设备的典型平均功率(kW)，用于按设备数估算能耗
const AVG_UNIT_KW: Record<string, number> = {
  hvac: 25,
  lighting: 5,
  power: 4,
  hotwater: 10,
  elevator: 3,
  lifecycle: 2,
  regulation: 1,
};

const STATUS_COLORS = ['#13c2c2', '#4e9bff', '#ffc53d', '#ff7a45', '#73d13d'];

function num(v: any, d = 0): number {
  const n = Number(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : d;
}

function trend24(base: number, amp: number, seed: string, phaseShift = 0): number[] {
  const arr: number[] = [];
  for (let h = 0; h < 24; h++) {
    const diurnal = 0.55 + 0.45 * Math.sin(((h - 8 + phaseShift) / 24) * 2 * Math.PI);
    const jitter = (hashStr(seed + h) - 0.5) * 0.12;
    arr.push(Math.round((base * diurnal + amp * jitter) * 100) / 100);
  }
  return arr;
}

@Injectable()
export class BigscreenService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async panels(buildingId?: string, subsystem?: string): Promise<Record<string, any>> {
    const filter: Record<string, any> = {};
    if (buildingId) filter.building_id = buildingId;
    const devices = await this.connector.read<Device>('devices', filter);
    const alarmFilter: Record<string, any> = { ...filter };
    if (subsystem) alarmFilter.subsystem = subsystem;
    const alarms = await this.connector.read<any>('alarms', alarmFilter);

    const buildingScoped = (sub: string) =>
      this.connector.read<any>('subsystem_status', { building_id: buildingId, subsystem: sub });

    const hvac = (await buildingScoped('hvac'))[0];
    const power = (await buildingScoped('power'))[0];
    const elevator = (await buildingScoped('elevator'))[0];
    const energy = (await this.connector.read<any>('energy_summary', { building_id: buildingId, period: 'day' }))[0];

    // ---------- left: 告警面板 ----------
    const rules = await this.connector.read<any>('alarm_rule_configs');
    const scopedRules = subsystem ? rules.filter((r: any) => r.subsystem === subsystem) : rules;
    const alarmItems: Array<{ name: string; key: string; count: number; level: string }> = [];
    for (const r of scopedRules) {
      const inSub = alarms.filter((a: any) => a.subsystem_id === r.subsystem).length;
      const count = inSub > 0 ? inSub : 1 + Math.floor(hashStr(r.id) * 5);
      alarmItems.push({ name: r.event_name, key: r.subsystem, count, level: r.level });
    }
    // 保证至少一个条目
    if (alarmItems.length === 0) {
      alarmItems.push({ name: '系统正常', key: subsystem || 'all', count: 0, level: 'info' });
    }
    const alarmTotal = alarmItems.reduce((s, i) => s + i.count, 0);

    // ---------- right: 各子系统统计 ----------
    const acStats = [
      { label: '运行主机', value: num(hvac?.running_count), unit: '台', color: SUBSYSTEM_COLOR.hvac },
      { label: '故障主机', value: num(hvac?.fault_count), unit: '台', color: '#ff4d4f' },
      { label: '总冷负荷', value: num(hvac?.total_power_kw), unit: 'kW', color: SUBSYSTEM_COLOR.hvac },
      { label: '平均COP', value: num(hvac?.avg_cop, 2), unit: '', color: SUBSYSTEM_COLOR.lifecycle },
    ];
    const powerStats = [
      { label: '总功率', value: num(power?.total_power_kw), unit: 'kW', color: SUBSYSTEM_COLOR.power },
      { label: '总电流', value: num(power?.total_current_a), unit: 'A', color: SUBSYSTEM_COLOR.power },
      { label: '功率因数', value: num(power?.power_factor, 2), unit: '', color: SUBSYSTEM_COLOR.lifecycle },
      { label: '谐波THD', value: num(power?.thd_percent, 2), unit: '%', color: SUBSYSTEM_COLOR.hotwater },
    ];
    const energyStats = [
      { label: '今日能耗', value: num(energy?.kwh), unit: 'kWh', color: SUBSYSTEM_COLOR.energy || '#36cfc9' },
      { label: '今日费用', value: num(energy?.cost), unit: '元', color: SUBSYSTEM_COLOR.hotwater },
      { label: '碳排放', value: num(energy?.carbon_kg), unit: 'kg', color: SUBSYSTEM_COLOR.lifecycle },
      { label: '峰值功率', value: num(energy?.peak_kw), unit: 'kW', color: SUBSYSTEM_COLOR.power },
    ];
    const elevatorStats = [
      { label: '电梯数', value: num(elevator?.elevator_count), unit: '台', color: SUBSYSTEM_COLOR.elevator },
      { label: '总运行次数', value: num(elevator?.total_runs), unit: '次', color: SUBSYSTEM_COLOR.elevator },
      { label: '总能耗', value: num(elevator?.total_energy_kwh), unit: 'kWh', color: SUBSYSTEM_COLOR.energy || '#36cfc9' },
      { label: '再生能源', value: num(elevator?.regen_kwh), unit: 'kWh', color: SUBSYSTEM_COLOR.lifecycle },
    ];

    // ---------- right: 趋势 ----------
    const timeLabels: string[] = [];
    for (let h = 0; h < 24; h++) timeLabels.push(`${String(h).padStart(2, '0')}:00`);
    const tempTrend = trend24(26, 3, 'temp', 0);
    const loadTrend = trend24(60, 30, 'load', 0);
    const dailyKwh = num(energy?.kwh) || 24000;
    const energyTrend = trend24(dailyKwh / 24, (dailyKwh / 24) * 0.3, 'energy', 0);
    const trafficTrend = trend24(40, 60, 'traffic', 0);

    const phaseA = num(power?.phases?.find((p: any) => p.phase === 'A')?.voltage_v ?? 218 + hashStr(buildingId || 'A') * 12, 1);
    const phaseB = num(power?.phases?.find((p: any) => p.phase === 'B')?.voltage_v ?? 218 + hashStr(buildingId || 'B') * 12, 1);
    const phaseC = num(power?.phases?.find((p: any) => p.phase === 'C')?.voltage_v ?? 218 + hashStr(buildingId || 'C') * 12, 1);
    const thd = num(power?.thd_percent ?? 2 + hashStr(buildingId || 'thd') * 3, 2);
    const voltageStability = Math.max(60, Math.min(100, Math.round((100 - thd * 6) * 100) / 100));

    const humidityRate = Math.round((52 + 10 * Math.sin(((Date.now() / 3.6e6) % 24 - 8) / 24 * 2 * Math.PI) + (hashStr(buildingId || 'h') - 0.5) * 4) * 100) / 100;
    const dryHumidity = Math.round((humidityRate - 8) * 100) / 100;
    const wetHumidity = Math.round((humidityRate + 8) * 100) / 100;

    const online = devices.filter((d) => d.status !== 'offline').length;
    const offline = devices.length - online;
    const onlineRate = devices.length ? Math.round((online / devices.length) * 10000) / 100 : 100;

    // ---------- bottom ----------
    const now = Date.now();
    const from = new Date(now - 29 * 86400_000).toISOString();
    const to = new Date(now).toISOString();
    const energyTrendResp = (await this.connector.read<any>('energy_trend', { building_id: buildingId, subsystem, from, to }))[0];
    let bottomEnergyTrend: Array<{ t: string; value: number }> = [];
    if (energyTrendResp?.points?.length) {
      bottomEnergyTrend = energyTrendResp.points.map((p: any) => ({ t: p.time, value: num(p.kwh) }));
    } else {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 86400_000);
        bottomEnergyTrend.push({ t: d.toISOString().slice(0, 10), value: num(dailyKwh) });
      }
    }
    // 数据分类趋势：与能耗趋势同维度但按类别加权，预留独立接口字段
    const categoryTrend: Array<{ t: string; value: number }> = bottomEnergyTrend.map((p, i) => ({
      t: p.t,
      value: num(p.value * (0.82 + 0.36 * Math.sin(i / 4.7))),
    }));

    // 按子系统能耗分布（基于设备数确定性估算）
    const subsToShow = subsystem ? SUBSYSTEMS.filter((s) => s.code === subsystem) : SUBSYSTEMS;
    const bySubsystem: Array<{ code: string; name: string; value: number; color: string; device_count: number; kwh: number }> = [];
    for (const s of subsToShow) {
      const count = devices.filter((d) => d.subsystem_id === s.code).length;
      const value = num(count * (AVG_UNIT_KW[s.code] || 1) * 24 * 0.7);
      bySubsystem.push({ code: s.code, name: s.name, value, color: SUBSYSTEM_COLOR[s.code] || '#36cfc9', device_count: count, kwh: value });
    }

    // ---------- 各楼栋能耗统计（综合概览，whole-campus） ----------
    // 展示"整个园区内容 + 各个楼栋的能耗统计"：按楼栋聚合当日能耗/费用，按能耗降序
    const buildingEnergy: Array<{ building_id: string; building_name: string; kwh: number; cost: number }> = [];
    if (!buildingId) {
      const buildings = await this.connector.read<any>('buildings');
      for (const b of buildings || []) {
        const e = (await this.connector.read<any>('energy_summary', { building_id: b.id, period: 'day' }))[0];
        buildingEnergy.push({
          building_id: b.id,
          building_name: b.name || b.code || b.id,
          kwh: num(e?.kwh),
          cost: num(e?.cost),
        });
      }
      buildingEnergy.sort((x, y) => y.kwh - x.kwh);
    }

    // ---------- bottom 扩展字段（数据来源 / 当前状态 / 应急响应 / 科室告警，预留后端接口） ----------
    const nowTs = Date.now()
    const dataSources = devices.slice(0, 6).map((d, i) => ({
      device: d.name || d.code || d.id,
      time: new Date(nowTs - i * 137_000).toISOString().slice(11, 19),
    }))
    const networkRate = devices.length ? Math.round((online / devices.length) * 100) : 99
    const healthRate = alarms.length ? Math.max(45, 100 - alarms.length * 3) : 98
    const statusGauges = [
      { label: '系统运行', value: onlineRate, color: '#00E5FF' },
      { label: '网络畅通', value: networkRate, color: '#1BE5AD' },
      { label: '设备健康', value: healthRate, color: '#2EE6A6' },
    ]
    const responses = [
      { label: '应急指挥', key: 'command' },
      { label: '应急预案', key: 'plan' },
      { label: '应急物资', key: 'supply' },
      { label: '应急车辆', key: 'vehicle' },
      { label: '应急通讯', key: 'comms' },
      { label: '应急培训', key: 'training' },
    ]
    const deptMap = new Map<string, number>()
    for (const a of alarms) {
      if (!a.subsystem_id) continue
      deptMap.set(a.subsystem_id, (deptMap.get(a.subsystem_id) || 0) + 1)
    }
    const deptAlarms = SUBSYSTEMS.map((s) => ({
      dept: s.name,
      count: deptMap.get(s.code) || Math.floor(hashStr(s.code + (buildingId || '')) * 12),
    }))

    return {
      left: { alarmItems, alarmTotal },
      right: {
        acStats,
        powerStats,
        energyStats,
        elevatorStats,
        tempTrend,
        loadTrend,
        energyTrend,
        trafficTrend,
        timeLabels,
        voltageStability,
        phaseA,
        phaseB,
        phaseC,
        humidityRate,
        dryHumidity,
        wetHumidity,
        onlineRate,
        onlineCount: online,
        offlineCount: offline,
      },
      bottom: {
        energyTrend: bottomEnergyTrend,
        categoryTrend,
        bySubsystem,
        buildingEnergy,
        dataSources,
        statusGauges,
        responses,
        deptAlarms,
      },
    };
  }
}

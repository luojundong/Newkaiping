// 合成聚合/状态生成（Mock 模式）：子系统状态、调控总览、生命周期、能耗、3D 点位。
// 真实模式由 RealConnector 对应实现，集合名一致，前端无感（ADR-003）。

import { BUILDINGS, CATEGORY_DEFS } from '../../constants/catalog';
import { Device, DevicePoint, MetricSource } from '../../types';
import { SeedStore } from './seed';
import { hashStr, metricValueAt } from './synthetic.metrics';

const PRICE_PER_KWH = 0.8; // 元/kWh（综合电价，示范值）
const CARBON_PER_KWH = 0.581; // kg CO2/kWh（电网因子，示范值）

function round(n: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// 设备瞬时功率估算（用于聚合，避免构造完整指标数组）
function estimatePower(device: Device): number {
  const cdef = CATEGORY_DEFS[device.category_id];
  if (!cdef) return 0;
  const def = cdef.default_metrics.find((m) => m.key.includes('power')) || cdef.default_metrics[0];
  if (!def) return 0;
  return metricValueAt(def.base, def.amp, def.diurnal, def.min, def.max, new Date(), hashStr(device.id) + hashStr(def.key));
}

function devicesInScope(store: SeedStore, buildingId?: string, subsystem?: string): Device[] {
  return store.devices.filter(
    (d) => (!buildingId || d.building_id === buildingId) && (!subsystem || d.subsystem_id === subsystem),
  );
}

function buildingPowerKw(store: SeedStore, buildingId?: string): number {
  return round(store.devices.filter((d) => !buildingId || d.building_id === buildingId).reduce((s, d) => s + estimatePower(d), 0));
}

function subsystemPowerKw(store: SeedStore, subsystem: string, buildingId?: string): number {
  // 供配电(power)/电梯(elevator) 子系统无设备级台账，功率由 gross_area 合成（见 powerStatus/elevatorStatus）；
  // 与 genEnergySummary(L217) 保持一致：趋势曲线改用合成源，避免 device 聚合为 0。
  if (subsystem === 'power') return powerStatus(store, buildingId).total_power_kw;
  if (subsystem === 'elevator') return elevatorStatus(store, buildingId).total_power_kw ?? 0;
  return round(devicesInScope(store, buildingId, subsystem).reduce((s, d) => s + estimatePower(d), 0));
}

// ---- 子系统状态 ----

export function genSubsystemStatus(store: SeedStore, buildingId: string | undefined, subsystem: string): any {
  switch (subsystem) {
    case 'hvac':
      return hvacStatus(store, buildingId);
    case 'lighting':
      return lightingStatus(store, buildingId);
    case 'power':
      return powerStatus(store, buildingId);
    case 'hotwater':
      return hotwaterStatus(store, buildingId);
    case 'elevator':
      return elevatorStatus(store, buildingId);
    default:
      return { subsystem, building_id: buildingId || null, note: 'unsupported' };
  }
}

function hvacStatus(store: SeedStore, buildingId?: string): any {
  const devs = devicesInScope(store, buildingId, 'hvac');
  const running = devs.filter((d) => d.status === 'running').length;
  const fault = devs.filter((d) => d.status === 'fault').length;
  const totalPower = round(devs.reduce((s, d) => s + estimatePower(d), 0));
  const copDef = CATEGORY_DEFS.air_cooled_module.default_metrics.find((m) => m.key === 'cop');
  const avgCop = round(devs.length ? devs.reduce((s) => s + (copDef ? metricValueAt(copDef.base, copDef.amp, copDef.diurnal, copDef.min, copDef.max, new Date(), hashStr('hvac')) : 5), 0) / Math.max(1, devs.length) : 0);

  const perFloor: any[] = [];
  if (buildingId) {
    const floorMap = new Map<number, { count: number; power: number }>();
    for (const d of devs) {
      const f = d.location.floor;
      const cur = floorMap.get(f) || { count: 0, power: 0 };
      cur.count += 1;
      cur.power += estimatePower(d);
      floorMap.set(f, cur);
    }
    Array.from(floorMap.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([floor, v]) => perFloor.push({ floor, device_count: v.count, power_kw: round(v.power) }));
  }

  const units = devs.slice(0, 50).map((d) => ({
    device_id: d.id,
    name: d.name,
    status: d.status,
    power_kw: round(estimatePower(d)),
    floor: d.location.floor,
    room: d.location.room,
  }));

  return {
    building_id: buildingId || null,
    subsystem: 'hvac',
    device_count: devs.length,
    running_count: running,
    fault_count: fault,
    total_power_kw: totalPower,
    avg_cop: avgCop,
    per_floor: perFloor,
    units,
  };
}

function lightingStatus(store: SeedStore, buildingId?: string): any {
  const blds = buildingId ? BUILDINGS.filter((b) => b.id === buildingId) : BUILDINGS;
  let zoneCount = 0;
  let onCount = 0;
  let totalPower = 0;
  const zones: any[] = [];
  for (const b of blds) {
    const z = b.floors * 3;
    zoneCount += z;
    const on = Math.round(z * (0.6 + hashStr(b.id) * 0.3));
    onCount += on;
    const p = round(b.gross_area / 1000 * (0.6 + hashStr(b.id + 'lt') * 0.4));
    totalPower += p;
    if (buildingId) {
      for (let i = 1; i <= Math.min(8, z); i++) {
        zones.push({ zone: `${b.name} ${i}区`, on: i <= on, power_kw: round(p / Math.min(8, z)), dimming: Math.round(60 + hashStr(b.id + i) * 40) });
      }
    }
  }
  return { building_id: buildingId || null, subsystem: 'lighting', zone_count: zoneCount, on_count: onCount, total_power_kw: round(totalPower), energy_today_kwh: round(totalPower * 12), zones };
}

function powerStatus(store: SeedStore, buildingId?: string): any {
  const blds = buildingId ? BUILDINGS.filter((b) => b.id === buildingId) : BUILDINGS;
  let totalKw = 0;
  const feeders: any[] = [];
  for (const b of blds) {
    const base = b.gross_area / 800;
    const kw = round(base * (0.8 + hashStr(b.id + 'pw') * 0.5));
    totalKw += kw;
    if (buildingId) {
      feeders.push({ name: `${b.name} 进线`, voltage_v: 380, current_a: round(kw * 1.5), power_kw: kw, power_factor: round(0.9 + hashStr(b.id) * 0.08, 3) });
    }
  }
  const phases = ['A', 'B', 'C'].map((ph) => ({
    phase: ph,
    voltage_v: round(218 + hashStr(buildingId || 'all' + ph) * 12, 1),
    current_a: round(totalKw / 3 / 0.22),
    power_kw: round(totalKw / 3),
  }));
  return {
    building_id: buildingId || null,
    subsystem: 'power',
    total_power_kw: round(totalKw),
    total_current_a: round(totalKw / 0.22),
    power_factor: round(0.92 + hashStr(buildingId || 'all') * 0.06, 3),
    thd_percent: round(2 + hashStr(buildingId || 'all' + 'thd') * 3, 2),
    phases,
    feeders,
  };
}

function hotwaterStatus(store: SeedStore, buildingId?: string): any {
  const devs = devicesInScope(store, buildingId, 'hotwater');
  const running = devs.filter((d) => d.status === 'running').length;
  const wdef = CATEGORY_DEFS.heat_pump_water.default_metrics;
  const waterTemp = wdef.find((m) => m.key === 'water_temp_c')!;
  const tankTemp = wdef.find((m) => m.key === 'tank_temp_c')!;
  const copDef = wdef.find((m) => m.key === 'cop')!;
  const compDef = wdef.find((m) => m.key === 'compressor_power_kw')!;
  const avgWater = round(devs.length ? devs.reduce((s, d) => s + metricValueAt(waterTemp.base, waterTemp.amp, waterTemp.diurnal, waterTemp.min, waterTemp.max, new Date(), hashStr(d.id)), 0) / devs.length : 0);
  const avgTank = round(devs.length ? devs.reduce((s, d) => s + metricValueAt(tankTemp.base, tankTemp.amp, tankTemp.diurnal, tankTemp.min, tankTemp.max, new Date(), hashStr(d.id)), 0) / devs.length : 0);
  const avgCop = round(devs.length ? devs.reduce((s, d) => s + metricValueAt(copDef.base, copDef.amp, copDef.diurnal, copDef.min, copDef.max, new Date(), hashStr(d.id)), 0) / devs.length : 0);
  const totalComp = round(devs.reduce((s, d) => s + metricValueAt(compDef.base, compDef.amp, compDef.diurnal, compDef.min, compDef.max, new Date(), hashStr(d.id)), 0));
  const units = devs.slice(0, 50).map((d) => ({
    device_id: d.id,
    name: d.name,
    water_temp_c: metricValueAt(waterTemp.base, waterTemp.amp, waterTemp.diurnal, waterTemp.min, waterTemp.max, new Date(), hashStr(d.id)),
    tank_temp_c: metricValueAt(tankTemp.base, tankTemp.amp, tankTemp.diurnal, tankTemp.min, tankTemp.max, new Date(), hashStr(d.id)),
    cop: metricValueAt(copDef.base, copDef.amp, copDef.diurnal, copDef.min, copDef.max, new Date(), hashStr(d.id)),
    compressor_power_kw: metricValueAt(compDef.base, compDef.amp, compDef.diurnal, compDef.min, compDef.max, new Date(), hashStr(d.id)),
  }));
  return { building_id: buildingId || null, subsystem: 'hotwater', unit_count: devs.length, running_count: running, avg_water_temp_c: avgWater, avg_tank_temp_c: avgTank, avg_cop: avgCop, total_compressor_power_kw: totalComp, units };
}

function elevatorStatus(store: SeedStore, buildingId?: string): any {
  const blds = buildingId ? BUILDINGS.filter((b) => b.id === buildingId) : BUILDINGS;
  let count = 0;
  let runs = 0;
  let energy = 0;
  let regen = 0;
  let standby = 0;
  const units: any[] = [];
  for (const b of blds) {
    const n = Math.max(1, Math.floor(b.floors / 3));
    count += n;
    const r = Math.round(400 + hashStr(b.id + 'el') * 600);
    const e = round(r * 0.02 * (0.8 + hashStr(b.id) * 0.4));
    runs += r;
    energy += e;
    regen += round(e * 0.25);
    standby += round(n * 1.2);
    if (buildingId) {
      for (let i = 1; i <= n; i++) {
        units.push({ device_id: `elev-${b.id}-${i}`, name: `${b.name} ${i}号电梯`, runs: r, energy_kwh: round(e), regen_kwh: round(e * 0.25), standby_kwh: round(1.2) });
      }
    }
  }
  return { building_id: buildingId || null, subsystem: 'elevator', elevator_count: count, total_runs: runs, total_energy_kwh: round(energy), regen_kwh: round(regen), standby_kwh: round(standby), units };
}

// ---- 调控总览 / 生命周期 / 能耗 ----

export function genRegulationOverview(store: SeedStore, buildingId?: string): any {
  const totalKw = buildingPowerKw(store, buildingId);
  const dailyKwh = round(totalKw * 24 * 0.7);
  const loadCurve = [];
  for (let h = 0; h < 24; h++) {
    const shape = 0.55 + 0.45 * Math.sin(((h - 8) / 24) * 2 * Math.PI);
    loadCurve.push({ time: `${String(h).padStart(2, '0')}:00`, kw: round(totalKw * shape) });
  }
  const subs = ['hvac', 'lighting', 'power', 'hotwater', 'elevator', 'lifecycle', 'regulation'];
  const bySubsystem = subs.map((s) => {
    const kw = s === 'lighting' ? lightingStatus(store, buildingId).total_power_kw : s === 'power' ? powerStatus(store, buildingId).total_power_kw : s === 'hotwater' ? hotwaterStatus(store, buildingId).total_compressor_power_kw : subsystemPowerKw(store, s, buildingId);
    const kwh = round(kw * 24 * 0.7);
    return { subsystem: s, kwh, cost: round(kwh * PRICE_PER_KWH), carbon_kg: round(kwh * CARBON_PER_KWH) };
  });
  return {
    scope: buildingId || 'all',
    total_kwh: dailyKwh,
    total_cost: round(dailyKwh * PRICE_PER_KWH),
    total_carbon_kg: round(dailyKwh * CARBON_PER_KWH),
    peak_kw: round(totalKw * 1.3),
    load_curve: loadCurve,
    by_subsystem: bySubsystem,
  };
}

export function genLifecycleEquipment(store: SeedStore, buildingId?: string): any {
  const devs = devicesInScope(store, buildingId);
  const byStatus: Record<string, number> = {};
  const items = devs.map((d) => {
    const age = 2026 - parseInt(d.install_date.slice(0, 4), 10);
    let score = 100 - age * 2;
    if (d.status === 'fault') score -= 40;
    else if (d.status === 'maintenance') score -= 15;
    else if (d.status === 'offline') score -= 25;
    else if (d.status === 'stopped') score -= 5;
    score = Math.max(0, Math.min(100, score));
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    const installYear = parseInt(d.install_date.slice(0, 4), 10);
    const next = `${installYear + 1}-${d.install_date.slice(5)}`;
    return { device_id: d.id, name: d.name, category: CATEGORY_DEFS[d.category_id]?.name || d.category_id, building_id: d.building_id, status: d.status, health_score: score, install_date: d.install_date, next_maintenance: next };
  });
  items.sort((a, b) => a.health_score - b.health_score);
  return { scope: buildingId || 'all', total: devs.length, by_status: byStatus, items: items.slice(0, 100) };
}

export function genLifecycleMaintenance(store: SeedStore): any {
  const plans: any[] = [];
  let dueSoon = 0;
  let overdue = 0;
  let completed = 0;
  const now = Date.now();
  store.devices.slice(0, 200).forEach((d, i) => {
    const planType = CATEGORY_DEFS[d.category_id]?.control_capable ? '保养' : '巡检';
    const lastDate = new Date(now - (60 + (i % 120)) * 86400_000);
    const nextDate = new Date(now + (20 + (i % 90)) * 86400_000);
    const status = nextDate.getTime() < now ? 'overdue' : nextDate.getTime() < now + 30 * 86400_000 ? 'due_soon' : 'scheduled';
    if (status === 'overdue') overdue++;
    else if (status === 'due_soon') dueSoon++;
    else completed++;
    plans.push({ device_id: d.id, name: d.name, building_id: d.building_id, plan_type: planType, last_date: lastDate.toISOString().slice(0, 10), next_date: nextDate.toISOString().slice(0, 10), status });
  });
  return { plans: plans.slice(0, 100), stats: { due_soon: dueSoon, overdue: overdue, scheduled: completed } };
}

export function genEnergySummary(store: SeedStore, buildingId?: string, period = 'day'): any {
  const kw = buildingPowerKw(store, buildingId);
  const factor: Record<string, number> = { hour: 1, day: 24 * 0.7, month: 24 * 0.7 * 30, year: 24 * 0.7 * 365 };
  const hours = factor[period] ?? factor.day;
  const kwh = round(kw * hours);
  return { building_id: buildingId || null, period, kwh, cost: round(kwh * PRICE_PER_KWH), carbon_kg: round(kwh * CARBON_PER_KWH), peak_kw: round(kw * 1.3) };
}

export function genEnergyTrend(store: SeedStore, buildingId?: string, subsystem?: string, from?: string, to?: string): any {
  let start: number;
  let end = Date.now();
  if (from && to) {
    start = new Date(from).getTime();
    end = new Date(to).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) {
      start = end - 7 * 86400_000;
    }
  } else {
    start = end - 7 * 86400_000;
  }
  const days = Math.max(1, Math.round((end - start) / 86400_000));
  const points: any[] = [];
  const baseKw = subsystem ? subsystemPowerKw(store, subsystem, buildingId) : buildingPowerKw(store, buildingId);
  for (let i = 0; i <= days; i++) {
    const t = new Date(start + i * 86400_000);
    const dailyKwh = round(baseKw * 24 * 0.7);
    points.push({ time: t.toISOString().slice(0, 10), kwh: dailyKwh, cost: round(dailyKwh * PRICE_PER_KWH), carbon_kg: round(dailyKwh * CARBON_PER_KWH) });
  }
  return { building_id: buildingId || null, subsystem: subsystem || null, points };
}

export function genScenePoints(store: SeedStore, buildingId?: string, subsystem?: string): DevicePoint[] {
  return store.devicePoints.filter(
    (p) => (!buildingId || p.building_id === buildingId) && (!subsystem || p.subsystem_code === subsystem) && p.visible,
  );
}

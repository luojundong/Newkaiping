// 合成时序指标生成（Mock 模式）：随机游走 + 昼夜负荷曲线 + 偶发故障。
// 真实模式由对应 RealConnector 通过 normalize() 映射，指标模型一致（ADR-003）。

import { CATEGORY_DEFS } from '../../constants/catalog';
import { Alarm, Device, Metric } from '../../types';
import { SeedStore } from './seed';

// 字符串哈希（稳定盐值）
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// 某时刻某指标值：标称 + 昼夜分量 + 分钟级平滑噪声
export function metricValueAt(
  base: number,
  amp: number,
  diurnal: number,
  min: number,
  max: number,
  t: Date,
  salt: number,
): number {
  const hour = t.getHours() + t.getMinutes() / 60;
  // 昼夜峰值约 14:00
  const diurnalWave = diurnal ? Math.sin(((hour - 8) / 24) * 2 * Math.PI) : 0;
  const minutePhase = t.getTime() / 60000;
  const noise = Math.sin(salt * 12.9898 + minutePhase * 0.7) * 0.5;
  let v = base + amp * diurnalWave + amp * 0.12 * noise;
  v = Math.max(min, Math.min(max, v));
  return Math.round(v * 100) / 100;
}

// 生成单设备指标（latest 或历史区间）
export function genDeviceMetrics(
  device: Device,
  keys?: string[],
  from?: string,
  to?: string,
): Metric[] {
  const cdef = CATEGORY_DEFS[device.category_id];
  if (!cdef) return [];
  const defs = cdef.default_metrics.filter((d) => !keys || keys.length === 0 || keys.includes(d.key));
  const salt = hashStr(device.id);
  const fault = device.status === 'fault';

  if (from && to) {
    const start = new Date(from).getTime();
    const end = new Date(to).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) {
      return genDeviceMetrics(device, keys); // 参数非法回退 latest
    }
    const stepMs = 3600_000; // 1 小时一个点
    const maxPoints = 240;
    const span = end - start;
    const steps = Math.min(maxPoints, Math.max(2, Math.floor(span / stepMs)));
    const realStep = span / steps;
    const out: Metric[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = new Date(start + realStep * s);
      for (const d of defs) {
        out.push({
          device_id: device.id,
          metric_key: d.key,
          value: metricValueAt(d.base, d.amp, d.diurnal, d.min, d.max, t, salt + hashStr(d.key)),
          unit: d.unit,
          time: t.toISOString(),
          quality: fault && d.key === defs[0].key ? 'bad' : 'good',
          source: 'mock',
        });
      }
    }
    return out;
  }

  const t = new Date();
  return defs.map((d) => ({
    device_id: device.id,
    metric_key: d.key,
    value: metricValueAt(d.base, d.amp, d.diurnal, d.min, d.max, t, salt + hashStr(d.key)),
    unit: d.unit,
    time: t.toISOString(),
    quality: fault && d.key === defs[0].key ? 'bad' : 'good',
    source: 'mock',
  }));
}

// 选取实时推送目标设备
export function pickLiveDevices(
  store: SeedStore,
  buildingId?: string,
  subsystem?: string,
  deviceIds?: string[],
): Device[] {
  let pool = store.devices;
  if (deviceIds && deviceIds.length > 0) {
    const set = new Set(deviceIds);
    return pool.filter((d) => set.has(d.id)).slice(0, 80);
  }
  if (buildingId) {
    pool = pool.filter((d) => d.building_id === buildingId);
  }
  if (subsystem) {
    pool = pool.filter((d) => d.subsystem_id === subsystem);
  }
  return pool.slice(0, 60);
}

// WS 实时批次：指标增量 + 范围内告警事件
export function genLiveBatch(
  store: SeedStore,
  buildingId?: string,
  subsystem?: string,
  deviceIds?: string[],
): { metrics: Metric[]; alarms: Alarm[] } {
  const targets = pickLiveDevices(store, buildingId, subsystem, deviceIds);
  const metrics: Metric[] = [];
  for (const d of targets) {
    const ms = genDeviceMetrics(d).slice(0, 3); // 每设备取前 3 个关键指标作为增量
    metrics.push(...ms);
  }
  const now = Date.now();
  const alarms = store.alarms.filter((a) => {
    if (a.status === 'cleared' || a.status === 'suppressed') return false;
    if (buildingId && a.building_id !== buildingId) return false;
    if (subsystem && a.subsystem_id !== subsystem) return false;
    // 近 10 分钟内有活动的告警视为实时事件
    return new Date(a.last_at).getTime() >= now - 10 * 60_000;
  });
  return { metrics, alarms };
}

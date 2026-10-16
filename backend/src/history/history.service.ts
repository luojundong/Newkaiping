import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { Device } from '../common/types';
import { CATEGORY_DEFS } from '../common/constants/catalog';
import { hashStr } from '../common/connector/mock/synthetic.metrics';

export interface HistoryQuery {
  building_id?: string;
  device_id?: string;
  subsystem?: string;
  from?: string;
  to?: string;
  keys?: string[];
  page?: number;
  limit?: number;
}

export interface MetricRow {
  ts: string;
  device_id: string;
  device_name: string;
  building_id: string;
  key: string;
  value: number;
  unit: string;
}

const MAX_DEVICES = 25;
const MAX_TS = 60;
const MAX_KEYS = 4;

// 确定性合成指标值（与种子同思路：标称 + 昼夜分量 + 稳定抖动）
function valueAt(base: number, ts: string, salt: string): number {
  const d = new Date(ts);
  const hour = d.getHours() + d.getMinutes() / 60;
  const diurnal = 0.55 + 0.45 * Math.sin(((hour - 8) / 24) * 2 * Math.PI);
  const jitter = (hashStr(salt) - 0.5) * 0.2;
  const v = base * (0.7 + 0.5 * diurnal + jitter);
  return Math.round(v * 100) / 100;
}

@Injectable()
export class HistoryService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  private timeList(from?: string, to?: string): string[] {
    const end = to ? new Date(to).getTime() : Date.now();
    let start: number;
    if (from) {
      start = new Date(from).getTime();
      if (isNaN(start) || start >= end) start = end - 30 * 86400_000;
    } else {
      start = end - 30 * 86400_000; // 近 30 天
    }
    const span = end - start;
    const steps = Math.min(MAX_TS, Math.max(2, Math.floor(span / (6 * 3600_000))));
    const list: string[] = [];
    for (let i = 0; i <= steps; i++) {
      list.push(new Date(start + (span * i) / steps).toISOString());
    }
    return list;
  }

  private async buildRows(q: HistoryQuery): Promise<MetricRow[]> {
    const filter: Record<string, any> = {};
    if (q.building_id) filter.building_id = q.building_id;
    if (q.subsystem) filter.subsystem = q.subsystem;
    if (q.device_id) filter.id = q.device_id;

    let devices = await this.connector.read<Device>('devices', filter);
    devices = devices.slice(0, MAX_DEVICES);

    const tsList = this.timeList(q.from, q.to);
    const rows: MetricRow[] = [];

    for (const dev of devices) {
      const cdef = CATEGORY_DEFS[dev.category_id];
      if (!cdef) continue;
      let defs = cdef.default_metrics;
      if (q.keys && q.keys.length) {
        defs = defs.filter((m) => q.keys!.includes(m.key));
      }
      defs = defs.slice(0, MAX_KEYS);
      if (!defs.length) continue;

      for (const ts of tsList) {
        for (const m of defs) {
          rows.push({
            ts,
            device_id: dev.id,
            device_name: dev.name,
            building_id: dev.building_id,
            key: m.key,
            value: valueAt(m.base, ts, dev.id + m.key + ts),
            unit: m.unit,
          });
        }
      }
    }
    rows.sort((a, b) => a.ts.localeCompare(b.ts) || a.device_id.localeCompare(b.device_id));
    return rows;
  }

  async query(q: HistoryQuery): Promise<{ items: MetricRow[]; total: number }> {
    const rows = await this.buildRows(q);
    const total = rows.length;
    const page = q.page || 1;
    const limit = q.limit || 20;
    const start = (page - 1) * limit;
    return { items: rows.slice(start, start + limit), total };
  }

  async exportRows(q: HistoryQuery, cap = 5000): Promise<MetricRow[]> {
    const rows = await this.buildRows(q);
    return rows.slice(0, cap);
  }
}

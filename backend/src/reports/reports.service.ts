import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { Alarm, Device } from '../common/types';
import { HistoryService } from '../history/history.service';
import { toCsv } from '../common/csv.util';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(CONNECTOR_TOKEN) private readonly connector: Connector,
    private readonly history: HistoryService,
  ) {}

  async buildCsv(type: string, buildingId?: string, from?: string, to?: string): Promise<{ filename: string; csv: string }> {
    const ts = Date.now();
    const f = (ext: string) => `report_${type}_${ts}.${ext}`;

    if (type === 'devices') {
      const filter: Record<string, any> = {};
      if (buildingId) filter.building_id = buildingId;
      const devices = await this.connector.read<Device>('devices', filter);
      const headers = ['id', 'code', 'name', 'building_id', 'subsystem_id', 'category_id', 'model', 'manufacturer', 'status', 'floor', 'room', 'install_date'];
      const rows = devices.map((d) => [
        d.id, d.code, d.name, d.building_id, d.subsystem_id, d.category_id, d.model, d.manufacturer, d.status, d.location.floor, d.location.room, d.install_date,
      ]);
      return { filename: f('csv'), csv: toCsv(headers, rows) };
    }

    if (type === 'energy') {
      const summary = (await this.connector.read<any>('energy_summary', { building_id: buildingId, period: 'day' }))[0];
      const now = Date.now();
      const trend = (await this.connector.read<any>('energy_trend', {
        building_id: buildingId,
        from: new Date(now - 29 * 86400_000).toISOString(),
        to: new Date(now).toISOString(),
      }))[0];
      const headers = ['t', 'kwh', 'cost', 'carbon_kg'];
      const rows: Array<Array<unknown>> = [];
      if (trend?.points?.length) {
        for (const p of trend.points) rows.push([p.time, p.kwh, p.cost, p.carbon_kg]);
      } else if (summary) {
        rows.push(['今日汇总', summary.kwh, summary.cost, summary.carbon_kg]);
      }
      return { filename: f('csv'), csv: toCsv(headers, rows) };
    }

    if (type === 'alarms') {
      const filter: Record<string, any> = {};
      if (buildingId) filter.building_id = buildingId;
      const alarms = await this.connector.read<Alarm>('alarms', filter);
      const headers = ['id', 'title', 'level', 'subsystem', 'building_id', 'device_id', 'status', 'first_at', 'last_at'];
      const rows = alarms.map((a) => [a.id, a.title, a.level, a.subsystem_id, a.building_id, a.device_id, a.status, a.first_at, a.last_at]);
      return { filename: f('csv'), csv: toCsv(headers, rows) };
    }

    // history（默认）
    const rows = await this.history.exportRows({ building_id: buildingId, from, to });
    const headers = ['ts', 'device_id', 'device_name', 'building_id', 'key', 'value', 'unit'];
    const data = rows.map((r) => [r.ts, r.device_id, r.device_name, r.building_id, r.key, r.value, r.unit]);
    return { filename: f('csv'), csv: toCsv(headers, data) };
  }
}

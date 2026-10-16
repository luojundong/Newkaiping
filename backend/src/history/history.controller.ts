import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ok } from '../common/response.util';
import { toCsv } from '../common/csv.util';

@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly svc: HistoryService) {}

  @Get()
  async list(
    @Query('building_id') buildingId?: string,
    @Query('device_id') deviceId?: string,
    @Query('subsystem') subsystem?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('keys') keys?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const q = {
      building_id: buildingId,
      device_id: deviceId,
      subsystem,
      from,
      to,
      keys: keys ? keys.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    };
    return ok(await this.svc.query(q));
  }

  @Get('export')
  async exportCsv(
    @Query('building_id') buildingId?: string,
    @Query('device_id') deviceId?: string,
    @Query('subsystem') subsystem?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('keys') keys?: string,
    @Res() res?: any,
  ) {
    const q = {
      building_id: buildingId,
      device_id: deviceId,
      subsystem,
      from,
      to,
      keys: keys ? keys.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
    };
    const rows = await this.svc.exportRows(q);
    const csv = toCsv(
      ['ts', 'device_id', 'device_name', 'building_id', 'key', 'value', 'unit'],
      rows.map((r) => [r.ts, r.device_id, r.device_name, r.building_id, r.key, r.value, r.unit]),
    );
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename=history_${Date.now()}.csv`);
    res.send(csv);
  }
}

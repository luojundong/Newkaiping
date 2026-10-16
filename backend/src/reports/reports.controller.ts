import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly svc: ReportsService,
    private readonly logs: LogsService,
  ) {}

  @Get('export')
  async exportCsv(
    @Req() req: any,
    @CurrentUser() user: AuthedUser,
    @Query('type') type?: string,
    @Query('format') format?: string,
    @Query('building_id') buildingId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: any,
  ) {
    const reportType = type || 'history';
    const { filename, csv } = await this.svc.buildCsv(reportType, buildingId, from, to);
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'reports',
      action: 'export',
      target: `报表 ${reportType}`,
      detail: `building=${buildingId || '全部'}; 范围=${from || '起'}~${to || '今'}; 格式=${format || 'csv'}`,
      ip: req.ip,
    });
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  }
}

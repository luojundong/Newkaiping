import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { AlarmRuleDto } from './dto/alarm-rule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/response.util';

@Controller('alarms')
@UseGuards(JwtAuthGuard)
export class AlarmsController {
  constructor(private readonly svc: AlarmsService) {}

  @Get()
  async list(
    @Query('building_id') buildingId: string,
    @Query('subsystem') subsystem: string,
    @Query('level') level: string,
    @Query('status') status: string,
  ) {
    const filter: Record<string, any> = {};
    if (buildingId) filter.building_id = buildingId;
    if (subsystem) filter.subsystem = subsystem;
    if (level) filter.level = level;
    if (status) filter.status = status;
    return ok({ items: await this.svc.list(filter) });
  }

  @Post(':id/ack')
  async ack(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return ok(await this.svc.ack(id, user.userId));
  }

  @Post(':id/clear')
  async clear(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return ok(await this.svc.clear(id, user.userId));
  }

  @Get('rules')
  async rules() {
    return ok({ items: await this.svc.getRules() });
  }

  @Post('rules')
  async createRule(@Body() dto: AlarmRuleDto) {
    return ok(await this.svc.upsertRule(dto), '规则已创建');
  }
}

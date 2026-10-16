import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AlarmRulesService } from './alarm-rules.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('alarm-rules')
@UseGuards(JwtAuthGuard)
export class AlarmRulesController {
  constructor(
    private readonly svc: AlarmRulesService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list(@Query('subsystem') subsystem?: string, @Query('enabled') enabled?: string) {
    const enabledBool = enabled === undefined ? undefined : enabled === 'true' || enabled === '1';
    return ok(await this.svc.list(subsystem, enabledBool));
  }

  @Post()
  async create(@Req() req: any, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const name = body?.name || `(未命名)`;
    try {
      const created = await this.svc.create(body);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'alarm-rules',
        action: 'create',
        target: `告警规则 ${created?.id || name}`,
        detail: `name=${name}; subsystem=${body?.subsystem || ''}`,
        before: null,
        after: created,
        reason: body?.reason,
        ip: req.ip,
      });
      return ok(created, '告警规则已创建');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'alarm-rules',
        action: 'create',
        target: `告警规则 ${name}`,
        detail: `name=${name}; 错误=${String((e && e.message) || e)}`,
        reason: body?.reason,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    try {
      const before = (await this.svc.list()).find((r) => r.id === id) || null;
      const updated = await this.svc.update(id, body);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'alarm-rules',
        action: 'update',
        target: `告警规则 ${id}`,
        detail: `name=${body?.name || ''}`,
        before,
        after: updated,
        reason: body?.reason,
        ip: req.ip,
      });
      return ok(updated, '告警规则已更新');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'alarm-rules',
        action: 'update',
        target: `告警规则 ${id}`,
        detail: `错误=${String((e && e.message) || e)}`,
        reason: body?.reason,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string, @CurrentUser() user: AuthedUser) {
    try {
      const before = (await this.svc.list()).find((r) => r.id === id) || null;
      await this.svc.remove(id);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'alarm-rules',
        action: 'delete',
        target: `告警规则 ${id}`,
        before,
        after: null,
        ip: req.ip,
      });
      return ok(null, '告警规则已删除');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'alarm-rules',
        action: 'delete',
        target: `告警规则 ${id}`,
        detail: `错误=${String((e && e.message) || e)}`,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { DeviceTypesService } from './device-types.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('device-types')
@UseGuards(JwtAuthGuard)
export class DeviceTypesController {
  constructor(
    private readonly svc: DeviceTypesService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list() {
    return ok({ items: await this.svc.list() });
  }

  @Post()
  async create(@Req() req: any, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const name = body?.name || body?.code || '(未命名)';
    try {
      const created = await this.svc.create(body);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'device-types',
        action: 'create',
        target: `设备类型 ${created?.id || name}`,
        detail: `code=${body?.code || ''}; name=${name}`,
        before: null,
        after: created,
        reason: body?.reason,
        ip: req.ip,
      });
      return ok(created, '设备类型已创建');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'device-types',
        action: 'create',
        target: `设备类型 ${name}`,
        detail: `code=${body?.code || ''}; 错误=${String((e && e.message) || e)}`,
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
      const before = (await this.svc.list()).find((d) => d.id === id) || null;
      const updated = await this.svc.update(id, body);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'device-types',
        action: 'update',
        target: `设备类型 ${id}`,
        detail: `name=${body?.name || ''}`,
        before,
        after: updated,
        reason: body?.reason,
        ip: req.ip,
      });
      return ok(updated, '设备类型已更新');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'device-types',
        action: 'update',
        target: `设备类型 ${id}`,
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
      const before = (await this.svc.list()).find((d) => d.id === id) || null;
      await this.svc.remove(id);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'device-types',
        action: 'delete',
        target: `设备类型 ${id}`,
        before,
        after: null,
        ip: req.ip,
      });
      return ok(null, '设备类型已删除');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'device-types',
        action: 'delete',
        target: `设备类型 ${id}`,
        detail: `错误=${String((e && e.message) || e)}`,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ControlGroupsService } from './control-groups.service';
import { GroupControlCommandDto } from '../common/dto/group-control-command.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('control-groups')
@UseGuards(JwtAuthGuard)
export class ControlGroupsController {
  constructor(
    private readonly svc: ControlGroupsService,
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
        module: 'control-groups',
        action: 'create',
        target: `控制群组 ${created?.id || name}`,
        detail: `name=${name}; code=${body?.code || ''}`,
        before: null,
        after: created,
        reason: body?.reason,
        ip: req.ip,
      });
      return ok(created, '控制群组已创建');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'create',
        target: `控制群组 ${name}`,
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
    const name = body?.name || id;
    try {
      const before = (await this.svc.list()).find((g) => g.id === id) || null;
      const updated = await this.svc.update(id, body);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'update',
        target: `控制群组 ${id}`,
        detail: `name=${name}`,
        before,
        after: updated,
        reason: body?.reason,
        ip: req.ip,
      });
      return ok(updated, '控制群组已更新');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'update',
        target: `控制群组 ${id}`,
        detail: `name=${name}; 错误=${String((e && e.message) || e)}`,
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
      const before = (await this.svc.list()).find((g) => g.id === id) || null;
      await this.svc.remove(id);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'delete',
        target: `控制群组 ${id}`,
        before,
        after: null,
        ip: req.ip,
      });
      return ok(null, '控制群组已删除');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'delete',
        target: `控制群组 ${id}`,
        detail: `错误=${String((e && e.message) || e)}`,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }

  @Post(':id/control')
  async control(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: GroupControlCommandDto,
    @CurrentUser() user: AuthedUser,
  ) {
    const detail = `动作=${dto.action}; 子系统=${dto.subsystem || '默认'}; 设备=${dto.device_id || '群组级'}; 载荷=${JSON.stringify(dto.payload || {})}`;
    try {
      const result = await this.svc.control(id, dto);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'control',
        target: `控制群组 ${id}`,
        detail,
        reason: dto.reason,
        ip: req.ip,
      });
      return ok(result, '群组指令已下发');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'control-groups',
        action: 'control',
        target: `控制群组 ${id}`,
        detail: `${detail}; 错误=${String((e && e.message) || e)}`,
        reason: dto.reason,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }
}

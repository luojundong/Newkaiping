import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(
    private readonly svc: RolesService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list() {
    return ok(await this.svc.list());
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.create(body);
    await this.logs.record({
      username: user.username,
      module: 'roles',
      action: 'create',
      target: `角色: ${body.name || body.code}`,
      detail: `新增角色 ${body.name || body.code}`,
      result: 'success',
    });
    return ok(data, '角色已创建');
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.update(id, body);
    await this.logs.record({
      username: user.username,
      module: 'roles',
      action: 'update',
      target: `角色: ${body.name || id}`,
      detail: `更新角色 ${body.name || id}`,
      result: 'success',
    });
    return ok(data, '角色已更新');
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.remove(id);
    await this.logs.record({
      username: user.username,
      module: 'roles',
      action: 'delete',
      target: `角色: ${id}`,
      detail: `删除角色 ${id}`,
      result: 'success',
    });
    return ok(null, '角色已删除');
  }
}

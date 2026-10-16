import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly svc: UsersService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('keyword') keyword?: string,
  ) {
    return ok(await this.svc.list(Number(page) || 1, Number(limit) || 20, keyword));
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.create(body);
    await this.logs.record({
      username: user.username,
      module: 'users',
      action: 'create',
      target: `用户: ${body.username}`,
      detail: `新增用户 ${body.username}（角色 ${body.role}）`,
      result: 'success',
    });
    return ok(data, '用户已创建');
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.update(id, body);
    await this.logs.record({
      username: user.username,
      module: 'users',
      action: 'update',
      target: `用户: ${body.username || id}`,
      detail: `更新用户 ${body.username || id}`,
      result: 'success',
    });
    return ok(data, '用户已更新');
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.remove(id);
    await this.logs.record({
      username: user.username,
      module: 'users',
      action: 'delete',
      target: `用户: ${id}`,
      detail: `删除用户 ${id}`,
      result: 'success',
    });
    return ok(null, '用户已删除');
  }
}

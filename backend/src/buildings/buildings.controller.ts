import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BuildingsService } from './buildings.service';
import { BuildingSubsystemItemDto } from './dto/building-subsystems.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';
import { BizError } from '../common/response.util';

@Controller('buildings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BuildingsController {
  constructor(
    private readonly svc: BuildingsService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list() {
    return ok({ items: await this.svc.listBuildings() });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return ok(await this.svc.getBuilding(id));
  }

  @Get(':id/subsystems')
  async subsystems(@Param('id') id: string) {
    return ok({ items: await this.svc.getSubsystems(id) });
  }

  @Put(':id/subsystems')
  @Roles('admin')
  async putSubsystems(@Param('id') id: string, @Body() items: BuildingSubsystemItemDto[], @CurrentUser() user: AuthedUser) {
    if (!Array.isArray(items)) {
      throw new BizError(40000, '请求体必须为子系统配置数组', 400);
    }
    const data = await this.svc.putSubsystems(id, items);
    await this.logs.record({
      username: user.username,
      module: 'buildings',
      action: 'config',
      target: `楼栋子系统: ${id}`,
      detail: `更新楼栋 ${id} 的子系统启用配置`,
      result: 'success',
    });
    return ok({ items: data });
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.create(body);
    await this.logs.record({
      username: user.username,
      module: 'buildings',
      action: 'create',
      target: `楼栋: ${body.name || body.code}`,
      detail: `新增楼栋 ${body.code}（${body.name}）`,
      result: 'success',
    });
    return ok(data, '楼栋已创建');
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.update(id, body);
    await this.logs.record({
      username: user.username,
      module: 'buildings',
      action: 'update',
      target: `楼栋: ${body.name || id}`,
      detail: `更新楼栋 ${body.code || id}`,
      result: 'success',
    });
    return ok(data, '楼栋已更新');
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.remove(id);
    await this.logs.record({
      username: user.username,
      module: 'buildings',
      action: 'delete',
      target: `楼栋: ${id}`,
      detail: `删除楼栋 ${id}`,
      result: 'success',
    });
    return ok(null, '楼栋已删除');
  }
}

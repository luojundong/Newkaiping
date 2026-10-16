import { BadRequestException, Body, Controller, Delete, Get, Put, Query, UseGuards } from '@nestjs/common';
import { BigscreenService } from './bigscreen.service';
import { BigscreenConfigService, BigscreenConfigEntry } from './bigscreen-config.service';
import { BigscreenLayoutService, BigscreenLayoutEntry } from './bigscreen-layout.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/response.util';
import { LogsService } from '../logs/logs.service';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';

@Controller('bigscreen')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BigscreenController {
  constructor(
    private readonly svc: BigscreenService,
    private readonly configSvc: BigscreenConfigService,
    private readonly layoutSvc: BigscreenLayoutService,
    private readonly logs: LogsService,
  ) {}

  @Get('panels')
  async panels(@Query('building_id') buildingId?: string, @Query('subsystem') subsystem?: string) {
    return ok(await this.svc.panels(buildingId, subsystem));
  }

  // 单系统大屏样式配置（合并默认值）
  @Get('config')
  async config(@Query('system') system = 'overview') {
    return ok(this.configSvc.getConfig(system));
  }

  // 全部系统已保存配置（供后台编辑器列表）
  @Get('configs')
  async configs() {
    return ok(this.configSvc.getAllConfigs());
  }

  // 保存单系统大屏样式配置（后台 DIY 编辑器调用）
  @Put('config')
  @Roles('admin')
  async saveConfig(@Body() body: { system: string; entry: BigscreenConfigEntry }, @CurrentUser() user: AuthedUser) {
    if (!body || !body.system) throw new BadRequestException('system 参数必填');
    if (!body.entry) throw new BadRequestException('entry 参数必填');
    const before = this.configSvc.getConfig(body.system);
    const data = this.configSvc.saveConfig(body.system, body.entry);
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'bigscreen',
      action: 'config',
      target: `大屏样式: ${body.system}`,
      detail: `保存系统 ${body.system} 大屏样式配置`,
      before,
      after: data,
      reason: (body as any).reason,
      result: 'success',
    });
    return ok(data);
  }

  // 单系统大屏布局（17 框的 x/y/w/h/frame，合并默认值）
  @Get('layout')
  async layout(@Query('system') system = 'overview') {
    return ok(this.layoutSvc.getLayout(system));
  }

  // 全部系统已保存布局（供后台编辑器列表）
  @Get('layouts')
  async layouts() {
    return ok(this.layoutSvc.getAllLayouts());
  }

  // 保存单系统大屏布局（后台可视化拖拽编辑器调用）
  @Put('layout')
  @Roles('admin')
  async saveLayout(@Body() body: { system: string; entry: BigscreenLayoutEntry }, @CurrentUser() user: AuthedUser) {
    if (!body || !body.system) throw new BadRequestException('system 参数必填');
    if (!body.entry || !body.entry.boxes) throw new BadRequestException('entry.boxes 参数必填');
    const before = this.layoutSvc.getLayout(body.system);
    const data = this.layoutSvc.saveLayout(body.system, body.entry);
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'bigscreen',
      action: 'update',
      target: `大屏布局: ${body.system}`,
      detail: `保存系统 ${body.system} 大屏布局（框数 ${Array.isArray(body.entry.boxes) ? body.entry.boxes.length : 0}）`,
      before,
      after: data,
      reason: (body as any).reason,
      result: 'success',
    });
    return ok(data);
  }

  // B7 修复：重置单系统大屏样式为默认
  @Delete('config')
  @Roles('admin')
  async resetConfig(@Query('system') system = 'overview', @CurrentUser() user: AuthedUser) {
    const data = this.configSvc.resetConfig(system);
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'bigscreen',
      action: 'reset',
      target: `大屏样式: ${system}`,
      detail: `重置系统 ${system} 大屏样式为默认`,
      reason: (system as any)?.reason,
      result: 'success',
    });
    return ok(data, '已重置为默认样式');
  }

  // B7 修复：重置单系统大屏布局为默认
  @Delete('layout')
  @Roles('admin')
  async resetLayout(@Query('system') system = 'overview', @CurrentUser() user: AuthedUser) {
    const data = this.layoutSvc.resetLayout(system);
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'bigscreen',
      action: 'reset',
      target: `大屏布局: ${system}`,
      detail: `重置系统 ${system} 大屏布局为默认`,
      reason: (system as any)?.reason,
      result: 'success',
    });
    return ok(data, '已重置为默认布局');
  }
}

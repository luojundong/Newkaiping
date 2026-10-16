import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DeviceQueryDto, DeviceMetricQueryDto } from './dto/device-query.dto';
import { ControlCommandDto } from '../common/dto/control-command.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DevicesController {
  constructor(
    private readonly svc: DevicesService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list(@Query() q: DeviceQueryDto) {
    return ok(await this.svc.list(q));
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return ok(await this.svc.getDevice(id));
  }

  @Get(':id/metrics/latest')
  async latest(@Param('id') id: string) {
    return ok(await this.svc.latestMetrics(id));
  }

  @Get(':id/metrics')
  async history(@Param('id') id: string, @Query() q: DeviceMetricQueryDto) {
    return ok(await this.svc.historyMetrics(id, q));
  }

  @Post(':id/control')
  @Roles('admin')
  async control(@Param('id') id: string, @Body() dto: ControlCommandDto, @CurrentUser() user: AuthedUser) {
    const ack = await this.svc.control(id, dto);
    await this.logs.record({
      username: user.username,
      module: 'devices',
      action: 'control',
      target: `设备: ${id}`,
      detail: `下发控制指令 ${dto.action}${dto.payload ? ' ' + JSON.stringify(dto.payload) : ''}`,
      result: 'success',
    });
    return ok(ack);
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.create(body);
    await this.logs.record({
      username: user.username,
      module: 'devices',
      action: 'create',
      target: `设备: ${body.name || body.code}`,
      detail: `新增设备 ${body.code}（${body.name}）`,
      result: 'success',
    });
    return ok(data, '设备已创建');
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.update(id, body);
    await this.logs.record({
      username: user.username,
      module: 'devices',
      action: 'update',
      target: `设备: ${body.name || id}`,
      detail: `更新设备 ${body.code || id}`,
      result: 'success',
    });
    return ok(data, '设备已更新');
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.remove(id);
    await this.logs.record({
      username: user.username,
      module: 'devices',
      action: 'delete',
      target: `设备: ${id}`,
      detail: `删除设备 ${id}`,
      result: 'success',
    });
    return ok(null, '设备已删除');
  }
}

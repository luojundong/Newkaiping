import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(
    private readonly svc: WorkOrdersService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list(
    @Query('status') status: string,
    @Query('building_id') buildingId: string,
    @Query('keyword') keyword: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return ok(
      await this.svc.list({
        status,
        building_id: buildingId,
        keyword,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('stats')
  async stats() {
    return ok(await this.svc.stats());
  }

  @Post()
  async create(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.create(body);
    await this.logs.record({
      username: user.username,
      module: 'work-orders',
      action: 'create',
      target: `工单: ${data.code || body.title}`,
      detail: `新建工单 ${body.title}`,
      result: 'success',
    });
    return ok(data, '工单已创建');
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.update(id, body);
    await this.logs.record({
      username: user.username,
      module: 'work-orders',
      action: 'update',
      target: `工单: ${body.code || id}`,
      detail: `更新工单状态/内容：${body.status || ''}`,
      result: 'success',
    });
    return ok(data, '工单已更新');
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.remove(id);
    await this.logs.record({
      username: user.username,
      module: 'work-orders',
      action: 'delete',
      target: `工单: ${id}`,
      detail: `删除工单 ${id}`,
      result: 'success',
    });
    return ok(null, '工单已删除');
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly svc: BillingService,
    private readonly logs: LogsService,
  ) {}

  @Get('prices')
  async prices() {
    return ok(await this.svc.listPrices());
  }

  @Post('prices')
  async createPrice(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.createPrice(body);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'create',
      target: `电价: ${body.name || body.type}`,
      detail: `新增电价 ${body.name || body.type}`,
      result: 'success',
    });
    return ok(data, '电价已创建');
  }

  @Put('prices/:id')
  async updatePrice(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.updatePrice(id, body);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'update',
      target: `电价: ${body.name || id}`,
      detail: `更新电价 ${body.name || id}`,
      result: 'success',
    });
    return ok(data, '电价已更新');
  }

  @Delete('prices/:id')
  async removePrice(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.removePrice(id);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'delete',
      target: `电价: ${id}`,
      detail: `删除电价 ${id}`,
      result: 'success',
    });
    return ok(null, '电价已删除');
  }

  @Get('quotas')
  async quotas() {
    return ok(await this.svc.listQuotas());
  }

  @Post('quotas')
  async createQuota(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.createQuota(body);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'create',
      target: `配额: ${body.building_name || body.building_id || ''}`,
      detail: `新增用电配额`,
      result: 'success',
    });
    return ok(data, '配额已创建');
  }

  @Put('quotas/:id')
  async updateQuota(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.updateQuota(id, body);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'update',
      target: `配额: ${id}`,
      detail: `更新用电配额`,
      result: 'success',
    });
    return ok(data, '配额已更新');
  }

  @Delete('quotas/:id')
  async removeQuota(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.removeQuota(id);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'delete',
      target: `配额: ${id}`,
      detail: `删除用电配额`,
      result: 'success',
    });
    return ok(null, '配额已删除');
  }

  @Get('accounts')
  async accounts(@Query('scope') scope?: string, @Query('ref_id') refId?: string) {
    return ok(await this.svc.listAccounts(scope, refId));
  }

  @Post('recharges')
  async recharge(@Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.recharge(body);
    await this.logs.record({
      username: user.username,
      module: 'billing',
      action: 'update',
      target: `充值: ${body.scope || ''} ${body.ref_id || ''}`,
      detail: `账户充值 ${body.amount ?? ''} 元`,
      result: 'success',
    });
    return ok(data, '充值成功');
  }
}

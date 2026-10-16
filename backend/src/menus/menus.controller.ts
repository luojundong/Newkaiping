import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { MenusService } from './menus.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('menus')
@UseGuards(JwtAuthGuard)
export class MenusController {
  constructor(
    private readonly svc: MenusService,
    private readonly logs: LogsService,
  ) {}

  @Get('order')
  async getOrder() {
    return ok(await this.svc.getOrder());
  }

  @Put('order')
  async saveOrder(@Req() req: any, @Body() body: { order?: string[] }, @CurrentUser() user: AuthedUser) {
    const order = body.order || [];
    try {
      const saved = await this.svc.saveOrder(order);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'menus',
        action: 'update',
        target: '菜单顺序',
        detail: `顺序=${order.join(' > ')}`,
        ip: req.ip,
      });
      return ok(saved, '菜单顺序已保存');
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'menus',
        action: 'update',
        target: '菜单顺序',
        detail: `错误=${String((e && e.message) || e)}`,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }
}

import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ok } from '../common/response.util';
import { SiteConfigService, SiteConfig } from './site-config.service';
import { LogsService } from '../logs/logs.service';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';

@Controller('site')
@UseGuards(JwtAuthGuard)
export class SiteConfigController {
  constructor(
    private readonly svc: SiteConfigService,
    private readonly logs: LogsService,
  ) {}

  @Get('config')
  async config() {
    return ok(this.svc.getConfig());
  }

  @Put('config')
  async saveConfig(@Body() body: Partial<SiteConfig>, @CurrentUser() user: AuthedUser) {
    const before = this.svc.getConfig();
    const data = this.svc.saveConfig(body || {});
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'site',
      action: 'config',
      target: '站点配置',
      detail: `更新站点配置：标题=${body.title ?? '-'} 描述=${body.description ?? '-'} 关键字=${body.keywords ?? '-'} 显示中文=${body.showChinese ?? '-'} 显示英文=${body.showEnglish ?? '-'}`,
      before,
      after: data,
      reason: (body as any).reason,
      result: 'success',
    });
    return ok(data);
  }
}
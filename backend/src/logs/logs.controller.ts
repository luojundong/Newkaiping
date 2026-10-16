import { Body, Controller, Get, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/response.util';

// GMP 合规 RBAC：审计相关接口需对应权限点。
//   audit:trail  —— 查看审计日志/完整性/时间源/复核状态（所有已认证角色）
//   audit:review —— 执行周期复核
//   audit:config —— 修改复核间隔
// 仅系统管理员(admin) 具备 audit:review / audit:config；其余角色仅 audit:trail。
@Controller('logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LogsController {
  constructor(private readonly svc: LogsService) {}

  // 审计日志分页查询：?page=&limit=&username=&module=&action=&keyword=&from=&to=
  @Get()
  @Permissions('audit:trail')
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('username') username?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('keyword') keyword?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return ok(
      await this.svc.list({
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        username,
        module,
        action,
        keyword,
        from,
        to,
      }),
    );
  }

  // 审查追踪完整性校验（哈希链），供「审查追踪」页展示防篡改状态。
  // 审计记录不可修改、不可删除（append-only），本接口为只读。
  @Get('integrity')
  @Permissions('audit:trail')
  async integrity() {
    return ok(await this.svc.verifyIntegrity());
  }

  // 服务器可信时间与 NTP 同步状态（GMP：审计时间戳须基于 NTP 同步的服务器时钟）。
  @Get('time-source')
  @Permissions('audit:trail')
  async timeSource() {
    return ok(this.svc.getTimeSource());
  }

  // 周期性复核状态：上次复核时间、间隔、是否逾期（GMP/等保：定期复核审计链）。
  @Get('review-status')
  @Permissions('audit:trail')
  async reviewStatus() {
    return ok(await this.svc.reviewStatus());
  }

  // 执行周期性复核：记录复核结论并写入一条 review 审计（纳入哈希链，不可篡改）。
  @Post('review')
  @Permissions('audit:review')
  async review(@Req() req: any, @Body() body: Record<string, any>, @CurrentUser() user: AuthedUser) {
    const note = typeof body?.note === 'string' ? body.note : undefined;
    const result = await this.svc.performReview(
      { user_id: user.userId, username: user.username },
      note,
      req?.ip,
    );
    return ok(result);
  }

  // 后台更新复核间隔（天数）：写入 audit_settings 并留痕到审计链。
  @Put('review-settings')
  @Permissions('audit:config')
  async setReviewSettings(
    @Req() req: any,
    @Body() body: { intervalDays?: number; reason?: string },
    @CurrentUser() user: AuthedUser,
  ) {
    const result = await this.svc.setReviewInterval(
      Number(body?.intervalDays),
      { user_id: user.userId, username: user.username },
      typeof body?.reason === 'string' ? body.reason : undefined,
      req?.ip,
    );
    return ok(result);
  }

  // GMP-P1：审计轨迹导出（CSV / JSON）。服务端生成含哈希链的完整记录，
  // 导出动作本身写入审计链；返回文件下载（Content-Disposition: attachment）。
  @Get('export')
  @Permissions('audit:trail')
  async exportAudit(
    @Query('format') format: string,
    @Query('username') username: string,
    @Query('module') module: string,
    @Query('action') action: string,
    @Query('keyword') keyword: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: any,
    @Res() res: any,
    @CurrentUser() user: AuthedUser,
  ) {
    const result = await this.svc.exportAudit(
      { username, module, action, keyword, from, to },
      format === 'json' ? 'json' : 'csv',
      { user_id: user.userId, username: user.username },
      req?.ip,
    );
    const mime = result.format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';
    res.header('Content-Type', mime);
    res.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  }
}

import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly logs: LogsService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const ip = req.ip || (req.headers && req.headers['x-forwarded-for']) || '';
    try {
      const data = await this.auth.login(dto);
      await this.logs.record({
        username: dto.username,
        module: 'auth',
        action: 'login',
        target: '系统登录',
        detail: `登录成功（${data.user?.role || ''}）`,
        result: 'success',
        ip,
      });
      return ok(data);
    } catch (e) {
      await this.logs.record({
        username: dto.username,
        module: 'auth',
        action: 'login',
        target: '系统登录',
        detail: '登录失败：账号或密码错误',
        result: 'fail',
        ip,
      });
      throw e;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout() {
    return ok(await this.auth.logout());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthedUser) {
    return ok(await this.auth.me(user));
  }

  @Get('menus')
  @UseGuards(JwtAuthGuard)
  async menus() {
    return ok(await this.auth.menus());
  }

  @Get('features')
  @UseGuards(JwtAuthGuard)
  async features() {
    return ok(await this.auth.features());
  }
}

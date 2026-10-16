import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

// 垂直越权防护（B1 修复）。
// 与 JwtAuthGuard 配合：控制器层用 @UseGuards(JwtAuthGuard, RolesGuard)，
// JwtAuthGuard 先于 RolesGuard 填充 req.user，本守卫再依据 @Roles() 元数据校验角色。
// 接口未标注 @Roles 时放行（只读接口对 viewer 等低权角色开放）。
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new UnauthorizedException('未认证或 token 失效');
    if (!required.includes(user.role)) {
      throw new ForbiddenException(`权限不足：需要 ${required.join('/')} 角色`);
    }
    return true;
  }
}

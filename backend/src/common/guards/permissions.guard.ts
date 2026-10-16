import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

// 细粒度权限点防护（GMP 合规 RBAC）。
// 与 JwtAuthGuard 配合：控制器层用 @UseGuards(JwtAuthGuard, PermissionsGuard)，
// JwtAuthGuard 先于 PermissionsGuard 填充 req.user，本守卫再依据 @Permissions() 元数据校验权限点。
// 接口未标注 @Permissions 时放行（只读接口对低权角色开放）。
// 要求用户具备标注的全部权限点；空标注亦放行。
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new UnauthorizedException('未认证或 token 失效');
    const owned: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    const missing = required.filter((p) => !owned.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`权限不足：缺少 ${missing.join(', ')} 权限`);
    }
    return true;
  }
}

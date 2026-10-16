import { SetMetadata } from '@nestjs/common';

// 角色守卫元数据键。在写接口上用 @Roles('admin') 标注所需角色，
// 未标注的接口对所有已认证用户放行（保持只读接口对 viewer 开放）。
export const ROLES_KEY = 'roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

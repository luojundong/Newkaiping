import { SetMetadata } from '@nestjs/common';

// 权限点守卫元数据键。在接口上用 @Permissions('audit:review') 标注所需权限点，
// 未标注的接口对所有已认证用户放行。
// 与 RolesGuard 平行：RolesGuard 校验角色，PermissionsGuard 校验细粒度权限点（GMP 合规 RBAC）。
export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

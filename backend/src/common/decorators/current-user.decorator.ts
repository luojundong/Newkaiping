import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// 从请求上下文提取当前 JWT 用户。
export interface AuthedUser {
  userId: string;
  username: string;
  role: string;
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

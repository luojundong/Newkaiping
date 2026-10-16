import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// JWT 鉴权守卫。JwtStrategy 在 AuthModule 注册后全局可用。
// 重写 handleRequest：任何鉴权失败（缺 token / 失效 / 签名错误）统一返回 401，
// 避免 passport 原始 Error 透传导致非预期 500。
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any): any {
    if (err || !user) {
      throw new UnauthorizedException('未认证或 token 失效');
    }
    return user;
  }
}

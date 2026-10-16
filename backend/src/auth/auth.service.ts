import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { AuthedUser } from '../common/decorators/current-user.decorator';
import { UserRecord } from '../common/types';
import { LoginDto } from './login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(CONNECTOR_TOKEN) private readonly connector: Connector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<UserRecord | null> {
    const user = await this.connector.findOne<UserRecord>('users', { username });
    if (!user) return null;
    const okPwd = await bcrypt.compare(password, user.password_hash);
    if (!okPwd) return null;
    return user;
  }

  async login(dto: LoginDto): Promise<{ token: string; user: Record<string, any> }> {
    const user = await this.validateUser(dto.username, dto.password);
    if (!user) {
      throw new BizError(40101, '用户名或密码错误', 401);
    }
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '86400');
    const token = this.jwt.sign(
      { sub: user.id, username: user.username, role: user.role, permissions: user.permissions },
      { expiresIn: Number(expiresIn) },
    );
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }

  async me(user: AuthedUser): Promise<Record<string, any>> {
    const rec = await this.connector.findOne<UserRecord>('users', { id: user.userId });
    return {
      id: rec?.id,
      username: rec?.username,
      nickname: rec?.nickname,
      role: rec?.role,
      permissions: rec?.permissions || [],
    };
  }

  async menus(): Promise<{ buildings: any[]; subsystems: any[] }> {
    const res = await this.connector.read<{ buildings: any[]; subsystems: any[] }>('menus');
    return res[0] || { buildings: [], subsystems: [] };
  }

  async features(): Promise<Record<string, boolean>> {
    const res = await this.connector.read<Record<string, boolean>>('features');
    return res[0] || {};
  }

  async logout(): Promise<{ logged_out: boolean }> {
    // Mock 模式无服务端会话存储；真实模式可在此将 jti 加入吊销列表
    return { logged_out: true };
  }
}

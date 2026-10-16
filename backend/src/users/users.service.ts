import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { UserRecord } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function stripUser(u: UserRecord): Record<string, any> {
  const { password_hash, ...rest } = u;
  return rest;
}

@Injectable()
export class UsersService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(page = 1, limit = 20, keyword?: string): Promise<{ items: Record<string, any>[]; total: number }> {
    let users = await this.connector.read<UserRecord>('users');
    if (keyword && keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      users = users.filter(
        (u) =>
          u.username.toLowerCase().includes(k) ||
          (u.nickname || '').toLowerCase().includes(k) ||
          (u.role || '').toLowerCase().includes(k),
      );
    }
    const total = users.length;
    const start = (page - 1) * limit;
    return { items: users.slice(start, start + limit).map(stripUser), total };
  }

  async create(body: Record<string, any>): Promise<Record<string, any>> {
    const username = body.username as string;
    if (!username || !username.trim()) throw new BizError(40001, '用户名不能为空', 400);
    const exist = await this.connector.findOne<UserRecord>('users', { username });
    if (exist) throw new BizError(40002, '用户名已存在', 400);

    const record: UserRecord = {
      id: genId('user'),
      username: username.trim(),
      password_hash: body.password ? bcrypt.hashSync(String(body.password), 10) : bcrypt.hashSync('123456', 10),
      nickname: (body.name as string) || username.trim(),
      role: (body.role as string) || 'viewer',
      status: 'active',
      last_login: null,
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
      phone: body.phone,
      email: body.email,
    };
    const created = await this.connector.create('users', record);
    return stripUser(created);
  }

  async update(id: string, body: Record<string, any>): Promise<Record<string, any>> {
    const exist = await this.connector.findOne<UserRecord>('users', { id });
    if (!exist) throw new BizError(40400, `用户不存在: ${id}`, 404);

    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.nickname = body.name;
    if (body.role !== undefined) patch.role = body.role;
    if (body.permissions !== undefined) patch.permissions = Array.isArray(body.permissions) ? body.permissions : [];
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.email !== undefined) patch.email = body.email;
    if (body.password && String(body.password).trim()) {
      patch.password_hash = bcrypt.hashSync(String(body.password), 10);
    }
    const updated = await this.connector.update('users', { id }, patch);
    return stripUser(updated);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<UserRecord>('users', { id });
    if (!exist) throw new BizError(40400, `用户不存在: ${id}`, 404);
    if (exist.username === 'admin') throw new BizError(40003, '内置管理员不可删除', 400);
    await this.connector.remove('users', { id });
  }
}

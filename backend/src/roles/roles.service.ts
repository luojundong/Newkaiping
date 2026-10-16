import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { RoleRecord } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class RolesService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(): Promise<RoleRecord[]> {
    return this.connector.read<RoleRecord>('roles');
  }

  async create(body: Record<string, any>): Promise<RoleRecord> {
    const code = body.code as string;
    if (!code || !code.trim()) throw new BizError(40001, '角色编码不能为空', 400);
    const exist = await this.connector.findOne<RoleRecord>('roles', { code: code.trim() });
    if (exist) throw new BizError(40002, '角色编码已存在', 400);
    const record: RoleRecord = {
      id: genId('role'),
      code: code.trim(),
      name: (body.name as string) || code.trim(),
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
      description: body.description,
      status: 'active',
    };
    return this.connector.create('roles', record);
  }

  async update(id: string, body: Record<string, any>): Promise<RoleRecord> {
    const exist = await this.connector.findOne<RoleRecord>('roles', { id });
    if (!exist) throw new BizError(40400, `角色不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.permissions !== undefined) patch.permissions = Array.isArray(body.permissions) ? body.permissions : [];
    if (body.description !== undefined) patch.description = body.description;
    if (body.status !== undefined) patch.status = body.status;
    return this.connector.update('roles', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<RoleRecord>('roles', { id });
    if (!exist) throw new BizError(40400, `角色不存在: ${id}`, 404);
    if (exist.code === 'admin') throw new BizError(40003, '内置管理员角色不可删除', 400);
    await this.connector.remove('roles', { id });
  }
}

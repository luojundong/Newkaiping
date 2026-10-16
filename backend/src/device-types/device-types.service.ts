import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { DeviceType } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class DeviceTypesService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(): Promise<DeviceType[]> {
    const items = await this.connector.read<DeviceType>('device_types');
    return items.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }

  async create(body: Record<string, any>): Promise<DeviceType> {
    const name = (body.name as string) || '';
    if (!name.trim()) throw new BizError(40001, '设备类型名称不能为空', 400);
    const exist = await this.connector.findOne<DeviceType>('device_types', { name: name.trim() });
    if (exist) throw new BizError(40002, '设备类型名称已存在', 400);
    const all = await this.connector.read<DeviceType>('device_types');
    const seq = all.reduce((m, d) => Math.max(m, d.seq || 0), 0) + 1;
    const record: DeviceType = {
      id: genId('dtype'),
      seq,
      name: name.trim(),
      description: body.description,
      brand_ids: Array.isArray(body.brand_ids) ? (body.brand_ids as string[]).filter(Boolean) : [],
    };
    return this.connector.create('device_types', record);
  }

  async update(id: string, body: Record<string, any>): Promise<DeviceType> {
    const exist = await this.connector.findOne<DeviceType>('device_types', { id });
    if (!exist) throw new BizError(40400, `设备类型不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = (body.name as string).trim();
      if (!name) throw new BizError(40001, '设备类型名称不能为空', 400);
      const dup = await this.connector.findOne<DeviceType>('device_types', { name });
      if (dup && dup.id !== id) throw new BizError(40002, '设备类型名称已存在', 400);
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.seq !== undefined) patch.seq = Number(body.seq) || exist.seq;
    if (body.brand_ids !== undefined) {
      patch.brand_ids = Array.isArray(body.brand_ids) ? (body.brand_ids as string[]).filter(Boolean) : [];
    }
    return this.connector.update('device_types', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<DeviceType>('device_types', { id });
    if (!exist) throw new BizError(40400, `设备类型不存在: ${id}`, 404);
    await this.connector.remove('device_types', { id });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { DeviceBrand } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class DeviceBrandsService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(): Promise<DeviceBrand[]> {
    const items = await this.connector.read<DeviceBrand>('device_brands');
    return items.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }

  async create(body: Record<string, any>): Promise<DeviceBrand> {
    const name = (body.name as string) || '';
    if (!name.trim()) throw new BizError(40001, '设备品牌名称不能为空', 400);
    const exist = await this.connector.findOne<DeviceBrand>('device_brands', { name: name.trim() });
    if (exist) throw new BizError(40002, '设备品牌名称已存在', 400);
    const all = await this.connector.read<DeviceBrand>('device_brands');
    const seq = all.reduce((m, d) => Math.max(m, d.seq || 0), 0) + 1;
    const record: DeviceBrand = {
      id: genId('dbrand'),
      seq,
      name: name.trim(),
      description: body.description,
    };
    return this.connector.create('device_brands', record);
  }

  async update(id: string, body: Record<string, any>): Promise<DeviceBrand> {
    const exist = await this.connector.findOne<DeviceBrand>('device_brands', { id });
    if (!exist) throw new BizError(40400, `设备品牌不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = (body.name as string).trim();
      if (!name) throw new BizError(40001, '设备品牌名称不能为空', 400);
      const dup = await this.connector.findOne<DeviceBrand>('device_brands', { name });
      if (dup && dup.id !== id) throw new BizError(40002, '设备品牌名称已存在', 400);
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.seq !== undefined) patch.seq = Number(body.seq) || exist.seq;
    return this.connector.update('device_brands', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<DeviceBrand>('device_brands', { id });
    if (!exist) throw new BizError(40400, `设备品牌不存在: ${id}`, 404);
    await this.connector.remove('device_brands', { id });
  }
}

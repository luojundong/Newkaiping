import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { ControlGroup } from '../common/types';
import { GroupControlCommandDto } from '../common/dto/group-control-command.dto';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class ControlGroupsService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(): Promise<ControlGroup[]> {
    return this.connector.read<ControlGroup>('control_groups');
  }

  async create(body: Record<string, any>): Promise<ControlGroup> {
    const name = (body.name as string) || '';
    if (!name.trim()) throw new BizError(40001, '群组名称不能为空', 400);
    const record: ControlGroup = {
      id: genId('cgroup'),
      name: name.trim(),
      description: body.description,
      building_ids: Array.isArray(body.building_ids) ? body.building_ids : [],
      device_ids: Array.isArray(body.device_ids) ? body.device_ids : [],
    };
    return this.connector.create('control_groups', record);
  }

  async update(id: string, body: Record<string, any>): Promise<ControlGroup> {
    const exist = await this.connector.findOne<ControlGroup>('control_groups', { id });
    if (!exist) throw new BizError(40400, `控制群组不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = (body.name as string).trim();
      if (!name) throw new BizError(40001, '群组名称不能为空', 400);
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.building_ids !== undefined) patch.building_ids = Array.isArray(body.building_ids) ? body.building_ids : [];
    if (body.device_ids !== undefined) patch.device_ids = Array.isArray(body.device_ids) ? body.device_ids : [];
    return this.connector.update('control_groups', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<ControlGroup>('control_groups', { id });
    if (!exist) throw new BizError(40400, `控制群组不存在: ${id}`, 404);
    await this.connector.remove('control_groups', { id });
  }

  // 群组统一指令：把同一 ControlCommand 下发到群组内每个设备（含 building_ids 解析出的设备）
  async control(id: string, cmd: GroupControlCommandDto): Promise<any> {
    const group = await this.connector.findOne<ControlGroup>('control_groups', { id });
    if (!group) throw new BizError(40400, `控制群组不存在: ${id}`, 404);

    const targetDeviceIds = new Set<string>(group.device_ids || []);
    // building_ids -> 设备：将群组内楼栋下的设备一并纳入下发范围
    for (const bid of group.building_ids || []) {
      const devs = await this.connector.read<any>('devices', { building_id: bid });
      for (const d of devs) targetDeviceIds.add(d.id);
    }

    const command = { action: cmd.action, payload: cmd.payload || {} };
    for (const did of targetDeviceIds) {
      await this.connector.send(did, { ...command, device_id: did });
    }

    return {
      device_id: id,
      accepted: true,
      message: '群组指令已下发',
    };
  }
}

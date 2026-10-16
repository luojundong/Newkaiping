import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { Building, BuildingSubsystemConfig, Subsystem } from '../common/types';
import { SUBSYSTEMS } from '../common/constants/catalog';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class BuildingsService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async listBuildings(): Promise<Building[]> {
    return this.connector.read<Building>('buildings');
  }

  async getBuilding(id: string): Promise<Building> {
    const b = await this.connector.findOne<Building>('buildings', { id });
    if (!b) throw new BizError(40400, `楼栋不存在: ${id}`, 404);
    return b;
  }

  async getSubsystems(buildingId: string): Promise<any[]> {
    await this.getBuilding(buildingId); // 楼栋不存在则抛 404
    const configs = await this.connector.read<BuildingSubsystemConfig>('building_subsystem_config', { building_id: buildingId });
    const subsystems = await this.connector.read<Subsystem>('subsystems');
    const nameMap = new Map(subsystems.map((s) => [s.code, s.name]));
    return configs
      .map((c) => ({
        subsystem_code: c.subsystem_code,
        name: nameMap.get(c.subsystem_code) || c.subsystem_code,
        enabled: c.enabled,
        config: c.config_json,
        sort_order: c.sort_order,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  async putSubsystems(
    buildingId: string,
    items: Array<{ subsystem_code: string; enabled: boolean; config_json?: Record<string, any> | null }>,
  ): Promise<any[]> {
    await this.getBuilding(buildingId);
    for (const item of items) {
      await this.connector.update(
        'building_subsystem_config',
        { building_id: buildingId, subsystem_code: item.subsystem_code },
        { enabled: item.enabled, config_json: item.config_json ?? null },
      );
    }
    return this.getSubsystems(buildingId);
  }

  // ---------- 阶段四：楼栋 CRUD ----------

  async create(body: Record<string, any>): Promise<Building> {
    const code = body.code as string;
    if (!code || !code.trim()) throw new BizError(40001, '楼栋编码不能为空', 400);
    const exist = await this.connector.findOne<Building>('buildings', { code: code.trim() });
    if (exist) throw new BizError(40002, '楼栋编码已存在', 400);

    const id = genId('b');
    const record: Building = {
      id,
      code: code.trim(),
      name: (body.name as string) || code.trim(),
      floors: Number(body.floors) || 1,
      gross_area: Number(body.area) || 0,
      local_origin: { x: 0, y: 0, z: 0 },
      status: 'active',
    };
    const created = await this.connector.create('buildings', record);
    // 为新楼栋初始化 7 子系统配置（enabled=true），保持与种子一致
    for (const s of SUBSYSTEMS) {
      const cfg: BuildingSubsystemConfig = {
        id: `bsc-${id}-${s.code}`,
        building_id: id,
        subsystem_code: s.code,
        enabled: true,
        config_json: { auto_schedule: true },
        sort_order: s.sort_order,
      };
      await this.connector.create('building_subsystem_config', cfg);
    }
    return created;
  }

  async update(id: string, body: Record<string, any>): Promise<Building> {
    const exist = await this.connector.findOne<Building>('buildings', { id });
    if (!exist) throw new BizError(40400, `楼栋不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.floors !== undefined) patch.floors = Number(body.floors) || exist.floors;
    if (body.area !== undefined) patch.gross_area = Number(body.area);
    if (body.description !== undefined) patch.description = body.description;
    if (body.code !== undefined) patch.code = body.code;
    // 开关：active=显示；inactive=隐藏（大屏不渲染该楼）
    if (body.status !== undefined) {
      patch.status = body.status === 'inactive' ? 'inactive' : 'active';
    }
    return this.connector.update('buildings', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<Building>('buildings', { id });
    if (!exist) throw new BizError(40400, `楼栋不存在: ${id}`, 404);
    // 级联删除该楼栋的子系统配置行
    const configs = await this.connector.read<BuildingSubsystemConfig>('building_subsystem_config', {
      building_id: id,
    });
    for (const c of configs) {
      await this.connector.remove('building_subsystem_config', { id: c.id });
    }
    await this.connector.remove('buildings', { id });
  }
}

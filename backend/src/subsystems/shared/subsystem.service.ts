import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../../common/connector/connector.interface';
import { ControlCommand } from '../../common/types';

// 子系统业务共享服务：所有 7 子系统状态/控制经 Connector 读取，无硬编码数据。
@Injectable()
export class SubsystemService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async status(buildingId: string | undefined, subsystem: string): Promise<any> {
    const r = await this.connector.read('subsystem_status', { building_id: buildingId, subsystem });
    return r[0];
  }

  async overview(buildingId: string | undefined): Promise<any> {
    const r = await this.connector.read('regulation_overview', { building_id: buildingId });
    return r[0];
  }

  async lifecycleEquipment(buildingId: string | undefined): Promise<any> {
    const r = await this.connector.read('lifecycle_equipment', { building_id: buildingId });
    return r[0];
  }

  async lifecycleMaintenance(): Promise<any> {
    const r = await this.connector.read('lifecycle_maintenance', {});
    return r[0];
  }

  async control(buildingId: string | undefined, subsystem: string, cmd: ControlCommand): Promise<any> {
    const target = `subsystem:${subsystem}:${buildingId || 'all'}`;
    return this.connector.send(target, { ...cmd, building_id: buildingId, subsystem });
  }
}

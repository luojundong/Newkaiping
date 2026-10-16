import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { ControlCommand, Device, Metric } from '../common/types';
import { DeviceMetricQueryDto, DeviceQueryDto } from './dto/device-query.dto';
import { CATEGORY_DEFS } from '../common/constants/catalog';
import { hashStr } from '../common/connector/mock/synthetic.metrics';

const PROTOCOL_MAP: Record<string, string> = {
  MQTT: 'mqtt',
  Modbus: 'modbus-tcp',
  HTTP: 'http',
};

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// 依据楼栋锚点 + 确定性偏移计算新设备坐标（任务5）
function locationFromAnchor(
  anchor: { x: number; y: number; z: number },
  code: string,
  floor: number,
): { x: number; y: number; z: number } {
  const salt = hashStr(code || 'dev');
  const dx = (salt - 0.5) * 24;
  const dz = (hashStr(code + 'z') - 0.5) * 24;
  return {
    x: Math.round((anchor.x + dx) * 100) / 100,
    y: floor * 3.5,
    z: Math.round((anchor.z + dz) * 100) / 100,
  };
}

@Injectable()
export class DevicesService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  private buildFilter(q: DeviceQueryDto): Record<string, any> {
    const filter: Record<string, any> = {};
    if (q.building_id) filter.building_id = q.building_id;
    if (q.code) filter.code = q.code;
    if (q.subsystem) filter.subsystem = q.subsystem;
    if (q.category) filter.category = q.category;
    if (q.status) filter.status = q.status;
    return filter;
  }

  async list(q: DeviceQueryDto): Promise<{ items: Device[]; total: number; page: number; limit: number }> {
    let all = await this.connector.read<Device>('devices', this.buildFilter(q));
    // 按楼层过滤（设备位置在 location.floor，Connector 不支持嵌套查询，这里二次过滤）
    if (q.floor !== undefined && q.floor !== null) {
      all = all.filter((d) => (d.location?.floor ?? 0) === q.floor)
    }
    const page = q.page || 1;
    const limit = q.limit || 20;
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length, page, limit };
  }

  async getDevice(id: string): Promise<Device> {
    const d = await this.connector.findOne<Device>('devices', { id });
    if (!d) throw new BizError(40400, `设备不存在: ${id}`, 404);
    return d;
  }

  async latestMetrics(id: string): Promise<{ metrics: Metric[] }> {
    await this.getDevice(id);
    const metrics = await this.connector.read<Metric>('device_metrics', { device_id: id });
    return { metrics };
  }

  async historyMetrics(id: string, q: DeviceMetricQueryDto): Promise<{ metrics: Metric[] }> {
    await this.getDevice(id);
    const keys = q.keys ? q.keys.split(',').map((k) => k.trim()).filter(Boolean) : undefined;
    const metrics = await this.connector.read<Metric>('device_metrics', {
      device_id: id,
      from: q.from,
      to: q.to,
      keys,
    });
    return { metrics };
  }

  async control(id: string, cmd: ControlCommand): Promise<any> {
    await this.getDevice(id);
    const command: ControlCommand = { ...cmd, device_id: id };
    return this.connector.send(id, command);
  }

  // ---------- 阶段四：设备 CRUD ----------

  async create(body: Record<string, any>): Promise<Device> {
    const buildingId = body.building_id as string;
    // B2 修复：显式校验 building_id 必填且非空。否则 mock 下 findOne({id:undefined})
    // 会命中首条楼栋，导致在 1 号楼静默创建孤儿设备。
    if (!buildingId || typeof buildingId !== 'string') {
      throw new BizError(40001, 'building_id 必填', 400);
    }
    const building = await this.connector.findOne<any>('buildings', { id: buildingId });
    if (!building) throw new BizError(40001, `楼栋不存在: ${buildingId}`, 400);

    const category = (body.category as string) || 'split_ac';
    const cdef = CATEGORY_DEFS[category];
    const subsystemId = (cdef && cdef.subsystem) || 'lifecycle';
    const code = (body.code as string) || `${building.code}-${(category || 'DEV').toUpperCase()}-NEW`;
    const floor = Number(body.location?.floor) || 1;
    const anchor = building.local_origin;
    const loc = locationFromAnchor(anchor, code, floor);

    const record: Device = {
      id: genId('dev'),
      building_id: buildingId,
      subsystem_id: subsystemId,
      category_id: category,
      code,
      name: (body.name as string) || code,
      model: (body.model as string) || '',
      manufacturer: (body.manufacturer as string) || '',
      install_date: new Date().toISOString().slice(0, 10),
      location: {
        x: loc.x,
        y: loc.y,
        z: loc.z,
        floor,
        room: (body.location?.room as string) || `${floor}01`,
      },
      specs: {},
      status: (body.status as Device['status']) || 'running',
      protocol: body.connection?.type ? PROTOCOL_MAP[body.connection.type] || 'mqtt' : undefined,
      controller_type: cdef?.control_capable ? 'gateway' : undefined,
    };
    return this.connector.create('devices', record);
  }

  async update(id: string, body: Record<string, any>): Promise<Device> {
    const exist = await this.connector.findOne<Device>('devices', { id });
    if (!exist) throw new BizError(40400, `设备不存在: ${id}`, 404);

    const patch: Record<string, any> = {};
    if (body.code !== undefined) patch.code = body.code;
    if (body.name !== undefined) patch.name = body.name;
    if (body.model !== undefined) patch.model = body.model;
    if (body.manufacturer !== undefined) patch.manufacturer = body.manufacturer;
    if (body.status !== undefined) patch.status = body.status;
    if (body.category !== undefined) {
      const cdef = CATEGORY_DEFS[body.category as string];
      patch.category_id = body.category;
      patch.subsystem_id = (cdef && cdef.subsystem) || exist.subsystem_id;
    }
    if (body.building_id !== undefined) patch.building_id = body.building_id;
    if (body.connection?.type !== undefined) {
      patch.protocol = PROTOCOL_MAP[body.connection.type] || 'mqtt';
    }
    if (body.location) {
      const cur = { ...exist.location };
      if (body.location.floor !== undefined) cur.floor = Number(body.location.floor);
      if (body.location.room !== undefined) cur.room = body.location.room;
      if (body.location.x !== undefined && body.location.y !== undefined && body.location.z !== undefined) {
        cur.x = Number(body.location.x);
        cur.y = Number(body.location.y);
        cur.z = Number(body.location.z);
      } else {
        cur.y = cur.floor * 3.5;
      }
      patch.location = cur;
    }
    return this.connector.update('devices', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<Device>('devices', { id });
    if (!exist) throw new BizError(40400, `设备不存在: ${id}`, 404);
    await this.connector.remove('devices', { id });
  }
}

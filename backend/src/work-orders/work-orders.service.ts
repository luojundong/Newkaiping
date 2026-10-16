import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { WorkOrder, WorkOrderStats, WorkOrderStatus } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

const STATUS_FIELDS: Array<keyof WorkOrderStats> = [
  'processing',
  'feedback',
  'unfinished',
  'completed',
  'closed',
];

@Injectable()
export class WorkOrdersService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(params: {
    status?: string;
    building_id?: string;
    keyword?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: WorkOrder[]; total: number }> {
    const all = await this.connector.read<WorkOrder>('work_orders');
    const keyword = params.keyword ? params.keyword.trim().toLowerCase() : '';
    const filtered = all.filter((w) => {
      if (params.status && w.status !== params.status) return false;
      if (params.building_id && w.building_id !== params.building_id) return false;
      if (keyword) {
        const hay = `${w.code} ${w.title} ${w.description || ''}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const page = params.page || 1;
    const limit = params.limit || 20;
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length };
  }

  async create(body: Record<string, any>): Promise<WorkOrder> {
    const title = (body.title as string) || '';
    if (!title.trim()) throw new BizError(40001, '工单标题不能为空', 400);
    const nowIso = new Date().toISOString();
    const code = await this.genCode();
    const record: WorkOrder = {
      id: genId('wo'),
      code,
      title: title.trim(),
      description: body.description,
      assignee: body.assignee,
      building_id: body.building_id,
      building_name: body.building_name,
      product_type: body.product_type,
      device_id: body.device_id,
      device_name: body.device_name,
      priority: body.priority || 'normal',
      status: (body.status as WorkOrderStatus) || 'pending',
      created_at: nowIso,
      updated_at: nowIso,
    };
    return this.connector.create('work_orders', record);
  }

  async update(id: string, body: Record<string, any>): Promise<WorkOrder> {
    const exist = await this.connector.findOne<WorkOrder>('work_orders', { id });
    if (!exist) throw new BizError(40400, `工单不存在: ${id}`, 404);
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      const title = (body.title as string).trim();
      if (!title) throw new BizError(40001, '工单标题不能为空', 400);
      patch.title = title;
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.assignee !== undefined) patch.assignee = body.assignee;
    if (body.building_id !== undefined) patch.building_id = body.building_id;
    if (body.building_name !== undefined) patch.building_name = body.building_name;
    if (body.product_type !== undefined) patch.product_type = body.product_type;
    if (body.device_id !== undefined) patch.device_id = body.device_id;
    if (body.device_name !== undefined) patch.device_name = body.device_name;
    if (body.priority !== undefined) patch.priority = body.priority;
    if (body.status !== undefined) patch.status = body.status;
    return this.connector.update('work_orders', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<WorkOrder>('work_orders', { id });
    if (!exist) throw new BizError(40400, `工单不存在: ${id}`, 404);
    await this.connector.remove('work_orders', { id });
  }

  async stats(): Promise<WorkOrderStats> {
    const all = await this.connector.read<WorkOrder>('work_orders');
    const result: WorkOrderStats = {
      total: all.length,
      processing: 0,
      feedback: 0,
      unfinished: 0,
      completed: 0,
      closed: 0,
    };
    for (const w of all) {
      if (STATUS_FIELDS.includes(w.status as any)) {
        (result as any)[w.status] += 1;
      }
    }
    return result;
  }

  // 工单编号：WO-YYYYMMDD-NNN（同日序号自增）
  private async genCode(): Promise<string> {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `WO-${ymd}-`;
    const all = await this.connector.read<WorkOrder>('work_orders');
    const seq = all.filter((w) => w.code.startsWith(prefix)).length + 1;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }
}

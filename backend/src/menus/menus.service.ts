import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { SceneConfig } from '../common/types';

// 左侧管理菜单默认排序（与前端 AdminLayout 菜单顺序一致），作为回退默认值
const DEFAULT_MENU_ORDER: string[] = [
  '/admin/building-subsystem',
  '/admin/device',
  '/admin/alarm',
  '/admin/energy',
  '/admin/user',
  '/admin/role',
  '/admin/log',
  '/admin/building',
  '/admin/billing',
  '/admin/history',
  '/admin/alarm-rules',
  '/admin/reports',
  '/admin/scene',
];

@Injectable()
export class MenusService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async getOrder(): Promise<string[]> {
    const cfg = await this.connector.read<SceneConfig>('scene_config');
    const stored = cfg[0] && cfg[0].menu_order;
    return Array.isArray(stored) && stored.length ? stored : DEFAULT_MENU_ORDER;
  }

  async saveOrder(order: string[]): Promise<string[]> {
    const list = Array.isArray(order) ? order : [];
    await this.connector.update('scene_config', {}, { menu_order: list });
    return list;
  }
}

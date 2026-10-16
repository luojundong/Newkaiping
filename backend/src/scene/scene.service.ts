import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BuildingDisplay, DevicePoint, SceneConfig, SceneMarker, SubsystemLabelMap } from '../common/types';
import { SUBSYSTEMS } from '../common/constants/catalog';
import { BUILDINGS } from '../common/constants/catalog';

const FLOOR_HEIGHT = 4.2;

// 多边形顶点质心（区域热点 position 落库用）
function centroidOf(pts: { x: number; y: number; z: number }[]): { x: number; y: number; z: number } {
  const c = { x: 0, y: 0, z: 0 };
  pts.forEach((p) => {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  });
  const n = pts.length || 1;
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}

@Injectable()
export class SceneService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async config(): Promise<SceneConfig> {
    const r = await this.connector.read<SceneConfig>('scene_config');
    return r[0];
  }

  // ---- 子系统菜单 DIY（自定义名称 + 开关） ----

  async getSubsystemMeta(): Promise<Record<string, { label?: string; visible?: boolean }>> {
    const cfg = await this.config();
    return cfg.subsystem_meta ?? {};
  }

  async setSubsystemMeta(
    body: Record<string, { label?: string; visible?: boolean }>,
  ): Promise<Record<string, { label?: string; visible?: boolean }>> {
    const current = await this.getSubsystemMeta();
    // 按子系统合并（label 空串视为清除，回退默认名）
    const merged: Record<string, { label?: string; visible?: boolean }> = { ...current };
    for (const [code, item] of Object.entries(body || {})) {
      const prev = merged[code] ?? {};
      const next: { label?: string; visible?: boolean } = {};
      if (typeof item?.label === 'string' && item.label.trim()) next.label = item.label.trim();
      else if (typeof item?.label === 'string') next.label = undefined;
      else if (prev.label) next.label = prev.label;
      if (typeof item?.visible === 'boolean') next.visible = item.visible;
      else if (prev.visible !== undefined) next.visible = prev.visible;
      merged[code] = next;
    }
    await this.connector.update('scene_config', {}, { subsystem_meta: merged });
    return merged;
  }

  // 3D 点位：优先读 scene_markers（后台 DIY 标记），空则回退合成点位（devicePoints 派生）
  async points(buildingId: string | undefined, subsystem: string | undefined): Promise<DevicePoint[]> {
    const markers = await this.connector.read<SceneMarker>('scene_markers', {
      building_id: buildingId,
    });
    if (markers && markers.length > 0) {
      // scene_markers 非空 → 由 markers 驱动渲染
      return markers
        .filter((m) => m.visible)
        .filter((m) => !subsystem || m.marker_type === subsystem)
        .map((m) => ({
          id: m.id,
          device_id: m.device_id,
          building_id: m.building_id,
          position: m.position,
          marker_type: m.marker_type,
          label: m.label,
          level_of_detail: 'equipment' as const,
          visible: m.visible,
          subsystem_code: undefined,
        }));
    }
    // 回退：合成点位
    return this.connector.read<DevicePoint>('scene_points', { building_id: buildingId, subsystem });
  }

  // ---- 标记 CRUD ----

  async listMarkers(buildingId?: string): Promise<SceneMarker[]> {
    return this.connector.read<SceneMarker>('scene_markers', buildingId ? { building_id: buildingId } : undefined);
  }

  async createMarker(body: Partial<SceneMarker>): Promise<SceneMarker> {
    const cfg = await this.config();
    const buildingId = body.building_id!;
    const floor = body.floor ?? 1;
    // 从 building_anchors 取地面 y 基准
    const anchor = cfg.building_anchors.find((a) => a.building_id === buildingId);
    const baseY = anchor?.position?.y ?? 0;
    // 区域热点：position 取多边形顶点质心，便于列表/定位回显
    const shape = body.shape === 'area' ? 'area' : 'point';
    const areaPoints = shape === 'area' && Array.isArray(body.area_points) ? body.area_points : undefined;
    const position =
      areaPoints && areaPoints.length
        ? centroidOf(areaPoints)
        : {
            x: body.position?.x ?? 0,
            y: body.position?.y ?? baseY + (floor - 1) * FLOOR_HEIGHT + 2,
            z: body.position?.z ?? 0,
          };
    const marker: SceneMarker = {
      id: body.id || `mk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      building_id: buildingId,
      floor,
      position,
      marker_type: body.marker_type || 'equipment',
      label: body.label || '未命名标记',
      device_id: body.device_id ?? null,
      visible: body.visible ?? true,
      color: body.color || '#00ccff',
      shape,
      area_points: areaPoints,
      link: body.link ?? null,
      params: body.params || undefined,
    };
    await this.connector.create('scene_markers', marker);
    return marker;
  }

  async updateMarker(id: string, patch: Partial<SceneMarker>): Promise<SceneMarker> {
    // 若改了 floor，需重算 y
    if (patch.floor !== undefined) {
      const cfg = await this.config();
      const existing = await this.connector.findOne<SceneMarker>('scene_markers', { id });
      if (existing) {
        const anchor = cfg.building_anchors.find((a) => a.building_id === existing.building_id);
        const baseY = anchor?.position?.y ?? 0;
        patch.position = { ...existing.position, ...patch.position, y: baseY + (patch.floor - 1) * FLOOR_HEIGHT + 2 };
      }
    }
    // 区域热点：若提交了多边形顶点，重算 position 为质心
    if (patch.area_points && patch.area_points.length) {
      patch.position = { ...patch.position, ...centroidOf(patch.area_points) };
    }
    return this.connector.update('scene_markers', { id }, patch);
  }

  async deleteMarker(id: string): Promise<void> {
    await this.connector.remove('scene_markers', { id });
  }

  // ---- 标注显隐开关 ----

  async getMarkerSwitch(): Promise<SceneConfig['marker_switch']> {
    const cfg = await this.config();
    return cfg.marker_switch ?? { show_building_markers: true, show_device_points: true };
  }

  async setMarkerSwitch(body: { show_building_markers?: boolean; show_device_points?: boolean }): Promise<SceneConfig['marker_switch']> {
    const current = await this.getMarkerSwitch();
    const merged = {
      show_building_markers: body.show_building_markers ?? current.show_building_markers,
      show_device_points: body.show_device_points ?? current.show_device_points,
    };
    await this.connector.update('scene_config', {}, { marker_switch: merged });
    return merged;
  }

  // ---- 楼栋显示 DIY（框框区域 + 背景透明度）----

  async getBuildingDisplay(): Promise<BuildingDisplay> {
    const cfg = await this.config();
    const d = cfg.building_display;
    // 兼容旧数据：仅存 background_opacity 时，box/plane 默认透明度都兜底为它
    const legacyOpacity = typeof d?.background_opacity === 'number' ? d.background_opacity : 0.35;
    return {
      mode: d?.mode ?? 'box',
      background_opacity: legacyOpacity,
      box_opacity: typeof d?.box_opacity === 'number' ? d.box_opacity : legacyOpacity,
      plane_opacity: typeof d?.plane_opacity === 'number' ? d.plane_opacity : legacyOpacity,
      show_border: d?.show_border ?? true,
      border_color: d?.border_color ?? '#00e5ff',
      fill_color: d?.fill_color ?? '#0d3346',
      size_scale: d?.size_scale ?? 1,
      show_labels: d?.show_labels ?? true,
      per_building: d?.per_building ?? {},
      floors_by_building: d?.floors_by_building ?? {},
    };
  }

  async setBuildingDisplay(body: Partial<BuildingDisplay>): Promise<BuildingDisplay> {
    const current = await this.getBuildingDisplay();
    const merged: BuildingDisplay = {
      mode: body.mode ?? current.mode,
      background_opacity: body.background_opacity ?? current.background_opacity,
      box_opacity: body.box_opacity ?? current.box_opacity,
      plane_opacity: body.plane_opacity ?? current.plane_opacity,
      show_border: body.show_border ?? current.show_border,
      border_color: body.border_color ?? current.border_color,
      fill_color: body.fill_color ?? current.fill_color,
      size_scale: body.size_scale ?? current.size_scale,
      show_labels: body.show_labels ?? current.show_labels,
      // per_building 为嵌套结构，整体替换（前端全量提交）
      per_building: body.per_building ?? current.per_building ?? {},
      // floors_by_building 为嵌套结构，整体替换（前端全量提交）
      floors_by_building: body.floors_by_building ?? current.floors_by_building ?? {},
    };
    await this.connector.update('scene_config', {}, { building_display: merged });
    return merged;
  }

  // ---- 楼栋锚点批量写入（立柱 DIY）----

  async setAnchors(anchors: Array<Record<string, any>>): Promise<Array<Record<string, any>>> {
    await this.connector.update('scene_config', {}, { building_anchors: anchors });
    return anchors;
  }

  async setModelUrl(modelUrl: string, modelType?: string): Promise<string> {
    const patch: Record<string, unknown> = { model_url: modelUrl };
    if (modelType) patch.model_type = modelType;
    await this.connector.update('scene_config', {}, patch);
    return modelUrl;
  }

  // ---- 模型加载提示文案（自定义）----
  async getModelLoadingHint(): Promise<string> {
    const cfg = await this.config();
    // 默认使用通用提示，避免暴露具体模型名（如「医院三维模型」）
    return cfg.model_loading_hint ?? '模型加载中…';
  }

  async setModelLoadingHint(hint: string): Promise<string> {
    const text = (hint ?? '').toString();
    // 留空视为回退默认
    const value = text.trim() ? text.trim() : '';
    await this.connector.update('scene_config', {}, { model_loading_hint: value });
    return value || '模型加载中…';
  }

  // 子系统显示名：默认取 SUBSYSTEMS 名称，叠加用户自定义覆盖
  async subsystemLabels(): Promise<SubsystemLabelMap> {
    const cfg = await this.config();
    const defaults: SubsystemLabelMap = {};
    for (const s of SUBSYSTEMS) defaults[s.code] = s.name;
    return { ...defaults, ...(cfg.subsystem_labels || {}) };
  }

  // 持久化子系统显示名覆盖（全量覆盖）
  async updateSubsystemLabels(body: SubsystemLabelMap): Promise<SubsystemLabelMap> {
    const merged = await this.subsystemLabels();
    for (const [code, name] of Object.entries(body || {})) {
      merged[code] = name;
    }
    await this.connector.update('scene_config', {}, { subsystem_labels: merged });
    return merged;
  }
}

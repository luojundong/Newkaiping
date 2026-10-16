// MockConnector：内存数据源（MVP 默认）。实现完整 Connector 契约。
// 种子数据 + 合成时序/状态全部经 read(collection, query) 暴露，前端零感知（ADR-003）。

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  Alarm,
  AlarmRule,
  AlarmRuleConfig,
  AuditLog,
  AuditReview,
  BillingLedgerEntry,
  BillingPrice,
  BillingQuota,
  Building,
  ControlAck,
  ControlCommand,
  Device,
  DevicePoint,
  Metric,
  MetricQuality,
  MetricSource,
  RoleRecord,
  SceneConfig,
  SceneMarker,
  Subsystem,
  UserRecord,
} from '../../types';
import { Collection, Connector, DataSourceInfo, Query } from '../connector.interface';
import { SYNTHETIC_COLLECTIONS } from '../synthetic-collections';
import { buildSeedStore, SeedStore } from './seed';
import { genDeviceMetrics, genLiveBatch } from './synthetic.metrics';
import {
  genEnergySummary,
  genEnergyTrend,
  genLifecycleEquipment,
  genLifecycleMaintenance,
  genRegulationOverview,
  genScenePoints,
  genSubsystemStatus,
} from './synthetic.aggregate';

// runtime.json 落盘路径：backend/data/runtime.json（用户创建的实体重启保留）
const RUNTIME_PATH = path.resolve(process.cwd(), 'data', 'runtime.json');

// 需要持久化到 runtime.json 的集合（collection 名 -> store 字段名）
const PERSIST_MAP: Array<{ collection: Collection; key: keyof SeedStore }> = [
  { collection: 'buildings', key: 'buildings' },
  { collection: 'building_subsystem_config', key: 'buildingSubsystemConfig' },
  { collection: 'devices', key: 'devices' },
  { collection: 'users', key: 'users' },
  { collection: 'roles', key: 'roles' },
  { collection: 'billing_prices', key: 'billingPrices' },
  { collection: 'billing_quotas', key: 'billingQuotas' },
  { collection: 'billing_ledger', key: 'billingLedger' },
  { collection: 'alarm_rule_configs', key: 'alarmRuleConfigs' },
  { collection: 'alarm_rules', key: 'alarmRules' },
  { collection: 'scene_config', key: 'sceneConfig' },
  { collection: 'device_types', key: 'deviceTypes' },
  { collection: 'device_brands', key: 'deviceBrands' },
  { collection: 'control_groups', key: 'controlGroups' },
  { collection: 'work_orders', key: 'workOrders' },
  { collection: 'scene_markers', key: 'sceneMarkers' },
  { collection: 'audit_logs', key: 'auditLogs' },
  { collection: 'audit_reviews', key: 'auditReviews' },
  { collection: 'audit_settings', key: 'auditSettings' },
];

// GMP / 21 CFR Part 11 / EU Annex 11：审计相关集合技术层强制 append-only。
// 任何非 record() 路径（update/remove）改写或删除审计集合均被拒绝，确保审计链不可篡改。
// 审计不可篡改集合：仅审计日志链(audit_logs)与复核记录(audit_reviews)不可修改/删除。
// 注意：audit_settings（复核间隔等配置）是可变配置，不属于哈希链，必须允许 update，故不在此列。
const AUDIT_READONLY_COLLECTIONS = ['audit_logs', 'audit_reviews'];
function assertNotAuditReadonly(collection: Collection): void {
  if (AUDIT_READONLY_COLLECTIONS.includes(collection as string)) {
    throw new ForbiddenException('审计集合不可修改或删除 (append-only)');
  }
}

// runtime.json 单集合叠加格式：data=实体数组；deleted=被删除的种子项 id（保证删除后重启不回现）
interface OverlayEntry {
  data: any[];
  deleted: string[];
}

// 解析叠加片段：兼容旧版（纯数组）与新版（{data,deleted}）两种格式
function parseOverlay(v: any): OverlayEntry {
  if (Array.isArray(v)) return { data: v, deleted: [] };
  if (v && typeof v === 'object' && Array.isArray(v.data)) {
    return { data: v.data, deleted: Array.isArray(v.deleted) ? v.deleted : [] };
  }
  return { data: [], deleted: [] };
}

// 对象型集合（scene_config 单对象）解析：兼容 {data:{}} 与旧版纯对象
function parseObjectOverlay(v: any): Record<string, any> {
  if (Array.isArray(v)) return (v[0] as Record<string, any>) || {};
  if (v && typeof v === 'object' && v.data !== undefined) {
    return (v.data as Record<string, any>) || {};
  }
  return (v as Record<string, any>) || {};
}

const KEY_ALIASES: Record<string, string> = {
  subsystem: 'subsystem_id',
  category: 'category_id',
};

export class MockConnector implements Connector {
  private store: SeedStore;
  // 各集合被删除的种子项 id（叠加层），删除后重启不回现
  private deleted: Partial<Record<Collection, string[]>> = {};

  constructor() {
    this.store = buildSeedStore();
  }

  async connect(): Promise<void> {
    // 内存数据构建于构造函数；启动时叠加 runtime.json 中用户落盘的数据
    await this.loadOverlay();
  }

  // 叠加 runtime.json（若存在）到内存 store。
  // 关键持久化修复：overlay 由「整体替换」改为「按 id 合并」——
  // 种子为基准；overlay 覆盖相同 id 的项、追加新 id 的项；
  // 删除项通过 _deleted 数组追踪，被删种子项重启后保持删除。
  private async loadOverlay(): Promise<void> {
    try {
      if (!fs.existsSync(RUNTIME_PATH)) return;
      const raw = fs.readFileSync(RUNTIME_PATH, 'utf-8');
      const overlay = JSON.parse(raw) as Record<string, any>;
      for (const { collection, key } of PERSIST_MAP) {
        const ov = overlay[key as string];
        if (ov === undefined) continue;
        if (collection === 'scene_config') {
          // 单对象集合：按 key 合并，保留种子默认值未被覆盖的字段
          const runtimeObj = parseObjectOverlay(ov);
          this.store.sceneConfig = { ...this.store.sceneConfig, ...runtimeObj };
          continue;
        }
        const { data, deleted } = parseOverlay(ov);
        this.deleted[collection] = deleted;
        const seedArr = ((this.store as any)[key] as any[]) || [];
        const seedById = new Map<string, any>();
        for (const r of seedArr) seedById.set(r.id, r);
        const result: any[] = [];
        const mergedIds = new Set<string>();
        for (const r of seedArr) {
          if (deleted.includes(r.id)) continue; // 被删除的种子项
          const override = data.find((d) => d.id === r.id);
          if (override) {
            result.push({ ...r, ...override });
            mergedIds.add(r.id);
          } else {
            result.push(r);
          }
        }
        // overlay 中新增的项（种子里不存在的 id）
        for (const d of data) {
          if (mergedIds.has(d.id) || deleted.includes(d.id)) continue;
          result.push(d);
        }
        (this.store as any)[key] = result;
      }
    } catch {
      // 运行时叠加文件损坏则忽略，回退纯种子数据
    }
  }

  // 将当前持久化集合写回 runtime.json（新版 {data,deleted} 格式，try/catch 异步安全）
  private async writeRuntime(): Promise<void> {
    try {
      const obj: Record<string, any> = {};
      for (const { collection, key } of PERSIST_MAP) {
        if (collection === 'scene_config') {
          obj[key as string] = { data: this.store.sceneConfig };
        } else {
          obj[key as string] = {
            data: (this.store as any)[key],
            deleted: this.deleted[collection] || [],
          };
        }
      }
      await fs.promises.mkdir(path.dirname(RUNTIME_PATH), { recursive: true });
      // Windows 下可能遇到瞬时文件锁（杀毒/索引扫描），重试 3 次避免丢数据
      const json = JSON.stringify(obj);
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fs.promises.writeFile(RUNTIME_PATH, json, 'utf-8');
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 120));
        }
      }
      if (lastErr) throw lastErr;
    } catch (e: any) {
      // 落盘失败不影响内存读写（演示容错），但打印原因便于定位
      console.error('[MockConnector] runtime.json 落盘失败:', e?.message || String(e));
    }
  }

  private async maybePersist(collection: Collection): Promise<void> {
    if (PERSIST_MAP.some((p) => p.collection === collection)) {
      await this.writeRuntime();
    }
  }

  private markDeleted(collection: Collection, id: string): void {
    const arr = this.deleted[collection] || (this.deleted[collection] = []);
    if (!arr.includes(id)) arr.push(id);
  }

  private unmarkDeleted(collection: Collection, id: string): void {
    const arr = this.deleted[collection];
    if (arr) this.deleted[collection] = arr.filter((x) => x !== id);
  }

  private collectionRef(name: Collection): any[] {
    switch (name) {
      case 'buildings':
        return this.store.buildings as any;
      case 'devices':
        return this.store.devices as any;
      case 'subsystems':
        return this.store.subsystems as any;
      case 'building_subsystem_config':
        return this.store.buildingSubsystemConfig as any;
      case 'alarm_rules':
        return this.store.alarmRules as any;
      case 'alarms':
        return this.store.alarms as any;
      case 'device_points':
        return this.store.devicePoints as any;
      case 'users':
        return this.store.users as any;
      case 'roles':
        return this.store.roles as any;
      case 'billing_prices':
        return this.store.billingPrices as any;
      case 'billing_quotas':
        return this.store.billingQuotas as any;
      case 'billing_ledger':
        return this.store.billingLedger as any;
      case 'alarm_rule_configs':
        return this.store.alarmRuleConfigs as any;
      case 'scene_config':
        // scene_config 为单对象，包装为数组以便 update 直接 Object.assign 原对象
        return [this.store.sceneConfig] as any;
      case 'device_types':
        return this.store.deviceTypes as any;
      case 'device_brands':
        return this.store.deviceBrands as any;
      case 'control_groups':
        return this.store.controlGroups as any;
      case 'work_orders':
        return this.store.workOrders as any;
      case 'scene_markers':
        return this.store.sceneMarkers as any;
      case 'audit_logs':
        return this.store.auditLogs as any;
      case 'audit_reviews':
        return this.store.auditReviews as any;
      case 'audit_settings':
        return this.store.auditSettings as any;
      default:
        return [];
    }
  }

  private match(rec: any, query?: Query): boolean {
    if (!query) return true;
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      const targetKey = KEY_ALIASES[k] || k;
      const rv = rec[targetKey];
      if (Array.isArray(v)) {
        if (!v.includes(rv)) return false;
      } else if (rv !== v) {
        return false;
      }
    }
    return true;
  }

  async read<T = any>(collection: Collection, query?: Query): Promise<T[]> {
    switch (collection) {
      case 'device_metrics': {
        const device = this.store.devices.find((d) => d.id === query?.device_id);
        if (!device) return [];
        return genDeviceMetrics(device, query?.keys as string[] | undefined, query?.from as string | undefined, query?.to as string | undefined) as unknown as T[];
      }
      case 'subsystem_status':
        return [genSubsystemStatus(this.store, query?.building_id as string | undefined, query?.subsystem as string)] as unknown as T[];
      case 'regulation_overview':
        return [genRegulationOverview(this.store, query?.building_id as string | undefined)] as unknown as T[];
      case 'lifecycle_equipment':
        return [genLifecycleEquipment(this.store, query?.building_id as string | undefined)] as unknown as T[];
      case 'lifecycle_maintenance':
        return [genLifecycleMaintenance(this.store)] as unknown as T[];
      case 'energy_summary':
        return [genEnergySummary(this.store, query?.building_id as string | undefined, (query?.period as string) || 'day')] as unknown as T[];
      case 'energy_trend':
        return [genEnergyTrend(this.store, query?.building_id as string | undefined, query?.subsystem as string | undefined, query?.from as string | undefined, query?.to as string | undefined)] as unknown as T[];
      case 'scene_points':
        return genScenePoints(this.store, query?.building_id as string | undefined, query?.subsystem as string | undefined) as unknown as T[];
      case 'scene_config':
        return [this.store.sceneConfig] as unknown as T[];
      case 'menus':
        return [{ buildings: this.store.buildings, subsystems: this.store.subsystems }] as unknown as T[];
      case 'features':
        return [this.store.features] as unknown as T[];
      case 'live_batch':
        return [genLiveBatch(this.store, query?.building_id as string | undefined, query?.subsystem as string | undefined, (query?.device_ids as string[]) || [])] as unknown as T[];
      default:
        return this.collectionRef(collection).filter((r) => this.match(r, query)) as unknown as T[];
    }
  }

  async findOne<T = any>(collection: Collection, query?: Query): Promise<T | null> {
    const list = await this.read<T>(collection, query);
    return (list && list.length ? list[0] : null) as T | null;
  }

  async create(collection: Collection, record: any): Promise<any> {
    const ref = this.collectionRef(collection);
    if (!ref) throw new BadRequestException(`collection not writable: ${collection}`);
    ref.push(record);
    // 若重建了此前被删除的种子项 id，则从删除清单移除，使其正常显示
    if (record && record.id) this.unmarkDeleted(collection, record.id);
    await this.maybePersist(collection);
    return record;
  }

  async update(collection: Collection, query: Query, patch: any): Promise<any> {
    assertNotAuditReadonly(collection);
    const ref = this.collectionRef(collection);
    let updated: any = null;
    for (const rec of ref) {
      if (this.match(rec, query)) {
        Object.assign(rec, patch);
        updated = rec;
      }
    }
    if (!updated) throw new BadRequestException('record not found for update');
    await this.maybePersist(collection);
    return updated;
  }

  async remove(collection: Collection, query: Query): Promise<void> {
    assertNotAuditReadonly(collection);
    const ref = this.collectionRef(collection);
    const idx = ref.findIndex((r) => this.match(r, query));
    if (idx >= 0) {
      const removed = ref[idx];
      ref.splice(idx, 1);
      // 追踪被删除的种子项 id，叠加层用于「删除后重启不回现」
      if (removed && removed.id) this.markDeleted(collection, removed.id);
      await this.maybePersist(collection);
    }
  }

  async send(target: string, payload: ControlCommand): Promise<ControlAck> {
    return {
      device_id: payload.device_id || null,
      accepted: true,
      message: '指令已受理(mock)',
      echo: { target, action: payload.action, payload: payload.payload },
    };
  }

  subscribe(topics: string[]): void {
    // Mock 模式本地定时器推送；真实模式在此订阅 MQTT topic
  }

  normalize(raw: any): Metric {
    return {
      device_id: raw.device_id ?? raw.id ?? '',
      metric_key: raw.key ?? raw.metric_key ?? '',
      value: Number(raw.value ?? raw.v ?? 0),
      unit: raw.unit ?? '',
      time: raw.time ?? new Date().toISOString(),
      quality: (raw.quality as MetricQuality) ?? 'good',
      source: (raw.source as MetricSource) ?? 'mock',
    };
  }

  // 数据源探查（GK-26）：mock 模式下所有真实适配器均未配置/不可用，
  // 合成集合名单同样来自单一真源 SYNTHETIC_COLLECTIONS（与 real 模式保持一致口径）。
  getDataSourceInfo(): DataSourceInfo {
    return {
      mode: 'mock',
      adapters: {
        http: { configured: false, available: false },
        mqtt: { configured: false, available: false },
        modbus: { configured: false, available: false },
      },
      syntheticCollections: Array.from(SYNTHETIC_COLLECTIONS),
    };
  }
}

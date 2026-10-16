/**
 * GK-03 · Scene Schema 服务（GK-01 共用 + Patch + Version 守卫）
 *
 * 设计：
 *   - `materialize()`   全量从 connector 派生完整 Scene Schema 文档（8 顶层段）。
 *                       GK-01 也在用，方法签名一致；GK-03 负责持久化/反向写回。
 *   - `getVersion()`    返回 `{version, updatedAt}`，从 `scene_schema_versions.json` 读。
 *   - `applyPatch()`    乐观锁：If-Match 头携带 expectedVersion，不匹配 412；匹配则
 *                       段级替换 + 反向写回源表（marker / anchor / alarm_rules / scene_config），
 *                       写入新 version+1 快照。
 *
 * 反向写回规则见 task GK-03 §改造方案（hudLayout / sceneGraph / rules → 源表；
 * cameraPresets / scenarios / bindings / controls → 不反向）。
 *
 * SceneService / SceneConfig / SceneMarker 接口严格保持现有签名，
 * SchemaService 仅调用 SceneService 方法，不重写。
 */

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector, DataSourceInfo } from '../common/connector/connector.interface';
import { SceneService } from './scene.service';
import { Building, Device, SceneMarker } from '../common/types';
import { BUILDINGS } from '../common/constants/catalog';
import { SUBSYSTEMS } from '../common/constants/catalog';
import {
  HudWidgetDto,
  SceneSchemaDocument,
  SceneSchemaPatchDto,
} from './dto/scene-schema.dto';
import { VersionDto } from './dto/version.dto';
import * as fs from 'fs';
import * as path from 'path';

// ---------- 持久化文件 path ----------

const SCHEMA_VERSIONS_PATH = path.resolve(
  process.cwd(),
  'data',
  'scene_schema_versions.json',
);

const FLOOR_HEIGHT = 4.2;

// 子系统 → camera preset 方向名映射（每楼 × 子系统 preset）
const SUBSYSTEM_FOR_PRESET = SUBSYSTEMS.map((s) => s.code);

// ---------- 顶层 schema 段（按 D:\NewPrSz 冻结顺序）----------

const TOP_LEVEL_SEGMENTS = [
  'schemaVersion',
  'meta',
  'dataSources',
  'pointTable',
  'assets',
  'sceneGraph',
  'bindings',
  'rules',
  'hudLayout',
  'cameraPresets',
  'scenarios',
] as const;

type TopLevelSegment = (typeof TOP_LEVEL_SEGMENTS)[number];

// ---------- 持久化结构 ----------

interface SchemaMetaEntry {
  currentVersion: number;
  lastUpdatedAt: string | null;
}

interface SchemaVersionSnapshot {
  version: number;
  document: SceneSchemaDocument;
  updatedAt: string;
  updatedBy: string;
}

interface SchemaVersionsFile {
  schema_meta: SchemaMetaEntry[];
  schema_versions: SchemaVersionSnapshot[];
}

const EMPTY_DOC_BASELINE: SceneSchemaDocument = {
  schemaVersion: '1.0.0',
  meta: {
    projectId: 'kaiping-hospital',
    name: '开平市中心医院能源管理',
    industry: 'hospital',
    author: 'system',
    createdAt: '',
    updatedAt: '',
  },
  dataSources: [],
  pointTable: [],
  assets: [],
  sceneGraph: [],
  bindings: [],
  rules: [],
  hudLayout: {
    canvas: { width: 1920, height: 1080, theme: 'tech_blue' },
    widgets: [],
  },
  cameraPresets: [],
  scenarios: [],
};

// ---------- 工具：safe file I/O ----------

function ensureDataDir(): void {
  const dir = path.dirname(SCHEMA_VERSIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readFileSyncSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    this?.logger?.error?.(
      `[schema] read ${filePath} failed: ${(e as Error).message}; using fallback`,
    );
    return fallback;
  }
}

function writeFileSyncSafe(filePath: string, payload: unknown): void {
  ensureDataDir();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// ---------- 服务实现 ----------

@Injectable()
export class SchemaService {
  private readonly logger = new Logger(SchemaService.name);

  constructor(
    @Inject(CONNECTOR_TOKEN) private readonly connector: Connector,
    private readonly sceneService: SceneService,
  ) {}

  // 数据源探查（GK-26）：将后端真实数据源状态暴露给前端，避免前端镜像猜测。
  // 直接委托给实际生效的连接器实例（mock → mode:'mock'，real → mode:'real'）。
  async getDataSourceInfo(): Promise<DataSourceInfo> {
    return this.connector.getDataSourceInfo();
  }

  // -------- 物化 --------

  async materialize(): Promise<SceneSchemaDocument> {
    const t0 = Date.now();
    const [buildings, devices, markers, sceneCfg, alarmRules] = await Promise.all([
      this.connector.read<Building>('buildings'),
      this.connector.read<Device>('devices'),
      this.connector.read<SceneMarker>('scene_markers'),
      this.sceneService.config(),
      this.connector.read<any>('alarm_rules'),
    ]);

    const sceneGraph: SceneSchemaDocument['sceneGraph'] = [];
    const pointTable: SceneSchemaDocument['pointTable'] = [];
    const bindings: SceneSchemaDocument['bindings'] = [];
    const assets: SceneSchemaDocument['assets'] = [];
    const rules: SceneSchemaDocument['rules'] = [];
    const cameraPresets: SceneSchemaDocument['cameraPresets'] = [];
    const scenarios: SceneSchemaDocument['scenarios'] = [];

    // 1. root 节点
    sceneGraph.push({
      id: 'root',
      type: 'root',
      name: 'Root',
      parent: null,
      transform: { position: [0, 0, 0] },
    });

    // 2. assets（从 scene_config.model_url）
    if (sceneCfg?.model_url) {
      assets.push({
        key: 'main_model',
        displayName: '院区主模型',
        category: 'structure',
        source: {
          jobId: sceneCfg.model_url,
          pipelineVersion: 'v1',
          srcFile: sceneCfg.model_url,
        },
        lods: [
          {
            key: sceneCfg.model_url,
            minDistance: 0,
            tris: 100000,
          },
        ],
        pivot: 'bottomCenter',
        semantic: 'structure',
      });
    }

    // 3. 楼栋 / 楼层（每栋楼）
    const buildingIndex = new Map<string, Building>();

    // 设备楼层预扫描（GK-01-semantic）：供楼栋缺少 floors 字段时兜底“该楼最高已物化楼层”，
    // 口径与第 4 段 floor 节点生成一致（归一化后取 max）。
    const maxDeviceFloorByBuilding = new Map<string, number>();
    for (const d of devices) {
      const rawF = d.location?.floor;
      const f = typeof rawF === 'number' && Number.isInteger(rawF) && rawF > 0 ? rawF : 1;
      const prev = maxDeviceFloorByBuilding.get(d.building_id) ?? 0;
      if (f > prev) maxDeviceFloorByBuilding.set(d.building_id, f);
    }

    for (const b of buildings) {
      const declaredFloors =
        typeof b.floors === 'number' && Number.isInteger(b.floors) && b.floors > 0;
      const deviceFloorCount = declaredFloors
        ? b.floors
        : maxDeviceFloorByBuilding.get(b.id) || 1;

      sceneGraph.push({
        id: `bldg_${b.id}`,
        name: b.name,
        parent: 'root',
        type: 'building',
        transform: {
          position: [
            b.local_origin?.x ?? 0,
            b.local_origin?.y ?? 0,
            b.local_origin?.z ?? 0,
          ],
        },
        // GK-01-semantic：对齐前端 Three SceneRenderer 消费契约（SceneRenderer.vue）
        //   semantic.deviceId  → buildingId（原始 DB id，不带 bldg_ 前缀）
        //   semantic.meta.code → buildingCode（b.code；缺省回退 name/空串）
        //   semantic.meta.floors → 楼栋层数（数值；:148 映射后经 buildingBoxSize 算体块高度，
        //                          故必须是 count 而非数组）
        //   semantic.meta.gross_area → 可用面积（footprint 估算）
        semantic: {
          tags: ['building'],
          deviceId: b.id,
          meta: {
            code: b.code || b.name || '',
            floors: deviceFloorCount,
            gross_area: typeof b.gross_area === 'number' ? b.gross_area : 0,
          },
        },
      });
      buildingIndex.set(b.id, b);

      // overview camera preset
      cameraPresets.push({
        id: `preset_bldg_${b.id}_overview`,
        name: `${b.name} 全景`,
        mode: 'orbit',
        pose: {
          position: [
            (b.local_origin?.x ?? 0) + 30,
            (b.local_origin?.y ?? 0) + 50,
            (b.local_origin?.z ?? 0) + 60,
          ],
          lookAt: [b.local_origin?.x ?? 0, 10, b.local_origin?.z ?? 0],
          fov: 55,
        },
        transitionMs: 800,
      });

      // 每楼层 preset
      for (let f = 1; f <= (b.floors || 1); f++) {
        cameraPresets.push({
          id: `preset_floor_${b.id}_${f}`,
          name: `${b.name} F${f}`,
          mode: 'fixed',
          pose: {
            position: [
              (b.local_origin?.x ?? 0) + 25,
              (b.local_origin?.y ?? 0) + (f - 1) * FLOOR_HEIGHT + 5,
              (b.local_origin?.z ?? 0) + 30,
            ],
            lookAt: [
              b.local_origin?.x ?? 0,
              (b.local_origin?.y ?? 0) + (f - 1) * FLOOR_HEIGHT,
              b.local_origin?.z ?? 0,
            ],
            fov: 60,
          },
          transitionMs: 600,
        });
      }
    }

    // 4. 设备 → scene graph + point table（GAP A：按 (building, floor) 派生 floor 节点，
    //    形成 root → building → floor → device 四级层级；设备 parent 指向 floor_*）
    const floorIndex = new Map<string, string>(); // `${buildingId}_${floor}` → floor node id
    for (const d of devices) {
      const buildingId = d.building_id;
      const rawFloor = d.location?.floor;
      const floor = typeof rawFloor === 'number' && Number.isInteger(rawFloor) && rawFloor > 0 ? rawFloor : 1;
      const b = buildingIndex.get(buildingId);
      const anchor = b?.local_origin ?? { x: 0, y: 0, z: 0 };

      // 每个 (buildingId, floor) 组合只生成一次 floor 节点
      const floorKey = `${buildingId}_${floor}`;
      let floorNodeId = floorIndex.get(floorKey);
      if (!floorNodeId) {
        floorNodeId = `floor_${buildingId}_${floor}`;
        floorIndex.set(floorKey, floorNodeId);
        sceneGraph.push({
          id: floorNodeId,
          name: `${b?.name ?? buildingId} ${floor}F`,
          parent: `bldg_${buildingId}`,
          type: 'floor',
          transform: {
            position: [
              anchor.x,
              anchor.y + (floor - 1) * FLOOR_HEIGHT,
              anchor.z,
            ],
          },
          semantic: { tags: ['floor'] },
        });
      }

      const nodeId = `device_${d.id}`;
      sceneGraph.push({
        id: nodeId,
        name: d.name,
        parent: floorNodeId,
        type: 'device',
        assetKey: 'main_model',
        transform: {
          position: [
            d.location?.x ?? 0,
            d.location?.y ?? (floor - 1) * FLOOR_HEIGHT + 2,
            d.location?.z ?? 0,
          ],
        },
        // GK-01-semantic：对齐前端 Three SceneRenderer 消费契约（SceneRenderer.vue）
        //   semantic.meta.building_id → 设备所属楼栋原始 DB id（真实 parent 是 floor_<bid>_<f>，
        //                                renderer 无法从前缀解析楼栋，故必须显式携带）
        //   semantic.meta.marker_type → 源表 devices 无 marker_type 列，取 category_id 近义值
        semantic: {
          deviceId: d.id,
          deviceType: mapCategoryToDeviceType(d.category_id),
          meta: {
            code: d.code,
            room: d.location?.room,
            building_id: d.building_id,
            marker_type: d.category_id || 'equipment',
          },
        },
      });

      // 每个设备 1 个虚拟点位（生产由 GK-01 物化，从 metrics 聚合；此处为占位
      // 保证 8 顶层段字段稳定）
      pointTable.push({
        pointId: `${d.code}.STATUS`,
        sourceId: 'mock',
        deviceId: d.id,
        name: `${d.name} 状态`,
        unit: '',
        unitId: 1,
        registerType: 'holdingRegister',
        address: 0,
        dataType: 'bool',
        length: 1,
        byteOrder: 'ABCD',
        access: 'read',
      });

      bindings.push({
        id: `bind_${d.id}_status`,
        nodeId,
        pointId: `${d.code}.STATUS`,
        target: 'visibility',
        mode: 'direct',
      });
    }

    // 5. markers → scene graph nodes
    for (const m of markers) {
      // GK-01-semantic：仅“区域热点”类标记（shape==='area' 且含多边形顶点）补 area 语义；
      // 纯装饰 decor（点位/子系统标记）保持原样（仅 tags，不带 meta）。
      const isArea =
        m.shape === 'area' && Array.isArray(m.area_points) && m.area_points.length > 0;

      // node.semantic 顶层 shape/areaPoints/color/link/params 均为冻结 schema 允许的
      // additionalProperties（scene-schema.v1: node.semantic & semantic.meta 都 additionalProperties:true），
      // DTO 未声明这些扩展键，故局部声明为 any 以绕过 TS 多余属性检查（不改 DTO/冻结字段）。
      const semantic: any = { tags: ['marker', m.marker_type] };
      if (isArea) {
        semantic.shape = 'area';
        // SceneRenderer :189 读顶层 semantic.areaPoints；meta.area_points 双写以兼容
        semantic.areaPoints = m.area_points;
        if (typeof m.color === 'string') semantic.color = m.color;
        if (m.link != null) semantic.link = m.link;
        if (m.params != null) semantic.params = m.params;
        semantic.meta = {
          areaPoints: m.area_points,
          building_id: m.building_id,
          floor: typeof m.floor === 'number' ? m.floor : Number(m.floor) || 0,
        };
      }

      sceneGraph.push({
        id: `marker_${m.id}`,
        name: m.label || 'marker',
        parent: `bldg_${m.building_id}`,
        type: 'decor',
        transform: {
          position: [m.position?.x ?? 0, m.position?.y ?? 0, m.position?.z ?? 0],
        },
        visible: m.visible !== false,
        semantic,
      });
    }

    // 6. alarm_rules → schema.rules（缩窄映射）
    for (const r of alarmRules || []) {
      rules.push({
        id: r.id,
        name: r.description || `${r.subsystem}/${r.metric_key}`,
        enabled: !!r.enabled,
        level: r.level || 'warning',
        condition: {
          op: mapOpToSchema(r.operator),
          pointId: r.metric_key,
          value: Number(r.threshold ?? 0),
        },
        actions: [
          {
            type: 'hud.alert.push',
            panel: r.subsystem,
            text: r.description || `${r.subsystem} 阈值告警`,
          },
        ],
        recovery: {
          condition: {
            op: mapRecoveryOp(r.operator),
            pointId: r.metric_key,
            value: Number(r.threshold ?? 0),
          },
          actions: [{ type: 'hud.alert.resolve' }],
        },
      });
    }

    // 7. scenarios: overview + 7 子系统 focus
    scenarios.push({
      id: 'overview',
      name: '全院概览',
      tracks: [
        { atSec: 0, action: 'camera.apply', presetId: 'preset_bldg_1_overview' },
      ],
    });
    for (const sys of SUBSYSTEM_FOR_PRESET) {
      scenarios.push({
        id: `sys_${sys}_focus`,
        name: `${sys} 视角`,
        tracks: [
          { atSec: 0, action: 'camera.apply', presetId: 'preset_bldg_1_overview' },
        ],
      });
    }

    // 8. hudLayout：默认 7 个子系统综合面板（GK-27：由 17 固定框精简为 7，
    //    语义化 id panel-<subsystem>，含 enabled 开关；历史 17 框持久化自动迁移为 7）
    const persistedHud = (sceneCfg as any).hud_layout_widgets;
    const hudLayout: SceneSchemaDocument['hudLayout'] = mergeHudLayout(
      Array.isArray(persistedHud) ? persistedHud : undefined,
    );

    const doc: SceneSchemaDocument = {
      schemaVersion: '1.0.0',
      meta: {
        projectId: 'kaiping-hospital',
        name: '开平市中心医院能源管理',
        industry: 'hospital',
        author: 'system',
        createdAt: new Date(t0).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      dataSources: [
        {
          id: 'mock-primary',
          kind: 'mock',
          enabled: true,
          displayName: '主合成数据源',
        },
      ],
      pointTable,
      assets,
      sceneGraph,
      bindings,
      rules,
      hudLayout,
      cameraPresets,
      scenarios,
    };

    this.logger.log(`materialize() took ${Date.now() - t0}ms`);
    return doc;
  }

  // -------- 版本元数据 --------

  async getVersion(): Promise<VersionDto> {
    const file = this.readSchemaFile();
    const meta = (file.schema_meta && file.schema_meta[0]) || {
      currentVersion: 0,
      lastUpdatedAt: null,
    };
    return { version: meta.currentVersion, updatedAt: meta.lastUpdatedAt };
  }

  // -------- Patch（核心） --------

  async applyPatch(
    patch: Partial<SceneSchemaPatchDto>,
    expectedVersion: number,
    userId: string,
  ): Promise<VersionDto> {
    if (!patch || typeof patch !== 'object') {
      throw new BadRequestException('Patch body 必须为非空对象');
    }

    // 1. 当前物化（source of truth 用于 deep-merge）
    const current = await this.materialize();

    // 2. 段级替换：patch 中出现的段作为完整替换
    const next: SceneSchemaDocument = this.deepMerge(current, patch as SceneSchemaDocument);

    // 3. 版本守卫（关键：必须在反向写回前判断，否则过期写入会污染源表）
    const file = this.readSchemaFile();
    const meta: SchemaMetaEntry = (file.schema_meta && file.schema_meta[0]) || {
      currentVersion: 1,
      lastUpdatedAt: null,
    };
    if (expectedVersion !== meta.currentVersion) {
      throw new HttpException(
        {
          code: 412,
          message: `Version mismatch: If-Match=${expectedVersion}, current=${meta.currentVersion}`,
          error: 'Precondition Failed',
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    // 4. 反向写回源表（仅当版本匹配）
    await this.reverseWriteback(current, next);

    // 5. 持久化快照 + version+1
    const newVersion = meta.currentVersion + 1;
    const updatedAt = new Date().toISOString();
    const updatedBy = userId || 'system';

    const snapshot: SchemaVersionSnapshot = {
      version: newVersion,
      document: next,
      updatedAt,
      updatedBy,
    };

    const newFile: SchemaVersionsFile = {
      schema_meta: [{ currentVersion: newVersion, lastUpdatedAt: updatedAt }],
      schema_versions: [...(file.schema_versions || []), snapshot],
    };

    writeFileSyncSafe(SCHEMA_VERSIONS_PATH, newFile);

    this.logger.log(
      `applyPatch: ${meta.currentVersion} → ${newVersion} by ${updatedBy}`,
    );
    return { version: newVersion, updatedAt };
  }

  // -------- 反向写回核心 --------

  /**
   * 段级 diff → 按规则调现有 SceneService 方法或 connector 直接写。
   * 严格只调现有方法，不重写签名。
   */
  private async reverseWriteback(
    before: SceneSchemaDocument,
    after: SceneSchemaDocument,
  ): Promise<void> {
    // ---- A. sceneGraph 节点 diff ----
    if (after.sceneGraph !== before.sceneGraph) {
      const beforeById = indexBy(before.sceneGraph, 'id');
      for (const node of after.sceneGraph) {
        const prev = beforeById.get(node.id);
        if (!prev || !node.transform?.position) continue;

        // bldg_*: 反向到 building_anchors
        if (node.id.startsWith('bldg_')) {
          const buildingId = node.id.replace(/^bldg_/, '');
          const cfg = await this.sceneService.config();
          const anchors = Array.isArray(cfg.building_anchors)
            ? [...cfg.building_anchors]
            : [];
          const idx = anchors.findIndex(
            (a: any) => String(a.building_id) === String(buildingId),
          );
          const newAnchor = {
            ...(idx >= 0 ? anchors[idx] : {}),
            building_id: buildingId,
            position: {
              x: node.transform.position[0] ?? 0,
              y: node.transform.position[1] ?? 0,
              z: node.transform.position[2] ?? 0,
            },
          };
          if (idx >= 0) anchors[idx] = newAnchor;
          else anchors.push(newAnchor);
          await this.sceneService.setAnchors(anchors);
        }

        // marker_*: 反向到 scene_markers（position 或 visible 改动）
        if (node.id.startsWith('marker_')) {
          const markerId = node.id.replace(/^marker_/, '');
          const patch: Record<string, any> = {};
          if (
            !prev.transform?.position ||
            prev.transform.position[0] !== node.transform.position[0] ||
            prev.transform.position[1] !== node.transform.position[1] ||
            prev.transform.position[2] !== node.transform.position[2]
          ) {
            patch.position = {
              x: node.transform.position[0] ?? 0,
              y: node.transform.position[1] ?? 0,
              z: node.transform.position[2] ?? 0,
            };
          }
          if (typeof node.visible === 'boolean' && prev.visible !== node.visible) {
            patch.visible = node.visible;
          }
          if (Object.keys(patch).length) {
            await this.sceneService.updateMarker(markerId, patch);
          }
        }
      }
    }

    // ---- B. hudLayout widgets: 反向到 scene_config.hud_layout_widgets ----
    if (after.hudLayout !== before.hudLayout) {
      await this.connector.update('scene_config', {}, {
        hud_layout_widgets: after.hudLayout?.widgets || [],
      });
    }

    // ---- C. rules 数组 diff → 反向到 alarm_rules（connector 直写）----
    if (after.rules !== before.rules) {
      await this.reverseWritebackRules(before.rules || [], after.rules || []);
    }

    // ---- D. 以下段强制不反向（仅 schema 派生）----
    // cameraPresets / scenarios / bindings / controls / pointTable / assets /
    // dataSources / meta — 由物化器下次计算，不写回源表。
  }

  /**
   * rules[] 段 diff：以 `id` 为键。
   * 新增 → connector.create；存在 → connector.update；消失 → connector.remove。
   * scene.rules.condition 的少量字段映射到 alarm_rules 行（缩窄：
   *   id ← rule.id
   *   description ← rule.name
   *   level       ← rule.level
   *   enabled     ← rule.enabled
   *   subsystem   ← 'scene-schema-v1'
   *   metric_key  ← rule.condition.pointId || rule.id
   *   operator    ← rule.condition.op 若合法
   *   threshold   ← Number(rule.condition.value)）
   */
  private async reverseWritebackRules(
    beforeRules: SceneSchemaDocument['rules'],
    afterRules: SceneSchemaDocument['rules'],
  ): Promise<void> {
    const beforeIds = new Set(beforeRules.map((r) => r.id));
    const afterIds = new Set(afterRules.map((r) => r.id));

    // 删除消失的 id
    for (const id of beforeIds) {
      if (!afterIds.has(id)) {
        try {
          await this.connector.remove('alarm_rules', { id });
        } catch (e) {
          this.logger.warn(
            `reverse rules: remove alarm_rule id=${id} failed: ${(e as Error).message}`,
          );
        }
      }
    }

    // 新增 / 更新
    for (const rule of afterRules) {
      const patch = this.ruleToAlarmRule(rule);
      try {
        const existing = await this.connector.findOne<any>('alarm_rules', { id: rule.id });
        if (existing) {
          await this.connector.update('alarm_rules', { id: rule.id }, patch);
        } else {
          await this.connector.create('alarm_rules', { id: rule.id, ...patch });
        }
      } catch (e) {
        this.logger.warn(
          `reverse rules: write alarm_rule id=${rule.id} failed: ${(e as Error).message}`,
        );
      }
    }
  }

  private ruleToAlarmRule(rule: any): Record<string, any> {
    const op = rule?.condition?.op;
    const allowed = ['>', '>=', '<', '<=', '==', '!='];
    const threshold = Number(rule?.condition?.value ?? 0);
    return {
      description: rule?.name || rule?.id,
      level: rule?.level || 'warning',
      enabled: typeof rule?.enabled === 'boolean' ? rule.enabled : true,
      subsystem: 'scene-schema-v1',
      metric_key: rule?.condition?.pointId || rule?.id,
      operator: allowed.includes(op) ? op : '>',
      threshold: Number.isFinite(threshold) ? threshold : 0,
    };
  }

  // -------- 文件 I/O --------

  private readSchemaFile(): SchemaVersionsFile {
    const empty: SchemaVersionsFile = {
      schema_meta: [{ currentVersion: 1, lastUpdatedAt: new Date().toISOString() }],
      schema_versions: [
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
          document: EMPTY_DOC_BASELINE,
        },
      ],
    };
    return readFileSyncSafe<SchemaVersionsFile>(SCHEMA_VERSIONS_PATH, empty);
  }

  // -------- 工具方法 --------

  /**
   * 浅到中度深合并：对象 → 递归；数组 → 段级 replace（patch 段整体替换由调用方决定）。
   * 注意：本服务在 applyPatch 中对每个顶级段用 patch 直接替换而非 deep merge。
   * 该方法保留以供未来需要字段级 patch 时使用。
   */
  private deepMerge<T>(base: T, override: Partial<T>): T {
    if (Array.isArray(base) && Array.isArray(override)) {
      return (override as T);
    }
    if (
      base &&
      typeof base === 'object' &&
      !Array.isArray(base) &&
      override &&
      typeof override === 'object' &&
      !Array.isArray(override)
    ) {
      const out: Record<string, any> = { ...(base as any) };
      for (const k of Object.keys(override as any)) {
        const v = (override as any)[k];
        if (v === undefined) continue;
        out[k] = this.deepMerge((base as any)[k], v);
      }
      return out as T;
    }
    return (override === undefined ? base : (override as T));
  }
}

// ---------- 顶层模块辅助（与 SchemaService 同文件，避免拆碎） ----------

function indexBy<T extends { id: string }>(arr: T[], key: keyof T): Map<string, T> {
  const m = new Map<string, T>();
  for (const item of arr || []) {
    m.set(String(item[key]), item);
  }
  return m;
}

// ---------- hudLayout 默认 7 子系统综合面板（GK-27：由 17 固定框精简为 7 个） ----------

const HUD_DESIGN_W = 1920;
const HUD_DESIGN_H = 1080;

// 7 子系统（与 frontend/src/lib/bigscreen-layout.ts SUBSYSTEM_CODES 一致）
const HUD_SUBSYSTEMS: string[] = [
  'regulation',
  'lifecycle',
  'hvac',
  'lighting',
  'power',
  'hotwater',
  'elevator',
];

const HUD_SUBSYSTEM_TITLE: Record<string, string> = {
  regulation: '能源监管总览',
  lifecycle: '设备全生命周期',
  hvac: '空调系统',
  lighting: '智能照明',
  power: '供配电系统',
  hotwater: '热水系统',
  elevator: '电梯系统',
};

// 每个子系统默认 widget 类型（冻结 enum；管理员可在后台 DIY 修改）
const HUD_SUBSYSTEM_WTYPE: Record<string, HudWidgetType> = {
  regulation: 'ai_panel',
  lifecycle: 'status_grid',
  hvac: 'device_board',
  lighting: 'status_light',
  power: 'gauge',
  hotwater: 'line_chart',
  elevator: 'device_board',
};

// 旧版 17 框 id 集合（用于识别历史持久化数据，触发一次性迁移到 7 框）
const HUD_LEGACY_BOX_KEYS: string[] = [
  'left-alarm',
  'right-hvac',
  'right-power',
  'right-temp-trend',
  'right-voltage',
  'right-humidity',
  'right-load-trend',
  'right-energy',
  'right-elevator',
  'right-energy-trend',
  'right-online',
  'bottom-source',
  'bottom-category-trend',
  'bottom-status',
  'bottom-response',
  'bottom-dept-alarm',
  'bottom-traffic-trend',
];

type HudWidgetType = HudWidgetDto['type'];

// frame / subsystem / enabled 为附加元数据（冻结 schema 允许 additionalProperties），供前端 DIY 绑定
interface MaterializedHudWidget extends HudWidgetDto {
  frame?: string;
  subsystem?: string;
  enabled?: boolean;
}

// 识别历史 17 框持久化（任一旧 id 命中即视为旧版）
function isLegacyHud(persisted: any[] | undefined): boolean {
  if (!Array.isArray(persisted) || persisted.length === 0) return false;
  return persisted.some(
    (w) => w && typeof w.id === 'string' && HUD_LEGACY_BOX_KEYS.includes(w.id),
  );
}

// 生成 7 个子系统综合面板的默认布局（语义化 id：panel-<subsystem>，含 enabled:true）
function defaultHudLayout(): SceneSchemaDocument['hudLayout'] {
  const widgets: MaterializedHudWidget[] = [];
  // 3 列 × 3 行网格（最后一行仅 1 个），设计分辨率 1920×1080
  const cols = [
    { x: 20, w: 616 },
    { x: 651, w: 616 },
    { x: 1282, w: 616 },
  ];
  const rowY = [120, 438, 756];
  const rowH = 303;
  const slots = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: 2, row: 1 },
    { col: 0, row: 2 },
  ];
  HUD_SUBSYSTEMS.forEach((sub, i) => {
    const slot = slots[i];
    const c = cols[slot.col];
    const y = rowY[slot.row];
    widgets.push({
      id: `panel-${sub}`,
      type: HUD_SUBSYSTEM_WTYPE[sub] || 'stat_card',
      title: HUD_SUBSYSTEM_TITLE[sub] || sub,
      rect: [c.x, y, c.w, rowH],
      z: 1,
      locked: false,
      frame: 'tech',
      subsystem: sub,
      enabled: true,
    });
  });
  return {
    canvas: { width: HUD_DESIGN_W, height: HUD_DESIGN_H, theme: 'tech_blue' },
    widgets,
  };
}

/**
 * 合并持久化 hudLayout widgets 与默认 7 框：
 *  - 无持久化 / 历史 17 框 → 直接返回默认 7 框（触发迁移，覆盖旧布局）。
 *  - 新版（panel-* 或管理员自定义）持久化 → 以持久化为准（保留增删/开关/DIY），
 *    缺失字段回退默认；enabled 缺省视为 true。
 */
function mergeHudLayout(
  persisted: any[] | undefined,
): SceneSchemaDocument['hudLayout'] {
  const base = defaultHudLayout();
  if (!persisted || !persisted.length || isLegacyHud(persisted)) return base;

  const baseById = new Map<string, MaterializedHudWidget>();
  for (const w of base.widgets) baseById.set(w.id, w);

  const widgets: MaterializedHudWidget[] = persisted.map((w) => {
    const id =
      typeof w?.id === 'string'
        ? w.id
        : `panel-custom-${Math.random().toString(36).slice(2, 8)}`;
    const baseW = baseById.get(id);
    return {
      id,
      type:
        typeof w.type === 'string'
          ? (w.type as HudWidgetType)
          : (baseW?.type as HudWidgetType) || 'stat_card',
      title: typeof w.title === 'string' ? w.title : baseW?.title || id,
      rect:
        Array.isArray(w.rect) && w.rect.length === 4
          ? (w.rect as [number, number, number, number])
          : (baseW?.rect as [number, number, number, number]) || [0, 0, 300, 200],
      z: typeof w.z === 'number' ? w.z : baseW?.z ?? 1,
      locked: typeof w.locked === 'boolean' ? w.locked : baseW?.locked ?? false,
      frame: typeof w.frame === 'string' ? w.frame : baseW?.frame || 'tech',
      subsystem: typeof w.subsystem === 'string' ? w.subsystem : baseW?.subsystem,
      enabled: typeof w.enabled === 'boolean' ? w.enabled : true,
    };
  });

  return { canvas: base.canvas, widgets };
}

function mapCategoryToDeviceType(categoryId?: string): string {
  if (!categoryId) return 'SENSOR';
  const m: Record<string, string> = {
    screw_chiller: 'CHILLER',
    water_pump: 'PUMP',
    cooling_tower: 'CT',
    vrf_outdoor: 'AC',
    split_ac: 'AC',
    heat_pump_water: 'HP',
    air_cooled_module: 'CHILLER',
  };
  return m[categoryId] || 'SENSOR';
}

function mapOpToSchema(op?: string): any {
  const m: Record<string, string> = {
    '>': '>',
    '>=': '>=',
    '<': '<',
    '<=': '<=',
    '==': '==',
    '!=': '!=',
  };
  return m[op || ''] || '>';
}

function mapRecoveryOp(op?: string): any {
  // 简单对称：'>' 的恢复是 '<=' 等；这里保守用 '!=' 兜底
  return mapOpToSchema(op === '>' ? '<=' : op === '<' ? '>=' : '==');
}

// GK-30 · 楼层真实模型 additive 配置（schema 可配映射的本地权威源）
//
// 背景（关键约束）：后端 SchemaService.materialize() 每次 GET /scene/schema 都会从 sceneConfig
// 重建 assets 段，因此通过 PUT /scene/schema 写入的 assets additive 记录不会出现在后续 GET 中
// （已实测验证：PUT 后 GET 仅返回 main_model）。故前端以本文件为楼层模型的权威配置源，
// SceneRenderer 在读取时仍优先尝试 schema.assets 中的 floor_model 记录（前瞻兼容，若后端
// 未来直接服务该记录则自动采用），回退到本配置。
//
// ── 楼栋 4（妇产儿科大楼）映射参数来源（实测，非魔法数字） ──
//   - GLB 包围盒（Blender 实测，米制）：size=[68.8, 35.7, 4.5]，footprint 68.8(长)×35.7(短)，
//     楼层板厚 4.5m，模型原生 Z-up 经 export_yup 转为 glTF Y-up。
//   - 楼栋 4 程序盒体 footprint 边长 = clamp(√(36000/15),8,40)*0.6 = 40*0.6 = 24 场景单位。
//   - scale = 盒体边长 / 模型最大水平跨度 = 24 / 68.8 = 0.3488（统一缩放，保长宽比）。
//   - 模型按包围盒中心归零后，placement：
//       position.x = 楼栋锚点 x = buildingAnchor(3).x = 40
//       position.z = 楼栋锚点 z = buildingAnchor(3).z = -20
//       position.y = 模型板厚一半 * scale = (4.5/2)*0.3488 ≈ 0.785（板底贴地 y=0）
//
// ── 楼栋 6（后勤楼 / 后勤大楼，HQL_textured.glb）映射参数来源（Blender 4.2 实测） ──
//   - 模型为真实后勤大楼：1F/2F/3F 三层主体 + 窗/门 + 壁挂空调，已按楼层切分为 hql-f1/f2/f3.glb，
//     整栋为 hql-building.glb（选中 6 号楼时替换程序盒体）。
//   - GLB 包围盒（Blender Z-up，米制）：水平跨度 max(sizeX,sizeY)=94.44，高度 sizeZ≈4.6/4.65/5.98（逐层）。
//   - 楼栋 6 程序盒体 footprint 边长 = clamp(√(9000/3),8,40)*0.6 = 40*0.6 = 24 场景单位。
//   - scale = 盒体边长 / 模型最大水平跨度 = 24 / 94.44 = 0.2541（统一缩放，保长宽比）。
//   - 模型按包围盒中心归零后，逐层按真实层高堆叠 placement（box 隐藏，仅该层可见）：
//       position.x = 楼栋锚点 x = buildingAnchor(5).x = -80
//       position.z = 楼栋锚点 z = buildingAnchor(5).z = 20
//       position.y = (层序号-1)*层高场景单位 + (本层高度/2)*scale
//         层高场景单位 = FLOOR_HEIGHT(4.2)*HEIGHT_SCALE(0.3)*sizeScale(1) = 1.26
//         F1: 0 + (4.60/2)*0.2541 ≈ 0.585
//         F2: 1.26 + (4.65/2)*0.2541 ≈ 1.851
//         F3: 2.52 + (5.98/2)*0.2541 ≈ 3.280
//   - rotationY = 0：保留 Revit/Blender 导出原生朝向。
import type { FloorModelAsset } from '@/types/api'

export const FLOOR_MODELS: FloorModelAsset[] = [
  {
    id: 'asset_floor_fc_f1',
    kind: 'floor_model',
    url: '/models/floor-fc-f1.glb',
    buildingId: '4',
    floor: 1,
    mapping: {
      position: [40, 0.785, -20],
      rotationY: 0,
      scale: 0.3488,
    },
    triCount: 18528,
    byteSize: 604300,
  },
  // ── 楼栋 6（后勤楼）：HQL_textured.glb 按楼层切分 ──
  {
    id: 'asset_floor_hql_f1',
    kind: 'floor_model',
    url: '/models/hql-f1.glb',
    buildingId: '6',
    floor: 1,
    mapping: { position: [-80, 0.585, 20], rotationY: 0, scale: 0.2541 },
    triCount: 0,
    byteSize: 10767608,
  },
  {
    id: 'asset_floor_hql_f2',
    kind: 'floor_model',
    url: '/models/hql-f2.glb',
    buildingId: '6',
    floor: 2,
    mapping: { position: [-80, 1.851, 20], rotationY: 0, scale: 0.2541 },
    triCount: 0,
    byteSize: 10895244,
  },
  {
    id: 'asset_floor_hql_f3',
    kind: 'floor_model',
    url: '/models/hql-f3.glb',
    buildingId: '6',
    floor: 3,
    mapping: { position: [-80, 3.28, 20], rotationY: 0, scale: 0.2541 },
    triCount: 0,
    byteSize: 9050780,
  },
]

/**
 * 整栋建筑真实模型（选中楼栋时替换程序盒体；与楼层钻取模型共用 floorModelGroup）。
 * 与 FloorModelAsset 共用 mapping 结构，但语义为「整栋」而非「单层」。
 */
export interface BuildingModelAsset {
  id: string
  url: string
  buildingId: string
  mapping: { position: [number, number, number]; rotationY: number; scale: number }
}

export const BUILDING_MODELS: BuildingModelAsset[] = [
  {
    id: 'asset_bldg_hql',
    url: '/models/hql-building.glb',
    buildingId: '6',
    mapping: { position: [-80, 1.652, 20], rotationY: 0, scale: 0.2541 },
  },
]

export function findBuildingModel(buildingId: string): BuildingModelAsset | null {
  return BUILDING_MODELS.find((m) => String(m.buildingId) === String(buildingId)) || null
}

export function findFloorModel(buildingId: string, floor: number): FloorModelAsset | null {
  return (
    FLOOR_MODELS.find(
      (m) => String(m.buildingId) === String(buildingId) && Number(m.floor) === Number(floor),
    ) || null
  )
}

// 从 schema.assets 中提取 floor_model 记录（前瞻兼容：后端若直接服务该记录则采用）
export function floorModelFromSchemaAssets(
  assets: unknown,
  buildingId: string,
  floor: number,
): FloorModelAsset | null {
  if (!Array.isArray(assets)) return null
  const hit = assets.find(
    (a: any) =>
      a &&
      (a.kind === 'floor_model' || String(a.key || '').startsWith('asset_floor')) &&
      String(a.buildingId) === String(buildingId) &&
      Number(a.floor) === Number(floor) &&
      a.url &&
      a.mapping,
  ) as any
  if (!hit) return null
  return {
    id: hit.id || hit.key || `asset_floor_${buildingId}_${floor}`,
    kind: 'floor_model',
    url: hit.url,
    buildingId: String(hit.buildingId),
    floor: Number(hit.floor),
    mapping: {
      position: hit.mapping.position,
      rotationY: Number(hit.mapping.rotationY) || 0,
      scale: Number(hit.mapping.scale),
    },
    triCount: Number(hit.triCount) || 0,
    byteSize: Number(hit.byteSize) || 0,
  }
}

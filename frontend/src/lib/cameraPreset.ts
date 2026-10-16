/**
 * cameraPreset.ts — GK-08 cameraPresets 解析/查找（纯函数，不依赖 THREE）
 *
 * 数据契约（后端 Scene Schema 物化器 GK-01/03，见 refactor-stories.md GK-08）：
 *   data.cameraPresets[] = {
 *     id: "preset_bldg_1_overview" | "preset_floor_1_3",
 *     name, mode, transitionMs,
 *     pose: { position: [x,y,z], lookAt: [x,y,z], fov }
 *   }
 * 楼栋原始 id 约定：'1'..'10'（= sceneGraph building.semantic.deviceId /
 * InteractionController building 命中 userData.id），不是 'bldg_1'、也不是 code 'B1'。
 *
 * 回退链（sceneSchema 为 null 时的旧行为）：
 *   1. sceneSchema.cameraPresets（新 schema 结构）
 *   2. sceneConfig.camera_presets（旧字段，{ id/key, position:{x,y,z}, target:{x,y,z} }）
 *   3. 默认视角 DEFAULT_CAMERA_POSE（与 SceneRenderer init / loadModel 落点一致）
 */
import type {
  SceneConfig,
  SceneSchemaCameraPreset,
  SceneSchemaDocument,
} from '@/types/api'

export interface CameraPose {
  position: [number, number, number]
  lookAt: [number, number, number]
  fov: number
}

export interface CameraPreset {
  id: string
  name?: string
  mode?: string
  pose: CameraPose
  transitionMs: number
}

// 无 schema / 无匹配 preset 时的默认视角（SceneRenderer init / loadModel 落点一致）
export const DEFAULT_CAMERA_POSE: CameraPose = {
  position: [74, 56, 102],
  lookAt: [30, 20, 0],
  fov: 45,
}

// ---------------- id 约定 ----------------

export function presetIdForBuilding(buildingId: string): string {
  return `preset_bldg_${buildingId}_overview`
}
export function presetIdForFloor(buildingId: string, floor: number): string {
  return `preset_floor_${buildingId}_${floor}`
}

// ---------------- 归一化 ----------------

function numArrToTuple(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null
  const x = Number(v[0])
  const y = Number(v[1])
  const z = Number(v[2])
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return [x, y, z]
}
function vec3ToTuple(v: unknown): [number, number, number] | null {
  if (!v || typeof v !== 'object') return null
  if (Array.isArray(v)) return numArrToTuple(v)
  const o = v as { x?: unknown; y?: unknown; z?: unknown }
  return numArrToTuple([o.x, o.y, o.z])
}

export function normalizeSchemaPreset(p: SceneSchemaCameraPreset): CameraPreset | null {
  if (!p || typeof p !== 'object' || !p.id) return null
  const position = numArrToTuple(p.pose?.position)
  const lookAt = numArrToTuple(p.pose?.lookAt)
  if (!position || !lookAt) return null
  const fov = typeof p.pose?.fov === 'number' && Number.isFinite(p.pose.fov) ? p.pose.fov : DEFAULT_CAMERA_POSE.fov
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    pose: { position, lookAt, fov },
    transitionMs: typeof p.transitionMs === 'number' && Number.isFinite(p.transitionMs) ? p.transitionMs : 800,
  }
}

// 旧 sceneConfig.camera_presets 归一化（容忍 id/key、lookAt/target 两种旧命名）
export function normalizeLegacyPreset(p: Record<string, unknown>): CameraPreset | null {
  if (!p || typeof p !== 'object') return null
  const id = typeof p.id === 'string' ? p.id : typeof p.key === 'string' ? p.key : ''
  if (!id) return null
  const position = vec3ToTuple(p.position)
  if (!position) return null
  const lookAt = vec3ToTuple(p.lookAt) ?? vec3ToTuple(p.target) ?? position
  const fov = typeof p.fov === 'number' && Number.isFinite(p.fov) ? p.fov : DEFAULT_CAMERA_POSE.fov
  return {
    id,
    name: typeof p.name === 'string' ? p.name : undefined,
    mode: typeof p.mode === 'string' ? p.mode : undefined,
    pose: { position, lookAt, fov },
    transitionMs: typeof p.transitionMs === 'number' && Number.isFinite(p.transitionMs) ? p.transitionMs : 800,
  }
}

// ---------------- 目录 ----------------

/**
 * 组装可用 preset 目录：schema.cameraPresets 优先，sceneConfig.camera_presets 兜底（按 id 去重）。
 * schema 存在但 cameraPresets 为空 → 自动退化到旧字段；二者皆空 → 返回空目录（由调用方回退默认视角）。
 */
export function cameraPresetCatalog(
  schema: SceneSchemaDocument | null,
  cfg: SceneConfig | null,
): CameraPreset[] {
  const out: CameraPreset[] = []
  const seen = new Set<string>()
  const push = (p: CameraPreset | null) => {
    if (p && !seen.has(p.id)) {
      seen.add(p.id)
      out.push(p)
    }
  }
  ;(schema?.cameraPresets ?? []).forEach((p) => push(normalizeSchemaPreset(p)))
  const legacy = Array.isArray(cfg?.camera_presets)
    ? (cfg?.camera_presets as unknown as Record<string, unknown>[])
    : []
  legacy.forEach((p) => push(normalizeLegacyPreset(p)))
  return out
}

// ---------------- 查找 ----------------

export function findPresetById(catalog: CameraPreset[], presetId: string): CameraPreset | null {
  if (!presetId) return null
  return catalog.find((p) => p.id === presetId) ?? null
}
export function findBuildingPreset(catalog: CameraPreset[], buildingId: string): CameraPreset | null {
  return findPresetById(catalog, presetIdForBuilding(buildingId))
}
export function findFloorPreset(
  catalog: CameraPreset[],
  buildingId: string,
  floor: number,
): CameraPreset | null {
  return findPresetById(catalog, presetIdForFloor(buildingId, floor))
}

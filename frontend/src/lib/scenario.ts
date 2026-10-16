// ============================================================
// GK-07：Scene Schema scenarios 段解析（游戏引擎式场景管理）
//
// 数据源：GET /api/v1/scene/schema → data.scenarios（8 项：1×overview + 7×sys_<code>_focus）。
// 实测物化形状（backend/src/scene/schema.service.ts buildScenarios）：
//   { id: 'overview' | 'sys_<code>_focus', name, tracks: [{ atSec: 0, action: 'camera.apply', presetId }] }
//
// 职责：把宽松的 scenario 原始条目解析成强类型 ScenarioRef（scenario → 子系统集合 + 相机预设），
// 供 scene store 的 scenarios getter / selectScenario 消费。schema 缺失或条目非法时返回空/跳过，
// 调用方据此回退旧硬编码路径（与 GK-07 改造前行为一致）。
// ============================================================

import type { SceneSchemaScenario, SceneSchemaScenarioTrack } from '@/types/api'

/** scenario 对应的子系统 key：'overview' 或 7 个 SubsystemCode 之一 */
export type ScenarioSubsystem = string

export interface ScenarioRef {
  id: string
  name: string
  /** 由 id 语义推导：'overview' | sys_<code>_focus 捕获的 <code>；无法推导时为 null（该 scenario 不接 tab） */
  subsystem: ScenarioSubsystem | null
  /** tracks 中 action='camera.apply' 的 presetId 序列（保序去重），空数组表示该场景无相机轨道 */
  presetIds: string[]
  /** 原始轨道（供后续扩展演出动作，本阶段只消费 camera.apply） */
  tracks: SceneSchemaScenarioTrack[]
}

// sys_<code>_focus 命名约定（与 backend buildScenarios 对齐）
const SYS_FOCUS_RE = /^sys_([a-z][a-z0-9_]*)_focus$/

/** 解析单个 scenario 条目；非法条目返回 null（调用方跳过） */
export function parseScenario(raw: unknown): ScenarioRef | null {
  if (!raw || typeof raw !== 'object') return null
  const sc = raw as SceneSchemaScenario
  if (typeof sc.id !== 'string' || !sc.id) return null

  let subsystem: ScenarioSubsystem | null = null
  if (sc.id === 'overview') {
    subsystem = 'overview'
  } else {
    const m = SYS_FOCUS_RE.exec(sc.id)
    if (m) subsystem = m[1]
  }

  const tracks: SceneSchemaScenarioTrack[] = Array.isArray(sc.tracks) ? sc.tracks : []
  const presetIds: string[] = []
  for (const t of tracks) {
    if (
      t &&
      typeof t === 'object' &&
      t.action === 'camera.apply' &&
      typeof t.presetId === 'string' &&
      t.presetId &&
      !presetIds.includes(t.presetId)
    ) {
      presetIds.push(t.presetId)
    }
  }

  return {
    id: sc.id,
    name: typeof sc.name === 'string' && sc.name ? sc.name : sc.id,
    subsystem,
    presetIds,
    tracks,
  }
}

/** 解析 scenarios 段全集；非数组/空数组 → []（store 据此回退硬编码路径） */
export function buildScenarioRefs(list: unknown): ScenarioRef[] {
  if (!Array.isArray(list)) return []
  const out: ScenarioRef[] = []
  for (const raw of list) {
    const ref = parseScenario(raw)
    if (ref) out.push(ref)
  }
  return out
}

/**
 * scenario.subsystem → hudLayout widgets 过滤（「显示哪些面板」的派生口径）：
 * 返回 subsystem 标签与该场景子系统一致的 widget id 序列（如 right-hvac→hvac）。
 * 纯派生只读 helper，本阶段不改变 17 框可见性（视觉零回归底线）。
 */
export function widgetIdsForSubsystem(
  widgets: Array<{ id?: string; subsystem?: string }>,
  subsystem: ScenarioSubsystem | null,
): string[] {
  if (!subsystem || !Array.isArray(widgets)) return []
  return widgets
    .filter((w) => w && w.subsystem === subsystem && typeof w.id === 'string')
    .map((w) => w.id as string)
}

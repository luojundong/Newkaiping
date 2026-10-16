<script setup lang="ts">
// GK-24 · 综合概述（overview）七大系统数据总览
// 在 overview 场景下，把 7 个子系统各自的关键指标以一块卡片呈现（概览级，非全量细节）。
// 数据来源：各子系统真实状态接口（/regulation/overview、/lifecycle/equipment、/{hvac|lighting|power|hotwater|elevator}/status），
// 经 fetchSubsystemStatus 统一封装。后端有接口即用真实数据；取不到的指标明确标「待接入」，绝不编造。
import { onMounted, ref, computed } from 'vue'
import {
  Gauge,
  ClipboardList,
  Fan,
  Lightbulb,
  Zap,
  Droplet,
  MoveVertical,
  X,
  type LucideIcon,
} from 'lucide-vue-next'
import { fetchSubsystemStatus } from '@/api'
import { useSceneStore } from '@/stores/scene'
import { SUBSYSTEMS } from '@/types/scene'
import type { SubsystemCode } from '@/types/api'
import StatusDot from '@/components/common/StatusDot.vue'
import {
  SUBSYSTEM_METRICS,
  SUBSYSTEM_ORDER,
  getPath,
  toNum,
  deriveStatus,
  fmtMetric,
} from '@/lib/subsystem-metrics'
import {
  SUBSYSTEM_COLLECTION,
  classifyDataSource,
  KIND_SHORT,
  KIND_FULL,
} from '@/lib/dataSource'

const scene = useSceneStore()

const SYS_ICON: Record<string, LucideIcon> = {
  regulation: Gauge,
  lifecycle: ClipboardList,
  hvac: Fan,
  lighting: Lightbulb,
  power: Zap,
  hotwater: Droplet,
  elevator: MoveVertical,
}

const state = ref<Record<string, 'loading' | 'ok' | 'error'>>({})
const dataMap = ref<Record<string, Record<string, unknown>>>({})

// 默认隐藏综合概述面板，左侧竖按钮触发弹出/收起
const expanded = ref(false)
function toggleExpanded() {
  expanded.value = !expanded.value
}

function metaOf(code: string) {
  const m = SUBSYSTEMS.find((s) => s.code === code)
  // 走 scene.subsystemName：优先后台「子系统菜单」自定义名，否则回退 SUBSYSTEMS 默认全名（S1–S7），
  // 与顶部页签 / 17 框标题口径一致（修复：概述面板曾直接用 SUBSYSTEMS.name，导致自定义名不生效）。
  return {
    name: scene.subsystemName(code) || m?.name || code,
    nameEn: m?.nameEn || code,
    colorVar: m?.colorVar || '--kp-accent',
    num: m?.num || '',
  }
}

const cards = computed(() =>
  SUBSYSTEM_ORDER.map((code) => {
    const raw = dataMap.value[code] || null
    const specs = SUBSYSTEM_METRICS[code] || []
    const rows = specs.map((sp) => {
      const v = raw ? toNum(getPath(raw, sp.path)) : null
      return { ...sp, value: v, missing: v === null }
    })
    const sourceKind = state.value[code] === 'error'
      ? 'pending'
      : classifyDataSource(SUBSYSTEM_COLLECTION[code])
    return {
      code,
      icon: SYS_ICON[code],
      meta: metaOf(code),
      rows,
      status: raw ? deriveStatus(code, raw) : 'normal',
      loading: state.value[code] === 'loading',
      error: state.value[code] === 'error',
      sourceKind,
      sourceShort: KIND_SHORT[sourceKind],
      sourceFull: KIND_FULL[sourceKind],
    }
  }),
)

// 点击卡片 → 进入该子系统聚焦场景（剧本机制，零持久化）
function focusSubsystem(code: string) {
  const sc = scene.scenarios.find((s) => s.subsystem === code)
  if (sc) scene.selectScenario(sc.id)
}

async function loadAll() {
  await Promise.all(
    SUBSYSTEM_ORDER.map(async (code) => {
      state.value[code] = 'loading'
      try {
        const d = await fetchSubsystemStatus(code as SubsystemCode)
        dataMap.value[code] = d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
        state.value[code] = 'ok'
      } catch {
        dataMap.value[code] = {}
        state.value[code] = 'error'
      }
    }),
  )
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  loadAll()
  // 概览态轻量刷新（与大屏面板轮询解耦，避免互相干扰）
  timer = setInterval(loadAll, 30000)
})
</script>

<template>
  <div class="ov-root">
    <button
      class="ov-grid__trigger"
      type="button"
      aria-label="切换综合概述七大系统面板"
      @click="toggleExpanded"
    >
      <span class="ov-grid__trigger-bar" />
      <span class="ov-grid__trigger-text">综合概述 · 七大系统</span>
    </button>
    <div class="ov-grid-layer">
      <div
        class="ov-grid"
        :class="{ 'ov-grid--visible': expanded, 'ov-grid--hidden': !expanded }"
      >
        <div class="ov-grid__head">
          <span class="ov-grid__bar" />
          <span class="ov-grid__title">综合概述 · 七大系统</span>
          <span class="ov-grid__sub">Integrated Overview · 7 Subsystems</span>
          <button
            class="ov-grid__close"
            type="button"
            aria-label="隐藏"
            @click="toggleExpanded"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="ov-grid__cards">
        <button
          v-for="c in cards"
          :key="c.code"
          class="ov-card"
          :data-overview-sys="c.code"
          :data-data-block="c.code"
          :style="{ '--sys-color': `var(${c.meta.colorVar})` }"
          @click="focusSubsystem(c.code)"
        >
          <span
            class="ov-card__src"
            :class="`ov-card__src--${c.sourceKind}`"
            :data-source-badge="c.sourceKind"
            :title="c.sourceFull"
          >{{ c.sourceShort }}</span>
          <div class="ov-card__head">
            <span class="ov-card__icon"><component :is="c.icon" :size="18" /></span>
            <span class="ov-card__name">
              <span v-if="c.meta.num" class="ov-card__num">{{ c.meta.num }}</span>{{ c.meta.name }}
            </span>
            <StatusDot :status="c.status" />
          </div>
          <div class="ov-card__body">
            <template v-if="c.loading">
              <div class="ov-card__row ov-card__row--skeleton" v-for="n in 4" :key="n" />
            </template>
            <template v-else-if="c.error">
              <div class="ov-card__row ov-card__row--err">接口待接入</div>
            </template>
            <template v-else>
              <div
                v-for="r in c.rows"
                :key="r.label"
                class="ov-card__row"
                :class="{ 'ov-card__row--miss': r.missing }"
              >
                <span class="ov-card__label">{{ r.label }}</span>
                <span class="ov-card__value mono">{{ fmtMetric(r.value, r.unit) }}</span>
              </div>
            </template>
          </div>
        </button>
      </div>
    </div>
  </div>
</div>
</template>

<style scoped>
.ov-root {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.ov-grid-layer {
  position: absolute;
  left: 50%;
  top: calc(var(--kp-header-h) + 18px);
  transform: translateX(-50%);
  width: min(1180px, 92vw);
  z-index: 3;
  pointer-events: none; /* 仅卡片可交互，中间 3D 仍可拖拽 */
  display: flex;
  justify-content: center;
}
.ov-grid {
  width: 100%;
  padding: 12px 14px 14px;
  border-radius: var(--kp-radius-lg);
  background: linear-gradient(180deg, rgba(4, 14, 28, 0.82), rgba(3, 10, 20, 0.7));
  border: 1px solid var(--kp-border-strong);
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.45), inset 0 0 30px rgba(var(--kp-accent-rgb), 0.05);
  backdrop-filter: blur(6px);
  transition: opacity var(--kp-motion-fast) var(--kp-ease-standard),
    visibility var(--kp-motion-fast) var(--kp-ease-standard),
    transform var(--kp-motion-fast) var(--kp-ease-standard);
}
.ov-grid--visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.ov-grid--hidden {
  opacity: 0;
  visibility: hidden;
  transform: translateY(-16px);
}
.ov-grid__trigger {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 4;
  pointer-events: auto;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 14px 8px;
  border: 1px solid var(--kp-border-strong);
  border-left: none;
  border-radius: 0 var(--kp-radius-md) var(--kp-radius-md) 0;
  background: linear-gradient(180deg, rgba(var(--kp-bg-rgb), 0.92), rgba(var(--kp-bg-rgb), 0.78));
  color: var(--kp-fg);
  font-size: var(--kp-text-sm);
  font-weight: 600;
  letter-spacing: 2px;
  line-height: 1.4;
  cursor: pointer;
  box-shadow: var(--kp-elev-raised), 0 0 16px rgba(var(--kp-accent-rgb), 0.04);
  backdrop-filter: blur(6px);
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
.ov-grid__trigger:hover {
  background: linear-gradient(180deg, rgba(var(--kp-bg-rgb), 1), rgba(var(--kp-bg-rgb), 0.9));
  box-shadow: var(--kp-elev-raised), 0 0 20px var(--kp-glow);
}
.ov-grid__trigger-bar {
  width: 3px;
  height: 20px;
  border-radius: 2px;
  background: var(--kp-accent);
  box-shadow: 0 0 8px var(--kp-glow);
  flex-shrink: 0;
}
.ov-grid__trigger-text {
  white-space: nowrap;
}
.ov-grid__close {
  margin-left: auto;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: transparent;
  color: var(--kp-fg-muted);
  cursor: pointer;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.ov-grid__close:hover {
  color: var(--kp-fg);
  border-color: var(--kp-accent);
  background: rgba(var(--kp-accent-rgb), 0.08);
}
.ov-grid__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-left: 2px;
}
.ov-grid__bar {
  width: 4px;
  height: 18px;
  border-radius: 2px;
  background: var(--kp-accent);
  box-shadow: 0 0 8px var(--kp-glow);
}
.ov-grid__title {
  font-size: var(--kp-text-lg);
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--kp-fg);
  text-shadow: 0 0 10px var(--kp-glow);
}
.ov-grid__sub {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  letter-spacing: 0.5px;
}
.ov-grid__cards {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
}
.ov-card {
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px 10px 12px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  background: linear-gradient(180deg, rgba(11, 24, 39, 0.7), rgba(4, 16, 31, 0.55));
  cursor: pointer;
  text-align: left;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
/* GK-24 数据来源角标：小号、不刺眼、一眼可辨；模拟=琥珀，待接入=灰，真实=青 */
.ov-card__src {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.5;
  letter-spacing: 0.5px;
  border-radius: 999px;
  border: 1px solid currentColor;
  opacity: 0.85;
  pointer-events: none;
  user-select: none;
}
.ov-card__src--mock { color: #e0a23a; background: rgba(224, 162, 58, 0.1); }
.ov-card__src--pending { color: #8aa0b6; background: rgba(138, 160, 182, 0.1); }
.ov-card__src--real { color: #2ee6a6; background: rgba(46, 230, 166, 0.1); }
.ov-card:hover {
  border-color: var(--sys-color);
  box-shadow: 0 0 16px color-mix(in srgb, var(--sys-color) 35%, transparent);
  transform: translateY(-2px);
}
.ov-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ov-card__icon {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: var(--kp-radius-sm);
  background: color-mix(in srgb, var(--sys-color) 14%, transparent);
  color: var(--sys-color);
  flex-shrink: 0;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--sys-color) 60%, transparent));
}
.ov-card__name {
  flex: 1;
  min-width: 0;
  font-size: var(--kp-text-sm);
  font-weight: 540;
  color: var(--kp-fg);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* 参考页 S1–S7 编号前缀：强调色 + 等宽数字，与「S1 · 名称」视觉一致 */
.ov-card__num {
  margin-right: 6px;
  padding-right: 6px;
  border-right: 1px solid color-mix(in srgb, var(--sys-color) 40%, transparent);
  color: var(--sys-color);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  text-shadow: 0 0 6px color-mix(in srgb, var(--sys-color) 40%, transparent);
}
.ov-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ov-card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
}
.ov-card__label {
  font-size: 11px;
  color: var(--kp-fg-muted);
  white-space: nowrap;
}
.ov-card__value {
  font-size: var(--kp-text-sm);
  color: var(--sys-color);
  text-shadow: 0 0 6px color-mix(in srgb, var(--sys-color) 40%, transparent);
  white-space: nowrap;
}
.ov-card__row--miss .ov-card__value {
  color: var(--kp-fg-subtle);
  text-shadow: none;
  font-style: italic;
  font-size: 11px;
}
.ov-card__row--err {
  color: var(--kp-warn);
  font-size: 11px;
}
.ov-card__row--skeleton {
  height: 12px;
  border: none;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  background-size: 200% 100%;
  animation: ov-shimmer 1.2s infinite;
}
@keyframes ov-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>

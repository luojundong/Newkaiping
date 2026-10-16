<script setup lang="ts">
// GK-24 · 子系统聚焦态底部框内容卡
// 当某个「无专属右侧框」的子系统（lighting / hotwater / lifecycle）被聚焦时，
// 其绑定的底部框（bottom-category-trend / bottom-traffic-trend / bottom-dept-alarm）
// 用本组件展示该子系统真实状态数据，做到「聚焦时留下的框确实取到了该子系统的真实数据」。
// 数据来源：/{code}/status 真实接口；取不到的指标标「待接入」，绝不编造。
import { ref, computed, onMounted, watch } from 'vue'
import {
  Gauge,
  ClipboardList,
  Fan,
  Lightbulb,
  Zap,
  Droplet,
  MoveVertical,
  type LucideIcon,
} from 'lucide-vue-next'
import { fetchSubsystemStatus } from '@/api'
import { SUBSYSTEMS } from '@/types/scene'
import type { SubsystemCode } from '@/types/api'
import StatusDot from '@/components/common/StatusDot.vue'
import { SUBSYSTEM_METRICS, getPath, toNum, deriveStatus, fmtMetric } from '@/lib/subsystem-metrics'
import { SUBSYSTEM_COLLECTION, classifyDataSource, KIND_SHORT, KIND_FULL } from '@/lib/dataSource'

const props = defineProps<{ code: string }>()

const SYS_ICON: Record<string, LucideIcon> = {
  regulation: Gauge,
  lifecycle: ClipboardList,
  hvac: Fan,
  lighting: Lightbulb,
  power: Zap,
  hotwater: Droplet,
  elevator: MoveVertical,
}

const loading = ref(true)
const error = ref(false)
const raw = ref<Record<string, unknown> | null>(null)

const meta = computed(() => {
  const m = SUBSYSTEMS.find((s) => s.code === props.code)
  return { name: m?.name || props.code, nameEn: m?.nameEn || props.code, colorVar: m?.colorVar || '--kp-accent' }
})
const specs = computed(() => SUBSYSTEM_METRICS[props.code] || [])
const rows = computed(() =>
  specs.value.map((sp) => {
    const v = raw.value ? toNum(getPath(raw.value, sp.path)) : null
    return { ...sp, value: v, missing: v === null }
  }),
)
const status = computed(() => (raw.value ? deriveStatus(props.code, raw.value) : 'normal'))

// GK-24 数据来源：接口报错（无接口）→ 待接入；否则按集合分类（当前部署为 模拟）
const sourceKind = computed<'real' | 'mock' | 'pending'>(() =>
  error.value ? 'pending' : classifyDataSource(SUBSYSTEM_COLLECTION[props.code]),
)
const sourceShort = computed(() => KIND_SHORT[sourceKind.value])
const sourceFull = computed(() => KIND_FULL[sourceKind.value])

async function load() {
  loading.value = true
  error.value = false
  try {
    const d = await fetchSubsystemStatus(props.code as SubsystemCode)
    raw.value = d && typeof d === 'object' ? (d as Record<string, unknown>) : {}
  } catch {
    error.value = true
    raw.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.code, load)
</script>

<template>
  <div class="focus-card" :data-data-block="`focus-${code}`" :style="{ '--sys-color': `var(${meta.colorVar})` }">
    <span
      class="focus-card__src"
      :class="`focus-card__src--${sourceKind}`"
      :data-source-badge="sourceKind"
      :title="sourceFull"
    >{{ sourceShort }}</span>
    <div class="focus-card__head">
      <span class="focus-card__icon"><component :is="SYS_ICON[code]" :size="15" /></span>
      <span class="focus-card__name">{{ meta.name }}<i>{{ meta.nameEn }}</i></span>
      <StatusDot :status="status" />
    </div>
    <div class="focus-card__body">
      <template v-if="loading">
        <div class="focus-card__row focus-card__row--sk" v-for="n in 4" :key="n" />
      </template>
      <template v-else-if="error">
        <div class="focus-card__row focus-card__row--err">该子系统数据接口待接入</div>
      </template>
      <template v-else>
        <div
          v-for="r in rows"
          :key="r.label"
          class="focus-card__row"
          :class="{ 'focus-card__row--miss': r.missing }"
        >
          <span class="focus-card__label">{{ r.label }}</span>
          <span class="focus-card__value mono">{{ fmtMetric(r.value, r.unit) }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.focus-card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 5px;
}
/* GK-24 数据来源角标：小号、不刺眼、一眼可辨；模拟=琥珀，待接入=灰，真实=青 */
.focus-card__src {
  position: absolute;
  top: 0;
  right: 0;
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
.focus-card__src--mock { color: #e0a23a; background: rgba(224, 162, 58, 0.1); }
.focus-card__src--pending { color: #8aa0b6; background: rgba(138, 160, 182, 0.1); }
.focus-card__src--real { color: #2ee6a6; background: rgba(46, 230, 166, 0.1); }
.focus-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.focus-card__icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: var(--kp-radius-sm);
  background: color-mix(in srgb, var(--sys-color) 16%, transparent);
  color: var(--sys-color);
  flex-shrink: 0;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--sys-color) 60%, transparent));
}
.focus-card__name {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: var(--kp-text-sm);
  font-weight: 540;
  color: var(--kp-fg);
  min-width: 0;
}
.focus-card__name i {
  font-style: normal;
  font-size: 10px;
  color: var(--kp-fg-muted);
}
.focus-card__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.focus-card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 2px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.07);
}
.focus-card__label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  white-space: nowrap;
}
.focus-card__value {
  font-size: var(--kp-text-sm);
  color: var(--sys-color);
  text-shadow: 0 0 6px color-mix(in srgb, var(--sys-color) 40%, transparent);
  white-space: nowrap;
}
.focus-card__row--miss .focus-card__value {
  color: var(--kp-fg-subtle);
  text-shadow: none;
  font-style: italic;
  font-size: 11px;
}
.focus-card__row--err {
  color: var(--kp-warn);
  font-size: var(--kp-text-xs);
}
.focus-card__row--sk {
  height: 12px;
  border: none;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  background-size: 200% 100%;
  animation: fc-shimmer 1.2s infinite;
}
@keyframes fc-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>

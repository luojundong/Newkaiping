<script setup lang="ts">
// GK-27 · 大屏动态面板内容体（无皮肤/无来源角标，皮肤与「模拟」角标由外层 PanelCard 提供）
// 给定绑定子系统 code，拉取该子系统真实状态并展示关键指标行 + 健康度点。
// 数据来源：/{code}/status 真实接口；取不到标「待接入」，绝不编造。
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
import {
  SUBSYSTEM_METRICS,
  getPath,
  toNum,
  deriveStatus,
  fmtMetric,
} from '@/lib/subsystem-metrics'
import { SUBSYSTEM_COLLECTION, classifyDataSource, KIND_SHORT, KIND_FULL } from '@/lib/dataSource'

const props = defineProps<{ code?: string }>()

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
  return {
    name: m?.name || props.code || '',
    nameEn: m?.nameEn || props.code || '',
    colorVar: m?.colorVar || '--kp-accent',
  }
})
const specs = computed(() => (props.code ? SUBSYSTEM_METRICS[props.code] || [] : []))
const rows = computed(() =>
  specs.value.map((sp) => {
    const v = raw.value ? toNum(getPath(raw.value, sp.path)) : null
    return { ...sp, value: v, missing: v === null }
  }),
)
const status = computed(() => (raw.value ? deriveStatus(props.code || '', raw.value) : 'normal'))

async function load() {
  if (!props.code) {
    loading.value = false
    raw.value = null
    return
  }
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
  <div v-if="code" class="swb" :style="{ '--sys-color': `var(${meta.colorVar})` }">
    <div class="swb__head">
      <span class="swb__icon"><component :is="SYS_ICON[code]" :size="15" /></span>
      <span class="swb__name">{{ meta.name }}<i>{{ meta.nameEn }}</i></span>
      <StatusDot :status="status" />
    </div>
    <div class="swb__body">
      <template v-if="loading">
        <div class="swb__row swb__row--sk" v-for="n in 4" :key="n" />
      </template>
      <template v-else-if="error">
        <div class="swb__row swb__row--err">该子系统数据接口待接入</div>
      </template>
      <template v-else>
        <div
          v-for="r in rows"
          :key="r.label"
          class="swb__row"
          :class="{ 'swb__row--miss': r.missing }"
        >
          <span class="swb__label">{{ r.label }}</span>
          <span class="swb__value mono">{{ fmtMetric(r.value, r.unit) }}</span>
        </div>
      </template>
    </div>
  </div>
  <div v-else class="swb swb--empty">未绑定子系统</div>
</template>

<style scoped>
.swb {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 5px;
}
.swb--empty {
  align-items: center;
  justify-content: center;
  color: var(--kp-fg-subtle);
  font-size: var(--kp-text-xs);
}
.swb__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.swb__icon {
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
.swb__name {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: var(--kp-text-sm);
  font-weight: 540;
  color: var(--kp-fg);
  min-width: 0;
}
.swb__name i {
  font-style: normal;
  font-size: 10px;
  color: var(--kp-fg-muted);
}
.swb__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  overflow: auto;
}
.swb__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 2px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.07);
}
.swb__label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  white-space: nowrap;
}
.swb__value {
  font-size: var(--kp-text-sm);
  color: var(--sys-color);
  text-shadow: 0 0 6px color-mix(in srgb, var(--sys-color) 40%, transparent);
  white-space: nowrap;
}
.swb__row--miss .swb__value {
  color: var(--kp-fg-subtle);
  text-shadow: none;
  font-style: italic;
  font-size: 11px;
}
.swb__row--err {
  color: var(--kp-warn);
  font-size: var(--kp-text-xs);
}
.swb__row--sk {
  height: 12px;
  border: none;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  background-size: 200% 100%;
  animation: swb-shimmer 1.2s infinite;
}
@keyframes swb-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>

<script setup lang="ts">
// GK-10 · 设备弹窗 schema widget.type 模板渲染板
// 按 buildDeviceTemplatePlan 产出的 blocks 逐块渲染：
//   device_board → 实时指标网格（配置取 schema pointTable/bindings，数值走现有实时 API）
//   status_grid  → 状态灯 / 在线状态（含 schema 点位 STATUS 绑定信息）
//   stat_card    → 关键数值卡（首个实时指标）
//   其余 kind    → TODO 兜底块（GK-10+ 扩展）
// 本组件纯展示（无控制下发），控制区仍由 DeviceDetailDrawer 承载。
import { computed } from 'vue'
import { Activity, CircleDot, Gauge, Layers } from 'lucide-vue-next'
import { useI18nStore } from '@/stores/i18n'
import type { Metric } from '@/types/api'
import type { SchemaDeviceTemplatePlan, SchemaWidgetBlock } from '@/lib/schema-device-template'

const props = defineProps<{
  plan: SchemaDeviceTemplatePlan
  metrics: Metric[]
  /** REST 设备状态（running/stopped/fault/offline/maintenance） */
  status: string
}>()

const { t } = useI18nStore()

const firstMetric = computed(() => props.metrics[0] || null)
const pointConfig = computed(() => props.plan.points[0] || null)
// 在线判定：REST status 非 offline 即在线（schema STATUS 点为 bool/read，作绑定展示）
const online = computed(() => props.status !== 'offline')

const BLOCK_LABEL: Record<string, { zh: string; en: string }> = {
  device_board: { zh: '设备主面板', en: 'Device Board' },
  status_grid: { zh: '状态格', en: 'Status Grid' },
  stat_card: { zh: '关键数值', en: 'Key Metric' },
}
const blockTitle = (b: SchemaWidgetBlock) => {
  const l = BLOCK_LABEL[b.type]
  return l ? t(l.zh, l.en) : b.type
}
</script>

<template>
  <div
    class="dwb"
    data-device-drawer-template="schema"
    :data-device-type="plan.semantic.deviceType"
    :data-marker-type="plan.semantic.meta.marker_type || ''"
  >
    <section
      v-for="b in plan.blocks"
      :key="b.type"
      class="dwb-block"
      :data-widget-type="b.type"
      :data-panel-kind="b.kind"
    >
      <!-- device_board：实时指标网格 -->
      <template v-if="b.kind === 'device_board' && b.implemented">
        <h4 class="dwb-block__title"><Gauge :size="15" /> {{ blockTitle(b) }}</h4>
        <div v-if="!metrics.length" class="kp-empty kp-empty--sm">{{ t('暂无实时指标', 'No real-time metrics') }}</div>
        <div v-else class="dwb-metrics">
          <div v-for="m in metrics" :key="m.metric_key" class="dwb-metric">
            <span class="dwb-metric__key">{{ m.metric_key }}</span>
            <span class="dwb-metric__val mono">{{ m.value }}<i>{{ m.unit }}</i></span>
          </div>
        </div>
        <p v-if="pointConfig" class="dwb-config mono">
          {{ t('绑定点位', 'Bound point') }}: {{ pointConfig.pointId }} · {{ pointConfig.dataType }}/{{ pointConfig.access }} · {{ t('绑定', 'bindings') }} ×{{ plan.bindingsCount }}
        </p>
      </template>

      <!-- status_grid：状态灯 / 在线状态 -->
      <template v-else-if="b.kind === 'status_grid' && b.implemented">
        <h4 class="dwb-block__title"><CircleDot :size="15" /> {{ blockTitle(b) }}</h4>
        <div class="dwb-status">
          <div class="dwb-status__cell">
            <span class="dwb-light" :class="online ? 'dwb-light--on' : 'dwb-light--off'" />
            <span>{{ t('在线', 'Online') }} / {{ t('离线', 'Offline') }}</span>
            <b>{{ online ? t('在线', 'Online') : t('离线', 'Offline') }}</b>
          </div>
          <div class="dwb-status__cell">
            <span class="dwb-light" :class="status === 'fault' ? 'dwb-light--fault' : status === 'running' ? 'dwb-light--run' : 'dwb-light--idle'" />
            <span>{{ t('运行状态', 'Run status') }}</span>
            <b>{{ status }}</b>
          </div>
        </div>
      </template>

      <!-- stat_card：关键数值卡 -->
      <template v-else-if="b.kind === 'stat_card' && b.implemented">
        <h4 class="dwb-block__title"><Activity :size="15" /> {{ blockTitle(b) }}</h4>
        <div v-if="firstMetric" class="dwb-stat" :data-stat-key="firstMetric.metric_key">
          <span class="dwb-stat__key">{{ firstMetric.metric_key }}</span>
          <span class="dwb-stat__val mono">{{ firstMetric.value }}<i>{{ firstMetric.unit }}</i></span>
          <span class="dwb-stat__src">{{ firstMetric.quality }} · {{ firstMetric.source }}</span>
        </div>
        <div v-else class="kp-empty kp-empty--sm">{{ t('暂无关键数值', 'No key metric') }}</div>
      </template>

      <!-- TODO(GK-10+)：其余 widget.type 先占位，后续扩展模板 -->
      <template v-else>
        <h4 class="dwb-block__title"><Layers :size="15" /> {{ blockTitle(b) }}</h4>
        <div class="dwb-todo mono">TODO(GK-10+): widget.type={{ b.type }} → kind={{ b.kind }}</div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.dwb {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dwb-block {
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
  padding: 8px 10px;
}
.dwb-block__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: var(--kp-text-md);
  font-weight: 510;
  color: var(--kp-fg);
  letter-spacing: var(--kp-tracking-label);
}
.dwb-block__title svg { color: var(--kp-accent); }

.dwb-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.dwb-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: rgba(var(--kp-accent-rgb), 0.03);
}
.dwb-metric__key { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dwb-metric__val { font-size: var(--kp-text-md); color: var(--kp-fg); }
.dwb-metric__val i { font-style: normal; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin-left: 2px; }

.dwb-config {
  margin: 8px 0 0;
  font-size: 10px;
  color: var(--kp-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dwb-status {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dwb-status__cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.dwb-status__cell b { color: var(--kp-fg); font-size: var(--kp-text-sm); }
.dwb-light {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dwb-light--on { background: var(--kp-ok, #36d399); box-shadow: 0 0 8px var(--kp-ok, #36d399); }
.dwb-light--off { background: var(--kp-fg-muted); opacity: 0.5; }
.dwb-light--run { background: var(--kp-accent); box-shadow: 0 0 8px var(--kp-accent); }
.dwb-light--fault { background: var(--kp-alarm, #ff4d5e); box-shadow: 0 0 8px var(--kp-alarm, #ff4d5e); }
.dwb-light--idle { background: var(--kp-warn, #f5a623); }

.dwb-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: rgba(var(--kp-accent-rgb), 0.05);
}
.dwb-stat__key { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.dwb-stat__val { font-size: var(--kp-text-xl, 20px); font-weight: 620; color: var(--kp-accent); }
.dwb-stat__val i { font-style: normal; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin-left: 2px; }
.dwb-stat__src { margin-left: auto; font-size: 10px; color: var(--kp-fg-muted); }

.dwb-todo {
  font-size: var(--kp-text-xs);
  color: var(--kp-warn, #f5a623);
  padding: 4px 0;
}
</style>

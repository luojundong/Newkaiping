<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert, BellRing, Info } from 'lucide-vue-next'
import type { BigscreenAlarmItem } from '@/stores/bigscreen'
import { useI18nStore } from '@/stores/i18n'

// 实时告警滚动列表（左面板）：聚合告警项（name/key/count/level），纵向无缝滚动。
const props = withDefaults(
  defineProps<{
    items?: BigscreenAlarmItem[]
    loading?: boolean
  }>(),
  { items: () => [], loading: false },
)

const { t } = useI18nStore()

// 复制一份用于无缝循环滚动
const loopItems = computed(() => (props.items.length ? [...props.items, ...props.items] : []))

const duration = computed(() => `${Math.max(14, props.items.length * 2.6)}s`)

function levelTagClass(level: string) {
  return {
    critical: 'level-tag level-tag--critical',
    warning: 'level-tag level-tag--warning',
    info: 'level-tag level-tag--info',
  }[level]
}
function levelLabel(level: string) {
  return (
    { critical: t('严重', 'Critical'), warning: t('预警', 'Warning'), info: t('提示', 'Info') }[level] ??
    level
  )
}
function levelColor(level: string) {
  return {
    critical: 'var(--kp-danger)',
    warning: 'var(--kp-warn)',
    info: 'var(--kp-info)',
  }[level] ?? 'var(--kp-fg-muted)'
}
function levelRowClass(level: string) {
  return {
    critical: 'alarm-row--critical',
    warning: 'alarm-row--warning',
    info: 'alarm-row--info',
  }[level]
}
function levelIcon(level: string) {
  if (level === 'critical') return TriangleAlert
  if (level === 'warning') return BellRing
  return Info
}
</script>

<template>
  <div class="alarm-scroller">
    <div v-if="loading" class="kp-empty">{{ t('告警数据加载中…', 'Loading alarms…') }}</div>
    <div v-else-if="!items.length" class="kp-empty">{{ t('暂无告警数据，运行状态正常', 'No alarms, all systems normal') }}</div>
    <div v-else class="alarm-scroll-view">
      <ul class="alarm-track" :style="{ '--dur': duration }">
        <li
          v-for="(a, i) in loopItems"
          :key="i"
          class="alarm-row"
          :class="levelRowClass(a.level)"
        >
          <component :is="levelIcon(a.level)" :size="16" class="alarm-row__icon" />
          <div class="alarm-row__body">
            <div class="alarm-row__name">{{ t(a.name) }}</div>
            <div class="alarm-row__key mono">{{ a.key }}</div>
          </div>
          <span :class="levelTagClass(a.level)">{{ levelLabel(a.level) }}</span>
          <span class="alarm-row__count mono" :style="{ color: levelColor(a.level) }">{{ a.count }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.alarm-scroller {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.alarm-scroll-view {
  height: 100%;
  overflow: hidden;
  mask-image: linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent);
}
.alarm-track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  animation: alarm-scroll var(--dur) linear infinite;
  will-change: transform;
}
.alarm-scroll-view:hover .alarm-track {
  animation-play-state: paused;
}
@keyframes alarm-scroll {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}

.alarm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--kp-border);
  border-left-width: 3px;
  border-radius: var(--kp-radius-sm);
  background: var(--kp-surface);
}
.alarm-row--critical { border-left-color: var(--kp-danger); }
.alarm-row--warning { border-left-color: var(--kp-warn); }
.alarm-row--info { border-left-color: var(--kp-info); }
.alarm-row__icon { flex-shrink: 0; }
.alarm-row--critical .alarm-row__icon { color: var(--kp-danger); }
.alarm-row--warning .alarm-row__icon { color: var(--kp-warn); }
.alarm-row--info .alarm-row__icon { color: var(--kp-info); }
.alarm-row__body {
  flex: 1;
  min-width: 0;
}
.alarm-row__name {
  font-size: var(--kp-text-sm);
  color: var(--kp-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alarm-row__key {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
}
.alarm-row__count {
  font-size: var(--kp-text-2xl);
  font-weight: 600;
  line-height: 1;
  flex-shrink: 0;
  text-shadow: 0 0 8px currentColor;
}
</style>

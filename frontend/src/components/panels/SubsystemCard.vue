<script setup lang="ts">
import type { Component } from 'vue'
import StatusDot from '@/components/common/StatusDot.vue'

// 子系统 mini 卡片（左面板）：图标 + 名称 + 1-2 个核心 KPI，可点击切换子系统
withDefaults(
  defineProps<{
    name: string
    icon?: Component
    color?: string
    kpis?: { label: string; value: string | number; unit?: string }[]
    status?: 'normal' | 'warning' | 'critical' | 'offline' | 'unknown'
    active?: boolean
  }>(),
  { color: 'var(--kp-accent)', kpis: () => [], status: 'normal', active: false },
)

const emit = defineEmits<{ (e: 'select'): void }>()
</script>

<template>
  <button class="subsystem-card" :class="{ active }" @click="emit('select')">
    <span class="subsystem-card__icon" :style="{ color }">
      <component :is="icon" v-if="icon" :size="20" />
    </span>
    <div class="subsystem-card__body">
      <div class="subsystem-card__head">
        <span class="subsystem-card__name">{{ name }}</span>
        <StatusDot :status="status" />
      </div>
      <div v-if="kpis.length" class="subsystem-card__kpis">
        <span v-for="k in kpis" :key="k.label" class="kp-num subsystem-card__kpi">
          {{ k.value }}<i v-if="k.unit">{{ k.unit }}</i>
          <em>{{ k.label }}</em>
        </span>
      </div>
    </div>
  </button>
</template>

<style scoped>
.subsystem-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--kp-border);
  background: linear-gradient(180deg, rgba(11, 20, 36, 0.7), rgba(4, 16, 31, 0.5));
  border-radius: var(--kp-radius-md);
  cursor: pointer;
  text-align: left;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.subsystem-card:hover {
  border-color: var(--kp-border-strong);
  box-shadow: var(--kp-elev-glow);
}
.subsystem-card.active {
  border-color: var(--kp-accent);
  background: var(--kp-glow-soft);
  box-shadow: var(--kp-elev-glow);
}
.subsystem-card__icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
  border: 1px solid var(--kp-border);
  flex-shrink: 0;
  filter: drop-shadow(0 0 6px currentColor);
}
.subsystem-card__body {
  flex: 1;
  min-width: 0;
}
.subsystem-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}
.subsystem-card__name {
  font-size: var(--kp-text-md);
  font-weight: 510;
  color: var(--kp-fg);
}
.subsystem-card__kpis {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.subsystem-card__kpi {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  font-size: var(--kp-text-md);
  color: var(--kp-fg);
}
.subsystem-card__kpi i {
  font-size: var(--kp-text-xs);
  font-style: normal;
  color: var(--kp-fg-muted);
}
.subsystem-card__kpi em {
  font-style: normal;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  margin-left: 3px;
}
</style>

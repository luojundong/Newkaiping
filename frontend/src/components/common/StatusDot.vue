<script setup lang="ts">
// 状态色点（配合文字/图标，颜色不是唯一信息载体）
withDefaults(
  defineProps<{
    status?: 'normal' | 'warning' | 'critical' | 'offline' | 'unknown'
    pulse?: boolean
  }>(),
  { status: 'normal', pulse: false },
)
</script>

<template>
  <span
    class="status-dot"
    :class="[`status-dot--${status}`, { 'status-dot--pulse': pulse }]"
    aria-hidden="true"
  />
</template>

<style scoped>
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--kp-status-normal);
  box-shadow: 0 0 6px currentColor;
}
.status-dot--normal { background: var(--kp-status-normal); color: var(--kp-status-normal); }
.status-dot--warning { background: var(--kp-status-warning); color: var(--kp-status-warning); }
.status-dot--critical { background: var(--kp-status-critical); color: var(--kp-status-critical); }
.status-dot--offline { background: var(--kp-status-offline); color: var(--kp-status-offline); }
.status-dot--unknown { background: var(--kp-status-unknown); color: var(--kp-status-unknown); }

.status-dot--pulse {
  animation: kp-pulse 1.2s ease-in-out infinite;
}
</style>

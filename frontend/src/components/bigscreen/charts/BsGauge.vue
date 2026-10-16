<script setup lang="ts">
/**
 * 圆环仪表（参考页 gauge(size,frac,c,val) L5391-5400 的 1:1 复刻）
 * 底环 fill rgba(6,20,38,.4) + stroke rgba(30,78,126,.5)；进度环 rotate(-90) + 圆头；中心数值。
 */
import { computed } from 'vue'
import { SERIES } from '@/lib/bigscreen-palette'

const props = withDefaults(
  defineProps<{ size?: number; frac: number; color?: string; val: string | number }>(),
  { size: 84, color: SERIES.cyan },
)

const geo = computed(() => {
  const r = (props.size - 12) / 2
  const cx = props.size / 2
  const cir = 2 * Math.PI * r
  const frac = Math.max(0.03, Math.min(1, props.frac))
  return {
    r,
    cx,
    sw: 9,
    dash: `${(cir * frac).toFixed(2)} ${cir.toFixed(2)}`,
    textY: cx + Math.max(4, props.size * 0.06),
    fontSize: (props.size * 0.19).toFixed(1),
  }
})
</script>

<template>
  <svg :width="props.size" :height="props.size" :viewBox="`0 0 ${props.size} ${props.size}`">
    <circle
      class="bsg-track"
      :cx="geo.cx"
      :cy="geo.cx"
      :r="geo.r"
      :stroke-width="geo.sw"
    />
    <circle
      :cx="geo.cx"
      :cy="geo.cx"
      :r="geo.r"
      fill="none"
      :stroke-width="geo.sw"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke-dasharray="geo.dash"
      :transform="`rotate(-90 ${geo.cx} ${geo.cx})`"
      :style="{ stroke: props.color }"
    />
    <text
      class="bsg-val"
      :x="geo.cx"
      :y="geo.textY"
      :font-size="geo.fontSize"
      font-weight="700"
      text-anchor="middle"
      font-family="inherit"
    >{{ props.val }}</text>
  </svg>
</template>

<style scoped>
/* 底环与中心数值走 CSS（可直接用 var()），避免内联 style 拼接 */
.bsg-track {
  fill: rgba(var(--kp-bg-rgb), 0.4);
  stroke: rgba(var(--kp-edge-rgb), 0.5);
}
.bsg-val {
  fill: var(--kp-fg-strong);
}
</style>

<script setup lang="ts">
/**
 * 环形图（参考页 donut(size,r,sw,segs) L4574-4587 的 1:1 复刻）
 * 底环 rgba(30,78,126,.45) → CHART_TRACK_STRONG；各段用 stroke-dasharray + dashoffset 拼接，rotate(-90)。
 */
import { computed } from 'vue'
import { CHART_TRACK_STRONG } from '@/lib/bigscreen-palette'

export interface DonutSeg {
  v: number
  total: number
  /** token 字符串 */
  c: string
}

const props = withDefaults(
  defineProps<{ size?: number; r?: number; sw?: number; segs: DonutSeg[] }>(),
  { size: 120, r: 50, sw: 13 },
)

const cx = computed(() => props.size / 2)
const circ = computed(() => 2 * Math.PI * props.r)

const arcs = computed(() => {
  let off = 0
  return props.segs.map((g) => {
    const len = (g.v / (g.total || 1)) * circ.value
    const item = {
      dash: `${len.toFixed(2)} ${circ.value.toFixed(2)}`,
      offset: (-off).toFixed(2),
      c: g.c,
    }
    off += len
    return item
  })
})
</script>

<template>
  <svg :width="props.size" :height="props.size" :viewBox="`0 0 ${props.size} ${props.size}`">
    <circle
      :cx="cx"
      :cy="cx"
      :r="props.r"
      fill="none"
      :stroke-width="props.sw"
      :style="{ stroke: CHART_TRACK_STRONG }"
    />
    <circle
      v-for="(a, i) in arcs"
      :key="i"
      :cx="cx"
      :cy="cx"
      :r="props.r"
      fill="none"
      :stroke-width="props.sw"
      stroke-linecap="butt"
      :stroke-dasharray="a.dash"
      :stroke-dashoffset="a.offset"
      :transform="`rotate(-90 ${cx} ${cx})`"
      :style="{ stroke: a.c }"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * 堆叠柱状图（参考页 stackChart(w,h,cats,series) L4544-4572 的 1:1 复刻）
 * padding 30/10/12/20，4 条网格线带左侧刻度值，柱宽 min(26, slot*0.56)，opacity .9。
 */
import { computed } from 'vue'
import { CHART_AXIS, CHART_GRID, CHART_LABEL } from '@/lib/bigscreen-palette'

export interface StackSeries {
  data: number[]
  color: string
}

const props = withDefaults(
  defineProps<{ w?: number; h?: number; cats: string[]; series: StackSeries[] }>(),
  { w: 384, h: 104 },
)

const PL = 30
const PR = 10
const PT = 12
const PB = 20

const iw = computed(() => props.w - PL - PR)
const ih = computed(() => props.h - PT - PB)
const n = computed(() => props.cats.length)

const mx = computed(() => {
  const tot = props.cats.map((_, i) => props.series.reduce((s, se) => s + (se.data[i] ?? 0), 0))
  return (Math.max(...tot) || 1) * 1.12
})

const gridLines = computed(() =>
  [0, 1, 2, 3].map((g) => ({
    y: PT + (ih.value * g) / 3,
    strong: g === 3,
    tick: Math.round((mx.value * (3 - g)) / 3),
  })),
)

const bars = computed(() => {
  const slot = iw.value / Math.max(1, n.value)
  const bw = Math.min(26, slot * 0.56)
  return props.cats.map((cat, i) => {
    const x = PL + slot * i + (slot - bw) / 2
    let acc = 0
    const segs = props.series.map((se) => {
      const hh = ((se.data[i] ?? 0) / mx.value) * ih.value
      const y = PT + ih.value - (acc + hh)
      acc += hh
      return { y: y.toFixed(1), h: Math.max(1, hh).toFixed(1), color: se.color }
    })
    return { x: x.toFixed(1), bw: bw.toFixed(1), segs, cat, labelX: (PL + slot * i + slot / 2).toFixed(1) }
  })
})
</script>

<template>
  <svg :width="props.w" :height="props.h" :viewBox="`0 0 ${props.w} ${props.h}`">
    <template v-for="(g, i) in gridLines" :key="`g${i}`">
      <line
        :x1="PL"
        :y1="g.y.toFixed(1)"
        :x2="PL + iw"
        :y2="g.y.toFixed(1)"
        :style="{ stroke: g.strong ? CHART_AXIS : CHART_GRID }"
      />
      <text
        :x="PL - 6"
        :y="(g.y + 3).toFixed(1)"
        font-size="9"
        text-anchor="end"
        font-family="inherit"
        :style="{ fill: CHART_LABEL }"
      >{{ g.tick }}</text>
    </template>
    <template v-for="(b, i) in bars" :key="`b${i}`">
      <rect
        v-for="(s, j) in b.segs"
        :key="`s${j}`"
        :x="b.x"
        :y="s.y"
        :width="b.bw"
        :height="s.h"
        opacity=".9"
        :style="{ fill: s.color }"
      />
      <text
        :x="b.labelX"
        :y="props.h - 6"
        font-size="10"
        text-anchor="middle"
        font-family="inherit"
        :style="{ fill: CHART_LABEL }"
      >{{ b.cat }}</text>
    </template>
  </svg>
</template>

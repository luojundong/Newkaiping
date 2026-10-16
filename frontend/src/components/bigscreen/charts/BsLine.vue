<script setup lang="ts">
/**
 * 多序列折线图（参考页 lineChart(w,h,series,labels) L4513-4542 的 1:1 复刻）
 * padding 30/10/12/20，4 条横向网格线，末点实心圆 + 舞台底色描边。
 * ★ 颜色全部走内联 style 绑定 token 字符串（SVG 属性不支持 var()）。
 */
import { computed } from 'vue'
import { CHART_AXIS, CHART_DOT_STROKE, CHART_GRID, CHART_LABEL } from '@/lib/bigscreen-palette'

export interface LineSeries {
  data: number[]
  /** token 字符串，如 SERIES.cyan */
  color: string
}

const props = withDefaults(
  defineProps<{ w?: number; h?: number; series: LineSeries[]; labels: string[] }>(),
  { w: 384, h: 104 },
)

const PL = 30
const PR = 10
const PT = 12
const PB = 20

const iw = computed(() => props.w - PL - PR)
const ih = computed(() => props.h - PT - PB)
const n = computed(() => props.series[0]?.data.length ?? 0)

const gridLines = computed(() =>
  [0, 1, 2, 3].map((g) => ({ y: PT + (ih.value * g) / 3, strong: g === 3 })),
)

const paths = computed(() =>
  props.series.map((se) => {
    const mx = Math.max(...se.data) * 1.14 || 1
    const pts = se.data.map((v, i) => [
      PL + (iw.value * i) / Math.max(1, n.value - 1),
      PT + ih.value - (v / mx) * ih.value,
    ])
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    const last = pts[pts.length - 1] ?? [0, 0]
    return { d, color: se.color, lastX: last[0].toFixed(1), lastY: last[1].toFixed(1) }
  }),
)

const ticks = computed(() =>
  props.labels.map((lb, i) => ({ x: PL + (iw.value * i) / Math.max(1, n.value - 1), lb })),
)
</script>

<template>
  <svg :width="props.w" :height="props.h" :viewBox="`0 0 ${props.w} ${props.h}`">
    <line
      v-for="(g, i) in gridLines"
      :key="`g${i}`"
      :x1="PL"
      :y1="g.y.toFixed(1)"
      :x2="PL + iw"
      :y2="g.y.toFixed(1)"
      stroke-width="1"
      :style="{ stroke: g.strong ? CHART_AXIS : CHART_GRID }"
    />
    <template v-for="(p, i) in paths" :key="`s${i}`">
      <path
        :d="p.d"
        fill="none"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :style="{ stroke: p.color }"
      />
      <circle
        :cx="p.lastX"
        :cy="p.lastY"
        r="3"
        stroke-width="1.5"
        :style="{ fill: p.color, stroke: CHART_DOT_STROKE }"
      />
    </template>
    <line
      :x1="PL"
      :y1="PT + ih"
      :x2="PL + iw"
      :y2="PT + ih"
      :style="{ stroke: CHART_AXIS }"
    />
    <text
      v-for="(t, i) in ticks"
      :key="`t${i}`"
      :x="t.x.toFixed(1)"
      :y="props.h - 6"
      font-size="10"
      text-anchor="middle"
      font-family="inherit"
      :style="{ fill: CHART_LABEL }"
    >{{ t.lb }}</text>
  </svg>
</template>

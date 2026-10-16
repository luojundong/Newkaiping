<script setup lang="ts">
/**
 * 波浪面积图（参考页 waveChart(w,h,vals,labels,c,gid) L5352-5389 的 1:1 复刻）
 * Catmull-Rom 平滑 + 渐变面积（.42→.02）+ 回声波浪层（opacity .16）+ 末点圆。
 * gid 唯一化：改用 Vue useId 级别的自增序号，避免多实例 <linearGradient> id 冲突。
 */
import { computed } from 'vue'
import { CHART_AXIS, CHART_DOT_STROKE, CHART_GRID_FAINT, CHART_LABEL, SERIES } from '@/lib/bigscreen-palette'

let seq = 0

const props = withDefaults(
  defineProps<{ w?: number; h?: number; vals: number[]; labels: string[]; color?: string }>(),
  { w: 384, h: 104, color: SERIES.cyan },
)

const gid = `bs-wave-${(seq += 1)}`

const PL = 30
const PR = 10
const PT = 10
const PB = 18

const geo = computed(() => {
  const iw = props.w - PL - PR
  const ih = props.h - PT - PB
  const n = props.vals.length
  const mx = (Math.max(...props.vals) || 1) * 1.15
  const base = PT + ih
  const pts: number[][] = props.vals.map((v, i) => [
    PL + (iw * i) / Math.max(1, n - 1),
    PT + ih - (v / mx) * ih,
  ])

  function smooth(a: number[][]): string {
    if (!a.length) return ''
    let d = `M${a[0][0].toFixed(1)} ${a[0][1].toFixed(1)}`
    for (let k = 0; k < a.length - 1; k += 1) {
      const p0 = a[Math.max(0, k - 1)]
      const p1 = a[k]
      const p2 = a[k + 1]
      const p3 = a[Math.min(a.length - 1, k + 2)]
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    }
    return d
  }

  const top = smooth(pts)
  const echo = smooth(pts.map((p, k) => [p[0], Math.min(base - 2, p[1] + (k % 2 ? 7 : 3))]))
  const last = pts[n - 1] ?? [0, 0]
  return {
    iw,
    ih,
    base,
    top,
    echo,
    area: `${top} L${last[0].toFixed(1)} ${base.toFixed(1)} L${(pts[0]?.[0] ?? 0).toFixed(1)} ${base.toFixed(1)} Z`,
    lastX: last[0].toFixed(1),
    lastY: last[1].toFixed(1),
    grid: [0, 1, 2].map((g) => PT + (ih * g) / 2),
    ticks: props.labels.map((lb, i) => ({
      x: PL + (iw * i) / Math.max(1, n - 1),
      /** 参考页 labels[i].slice(3)：'08-30' → '30' 只留日 */
      lb: lb.slice(3),
    })),
  }
})
</script>

<template>
  <svg :width="props.w" :height="props.h" :viewBox="`0 0 ${props.w} ${props.h}`">
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-opacity=".42" :style="{ stopColor: props.color }" />
        <stop offset="1" stop-opacity=".02" :style="{ stopColor: props.color }" />
      </linearGradient>
    </defs>
    <line
      v-for="(gy, i) in geo.grid"
      :key="`g${i}`"
      :x1="PL"
      :y1="gy.toFixed(1)"
      :x2="PL + geo.iw"
      :y2="gy.toFixed(1)"
      :style="{ stroke: CHART_GRID_FAINT }"
    />
    <path :d="geo.area" :fill="`url(#${gid})`" />
    <path :d="geo.echo" fill="none" stroke-opacity=".16" stroke-width="1.1" :style="{ stroke: props.color }" />
    <path
      :d="geo.top"
      fill="none"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      :style="{ stroke: props.color }"
    />
    <circle
      :cx="geo.lastX"
      :cy="geo.lastY"
      r="3.2"
      stroke-width="1.5"
      :style="{ fill: props.color, stroke: CHART_DOT_STROKE }"
    />
    <line
      :x1="PL"
      :y1="geo.base.toFixed(1)"
      :x2="PL + geo.iw"
      :y2="geo.base.toFixed(1)"
      :style="{ stroke: CHART_AXIS }"
    />
    <text
      v-for="(t, i) in geo.ticks"
      :key="`t${i}`"
      :x="t.x.toFixed(1)"
      :y="props.h - 4"
      font-size="9"
      text-anchor="middle"
      font-family="inherit"
      :style="{ fill: CHART_LABEL }"
    >{{ t.lb }}</text>
  </svg>
</template>

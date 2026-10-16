<script setup lang="ts">
/**
 * 横向条形图（参考页 hbarChart(w,h,items) L4589-4604 的 1:1 复刻）
 * 左侧名称右对齐（x=pl-8），轨道 rgba(30,78,126,.35)，条右侧数值粗体。
 */
import { computed } from 'vue'
import { CHART_LABEL_NAME, CHART_LABEL_STRONG, CHART_TRACK } from '@/lib/bigscreen-palette'

export interface HBarItem {
  nm: string
  val: number
  /** token 字符串 */
  color: string
  unit?: string
  max?: number
}

const props = withDefaults(defineProps<{ w?: number; h?: number; items: HBarItem[] }>(), {
  w: 400,
  h: 120,
})

const PL = 74
const PR = 52
const PT = 8
const PB = 6

const rows = computed(() => {
  const ih = props.h - PT - PB
  const n = Math.max(1, props.items.length)
  const rh = ih / n
  const mx = Math.max(...props.items.map((it) => it.max ?? it.val), 1)
  const trackW = props.w - PL - PR
  return props.items.map((it, i) => {
    const y = PT + rh * i + rh / 2
    const bw = Math.max(2, (it.val / mx) * trackW)
    return {
      nm: it.nm,
      textY: (y + 4).toFixed(1),
      rectY: (y - rh * 0.28).toFixed(1),
      rectH: (rh * 0.56).toFixed(1),
      trackW,
      bw: bw.toFixed(1),
      valX: (PL + bw + 8).toFixed(1),
      valText: `${it.val.toLocaleString('zh-CN')}${it.unit ?? ''}`,
      color: it.color,
    }
  })
})
</script>

<template>
  <svg :width="props.w" :height="props.h" :viewBox="`0 0 ${props.w} ${props.h}`">
    <template v-for="(r, i) in rows" :key="i">
      <text
        :x="PL - 8"
        :y="r.textY"
        font-size="12"
        text-anchor="end"
        font-family="inherit"
        :style="{ fill: CHART_LABEL_NAME }"
      >{{ r.nm }}</text>
      <rect
        :x="PL"
        :y="r.rectY"
        :width="r.trackW"
        :height="r.rectH"
        rx="3"
        :style="{ fill: CHART_TRACK }"
      />
      <rect
        :x="PL"
        :y="r.rectY"
        :width="r.bw"
        :height="r.rectH"
        rx="3"
        :style="{ fill: r.color }"
      />
      <text
        :x="r.valX"
        :y="r.textY"
        font-size="12"
        font-weight="700"
        font-family="inherit"
        :style="{ fill: CHART_LABEL_STRONG }"
      >{{ r.valText }}</text>
    </template>
  </svg>
</template>

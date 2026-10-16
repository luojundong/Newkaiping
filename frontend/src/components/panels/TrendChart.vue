<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, shallowRef } from 'vue'
import * as echarts from 'echarts'
import { KP_ACCENT, KP_ACCENT_RGBA } from '@/lib/kp-accent'

// 趋势折线图（大屏标配，echarts）。支持面积/数据点/区域切换由父级传 data/labels。
const props = withDefaults(
  defineProps<{
    data: number[]
    labels?: string[]
    color?: string
    area?: boolean
    showDots?: boolean
    height?: string
  }>(),
  {
    labels: () => [],
    color: KP_ACCENT,
    area: true,
    showDots: true,
    height: '100%',
  },
)

const el = ref<HTMLDivElement>()
const chart = shallowRef<echarts.ECharts>()

function render() {
  if (!chart.value) return
  chart.value.setOption({
    grid: { left: 6, right: 10, top: 10, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,16,31,0.92)',
      borderColor: KP_ACCENT_RGBA(0.35),
      textStyle: { color: '#E6F7FF', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: props.labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: KP_ACCENT_RGBA(0.2) } },
      axisLabel: { color: '#8CA8BE', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { color: '#8CA8BE', fontSize: 10 },
    },
    series: [
      {
        type: 'line',
        data: props.data,
        smooth: true,
        showSymbol: props.showDots,
        symbolSize: 5,
        lineStyle: { color: props.color, width: 2 },
        itemStyle: { color: props.color },
        areaStyle: props.area
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: props.color + '55' },
                { offset: 1, color: props.color + '00' },
              ]),
            }
          : undefined,
      },
    ],
  })
}

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value, undefined, { renderer: 'canvas' })
  render()
  ro.value = new ResizeObserver(() => chart.value?.resize())
  ro.value.observe(el.value)
  window.addEventListener('resize', onResize)
})

function onResize() {
  chart.value?.resize()
}

const ro = ref<ResizeObserver>()

watch(
  () => [props.data, props.labels, props.color, props.area, props.showDots],
  () => render(),
  { deep: true },
)

onBeforeUnmount(() => {
  ro.value?.disconnect()
  window.removeEventListener('resize', onResize)
  chart.value?.dispose()
})
</script>

<template>
  <div ref="el" class="trend-chart" :style="{ height }" />
</template>

<style scoped>
.trend-chart {
  width: 100%;
  min-height: 60px;
}
</style>

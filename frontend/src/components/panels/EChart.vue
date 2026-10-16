<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

// 通用 echarts 渲染器（仪表盘 / 饼图 / 环形图等，复用缩放与销毁逻辑）。
const props = withDefaults(
  defineProps<{
    option: EChartsOption
    height?: string
  }>(),
  { height: '100%' },
)

const el = ref<HTMLDivElement>()
const chart = shallowRef<echarts.ECharts>()
const ro = ref<ResizeObserver>()

function render() {
  chart.value?.setOption(props.option, true)
}

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  render()
  ro.value = new ResizeObserver(() => chart.value?.resize())
  ro.value.observe(el.value)
  window.addEventListener('resize', onResize)
})

function onResize() {
  chart.value?.resize()
}

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  ro.value?.disconnect()
  window.removeEventListener('resize', onResize)
  chart.value?.dispose()
})
</script>

<template>
  <div ref="el" class="echart-box" :style="{ width: '100%', height }" />
</template>

<style scoped>
.echart-box {
  min-height: 0;
  min-width: 0;
}
</style>

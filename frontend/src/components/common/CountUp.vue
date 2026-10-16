<script setup lang="ts">
import { onMounted, ref, watch, onBeforeUnmount } from 'vue'

// 数字翻滚 / 计数动画（大屏头条 KPI 用）。easeOutCubic。
const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    decimals?: number
    prefix?: string
    suffix?: string
    // 自定义格式化函数：传入后最终（含动画过程中每一帧）显示字符串经此函数处理，
    // 不再使用 toFixed(decimals)。用于接入 format.ts 的万/亿、能耗、字节等格式化。
    formatter?: (n: number) => string
  }>(),
  { duration: 1100, decimals: 0, prefix: '', suffix: '', formatter: undefined },
)

const display = ref(0)
let raf = 0

function animate(to: number) {
  cancelAnimationFrame(raf)
  const from = display.value
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / props.duration)
    const e = 1 - Math.pow(1 - t, 3)
    display.value = from + (to - from) * e
    if (t < 1) raf = requestAnimationFrame(step)
    else display.value = to
  }
  raf = requestAnimationFrame(step)
}

onMounted(() => animate(props.value))
watch(() => props.value, (v) => animate(v))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span class="count-up mono">{{ prefix }}{{ formatter ? formatter(display) : display.toFixed(decimals) }}{{ suffix }}</span>
</template>

<style scoped>
.count-up {
  font-family: var(--kp-font-mono);
  font-variant-numeric: tabular-nums;
}
</style>

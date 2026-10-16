<script setup lang="ts">
import { computed } from 'vue'
import CountUp from '@/components/common/CountUp.vue'
import { useI18nStore } from '@/stores/i18n'
import {
  formatWan,
  formatPercent,
  formatEnergyKwh,
  formatBytes,
  formatInt,
  formatFixed,
} from '@/lib/format'

// 紧凑 KPI 指标块（等宽数字，状态色，数字翻滚动画）
// format: 显式指定格式化方式（可选）；'auto' 时按 unit 自动推断（能耗/字节等）。
const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    unit?: string
    color?: string
    warn?: boolean
    decimals?: number
    format?: 'auto' | 'wan' | 'percent' | 'energy' | 'bytes' | 'int' | 'fixed'
  }>(),
  { color: 'var(--kp-accent)', warn: false, decimals: 0, format: 'auto' },
)

const { t } = useI18nStore()

const isNum = computed(() => typeof props.value === 'number')
const numVal = computed(() => Number(props.value))
const strVal = computed(() => String(props.value))
const unitText = computed(() => (props.unit ? t(props.unit) : ''))

// 选择数值格式化函数：最终（含动画每一帧）显示字符串经 format.ts 处理。
// 仅 'auto' 模式下根据现有 unit 安全推断，避免改变既有 KPI 语义/动画。
const numFormatter = computed<((n: number) => string) | undefined>(() => {
  if (props.format && props.format !== 'auto') {
    switch (props.format) {
      case 'wan':
        return formatWan
      case 'percent':
        return (n) => formatPercent(n)
      case 'energy':
        return formatEnergyKwh
      case 'bytes':
        return formatBytes
      case 'int':
        return formatInt
      case 'fixed':
        return (n) => formatFixed(n, props.decimals)
    }
  }
  const u = (props.unit || '').trim().toLowerCase()
  if (u === 'kwh' || u === 'mwh' || u === 'wh') return formatEnergyKwh
  if (u === 'b' || u === 'kb' || u === 'mb' || u === 'gb' || u === 'tb') return formatBytes
  return undefined
})
</script>

<template>
  <div class="kpi" :class="{ 'kpi--warn': warn }">
    <div class="kpi__value mono" :style="{ color }">
      <CountUp
        v-if="isNum"
        :value="numVal"
        :decimals="decimals"
        :formatter="numFormatter"
        :suffix="numFormatter ? '' : unitText ? ` ${unitText}` : ''"
        :duration="900"
      />
      <template v-else>{{ strVal }}<span v-if="unitText" class="kpi__unit">{{ unitText }}</span></template>
    </div>
    <div class="kpi__label">{{ t(label) }}</div>
  </div>
</template>

<style scoped>
.kpi {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 8px;
  border: 1px solid var(--kp-border);
  background: var(--kp-glow-soft);
  border-radius: var(--kp-radius-sm);
  min-width: 0;
  overflow: hidden;
}
.kpi__value {
  font-size: var(--kp-text-md);
  line-height: 1.2;
  text-shadow: 0 0 8px currentColor;
  white-space: nowrap;
}
.kpi__unit {
  font-size: var(--kp-text-xs);
  margin-left: 2px;
  opacity: 0.8;
}
.kpi__label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  white-space: nowrap;
}
.kpi--warn {
  border-color: var(--kp-border-strong);
  box-shadow: 0 0 8px var(--kp-glow-soft);
}
</style>

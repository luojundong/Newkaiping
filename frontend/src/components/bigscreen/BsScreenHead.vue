<script setup lang="ts">
/**
 * 图2–7 子屏头部（参考页 .shead L526-608：.st 中文大标题 + .ss 英文副标题 + .sclock 时钟）
 * 几何 [40,56,1840,44] 由 bigscreen-stage.css 的 .shead 提供。
 */
import { computed } from 'vue'
import { screenMeta, type ScreenNo } from '@/lib/bigscreen-screens'
import { useClock } from '@/lib/bigscreen-clock'

const props = defineProps<{ no: ScreenNo }>()
const meta = computed(() => screenMeta(props.no))
const { dateText, timeText } = useClock()
</script>

<template>
  <div class="shead">
    <span class="st">{{ meta.title }}</span>
    <span class="ss">{{ meta.titleEn }}</span>
    <span class="sclock">
      <span class="d">{{ dateText }}</span>
      <span class="t">{{ timeText }}</span>
    </span>
  </div>
</template>

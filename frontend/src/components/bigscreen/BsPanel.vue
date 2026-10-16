<script setup lang="ts">
/**
 * 大屏面板外壳（参考页 buildChrome() L4485-4507 的组件化复刻）
 *
 * 参考页做法：DOM 里只写 `<div class="panel" data-title="..." data-icon="...">`，
 * 启动时 buildChrome() 统一前置 `.p-hd`（.p-bar + .p-title + .p-chev）并追加 4 个 `.c` 角标。
 * 本组件把这套 chrome 固化为 Vue 结构，内容工只需传 title / icon，几何靠外部 class。
 *
 * 几何约定（bigscreen-stage.css）：
 *   图1 左列 `col-l pL1 h212`；图1 右列 `col-r p192 h288`
 *   图2-7 三段式 `col col-l pl1 h250` / `scenter` / `sbot`
 *
 * P0：图标一律 lucide-vue-next 组件传入，禁内联 SVG、禁 emoji。
 */
import type { LucideIcon } from 'lucide-vue-next'
import { ChevronRight } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    /** 面板标题（参考页 data-title，照抄原文） */
    title?: string
    /** 标题左侧图标（lucide 组件） */
    icon?: LucideIcon
    /** 是否可下钻（图1 的 S 卡）：hover 高亮 + 指针 */
    drill?: boolean
    /** GK-14 聚焦隐藏用的 widget id（可选，保留改造前语义） */
    hudId?: string
    /** 是否隐藏右侧 chevron（无下钻的纯展示面板） */
    noChev?: boolean
  }>(),
  { drill: false, noChev: false },
)

defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <div
    class="bs-panel"
    :class="{ 'bs-panel--drill': props.drill }"
    :data-hud-id="props.hudId"
    @click="$emit('click')"
  >
    <div v-if="props.title" class="p-hd">
      <span class="p-bar" />
      <span v-if="props.icon" class="p-ic"><component :is="props.icon" :size="15" /></span>
      <span class="p-title">{{ props.title }}</span>
      <span v-if="!props.noChev" class="p-chev"><ChevronRight :size="14" /></span>
    </div>
    <div class="p-bd">
      <slot />
    </div>
    <span class="c tl" />
    <span class="c tr" />
    <span class="c bl" />
    <span class="c br" />
  </div>
</template>

<style scoped>
/* 标题图标：与 .p-title 同色系，尺寸随标题字号（几何/配色全部走令牌，见 bigscreen-stage.css） */
.p-ic {
  display: flex;
  align-items: center;
  color: var(--kp-accent);
  flex: none;
}
</style>

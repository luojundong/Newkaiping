<script setup lang="ts">
/**
 * 大屏顶栏（参考页 .topnav / .ntab L473-479 一字不差复刻）
 *
 * 7 屏 tab：图1 主驾驶舱 … 图7 建筑面积表（文案来自 bigscreen-screens.ts 的 SCREENS，禁改顺序/文案）。
 * 产品决策（用户确认）：顶栏 = 参考页 7 屏，**不再是** 8 个子系统 tab；7 个子系统「降为下钻」，
 * 由图1 的 S1–S7 悬浮卡点选进入对应详情屏。
 *
 * 右侧：数据模式徽章（useDataMode，demo/empty/sim 三态，点击 cycle）+ 项目工具位（预留主题/语言）。
 *
 * P0：零硬编码色（色值只来自 --kp-* 令牌）；图标只用 lucide-vue-next，禁 emoji。
 */
import { SCREENS, type ScreenNo } from '@/lib/bigscreen-screens'
import { useDataMode } from '@/lib/bigscreen-data-mode'

const props = defineProps<{ active: ScreenNo }>()
const emit = defineEmits<{ (e: 'select', no: ScreenNo): void }>()

// 解构到顶层，使模板内自动解包（避免把 ComputedRef 直接绑进 :title/:class）
const { badgeClass, badgeText, badgeTextEn, cycle } = useDataMode()
</script>

<template>
  <div class="bs-topnav">
    <div class="brand">
      开平市中心医院
      <small>数字孪生综合管控平台</small>
    </div>

    <div class="tabs">
      <div
        v-for="s in SCREENS"
        :key="s.no"
        class="ntab"
        :class="{ on: s.no === props.active }"
        @click="emit('select', s.no)"
      >
        <span class="ni">{{ s.badge }}</span>
        {{ s.tab }}
      </div>
    </div>

    <div class="bs-topnav__tools">
      <div
        class="databadge"
        :class="badgeClass"
        :title="badgeTextEn"
        @click="cycle()"
      >
        {{ badgeText }}
      </div>
    </div>
  </div>
</template>

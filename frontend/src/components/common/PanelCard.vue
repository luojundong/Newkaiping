<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { Component } from 'vue'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useSceneStore } from '@/stores/scene'
import { boxToPercent, defaultLayout, BOX_LABELS } from '@/lib/bigscreen-layout'
import type { BigscreenBox, FrameStyle } from '@/types/api'
import { hudWidgetToBox, isCustomHudTitle, widgetPanelKind } from '@/lib/schema-hud'
import { BIGSCREEN_PANELS_COLLECTION, classifyDataSource, KIND_SHORT, KIND_FULL } from '@/lib/dataSource'

// 通用边框内面板（指挥舱风格：四角装饰 + 斜切发光标题栏）
// 传入 boxKey 时进入「大屏框」模式：从布局读取 x/y/w/h/frame（GK-06 后布局源：
// sceneSchema.hudLayout.widgets 优先 → bigscreen 布局 → 前端默认布局），
// 以绝对定位(% )渲染并套用 8 种样式框皮肤；数据内容（slot）保持不变，数据联动不受影响。
const props = defineProps<{
  title?: string
  icon?: Component
  accent?: boolean
  boxKey?: string
}>()

const bigscreen = useBigscreenStore()
const scene = useSceneStore()
// GK-06：该框的 hudLayout widget（sceneSchema.hudLayout.widgets[id === boxKey]）；无 → null
const hudWidget = computed(() => (props.boxKey ? scene.hudWidgetById(props.boxKey) : null))
const boxLayout = computed(() => {
  if (!props.boxKey) return null
  const fallback = bigscreen.layout?.boxes?.[props.boxKey] || defaultLayout().boxes[props.boxKey] || null
  // GK-27：schema 驱动的面板（panel-* 等）几何完全来自 hudLayout.widgets[].rect，
  // 无 bigscreen.layout 兜底时，用 widget 自身字段合成兜底框（位置/皮肤/标题/subsystem 一应俱全）。
  if (!fallback && hudWidget.value) {
    const w = hudWidget.value
    const r = Array.isArray(w.rect) && w.rect.length === 4 ? (w.rect as [number, number, number, number]) : [0, 0, 300, 200]
    const synth: BigscreenBox = {
      key: props.boxKey,
      x: r[0],
      y: r[1],
      w: r[2],
      h: r[3],
      frame: typeof w.frame === 'string' ? (w.frame as FrameStyle) : 'tech',
      subsystem: typeof w.subsystem === 'string' ? w.subsystem : undefined,
      title: typeof w.title === 'string' ? w.title : undefined,
    }
    return hudWidgetToBox(w, props.boxKey, synth)
  }
  if (!fallback) return null
  return hudWidget.value ? hudWidgetToBox(hudWidget.value, props.boxKey, fallback) : fallback
})
const frameClass = computed(() => {
  if (!props.boxKey) return {}
  const f = boxLayout.value?.frame || 'tech'
  return { 'bs-frame': true, [`bs-frame--${f}`]: true }
})
const boxStyle = computed(() => {
  if (!props.boxKey || !boxLayout.value) return {}
  const b = boxLayout.value
  const style: Record<string, string> = { position: 'absolute', ...boxToPercent(b) }
  // 后台 DIY：外框颜色 / 内边框颜色 / 内横线颜色 / 标题字号 / 标题颜色（CSS 变量，scoped 样式消费）
  if (b.borderColor) style['--box-frame-color'] = b.borderColor
  if (b.innerBorderColor) style['--box-inner-border-color'] = b.innerBorderColor
  if (b.innerLineColor) style['--box-inner-line-color'] = b.innerLineColor
  if (b.titleSize) style['--box-title-size'] = `${b.titleSize}px`
  if (b.titleColor) style['--box-title-color'] = b.titleColor
  return style
})
// hudLayout widget.title 是否为自定义（≠ 该框默认 BOX_LABELS）。仅自定义标题抢跑标题链，
// 默认标题继续走 subsystem 菜单名 / 调用方 i18n 标题，保证中英文切换等旧行为零回归。
// GK-27：panel-* 语义 id 无 BOX_LABELS 默认项，改为与所绑子系统默认名比较（不同即自定义）。
const hudTitleCustom = computed(() => {
  if (!hudWidget.value || !props.boxKey) return false
  if (props.boxKey.startsWith('panel-')) {
    const sub = props.boxKey.slice('panel-'.length)
    const t = hudWidget.value.title?.trim()
    if (!t) return false
    return scene.subsystemName(sub) !== t
  }
  return isCustomHudTitle(hudWidget.value, props.boxKey)
})
// 标题解析优先级：hud 自定义标题 > DIY 自定义 title > 绑定子系统菜单名 > 调用方传入 title > 默认框标签
const displayTitle = computed(() => {
  const b = boxLayout.value
  if (hudWidget.value) {
    if (hudTitleCustom.value && b?.title?.trim()) return b.title.trim()
  } else if (b?.title?.trim()) {
    return b.title.trim()
  }
  if (b?.subsystem) return scene.subsystemName(b.subsystem)
  return props.title || (props.boxKey ? BOX_LABELS[props.boxKey] : '') || ''
})
// 英文副标题（始终显示在中文标题下方）：自定义 titleEn > 绑定子系统英文名
const displayTitleEn = computed(() => {
  const b = boxLayout.value
  if (b?.titleEn?.trim()) return b.titleEn.trim()
  if (b?.subsystem) return scene.subsystemNameEn(b.subsystem)
  return ''
})
// 大屏中英文标题独立显示开关（后台站点配置，默认都开）
const showCn = computed(() => scene.siteConfig?.showChinese !== false)
const showEn = computed(() => scene.siteConfig?.showEnglish !== false)
// 主标题：显示中文时优先中文；关中文且开英文且有英文时显示英文；都关则空
const mainTitle = computed(() => {
  if (showCn.value) return displayTitle.value
  if (showEn.value && displayTitleEn.value) return displayTitleEn.value
  return ''
})
// 英文副标题仅在「中英文都显示」时作为副标题出现（避免与英文主标题重复）
const showSubEn = computed(() => showCn.value && showEn.value && !!displayTitleEn.value)

// GK-24 数据来源角标：仅大屏运行态（/bigscreen/*）显示；后台布局 DIY 预览（/admin/*）不显示，避免干扰排版编辑。
// 17 个大屏框数据均来自 /bigscreen/panels（后端读 subsystem_status，合成集合）→ 当前部署判为「模拟」。
const route = useRoute()
const isRuntime = computed(() => route.path.startsWith('/bigscreen'))
const showBadge = computed(() => isRuntime.value && !!props.boxKey)
const sourceKind = classifyDataSource(BIGSCREEN_PANELS_COLLECTION)
const sourceShort = KIND_SHORT[sourceKind]
const sourceFull = KIND_FULL[sourceKind]
</script>

<template>
  <section
    class="kp-panel panel-card"
    :class="[frameClass, { 'panel-card--accent': accent }]"
    :style="boxStyle"
    :data-hud-id="props.boxKey || ''"
    :data-hud-type="hudWidget?.type || ''"
    :data-hud-title-custom="hudTitleCustom ? '1' : '0'"
    :data-panel-kind="props.boxKey ? widgetPanelKind(hudWidget) : ''"
    :data-subsystem="boxLayout?.subsystem || ''"
    :data-data-block="showBadge ? props.boxKey : null"
    :data-source-badge="showBadge ? sourceKind : null"
  >
    <span
      v-if="showBadge"
      class="panel-card__src"
      :class="`panel-card__src--${sourceKind}`"
      :title="sourceFull"
    >{{ sourceShort }}</span>
    <span class="kp-corner kp-corner--tl" />
    <span class="kp-corner kp-corner--tr" />
    <span class="kp-corner kp-corner--bl" />
    <span class="kp-corner kp-corner--br" />

    <div v-if="mainTitle || $slots.title" class="kp-panel-title">
      <span class="kp-panel-title__bar" />
      <component :is="icon" v-if="icon" :size="16" class="kp-panel-title__icon" />
      <div class="kp-panel-title__text">
        <slot name="title">{{ mainTitle }}</slot>
        <span v-if="showSubEn" class="kp-panel-title__en">{{ displayTitleEn }}</span>
      </div>
      <span v-if="$slots.extra" class="kp-panel-title__extra"><slot name="extra" /></span>
    </div>

    <div class="panel-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: var(--kp-radius-panel);
  background: rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha));
  border: 1px solid var(--box-frame-color, var(--kp-panel-edge));
  overflow: hidden;
}
/* GK-24 数据来源角标：小号、不刺眼、一眼可辨；模拟=琥珀，待接入=灰，真实=青 */
.panel-card__src {
  position: absolute;
  top: 5px;
  right: 9px;
  z-index: 3;
  padding: 1px 6px;
  font-size: 10px;
  line-height: 1.5;
  letter-spacing: 0.5px;
  border-radius: 999px;
  border: 1px solid currentColor;
  opacity: 0.85;
  pointer-events: none;
  user-select: none;
}
.panel-card__src--mock { color: var(--kp-warn); background: color-mix(in srgb, var(--kp-warn) 12%, transparent); }
.panel-card__src--pending { color: var(--kp-fg-muted); background: color-mix(in srgb, var(--kp-fg-muted) 12%, transparent); }
.panel-card__src--real { color: var(--kp-success); background: color-mix(in srgb, var(--kp-success) 12%, transparent); }
/* 后台 DIY：内边框颜色覆盖时四角装饰跟随 */
.kp-corner {
  position: absolute;
  width: 12px;
  height: 12px;
  z-index: 2;
  pointer-events: none;
  border-color: var(--box-inner-border-color, var(--kp-accent));
}
.panel-card--accent {
  box-shadow: inset 0 0 28px var(--kp-glow-soft);
  border-color: var(--kp-accent);
}
.kp-corner--tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; border-top-left-radius: var(--kp-radius-panel); }
.kp-corner--tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; border-top-right-radius: var(--kp-radius-panel); }
.kp-corner--bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; border-bottom-left-radius: var(--kp-radius-panel); }
.kp-corner--br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; border-bottom-right-radius: var(--kp-radius-panel); }

/* 标题栏：无底色 + 青竖条 + 从左向右淡出的 1px 渐变下划线 */
.kp-panel-title {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: var(--kp-panel-title-h);
  height: auto;
  padding: 6px 12px 6px 14px;
  font-size: var(--box-title-size, var(--kp-text-lg));
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--box-title-color, var(--kp-fg));
  background: transparent;
  border-bottom: none;
}
.kp-panel-title::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--box-inner-line-color, var(--kp-accent)) 0%, transparent 100%);
}
.kp-panel-title__bar {
  position: absolute;
  left: 0;
  top: 50%;
  bottom: auto;
  width: 4px;
  height: 16px;
  transform: translateY(-50%);
  border-radius: 0;
  background: var(--kp-accent);
  box-shadow: none;
}
.kp-panel-title__icon {
  color: var(--kp-accent);
  flex-shrink: 0;
}
.kp-panel-title__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  line-height: 1.18;
}
.kp-panel-title__en {
  margin-top: 1px;
  font-size: var(--kp-text-xs);
  font-weight: 400;
  letter-spacing: 0.3px;
  color: var(--kp-fg-muted);
  text-shadow: none;
}
.kp-panel-title__extra {
  margin-left: auto;
  font-size: var(--kp-text-xs);
  font-weight: 400;
  letter-spacing: 0;
  color: var(--kp-fg-muted);
  text-shadow: none;
}

.panel-card__body {
  flex: 1;
  min-height: 0;
  padding: 8px 10px 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

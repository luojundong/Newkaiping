<script setup lang="ts">
import { computed } from 'vue'
import {
  ShieldAlert,
  Gauge,
  ClipboardList,
  Droplet,
  Fan,
  Lightbulb,
  MoveVertical,
  Zap,
  type LucideIcon,
} from 'lucide-vue-next'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useSceneStore } from '@/stores/scene'
import { useI18nStore } from '@/stores/i18n'
import { SUBSYSTEMS } from '@/types/scene'
import { boxToPercent, defaultLayout, BOX_LABELS } from '@/lib/bigscreen-layout'
import { hudWidgetToBox, isCustomHudTitle, widgetPanelKind } from '@/lib/schema-hud'
import { BIGSCREEN_PANELS_COLLECTION, classifyDataSource, KIND_SHORT, KIND_FULL } from '@/lib/dataSource'

const bs = useBigscreenStore()
const scene = useSceneStore()
const { t } = useI18nStore()

// 子系统 → 图标 / 语义色（与 AppHeader 一致，ADR-002 唯一图标源）
const SUBSYS_ICON: Record<string, LucideIcon> = {
  regulation: Gauge,
  lifecycle: ClipboardList,
  hvac: Fan,
  lighting: Lightbulb,
  power: Zap,
  hotwater: Droplet,
  elevator: MoveVertical,
}
function iconFor(key: string): LucideIcon {
  return SUBSYS_ICON[key] || ShieldAlert
}
function colorFor(key: string): string {
  const m = SUBSYSTEMS.find((s) => s.code === key)
  return m?.colorVar ? `var(${m.colorVar})` : '#ff4d5e'
}

// 大屏框模式：传入 boxKey 时按布局绝对定位 + 套用样式框皮肤。
// GK-06 起布局源：sceneSchema.hudLayout.widgets 优先 → bigscreen 布局 → 前端默认布局。
const props = defineProps<{ boxKey?: string }>()
const hudWidget = computed(() => (props.boxKey ? scene.hudWidgetById(props.boxKey) : null))
const boxLayout = computed(() => {
  if (!props.boxKey) return null
  const fallback = bs.layout?.boxes?.[props.boxKey] || defaultLayout().boxes[props.boxKey] || null
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
  // 后台大屏布局 DIY：外框颜色 / 内边框颜色 / 内横线颜色 / 标题字号 / 标题颜色（与 PanelCard 对齐）
  if (b.borderColor) style['--box-frame-color'] = b.borderColor
  if (b.innerBorderColor) style['--box-inner-border-color'] = b.innerBorderColor
  if (b.innerLineColor) style['--box-inner-line-color'] = b.innerLineColor
  if (b.titleSize) style['--box-title-size'] = `${b.titleSize}px`
  if (b.titleColor) style['--box-title-color'] = b.titleColor
  return style
})
// 框框名称（后台大屏布局 DIY 可改 / GK-06 hud widget.title 可改）：
// hud 驱动时仅自定义标题（≠ BOX_LABELS['left-alarm']）抢跑；否则保留 DIY title → 默认「监控报警」。
const hudTitleCustom = computed(() =>
  !!(hudWidget.value && props.boxKey && isCustomHudTitle(hudWidget.value, props.boxKey)),
)
const displayTitle = computed(() => {
  const b = boxLayout.value
  if (hudWidget.value) {
    if (hudTitleCustom.value && b?.title?.trim()) return b.title.trim()
  } else if (b?.title?.trim()) {
    return b.title.trim()
  }
  return BOX_LABELS[props.boxKey || ''] || '监控报警'
})
const showCorners = computed(
  () => !props.boxKey || (boxLayout.value?.frame || 'tech') === 'tech',
)

interface AlarmRow {
  key: string
  name: string
  count: number
  level: string
  icon: LucideIcon
  color: string
}

// GK-24：左侧报警直接渲染后端返回的实时告警条目（已按当前子系统/全院范围真实聚合），
// 不再用写死的 14 类目去反查（此前真实模式下 key 不匹配导致全为 0）。
// 每条告警按子系统聚合展示图标与语义色；无条目时显示「系统正常」。
const items = computed<AlarmRow[]>(() => {
  const list = bs.panels.left.alarmItems || []
  if (!list.length) {
    return [{ key: 'normal', name: '系统正常', count: 0, level: 'info', icon: ShieldAlert, color: '#2ee6a6' }]
  }
  return list.map((it) => ({
    key: it.key || 'unknown',
    name: it.name,
    count: it.count,
    level: it.level,
    icon: iconFor(it.key || ''),
    color: colorFor(it.key || ''),
  }))
})

const total = computed(() => bs.panels.left.alarmTotal)

// GK-24 数据来源标识：监控报警来自 /bigscreen/panels（后端读 subsystem_status，合成集合）→ 模拟
const sourceKind = classifyDataSource(BIGSCREEN_PANELS_COLLECTION)
const sourceShort = KIND_SHORT[sourceKind]
const sourceFull = KIND_FULL[sourceKind]
</script>

<template>
  <aside
    class="left-panel"
    :class="[frameClass, { 'left-panel--framed': !!props.boxKey }]"
    :style="boxStyle"
    :data-hud-id="props.boxKey || ''"
    :data-hud-type="hudWidget?.type || ''"
    :data-hud-title-custom="hudTitleCustom ? '1' : '0'"
    :data-panel-kind="props.boxKey ? widgetPanelKind(hudWidget) : ''"
    :data-subsystem="boxLayout?.subsystem || ''"
    data-data-block="left-alarm"
    :data-source-badge="sourceKind"
  >
    <span
      class="left-panel__src"
      :class="`left-panel__src--${sourceKind}`"
      :title="sourceFull"
    >{{ sourceShort }}</span>
    <span v-if="showCorners" class="corner corner--tl" />
    <span v-if="showCorners" class="corner corner--tr" />
    <span v-if="showCorners" class="corner corner--bl" />
    <span v-if="showCorners" class="corner corner--br" />

    <div class="panel-title">
      <ShieldAlert :size="16" />
      <span>{{ t(displayTitle) }}</span>
    </div>

    <ul class="alarm-list">
      <li v-for="item in items" :key="item.key + item.name">
        <span class="alarm-icon" :style="{ background: item.color }">
          <component :is="item.icon" :size="11" />
        </span>
        <span class="alarm-name">{{ t(item.name) }}</span>
        <strong class="alarm-count" :class="{ warn: item.count > 0 }">{{ item.count }}</strong>
      </li>
    </ul>

    <div class="panel-total">
      <ShieldAlert :size="14" />
      <span class="panel-total__num mono">{{ total }}</span>
      <span class="panel-total__label">{{ t('条告警', 'Alarms') }}</span>
    </div>
  </aside>
</template>

<style scoped>
.left-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px 10px 12px;
  overflow: hidden;
  border-radius: var(--kp-radius-md);
}
/* GK-24 数据来源角标：小号、不刺眼、一眼可辨；模拟=琥珀，待接入=灰，真实=青 */
.left-panel__src {
  position: absolute;
  top: 6px;
  right: 8px;
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
.left-panel__src--mock { color: var(--kp-warn); background: rgba(var(--kp-warn-rgb), 0.1); }
.left-panel__src--pending { color: var(--kp-fg-muted); background: color-mix(in srgb, var(--kp-fg-muted) 10%, transparent); }
.left-panel__src--real { color: var(--kp-success); background: rgba(var(--kp-success-rgb), 0.1); }
/* 非大屏框模式（管理端预览 / 未接 boxKey）：自带 tech 风格边框与背景 */
.left-panel:not(.left-panel--framed) {
  border: 1px solid var(--kp-border-strong);
  background: linear-gradient(180deg, color-mix(in srgb, var(--kp-surface) calc(var(--kp-panel-alpha) * 100%), transparent), rgba(var(--kp-bg-rgb), var(--kp-panel-alpha)));
  box-shadow:
    0 0 20px rgba(var(--kp-accent-rgb), 0.18),
    inset 0 0 28px rgba(var(--kp-accent-rgb), 0.06);
}
/* 大屏框模式（接 boxKey）：边框 / 背景 / 发光阴影完全交给 .bs-frame 皮肤接管，
   由 bigscreen-frames.css 的 .bs-frame / .bs-frame--<frame> 控制，支持 8 种框型 DIY。
   此处不再清零，避免覆盖皮肤样式（此前 border:none 导致左侧报警框边框消失）。 */

.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  z-index: 2;
  pointer-events: none;
  border-color: var(--box-inner-border-color, var(--kp-accent));
  filter: drop-shadow(0 0 3px var(--kp-glow));
}
.corner--tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
.corner--tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
.corner--bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
.corner--br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  margin-bottom: 8px;
  flex-shrink: 0;
  background: linear-gradient(90deg, var(--kp-glow-soft), transparent 60%);
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 100%, 0 100%);
  border-bottom: 1px solid var(--box-inner-line-color, var(--kp-border));
  font-size: var(--box-title-size, var(--kp-text-md));
  font-weight: 600;
  letter-spacing: 3px;
  color: var(--box-title-color, var(--kp-fg));
  text-shadow: 0 0 10px var(--kp-glow);
}
.panel-title svg {
  color: var(--kp-accent);
  filter: drop-shadow(0 0 4px var(--kp-glow));
}

.alarm-list {
  list-style: none;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.alarm-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: 30px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--box-inner-line-color, var(--kp-border));
  cursor: default;
  transition: background 0.18s ease;
}
.alarm-list li:hover {
  background: var(--kp-glow-soft);
}

.alarm-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.35);
}
.alarm-icon svg {
  color: var(--kp-bg);
}

.alarm-name {
  font-size: var(--kp-text-sm);
  letter-spacing: 0.5px;
  color: var(--kp-fg-muted);
  flex: 1;
}

.alarm-count {
  font-family: var(--kp-font-mono);
  font-size: var(--kp-text-md);
  color: var(--kp-fg-subtle);
}
.alarm-count.warn {
  color: var(--kp-warn);
  text-shadow: 0 0 6px var(--kp-warn-glow);
}

.panel-total {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--box-inner-line-color, var(--kp-border));
  color: var(--kp-accent);
}
.panel-total svg {
  filter: drop-shadow(0 0 4px var(--kp-glow));
}
.panel-total__num {
  font-size: var(--kp-text-2xl);
  text-shadow: 0 0 10px var(--kp-glow);
}
.panel-total__label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
</style>

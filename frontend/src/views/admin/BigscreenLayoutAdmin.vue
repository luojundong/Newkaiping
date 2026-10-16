<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Palette,
  RotateCcw,
  Save,
  Move,
  LayoutGrid,
  Monitor,
  Tag,
} from 'lucide-vue-next'
import { KP_ACCENT } from '@/lib/kp-accent'
import { bigscreenApi, schemaEditorApi } from '@/api'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useSceneStore } from '@/stores/scene'
import {
  BOX_KEYS,
  BOX_LABELS,
  FRAME_KEYS,
  FRAME_LABELS,
  DESIGN_W,
  DESIGN_H,
  defaultLayout,
} from '@/lib/bigscreen-layout'
import {
  SYSTEM_KEYS,
  SYSTEM_LABELS,
  DEFAULT_STYLE,
  styleToCssVars,
} from '@/lib/bigscreen-config'
import { SUBSYSTEMS } from '@/types/scene'
import type {
  BigscreenBox,
  BigscreenStyle,
  FrameStyle,
  SceneSchemaHudLayout,
  SceneSchemaHudWidget,
} from '@/types/api'
import '@/styles/bigscreen-frames.css'
import '@/styles/bigscreen-stage.css'

const bigscreen = useBigscreenStore()
const scene = useSceneStore()

// 框标题解析（与 PanelCard 一致）：自定义标题 > 绑定子系统菜单名 > 默认标签
function boxDisplayTitle(key: string): string {
  const b = boxes.value[key]
  if (b?.title?.trim()) return b.title.trim()
  if (b?.subsystem) return scene.subsystemName(b.subsystem)
  return BOX_LABELS[key] || ''
}
// 英文副标题解析（与 PanelCard 一致）：自定义 titleEn > 绑定子系统英文名
function boxDisplayTitleEn(key: string): string {
  const b = boxes.value[key]
  if (b?.titleEn?.trim()) return b.titleEn.trim()
  if (b?.subsystem) return scene.subsystemNameEn(b.subsystem)
  return ''
}

// Tab 名称：overview 用站点配置标题（默认「全院综合态势」），其余子系统跟随子系统菜单自定义名
function tabName(sys: string): string {
  if (sys === 'overview') return scene.siteConfig?.title || '全院综合态势'
  return scene.subsystemName(sys)
}

// 当前编辑系统（overview + 7 子系统，各自一套布局）
const activeSystem = ref<string>('overview')
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

// 17 框工作副本（设计像素 x/y/w/h + 框型）
const boxes = ref<Record<string, BigscreenBox>>({})
const selectedKey = ref<string | null>(null)

// 舞台主题（取当前系统样式配置，使预览贴合大屏真实观感）
const currentStyle = ref<BigscreenStyle>({ ...DEFAULT_STYLE })
const stageVars = computed<Record<string, string>>(() => styleToCssVars(currentStyle.value))

// 缩放（设计 1920×1080 等比缩放到容器宽度）
const stageWrap = ref<HTMLElement | null>(null)
const scale = ref(1)
let ro: ResizeObserver | null = null
function updateScale() {
  if (!stageWrap.value) return
  scale.value = stageWrap.value.clientWidth / DESIGN_W
}

const selectedBox = computed<BigscreenBox | null>(() =>
  selectedKey.value ? boxes.value[selectedKey.value] || null : null,
)

// 三色 DIY 默认值（对应 design-tokens.css :root 默认主题，预览舞台沿用该主题变量）
const DEFAULT_FRAME_COLOR = 'rgba(var(--kp-accent-rgb), 0.16)' // 外框 --kp-border
const DEFAULT_INNER_BORDER_COLOR = KP_ACCENT // 内边框/四角 --kp-accent
const DEFAULT_INNER_LINE_COLOR = 'rgba(var(--kp-accent-rgb), 0.16)' // 内横线 --kp-border
const effFrame = computed(() => selectedBox.value?.borderColor || DEFAULT_FRAME_COLOR)
const effInnerBorder = computed(() => selectedBox.value?.innerBorderColor || DEFAULT_INNER_BORDER_COLOR)
const effInnerLine = computed(() => selectedBox.value?.innerLineColor || DEFAULT_INNER_LINE_COLOR)

function boxStyle(key: string): Record<string, string> {
  const b = boxes.value[key]
  if (!b) return {}
  const style: Record<string, string> = {
    position: 'absolute',
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
  }
  // 预览舞台：外框/内边框/内横线三色 DIY 即时反映
  if (b.borderColor) style['--box-frame-color'] = b.borderColor
  if (b.innerBorderColor) style['--box-inner-border-color'] = b.innerBorderColor
  if (b.innerLineColor) style['--box-inner-line-color'] = b.innerLineColor
  return style
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function clampPx(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}

// 8px 栅格吸附（对齐项目 C2 裁定的 8px 栅格）：目标值取整到最近的 8 的倍数
function snap8(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.round(v / 8) * 8
}

// ---------- 系统切换 / 加载 ----------
async function loadSystem(system: string) {
  if (dirty.value && !window.confirm('当前有未保存的布局改动，切换系统将丢失，是否继续？')) {
    return
  }
  activeSystem.value = system
  selectedKey.value = null
  loading.value = true
  try {
    const [layoutRes, cfgRes] = await Promise.allSettled([
      bigscreenApi.getLayout(system),
      bigscreenApi.getConfig(system),
    ])
    if (layoutRes.status === 'fulfilled' && layoutRes.value?.boxes) {
      boxes.value = clone(layoutRes.value.boxes)
    } else {
      boxes.value = clone(defaultLayout().boxes)
    }
    if (cfgRes.status === 'fulfilled' && cfgRes.value?.style) {
      currentStyle.value = { ...DEFAULT_STYLE, ...cfgRes.value.style }
    } else {
      currentStyle.value = { ...DEFAULT_STYLE }
    }
    dirty.value = false
  } catch {
    boxes.value = clone(defaultLayout().boxes)
    currentStyle.value = { ...DEFAULT_STYLE }
  } finally {
    loading.value = false
  }
}

function switchSystem(system: string) {
  if (system === activeSystem.value) return
  void loadSystem(system)
}

// ---------- 选择 / 框型 / 数值 ----------
function select(key: string) {
  selectedKey.value = key
}
function setFrame(f: FrameStyle) {
  if (!selectedBox.value) return
  selectedBox.value.frame = f
  dirty.value = true
}
function setVal(field: 'x' | 'y' | 'w' | 'h', e: Event) {
  if (!selectedBox.value) return
  const v = Number((e.target as HTMLInputElement).value)
  const b = selectedBox.value
  if (field === 'x') b.x = clampPx(v, 0, DESIGN_W - b.w)
  else if (field === 'y') b.y = clampPx(v, 0, DESIGN_H - b.h)
  else if (field === 'w') b.w = clampPx(v, 40, DESIGN_W)
  else if (field === 'h') b.h = clampPx(v, 40, DESIGN_H)
  dirty.value = true
}

// 表单提交（blur/回车）时补 8px 吸附：与画布拖拽/缩放同一栅格（GK-15 TODO 收尾）。
// 输入过程中不吸附，避免逐键跳变；离开输入框才取整到最近的 8 的倍数并钳制。
function setValCommit(field: 'x' | 'y' | 'w' | 'h', e: Event) {
  if (!selectedBox.value) return
  const v = Number((e.target as HTMLInputElement).value)
  const b = selectedBox.value
  const snapped = snap8(Number.isNaN(v) ? 0 : v)
  if (field === 'x') b.x = clampPx(snapped, 0, DESIGN_W - b.w)
  else if (field === 'y') b.y = clampPx(snapped, 0, DESIGN_H - b.h)
  else if (field === 'w') b.w = clampPx(snapped, 40, DESIGN_W)
  else if (field === 'h') b.h = clampPx(snapped, 40, DESIGN_H)
  ;(e.target as HTMLInputElement).value = String(
    field === 'x' ? b.x : field === 'y' ? b.y : field === 'w' ? b.w : b.h,
  )
  dirty.value = true
}

// ---------- 名称与显示样式（后台 DIY） ----------
function setTitle(e: Event) {
  if (!selectedBox.value) return
  const v = (e.target as HTMLInputElement).value
  selectedBox.value.title = v.trim() || undefined
  dirty.value = true
}
// 英文副标题：显示在中文标题下方，留空则不显示英文
function setTitleEn(e: Event) {
  if (!selectedBox.value) return
  const v = (e.target as HTMLInputElement).value
  selectedBox.value.titleEn = v.trim() || undefined
  dirty.value = true
}
// 绑定子系统：绑定后默认标题跟随「子系统菜单」自定义名称（一一对应）
function setSubsystem(e: Event) {
  if (!selectedBox.value) return
  const v = (e.target as HTMLSelectElement).value
  selectedBox.value.subsystem = v || undefined
  dirty.value = true
}
function setTitleSize(e: Event) {
  if (!selectedBox.value) return
  const v = Number((e.target as HTMLInputElement).value)
  selectedBox.value.titleSize = v > 0 ? v : undefined
  dirty.value = true
}
function setTitleColor(c: string) {
  if (!selectedBox.value) return
  selectedBox.value.titleColor = c || undefined
  dirty.value = true
}
function setBorderColor(c: string) {
  if (!selectedBox.value) return
  selectedBox.value.borderColor = c || undefined
  dirty.value = true
}
function setInnerBorderColor(c: string) {
  if (!selectedBox.value) return
  selectedBox.value.innerBorderColor = c || undefined
  dirty.value = true
}
function setInnerLineColor(c: string) {
  if (!selectedBox.value) return
  selectedBox.value.innerLineColor = c || undefined
  dirty.value = true
}

function resetDefault() {
  boxes.value = clone(defaultLayout().boxes)
  dirty.value = true
  ElMessage.info('已恢复默认布局（请点击保存生效）')
}

async function save() {
  saving.value = true
  let layoutOk = false
  try {
    await bigscreenApi.saveLayout(activeSystem.value, { boxes: boxes.value })
    layoutOk = true
    dirty.value = false
    ElMessage.success('布局已保存，大屏已同步刷新')
    // 跨标签广播，通知其他标签的大屏立即重拉布局/配置
    bigscreen.broadcastLayout(activeSystem.value)
  } catch (e) {
    ElMessage.error('保存失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    saving.value = false
  }
  if (!layoutOk) return

  // GK-16：admin 布局编辑 → 同步到 scene.schema.hudLayout（全局段，仅 overview 编辑点同步）。
  // 复用既有 schema 保存 API（If-Match 乐观锁 + schemaSync 广播），让既有的 schema.updated
  // websocket 广播自然驱动大屏重渲染。schema 同步失败不得回滚布局保存。
  if (activeSystem.value === 'overview') {
    try {
      const expectedVersion = (await schemaEditorApi.version()).version
      const doc = await schemaEditorApi.get()
      const curHud = doc.hudLayout
      if (curHud) {
        const widgets = curHud.widgets.map((w) => {
          const b = boxes.value[w.id]
          return b ? { ...w, rect: [b.x, b.y, b.w, b.h] as [number, number, number, number] } : w
        })
        await schemaEditorApi.update(
          { hudLayout: { canvas: curHud.canvas, widgets } },
          expectedVersion,
        )
      }
    } catch (err) {
      console.warn('[BigscreenLayoutAdmin] hudLayout 同步失败（布局已保存）', err)
      ElMessage.warning('布局已保存，但同步大屏 hudLayout 失败（不影响布局）')
    }
  }
}

// ---------- 拖拽 / 缩放 ----------
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type HandleDir = (typeof HANDLES)[number]

interface DragState {
  mode: 'move' | 'resize'
  key: string
  dir: HandleDir
  startX: number
  startY: number
  orig: { x: number; y: number; w: number; h: number }
}
let drag: DragState | null = null

function onBoxPointerDown(e: PointerEvent, key: string) {
  if ((e.target as HTMLElement).dataset.handle) return // 由手柄处理
  select(key)
  drag = {
    mode: 'move',
    key,
    dir: 'n',
    startX: e.clientX,
    startY: e.clientY,
    orig: { ...boxes.value[key] },
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onHandlePointerDown(e: PointerEvent, key: string, dir: HandleDir) {
  e.stopPropagation()
  select(key)
  drag = {
    mode: 'resize',
    key,
    dir,
    startX: e.clientX,
    startY: e.clientY,
    orig: { ...boxes.value[key] },
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  const dx = (e.clientX - drag.startX) / scale.value
  const dy = (e.clientY - drag.startY) / scale.value
  const b = boxes.value[drag.key]
  if (drag.mode === 'move') {
    // 移动：先吸附 8px 栅格，再钳制到画布边界（w/h 不变）
    b.x = clampPx(snap8(drag.orig.x + dx), 0, DESIGN_W - b.w)
    b.y = clampPx(snap8(drag.orig.y + dy), 0, DESIGN_H - b.h)
  } else {
    let { x, y, w, h } = drag.orig
    if (drag.dir.includes('e')) w = drag.orig.w + dx
    if (drag.dir.includes('s')) h = drag.orig.h + dy
    if (drag.dir.includes('w')) {
      x = drag.orig.x + dx
      w = drag.orig.w - dx
    }
    if (drag.dir.includes('n')) {
      y = drag.orig.y + dy
      h = drag.orig.h - dy
    }
    // 缩放：先吸附 8px 栅格，再钳制到画布边界（w/h>0 且不超画布宽高）
    w = clampPx(snap8(w), 40, DESIGN_W)
    h = clampPx(snap8(h), 40, DESIGN_H)
    x = clampPx(snap8(x), 0, DESIGN_W - w)
    y = clampPx(snap8(y), 0, DESIGN_H - h)
    b.x = x
    b.y = y
    b.w = w
    b.h = h
  }
  dirty.value = true
}

function onPointerUp() {
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

onMounted(() => {
  updateScale()
  if (stageWrap.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(updateScale)
    ro.observe(stageWrap.value)
  }
  void loadSystem(activeSystem.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="layout-admin admin-page">
    <!-- 工具栏：系统页签 + 操作 -->
    <div class="la-toolbar admin-toolbar">
      <div class="la-tabs">
        <button
          v-for="sys in SYSTEM_KEYS"
          :key="sys"
          class="la-tab"
          :class="{ 'is-active': sys === activeSystem }"
          @click="switchSystem(sys)"
        >
          {{ tabName(sys) }}
        </button>
      </div>
      <div class="la-actions">
        <button class="la-btn" :disabled="saving" @click="resetDefault">
          <RotateCcw :size="15" /> 恢复默认
        </button>
        <button class="la-btn la-btn--primary" :disabled="saving" @click="save">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div v-if="dirty" class="la-dirty">● 有未保存的改动</div>

    <div class="la-body" :class="{ 'is-loading': loading }">
      <!-- 拖拽画布：1920×1080 设计空间等比缩放 -->
      <div ref="stageWrap" class="la-stage-wrap">
        <div class="bs-stage" :style="{ transform: `scale(${scale})`, transformOrigin: 'top left', ...stageVars }">
          <div
            v-for="key in BOX_KEYS"
            :key="key"
            class="bs-panel la-box"
            :data-key="key"
            :data-hud-id="key"
            :class="{ 'is-selected': key === selectedKey }"
            :style="boxStyle(key)"
            @pointerdown="onBoxPointerDown($event, key)"
          >
            <div class="p-hd">
              <span class="p-bar" />
              <span class="p-title">{{ boxDisplayTitle(key) }}</span>
              <span class="p-chev"><ChevronRight :size="14" /></span>
            </div>
            <div class="p-bd"></div>
            <span class="c tl" /><span class="c tr" /><span class="c bl" /><span class="c br" />

            <template v-if="key === selectedKey">
              <span
                v-for="dir in HANDLES"
                :key="dir"
                class="la-handle"
                :class="`la-handle--${dir}`"
                :data-handle="dir"
                @pointerdown="onHandlePointerDown($event, key, dir)"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- 右侧检视面板 -->
      <aside class="la-inspector">
        <div class="la-sec">
          <div class="la-sec__title"><Palette :size="15" /> 框型样式（8 种）</div>
          <div class="la-frames">
            <button
              v-for="f in FRAME_KEYS"
              :key="f"
              class="la-frame"
              :class="{ 'is-active': selectedBox && selectedBox.frame === f }"
              :disabled="!selectedBox"
              @click="setFrame(f)"
            >
              <span class="bs-frame" :class="`bs-frame--${f}`"><i>{{ FRAME_LABELS[f] }}</i></span>
            </button>
          </div>
        </div>

        <div class="la-sec" v-if="selectedBox">
          <div class="la-sec__title"><Move :size="15" /> 位置与尺寸（设计像素）</div>
          <div class="la-grid4">
            <label>X<input type="number" :value="selectedBox.x" @input="setVal('x', $event)" @change="setValCommit('x', $event)" /></label>
            <label>Y<input type="number" :value="selectedBox.y" @input="setVal('y', $event)" @change="setValCommit('y', $event)" /></label>
            <label>宽<input type="number" :value="selectedBox.w" @input="setVal('w', $event)" @change="setValCommit('w', $event)" /></label>
            <label>高<input type="number" :value="selectedBox.h" @input="setVal('h', $event)" @change="setValCommit('h', $event)" /></label>
          </div>
          <div class="la-hint">提示：在画布中直接拖动框体移动，拖拽四角/四边缩放；数值按 8px 栅格吸附。</div>
        </div>

        <div class="la-sec" v-if="selectedBox">
          <div class="la-sec__title"><Tag :size="15" /> 名称与显示样式</div>
          <div class="la-field">
            <label>绑定子系统</label>
            <select class="la-select" :value="selectedBox.subsystem || ''" @change="setSubsystem($event)">
              <option value="">不绑定（使用默认名）</option>
              <option v-for="s in SUBSYSTEMS" :key="s.code" :value="s.code">{{ s.name }}</option>
            </select>
          </div>
          <p v-if="selectedBox.subsystem" class="la-hint">
            已绑定「{{ scene.subsystemName(selectedBox.subsystem) }}」，默认标题跟随子系统菜单名称；
            在「子系统菜单」中改名将自动同步到大屏。
          </p>
          <div class="la-field">
            <label>框框名称</label>
            <input type="text" :value="selectedBox.title || ''" placeholder="留空则使用子系统/默认名" @input="setTitle($event)" />
          </div>
          <div class="la-field">
            <label>英文标题 (Title En)</label>
            <input type="text" :value="selectedBox.titleEn || ''" placeholder="留空则不显示英文副标题" @input="setTitleEn($event)" />
          </div>
          <div class="la-field">
            <label>标题字号 (px)</label>
            <input type="number" min="10" max="48" :value="selectedBox.titleSize || ''" placeholder="默认 14" @input="setTitleSize($event)" />
          </div>
          <div class="la-field">
            <label>标题颜色</label>
            <div class="la-color">
              <el-color-picker :model-value="selectedBox.titleColor || ''" size="small" @change="setTitleColor" />
              <span v-if="!selectedBox.titleColor" class="la-color__def">默认</span>
            </div>
          </div>
          <div class="la-field">
            <label>外框颜色</label>
            <div class="la-color">
              <el-color-picker :model-value="selectedBox.borderColor || ''" size="small" @change="setBorderColor" />
              <span class="la-color__swatch" :style="{ background: effFrame }" />
              <span class="la-color__def">默认 {{ DEFAULT_FRAME_COLOR }}</span>
            </div>
          </div>
          <div class="la-field">
            <label>内边框颜色</label>
            <div class="la-color">
              <el-color-picker :model-value="selectedBox.innerBorderColor || ''" size="small" @change="setInnerBorderColor" />
              <span class="la-color__swatch" :style="{ background: effInnerBorder }" />
              <span class="la-color__def">默认 {{ DEFAULT_INNER_BORDER_COLOR }}</span>
            </div>
          </div>
          <div class="la-field">
            <label>内横线颜色</label>
            <div class="la-color">
              <el-color-picker :model-value="selectedBox.innerLineColor || ''" size="small" @change="setInnerLineColor" />
              <span class="la-color__swatch" :style="{ background: effInnerLine }" />
              <span class="la-color__def">默认 {{ DEFAULT_INNER_LINE_COLOR }}</span>
            </div>
          </div>
          <div class="la-hint">名称/字号/字色/外框·内边框·内横线三色保存后大屏即时生效（内容数据不变）。</div>
        </div>
        <div class="la-sec" v-else>
          <div class="la-empty"><Monitor :size="18" /> 请在画布或下方列表中选择一个数据框</div>
        </div>

        <div class="la-sec">
          <div class="la-sec__title"><LayoutGrid :size="15" /> 17 个数据框</div>
          <ul class="la-boxlist">
            <li
              v-for="key in BOX_KEYS"
              :key="key"
              class="la-boxlist__item"
              :class="{ 'is-active': key === selectedKey }"
              @click="select(key)"
            >
              <span class="la-boxlist__frame bs-frame" :class="`bs-frame--${boxes[key]?.frame || 'tech'}`" />
              <span class="la-boxlist__name">{{ boxDisplayTitle(key) }}</span>
              <span v-if="boxDisplayTitleEn(key)" class="la-boxlist__name-en">{{ boxDisplayTitleEn(key) }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.layout-admin {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--kp-bg);
  color: var(--kp-fg);
}

.la-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--kp-border);
  flex-wrap: wrap;
}
.la-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.la-tab {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--kp-panel-edge);
  background: rgba(var(--kp-panel-fill-rgb), 0.7);
  color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-panel);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  transition: all var(--kp-motion-fast);
}
.la-tab:hover { color: var(--kp-fg); border-color: var(--kp-accent); }
.la-tab.is-active {
  color: var(--kp-bg);
  border-color: var(--kp-accent);
  background: var(--kp-accent);
  font-weight: 700;
}
.la-actions { display: flex; gap: 8px; }
.la-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--kp-border);
  background: transparent;
  color: var(--kp-fg);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
}
.la-btn:hover:not(:disabled) { border-color: var(--kp-border-strong); color: var(--kp-accent); }
.la-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.la-btn--primary {
  background: var(--kp-accent);
  color: var(--kp-bg);
  border-color: var(--kp-accent);
}
.la-btn--primary:hover:not(:disabled) { color: var(--kp-bg); box-shadow: 0 0 12px var(--kp-glow); }

.la-dirty {
  padding: 4px 14px;
  font-size: var(--kp-text-xs);
  color: var(--kp-warn);
  background: var(--kp-glow-soft);
  border-bottom: 1px solid var(--kp-border);
}

.la-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
  padding: 14px;
}
.la-body.is-loading { opacity: 0.55; pointer-events: none; }

/* 画布容器：保持 16:9，等比缩放 */
.la-stage-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  aspect-ratio: 1920 / 1080;
  overflow: hidden;
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  background: var(--kp-bg-deep);
}
/* 预览舞台：复用大屏 .bs-stage 皮肤（1920×1080 固定舞台 + 等比缩放） */
.la-stage-wrap .bs-stage {
  position: absolute;
  left: 0;
  top: 0;
  margin: 0;
  width: 1920px;
  height: 1080px;
  transform-origin: top left;
  overflow: hidden;
  background: var(--kp-bg);
  color: var(--kp-fg-body);
  font-family: var(--kp-font-body);
}
/* 深空光晕（transparent → transparent，安全叠加，不遮挡 DIY 背景色） */
.la-stage-wrap .bs-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--kp-stage-halo);
}

.la-box {
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.la-box:active { cursor: grabbing; }
/* 选中高亮：用 --kp-* 令牌重绘描边与辉光 */
.la-box.is-selected {
  border-color: var(--kp-accent);
  box-shadow: 0 0 0 2px var(--kp-accent), 0 0 16px var(--kp-glow);
  z-index: 20;
}

.la-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--kp-accent);
  border: 1px solid #fff;
  border-radius: 2px;
  box-shadow: 0 0 6px var(--kp-glow);
  z-index: 12;
  touch-action: none;
}
.la-handle--n { top: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.la-handle--s { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.la-handle--e { right: -6px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
.la-handle--w { left: -6px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
.la-handle--ne { top: -6px; right: -6px; cursor: nesw-resize; }
.la-handle--nw { top: -6px; left: -6px; cursor: nwse-resize; }
.la-handle--se { bottom: -6px; right: -6px; cursor: nwse-resize; }
.la-handle--sw { bottom: -6px; left: -6px; cursor: nesw-resize; }

/* 检视面板 */
.la-inspector {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.la-sec {
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  background: rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha));
  padding: 10px 12px;
}
.la-sec__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--kp-text-sm);
  color: var(--kp-accent);
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.la-frames {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.la-frame {
  border: 1px solid var(--kp-border);
  background: transparent;
  border-radius: var(--kp-radius-sm);
  padding: 4px;
  cursor: pointer;
  transition: all var(--kp-motion-fast);
}
.la-frame:hover:not(:disabled) { border-color: var(--kp-border-strong); }
.la-frame.is-active { border-color: var(--kp-accent); box-shadow: 0 0 10px var(--kp-glow-soft); }
.la-frame:disabled { opacity: 0.4; cursor: not-allowed; }
.la-frame .bs-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  padding: 0 4px;
}
.la-frame .bs-frame i {
  font-style: normal;
  font-size: 10px;
  color: var(--kp-fg-muted);
  text-align: center;
  line-height: 1.2;
}

.la-grid4 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.la-grid4 label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  padding: 2px 6px;
}
.la-grid4 input {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--kp-fg);
  font-size: var(--kp-text-sm);
  font-family: var(--kp-font-mono);
  outline: none;
}
.la-hint {
  margin-top: 8px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
  line-height: 1.5;
}
.la-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.la-field label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.la-field input {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-bg-deep);
  color: var(--kp-fg);
  font-size: var(--kp-text-sm);
  outline: none;
}
.la-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  background: var(--kp-bg-deep);
  color: var(--kp-fg);
  font-size: var(--kp-text-sm);
  outline: none;
  cursor: pointer;
}
.la-select:focus { border-color: var(--kp-accent); box-shadow: 0 0 0 3px var(--kp-focus-ring); }
.la-field input:focus {
  border-color: var(--kp-accent);
  box-shadow: 0 0 0 3px var(--kp-focus-ring);
}
.la-color {
  display: flex;
  align-items: center;
  gap: 8px;
}
.la-color__swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--kp-border-strong);
  box-shadow: var(--kp-elev-raised);
  flex-shrink: 0;
}
.la-color__def {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
  font-family: var(--kp-font-mono);
}
.la-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-size: var(--kp-text-sm);
  color: var(--kp-fg-subtle);
}

.la-boxlist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 320px;
  overflow-y: auto;
}
.la-boxlist__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px;
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  color: var(--kp-fg-muted);
  transition: all var(--kp-motion-fast);
}
.la-boxlist__item:hover { background: var(--kp-glow-soft); color: var(--kp-fg); }
.la-boxlist__item.is-active { color: var(--kp-accent); background: var(--kp-glow-soft); }
.la-boxlist__frame {
  flex-shrink: 0;
  width: 22px;
  height: 18px;
}
.la-boxlist__name { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.la-boxlist__name-en { flex-shrink: 0; font-size: var(--kp-text-xs); letter-spacing: 0.3px; color: var(--kp-fg-muted); opacity: 0.75; }
</style>

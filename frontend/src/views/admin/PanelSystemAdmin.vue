<script setup lang="ts">
// GK-27 · 大屏面板系统管理（7 个子系统综合面板 + 自由增删 / 开关 / DIY / 拖拽）
// 数据来源：后端 Scene Schema 的 hudLayout.widgets（权威），持久化走 PUT /scene/schema（If-Match 乐观锁）。
// 与旧 BigscreenLayoutAdmin.vue（17 框 /bigscreen/layout 编辑器）解耦，互不干扰、互不破坏。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Palette,
  RotateCcw,
  Save,
  Move,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Monitor,
} from 'lucide-vue-next'
import { schemaEditorApi } from '@/api'
import { useSceneStore } from '@/stores/scene'
import { DESIGN_W, DESIGN_H } from '@/lib/bigscreen-layout'
import { SUBSYSTEMS } from '@/types/scene'
import type { FrameStyle, SceneSchemaHudLayout, SceneSchemaHudWidget } from '@/types/api'
import '@/styles/bigscreen-frames.css'

const scene = useSceneStore()

// 冻结 12 枚举（与后端 HudWidgetDto.type 一致）；管理员可在此范围内 DIY 面板类型
const WIDGET_TYPES: { type: string; label: string }[] = [
  { type: 'stat_card', label: '统计卡' },
  { type: 'gauge', label: '仪表盘' },
  { type: 'line_chart', label: '折线图' },
  { type: 'device_board', label: '设备板' },
  { type: 'alert_list', label: '告警列表' },
  { type: 'ai_panel', label: 'AI 面板' },
  { type: 'title_bar', label: '标题栏' },
  { type: 'bar_chart', label: '柱状图' },
  { type: 'status_grid', label: '状态网格' },
  { type: 'kpi_ring', label: 'KPI 环' },
  { type: 'status_light', label: '状态灯' },
  { type: 'carousel', label: '轮播' },
]
const FRAME_KEYS: FrameStyle[] = ['tech', 'wave', 'tree', 'rounded', 'bevel', 'double', 'glow', 'grid']
const FRAME_LABELS: Record<string, string> = {
  tech: '直角科技框', wave: '波浪边角框', tree: '树状分支框', rounded: '圆角极简框',
  bevel: '斜切角框', double: '双线框', glow: '发光描边框', grid: '虚线网格框',
}

// 工作副本
const widgets = ref<SceneSchemaHudWidget[]>([])
const canvas = ref<{ width: number; height: number; theme: string }>({ width: DESIGN_W, height: DESIGN_H, theme: 'tech_blue' })
const version = ref<number>(0)
const selectedId = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

const selected = computed<SceneSchemaHudWidget | null>(() =>
  selectedId.value ? widgets.value.find((w) => w.id === selectedId.value) || null : null,
)

// 缩放（设计 1920×1080 等比缩放到容器宽度）
const stageWrap = ref<HTMLElement | null>(null)
const scale = ref(1)
let ro: ResizeObserver | null = null
function updateScale() {
  if (!stageWrap.value) return
  scale.value = stageWrap.value.clientWidth / DESIGN_W
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
function clampPx(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}
// 8px 栅格吸附（项目裁定的 8px 栅格）
function snap8(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.round(v / 8) * 8
}

async function loadSchema() {
  loading.value = true
  try {
    const [doc, ver] = await Promise.all([schemaEditorApi.get(), schemaEditorApi.version()])
    const hud = (doc && doc.hudLayout) as SceneSchemaHudLayout | undefined
    if (hud) {
      canvas.value = {
        width: hud.canvas?.width ?? DESIGN_W,
        height: hud.canvas?.height ?? DESIGN_H,
        theme: hud.canvas?.theme ?? 'tech_blue',
      }
      widgets.value = (hud.widgets || []).map((w) => ({
        ...clone(w),
        enabled: typeof w.enabled === 'boolean' ? w.enabled : true,
      }))
    } else {
      widgets.value = []
    }
    version.value = ver?.version ?? 0
    dirty.value = false
  } catch (e) {
    ElMessage.error('加载大屏面板配置失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const res = await schemaEditorApi.update(
      { hudLayout: { canvas: canvas.value, widgets: clone(widgets.value) } },
      version.value,
    )
    version.value = res.version
    dirty.value = false
    ElMessage.success('面板配置已保存，大屏已同步刷新')
    // 让大屏立即重拉 schema（跨标签 schemaSync 广播也会驱动，此处兜底确保即时）
    void scene.loadSchema()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // 412 版本过期：提示重新加载后再保存
    if (/412|Precondition|version/i.test(msg)) {
      ElMessage.error('配置已被其他改动更新，请重新加载后再保存')
      await loadSchema()
    } else {
      ElMessage.error('保存失败：' + msg)
    }
  } finally {
    saving.value = false
  }
}

// ---------- 选择 / 框型 / 数值 ----------
function select(id: string) {
  selectedId.value = id
}
function setFrame(f: FrameStyle) {
  if (!selected.value) return
  selected.value.frame = f
  dirty.value = true
}
function setVal(field: 'x' | 'y' | 'w' | 'h', e: Event) {
  if (!selected.value) return
  const v = Number((e.target as HTMLInputElement).value)
  const r = selected.value.rect as [number, number, number, number]
  if (field === 'x') r[0] = clampPx(v, 0, DESIGN_W - r[2])
  else if (field === 'y') r[1] = clampPx(v, 0, DESIGN_H - r[3])
  else if (field === 'w') r[2] = clampPx(v, 40, DESIGN_W)
  else if (field === 'h') r[3] = clampPx(v, 40, DESIGN_H)
  dirty.value = true
}
function setValCommit(field: 'x' | 'y' | 'w' | 'h', e: Event) {
  if (!selected.value) return
  const v = Number((e.target as HTMLInputElement).value)
  const snapped = snap8(Number.isNaN(v) ? 0 : v)
  const r = selected.value.rect as [number, number, number, number]
  if (field === 'x') r[0] = clampPx(snapped, 0, DESIGN_W - r[2])
  else if (field === 'y') r[1] = clampPx(snapped, 0, DESIGN_H - r[3])
  else if (field === 'w') r[2] = clampPx(snapped, 40, DESIGN_W)
  else if (field === 'h') r[3] = clampPx(snapped, 40, DESIGN_H)
  ;(e.target as HTMLInputElement).value = String(
    field === 'x' ? r[0] : field === 'y' ? r[1] : field === 'w' ? r[2] : r[3],
  )
  dirty.value = true
}
function setTitle(e: Event) {
  if (!selected.value) return
  selected.value.title = (e.target as HTMLInputElement).value.trim() || ''
  dirty.value = true
}
function setType(e: Event) {
  if (!selected.value) return
  selected.value.type = (e.target as HTMLSelectElement).value
  dirty.value = true
}
function setSubsystem(e: Event) {
  if (!selected.value) return
  const v = (e.target as HTMLSelectElement).value
  selected.value.subsystem = v || undefined
  dirty.value = true
}
function toggleEnabled(w: SceneSchemaHudWidget) {
  w.enabled = !(w.enabled !== false)
  dirty.value = true
}

// ---------- 新增 / 删除 / 重置 ----------
function addWidget() {
  const id = `panel-custom-${Date.now().toString(36)}`
  // 找一个不重叠的落点（默认左上堆叠偏移，避免完全覆盖）
  const offset = (widgets.value.length % 6) * 24
  widgets.value.push({
    id,
    type: 'stat_card',
    title: '新建面板',
    rect: [snap8(20 + offset), snap8(120 + offset), 400, 280],
    z: 1,
    locked: false,
    frame: 'tech',
    subsystem: undefined,
    enabled: true,
  } as SceneSchemaHudWidget)
  selectedId.value = id
  dirty.value = true
  ElMessage.info('已新增面板，可拖拽 / 编辑后保存')
}
function removeWidget(id: string) {
  widgets.value = widgets.value.filter((w) => w.id !== id)
  if (selectedId.value === id) selectedId.value = null
  dirty.value = true
}
function resetDefault() {
  // 仅重置为后端默认 7 框：清空工作副本后请保存，由后端 materialize 兜底；此处直接本地重建 7 框语义
  void loadSchema().then(() => ElMessage.info('已重新加载后端当前配置'))
}

// ---------- 拖拽 / 缩放 ----------
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
type HandleDir = (typeof HANDLES)[number]
interface DragState {
  mode: 'move' | 'resize'
  id: string
  dir: HandleDir
  startX: number
  startY: number
  orig: [number, number, number, number]
}
let drag: DragState | null = null

function widgetById(id: string) {
  return widgets.value.find((w) => w.id === id) || null
}
function onBoxPointerDown(e: PointerEvent, id: string) {
  if ((e.target as HTMLElement).dataset.handle) return
  select(id)
  const w = widgetById(id)
  if (!w) return
  drag = { mode: 'move', id, dir: 'n', startX: e.clientX, startY: e.clientY, orig: [...(w.rect as [number, number, number, number])] }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onHandlePointerDown(e: PointerEvent, id: string, dir: HandleDir) {
  e.stopPropagation()
  select(id)
  const w = widgetById(id)
  if (!w) return
  drag = { mode: 'resize', id, dir, startX: e.clientX, startY: e.clientY, orig: [...(w.rect as [number, number, number, number])] }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onPointerMove(e: PointerEvent) {
  if (!drag) return
  const dx = (e.clientX - drag.startX) / scale.value
  const dy = (e.clientY - drag.startY) / scale.value
  const w = widgetById(drag.id)
  if (!w) return
  const r = w.rect as [number, number, number, number]
  if (drag.mode === 'move') {
    r[0] = clampPx(snap8(drag.orig[0] + dx), 0, DESIGN_W - r[2])
    r[1] = clampPx(snap8(drag.orig[1] + dy), 0, DESIGN_H - r[3])
  } else {
    let x = drag.orig[0], y = drag.orig[1], ww = drag.orig[2], hh = drag.orig[3]
    if (drag.dir.includes('e')) ww = drag.orig[2] + dx
    if (drag.dir.includes('s')) hh = drag.orig[3] + dy
    if (drag.dir.includes('w')) { x = drag.orig[0] + dx; ww = drag.orig[2] - dx }
    if (drag.dir.includes('n')) { y = drag.orig[1] + dy; hh = drag.orig[3] - dy }
    ww = clampPx(snap8(ww), 40, DESIGN_W)
    hh = clampPx(snap8(hh), 40, DESIGN_H)
    x = clampPx(snap8(x), 0, DESIGN_W - ww)
    y = clampPx(snap8(y), 0, DESIGN_H - hh)
    r[0] = x; r[1] = y; r[2] = ww; r[3] = hh
  }
  dirty.value = true
}
function onPointerUp() {
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function boxStyle(w: SceneSchemaHudWidget): Record<string, string> {
  const r = (w.rect as [number, number, number, number]) || [0, 0, 300, 200]
  return {
    position: 'absolute',
    left: `${r[0]}px`,
    top: `${r[1]}px`,
    width: `${r[2]}px`,
    height: `${r[3]}px`,
    opacity: w.enabled !== false ? '1' : '0.4',
  }
}
function widgetTitle(w: SceneSchemaHudWidget): string {
  if (w.title && w.title.trim()) return w.title.trim()
  if (w.subsystem) return scene.subsystemName(w.subsystem)
  return w.id
}

onMounted(() => {
  updateScale()
  if (stageWrap.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(updateScale)
    ro.observe(stageWrap.value)
  }
  void loadSchema()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="layout-admin">
    <div class="la-toolbar">
      <div class="la-tabs">
        <span class="la-tab is-active">大屏面板系统（{{ widgets.length }} 个）</span>
      </div>
      <div class="la-actions">
        <button class="la-btn" :disabled="saving" @click="addWidget"><Plus :size="15" /> 新增面板</button>
        <button class="la-btn" :disabled="saving" @click="resetDefault"><RotateCcw :size="15" /> 重新加载</button>
        <button class="la-btn la-btn--primary" :disabled="saving" @click="save">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div v-if="dirty" class="la-dirty">● 有未保存的改动</div>

    <div class="la-body" :class="{ 'is-loading': loading }">
      <div ref="stageWrap" class="la-stage-wrap">
        <div class="la-stage" :style="{ transform: `scale(${scale})` }">
          <div class="la-bg" aria-hidden="true" />
          <div
            v-for="w in widgets"
            :key="w.id"
            class="bs-frame la-box"
            :data-wid="w.id"
            :class="[`bs-frame--${w.frame || 'tech'}`, { 'is-selected': w.id === selectedId, 'is-disabled': w.enabled === false }]"
            :style="boxStyle(w)"
            @pointerdown="onBoxPointerDown($event, w.id)"
          >
            <span class="la-box__title">{{ widgetTitle(w) }}</span>
            <span class="la-box__badge">{{ w.enabled !== false ? '开' : '关' }}</span>
            <template v-if="w.id === selectedId">
              <span
                v-for="dir in HANDLES"
                :key="dir"
                class="la-handle"
                :class="`la-handle--${dir}`"
                :data-handle="dir"
                @pointerdown="onHandlePointerDown($event, w.id, dir)"
              />
            </template>
          </div>
        </div>
      </div>

      <aside class="la-inspector">
        <div class="la-sec" v-if="selected">
          <div class="la-sec__title"><Eye v-if="selected.enabled !== false" /><EyeOff v-else /> 面板状态</div>
          <button class="la-btn la-btn--block" @click="toggleEnabled(selected)">
            {{ selected.enabled !== false ? '关闭此面板（大屏隐藏，配置保留）' : '开启此面板（大屏显示）' }}
          </button>
        </div>

        <div class="la-sec" v-if="selected">
          <div class="la-sec__title"><Palette :size="15" /> 框型样式（8 种）</div>
          <div class="la-frames">
            <button
              v-for="f in FRAME_KEYS"
              :key="f"
              class="la-frame"
              :class="{ 'is-active': selected.frame === f }"
              @click="setFrame(f)"
            >
              <span class="bs-frame" :class="`bs-frame--${f}`"><i>{{ FRAME_LABELS[f] }}</i></span>
            </button>
          </div>
        </div>

        <div class="la-sec" v-if="selected">
          <div class="la-sec__title"><Move :size="15" /> 位置与尺寸（设计像素，8px 吸附）</div>
          <div class="la-grid4">
            <label>X<input type="number" :value="selected.rect[0]" @input="setVal('x', $event)" @change="setValCommit('x', $event)" /></label>
            <label>Y<input type="number" :value="selected.rect[1]" @input="setVal('y', $event)" @change="setValCommit('y', $event)" /></label>
            <label>宽<input type="number" :value="selected.rect[2]" @input="setVal('w', $event)" @change="setValCommit('w', $event)" /></label>
            <label>高<input type="number" :value="selected.rect[3]" @input="setVal('h', $event)" @change="setValCommit('h', $event)" /></label>
          </div>
        </div>

        <div class="la-sec" v-if="selected">
          <div class="la-sec__title"><Plus :size="15" /> 内容 DIY</div>
          <div class="la-field">
            <label>面板名称</label>
            <input type="text" :value="selected.title || ''" placeholder="留空则使用子系统/默认名" @input="setTitle($event)" />
          </div>
          <div class="la-field">
            <label>面板类型</label>
            <select class="la-select" :value="selected.type" @change="setType($event)">
              <option v-for="t in WIDGET_TYPES" :key="t.type" :value="t.type">{{ t.label }}</option>
            </select>
          </div>
          <div class="la-field">
            <label>绑定子系统</label>
            <select class="la-select" :value="selected.subsystem || ''" @change="setSubsystem($event)">
              <option value="">不绑定（通用面板）</option>
              <option v-for="s in SUBSYSTEMS" :key="s.code" :value="s.code">{{ s.name }}</option>
            </select>
          </div>
          <button class="la-btn la-btn--danger la-btn--block" @click="removeWidget(selected.id)">
            <Trash2 :size="15" /> 删除此面板
          </button>
        </div>

        <div class="la-sec" v-else>
          <div class="la-empty"><Monitor :size="18" /> 请在画布中选择一个面板，或点击「新增面板」</div>
        </div>

        <div class="la-sec">
          <div class="la-sec__title">面板清单（{{ widgets.length }}）</div>
          <ul class="la-boxlist">
            <li
              v-for="w in widgets"
              :key="w.id"
              class="la-boxlist__item"
              :class="{ 'is-active': w.id === selectedId, 'is-off': w.enabled === false }"
              @click="select(w.id)"
            >
              <span class="la-boxlist__frame bs-frame" :class="`bs-frame--${w.frame || 'tech'}`" />
              <span class="la-boxlist__name">{{ widgetTitle(w) }}</span>
              <span class="la-boxlist__sw" :class="w.enabled !== false ? 'on' : 'off'">{{ w.enabled !== false ? '开' : '关' }}</span>
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
.la-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.la-tab {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--kp-accent);
  background: var(--kp-glow-soft);
  color: var(--kp-accent);
  border-radius: var(--kp-radius-sm);
  cursor: default;
  font-size: var(--kp-text-sm);
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
.la-btn--block { width: 100%; justify-content: center; margin-bottom: 8px; }
.la-btn--primary {
  background: linear-gradient(135deg, var(--kp-accent), var(--kp-accent-secondary));
  color: var(--kp-accent-on);
  border-color: transparent;
}
.la-btn--primary:hover:not(:disabled) { color: var(--kp-accent-on); box-shadow: 0 0 14px var(--kp-glow); }
.la-btn--danger { border-color: var(--kp-danger, #e2554c); color: var(--kp-danger, #e2554c); }
.la-btn--danger:hover:not(:disabled) { background: var(--kp-danger, #e2554c); color: #fff; }

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

.la-stage-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  aspect-ratio: 1920 / 1080;
  overflow: hidden;
  border: 1px solid var(--kp-border-strong);
  border-radius: var(--kp-radius-md);
  background: var(--kp-bg-deep);
}
.la-stage {
  position: absolute;
  top: 0; left: 0;
  width: 1920px; height: 1080px;
  transform-origin: top left;
}
.la-bg {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(circle at 50% 40%, rgba(var(--kp-accent-rgb), 0.06), transparent 45%),
    linear-gradient(180deg, #04101f, #020a14);
}
.la-bg::after {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(var(--kp-accent-rgb), 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--kp-accent-rgb), 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 50% 45%, #000 55%, transparent 92%);
  -webkit-mask-image: radial-gradient(circle at 50% 45%, #000 55%, transparent 92%);
}

.la-box {
  cursor: grab;
  touch-action: none;
  user-select: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: visible;
}
.la-box:active { cursor: grabbing; }
.la-box.is-selected { outline: 2px dashed var(--kp-accent); outline-offset: 2px; z-index: 10; }
.la-box.is-disabled { filter: grayscale(0.6); }
.la-box__title {
  margin-top: 6px;
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--kp-fg);
  text-shadow: 0 0 8px var(--kp-glow);
  pointer-events: none;
}
.la-box__badge {
  position: absolute;
  top: 4px; right: 6px;
  font-size: 10px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid currentColor;
  color: var(--kp-fg-muted);
  pointer-events: none;
}

.la-handle {
  position: absolute;
  width: 12px; height: 12px;
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
.la-handle--sw { bottom: -6px; left: -6px; cursor: nwse-resize; }

.la-inspector {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.la-sec {
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  background: var(--kp-surface);
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
.la-frames { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.la-frame {
  border: 1px solid var(--kp-border);
  background: transparent;
  border-radius: var(--kp-radius-sm);
  padding: 4px;
  cursor: pointer;
  transition: all var(--kp-motion-fast);
}
.la-frame:hover { border-color: var(--kp-border-strong); }
.la-frame.is-active { border-color: var(--kp-accent); box-shadow: 0 0 10px var(--kp-glow-soft); }
.la-frame .bs-frame { display: flex; align-items: center; justify-content: center; height: 46px; padding: 0 4px; }
.la-frame .bs-frame i { font-style: normal; font-size: 10px; color: var(--kp-fg-muted); text-align: center; line-height: 1.2; }

.la-grid4 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.la-grid4 label {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--kp-text-xs); color: var(--kp-fg-muted);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  padding: 2px 6px;
}
.la-grid4 input {
  flex: 1; width: 100%; min-width: 0;
  border: none; background: transparent; color: var(--kp-fg);
  font-size: var(--kp-text-sm); font-family: var(--kp-font-mono); outline: none;
}
.la-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.la-field label { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.la-field input, .la-select {
  height: 30px; padding: 0 8px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-bg-deep); color: var(--kp-fg);
  font-size: var(--kp-text-sm); outline: none; cursor: pointer;
}
.la-field input:focus, .la-select:focus { border-color: var(--kp-accent); box-shadow: 0 0 0 3px var(--kp-focus-ring); }

.la-empty {
  display: flex; align-items: center; gap: 8px; padding: 16px;
  font-size: var(--kp-text-sm); color: var(--kp-fg-subtle);
}
.la-boxlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; max-height: 320px; overflow-y: auto; }
.la-boxlist__item {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 8px;
  border-radius: var(--kp-radius-sm);
  cursor: pointer; font-size: var(--kp-text-sm); color: var(--kp-fg-muted);
  transition: all var(--kp-motion-fast);
}
.la-boxlist__item:hover { background: var(--kp-glow-soft); color: var(--kp-fg); }
.la-boxlist__item.is-active { color: var(--kp-accent); background: var(--kp-glow-soft); }
.la-boxlist__item.is-off { opacity: 0.6; }
.la-boxlist__frame { flex-shrink: 0; width: 22px; height: 18px; }
.la-boxlist__name { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.la-boxlist__sw { flex-shrink: 0; font-size: var(--kp-text-xs); padding: 0 6px; border-radius: 999px; border: 1px solid currentColor; }
.la-boxlist__sw.on { color: #2ee6a6; }
.la-boxlist__sw.off { color: var(--kp-fg-subtle); }
</style>

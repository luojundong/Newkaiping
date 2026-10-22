<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Square, Palette, Save, RotateCcw, Box, Globe2 } from 'lucide-vue-next'
import { sceneApi, buildingApi, deviceApi, alarmApi, energyApi, bigscreenApi } from '@/api'
import type { Building, BuildingDisplay, SubsystemCode, SceneMarker } from '@/types/api'
import { DEFAULT_BUILDING_DISPLAY } from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'
import BuildingDisplay3D from './BuildingDisplay3D.vue'
import { useSceneStore } from '@/stores/scene'

const sceneStore = useSceneStore()

// ---------- 配置表单 ----------
const form = reactive<BuildingDisplay>({ ...DEFAULT_BUILDING_DISPLAY })
const saving = ref(false)
const dirty = ref(false)

// 楼层 3D 模型视图开关（按楼栋；其余楼后台按需开启，有 GLB 时弹窗才会用 3D）
function setFloorModel3d(id: string, val: boolean) {
  const map = { ...(form.floor_model_3d_by_building || {}) }
  if (val) map[id] = true
  else delete map[id]
  form.floor_model_3d_by_building = map
  markDirty()
}

function markDirty() {
  dirty.value = true
}
function resetForm() {
  Object.assign(form, { ...DEFAULT_BUILDING_DISPLAY, per_building: {} })
  // 清除拖动暂存（仅 UI 草稿，不落盘）
  Object.keys(draftAnchors).forEach((k) => delete draftAnchors[k])
  dirty.value = false
}

// ---------- 楼栋与锚点（用于 2D 预览定位） ----------
const buildings = ref<Building[]>([])
const anchors = ref<Array<{ building_id: string; position: { x: number; y: number; z: number } }>>([])

async function loadBuildings() {
  try {
    const res = await buildingApi.list()
    buildings.value = res.items
  } catch {
    buildings.value = []
  }
}
// 3D 模型 URL（从场景配置加载，驱动 BuildingDisplay3D 加载 .glb）
const modelUrl = ref<string | null>(null)

async function loadConfig() {
  try {
    const cfg = await sceneApi.config()
    if (cfg?.building_anchors) anchors.value = cfg.building_anchors
    if (cfg?.model_url) modelUrl.value = cfg.model_url
  } catch { /* ignore */ }
}
async function loadDisplay() {
  try {
    const bd = await sceneApi.getBuildingDisplay()
    if (bd) {
      // 服务端旧配置可能缺 floor_model_3d_by_building 字段 → 回退前端默认（6 号楼默认开）；
      // 已显式存了该字段则尊重服务端值（含用户后台开关结果）。保证后台开关 UI 与默认一致。
      Object.assign(form, {
        ...bd,
        floor_model_3d_by_building:
          bd.floor_model_3d_by_building ?? { ...DEFAULT_BUILDING_DISPLAY.floor_model_3d_by_building },
      })
    }
  } catch { /* ignore */ }
}

// 已保存锚点映射：building_id -> {x,y,z}。传给 3D 子视图，使其渲染时优先用已保存坐标，
// 而非只在 draftAnchors 里找——否则保存后父组件清空 draftAnchors，3D 视图会回退到初始 (0,0,0)。
const anchorMap = computed<Record<string, { x: number; y: number; z: number }>>(() => {
  const m: Record<string, { x: number; y: number; z: number }> = {}
  anchors.value.forEach((a) => {
    if (a?.building_id && a?.position) m[a.building_id] = a.position
  })
  return m
})

// ---------- 2D 预览（楼栋框框区域 + 背景透明度 + 拖动定位） ----------
const PX_PER_M = 1.6
const FOOTPRINT_MIN = 8

function footprintSideM(b: Building, sizeScale: number): number {
  const floors = Math.max(b.floors || 1, 1)
  const side = Math.sqrt(Math.max(b.gross_area, 1) / floors)
  return Math.max(side, FOOTPRINT_MIN) * (sizeScale || 1)
}

const PREVIEW = 560
const MARGIN = 60
const inner = PREVIEW - MARGIN * 2

// 锚点初始范围（基于后端 building_anchors，拖动只改变单楼位置，避免整图重排抖动）
// E4 修复：当锚点未初始化（全部 (0,0,0)）时 maxX-minX=0，旧逻辑 Math.max(...,1) 退化为 span=1，
// 导致 560px 画布被映射到 1 单位世界跨度，鼠标微动即把楼栋坐标推到极大/极小值（拖拽炸开）。
// 改为：仅当真实跨度 ≤ 1（无有效分布）时回退到安全默认跨度 SAFE_SPAN，避免坐标爆炸。
const SAFE_SPAN = 200
const bounds = computed(() => {
  const pts = anchors.value.map((a) => a.position)
  if (!pts.length) return { minX: -100, spanX: SAFE_SPAN, minZ: -100, spanZ: SAFE_SPAN }
  const xs = pts.map((p) => p.x)
  const zs = pts.map((p) => p.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  return {
    minX,
    spanX: spanX > 1 ? spanX : SAFE_SPAN,
    minZ,
    spanZ: spanZ > 1 ? spanZ : SAFE_SPAN,
  }
})

// 拖动暂存：key=building_id → { x, y, z }（锚点坐标空间，保存时写回 building_anchors）
const draftAnchors = reactive<Record<string, { x: number; y: number; z: number }>>({})
const svgRef = ref<SVGSVGElement | null>(null)
const draggingId = ref<string | null>(null)
let dragCursor: { x: number; z: number } | null = null
let movedDuringDrag = false
let suppressNextClick = false

// 视图切换：2D 俯视（快速布局） / 3D .glb 模型（精确放置 + 自由拖动）
const viewMode = ref<'2d' | '3d'>('2d')
// 楼栋 3D box 水平边长（按基底面积 = 总建筑面积 / 层数 推导，与 2D 预览同源）
function boxSizeOf(b: Building): number {
  const floors = Math.max(1, b.floors || 1)
  const area = Math.max(0, b.gross_area || 0)
  const side = Math.sqrt(area / floors) || 24
  return Math.max(8, Math.round(side * form.size_scale))
}
// 3D 拖动回调：把 emit 出来的 position 写入草稿，触发 markDirty
function on3DDrag(payload: { buildingId: string; position: { x: number; y: number; z: number } }) {
  draftAnchors[payload.buildingId] = { ...payload.position }
  if (selectedBuilding.value !== payload.buildingId) {
    selectBuilding(payload.buildingId)
  }
  markDirty()
}

// 选中楼栋（3D 视图点击 → 同步本地 selectedBuilding + store）
function selectBuilding(id: string | null) {
  selectedBuilding.value = id || ''
  sceneStore.selectBuilding(id)
}

function initialAnchorOf(id: string) {
  const a = anchors.value.find((x) => x.building_id === id)
  return { x: a?.position?.x ?? 0, y: a?.position?.y ?? 0, z: a?.position?.z ?? 0 }
}
// 选中楼栋在模型中的坐标（优先草稿，否则后端 anchors）
function posOf(axis: 'x' | 'y' | 'z'): number {
  const id = selectedBuilding.value
  if (!id) return 0
  const d = draftAnchors[id]
  if (d && typeof (d as any)[axis] === 'number') return (d as any)[axis]
  const a = anchors.value.find((x) => x.building_id === id)?.position
  return a ? (a as any)[axis] ?? 0 : 0
}
function setPos(axis: 'x' | 'y' | 'z', e: Event) {
  const id = selectedBuilding.value
  if (!id) return
  const v = Number((e.target as HTMLInputElement).value)
  const base = draftAnchors[id] || initialAnchorOf(id)
  draftAnchors[id] = { ...base, [axis]: Number.isNaN(v) ? 0 : v }
  markDirty()
}

// 鼠标位置 → 锚点坐标空间
function pointerToAnchor(e: PointerEvent): { x: number; z: number } | null {
  const svg = svgRef.value
  if (!svg) return null
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  const b = bounds.value
  return {
    x: b.minX + ((pt.x - MARGIN) / inner) * b.spanX,
    z: b.minZ + ((pt.z - MARGIN) / inner) * b.spanZ,
  }
}

function onDragStart(b: Building, e: PointerEvent) {
  e.preventDefault()
  draggingId.value = b.id
  selectedBuilding.value = b.id
  dragCursor = pointerToAnchor(e)
  movedDuringDrag = false
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
}

function onDragMove(e: PointerEvent) {
  if (!draggingId.value || !dragCursor) return
  const cur = pointerToAnchor(e)
  if (!cur) return
  const prev = draftAnchors[draggingId.value] ?? initialAnchorOf(draggingId.value)
  draftAnchors[draggingId.value] = { x: prev.x + (cur.x - dragCursor.x), y: prev.y, z: prev.z + (cur.z - dragCursor.z) }
  dragCursor = cur
  movedDuringDrag = true
  markDirty()
}

function onDragEnd() {
  if (movedDuringDrag) suppressNextClick = true
  draggingId.value = null
  dragCursor = null
}

function onClickBuilding(b: Building) {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
  checkLinkage(b)
}

const layout = computed(() => {
  const pts = buildings.value.map((b) => {
    const a = anchors.value.find((x) => x.building_id === b.id)
    const base = { x: a?.position?.x ?? 0, z: a?.position?.z ?? 0 }
    const d = draftAnchors[b.id]
    return { b, x: d?.x ?? base.x, z: d?.z ?? base.z }
  })
  if (!pts.length) return []
  const b = bounds.value
  return pts.map((p) => {
    const nx = (p.x - b.minX) / b.spanX
    const nz = (p.z - b.minZ) / b.spanZ
    const cx = MARGIN + nx * inner
    const cz = MARGIN + nz * inner
    const sidePx = footprintSideM(p.b, form.size_scale) * PX_PER_M
    return {
      id: p.b.id,
      name: p.b.name,
      cx,
      cz,
      w: sidePx,
      h: sidePx,
      selected: p.b.id === selectedBuilding.value,
      dragged: !!draftAnchors[p.b.id],
    }
  })
})

// 选中楼栋的独立透明度（未设置时跟随全局形态默认）
const selectedOpacity = computed<number>({
  get: () => {
    const id = selectedBuilding.value
    if (!id) return form.box_opacity
    const per = form.per_building?.[id]?.background_opacity
    if (typeof per === 'number') return per
    return form.mode === 'plane' ? form.plane_opacity : form.box_opacity
  },
  set: (v: number) => {
    const id = selectedBuilding.value
    if (!id) return
    if (!form.per_building) form.per_building = {}
    if (!form.per_building[id]) form.per_building[id] = {}
    form.per_building[id]!.background_opacity = v
    markDirty()
  },
})
// 任一楼的透明度（2D 预览渲染用）：per_building 优先，否则跟随当前形态默认
function opacityOf(id: string): number {
  const per = form.per_building?.[id]?.background_opacity
  if (typeof per === 'number') return per
  return form.mode === 'plane' ? form.plane_opacity : form.box_opacity
}
const hasPerOpacity = computed(() => {
  const id = selectedBuilding.value
  return !!(id && typeof form.per_building?.[id]?.background_opacity === 'number')
})
function clearPerOpacity() {
  const id = selectedBuilding.value
  if (id && form.per_building) {
    delete form.per_building[id]
    markDirty()
  }
}

// ---------- 数据联动确认 ----------
const selectedBuilding = ref<string>('')
const linkageDrawer = ref(false)
const linkageLoading = ref(false)
const linkage = reactive<{
  subsystems: string[]
  deviceCount: number
  alarms: Array<{ id: string; title: string; level: string }>
  energy: Record<string, unknown> | null
  panels: Record<string, unknown> | null
}>({
  subsystems: [],
  deviceCount: 0,
  alarms: [],
  energy: null,
  panels: null,
})

const selectedBuildingName = computed(
  () => buildings.value.find((b) => b.id === selectedBuilding.value)?.name || selectedBuilding.value,
)

// ---------- 楼栋区域热点（每栋楼可独立划区域） ----------
const areaEditMode = ref(false)
const areaMarkers = ref<SceneMarker[]>([])
const building3dRef = ref<InstanceType<typeof BuildingDisplay3D> | null>(null)
const selectedAreaHighlightId = ref<string | null>(null)

const areaMarkersOfSelected = computed(() =>
  areaMarkers.value.filter((m) => m.building_id === selectedBuilding.value && m.shape === 'area'),
)
const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.id, label: b.name })))
const subsystemOptions = computed(() => SUBSYSTEMS.map((s) => ({ value: s.code, label: s.name })))

const areaDialogVisible = ref(false)
const pendingAreaPoints = ref<{ x: number; y: number; z: number }[]>([])
const editingArea = reactive<Partial<SceneMarker>>({
  id: '',
  building_id: '',
  building: '',
  floor: 1,
  label: '',
  visible: true,
  color: '#00ccff',
  shape: 'area',
  area_points: [],
  link: null,
  params: undefined,
})
const areaLinkType = ref<'none' | 'url' | 'internal'>('none')
const areaLinkUrl = ref('')
const areaLinkTarget = ref('')
const areaParamRows = ref<{ key: string; val: string }[]>([])

async function loadAreaMarkers() {
  try {
    const all = await sceneApi.markers()
    areaMarkers.value = (all || []).filter((m) => m.shape === 'area')
  } catch {
    areaMarkers.value = []
  }
}
function toggleAreaEdit() {
  areaEditMode.value = !areaEditMode.value
  if (areaEditMode.value) building3dRef.value?.clearDraw()
  else selectedAreaHighlightId.value = null
}
function onAreaDrawn(points: { x: number; y: number; z: number }[]) {
  pendingAreaPoints.value = points
  editingArea.id = ''
  editingArea.building_id = selectedBuilding.value
  editingArea.building = selectedBuildingName.value
  editingArea.floor = 1
  editingArea.label = `${selectedBuildingName.value || '楼栋'}区域${(areaMarkersOfSelected.value.length || 0) + 1}`
  editingArea.visible = true
  editingArea.color = '#00ccff'
  editingArea.shape = 'area'
  editingArea.area_points = points.map((p) => ({ ...p }))
  editingArea.link = null
  editingArea.params = undefined
  areaLinkType.value = 'none'
  areaLinkUrl.value = ''
  areaLinkTarget.value = ''
  areaParamRows.value = []
  areaDialogVisible.value = true
}
function onAreaClick(payload: any) {
  const parts = [`区域：${payload.label}`]
  if (payload.link?.type === 'url') parts.push(`外链：${payload.link.url}`)
  else if (payload.link?.type === 'internal') parts.push(`内跳：${payload.link.target}`)
  if (payload.params && Object.keys(payload.params).length) parts.push(`参数：${JSON.stringify(payload.params)}`)
  ElMessage.info(parts.join(' ｜ '))
}
async function saveArea() {
  if (!editingArea.label) {
    ElMessage.warning('请输入区域名称')
    return
  }
  const body = {
    ...editingArea,
    building_id: selectedBuilding.value,
    building: selectedBuildingName.value,
    shape: 'area' as const,
  }
  if (areaLinkType.value === 'url') body.link = { type: 'url', url: areaLinkUrl.value.trim() || undefined }
  else if (areaLinkType.value === 'internal') body.link = { type: 'internal', target: areaLinkTarget.value || undefined }
  else body.link = null
  const params: Record<string, string> = {}
  areaParamRows.value.forEach((r) => {
    const k = r.key.trim()
    if (k) params[k] = r.val
  })
  body.params = Object.keys(params).length ? params : undefined
  try {
    if (editingArea.id) await sceneApi.updateMarker(editingArea.id, body)
    else await sceneApi.createMarker(body)
    ElMessage.success('楼栋区域热点已保存')
    areaDialogVisible.value = false
    areaEditMode.value = false
    await loadAreaMarkers()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}
function openEditArea(m: SceneMarker) {
  editingArea.id = m.id
  editingArea.building_id = m.building_id
  editingArea.building = m.building || ''
  editingArea.floor = m.floor || 1
  editingArea.label = m.label
  editingArea.visible = m.visible !== false
  editingArea.color = m.color || '#00ccff'
  editingArea.shape = 'area'
  editingArea.area_points = (m.area_points || []).map((p) => ({ ...p }))
  if (m.link?.type === 'url') {
    areaLinkType.value = 'url'
    areaLinkUrl.value = m.link.url || ''
    areaLinkTarget.value = ''
  } else if (m.link?.type === 'internal') {
    areaLinkType.value = 'internal'
    areaLinkTarget.value = m.link.target || ''
    areaLinkUrl.value = ''
  } else {
    areaLinkType.value = 'none'
    areaLinkUrl.value = ''
    areaLinkTarget.value = ''
  }
  areaParamRows.value = m.params ? Object.entries(m.params).map(([k, v]) => ({ key: k, val: v })) : []
  areaDialogVisible.value = true
}
async function deleteArea(m: SceneMarker) {
  try {
    await ElMessageBox.confirm(`确定删除区域「${m.label}」吗？`, '提示', { type: 'warning' })
    await sceneApi.deleteMarker(m.id)
    ElMessage.success('区域已删除')
    await loadAreaMarkers()
  } catch { /* cancel */ }
}
function highlightArea(m: SceneMarker) {
  selectedAreaHighlightId.value = m.id
}

async function checkLinkage(b: Building) {
  selectedBuilding.value = b.id
  linkageDrawer.value = true
  linkageLoading.value = true
  linkage.subsystems = []
  linkage.deviceCount = 0
  linkage.alarms = []
  linkage.energy = null
  linkage.panels = null
  try {
    const [subRes, devRes, alarmRes, energyRes, panelRes] = await Promise.allSettled([
      buildingApi.subsystems(b.id),
      deviceApi.list({ building_id: b.id, page: 1, limit: 1 }),
      alarmApi.list({ building_id: b.id, status: 'active' }),
      energyApi.summary({ building_id: b.id }),
      bigscreenApi.panels({ building_id: b.id }),
    ])
    if (subRes.status === 'fulfilled') {
      linkage.subsystems = (subRes.value.items || [])
        .filter((s: { enabled: boolean; subsystem_code: string }) => s.enabled)
        .map((s: { subsystem_code: string }) => s.subsystem_code) as string[]
    }
    if (devRes.status === 'fulfilled') {
      linkage.deviceCount = (devRes.value as { total?: number; items?: unknown[] }).total ?? (devRes.value as { items?: unknown[] }).items?.length ?? 0
    }
    if (alarmRes.status === 'fulfilled') {
      linkage.alarms = (alarmRes.value.items || []).slice(0, 8).map((a: { id: string; title: string; level: string }) => ({
        id: a.id,
        title: a.title,
        level: a.level,
      }))
    }
    if (energyRes.status === 'fulfilled') linkage.energy = energyRes.value as unknown as Record<string, unknown>
    if (panelRes.status === 'fulfilled') linkage.panels = panelRes.value as unknown as Record<string, unknown>
  } catch {
    /* ignore */
  } finally {
    linkageLoading.value = false
  }
}

// ---------- 保存 ----------
async function save() {
  saving.value = true
  try {
    // 1) 楼栋显示配置（含 box/plane 默认透明度 + 按楼栋独立覆盖 per_building）
    await sceneApi.setBuildingDisplay({ ...form })
    // 2) 位置：如有拖动，把草稿合并进 anchors 并批量写入
    const draftIds = Object.keys(draftAnchors)
    if (draftIds.length) {
      const merged = anchors.value.map((a) => {
        const d = draftAnchors[a.building_id]
        return d ? { ...a, position: { ...a.position, x: d.x, y: d.y, z: d.z } } : a
      })
      await sceneApi.setAnchors(merged)
      anchors.value = merged
      draftIds.forEach((k) => delete draftAnchors[k])
    }
    dirty.value = false
    ElMessage.success('楼栋显示已保存，大屏即时生效')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadBuildings(), loadConfig(), loadDisplay()])
  await loadAreaMarkers()
})

// 切换选中楼栋时退出区域绘制态，避免跨楼误操作
watch(selectedBuilding, () => {
  areaEditMode.value = false
  selectedAreaHighlightId.value = null
})
</script>

<template>
  <div class="admin-page bd-admin">
    <!-- 工具栏：标题 + 操作（与 DIY 编辑器页面一致） -->
    <div class="bd-toolbar">
      <div class="bd-toolbar__left">
        <Square :size="18" class="bd-toolbar__icon" />
        <span class="bd-toolbar__title">楼栋显示 DIY</span>
        <span class="bd-toolbar__desc">替代 3D 立柱，用框框区域展示楼栋，可设背景透明度</span>
      </div>
      <div class="bd-toolbar__actions">
        <div class="bd-view-switch" role="tablist">
          <button
            class="bd-view-switch__btn"
            :class="{ 'is-active': viewMode === '2d' }"
            role="tab"
            @click="viewMode = '2d'"
          >
            <Box :size="14" /> 2D 俯视
          </button>
          <button
            class="bd-view-switch__btn"
            :class="{ 'is-active': viewMode === '3d' }"
            role="tab"
            @click="viewMode = '3d'"
          >
            <Globe2 :size="14" /> 3D 模型
          </button>
        </div>
        <button class="bd-btn" @click="resetForm">
          <RotateCcw :size="15" /> 恢复默认
        </button>
        <button class="bd-btn bd-btn--primary" :disabled="saving || !dirty" @click="save">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存并应用' }}
        </button>
      </div>
    </div>

    <div v-if="dirty" class="bd-dirty">● 有未保存的改动</div>

    <div class="bd-body">
      <!-- 左：配置 -->
      <aside class="bd-sec">
        <div class="bd-sec__title"><Palette :size="15" /> 楼栋显示配置</div>

        <el-form label-width="96px" class="bd-form">
          <el-form-item label="显示形态">
            <el-radio-group v-model="form.mode" @change="markDirty">
              <el-radio value="box">立体方框</el-radio>
              <el-radio value="plane">贴地平面</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="方框透明度">
            <el-slider
              v-model="form.box_opacity"
              :min="0"
              :max="1"
              :step="0.05"
              :format-tooltip="(v: number) => `${Math.round(v * 100)}%`"
              style="width: 190px"
              @input="markDirty"
            />
            <span class="bd-val">{{ Math.round(form.box_opacity * 100) }}%</span>
          </el-form-item>

          <el-form-item label="平面透明度">
            <el-slider
              v-model="form.plane_opacity"
              :min="0"
              :max="1"
              :step="0.05"
              :format-tooltip="(v: number) => `${Math.round(v * 100)}%`"
              style="width: 190px"
              @input="markDirty"
            />
            <span class="bd-val">{{ Math.round(form.plane_opacity * 100) }}%</span>
          </el-form-item>

          <el-form-item label="显示边框">
            <el-switch v-model="form.show_border" @change="markDirty" />
          </el-form-item>

          <el-form-item label="边框颜色">
            <el-color-picker v-model="form.border_color" @change="markDirty" />
            <span class="bd-hex">{{ form.border_color }}</span>
          </el-form-item>

          <el-form-item label="填充颜色">
            <el-color-picker v-model="form.fill_color" @change="markDirty" />
            <span class="bd-hex">{{ form.fill_color }}</span>
          </el-form-item>

          <el-form-item label="尺寸比例">
            <el-slider
              v-model="form.size_scale"
              :min="0.3"
              :max="3"
              :step="0.1"
              :format-tooltip="(v: number) => `${v.toFixed(1)}×`"
              style="width: 190px"
              @input="markDirty"
            />
            <span class="bd-val">{{ form.size_scale.toFixed(1) }}×</span>
          </el-form-item>

          <el-form-item label="楼栋名称">
            <el-switch v-model="form.show_labels" @change="markDirty" />
          </el-form-item>

          <el-divider content-position="left">楼层 3D 模型视图</el-divider>
          <p class="bd-hint bd-hint--sm">
            开启后，该楼栋钻取弹窗用「楼层 3D 模型结构」取代 2D 平面示意图（需对应楼层 GLB 已就位）。
          </p>
          <el-form-item
            v-for="b in sceneStore.buildings"
            :key="b.id"
            :label="`${b.name}`"
            class="bd-fm3d-item"
          >
            <el-switch
              :model-value="!!form.floor_model_3d_by_building?.[b.id]"
              @change="(v: boolean) => setFloorModel3d(b.id, v)"
            />
          </el-form-item>
        </el-form>

        <p class="bd-hint">保存后，大屏（含其他标签页）会即时刷新框框区域与透明度。</p>
      </aside>

      <!-- 右：2D 预览（拖动定位 + 点击校验数据联动） -->
      <div class="bd-stage-wrap">
        <div v-if="viewMode === '2d'" class="bd-stage">
          <svg
            ref="svgRef"
            :viewBox="`0 0 ${PREVIEW} ${PREVIEW}`"
            class="bd-svg"
            preserveAspectRatio="xMidYMid meet"
            @pointermove="onDragMove"
            @pointerup="onDragEnd"
            @pointercancel="onDragEnd"
          >
            <!-- 网格底 -->
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path class="bd-grid" d="M 40 0 L 0 0 0 40" fill="none" stroke-width="1" />
              </pattern>
            </defs>
            <rect :width="PREVIEW" :height="PREVIEW" fill="url(#grid)" />

            <g
              v-for="b in layout"
              :key="b.id"
              :data-id="b.id"
              class="bd-box"
              :class="{ 'is-selected': b.selected, 'is-dragging': draggingId === b.id, 'is-dragged': b.dragged }"
              @pointerdown="onDragStart(buildings.find((x) => x.id === b.id)!, $event)"
              @click.stop="onClickBuilding(buildings.find((x) => x.id === b.id)!)"
            >
              <rect
                :x="b.cx - b.w / 2"
                :y="b.cz - b.h / 2"
                :width="b.w"
                :height="b.h"
                :rx="form.mode === 'plane' ? 2 : 6"
                :fill="form.fill_color"
                :fill-opacity="form.mode === 'plane' ? Math.max(opacityOf(b.id), 0.18) : opacityOf(b.id)"
                :stroke="form.border_color"
                :stroke-opacity="b.selected ? 1 : 0.7"
                :stroke-width="b.selected ? 3 : form.show_border ? 1.5 : 0"
                :stroke-dasharray="form.mode === 'plane' ? '4 3' : 'none'"
              />
              <!-- 选中内描边 -->
              <rect
                v-if="b.selected"
                class="bd-inner"
                :x="b.cx - b.w / 2 + 4"
                :y="b.cz - b.h / 2 + 4"
                :width="b.w - 8"
                :height="b.h - 8"
              />
              <text
                v-if="form.show_labels"
                :x="b.cx"
                :y="b.cz + 4"
                text-anchor="middle"
                class="bd-label"
                :class="{ 'is-selected': b.selected }"
              >
                {{ b.name }}
              </text>
            </g>
          </svg>
        </div>

        <!-- 选中楼栋：位置/透明度微调 -->
        <div v-if="selectedBuilding" class="bd-panel">
          <div class="bd-panel__head">
            <span class="bd-panel__title">楼栋：{{ selectedBuildingName }}</span>
            <span class="bd-panel__tag" :class="{ 'is-custom': hasPerOpacity }">
              {{ hasPerOpacity ? '已单独设置透明度' : '跟随全局默认' }}
            </span>
          </div>
          <div class="bd-panel__row">
            <span class="bd-panel__label">该楼透明度</span>
            <el-slider
              v-model="selectedOpacity"
              :min="0"
              :max="1"
              :step="0.05"
              :format-tooltip="(v: number) => `${Math.round(v * 100)}%`"
              style="width: 200px"
            />
            <span class="bd-val">{{ Math.round(selectedOpacity * 100) }}%</span>
            <button
              v-if="hasPerOpacity"
              class="bd-btn bd-btn--mini"
              title="清除该楼自定义透明度，恢复跟随全局"
              @click="clearPerOpacity"
            >
              <RotateCcw :size="13" /> 清除自定义
            </button>
          </div>
          <p class="bd-panel__hint">拖动上方框框可调整该楼位置（保存后大屏 3D 同步移动）。</p>
          <div class="bd-pos">
            <span class="bd-panel__label">模型坐标</span>
            <label class="bd-pos__field">X<input type="number" step="1" :value="posOf('x')" @input="setPos('x', $event)" /></label>
            <label class="bd-pos__field">Y<input type="number" step="1" :value="posOf('y')" @input="setPos('y', $event)" /></label>
            <label class="bd-pos__field">Z<input type="number" step="1" :value="posOf('z')" @input="setPos('z', $event)" /></label>
          </div>
          <p class="bd-panel__hint">可直接输入 X / Y / Z 精确坐标（模型局部坐标，单位与楼栋锚点一致）。</p>
        </div>

        <!-- 楼栋区域热点（每栋楼可独立划区域） -->
        <div v-if="selectedBuilding" class="bd-area">
          <div class="bd-area__head">
            <span class="bd-area__title">楼栋区域热点 · {{ selectedBuildingName }}</span>
            <div class="bd-area__actions">
              <el-button size="small" :type="areaEditMode ? 'warning' : 'primary'" @click="toggleAreaEdit">
                {{ areaEditMode ? '退出绘制' : '绘制新区域' }}
              </el-button>
              <template v-if="areaEditMode">
                <el-button size="small" type="success" @click="building3dRef?.finishDraw()">完成描边</el-button>
                <el-button size="small" @click="building3dRef?.clearDraw()">清除</el-button>
              </template>
            </div>
          </div>
          <p v-if="areaEditMode" class="bd-area__hint">
            在右侧 3D 模型中点击表面依次描点（≥3 点），再点「完成描边」生成区域并配置跳转/参数。
          </p>
          <div v-if="!areaMarkersOfSelected.length" class="bd-area__empty">该楼暂无区域热点，点击「绘制新区域」开始。</div>
          <div v-else class="bd-area__list">
            <div v-for="m in areaMarkersOfSelected" :key="m.id" class="bd-area__item">
              <div class="bd-area__item-main">
                <span class="bd-area__name">{{ m.label }}</span>
                <span class="bd-area__meta">
                  <template v-if="m.link?.type === 'url'">外链</template>
                  <template v-else-if="m.link?.type === 'internal'">内跳:{{ m.link.target }}</template>
                  <template v-else>无跳转</template>
                  · {{ m.params && Object.keys(m.params).length ? Object.keys(m.params).length + ' 参数' : '无参数' }}
                </span>
              </div>
              <div class="bd-area__item-actions">
                <el-button size="small" text type="primary" @click="highlightArea(m)">高亮</el-button>
                <el-button size="small" text type="primary" @click="openEditArea(m)">编辑</el-button>
                <el-button size="small" text type="danger" @click="deleteArea(m)">删除</el-button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="viewMode === '3d'" class="bd3d-host">
          <BuildingDisplay3D
            ref="building3dRef"
            :model-url="modelUrl"
            :buildings="buildings"
            :selected-building-id="selectedBuilding"
            :anchors="anchorMap"
            :draft-anchors="draftAnchors"
            :box-size-of="boxSizeOf"
            :edit-mode="areaEditMode ? 'area' : 'drag'"
            :area-markers="areaMarkers"
            :selected-area-id="selectedAreaHighlightId"
            @select="selectBuilding"
            @drag="on3DDrag"
            @area="onAreaDrawn"
            @area-click="onAreaClick"
          />
        </div>

        <p v-if="viewMode === '2d'" class="bd-hint bd-canvas-hint">提示：框框大小按楼栋真实「基底面积 = 总建筑面积 / 层数」推导；拖动可自定义位置，点击框可校验该楼数据联动。</p>
        <p v-else class="bd-hint bd-canvas-hint">提示：左键拖动楼栋定位（X/Z，松手即时写入草稿）；右键/中键旋转视角，滚轮缩放；关闭的楼栋以暗灰显示。右侧 X/Y/Z 输入框可精确微调。</p>
      </div>
    </div>

    <!-- 数据联动确认抽屉 -->
    <el-drawer v-model="linkageDrawer" :title="`数据联动校验 · ${selectedBuildingName}`" size="440px">
      <div v-loading="linkageLoading" class="bd-drawer-body">
        <template v-if="!linkageLoading">
          <section class="lk-block">
            <h4 class="lk-title">启用子系统</h4>
            <div class="lk-chips">
              <el-tag v-for="s in linkage.subsystems" :key="s" size="small" type="success">{{ s }}</el-tag>
              <span v-if="!linkage.subsystems.length" class="lk-empty">未配置子系统</span>
            </div>
          </section>

          <section class="lk-block">
            <h4 class="lk-title">设备联动</h4>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="楼栋设备总数">{{ linkage.deviceCount }}</el-descriptions-item>
            </el-descriptions>
          </section>

          <section class="lk-block">
            <h4 class="lk-title">实时告警（active）</h4>
            <div v-if="linkage.alarms.length" class="lk-alarms">
              <div v-for="a in linkage.alarms" :key="a.id" class="lk-alarm" :class="`lv-${a.level}`">
                <span class="lk-alarm__lv">{{ a.level }}</span>
                <span class="lk-alarm__title">{{ a.title }}</span>
              </div>
            </div>
            <span v-else class="lk-empty">当前无活动告警</span>
          </section>

          <section class="lk-block">
            <h4 class="lk-title">能耗概览</h4>
            <pre class="lk-json">{{ linkage.energy ? JSON.stringify(linkage.energy, null, 2) : '—' }}</pre>
          </section>

          <section class="lk-block">
            <h4 class="lk-title">大屏面板联动（点击楼栋后驱动）</h4>
            <pre class="lk-json">{{ linkage.panels ? JSON.stringify(linkage.panels, null, 2) : '—' }}</pre>
          </section>

          <p class="lk-tip">
            以上数据均由「选中该楼」触发联动接口拉取，确认无误即代表大屏点击对应框也会呈现相同联动结果。
          </p>
        </template>
      </div>
    </el-drawer>

    <!-- 楼栋区域热点配置弹窗 -->
    <el-dialog v-model="areaDialogVisible" :title="`楼栋区域热点配置 · ${selectedBuildingName}`" width="640px" :close-on-click-modal="false">
      <el-form label-width="96px">
        <el-form-item label="区域名称">
          <el-input v-model="editingArea.label" placeholder="如：住院部发热门诊区" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="颜色">
              <el-color-picker v-model="editingArea.color" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="可见">
              <el-switch v-model="editingArea.visible" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="跳转类型">
          <el-select v-model="areaLinkType" style="width: 100%">
            <el-option label="不跳转" value="none" />
            <el-option label="外部链接（新标签）" value="url" />
            <el-option label="内部跳转（楼栋/子系统）" value="internal" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="areaLinkType === 'url'" label="链接地址">
          <el-input v-model="areaLinkUrl" placeholder="https://..." />
        </el-form-item>
        <el-form-item v-if="areaLinkType === 'internal'" label="跳转目标">
          <el-select v-model="areaLinkTarget" style="width: 100%" placeholder="选择楼栋或子系统">
            <el-option v-for="b in buildingOptions" :key="b.value" :label="`楼栋：${b.label}`" :value="b.value" />
            <el-option v-for="s in subsystemOptions" :key="s.value" :label="`子系统：${s.label}`" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="自定义参数">
          <div class="params-editor">
            <div v-for="(row, idx) in areaParamRows" :key="idx" class="param-row">
              <el-input v-model="row.key" size="small" placeholder="参数名" />
              <el-input v-model="row.val" size="small" placeholder="参数值" />
              <el-button size="small" text type="danger" @click="areaParamRows.splice(idx, 1)">删</el-button>
            </div>
            <el-button size="small" @click="areaParamRows.push({ key: '', val: '' })">+ 添加参数</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="areaDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveArea">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ---------- 页面框架（与 DIY 编辑器页面一致） ---------- */
.bd-admin {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--kp-bg);
  color: var(--kp-fg);
}

.bd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--kp-border);
  flex-wrap: wrap;
}
.bd-toolbar__left { display: flex; align-items: center; gap: 8px; }
.bd-toolbar__icon { color: var(--kp-accent); filter: drop-shadow(0 0 4px var(--kp-glow)); }
.bd-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.bd-toolbar__desc { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.bd-toolbar__actions { display: flex; gap: 8px; }

.bd-btn {
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
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.bd-btn:hover:not(:disabled) { border-color: var(--kp-border-strong); color: var(--kp-accent); }
.bd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bd-btn--primary {
  background: linear-gradient(135deg, var(--kp-accent), var(--kp-accent-secondary));
  color: var(--kp-accent-on);
  border-color: transparent;
}
.bd-btn--primary:hover:not(:disabled) { color: var(--kp-accent-on); box-shadow: 0 0 14px var(--kp-glow); }

.bd-dirty {
  padding: 4px 14px;
  font-size: var(--kp-text-xs);
  color: var(--kp-warn);
  background: var(--kp-glow-soft);
  border-bottom: 1px solid var(--kp-border);
}

.bd-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
  padding: 14px;
  align-items: stretch;
}

/* ---------- 左侧配置卡片（与 la-sec 检视面板一致） ---------- */
.bd-sec {
  width: 340px;
  flex-shrink: 0;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  background: var(--kp-surface);
  padding: 10px 12px;
  overflow-y: auto;
}
.bd-sec__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--kp-text-sm);
  color: var(--kp-accent);
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}
.bd-sec__title :deep(svg) { filter: drop-shadow(0 0 4px var(--kp-glow)); }

/* 表单文字在深色卡片上使用主题 token（覆盖 admin.css 的对话框黑字规则） */
.bd-form :deep(.el-form-item__label) { color: var(--kp-fg-muted); }
.bd-form :deep(.el-radio__label),
.bd-form :deep(.el-switch__label) { color: var(--kp-fg); }

.bd-val {
  margin-left: 10px;
  font-size: 13px;
  color: var(--kp-accent);
  min-width: 42px;
  font-family: var(--kp-font-mono);
}
.bd-hex {
  margin-left: 10px;
  font-size: 12px;
  font-family: var(--kp-font-mono);
  color: var(--kp-fg-subtle);
}
.bd-hint {
  margin-top: 8px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
  line-height: 1.5;
}

/* ---------- 右侧 2D 预览画布（与 la-stage-wrap 一致） ---------- */
.bd-stage-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kp-border-strong);
  border-radius: var(--kp-radius-md);
  background: var(--kp-bg-deep);
  overflow: hidden;
}
.bd-stage {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bd3d-host {
  flex: 1;
  min-height: 0;
  position: relative;
}
.bd-svg { width: 100%; height: 100%; display: block; }
.bd-canvas-hint { padding: 0 12px 10px; margin-top: 0; }

/* SVG 元素颜色全部走 token */
.bd-grid { stroke: var(--kp-border-soft); }
.bd-box { cursor: grab; transition: opacity var(--kp-motion-fast); }
.bd-box:hover { opacity: 0.85; }
.bd-box.is-dragging { cursor: grabbing; opacity: 0.75; }
.bd-box.is-dragged { stroke-width: 3; }
.bd-label {
  font-size: 13px;
  font-weight: 600;
  fill: var(--kp-fg);
  pointer-events: none;
}
.bd-label.is-selected { fill: var(--kp-accent); }
.bd-inner {
  fill: none;
  stroke: var(--kp-accent);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

/* ---------- 选中楼栋：位置/透明度微调面板 ---------- */
.bd-panel {
  border-top: 1px solid var(--kp-border);
  background: var(--kp-surface);
  padding: 10px 12px;
}
.bd-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.bd-panel__title {
  font-size: var(--kp-text-sm);
  color: var(--kp-accent);
  letter-spacing: 0.5px;
}
.bd-panel__tag {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-pill);
  padding: 1px 8px;
}
.bd-panel__tag.is-custom {
  color: var(--kp-warn);
  border-color: var(--kp-warn);
}
.bd-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bd-panel__label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  white-space: nowrap;
}
.bd-panel__hint {
  margin: 8px 0 0;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
  line-height: 1.5;
}
.bd-btn--mini {
  height: 26px;
  padding: 0 10px;
  font-size: var(--kp-text-xs);
}

/* 模型坐标 X/Y/Z 输入 */
.bd-pos {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.bd-pos__field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  padding: 2px 6px;
}
.bd-pos__field input {
  width: 64px;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--kp-fg);
  font-size: var(--kp-text-sm);
  font-family: var(--kp-font-mono);
  outline: none;
}

/* ---------- 数据联动校验抽屉（深色卡片，token 文字） ---------- */
.bd-drawer-body {
  background: var(--kp-bg-deep);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  padding: 12px;
  color: var(--kp-fg);
}
.lk-block {
  margin-bottom: 14px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  background: var(--kp-surface);
  padding: 10px 12px;
}
.lk-title {
  margin: 0 0 8px;
  font-size: var(--kp-text-sm);
  color: var(--kp-accent);
  letter-spacing: 0.5px;
}
.lk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lk-empty { font-size: 12px; color: var(--kp-fg-muted); }
.lk-alarms { display: flex; flex-direction: column; gap: 6px; }
.lk-alarm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--kp-bg-deep);
}
.lk-alarm__lv {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  color: var(--kp-fg);
}
.lk-alarm.lv-critical .lk-alarm__lv {
  color: var(--kp-danger);
  background: color-mix(in srgb, var(--kp-danger) 16%, transparent);
}
.lk-alarm.lv-warning .lk-alarm__lv {
  color: var(--kp-warn);
  background: color-mix(in srgb, var(--kp-warn) 16%, transparent);
}
.lk-alarm.lv-info .lk-alarm__lv {
  color: var(--kp-info);
  background: color-mix(in srgb, var(--kp-info) 16%, transparent);
}
.lk-alarm__title { font-size: 13px; color: var(--kp-fg); }
.lk-json {
  margin: 0;
  background: var(--kp-bg-deep);
  border: 1px solid var(--kp-border);
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  font-family: var(--kp-font-mono);
  color: var(--kp-fg-muted);
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.lk-tip {
  font-size: 12px;
  color: var(--kp-fg-subtle);
  line-height: 1.6;
  margin-top: 4px;
}

/* ---------- 楼栋区域热点（每栋楼可划区域） ---------- */
.bd-area {
  border-top: 1px solid var(--kp-border);
  background: var(--kp-surface);
  padding: 10px 12px;
}
.bd-area__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.bd-area__title {
  font-size: var(--kp-text-sm);
  color: var(--kp-accent);
  letter-spacing: 0.5px;
}
.bd-area__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.bd-area__hint {
  margin: 8px 0 0;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-subtle);
  line-height: 1.5;
}
.bd-area__empty {
  margin-top: 8px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.bd-area__list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bd-area__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-bg-deep);
}
.bd-area__item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bd-area__name {
  font-size: var(--kp-text-sm);
  color: var(--kp-fg);
}
.bd-area__meta {
  font-size: 11px;
  color: var(--kp-fg-muted);
  font-family: var(--kp-font-mono);
}
.bd-area__item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
</style>

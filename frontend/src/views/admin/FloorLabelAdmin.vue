<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Layers, Search, Save, Trash2, Building2, ListTree, SlidersHorizontal } from 'lucide-vue-next'
import { buildingApi } from '@/api'
import { useSceneStore } from '@/stores/scene'
import type { Building, FloorLabel } from '@/types/api'

const sceneStore = useSceneStore()

// ---------- 数据 ----------
const buildings = ref<Building[]>([])
// 本地编辑副本：building_id -> FloorLabel[]
const floorsByBuilding = reactive<Record<string, FloorLabel[]>>({})
const saving = ref(false)
const loading = ref(false)
const searchText = ref('')
const treeRef = ref<any>(null)
const selected = ref<{ buildingId: string; floorIndex: number } | null>(null)

// 编辑面板绑定的当前层
const editor = reactive<{
  index: number
  label: string
  bound_fields: string[]
  color: string
  threshold: number | undefined
  opacity: number | undefined
  visible: boolean
}>({
  index: 1,
  label: '',
  bound_fields: [],
  color: '',
  threshold: undefined,
  opacity: undefined,
  visible: true,
})

// 可绑定指标字段候选（与现有 7 子系统指标 key 对齐；用户也可自由输入）
const BIND_FIELD_OPTIONS = [
  'power.kwh',
  'power.kw',
  'hvac.temp',
  'hvac.kwh',
  'lighting.kwh',
  'water.flow',
  'water.kwh',
  'elevator.kwh',
  'energy.total',
  'energy.kwh',
]

// ---------- 初始化 / 刷新 ----------
async function reload() {
  loading.value = true
  try {
    const res = await buildingApi.list()
    buildings.value = res.items || []
  } catch {
    buildings.value = []
  }
  // 从场景 store 重载已保存的楼层标签（AdminLayout 已 scene.init() 加载）
  const src = sceneStore.buildingDisplay.floors_by_building || {}
  Object.keys(floorsByBuilding).forEach((k) => delete floorsByBuilding[k])
  Object.keys(src).forEach((k) => {
    floorsByBuilding[k] = (src[k] || []).map((x) => ({ ...x }))
  })
  selected.value = null
  loading.value = false
}
onMounted(reload)

// ---------- 工具 ----------
function getFloorLabel(bid: string, f: number): FloorLabel | undefined {
  return (floorsByBuilding[bid] || []).find((x) => x.index === f)
}
function buildingName(bid: string): string {
  return buildings.value.find((b) => b.id === bid)?.name || bid
}

// ---------- 图层树 ----------
const treeData = computed(() => {
  return buildings.value.map((b) => ({
    key: `b-${b.id}`,
    label: b.name,
    isFloor: false,
    children: Array.from({ length: b.floors }, (_, i) => i + 1).map((f) => {
      const lbl = getFloorLabel(b.id, f)
      return {
        key: `f-${b.id}-${f}`,
        label: `${f}F${lbl?.label ? ' · ' + lbl.label : ''}`,
        isFloor: true,
        buildingId: b.id,
        floorIndex: f,
      }
    }),
  }))
})

const selectedKey = computed(() =>
  selected.value ? `f-${selected.value.buildingId}-${selected.value.floorIndex}` : ''
)

function filterNode(value: string, data: any): boolean {
  if (!value) return true
  const v = value.toLowerCase()
  if (data.isFloor) {
    const lbl = getFloorLabel(data.buildingId, data.floorIndex)
    return (
      String(data.floorIndex).includes(v) ||
      (lbl?.label || '').toLowerCase().includes(v) ||
      buildingName(data.buildingId).toLowerCase().includes(v)
    )
  }
  return (data.label || '').toLowerCase().includes(v)
}
watch(searchText, (v) => treeRef.value?.filter(v))

function onNodeClick(node: any) {
  if (node?.isFloor) selectFloor(node.buildingId, node.floorIndex)
}

function selectFloor(bid: string, fidx: number) {
  selected.value = { buildingId: bid, floorIndex: fidx }
  const lbl = getFloorLabel(bid, fidx)
  editor.index = fidx
  editor.label = lbl?.label ?? ''
  editor.bound_fields = lbl?.bound_fields ? [...lbl.bound_fields] : []
  editor.color = lbl?.color ?? ''
  editor.threshold = typeof lbl?.threshold === 'number' ? lbl.threshold : undefined
  editor.opacity = typeof lbl?.opacity === 'number' ? lbl.opacity : undefined
  editor.visible = lbl?.visible !== false
}

// ---------- 保存 / 删除 ----------
function buildPatch(): Record<string, FloorLabel[]> {
  const patch: Record<string, FloorLabel[]> = {}
  Object.keys(floorsByBuilding).forEach((k) => {
    if (Array.isArray(floorsByBuilding[k]) && floorsByBuilding[k].length) {
      patch[k] = floorsByBuilding[k].map((x) => ({ ...x }))
    }
  })
  return patch
}

async function persist() {
  saving.value = true
  try {
    await sceneStore.updateBuildingDisplay({ floors_by_building: buildPatch() })
    ElMessage.success('楼层标签已保存，大屏与 3D 视图即时生效')
  } catch {
    ElMessage.error('保存失败，请检查网络后重试')
  } finally {
    saving.value = false
  }
}

function saveFloor() {
  if (!selected.value) return
  const { buildingId, floorIndex } = selected.value
  const arr = floorsByBuilding[buildingId] || (floorsByBuilding[buildingId] = [])
  const item: FloorLabel = {
    index: floorIndex,
    label: editor.label?.trim() || `${floorIndex}F`,
    bound_fields: (editor.bound_fields || []).filter((x) => !!x),
    color: editor.color || undefined,
    threshold: typeof editor.threshold === 'number' && !Number.isNaN(editor.threshold) ? editor.threshold : undefined,
    opacity: typeof editor.opacity === 'number' && !Number.isNaN(editor.opacity) ? editor.opacity : undefined,
    visible: editor.visible !== false,
  }
  const idx = arr.findIndex((x) => x.index === floorIndex)
  if (idx >= 0) arr[idx] = item
  else arr.push(item)
  arr.sort((a, b) => a.index - b.index)
  persist()
}

function deleteFloor() {
  if (!selected.value) return
  const { buildingId, floorIndex } = selected.value
  const arr = floorsByBuilding[buildingId]
  if (arr) {
    floorsByBuilding[buildingId] = arr.filter((x) => x.index !== floorIndex)
    if (!floorsByBuilding[buildingId].length) delete floorsByBuilding[buildingId]
  }
  selected.value = null
  persist()
}

// ---------- 2D 缩略图 ----------
const selectedBuilding = computed(() => {
  if (!selected.value) return undefined
  return buildings.value.find((b) => b.id === selected.value!.buildingId)
})
const SVG_W = 120
const SVG_H = 320
const UNIT = computed(() => (selectedBuilding.value ? SVG_H / selectedBuilding.value.floors : SVG_H))

function floorRectY(f: number): number {
  // 1F 在最底部
  return SVG_H - f * UNIT.value
}

function onThresholdInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  editor.threshold = v === '' ? undefined : Number(v)
}
</script>

<template>
  <div class="admin-page floorlabel">
    <div class="admin-toolbar">
      <Layers :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">楼栋楼层标签</span>
      <span class="floorlabel__desc">为每栋楼每一层自定义标签并绑定数据字段，大屏与 3D 视图即时联动</span>
      <div class="admin-toolbar__filters">
        <button class="floorlabel__btn" @click="reload" :disabled="loading">
          <Search :size="15" /> 刷新
        </button>
        <button class="floorlabel__btn floorlabel__btn--primary" @click="persist" :disabled="saving">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div class="floorlabel__body" v-loading="loading">
      <!-- 左：图层树 -->
      <section class="kp-panel floorlabel__col">
        <span class="kp-corner kp-corner--tl" /><span class="kp-corner kp-corner--tr" />
        <span class="kp-corner kp-corner--bl" /><span class="kp-corner kp-corner--br" />
        <div class="kp-panel-title"><ListTree :size="14" /> 图层树</div>
        <div class="floorlabel__search">
          <Search :size="14" class="floorlabel__search-icon" />
          <input
            v-model="searchText"
            class="floorlabel__search-input"
            placeholder="搜索楼栋 / 楼层 / 标签"
          />
        </div>
        <el-tree
          ref="treeRef"
          class="floorlabel__tree"
          :data="treeData"
          node-key="key"
          :props="{ label: 'label', children: 'children' }"
          :filter-node-method="filterNode"
          :current-node-key="selectedKey"
          highlight-current
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span class="floorlabel__tree-node">
              <Building2 v-if="!data.isFloor" :size="14" />
              <span>{{ data.label }}</span>
            </span>
          </template>
        </el-tree>
      </section>

      <!-- 中：2D 缩略图 -->
      <section class="kp-panel floorlabel__col">
        <span class="kp-corner kp-corner--tl" /><span class="kp-corner kp-corner--tr" />
        <span class="kp-corner kp-corner--bl" /><span class="kp-corner kp-corner--br" />
        <div class="kp-panel-title"><Building2 :size="14" /> 楼栋缩略图</div>
        <div v-if="selectedBuilding" class="floorlabel__svg-wrap">
          <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="floorlabel__svg">
            <rect :x="10" :y="6" :width="SVG_W - 20" :height="SVG_H - 12" class="floorlabel__svg-frame" />
            <template v-for="f in selectedBuilding.floors" :key="f">
              <rect
                :x="10"
                :y="floorRectY(f) + 1"
                :width="SVG_W - 20"
                :height="UNIT - 2"
                :class="[
                  'floorlabel__floor',
                  selected && selected.floorIndex === f ? 'floorlabel__floor--active' : '',
                  getFloorLabel(selectedBuilding.id, f)?.visible === false ? 'floorlabel__floor--hidden' : '',
                ]"
              />
              <text
                :x="SVG_W / 2"
                :y="floorRectY(f) + UNIT / 2 + 3"
                class="floorlabel__floor-text"
              >{{ f }}F {{ getFloorLabel(selectedBuilding.id, f)?.label || '' }}</text>
            </template>
          </svg>
        </div>
        <el-empty v-else description="在左侧图层树选择一栋楼查看缩略图" :image-size="80" />
      </section>

      <!-- 右：编辑面板 -->
      <section class="kp-panel floorlabel__col">
        <span class="kp-corner kp-corner--tl" /><span class="kp-corner kp-corner--tr" />
        <span class="kp-corner kp-corner--bl" /><span class="kp-corner kp-corner--br" />
        <div class="kp-panel-title"><SlidersHorizontal :size="14" /> 标签编辑</div>
        <template v-if="selected">
          <div class="floorlabel__cur">{{ buildingName(selected.buildingId) }} · {{ selected.floorIndex }}F</div>

          <div class="floorlabel__field">
            <label class="floorlabel__label">楼层标签</label>
            <input v-model="editor.label" class="floorlabel__input" placeholder="如：门诊大厅 / 住院病区" />
          </div>

          <div class="floorlabel__field">
            <label class="floorlabel__label">绑定数据字段</label>
            <el-select
              v-model="editor.bound_fields"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入指标 key"
              class="floorlabel__full"
            >
              <el-option v-for="opt in BIND_FIELD_OPTIONS" :key="opt" :label="opt" :value="opt" />
            </el-select>
            <p class="floorlabel__hint">绑定后大屏/3D 标签实时显示该指标；可多选，首个字段参与越阈判定</p>
          </div>

          <div class="floorlabel__field">
            <label class="floorlabel__label">常态高亮色</label>
            <div class="floorlabel__inline">
              <el-color-picker v-model="editor.color" />
              <span class="floorlabel__hint">留空则跟随主题强调色</span>
            </div>
          </div>

          <div class="floorlabel__field">
            <label class="floorlabel__label">越阈阈值（与绑定字段[0]同单位）</label>
            <input
              type="number"
              min="0"
              step="1"
              :value="editor.threshold ?? ''"
              @input="onThresholdInput"
              class="floorlabel__input floorlabel__input--num"
              placeholder="留空不判定"
            />
            <p class="floorlabel__hint">指标超过阈值时标签变红告警</p>
          </div>

          <div class="floorlabel__field">
            <label class="floorlabel__label">楼栋体块透明度覆盖</label>
            <el-slider
              :model-value="editor.opacity ?? 0.35"
              @update:model-value="(v: number) => (editor.opacity = v)"
              :min="0"
              :max="1"
              :step="0.05"
              class="floorlabel__full"
            />
            <p class="floorlabel__hint">留默认跟随全局</p>
          </div>

          <div class="floorlabel__field floorlabel__field--row">
            <label class="floorlabel__label">显示</label>
            <el-switch v-model="editor.visible" />
          </div>

          <div class="floorlabel__actions">
            <button class="floorlabel__btn floorlabel__btn--primary" :disabled="saving" @click="saveFloor">
              <Save :size="15" /> 保存本层
            </button>
            <button class="floorlabel__btn floorlabel__btn--danger" @click="deleteFloor">
              <Trash2 :size="15" /> 删除本层标签
            </button>
          </div>
        </template>
        <el-empty v-else description="选择左侧楼层节点开始编辑" :image-size="80" />
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ===== 统一后台外壳（与其他模块一致） ===== */
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; font-family: var(--kp-font-body); color: var(--kp-fg); }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }

.floorlabel__desc { color: var(--kp-fg-muted); margin-left: 10px; font-size: 13px; }

/* 统一按钮（刷新/保存/保存本层/删除） */
.floorlabel__btn {
  height: 30px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid var(--kp-border); color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-sm); cursor: pointer; font-size: 12px;
}
.floorlabel__btn:hover:not(:disabled) { color: var(--kp-fg); border-color: var(--kp-border-strong); }
.floorlabel__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.floorlabel__btn--primary { background: var(--kp-accent-soft); border-color: var(--kp-accent); color: var(--kp-accent); }
.floorlabel__btn--danger { border-color: var(--kp-danger); color: var(--kp-danger); }
.floorlabel__btn--danger:hover:not(:disabled) { border-color: var(--kp-danger); color: var(--kp-danger); filter: drop-shadow(0 0 6px var(--kp-danger-glow)); }

/* ===== 三栏主体 ===== */
.floorlabel__body {
  display: grid;
  grid-template-columns: 300px 220px 1fr;
  gap: 14px;
  flex: 1;
  min-height: 0;
}
.floorlabel__col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow: auto;
}

/* ===== 表单字段（自定义 label，规避 admin.css 对 el 表单的黑色文字强制） ===== */
.floorlabel__field { margin-bottom: 4px; }
.floorlabel__field--row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.floorlabel__label { display: block; font-size: 13px; color: var(--kp-fg); margin-bottom: 6px; font-weight: 500; }
.floorlabel__hint { margin-top: 4px; font-size: 11px; color: var(--kp-fg-muted); }
.floorlabel__input {
  width: 100%; height: 34px; padding: 0 10px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg); font-size: 13px;
  outline: none; transition: border-color var(--kp-motion-fast);
}
.floorlabel__input:focus { border-color: var(--kp-accent); }
.floorlabel__input--num { width: 160px; }
.floorlabel__inline { display: flex; align-items: center; gap: 10px; }
.floorlabel__full { width: 100%; }
.floorlabel__cur { font-size: var(--kp-text-md); font-weight: 600; color: var(--kp-accent); margin-bottom: 4px; }
.floorlabel__actions { display: flex; gap: 8px; margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--kp-border); }

/* ===== 图层树搜索 + 树 ===== */
.floorlabel__search { position: relative; display: flex; align-items: center; }
.floorlabel__search-icon { position: absolute; left: 10px; color: var(--kp-fg-muted); pointer-events: none; }
.floorlabel__search-input {
  width: 100%; height: 32px; padding: 0 10px 0 30px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg); font-size: 13px;
  outline: none; transition: border-color var(--kp-motion-fast);
}
.floorlabel__search-input:focus { border-color: var(--kp-accent); }
.floorlabel__search-input::placeholder { color: var(--kp-fg-muted); }
.floorlabel__tree { background: transparent; color: var(--kp-fg); flex: 1; min-height: 0; }
.floorlabel__tree-node { display: flex; align-items: center; gap: 8px; }
.floorlabel__tree :deep(.el-tree-node__content) { background: transparent; color: var(--kp-fg); height: 30px; }
.floorlabel__tree :deep(.el-tree-node__content:hover) { background: var(--kp-glow-soft); }
.floorlabel__tree :deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) {
  background: var(--kp-accent-soft); color: var(--kp-accent);
}

/* ===== 2D 缩略图 ===== */
.floorlabel__svg-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }
.floorlabel__svg { width: 100%; height: 100%; max-height: 420px; }
.floorlabel__svg-frame { fill: none; stroke: var(--kp-border-strong); stroke-width: 1; }
.floorlabel__floor { fill: var(--kp-surface-raised); stroke: var(--kp-border); stroke-width: 0.5; transition: fill var(--kp-motion-base); }
.floorlabel__floor--active { fill: var(--kp-accent); }
.floorlabel__floor--hidden { opacity: 0.25; }
.floorlabel__floor-text { fill: var(--kp-fg-muted); font-size: 7px; text-anchor: middle; font-family: var(--kp-font-mono); }
.floorlabel__floor--active + .floorlabel__floor-text { fill: var(--kp-accent-on); }

/* ===== Element Plus 富控件在深色面板下的文本色修正（admin.css 对 .admin-page 强制黑字） ===== */
.floorlabel__col :deep(.el-input__inner),
.floorlabel__col :deep(.el-textarea__inner) { color: var(--kp-fg); }
.floorlabel__col :deep(.el-select .el-input__inner) { color: var(--kp-fg); }
.floorlabel__col :deep(.el-select__placeholder) { color: var(--kp-fg-muted); }
.floorlabel__col :deep(.el-input-number .el-input__inner) { color: var(--kp-fg); }
</style>

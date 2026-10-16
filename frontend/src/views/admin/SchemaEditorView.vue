<script setup lang="ts">
/**
 * GK-09 · Schema Editor 管理后台（Phase 2）
 *
 * 职责：
 *   - hudLayout 段可视化编辑（17 个 widget 卡片：title / rect[x,y,w,h] / z / locked），
 *     保存 = GET version → PUT /scene/schema（If-Match 乐观锁）→ 成功后重新 GET 刷新。
 *   - 412（版本冲突）弹「已被他人修改」提示并提供一键重新获取。
 *   - 其余段只读展示：sceneGraph 树 / cameraPresets 表 / scenarios 表 / 计数卡。
 *   - 脏数据守卫：路由离开 / 页面刷新前 confirm。
 *
 * 后端契约见 backend/src/scene/schema.controller.ts + schema.service.ts：
 *   PUT body 为 SceneSchemaPatchDto（patch 语义，全顶层段 optional）；
 *   本页只提交 { hudLayout: { canvas, widgets } } 段级替换，
 *   服务端 applyPatch 对 hudLayout 段引用变化触发反向写回 scene_config.hud_layout_widgets，
 *   且版本守卫在反向写回之前（412 不会污染源表）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshCw, Save, TriangleAlert, Braces, FileJson, Eye, ChevronRight } from 'lucide-vue-next'
import { schemaEditorApi } from '@/api'
import type { SceneSchemaDocument, SceneSchemaHudWidget } from '@/types/api'

const DESIGN_W = 1920
const DESIGN_H = 1080

// ---------- 状态 ----------
const loading = ref(false)
const saving = ref(false)
const version = ref(0)
const updatedAt = ref<string | null>(null)
const doc = ref<SceneSchemaDocument | null>(null)
// hudLayout 工作副本（编辑对象；canvas 只读展示）
const widgets = ref<SceneSchemaHudWidget[]>([])
// 载入时的基线快照（dirty 判定）
let baselineJson = ''

const dirty = computed(() => JSON.stringify(widgets.value) !== baselineJson)

// ---------- 分组（left / right / bottom 与 id 前缀一致） ----------
interface WidgetGroup {
  key: string
  label: string
  indices: number[]
}
const groups = computed<WidgetGroup[]>(() => {
  const mk = (key: string, label: string, prefix: string): WidgetGroup => ({
    key,
    label,
    indices: widgets.value
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => String(w.id).startsWith(prefix))
      .map(({ i }) => i),
  })
  return [mk('left', '左侧', 'left-'), mk('right', '右侧', 'right-'), mk('bottom', '底部', 'bottom-')]
})

// ---------- 只读段 ----------
interface SchemaTreeNode {
  id: string
  label: string
  type: string
  children: SchemaTreeNode[]
}
const sceneTree = ref<SchemaTreeNode[]>([])

function buildTree(nodes: Array<Record<string, any>>): SchemaTreeNode[] {
  const byId = new Map<string, SchemaTreeNode>()
  for (const n of nodes) {
    byId.set(String(n.id), {
      id: String(n.id),
      label: String(n.name || n.id),
      type: String(n.type || ''),
      children: [],
    })
  }
  const roots: SchemaTreeNode[] = []
  for (const n of nodes) {
    const me = byId.get(String(n.id))
    if (!me) continue
    const parent = n.parent != null ? byId.get(String(n.parent)) : undefined
    if (parent) parent.children.push(me)
    else roots.push(me)
  }
  return roots
}

const cameraPresets = computed(() => (doc.value?.cameraPresets || []) as Array<Record<string, any>>)
const scenarios = computed(() => (doc.value?.scenarios || []) as Array<Record<string, any>>)

function poseSummary(pose: any): string {
  if (!pose || !Array.isArray(pose.position) || !Array.isArray(pose.lookAt)) return '-'
  const fmt = (a: number[]) => a.map((v) => Math.round((Number(v) || 0) * 10) / 10).join(', ')
  return `pos(${fmt(pose.position)}) → look(${fmt(pose.lookAt)}) · fov ${pose.fov ?? '-'}`
}

// ---------- 加载 ----------
async function loadAll(opts: { silent?: boolean } = {}) {
  if (!opts.silent) loading.value = true
  try {
    const [d, v] = await Promise.all([schemaEditorApi.get(), schemaEditorApi.version()])
    doc.value = d
    version.value = v.version
    updatedAt.value = v.updatedAt
    widgets.value = JSON.parse(JSON.stringify(d.hudLayout?.widgets || [])) as SceneSchemaHudWidget[]
    baselineJson = JSON.stringify(widgets.value)
    sceneTree.value = buildTree((d.sceneGraph || []) as Array<Record<string, any>>)
  } catch (e) {
    ElMessage.error(`Schema 加载失败：${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

// ---------- 保存（乐观锁） ----------
// 响应拦截器把非 2xx 转成 Error(message = response.data.message)，
// 412 的 message 形如 "Version mismatch: If-Match=5, current=6"。
function isPreconditionError(e: unknown): boolean {
  const msg = (e as Error)?.message || ''
  return /Version mismatch|Precondition|412/.test(msg)
}

async function save() {
  if (!doc.value?.hudLayout || saving.value) return
  saving.value = true
  try {
    const patch = {
      hudLayout: {
        canvas: JSON.parse(JSON.stringify(doc.value.hudLayout.canvas)),
        widgets: JSON.parse(JSON.stringify(widgets.value)),
      },
    }
    const res = await schemaEditorApi.update(patch, version.value)
    version.value = res.version
    updatedAt.value = res.updatedAt
    ElMessage.success(`保存成功（v${res.version}），已反向写回大屏布局源表`)
    await loadAll({ silent: true })
  } catch (e) {
    if (isPreconditionError(e)) {
      ElMessageBox.confirm(
        'Schema 已被他人修改，请刷新后重试。是否立即重新获取最新数据？（当前未保存的修改将丢失）',
        '版本冲突（412）',
        { confirmButtonText: '重新获取', cancelButtonText: '取消', type: 'warning' },
      )
        .then(() => loadAll())
        .catch(() => {})
    } else {
      ElMessage.error(`保存失败：${(e as Error).message}`)
    }
  } finally {
    saving.value = false
  }
}

// ---------- 脏数据守卫 ----------
async function guardDirty(): Promise<boolean> {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(
      '当前有未保存的 hudLayout 修改，离开将丢失。确定离开吗？',
      '未保存的修改',
      { confirmButtonText: '放弃修改并离开', cancelButtonText: '留在本页', type: 'warning' },
    )
    return true
  } catch {
    return false
  }
}

onBeforeRouteLeave(async () => guardDirty())

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  await loadAll()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// ---------- 工具 ----------
function clampW(v: number | undefined): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(DESIGN_W, Math.round(n)))
}
function clampH(v: number | undefined): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(DESIGN_H, Math.round(n)))
}
function setRect(w: SceneSchemaHudWidget, idx: 0 | 1 | 2 | 3, val: number | undefined) {
  const rect = [...(w.rect || [0, 0, 0, 0])] as [number, number, number, number]
  rect[idx] = idx === 0 || idx === 2 ? clampW(val) : clampH(val)
  w.rect = rect
}
</script>

<template>
  <div class="se admin-page" v-loading="loading">
    <!-- 顶部：版本信息 + 操作 -->
    <div class="admin-toolbar">
      <Braces :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">Schema 编辑器</span>
      <div class="se-toolbar__meta">
        <span class="se-version" :class="{ 'is-stale': dirty }">schema v{{ version }}</span>
        <span v-if="updatedAt" class="se-updated">更新于 {{ updatedAt }}</span>
        <el-tag v-if="dirty" type="warning" size="small" effect="plain">
          <TriangleAlert :size="12" style="vertical-align: -2px" /> 有未保存修改
        </el-tag>
        <el-tag size="small" effect="plain" type="info">只读段：sceneGraph / cameraPresets / scenarios 等</el-tag>
      </div>
      <div class="se-toolbar__actions">
        <el-button :icon="RefreshCw" :disabled="saving" @click="loadAll()">刷新</el-button>
        <el-button
          class="se-save-btn"
          type="primary"
          :icon="Save"
          :loading="saving"
          :disabled="!dirty"
          @click="save"
        >
          保存 hudLayout
        </el-button>
      </div>
    </div>

    <!-- hudLayout 编辑器 -->
    <section class="se-hud kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <div class="kp-panel-title">
        <FileJson :size="16" />
        hudLayout 布局编辑（可编辑段）
      </div>
      <div class="se-hud__meta se-muted">
        canvas {{ doc?.hudLayout?.canvas?.width }}×{{ doc?.hudLayout?.canvas?.height }} ·
        theme {{ doc?.hudLayout?.canvas?.theme }} ·
        {{ widgets.length }} 个 widget · rect 基于 {{ DESIGN_W }}×{{ DESIGN_H }} 设计坐标系
      </div>

      <div v-for="g in groups" :key="g.key" class="se-group">
        <div class="se-group__title">{{ g.label }} <el-tag size="small" effect="plain">{{ g.indices.length }}</el-tag></div>
        <div class="se-group__grid">
          <div v-for="i in g.indices" :key="widgets[i].id" class="se-widget">
            <!-- 标题栏（镜像 .bs-panel .p-hd：强调色竖条 + id + type/subsystem 标签 + chevron） -->
            <div class="se-widget__head">
              <span class="se-widget__bar" />
              <code class="se-widget__id">{{ widgets[i].id }}</code>
              <el-tag size="small" type="info" effect="plain">{{ widgets[i].type }}</el-tag>
              <el-tag v-if="widgets[i].subsystem" size="small" effect="plain">{{ widgets[i].subsystem }}</el-tag>
              <span class="se-widget__chev"><ChevronRight :size="14" /></span>
            </div>
            <!-- 卡片主体（标题 / rect / 层级锁定） -->
            <div class="se-widget__body">
              <div class="se-widget__row">
                <span class="se-widget__label">标题</span>
                <el-input
                  v-model="widgets[i].title"
                  class="se-title-input"
                  size="small"
                  :disabled="widgets[i].locked"
                  placeholder="widget 标题"
                />
              </div>
              <div class="se-widget__row se-widget__row--rect">
                <span class="se-widget__label">rect</span>
                <div class="se-rect">
                  <el-input-number
                    :model-value="widgets[i].rect?.[0]"
                    size="small"
                    :min="0"
                    :max="DESIGN_W"
                    :step="10"
                    controls-position="right"
                    title="x"
                    @update:model-value="(v: number | undefined) => setRect(widgets[i], 0, v)"
                  />
                  <el-input-number
                    :model-value="widgets[i].rect?.[1]"
                    size="small"
                    :min="0"
                    :max="DESIGN_H"
                    :step="10"
                    controls-position="right"
                    title="y"
                    @update:model-value="(v: number | undefined) => setRect(widgets[i], 1, v)"
                  />
                  <el-input-number
                    :model-value="widgets[i].rect?.[2]"
                    size="small"
                    :min="0"
                    :max="DESIGN_W"
                    :step="10"
                    controls-position="right"
                    title="w"
                    @update:model-value="(v: number | undefined) => setRect(widgets[i], 2, v)"
                  />
                  <el-input-number
                    :model-value="widgets[i].rect?.[3]"
                    size="small"
                    :min="0"
                    :max="DESIGN_H"
                    :step="10"
                    controls-position="right"
                    title="h"
                    @update:model-value="(v: number | undefined) => setRect(widgets[i], 3, v)"
                  />
                </div>
              </div>
              <div class="se-widget__row">
                <span class="se-widget__label">层级 / 锁定</span>
                <el-input-number
                  v-model="widgets[i].z"
                  size="small"
                  :min="0"
                  :max="99"
                  controls-position="right"
                  style="width: 96px"
                />
                <el-switch v-model="widgets[i].locked" size="small" active-text="锁定" />
              </div>
            </div>
            <!-- 大屏 chrome 四角描角（镜像 .bs-panel .c，选择器限定 .se-widget 防污染全局） -->
            <span class="c tl" /><span class="c tr" /><span class="c bl" /><span class="c br" />
          </div>
        </div>
      </div>
    </section>

    <!-- 只读段 -->
    <section class="se-readonly-panel kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <div class="kp-panel-title">
        <Eye :size="16" />
        其余 Schema 段（只读）
      </div>

      <!-- 计数卡 -->
      <div class="se-counts">
        <div class="se-count"><span>pointTable</span><strong>{{ (doc?.pointTable || []).length }}</strong></div>
        <div class="se-count"><span>bindings</span><strong>{{ (doc?.bindings || []).length }}</strong></div>
        <div class="se-count"><span>rules</span><strong>{{ (doc?.rules || []).length }}</strong></div>
        <div class="se-count"><span>dataSources</span><strong>{{ (doc?.dataSources || []).length }}</strong></div>
        <div class="se-count"><span>assets</span><strong>{{ (doc?.assets || []).length }}</strong></div>
        <div class="se-count"><span>sceneGraph</span><strong>{{ (doc?.sceneGraph || []).length }}</strong></div>
        <div class="se-count"><span>cameraPresets</span><strong>{{ cameraPresets.length }}</strong></div>
        <div class="se-count"><span>scenarios</span><strong>{{ scenarios.length }}</strong></div>
      </div>

      <div class="se-readonly">
        <div class="se-readonly__col">
          <div class="se-readonly__title">sceneGraph 树（root → building → floor → device）</div>
          <el-tree
            :data="sceneTree"
            node-key="id"
            :props="{ label: 'label', children: 'children' }"
            :expand-on-click-node="true"
            default-expand-all
            class="se-tree"
          >
            <template #default="{ data }">
              <span class="se-tree-node">
                <el-tag size="small" effect="plain" :type="data.type === 'root' ? 'danger' : data.type === 'building' ? 'warning' : data.type === 'floor' ? 'success' : 'info'">
                  {{ data.type }}
                </el-tag>
                <span class="se-tree-node__label">{{ data.label }}</span>
                <el-tag v-if="data.children.length" size="small" effect="plain" type="info" round>
                  {{ data.children.length }}
                </el-tag>
              </span>
            </template>
          </el-tree>
        </div>

        <div class="se-readonly__col">
          <div class="se-readonly__title">cameraPresets（{{ cameraPresets.length }}）</div>
          <el-table :data="cameraPresets" size="small" height="320" class="se-table">
            <el-table-column prop="id" label="id" min-width="180" show-overflow-tooltip />
            <el-table-column prop="name" label="name" min-width="120" show-overflow-tooltip />
            <el-table-column prop="mode" label="mode" width="76" />
            <el-table-column label="pose" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">{{ poseSummary(row.pose) }}</template>
            </el-table-column>
          </el-table>

          <div class="se-readonly__title">scenarios（{{ scenarios.length }}）</div>
          <el-table :data="scenarios" size="small" height="200" class="se-table">
            <el-table-column prop="id" label="id" min-width="150" show-overflow-tooltip />
            <el-table-column prop="name" label="name" min-width="120" show-overflow-tooltip />
            <el-table-column label="tracks" width="150">
              <template #default="{ row }">{{ (row.tracks || []).length }} 个 track</template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.se { display: flex; flex-direction: column; gap: 14px; }

/* 工具栏（复用全局 .admin-toolbar 骨架，补本页私有样式） */
.admin-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.admin-toolbar__icon { color: var(--kp-accent); flex-shrink: 0; }
.admin-toolbar__title {
  font-size: var(--kp-text-lg);
  font-weight: 510;
  letter-spacing: var(--kp-tracking-label);
}
.se-toolbar__meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.se-toolbar__actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.se-version {
  font-size: var(--kp-text-lg);
  font-weight: 600;
  color: var(--kp-accent);
  font-variant-numeric: tabular-nums;
}
.se-updated { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.se-muted { font-size: var(--kp-text-xs); color: var(--kp-fg-subtle); }

/* 内容块（kp-panel）内边距 */
.se-hud, .se-readonly-panel { padding: 14px; }
.se-hud__meta { margin: 0 0 12px; }

.se-group { margin-bottom: 18px; }
.se-group:last-child { margin-bottom: 0; }
.se-group__title { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 600; font-size: var(--kp-text-sm); }
.se-group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 10px;
}

/* widget 卡（镜像大屏 .bs-panel chrome：青边圆角底 + 标题栏 + 四角描角，外壳仍是 admin .kp-panel 子块） */
.se-widget {
  position: relative;
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  background: rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha));
  display: flex;
  flex-direction: column;
}
/* 标题栏（镜像 .bs-panel .p-hd）：等高 36px，底部渐变下划线 */
.se-widget__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--kp-panel-title-h);
  padding: 0 10px;
  flex-wrap: nowrap;
}
.se-widget__head::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--kp-accent), transparent);
}
/* 标题栏左侧强调色竖条（镜像 .p-bar：4px × 16px，直角不圆角） */
.se-widget__bar {
  width: 4px;
  height: 16px;
  background: var(--kp-accent);
  flex: none;
}
.se-widget__id {
  font-size: var(--kp-text-xs);
  color: var(--kp-accent);
  font-family: var(--kp-font-mono);
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* chevron（镜像 .p-chev）：推到最右，强调色 */
.se-widget__chev {
  margin-left: auto;
  display: flex;
  align-items: center;
  color: var(--kp-accent);
  opacity: 0.85;
  flex: none;
}
/* 卡片主体（标题 / rect / 层级锁定），原 .se-widget 内边距下移至此 */
.se-widget__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}
.se-widget__row { display: flex; align-items: center; gap: 8px; }
.se-widget__label { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); width: 62px; flex-shrink: 0; }
.se-widget__row .el-input, .se-widget__row .el-switch { flex: 0 1 auto; }
.se-rect { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; flex: 1; }

/* 大屏 chrome 四角描角（镜像 .bs-panel .c，选择器严格限定 .se-widget 防污染全局） */
.se-widget .c {
  position: absolute;
  width: var(--kp-corner-size);
  height: var(--kp-corner-size);
  pointer-events: none;
}
.se-widget .c.tl {
  left: -1px; top: -1px;
  border-left: 2px solid var(--kp-accent);
  border-top: 2px solid var(--kp-accent);
  border-top-left-radius: var(--kp-radius-panel);
}
.se-widget .c.tr {
  right: -1px; top: -1px;
  border-right: 2px solid var(--kp-accent);
  border-top: 2px solid var(--kp-accent);
  border-top-right-radius: var(--kp-radius-panel);
}
.se-widget .c.bl {
  left: -1px; bottom: -1px;
  border-left: 2px solid var(--kp-accent);
  border-bottom: 2px solid var(--kp-accent);
  border-bottom-left-radius: var(--kp-radius-panel);
}
.se-widget .c.br {
  right: -1px; bottom: -1px;
  border-right: 2px solid var(--kp-accent);
  border-bottom: 2px solid var(--kp-accent);
  border-bottom-right-radius: var(--kp-radius-panel);
}

.se-counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
.se-count {
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha));
}
.se-count span { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.se-count strong { font-size: var(--kp-text-xl); color: var(--kp-fg); font-variant-numeric: tabular-nums; }

.se-readonly { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; }
@media (max-width: 1200px) { .se-readonly { grid-template-columns: 1fr; } }
.se-readonly__title { font-size: var(--kp-text-sm); font-weight: 600; margin: 6px 0; }
.se-readonly__title:first-child { margin-top: 0; }
.se-tree { max-height: 560px; overflow: auto; border: 1px solid var(--kp-panel-edge); border-radius: var(--kp-radius-panel); padding: 6px; }
.se-tree-node { display: inline-flex; align-items: center; gap: 6px; }
.se-tree-node__label { font-size: var(--kp-text-sm); }
</style>

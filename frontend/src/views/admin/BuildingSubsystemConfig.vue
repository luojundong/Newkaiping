<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Building2, Save, RefreshCw, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { buildingApi, buildingCrudApi, subsystemLabelApi } from '@/api'
import { SUBSYSTEMS } from '@/types/scene'
import { useSceneStore } from '@/stores/scene'
import type { Building, BuildingSubsystem, SubsystemCode } from '@/types/api'

const buildings = ref<Building[]>([])
const selectedId = ref<string | null>(null)
const remoteList = ref<BuildingSubsystem[]>([])
const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)

// 本地可编辑的启用状态（覆盖全部 7 个子系统，缺省 false）
const enabledMap = reactive<Record<string, boolean>>({})
SUBSYSTEMS.forEach((s) => (enabledMap[s.code] = false))

// 子系统显示名覆盖（code -> 当前编辑中的显示名）
const labelMap = reactive<Record<string, string>>({})
// 子系统显示名原始值（用于判断是否被覆盖 / 已修改）
const labelOrigin = reactive<Record<string, string>>({})

// 楼栋名称内联编辑
const buildingNameDraft = ref('')
const buildingNameSaving = ref(false)

const selectedBuilding = computed(() => buildings.value.find((b) => b.id === selectedId.value) || null)

// ---------- GK-20：URL 深链 ?building=<id|code> 直达指定楼栋（住院大楼 id=3 / code=B3） ----------
const route = useRoute()
const router = useRouter()
// query 只在首次加载时抢优先级，之后（新增/删除楼栋后 reload）不再覆盖用户当前选择
let queryApplied = false

function resolveFromQuery(): string | null {
  const q = route.query.building
  if (typeof q !== 'string' || !q.trim()) return null
  const key = q.trim()
  const hit =
    buildings.value.find((b) => b.id === key) ||
    buildings.value.find((b) => String(b.code || '').toLowerCase() === key.toLowerCase())
  return hit ? hit.id : null
}

async function loadBuildings() {
  loading.value = true
  try {
    const res = await buildingApi.list()
    buildings.value = res.items
    if (!queryApplied) {
      const fromQuery = resolveFromQuery()
      if (fromQuery) selectedId.value = fromQuery
      queryApplied = true
    }
    // 当前选中项已从列表消失（被删除）时才回落到第一项
    if (!selectedId.value || !buildings.value.some((b) => b.id === selectedId.value)) {
      selectedId.value = buildings.value.length ? buildings.value[0].id : null
    }
    if (selectedId.value) {
      buildingNameDraft.value = selectedBuilding.value?.name || ''
      await loadSubsystems(selectedId.value)
    }
    await loadLabels()
  } catch {
    ElMessage.warning('楼栋列表加载失败，请确认后端服务已启动')
  } finally {
    loading.value = false
  }
}

async function loadLabels() {
  try {
    const map = (await subsystemLabelApi.list()) as Record<string, string>
    SUBSYSTEMS.forEach((s) => {
      const override = map[s.code]
      labelMap[s.code] = override ?? s.name
      labelOrigin[s.code] = override ?? s.name
    })
  } catch {
    SUBSYSTEMS.forEach((s) => {
      labelMap[s.code] = s.name
      labelOrigin[s.code] = s.name
    })
  }
}

async function loadSubsystems(id: string) {
  // 重置全部为 false，再按后端返回覆盖
  SUBSYSTEMS.forEach((s) => (enabledMap[s.code] = false))
  try {
    const res = await buildingApi.subsystems(id)
    remoteList.value = res.items
    res.items.forEach((item) => {
      if (item.subsystem_code in enabledMap) enabledMap[item.subsystem_code] = item.enabled
    })
  } catch {
    remoteList.value = []
  }
  dirty.value = false
}

function selectBuilding(id: string) {
  if (id === selectedId.value) return
  if (dirty.value && !confirm('当前楼栋配置尚未保存，切换将丢失修改，确认继续？')) return
  selectedId.value = id
  buildingNameDraft.value = selectedBuilding.value?.name || ''
  loadSubsystems(id)
}

async function save() {
  if (!selectedId.value) return
  saving.value = true
  try {
    const items = SUBSYSTEMS.map((s) => ({
      subsystem_code: s.code as SubsystemCode,
      enabled: enabledMap[s.code],
    }))
    await buildingApi.updateSubsystems(selectedId.value, items)
    ElMessage.success('楼栋子系统配置已保存')
    dirty.value = false
    await loadSubsystems(selectedId.value)
  } catch {
    ElMessage.error('保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function onToggle() {
  dirty.value = true
}
function resetConfig() {
  loadSubsystems(selectedId.value!)
}

// ---------- 楼栋名称内联保存 ----------
async function saveBuildingName() {
  if (!selectedId.value) return
  const name = buildingNameDraft.value.trim()
  if (!name) {
    ElMessage.warning('楼栋名称不能为空')
    return
  }
  if (name === selectedBuilding.value?.name) return
  buildingNameSaving.value = true
  try {
    await buildingCrudApi.update(selectedId.value, { name })
    const b = buildings.value.find((x) => x.id === selectedId.value)
    if (b) b.name = name
    ElMessage.success('楼栋名称已更新')
  } catch {
    ElMessage.error('楼栋名称保存失败')
    buildingNameDraft.value = selectedBuilding.value?.name || ''
  } finally {
    buildingNameSaving.value = false
  }
}

// ---------- 子系统显示名编辑 ----------
function labelChanged(code: string): boolean {
  return labelMap[code] !== labelOrigin[code]
}
async function saveLabel(code: string) {
  const name = (labelMap[code] || '').trim()
  if (!name) {
    ElMessage.warning('子系统显示名不能为空')
    labelMap[code] = labelOrigin[code]
    return
  }
  try {
    await subsystemLabelApi.update({ [code]: name })
    labelOrigin[code] = name
    ElMessage.success('子系统显示名已更新')
  } catch {
    ElMessage.error('子系统显示名保存失败')
    labelMap[code] = labelOrigin[code]
  }
}

const enabledCount = computed(() => SUBSYSTEMS.filter((s) => enabledMap[s.code]).length)

// ---------- 楼栋新增 / 删除 / 开关（requirement 1） ----------
const scene = useSceneStore()
const createVisible = ref(false)
const creating = ref(false)
const deletingId = ref<string | null>(null)
const createForm = reactive({ code: '', name: '', floors: 1, gross_area: 0 })

async function createBuilding() {
  const code = createForm.code.trim()
  const name = createForm.name.trim()
  if (!code) {
    ElMessage.warning('楼栋编码不能为空')
    return
  }
  if (!name) {
    ElMessage.warning('楼栋名称不能为空')
    return
  }
  creating.value = true
  try {
    await buildingCrudApi.create({
      code,
      name,
      floors: Number(createForm.floors) || 1,
      area: Number(createForm.gross_area) || 0,
    })
    ElMessage.success('楼栋已添加')
    createVisible.value = false
    Object.assign(createForm, { code: '', name: '', floors: 1, gross_area: 0 })
    await loadBuildings()
    await scene.refreshBuildings()
  } catch (e: any) {
    ElMessage.error(e?.message || '添加失败')
  } finally {
    creating.value = false
  }
}

async function setBuildingStatus(b: Building, on: boolean) {
  const next: 'active' | 'inactive' = on ? 'active' : 'inactive'
  try {
    await buildingCrudApi.setStatus(b.id, next)
    b.status = next
    await scene.refreshBuildings()
    ElMessage.success(next === 'active' ? '已显示该楼栋' : '已隐藏该楼栋')
  } catch {
    ElMessage.error('状态切换失败')
  }
}

async function deleteBuilding(b: Building) {
  try {
    await ElMessageBox.confirm(
      `确认删除楼栋「${b.name}」？该操作不可恢复，相关子系统配置将一并移除。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deletingId.value = b.id
  try {
    await buildingCrudApi.remove(b.id)
    ElMessage.success('楼栋已删除')
    if (selectedId.value === b.id) selectedId.value = null
    await loadBuildings()
    await scene.refreshBuildings()
  } catch {
    ElMessage.error('删除失败')
  } finally {
    deletingId.value = ''
  }
}

// ---------- GK-20：URL ↔ 选中楼栋 双向同步 ----------
// 切楼 → 写 URL（replace，不污染浏览器历史栈）
watch(selectedId, (id) => {
  if (!id) return
  if (String(route.query.building || '') === String(id)) return
  router.replace({ query: { ...route.query, building: String(id) } }).catch(() => { /* 导航重复忽略 */ })
})
// 外部导航改 query（手敲地址栏 / 后退 / 外部链接） → 切楼（沿用 dirty 守卫）
watch(
  () => route.query.building,
  (q) => {
    if (typeof q !== 'string' || !q.trim()) return
    if (String(selectedId.value) === q) return
    const hit =
      buildings.value.find((b) => b.id === q) ||
      buildings.value.find((b) => String(b.code || '').toLowerCase() === q.toLowerCase())
    if (hit) selectBuilding(hit.id)
  },
)

onMounted(loadBuildings)
</script>

<template>
  <div class="bsc">
    <!-- 楼栋列表 -->
    <section class="bsc__buildings kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <div class="bsc__panel-title">
        <Building2 :size="16" /> 楼栋选择
        <button class="bsc__add-btn" @click="createVisible = true">
          <Plus :size="14" /> 添加楼栋
        </button>
      </div>
      <div v-if="loading" class="kp-empty">加载中…</div>
      <ul v-else class="bsc__building-list">
        <li
          v-for="b in buildings"
          :key="b.id"
          class="bsc__building"
          :class="{ active: b.id === selectedId, 'is-off': b.status === 'inactive' }"
          @click="selectBuilding(b.id)"
        >
          <Building2 :size="15" />
          <span class="bsc__building-name">{{ b.name }}</span>
          <span class="bsc__building-code mono">{{ b.code }}</span>
          <el-switch
            :model-value="b.status !== 'inactive'"
            size="small"
            @change="(v: any) => setBuildingStatus(b, v)"
          />
          <button class="bsc__del-btn" title="删除楼栋" @click.stop="deleteBuilding(b)">
            <Trash2 :size="14" />
          </button>
        </li>
      </ul>
    </section>

    <!-- 配置面板 -->
    <section class="bsc__config kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <div class="bsc__panel-title">
        <CheckCircle2 :size="16" /> 子系统启用配置
        <!-- GK-20：楼栋快速定位下拉（可搜索，与左侧列表双向联动） -->
        <el-select
          data-testid="bsc-building-select"
          class="bsc__building-select"
          :model-value="selectedId"
          filterable
          size="small"
          placeholder="搜索楼栋…"
          @change="selectBuilding"
        >
          <el-option
            v-for="b in buildings"
            :key="b.id"
            :label="`${b.name} (${b.floors}F / ${b.gross_area}㎡)`"
            :value="b.id"
          />
        </el-select>
        <span data-testid="bsc-current-building" class="bsc__config-sub">{{ selectedBuilding?.name || '未选择楼栋' }}</span>
      </div>

      <!-- 楼栋名称内联编辑 -->
      <div v-if="selectedBuilding" class="bsc__building-name-edit">
        <span class="bsc__field-label"><Pencil :size="13" /> 楼栋名称</span>
        <el-input
          v-model="buildingNameDraft"
          size="small"
          class="bsc__name-input"
          placeholder="楼栋名称"
          @keyup.enter="saveBuildingName"
        />
        <el-button
          size="small"
          type="primary"
          :loading="buildingNameSaving"
          :disabled="buildingNameDraft.trim() === selectedBuilding.name"
          @click="saveBuildingName"
        >
          保存
        </el-button>
      </div>

      <div class="bsc__config-body">
        <div v-if="!selectedBuilding" class="kp-empty">请选择左侧楼栋进行配置</div>
        <div v-else class="bsc__rows">
          <div v-for="s in SUBSYSTEMS" :key="s.code" class="bsc__row" :data-testid="`bsc-row-${s.code}`">
            <span class="bsc__row-dot" :style="{ background: `var(${s.colorVar})` }" />
            <span class="bsc__row-name">{{ s.name }}</span>
            <span class="bsc__row-code mono">{{ s.code }}</span>
            <el-switch
              v-model="enabledMap[s.code]"
              :active-color="`var(${s.colorVar})`"
              :data-testid="`bsc-switch-${s.code}`"
              @change="onToggle"
            />
            <span class="bsc__row-state" :class="{ on: enabledMap[s.code] }" :data-testid="`bsc-state-${s.code}`">
              {{ enabledMap[s.code] ? '已启用' : '已停用' }}
            </span>
            <!-- 子系统显示名内联编辑 -->
            <el-input
              v-model="labelMap[s.code]"
              size="small"
              class="bsc__label-input"
              placeholder="显示名"
              @keyup.enter="saveLabel(s.code)"
              @blur="saveLabel(s.code)"
            />
            <el-button
              size="small"
              :disabled="!labelChanged(s.code)"
              @click="saveLabel(s.code)"
            >
              改名
            </el-button>
          </div>
        </div>
      </div>

      <div class="bsc__actions">
        <span class="bsc__count">已启用 {{ enabledCount }} / {{ SUBSYSTEMS.length }} 个子系统</span>
        <div class="bsc__actions-btns">
          <button class="bsc__btn" :disabled="!selectedBuilding || saving" @click="resetConfig">
            <RefreshCw :size="14" /> 重置
          </button>
          <button
            class="bsc__btn bsc__btn--primary"
            data-testid="bsc-save"
            :disabled="!selectedBuilding || saving || !dirty"
            @click="save"
          >
            <Save :size="14" /> 保存配置
          </button>
        </div>
      </div>
    </section>

    <!-- 添加楼栋对话框 -->
    <el-dialog v-model="createVisible" title="添加楼栋" width="420px" align-center>
      <el-form label-width="84px" class="bsc-create">
        <el-form-item label="楼栋编码">
          <el-input v-model="createForm.code" placeholder="如 B11（唯一）" />
        </el-form-item>
        <el-form-item label="楼栋名称">
          <el-input v-model="createForm.name" placeholder="如 11号楼·门诊扩建" />
        </el-form-item>
        <el-form-item label="层数">
          <el-input-number v-model="createForm.floors" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="建筑面积">
          <el-input-number v-model="createForm.gross_area" :min="0" :max="500000" :step="500" />
          <span class="bsc-create__unit">㎡</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createBuilding">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bsc {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 18px;
  height: 100%;
}
.bsc__buildings,
.bsc__config {
  position: relative;
  border-radius: var(--kp-radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.bsc__panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--kp-text-md);
  font-weight: 510;
  letter-spacing: var(--kp-tracking-label);
  color: var(--kp-fg);
  margin-bottom: 12px;
}
.bsc__panel-title svg { color: var(--kp-accent); }
.bsc__config-sub { margin-left: auto; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); font-weight: 400; }
/* GK-20：楼栋快速定位下拉 */
.bsc__building-select { width: 268px; margin-left: 14px; }
.bsc__building-select :deep(.el-select__wrapper) { background: var(--kp-surface-raised); }

.bsc__building-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.bsc__building {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  color: var(--kp-fg-muted);
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.bsc__building:hover { color: var(--kp-fg); border-color: var(--kp-border-strong); }
.bsc__building.active { color: var(--kp-accent); border-color: var(--kp-accent); background: var(--kp-glow-soft); }
.bsc__building-name { flex: 1; font-size: var(--kp-text-sm); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bsc__building-code { font-size: var(--kp-text-xs); opacity: 0.8; }
.bsc__building.is-off .bsc__building-name { opacity: 0.5; text-decoration: line-through; }
.bsc__add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: transparent;
  color: var(--kp-accent);
  font-size: var(--kp-text-xs);
  cursor: pointer;
  transition: all var(--kp-motion-fast);
}
.bsc__add-btn:hover { border-color: var(--kp-accent); background: var(--kp-glow-soft); }
.bsc__del-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: var(--kp-radius-sm);
  background: transparent;
  color: var(--kp-fg-muted);
  cursor: pointer;
  transition: all var(--kp-motion-fast);
}
.bsc__del-btn:hover { color: var(--kp-danger); border-color: var(--kp-danger); }
.bsc-create__unit { margin-left: 8px; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }

.bsc__building-name-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
}
.bsc__field-label { display: inline-flex; align-items: center; gap: 4px; font-size: var(--kp-text-sm); color: var(--kp-fg-muted); white-space: nowrap; }
.bsc__name-input { flex: 1; }
.bsc__building-name-edit :deep(.el-input__wrapper) { background: var(--kp-surface-raised); }

.bsc__config-body { flex: 1; min-height: 0; overflow-y: auto; }
.bsc__rows { display: flex; flex-direction: column; gap: 6px; }
.bsc__row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
}
.bsc__row-dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
.bsc__row-name { font-size: var(--kp-text-md); color: var(--kp-fg); }
.bsc__row-code { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.bsc__row-state { width: 56px; text-align: right; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.bsc__row-state.on { color: var(--kp-success); }
.bsc__label-input { width: 150px; }
.bsc__row :deep(.el-input__wrapper) { background: var(--kp-surface-raised); }

.bsc__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--kp-border);
}
.bsc__count { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); }
.bsc__actions-btns { display: flex; gap: 10px; }
.bsc__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--kp-border-strong);
  background: transparent;
  color: var(--kp-fg);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.bsc__btn:hover:not(:disabled) { border-color: var(--kp-accent); color: var(--kp-accent); }
.bsc__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bsc__btn--primary { background: var(--kp-glow-soft); border-color: var(--kp-accent); color: var(--kp-accent); }
</style>

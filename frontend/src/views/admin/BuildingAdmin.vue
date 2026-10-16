<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Building2, Plus, Edit, Trash2, Layers, Cpu } from 'lucide-vue-next'
import { buildingApi, buildingCrudApi, deviceApi } from '@/api'
import type { Building } from '@/types/api'

const router = useRouter()
const loading = ref(false)
const rows = ref<Building[]>([])

const dialogVisible = ref(false)
const dialogSaving = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref()

interface BuildingForm {
  code: string
  name: string
  floors: number | null
  area: number | null
  description: string
}
const emptyForm = (): BuildingForm => ({ code: '', name: '', floors: null, area: null, description: '' })
const form = reactive(emptyForm())

const rules = {
  code: [{ required: true, message: '请输入楼栋编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入楼栋名称', trigger: 'blur' }],
  floors: [{ required: true, message: '请输入层数', trigger: 'blur' }],
}

async function load() {
  loading.value = true
  try {
    const res = await buildingApi.list()
    rows.value = res.items
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

function openEdit(b: Building) {
  editingId.value = b.id
  Object.assign(form, {
    code: b.code,
    name: b.name,
    floors: b.floors,
    area: b.gross_area,
    description: '',
  })
  dialogVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  dialogSaving.value = true
  const body: Record<string, unknown> = {
    code: form.code,
    name: form.name,
    floors: form.floors ?? 0,
    area: form.area ?? 0,
    description: form.description || undefined,
  }
  try {
    if (editingId.value) {
      await buildingCrudApi.update(editingId.value, body)
      ElMessage.success('楼栋已更新')
    } else {
      await buildingCrudApi.create(body)
      ElMessage.success('楼栋已创建')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    dialogSaving.value = false
  }
}

async function remove(b: Building) {
  try {
    await ElMessageBox.confirm(`确认删除楼栋「${b.name}」（${b.code}）？该楼栋子系统配置将级联清除。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await buildingCrudApi.remove(b.id)
    ElMessage.success('楼栋已删除')
    load()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

// =====================================================
// 楼层配置：每栋大楼按楼层查看 / 配置设备
// =====================================================
const activeTab = ref<'list' | 'floor'>('list')
const floorBuildingId = ref<string>('')
const floorLoading = ref(false)
const floorCounts = ref<Record<number, number>>({})

const selectedBuilding = computed<Building | undefined>(() =>
  rows.value.find((b) => b.id === floorBuildingId.value) || rows.value[0],
)
const floorList = computed(() => {
  const f = selectedBuilding.value?.floors ? Number(selectedBuilding.value.floors) : 0
  return Array.from({ length: f }, (_, i) => i + 1).map((floor) => ({
    floor,
    count: floorCounts.value[floor] || 0,
  }))
})

async function loadFloorCounts() {
  if (!floorBuildingId.value) return
  floorLoading.value = true
  try {
    const res = await deviceApi.list({ building_id: floorBuildingId.value, limit: 999 })
    const map: Record<number, number> = {}
    for (const d of res.items) {
      const f = d.location?.floor ?? 0
      map[f] = (map[f] || 0) + 1
    }
    floorCounts.value = map
  } catch {
    floorCounts.value = {}
  } finally {
    floorLoading.value = false
  }
}

// 跳转到设备台账，按楼栋+楼层预置筛选（new=1 时自动打开新增）
function goManageFloor(floor: number) {
  router.push({ path: '/admin/device', query: { building: floorBuildingId.value, floor: String(floor) } })
}
function goAddFloor(floor: number) {
  router.push({
    path: '/admin/device',
    query: { building: floorBuildingId.value, floor: String(floor), new: '1' },
  })
}

watch(floorBuildingId, loadFloorCounts)

onMounted(async () => {
  await load()
  floorBuildingId.value = rows.value[0]?.id || ''
  loadFloorCounts()
})
</script>

<template>
  <div class="admin-page">
    <el-tabs v-model="activeTab" class="building-tabs">
      <!-- 楼栋列表 -->
      <el-tab-pane label="楼栋列表" name="list">
        <div class="admin-toolbar">
          <Building2 :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">楼栋管理</span>
          <div class="admin-toolbar__filters">
            <el-button type="primary" :icon="Plus" @click="openCreate">新增楼栋</el-button>
          </div>
        </div>

        <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="code" label="楼栋编码" width="150" />
          <el-table-column prop="name" label="楼栋名称" min-width="180" />
          <el-table-column prop="floors" label="层数" width="100" />
          <el-table-column label="建筑面积(m²)" width="140">
            <template #default="{ row }">{{ row.gross_area }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                {{ row.status === 'active' ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="remove(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 楼层配置 -->
      <el-tab-pane label="楼层配置" name="floor">
        <div class="admin-toolbar">
          <Layers :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">按楼层配置设备</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="floorBuildingId" placeholder="选择楼栋" style="width: 220px">
              <el-option v-for="b in rows" :key="b.id" :label="`${b.name}（${b.floors} 层）`" :value="b.id" />
            </el-select>
          </div>
        </div>

        <div class="floor-cfg" v-loading="floorLoading">
          <div v-if="!floorList.length" class="kp-empty">该楼栋暂无楼层，请先在「楼栋列表」设置层数。</div>
          <div v-for="g in floorList" :key="g.floor" class="floor-card">
            <div class="floor-card__head">
              <span class="floor-card__no">{{ g.floor }}<i>F</i></span>
              <span class="floor-card__meta">{{ g.count }} 台设备</span>
            </div>
            <div class="floor-card__actions">
              <el-button size="small" :icon="Cpu" @click="goManageFloor(g.floor)">管理设备</el-button>
              <el-button size="small" type="primary" :icon="Plus" @click="goAddFloor(g.floor)">新增设备</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑楼栋' : '新增楼栋'"
      width="520px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" class="building-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="楼栋编码" prop="code">
              <el-input v-model="form.code" :disabled="!!editingId" placeholder="如 B01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="楼栋名称" prop="name">
              <el-input v-model="form.name" placeholder="如 1号楼·120急救" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="层数" prop="floors">
              <el-input-number v-model="form.floors" :min="1" :max="99" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="建筑面积" prop="area">
              <el-input-number v-model="form.area" :min="0" :step="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="楼栋用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.building-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.building-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.building-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.admin-table { flex: 1; min-height: 0; }

/* 楼层配置卡片墙 */
.floor-cfg {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  align-content: start;
  padding: 4px;
}
.floor-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  background: linear-gradient(180deg, rgba(11, 24, 39, 0.72), rgba(4, 16, 31, 0.55));
  box-shadow: 0 0 18px rgba(var(--kp-accent-rgb), 0.12), inset 0 0 24px rgba(var(--kp-accent-rgb), 0.05);
}
.floor-card__head { display: flex; align-items: baseline; gap: 10px; }
.floor-card__no {
  font-family: var(--kp-font-mono);
  font-size: var(--kp-text-3xl);
  font-weight: 600;
  color: var(--kp-accent);
  text-shadow: 0 0 12px var(--kp-glow);
  line-height: 1;
}
.floor-card__no i { font-size: var(--kp-text-md); font-style: normal; margin-left: 2px; color: var(--kp-fg-muted); }
.floor-card__meta { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); }
.floor-card__actions { display: flex; gap: 8px; }
.floor-card__actions .el-button { flex: 1; }
</style>

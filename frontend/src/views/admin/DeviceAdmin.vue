<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Cpu, Plus, Edit, Trash2, Tag, Building2, Layers } from 'lucide-vue-next'
import { buildingApi, deviceApi, deviceCrudApi, deviceTypeApi, deviceBrandApi } from '@/api'
import type {
  Building,
  Device,
  DeviceStatus,
  DeviceCategory,
  DeviceConnectionType,
  DeviceType,
  DeviceBrand,
} from '@/types/api'
import {
  CONNECTION_TYPES,
  DEVICE_CATEGORIES,
} from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'

// 当前激活的子页签：设备台账 / 设备类型 / 设备品牌
const activeTab = ref<'ledger' | 'type' | 'brand'>('ledger')

// 路由对象必须在 setup 顶层获取（在 async onMounted 内 await 之后调用 useRoute 会因
// currentInstance 已清空而返回 undefined，导致 route.query 抛错、onMounted 中断、列表不加载）
const route = useRoute()

// =====================================================
// 一、设备台账
// =====================================================
const loading = ref(false)
const rows = ref<Device[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(15)
const buildingOptions = ref<Building[]>([])
const filterBuilding = ref<string>('')
const filterStatus = ref<string>('')
const filterFloor = ref<number | ''>('')
const groupByFloor = ref(false)

const STATUS_MAP: Record<DeviceStatus, { text: string; type: 'success' | 'info' | 'warning' | 'danger' }> = {
  running: { text: '运行中', type: 'success' },
  stopped: { text: '已停止', type: 'info' },
  fault: { text: '故障', type: 'danger' },
  offline: { text: '离线', type: 'info' },
  maintenance: { text: '检修中', type: 'warning' },
}

const buildingNameMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  buildingOptions.value.forEach((b) => (m[b.id] = b.name))
  return m
})
const subsystemNameMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  SUBSYSTEMS.forEach((s) => (m[s.code] = s.name))
  return m
})

// ---------- 新增 / 编辑 对话框 ----------
const dialogVisible = ref(false)
const dialogSaving = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref()

interface DeviceForm {
  code: string
  name: string
  model: string
  manufacturer: string
  category: DeviceCategory
  building_id: string
  floor: number | null
  room: string
  status: DeviceStatus
  connection: { type: DeviceConnectionType; endpoint: string; gateway: string }
  subsystem: string
}

const emptyForm = (): DeviceForm => ({
  code: '',
  name: '',
  model: '',
  manufacturer: '',
  category: DEVICE_CATEGORIES[0] as DeviceCategory,
  building_id: '',
  floor: null,
  room: '',
  status: 'running',
  connection: { type: 'MQTT' as DeviceConnectionType, endpoint: '', gateway: '' },
  subsystem: SUBSYSTEMS[0].code,
})
const form = reactive(emptyForm())

function resetForm() {
  Object.assign(form, emptyForm())
}

const rules = {
  code: [{ required: true, message: '请输入设备编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  building_id: [{ required: true, message: '请选择所属楼栋', trigger: 'change' }],
  subsystem: [{ required: true, message: '请选择子系统', trigger: 'change' }],
  category: [{ required: true, message: '请选择设备类型', trigger: 'change' }],
  endpoint: [{ required: true, message: '请输入连接端点', trigger: 'blur' }],
}

async function loadLedger() {
  loading.value = true
  try {
    const res = await deviceApi.list({
      building_id: filterBuilding.value || undefined,
      status: filterStatus.value || undefined,
      floor: filterFloor.value === '' ? undefined : Number(filterFloor.value),
      page: page.value,
      limit: limit.value,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 选中楼栋后，可过滤的楼层范围（1..该楼栋层数）
const buildingFloors = computed<number[]>(() => {
  if (!filterBuilding.value) return []
  const b = buildingOptions.value.find((x) => x.id === filterBuilding.value)
  const f = b?.floors ? Number(b.floors) : 0
  return Array.from({ length: f }, (_, i) => i + 1)
})

// 按楼层分组展示（前端显示按楼层聚合）
const floorGroups = computed(() => {
  const map = new Map<number, Device[]>()
  for (const d of rows.value) {
    const f = d.location?.floor ?? 0
    if (!map.has(f)) map.set(f, [])
    map.get(f)!.push(d)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([floor, items]) => ({ floor, items }))
})

function onFilterChange() {
  page.value = 1
  loadLedger()
}

const seqNo = (index: number) => (page.value - 1) * limit.value + index + 1

function openCreate() {
  editingId.value = null
  resetForm()
  if (filterBuilding.value) form.building_id = filterBuilding.value
  else if (buildingOptions.value.length) form.building_id = buildingOptions.value[0].id
  dialogVisible.value = true
}

function openEdit(d: Device) {
  editingId.value = d.id
  Object.assign(form, {
    code: d.code,
    name: d.name,
    model: d.model,
    manufacturer: d.manufacturer,
    category: (DEVICE_CATEGORIES as readonly string[]).includes(d.category_id)
      ? (d.category_id as DeviceCategory)
      : DEVICE_CATEGORIES[0],
    building_id: d.building_id,
    floor: d.location?.floor ?? null,
    room: d.location?.room ?? '',
    status: d.status,
    connection: {
      type: 'MQTT' as DeviceConnectionType,
      endpoint: '',
      gateway: '',
    },
    subsystem: d.subsystem_id,
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
    model: form.model,
    manufacturer: form.manufacturer,
    category: form.category,
    building_id: form.building_id,
    location: { floor: form.floor ?? 0, room: form.room },
    status: form.status,
    connection: {
      type: form.connection.type,
      endpoint: form.connection.endpoint,
      ...(form.connection.gateway ? { gateway: form.connection.gateway } : {}),
    },
    subsystem: form.subsystem,
  }
  try {
    if (editingId.value) {
      await deviceCrudApi.update(editingId.value, body)
      ElMessage.success('设备已更新')
    } else {
      await deviceCrudApi.create(body)
      ElMessage.success('设备已创建')
    }
    dialogVisible.value = false
    loadLedger()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    dialogSaving.value = false
  }
}

async function remove(d: Device) {
  try {
    await ElMessageBox.confirm(`确认删除设备「${d.name}」（${d.code}）？该操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deviceCrudApi.remove(d.id)
    ElMessage.success('设备已删除')
    loadLedger()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

// =====================================================
// 二、设备类型
// =====================================================
const typeLoading = ref(false)
const types = ref<DeviceType[]>([])
const typeDialog = ref(false)
const typeSaving = ref(false)
const typeEditingId = ref<string | null>(null)
const typeRef = ref()
const typeForm = reactive({ name: '', description: '', brandIds: [] as string[] })
const typeRules = { name: [{ required: true, message: '请输入类型名称', trigger: 'blur' }] }

const brandNameMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  brands.value.forEach((b) => (m[b.id] = b.name))
  return m
})

async function loadTypes() {
  typeLoading.value = true
  try {
    const res = await deviceTypeApi.list()
    types.value = res.items
  } catch {
    types.value = []
  } finally {
    typeLoading.value = false
  }
}
function openTypeCreate() {
  typeEditingId.value = null
  Object.assign(typeForm, { name: '', description: '', brandIds: [] as string[] })
  typeDialog.value = true
}
function openTypeEdit(t: DeviceType) {
  typeEditingId.value = t.id
  Object.assign(typeForm, {
    name: t.name,
    description: t.description || '',
    brandIds: Array.isArray(t.brand_ids) ? (t.brand_ids as string[]).slice() : [],
  })
  typeDialog.value = true
}
async function submitType() {
  if (!typeRef.value) return
  try {
    await typeRef.value.validate()
  } catch {
    return
  }
  typeSaving.value = true
  const body = {
    name: typeForm.name,
    description: typeForm.description || undefined,
    brand_ids: [...typeForm.brandIds],
  }
  try {
    if (typeEditingId.value) {
      await deviceTypeApi.update(typeEditingId.value, body)
      ElMessage.success('设备类型已更新')
    } else {
      await deviceTypeApi.create(body)
      ElMessage.success('设备类型已创建')
    }
    typeDialog.value = false
    loadTypes()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    typeSaving.value = false
  }
}
async function removeType(t: DeviceType) {
  try {
    await ElMessageBox.confirm(`确认删除设备类型「${t.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deviceTypeApi.remove(t.id)
    ElMessage.success('设备类型已删除')
    loadTypes()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

// =====================================================
// 三、设备品牌
// =====================================================
const brandLoading = ref(false)
const brands = ref<DeviceBrand[]>([])
const brandDialog = ref(false)
const brandSaving = ref(false)
const brandEditingId = ref<string | null>(null)
const brandRef = ref()
const brandForm = reactive({ name: '', description: '' })
const brandRules = { name: [{ required: true, message: '请输入品牌名称', trigger: 'blur' }] }

async function loadBrands() {
  brandLoading.value = true
  try {
    const res = await deviceBrandApi.list()
    brands.value = res.items
  } catch {
    brands.value = []
  } finally {
    brandLoading.value = false
  }
}
function openBrandCreate() {
  brandEditingId.value = null
  Object.assign(brandForm, { name: '', description: '' })
  brandDialog.value = true
}
function openBrandEdit(b: DeviceBrand) {
  brandEditingId.value = b.id
  Object.assign(brandForm, { name: b.name, description: b.description || '' })
  brandDialog.value = true
}
async function submitBrand() {
  if (!brandRef.value) return
  try {
    await brandRef.value.validate()
  } catch {
    return
  }
  brandSaving.value = true
  const body = { name: brandForm.name, description: brandForm.description || undefined }
  try {
    if (brandEditingId.value) {
      await deviceBrandApi.update(brandEditingId.value, body)
      ElMessage.success('设备品牌已更新')
    } else {
      await deviceBrandApi.create(body)
      ElMessage.success('设备品牌已创建')
    }
    brandDialog.value = false
    loadBrands()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    brandSaving.value = false
  }
}
async function removeBrand(b: DeviceBrand) {
  try {
    await ElMessageBox.confirm(`确认删除设备品牌「${b.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deviceBrandApi.remove(b.id)
    ElMessage.success('设备品牌已删除')
    loadBrands()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

onMounted(async () => {
  try {
    buildingOptions.value = (await buildingApi.list()).items
  } catch {
    buildingOptions.value = []
  }
  // 支持从「楼栋管理-楼层配置」携带 building / floor 进入并预置筛选
  if (route.query.building) filterBuilding.value = String(route.query.building)
  if (route.query.floor) filterFloor.value = Number(route.query.floor)
  loadLedger()
  loadTypes()
  loadBrands()
  if (route.query.new === '1') openCreate()
})

watch(page, loadLedger)
</script>

<template>
  <div class="admin-page">
    <el-tabs v-model="activeTab" class="device-tabs">
      <!-- 设备台账 -->
      <el-tab-pane label="设备台账" name="ledger">
        <div class="admin-toolbar">
          <Cpu :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">设备台账</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="filterBuilding" placeholder="全部楼栋" clearable style="width: 180px" @change="onFilterChange">
              <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
            <el-select
              v-model="filterFloor"
              placeholder="全部楼层"
              clearable
              :disabled="!buildingFloors.length"
              style="width: 130px"
              @change="onFilterChange"
            >
              <el-option v-for="f in buildingFloors" :key="f" :label="`${f} 层`" :value="f" />
            </el-select>
            <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 140px" @change="onFilterChange">
              <el-option v-for="(v, k) in STATUS_MAP" :key="k" :label="v.text" :value="k" />
            </el-select>
            <el-button :type="groupByFloor ? 'primary' : 'default'" :icon="Layers" @click="groupByFloor = !groupByFloor">
              按楼层分组
            </el-button>
            <el-button type="primary" :icon="Plus" @click="openCreate">新增设备</el-button>
          </div>
        </div>

        <!-- 按楼层分组展示 -->
        <div v-if="groupByFloor" class="floor-groups">
          <div v-for="g in floorGroups" :key="g.floor" class="floor-group">
            <div class="floor-group__title">
              <Building2 :size="15" />
              <span>{{ g.floor }} 层</span>
              <span class="floor-group__count">{{ g.items.length }} 台设备</span>
            </div>
            <div class="floor-group__list">
              <div v-for="d in g.items" :key="d.id" class="floor-device">
                <span class="floor-device__code">{{ d.code }}</span>
                <span class="floor-device__name">{{ d.name }}</span>
                <span class="floor-device__sub">{{ subsystemNameMap[d.subsystem_id] || d.subsystem_id }}</span>
                <el-tag :type="STATUS_MAP[d.status as DeviceStatus].type" size="small">
                  {{ STATUS_MAP[d.status as DeviceStatus].text }}
                </el-tag>
                <span class="floor-device__room">房间 {{ d.location?.room || '—' }}</span>
                <span class="kp-action-link" @click="openEdit(d)">编辑</span>
                <span class="kp-sep" />
                <span class="kp-action-link kp-action-link--danger" @click="remove(d)">删除</span>
              </div>
              <div v-if="!g.items.length" class="kp-empty">该楼层暂无设备</div>
            </div>
          </div>
        </div>

        <el-table v-else :data="rows" v-loading="loading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" fixed>
            <template #default="{ $index }">{{ seqNo($index) }}</template>
          </el-table-column>
          <el-table-column prop="code" label="设备编码" width="150" />
          <el-table-column prop="name" label="设备名称" min-width="150" />
          <el-table-column prop="model" label="型号" width="120" />
          <el-table-column prop="manufacturer" label="厂商" width="120" />
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ row.category_id }}</template>
          </el-table-column>
          <el-table-column label="子系统" width="120">
            <template #default="{ row }">{{ subsystemNameMap[row.subsystem_id] || row.subsystem_id }}</template>
          </el-table-column>
          <el-table-column label="楼栋" width="130">
            <template #default="{ row }">{{ buildingNameMap[row.building_id] || row.building_id }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="STATUS_MAP[row.status as DeviceStatus].type" size="small">
                {{ STATUS_MAP[row.status as DeviceStatus].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="位置" width="110">
            <template #default="{ row }">{{ row.location?.floor }}F {{ row.location?.room }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="remove(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="admin-pager">
          <el-pagination
            v-model:current-page="page"
            :page-size="limit"
            :total="total"
            layout="total, prev, pager, next"
            background
          />
        </div>
      </el-tab-pane>

      <!-- 设备类型 -->
      <el-tab-pane label="设备类型" name="type">
        <div class="admin-toolbar">
          <Tag :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">设备类型</span>
          <div class="admin-toolbar__filters">
            <el-button type="primary" :icon="Plus" @click="openTypeCreate">新增类型</el-button>
          </div>
        </div>
        <el-table :data="types" v-loading="typeLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="180" />
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="关联品牌" min-width="220">
            <template #default="{ row }">
              <template v-if="(row.brand_ids || []).length">
                <el-tag v-for="bid in row.brand_ids" :key="bid" size="small" class="brand-tag">{{ brandNameMap[bid] || bid }}</el-tag>
              </template>
              <span v-else style="color: var(--kp-fg-muted)">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openTypeEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeType(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 设备品牌 -->
      <el-tab-pane label="设备品牌" name="brand">
        <div class="admin-toolbar">
          <Building2 :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">设备品牌</span>
          <div class="admin-toolbar__filters">
            <el-button type="primary" :icon="Plus" @click="openBrandCreate">新增品牌</el-button>
          </div>
        </div>
        <el-table :data="brands" v-loading="brandLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="name" label="品牌名称" min-width="180" />
          <el-table-column prop="description" label="描述" min-width="260" show-overflow-tooltip />
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openBrandEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeBrand(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 设备台账对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑设备' : '新增设备'"
      width="640px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" class="device-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="设备编码" prop="code">
              <el-input v-model="form.code" placeholder="如 DEV-A101" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备名称" prop="name">
              <el-input v-model="form.name" placeholder="如 1号楼中央空调" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="型号" prop="model">
              <el-input v-model="form.model" placeholder="如 YK-200" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="厂商" prop="manufacturer">
              <el-input v-model="form.manufacturer" placeholder="如 美的" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备类型" prop="category">
              <el-select v-model="form.category" style="width: 100%">
                <el-option v-for="c in DEVICE_CATEGORIES" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属楼栋" prop="building_id">
              <el-select v-model="form.building_id" style="width: 100%">
                <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="子系统" prop="subsystem">
              <el-select v-model="form.subsystem" style="width: 100%">
                <el-option v-for="s in SUBSYSTEMS" :key="s.code" :label="s.name" :value="s.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" style="width: 100%">
                <el-option v-for="(v, k) in STATUS_MAP" :key="k" :label="v.text" :value="k" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="楼层" prop="floor">
              <el-input-number v-model="form.floor" :min="0" :max="99" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="房间号" prop="room">
              <el-input v-model="form.room" placeholder="如 301" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">连接配置</el-divider>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="连接类型" prop="connection.type">
              <el-select v-model="form.connection.type" style="width: 100%">
                <el-option v-for="t in CONNECTION_TYPES" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="端点" prop="endpoint">
              <el-input v-model="form.connection.endpoint" placeholder="如 tcp://192.168.1.10:502" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="网关(可选)" prop="gateway">
              <el-input v-model="form.connection.gateway" placeholder="如 gw-01（绑定真实网关）" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设备类型对话框 -->
    <el-dialog
      v-model="typeDialog"
      :title="typeEditingId ? '编辑设备类型' : '新增设备类型'"
      width="480px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="typeRef" :model="typeForm" :rules="typeRules" label-width="88px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="typeForm.name" placeholder="如 分体机空调" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="typeForm.description" type="textarea" :rows="3" placeholder="类型说明" />
        </el-form-item>
        <el-form-item label="关联品牌">
          <el-select
            v-model="typeForm.brandIds"
            multiple
            filterable
            placeholder="可关联多个设备品牌"
            style="width: 100%"
          >
            <el-option v-for="b in brands" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialog = false">取消</el-button>
        <el-button type="primary" :loading="typeSaving" @click="submitType">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设备品牌对话框 -->
    <el-dialog
      v-model="brandDialog"
      :title="brandEditingId ? '编辑设备品牌' : '新增设备品牌'"
      width="480px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="brandRef" :model="brandForm" :rules="brandRules" label-width="88px">
        <el-form-item label="品牌名称" prop="name">
          <el-input v-model="brandForm.name" placeholder="如 美的" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="brandForm.description" type="textarea" :rows="3" placeholder="品牌说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="brandDialog = false">取消</el-button>
        <el-button type="primary" :loading="brandSaving" @click="submitBrand">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.device-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.device-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.device-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.admin-table { flex: 1; min-height: 0; }
.admin-pager { display: flex; justify-content: flex-end; }
.brand-tag { margin: 0 4px 4px 0; }
.device-form :deep(.el-divider__text) { color: var(--kp-fg-muted); font-size: var(--kp-text-sm); }

/* 按楼层分组展示 */
.floor-groups { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-right: 4px; }
.floor-group { border: 1px solid var(--kp-border); border-radius: var(--kp-radius-md); background: var(--kp-surface); overflow: hidden; }
.floor-group__title { display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: var(--kp-text-md); font-weight: 560; letter-spacing: 1px; color: var(--kp-fg); background: var(--kp-glow-soft); border-bottom: 1px solid var(--kp-border); }
.floor-group__title svg { color: var(--kp-accent); }
.floor-group__count { margin-left: auto; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.floor-group__list { padding: 8px 14px; display: flex; flex-direction: column; gap: 6px; }
.floor-device { display: flex; align-items: center; gap: 12px; padding: 6px 10px; border: 1px solid var(--kp-border); border-radius: var(--kp-radius-sm); background: var(--kp-glow-soft); }
.floor-device__code { font-family: var(--kp-font-mono); font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.floor-device__name { font-size: var(--kp-text-sm); color: var(--kp-fg); }
.floor-device__sub { font-size: var(--kp-text-xs); color: var(--kp-accent); }
.floor-device :deep(.el-tag) { margin-left: auto; }
.floor-device__room { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
</style>

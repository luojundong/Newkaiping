<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  BellRing,
  Users,
  ClipboardList,
  ListChecks,
  Power,
  PowerOff,
  Wallet,
  Plus,
  Edit,
  Trash2,
  SlidersHorizontal,
  Building2,
  Cpu,
  RefreshCw,
  MonitorSmartphone,
} from 'lucide-vue-next'
import {
  buildingApi,
  deviceApi,
  controlGroupApi,
  workOrderApi,
  billingApi,
  alarmApi,
} from '@/api'
import type {
  Building,
  Device,
  Metric,
  ControlGroup,
  WorkOrder,
  WorkOrderStats,
  WorkOrderStatus,
  Alarm,
  AlarmLevel,
  AlarmStatus,
  BillingQuota,
  BillingQuotaScope,
  ControlCommand,
} from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'
import { ALARM_RULE_LEVELS, WORK_ORDER_STATUSES, BILLING_QUOTA_SCOPES, CATEGORY_LABELS, METRIC_LABELS } from '@/types/api'
import RemoteControlDialog from '@/components/RemoteControlDialog.vue'

const activeTab = ref<'realtime' | 'alarm' | 'group' | 'order' | 'todo'>('realtime')

// 共享数据
const buildings = ref<Building[]>([])
const buildingMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  buildings.value.forEach((b) => (m[b.id] = b.name))
  return m
})
const allDevices = ref<Device[]>([])
const deviceMap = computed<Record<string, Device>>(() => {
  const m: Record<string, Device> = {}
  allDevices.value.forEach((d) => (m[d.id] = d))
  return m
})
const subsystemNameMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  SUBSYSTEMS.forEach((s) => (m[s.code] = s.name))
  return m
})

// =====================================================
// 一、实时监控
// =====================================================
const realtimeBuilding = ref<string>('')
const realtimeSearch = ref('')
const realtimeDevices = computed(() => {
  const kw = realtimeSearch.value.trim().toLowerCase()
  return allDevices.value.filter((d) => {
    if (realtimeBuilding.value && d.building_id !== realtimeBuilding.value) return false
    if (!kw) return true
    return (d.name || '').toLowerCase().includes(kw) || (d.code || '').toLowerCase().includes(kw)
  })
})
const selectedDeviceId = ref<string | null>(null)
const selectedDevice = computed<Device | null>(() =>
  selectedDeviceId.value ? deviceMap.value[selectedDeviceId.value] || null : null,
)
const metrics = ref<Metric[]>([])
const metricsLoading = ref(false)

// 设备状态中文映射（与设备管理 STATUS_MAP 一致）
const STATUS_TEXT: Record<string, string> = {
  running: '运行中',
  stopped: '已停止',
  fault: '故障',
  offline: '离线',
  maintenance: '检修中',
}
// 设备状态 → el-tag type（与其他 admin 表格保持一致）
const STATUS_TAG_TYPE: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  running: 'success',
  stopped: 'info',
  fault: 'danger',
  offline: 'info',
  maintenance: 'warning',
}

// 遥控器弹窗状态（设备/群组两种来源）
const remoteVisible = ref(false)
const remoteDevice = ref<Device | null>(null)
const remoteGroup = ref<ControlGroup | null>(null)
function openRemote(d: Device) {
  remoteDevice.value = d
  remoteGroup.value = null
  remoteVisible.value = true
}
function openRemoteGroup(g: ControlGroup) {
  remoteGroup.value = g
  remoteDevice.value = null
  remoteVisible.value = true
}

// 计费联动
const prices = ref<Record<string, unknown>[]>([])
const quotas = ref<BillingQuota[]>([])
const quotaDialog = ref(false)
const quotaSaving = ref(false)
const quotaEditingId = ref<string | null>(null)
const quotaForm = reactive<{
  scope: BillingQuotaScope
  ref_id: string
  quota_kwh: number
  warning_pct: number
}>({ scope: 'device', ref_id: '', quota_kwh: 0, warning_pct: 80 })

const deviceQuota = computed<BillingQuota | null>(() => {
  const d = selectedDevice.value
  if (!d) return null
  return (
    quotas.value.find((q) => q.scope === 'device' && q.ref_id === d.id) ||
    quotas.value.find((q) => q.scope === 'building' && q.ref_id === d.building_id) ||
    null
  )
})

async function selectDevice(id: string) {
  selectedDeviceId.value = id
  await loadMetrics(id)
}
async function loadMetrics(id: string) {
  metricsLoading.value = true
  try {
    const res = await deviceApi.metricsLatest(id)
    metrics.value = res.metrics
  } catch {
    metrics.value = []
  } finally {
    metricsLoading.value = false
  }
}

function openQuotaDialog() {
  const d = selectedDevice.value
  if (!d) return
  const existing = deviceQuota.value
  if (existing) {
    quotaEditingId.value = existing.id
    quotaForm.scope = existing.scope
    quotaForm.ref_id = existing.ref_id
    quotaForm.quota_kwh = existing.quota_kwh
    quotaForm.warning_pct = existing.warning_pct
  } else {
    quotaEditingId.value = null
    quotaForm.scope = 'device'
    quotaForm.ref_id = d.id
    quotaForm.quota_kwh = 0
    quotaForm.warning_pct = 80
  }
  quotaDialog.value = true
}
async function submitQuota() {
  quotaSaving.value = true
  const body = {
    scope: quotaForm.scope,
    ref_id: quotaForm.ref_id,
    period: 'month',
    quota_kwh: quotaForm.quota_kwh,
    warning_pct: quotaForm.warning_pct,
  }
  try {
    if (quotaEditingId.value) {
      await billingApi.updateQuota(quotaEditingId.value, body)
      ElMessage.success('配额已更新')
    } else {
      await billingApi.createQuota(body)
      ElMessage.success('配额已创建')
    }
    quotaDialog.value = false
    await loadQuotas()
  } catch (e) {
    ElMessage.error((e as Error).message || '配额保存失败')
  } finally {
    quotaSaving.value = false
  }
}

async function loadQuotas() {
  try {
    quotas.value = (await billingApi.quotas()) as unknown as BillingQuota[]
  } catch {
    quotas.value = []
  }
}
async function loadPrices() {
  try {
    prices.value = (await billingApi.prices()) as unknown as Record<string, unknown>[]
  } catch {
    prices.value = []
  }
}

// =====================================================
// 二、实时告警
// =====================================================
const alarmFilterLevel = ref<string>('')
const alarmFilterBuilding = ref<string>('')
const alarmDeviceName = ref('')
const alarmDeviceType = ref('')
const alarms = ref<Alarm[]>([])
const alarmLoading = ref(false)

const ALARM_LEVEL_MAP: Record<AlarmLevel, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  critical: { text: '严重', type: 'danger' },
  warning: { text: '预警', type: 'warning' },
  info: { text: '提示', type: 'info' },
}
const ALARM_STATUS_MAP: Record<AlarmStatus, { text: string; type: 'success' | 'info' | 'warning' | 'danger' }> = {
  active: { text: '活动', type: 'warning' },
  acknowledged: { text: '已确认', type: 'info' },
  cleared: { text: '已清除', type: 'success' },
  suppressed: { text: '已抑制', type: 'info' },
}

const filteredAlarms = computed(() =>
  alarms.value.filter((a) => {
    const d = deviceMap.value[a.device_id]
    if (alarmDeviceName.value && !(d?.name || '').includes(alarmDeviceName.value)) return false
    if (alarmDeviceType.value && !(d?.category_id || '').includes(alarmDeviceType.value)) return false
    return true
  }),
)

async function loadAlarms() {
  alarmLoading.value = true
  try {
    const res = await alarmApi.list({
      level: alarmFilterLevel.value || undefined,
      building_id: alarmFilterBuilding.value || undefined,
    })
    alarms.value = res.items
  } catch {
    alarms.value = []
  } finally {
    alarmLoading.value = false
  }
}
async function ackAlarm(a: Alarm) {
  try {
    await alarmApi.ack(a.id)
    ElMessage.success('告警已确认')
    loadAlarms()
  } catch {
    ElMessage.error('确认失败')
  }
}
async function clearAlarm(a: Alarm) {
  try {
    await alarmApi.clear(a.id)
    ElMessage.success('告警已清除')
    loadAlarms()
  } catch {
    ElMessage.error('清除失败')
  }
}

// =====================================================
// 三、群组控制
// =====================================================
const groups = ref<ControlGroup[]>([])
const groupLoading = ref(false)
const groupDialog = ref(false)
const groupSaving = ref(false)
const groupEditingId = ref<string | null>(null)
const groupForm = reactive<{
  name: string
  description: string
  building_ids: string[]
  device_ids: string[]
}>({ name: '', description: '', building_ids: [], device_ids: [] })
const groupFormRef = ref()

function memberCount(g: ControlGroup): number {
  return (g.device_ids || []).length
}
async function loadGroups() {
  groupLoading.value = true
  try {
    const res = await controlGroupApi.list()
    groups.value = res.items
  } catch {
    groups.value = []
  } finally {
    groupLoading.value = false
  }
}
function openGroupCreate() {
  groupEditingId.value = null
  Object.assign(groupForm, { name: '', description: '', building_ids: [], device_ids: [] })
  groupDialog.value = true
}
function openGroupEdit(g: ControlGroup) {
  groupEditingId.value = g.id
  Object.assign(groupForm, {
    name: g.name,
    description: g.description || '',
    building_ids: [...(g.building_ids || [])],
    device_ids: [...(g.device_ids || [])],
  })
  groupDialog.value = true
}
async function submitGroup() {
  groupSaving.value = true
  const body = {
    name: groupForm.name,
    description: groupForm.description || undefined,
    building_ids: groupForm.building_ids,
    device_ids: groupForm.device_ids,
  }
  try {
    if (groupEditingId.value) {
      await controlGroupApi.update(groupEditingId.value, body)
      ElMessage.success('群组已更新')
    } else {
      await controlGroupApi.create(body)
      ElMessage.success('群组已创建')
    }
    groupDialog.value = false
    loadGroups()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    groupSaving.value = false
  }
}
async function removeGroup(g: ControlGroup) {
  try {
    await ElMessageBox.confirm(`确认删除群组「${g.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await controlGroupApi.remove(g.id)
    ElMessage.success('群组已删除')
    loadGroups()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}
async function groupControl(g: ControlGroup, action: string) {
  try {
    await controlGroupApi.control(g.id, { action, payload: {} })
    ElMessage.success(`群组「${g.name}」已下发${action}`)
  } catch (e) {
    ElMessage.error((e as Error).message || '指令下发失败')
  }
}

// =====================================================
// 四、工单管理
// =====================================================
const orders = ref<WorkOrder[]>([])
const orderLoading = ref(false)
const orderDialog = ref(false)
const orderSaving = ref(false)
const orderEditingId = ref<string | null>(null)
const orderFormRef = ref()
const orderForm = reactive<{
  title: string
  description: string
  assignee: string
  building_id: string
  product_type: string
  device_id: string
  status: WorkOrderStatus
}>({
  title: '',
  description: '',
  assignee: '',
  building_id: '',
  product_type: '',
  device_id: '',
  status: 'pending',
})
const orderRules = {
  title: [{ required: true, message: '请输入工单标题', trigger: 'blur' }],
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const res = await workOrderApi.list()
    orders.value = res.items
  } catch {
    orders.value = []
  } finally {
    orderLoading.value = false
  }
}
function openOrderCreate() {
  orderEditingId.value = null
  Object.assign(orderForm, {
    title: '',
    description: '',
    assignee: '',
    building_id: '',
    product_type: '',
    device_id: '',
    status: 'pending',
  })
  orderDialog.value = true
}
function openOrderEdit(o: WorkOrder) {
  orderEditingId.value = o.id
  Object.assign(orderForm, {
    title: o.title,
    description: o.description || '',
    assignee: o.assignee || '',
    building_id: o.building_id || '',
    product_type: o.product_type || '',
    device_id: o.device_id || '',
    status: o.status,
  })
  orderDialog.value = true
}
async function submitOrder() {
  if (!orderFormRef.value) return
  try {
    await orderFormRef.value.validate()
  } catch {
    return
  }
  orderSaving.value = true
  const body = {
    title: orderForm.title,
    description: orderForm.description || undefined,
    assignee: orderForm.assignee || undefined,
    building_id: orderForm.building_id || undefined,
    product_type: orderForm.product_type || undefined,
    device_id: orderForm.device_id || undefined,
    status: orderForm.status,
  }
  try {
    if (orderEditingId.value) {
      await workOrderApi.update(orderEditingId.value, body)
      ElMessage.success('工单已更新')
    } else {
      await workOrderApi.create(body)
      ElMessage.success('工单已创建')
    }
    orderDialog.value = false
    loadOrders()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    orderSaving.value = false
  }
}
async function removeOrder(o: WorkOrder) {
  try {
    await ElMessageBox.confirm(`确认删除工单「${o.title}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await workOrderApi.remove(o.id)
    ElMessage.success('工单已删除')
    loadOrders()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

// =====================================================
// 五、我的代办
// =====================================================
const stats = ref<WorkOrderStats | null>(null)
const todoStatus = ref<string>('')
const todoList = ref<WorkOrder[]>([])
const todoLoading = ref(false)

const STAT_CARDS = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { key: 'total', label: '工单总数', value: s.total, color: 'var(--kp-accent)' },
    { key: 'processing', label: '处理中', value: s.processing, color: 'var(--kp-info)' },
    { key: 'feedback', label: '反馈', value: s.feedback, color: 'var(--kp-warn)' },
    { key: 'unfinished', label: '未完成', value: s.unfinished, color: 'var(--kp-danger)' },
    { key: 'completed', label: '已完成', value: s.completed, color: 'var(--kp-success)' },
    { key: 'closed', label: '关闭', value: s.closed, color: 'var(--kp-fg-muted)' },
  ]
})

async function loadStats() {
  try {
    stats.value = await workOrderApi.stats()
  } catch {
    stats.value = null
  }
}
async function loadTodoList() {
  todoLoading.value = true
  try {
    const res = await workOrderApi.list({
      status: todoStatus.value || undefined,
    })
    todoList.value = res.items
  } catch {
    todoList.value = []
  } finally {
    todoLoading.value = false
  }
}

// =====================================================
// 初始化
// =====================================================
async function loadAllDevices(): Promise<Device[]> {
  // 与设备管理同源：分页拉取全部设备，保证实时监控列表与设备管理数据一致
  const all: Device[] = []
  const pageSize = 1000
  let p = 1
  let total = 0
  while (true) {
    const res = await deviceApi.list({ page: p, limit: pageSize })
    all.push(...res.items)
    total = res.total
    if (all.length >= total || res.items.length < pageSize) break
    p++
  }
  return all
}

async function loadBuildingsAndDevices() {
  try {
    buildings.value = (await buildingApi.list()).items
  } catch {
    buildings.value = []
  }
  try {
    allDevices.value = await loadAllDevices()
    if (allDevices.value.length) await selectDevice(allDevices.value[0].id)
  } catch {
    allDevices.value = []
  }
  await loadPrices()
  await loadQuotas()
}

onMounted(async () => {
  await loadBuildingsAndDevices()
  loadAlarms()
  loadGroups()
  loadOrders()
  loadStats()
  loadTodoList()
})

watch(activeTab, (t) => {
  if (t === 'alarm') loadAlarms()
  if (t === 'group') loadGroups()
  if (t === 'order') loadOrders()
  if (t === 'todo') {
    loadStats()
    loadTodoList()
  }
})
watch(todoStatus, loadTodoList)
</script>

<template>
  <div class="monitor">
    <el-tabs v-model="activeTab" class="monitor-tabs">
      <!-- 实时监控 -->
      <el-tab-pane label="实时监控" name="realtime">
        <div class="monitor-realtime" v-loading="metricsLoading">
          <!-- 左：楼栋 + 设备列表 -->
          <section class="rt-left kp-panel">
            <span class="kp-corner kp-corner--tl" />
            <span class="kp-corner kp-corner--tr" />
            <span class="kp-corner kp-corner--bl" />
            <span class="kp-corner kp-corner--br" />
            <div class="rt-left__head">
              <Building2 :size="15" /> 设备列表
              <span class="rt-left__count">{{ realtimeDevices.length }} / {{ allDevices.length }}</span>
            </div>
            <div class="rt-left__filters">
              <el-input v-model="realtimeSearch" size="small" placeholder="搜索名称/编码" clearable class="rt-left__search" />
              <el-select v-model="realtimeBuilding" placeholder="全部楼栋" clearable size="small" class="rt-left__bld">
                <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
              </el-select>
            </div>
            <ul class="rt-dev-list">
              <li
                v-for="d in realtimeDevices"
                :key="d.id"
                class="rt-dev"
                :class="{ active: d.id === selectedDeviceId }"
                @click="selectDevice(d.id); openRemote(d)"
              >
                <Cpu :size="13" class="rt-dev__icon" />
                <span class="rt-dev__name" :title="d.name">{{ d.name }}</span>
                <span class="rt-dev__bld" :title="buildingMap[d.building_id] || ''">{{ buildingMap[d.building_id] || '—' }}</span>
                <el-tag :type="STATUS_TAG_TYPE[d.status] || 'info'" size="small" effect="plain" class="rt-dev__status">
                  {{ STATUS_TEXT[d.status] || d.status }}
                </el-tag>
              </li>
              <li v-if="!realtimeDevices.length" class="rt-dev rt-dev--empty">暂无设备</li>
            </ul>
          </section>

          <!-- 右：设备详情 + 控制 -->
          <section class="rt-right">
            <div v-if="!selectedDevice" class="kp-empty">请选择左侧设备查看实时状态</div>
            <template v-else>
              <div class="rt-detail kp-panel">
                <span class="kp-corner kp-corner--tl" />
                <span class="kp-corner kp-corner--tr" />
                <span class="kp-corner kp-corner--bl" />
                <span class="kp-corner kp-corner--br" />
                <div class="rt-detail__head">
                  <MonitorSmartphone :size="16" /> {{ selectedDevice.name }}
                  <span class="rt-detail__sub">{{ buildingMap[selectedDevice.building_id] || selectedDevice.building_id }}</span>
                </div>
                <div class="rt-detail__meta">
                  <span>编码 <b class="kp-sep">{{ selectedDevice.code }}</b></span>
                  <span>类型 <b class="kp-sep">{{ CATEGORY_LABELS[selectedDevice.category_id] || selectedDevice.category_id }}</b></span>
                  <span>子系统 <b class="kp-sep">{{ subsystemNameMap[selectedDevice.subsystem_id] || selectedDevice.subsystem_id }}</b></span>
                  <span>状态 <b class="kp-sep" :class="`st-${selectedDevice.status}`">{{ STATUS_TEXT[selectedDevice.status] || selectedDevice.status }}</b></span>
                </div>
                <div class="rt-metrics">
                  <div v-for="m in metrics" :key="m.metric_key" class="rt-metric">
                    <span class="rt-metric__key">{{ METRIC_LABELS[m.metric_key] || m.metric_key }}</span>
                    <span class="rt-metric__val">{{ m.value }} <i>{{ m.unit }}</i></span>
                  </div>
                  <div v-if="!metrics.length" class="rt-metrics__empty">暂无实时指标</div>
                </div>
              </div>

              <!-- 计费联动 -->
              <div class="rt-billing kp-panel">
                <span class="kp-corner kp-corner--tl" />
                <span class="kp-corner kp-corner--tr" />
                <span class="kp-corner kp-corner--bl" />
                <span class="kp-corner kp-corner--br" />
                <div class="rt-billing__head">
                  <Wallet :size="16" /> 计费联动
                  <el-button size="small" type="primary" :icon="Edit" @click="openQuotaDialog">设置配额</el-button>
                </div>
                <div class="rt-billing__prices">
                  <span class="rt-billing__label">当前电价：</span>
                  <template v-if="prices.length">
                    <el-tag v-for="(p, i) in prices" :key="i" size="small" class="rt-billing__tag">
                      {{ (p as Record<string, unknown>).name || '电价' }} {{ (p as Record<string, unknown>).price }}{{ (p as Record<string, unknown>).unit }}
                    </el-tag>
                  </template>
                  <span v-else class="rt-billing__muted">暂无电价</span>
                </div>
                <div class="rt-billing__quota">
                  <span class="rt-billing__label">当前配额：</span>
                  <span v-if="deviceQuota" class="rt-billing__quota-val">
                    {{ deviceQuota.quota_kwh }} kWh · 预警 {{ deviceQuota.warning_pct }}% · {{ BILLING_QUOTA_SCOPES.find((s) => s.value === deviceQuota?.scope)?.label }}
                  </span>
                  <span v-else class="rt-billing__muted">未配置</span>
                </div>
              </div>
            </template>
          </section>
        </div>
      </el-tab-pane>

      <!-- 实时告警 -->
      <el-tab-pane label="实时告警" name="alarm">
        <div class="admin-toolbar">
          <BellRing :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">实时告警</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="alarmFilterLevel" placeholder="全部级别" clearable style="width: 130px" @change="loadAlarms">
              <el-option v-for="l in ALARM_RULE_LEVELS" :key="l.value" :label="l.label" :value="l.value" />
            </el-select>
            <el-select v-model="alarmFilterBuilding" placeholder="全部楼栋" clearable style="width: 150px" @change="loadAlarms">
              <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
            <el-input v-model="alarmDeviceName" placeholder="设备名称" clearable style="width: 150px" />
            <el-input v-model="alarmDeviceType" placeholder="设备类型" clearable style="width: 130px" />
            <el-button :icon="RefreshCw" @click="loadAlarms">刷新</el-button>
          </div>
        </div>
        <el-table :data="filteredAlarms" v-loading="alarmLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="级别" width="90">
            <template #default="{ row }">
              <el-tag :type="ALARM_LEVEL_MAP[row.level as AlarmLevel].type" size="small">
                {{ ALARM_LEVEL_MAP[row.level as AlarmLevel].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="150" />
          <el-table-column label="设备" min-width="150">
            <template #default="{ row }">{{ deviceMap[row.device_id]?.name || row.device_id }}</template>
          </el-table-column>
          <el-table-column prop="message" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="楼栋" width="130">
            <template #default="{ row }">{{ buildingMap[row.building_id] || row.building_id }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="ALARM_STATUS_MAP[row.status as AlarmStatus].type" size="small">
                {{ ALARM_STATUS_MAP[row.status as AlarmStatus].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="last_at" label="最近时间" width="170" />
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="deviceMap[row.device_id] ? openRemote(deviceMap[row.device_id]) : undefined">控制</span>
              <span class="kp-sep" />
              <span class="kp-action-link" :class="{ 'is-disabled': row.status === 'cleared' }" @click="row.status !== 'cleared' && ackAlarm(row)">确认</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" :class="{ 'is-disabled': row.status === 'cleared' }" @click="row.status !== 'cleared' && clearAlarm(row)">清除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 群组控制 -->
      <el-tab-pane label="群组控制" name="group">
        <div class="admin-toolbar">
          <Users :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">群组控制</span>
          <div class="admin-toolbar__filters">
            <el-button type="primary" :icon="Plus" @click="openGroupCreate">新增群组</el-button>
          </div>
        </div>
        <el-table :data="groups" v-loading="groupLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="name" label="群组名称" min-width="160" />
          <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
          <el-table-column label="楼栋数" width="100">
            <template #default="{ row }">{{ (row.building_ids || []).length }}</template>
          </el-table-column>
          <el-table-column label="设备数" width="100">
            <template #default="{ row }">{{ memberCount(row) }}</template>
          </el-table-column>
          <el-table-column label="批量动作" width="320">
            <template #default="{ row }">
              <el-button size="small" type="success" plain :loading="false" @click="groupControl(row, 'power_on')">开机</el-button>
              <el-button size="small" type="danger" plain @click="groupControl(row, 'power_off')">关机</el-button>
              <el-button size="small" :icon="SlidersHorizontal" @click="openRemoteGroup(row)">遥控</el-button>
              <el-button size="small" :icon="Power" @click="groupControl(row, 'power')">电源</el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openGroupEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeGroup(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 工单管理 -->
      <el-tab-pane label="工单管理" name="order">
        <div class="admin-toolbar">
          <ClipboardList :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">工单管理</span>
          <div class="admin-toolbar__filters">
            <el-button type="primary" :icon="Plus" @click="openOrderCreate">新增工单</el-button>
          </div>
        </div>
        <el-table :data="orders" v-loading="orderLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="code" label="工单编号" width="140" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column prop="assignee" label="指派给" width="120" />
          <el-table-column label="楼栋" width="130">
            <template #default="{ row }">{{ buildingMap[row.building_id] || row.building_id || '-' }}</template>
          </el-table-column>
          <el-table-column prop="product_type" label="产品类型" width="120" />
          <el-table-column label="设备" min-width="150">
            <template #default="{ row }">{{ deviceMap[row.device_id]?.name || row.device_id || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag size="small">
                {{ WORK_ORDER_STATUSES.find((s) => s.value === row.status)?.label || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openOrderEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeOrder(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 我的代办 -->
      <el-tab-pane label="我的代办" name="todo">
        <div class="admin-toolbar">
          <ListChecks :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">我的代办</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="todoStatus" placeholder="全部状态" clearable style="width: 150px">
              <el-option v-for="s in WORK_ORDER_STATUSES" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
            <el-button :icon="RefreshCw" @click="loadTodoList">刷新</el-button>
          </div>
        </div>

        <div class="todo-stats">
          <div v-for="c in STAT_CARDS" :key="c.key" class="todo-stat">
            <span class="todo-stat__val" :style="{ color: c.color }">{{ c.value }}</span>
            <span class="todo-stat__label">{{ c.label }}</span>
          </div>
        </div>

        <el-table :data="todoList" v-loading="todoLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="code" label="工单编号" width="140" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column prop="assignee" label="指派给" width="120" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag size="small">
                {{ WORK_ORDER_STATUSES.find((s) => s.value === row.status)?.label || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updated_at" label="更新时间" min-width="170" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openOrderEdit(row)">处理</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 遥控器弹窗（设备/告警/群组 三入口共用） -->
    <RemoteControlDialog
      v-model="remoteVisible"
      :device="remoteDevice"
      :group="remoteGroup"
      :device-map="deviceMap"
      :building-name="(id: string) => buildingMap[id] || ''"
      @controlled="remoteVisible = false"
    />

    <!-- 群组对话框 -->
    <el-dialog v-model="groupDialog" :title="groupEditingId ? '编辑群组' : '新增群组'" width="600px" append-to-body class="kp-dialog">
      <el-form ref="groupFormRef" :model="groupForm" label-width="88px">
        <el-form-item label="群组名称" required>
          <el-input v-model="groupForm.name" placeholder="如 1号楼空调群" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="groupForm.description" type="textarea" :rows="2" placeholder="群组说明" />
        </el-form-item>
        <el-form-item label="选择楼栋">
          <el-select v-model="groupForm.building_ids" multiple filterable style="width: 100%" placeholder="可多选">
            <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="选择设备">
          <el-select v-model="groupForm.device_ids" multiple filterable style="width: 100%" placeholder="可多选">
            <el-option v-for="d in allDevices" :key="d.id" :label="`${d.name}（${buildingMap[d.building_id] || ''}）`" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialog = false">取消</el-button>
        <el-button type="primary" :loading="groupSaving" @click="submitGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 工单对话框 -->
    <el-dialog v-model="orderDialog" :title="orderEditingId ? '编辑工单' : '新增工单'" width="620px" append-to-body class="kp-dialog">
      <el-form ref="orderFormRef" :model="orderForm" :rules="orderRules" label-width="96px">
        <el-form-item label="工单标题" prop="title">
          <el-input v-model="orderForm.title" placeholder="如 1号楼空调故障" />
        </el-form-item>
        <el-form-item label="工单描述">
          <el-input v-model="orderForm.description" type="textarea" :rows="3" placeholder="问题描述" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="指派给谁">
              <el-input v-model="orderForm.assignee" placeholder="如 张工" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属楼栋">
              <el-select v-model="orderForm.building_id" clearable filterable style="width: 100%" placeholder="选择楼栋">
                <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="产品类型">
              <el-input v-model="orderForm.product_type" placeholder="如 空调" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="管理设备">
              <el-select v-model="orderForm.device_id" clearable filterable style="width: 100%" placeholder="选择设备">
                <el-option v-for="d in allDevices" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="状态">
          <el-select v-model="orderForm.status" style="width: 100%">
            <el-option v-for="s in WORK_ORDER_STATUSES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orderDialog = false">取消</el-button>
        <el-button type="primary" :loading="orderSaving" @click="submitOrder">保存</el-button>
      </template>
    </el-dialog>

    <!-- 配额对话框 -->
    <el-dialog v-model="quotaDialog" title="设置配额" width="480px" append-to-body class="kp-dialog">
      <el-form :model="quotaForm" label-width="88px">
        <el-form-item label="范围">
          <el-select v-model="quotaForm.scope" style="width: 100%">
            <el-option v-for="s in BILLING_QUOTA_SCOPES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联对象">
          <el-input v-model="quotaForm.ref_id" placeholder="楼栋或设备ID" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="配额(kWh)">
              <el-input-number v-model="quotaForm.quota_kwh" :min="0" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预警比例(%)">
              <el-input-number v-model="quotaForm.warning_pct" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="quotaDialog = false">取消</el-button>
        <el-button type="primary" :loading="quotaSaving" @click="submitQuota">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.monitor { display: flex; flex-direction: column; height: 100%; }
.monitor-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.monitor-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.monitor-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; }

.admin-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; align-items: center; }
.admin-table { flex: 1; min-height: 0; }

/* 实时监控布局 */
.monitor-realtime { display: grid; grid-template-columns: 320px 1fr; gap: 16px; height: 100%; min-height: 0; }
.rt-left, .rt-detail, .rt-billing { position: relative; border-radius: var(--kp-radius-md); padding: 14px; display: flex; flex-direction: column; min-height: 0; }
.rt-left__head { display: flex; align-items: center; gap: 8px; font-size: var(--kp-text-md); color: var(--kp-fg); margin-bottom: 10px; }
.rt-left__head svg { color: var(--kp-accent); }
.rt-left__count { margin-left: auto; font-size: var(--kp-text-xs); color: var(--kp-fg-subtle); font-family: var(--kp-font-mono); }
.rt-left__filters { display: flex; gap: 8px; margin-bottom: 10px; }
.rt-left__search { flex: 1; }
.rt-left__bld { width: 110px; }
.rt-dev-list { list-style: none; margin: 0; padding: 0; display: block; overflow-y: auto; flex: 1; min-height: 0; }
.rt-dev {
  display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px;
  border-bottom: 1px solid var(--kp-border);
  color: var(--kp-fg); cursor: pointer; font-size: 13px;
  background: transparent;
  transition: background var(--kp-motion-fast) var(--kp-ease-standard);
  white-space: nowrap; overflow: hidden;
  flex-shrink: 0;
}
.rt-dev:hover { background: var(--kp-glow-soft); }
.rt-dev.active { background: var(--kp-glow-soft); color: var(--kp-accent); }
.rt-dev__icon { flex: 0 0 auto; color: var(--kp-fg-muted); }
.rt-dev.active .rt-dev__icon { color: var(--kp-accent); }
.rt-dev__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--kp-fg); }
.rt-dev__bld { flex: 0 0 auto; max-width: 72px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--kp-fg-muted); }
.rt-dev__status { flex: 0 0 auto; margin-left: 4px; }
.rt-dev--empty { justify-content: center; color: var(--kp-fg-subtle); cursor: default; }

.rt-right { display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow-y: auto; }
.rt-detail__head { display: flex; align-items: center; gap: 8px; font-size: var(--kp-text-lg); font-weight: 510; color: var(--kp-fg); margin-bottom: 10px; }
.rt-detail__head svg { color: var(--kp-accent); }
.rt-detail__sub { margin-left: auto; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); font-weight: 400; }
.rt-detail__meta { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: var(--kp-text-sm); color: var(--kp-fg-muted); margin-bottom: 12px; }
.rt-detail__meta b { color: var(--kp-fg); font-weight: 500; }
.rt-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.rt-metric { border: 1px solid var(--kp-border); border-radius: var(--kp-radius-sm); padding: 8px 12px; background: var(--kp-glow-soft); }
.rt-metric__key { display: block; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.rt-metric__val { font-size: var(--kp-text-lg); color: var(--kp-fg); font-family: var(--kp-font-mono); }
.rt-metric__val i { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); font-style: normal; }
.rt-metrics__empty { grid-column: 1/-1; color: var(--kp-fg-subtle); font-size: var(--kp-text-sm); }

.rt-billing__head { display: flex; align-items: center; gap: 8px; font-size: var(--kp-text-md); color: var(--kp-fg); margin-bottom: 10px; }
.rt-billing__head svg { color: var(--kp-accent); }
.rt-billing__head .el-button { margin-left: auto; }
.rt-billing__prices, .rt-billing__quota { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rt-billing__label { color: var(--kp-fg-muted); }
.rt-billing__tag { margin-right: 4px; }
.rt-billing__quota-val { color: var(--kp-fg); }
.rt-billing__muted { color: var(--kp-fg-subtle); }

/* 状态色 */
.st-running { color: var(--kp-success); }
.st-stopped { color: var(--kp-fg-muted); }
.st-fault { color: var(--kp-danger); }
.st-offline { color: var(--kp-status-offline); }
.st-maintenance { color: var(--kp-warn); }

/* 我的代办 */
.todo-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 14px; }
.todo-stat { border: 1px solid var(--kp-border); border-radius: var(--kp-radius-md); padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--kp-glow-soft); }
.todo-stat__val { font-size: var(--kp-text-3xl); font-family: var(--kp-font-mono); font-weight: 600; }
.todo-stat__label { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); }

/* 列分隔符 */
.kp-sep::before { content: ' | '; color: var(--kp-border-strong); margin: 0 6px; font-weight: 400; }
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Power,
  PowerOff,
  Minus,
  Plus,
  Snowflake,
  Sun,
  Repeat,
  Wind,
  Droplets,
  Gauge,
  Move,
  MoveHorizontal,
  RotateCw,
  Cpu,
  Building2,
  Layers,
  Thermometer,
  Zap,
  Activity,
  Cog,
  Group,
} from 'lucide-vue-next'
import '@/styles/modal-theme.css'
import { deviceApi, controlGroupApi, buildingApi } from '@/api'
import type { Device, ControlGroup, Building, HvacRunParams } from '@/types/api'
import { CATEGORY_LABELS } from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'

const props = defineProps<{
  modelValue: boolean
  device: Device | null
  group?: ControlGroup | null
  deviceMap?: Record<string, Device>
  buildingName?: (id: string) => string
  /** 嵌入模式：去掉外层 el-dialog，直接渲染内部面板（供 DeviceDetailDrawer 内联复用，不重复 UI） */
  embedded?: boolean
  /** 外部批量范围（GK-22 楼层平面图传入）：直接以该范围为批量目标 */
  batchScope?: { buildingId?: string | null; floor?: number | null; room?: string | null } | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'controlled'): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

// 空调待下发状态（设置后点"执行"批量下发）
type AcMode = 'cool' | 'heat' | 'auto' | 'fan' | 'dry'
type AcFan = 'auto' | 'low' | 'mid' | 'high'
type AcSwing = 'on' | 'off' | 'lr' | 'ud'
const acState = reactive<{
  power: 'on' | 'off'
  mode: AcMode
  temp: number
  fan: AcFan
  swing: AcSwing
  eco: boolean
}>({
  power: 'on',
  mode: 'cool',
  temp: 25,
  fan: 'auto',
  swing: 'on',
  eco: false,
})
const controlBusy = ref(false)

// 群组模式：目标设备选择（全部 / 单台）
const groupTarget = ref<'all' | string>('all')
const groupDevices = computed<Device[]>(() =>
  (props.group?.device_ids || []).map((id) => props.deviceMap?.[id]).filter(Boolean) as Device[],
)
const isGroupMode = computed(() => !!props.group && !props.device)

// 是否空调（设备模式按设备；群组模式按含空调设备）
const isAc = computed(() => {
  if (props.device) return props.device.subsystem_id === 'hvac'
  return groupDevices.value.some((d) => d.subsystem_id === 'hvac')
})

const subsystemNameMap = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {}
  SUBSYSTEMS.forEach((s) => (m[s.code] = s.name))
  return m
})

const AC_MODES: { value: AcMode; label: string; icon: any }[] = [
  { value: 'cool', label: '制冷', icon: Snowflake },
  { value: 'heat', label: '制热', icon: Sun },
  { value: 'auto', label: '自动', icon: Repeat },
  { value: 'fan', label: '送风', icon: Wind },
  { value: 'dry', label: '除湿', icon: Droplets },
]
const AC_FANS: { value: AcFan; label: string; icon: any }[] = [
  { value: 'auto', label: '自动', icon: Gauge },
  { value: 'low', label: '低风', icon: Wind },
  { value: 'mid', label: '中风', icon: Wind },
  { value: 'high', label: '高风', icon: Wind },
]
const AC_SWINGS: { value: AcSwing; label: string; icon: any }[] = [
  { value: 'on', label: '摆风', icon: Move },
  { value: 'off', label: '不摆风', icon: MoveHorizontal },
  { value: 'lr', label: '左右摆', icon: RotateCw },
  { value: 'ud', label: '上下摆', icon: Move },
]
const acModeIcon = computed(() => AC_MODES.find((m) => m.value === acState.mode)?.icon || Snowflake)

const STATUS_TEXT: Record<string, string> = {
  running: '运行中',
  stopped: '已停止',
  fault: '故障',
  offline: '离线',
  maintenance: '检修中',
}

// 设备描述行（楼栋+楼层+房间+型号）
const deviceTitle = computed(() => {
  if (isGroupMode.value) return ''
  const d = props.device
  if (!d) return ''
  const bld = props.buildingName ? props.buildingName(d.building_id) : d.building_id
  return `${bld || ''} ${d.location?.floor ?? '—'}楼${d.location?.room || '—'}（${d.model || d.manufacturer || CATEGORY_LABELS[d.category_id] || d.category_id}）`
})

// ===================== GK-23 A.1 批量维度选择器 =====================
type DimMode = 'single' | 'batch'
const dimMode = ref<DimMode>('single')
// 批量维度：全院 / 楼栋 / 楼层 / 房间
const batchDim = ref<'all' | 'building' | 'floor' | 'room'>('all')
const batchBuilding = ref<string>('')
const batchFloor = ref<number | null>(null)
const batchRoom = ref<string>('')

const buildings = ref<Building[]>([])
const hvacDevices = ref<Device[]>([])
const hvacLoaded = ref(false)

const availableFloors = computed<number[]>(() => {
  const pool = batchBuilding.value
    ? hvacDevices.value.filter((d) => d.building_id === batchBuilding.value)
    : hvacDevices.value
  const set = new Set<number>()
  pool.forEach((d) => set.add(d.location?.floor ?? 0))
  return Array.from(set).sort((a, b) => a - b)
})
const availableRooms = computed<string[]>(() => {
  const pool = hvacDevices.value.filter((d) => {
    if (batchBuilding.value && d.building_id !== batchBuilding.value) return false
    if (batchFloor.value != null && (d.location?.floor ?? 0) !== batchFloor.value) return false
    return true
  })
  const set = new Set<string>()
  pool.forEach((d) => d.location?.room && set.add(d.location.room))
  return Array.from(set).sort()
})

const batchTargets = computed<Device[]>(() => {
  let pool = hvacDevices.value
  if (batchDim.value === 'building' && batchBuilding.value) {
    pool = pool.filter((d) => d.building_id === batchBuilding.value)
  } else if (batchDim.value === 'floor') {
    if (batchBuilding.value) pool = pool.filter((d) => d.building_id === batchBuilding.value)
    if (batchFloor.value != null) pool = pool.filter((d) => (d.location?.floor ?? 0) === batchFloor.value)
  } else if (batchDim.value === 'room') {
    if (batchBuilding.value) pool = pool.filter((d) => d.building_id === batchBuilding.value)
    if (batchFloor.value != null) pool = pool.filter((d) => (d.location?.floor ?? 0) === batchFloor.value)
    if (batchRoom.value) pool = pool.filter((d) => d.location?.room === batchRoom.value)
  }
  return pool
})
const batchTargetCount = computed(() => batchTargets.value.length)

async function loadBatchData() {
  if (hvacLoaded.value) return
  try {
    const [b, first] = await Promise.all([
      buildingApi.list(),
      deviceApi.list({ subsystem: 'hvac', limit: 500, page: 1 }),
    ])
    buildings.value = b.items
    const items = [...(first.items || [])]
    const total = first.total || 0
    const per = first.page_size || 500
    let page = 2
    // 后端限制单页上限（实测 >1000 返回 400），分页拉全量以保证批量目标完整
    while (items.length < total && items.length < 6000) {
      const nx = await deviceApi.list({ subsystem: 'hvac', limit: per, page })
      if (!nx.items || !nx.items.length) break
      items.push(...nx.items)
      page++
    }
    hvacDevices.value = items
    hvacLoaded.value = true
  } catch {
    buildings.value = []
    hvacDevices.value = []
  }
}

// ===================== GK-23 A.2 运行参数（真实功率 / 待接入） =====================
const runParams = reactive<HvacRunParams>({
  power_kw: null,
  current_a: null,
  runtime_h: null,
  energy_kwh: null,
})
async function loadRunParams() {
  // 电流/运行时间/电量后端暂无点位 → 显式置 null（UI 标注「待接入」），绝不编造
  runParams.current_a = null
  runParams.runtime_h = null
  runParams.energy_kwh = null
  runParams.power_kw = null
  if (!props.device) return
  try {
    const { metrics } = await deviceApi.metricsLatest(props.device.id)
    const power = metrics.find((m) => m.metric_key === 'power_kw')
    // 运行功率：真实（部分空调类别含 power_kw 指标；无则为 null，UI 标注待接入）
    runParams.power_kw = power ? power.value : null
  } catch {
    runParams.power_kw = null
  }
}

// ===================== GK-23 A.3 基本信息 =====================
const basicInfo = computed(() => {
  const d = props.device
  if (!d) return null
  return {
    type: CATEGORY_LABELS[d.category_id] || d.category_id,
    brand: d.manufacturer || '—',
    category: d.category_id,
    model: d.model || '—',
  }
})

// ===================== GK-23 A.5 策略组（列表 + 绑定内机 + 规则骨架） =====================
const groups = ref<ControlGroup[]>([])
const selectedGroupId = ref<string>('')
const groupBound = computed(() => {
  if (!selectedGroupId.value || !props.device) return false
  const g = groups.value.find((x) => x.id === selectedGroupId.value)
  return g ? (g.device_ids || []).includes(props.device.id) : false
})
// 策略规则（制冷下限 / 制热上限 / 开关机时间）
const ruleCoolMin = ref<number>(16)
const ruleHeatMax = ref<number>(30)
const ruleOn = ref<string>('08:00')
const ruleOff = ref<string>('18:00')

async function loadGroups() {
  try {
    const { items } = await controlGroupApi.list()
    groups.value = items || []
  } catch {
    groups.value = []
  }
}
async function bindGroup() {
  const g = groups.value.find((x) => x.id === selectedGroupId.value)
  if (!g || !props.device) return
  const ids = Array.from(new Set([...(g.device_ids || []), props.device.id]))
  await controlGroupApi.update(g.id, { device_ids: ids } as Partial<ControlGroup>)
  ElMessage.success(`已绑定内机到策略组「${g.name}」`)
}
async function unbindGroup() {
  const g = groups.value.find((x) => x.id === selectedGroupId.value)
  if (!g || !props.device) return
  const ids = (g.device_ids || []).filter((id) => id !== props.device!.id)
  await controlGroupApi.update(g.id, { device_ids: ids } as Partial<ControlGroup>)
  ElMessage.success(`已从策略组「${g.name}」解绑内机`)
}
// 新建策略组（规则以 description JSON 暂存；后端 ControlGroup 无 strategies 字段，见报告缺口）
async function createStrategyGroup() {
  const rules = {
    cool_min: ruleCoolMin.value,
    heat_max: ruleHeatMax.value,
    on_time: ruleOn.value,
    off_time: ruleOff.value,
  }
  try {
    const created = await controlGroupApi.create({
      name: `策略组-${props.device?.name || '空调'}-${new Date().toLocaleDateString('zh-CN')}`,
      description: `strategies:${JSON.stringify(rules)}`,
      building_ids: props.device ? [props.device.building_id] : [],
      device_ids: props.device ? [props.device.id] : [],
    } as Partial<ControlGroup>)
    groups.value.push(created)
    selectedGroupId.value = created.id
    ElMessage.success('策略组已创建（含策略规则，暂存于备注；需后端扩展字段）')
  } catch {
    /* 错误已在 controlGroupApi 内部提示 */
  }
}

// ===================== 控制下发 =====================
async function sendDevice(deviceId: string, action: 'power_on' | 'power_off' | 'set_temperature' | 'set_mode' | 'set_strategy' | 'dimming', payload: Record<string, unknown> = {}) {
  await deviceApi.control(deviceId, { action, payload })
}

function computeTargets(): string[] {
  if (isGroupMode.value) {
    if (groupTarget.value === 'all') return groupDevices.value.map((d) => d.id)
    return [groupTarget.value]
  }
  if (dimMode.value === 'batch') return batchTargets.value.map((d) => d.id)
  return props.device ? [props.device.id] : []
}

// 执行：单设备 / 群组 / 批量 统一下发
async function executeRemote() {
  const targets = computeTargets()
  if (!targets.length) {
    ElMessage.warning('没有可控制的设备')
    return
  }
  controlBusy.value = true
  try {
    for (const tid of targets) {
      if (acState.power === 'on') {
        await sendDevice(tid, 'power_on', {})
      } else {
        await sendDevice(tid, 'power_off', {})
      }
      await sendDevice(tid, 'set_temperature', { temperature: acState.temp })
      await sendDevice(tid, 'set_mode', { mode: acState.mode, fan_speed: acState.fan, swing: acState.swing })
      // 节能命令：复用 set_strategy 动作下发 eco 标记（后端记录，待接入真正节能策略执行链路）
      if (acState.eco) await sendDevice(tid, 'set_strategy', { type: 'eco' })
    }
    const scope = isGroupMode.value ? '群组' : dimMode.value === 'batch' ? `批量(${targets.length}台)` : '单台'
    ElMessage.success(`已向 ${targets.length} 台设备下发控制指令（${scope}）`)
    emit('controlled')
  } catch {
    /* sendDevice 内部 ElMessage.error */
  } finally {
    controlBusy.value = false
  }
}

// ===================== 打开时初始化 =====================
function initDialog() {
  // 重置待下发状态
  acState.power = 'on'
  acState.mode = 'cool'
  acState.temp = 25
  acState.fan = 'auto'
  acState.swing = 'on'
  acState.eco = false
  groupTarget.value = 'all'
  dimMode.value = 'single'

  // 外部批量范围（GK-22 平面图传入）
  if (props.batchScope && (props.batchScope.buildingId || props.batchScope.floor != null || props.batchScope.room)) {
    dimMode.value = 'batch'
    batchDim.value = props.batchScope.room ? 'room' : props.batchScope.floor != null ? 'floor' : 'building'
    batchBuilding.value = props.batchScope.buildingId || ''
    batchFloor.value = props.batchScope.floor ?? null
    batchRoom.value = props.batchScope.room || ''
  }

  // 空调相关才加载批量数据 / 运行参数 / 策略组
  if (isAc.value || isGroupMode.value || props.batchScope) {
    loadBatchData()
    loadGroups()
  }
  if (props.device && props.device.subsystem_id === 'hvac') {
    loadRunParams()
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) initDialog()
  },
)
// 嵌入模式（无 dialog 切换）：挂载即初始化（DeviceDetailDrawer 内联复用时，靠 :key 触发重挂载）
onMounted(() => {
  if (props.embedded && props.modelValue) initDialog()
})

const dialogProps = computed(() => ({
  'model-value': visible.value,
  title: isGroupMode.value ? `群组遥控 · ${props.group?.name || ''}` : '远程控制',
  width: '520px',
  alignCenter: true,
  appendToBody: true,
  class: 'kp-modal rc-dialog',
}))
function onVisible(v: boolean) {
  if (!props.embedded) visible.value = v
}
const wrapperTag = computed(() => (props.embedded ? 'div' : 'el-dialog'))
const wrapperBind = computed(() => (props.embedded ? { class: 'kp-modal rc-embed' } : dialogProps.value))
</script>

<template>
  <component :is="wrapperTag" v-bind="wrapperBind" @update:model-value="onVisible">
    <div class="rc">
      <!-- 群组设备选择 -->
      <div v-if="isGroupMode" class="rc-group">
        <div class="rc-group__head">
          <Building2 :size="14" class="rc-info__icon" />
          <span>{{ group?.name }}（{{ groupDevices.length }} 台设备）</span>
        </div>
        <el-select v-model="groupTarget" size="small" style="width: 100%" class="rc-group__sel">
          <el-option label="全部设备（批量下发）" value="all" />
          <el-option v-for="d in groupDevices" :key="d.id" :label="`${d.name}（${CATEGORY_LABELS[d.category_id] || d.category_id}）`" :value="d.id" />
        </el-select>
      </div>

      <!-- 单设备信息 -->
      <div v-if="!isGroupMode && device" class="rc-info">
        <div class="rc-info__row">
          <Cpu :size="14" class="rc-info__icon" />
          <span class="rc-info__name">{{ device.name }}</span>
        </div>
        <div class="rc-info__meta">
          <span>编码 <b>{{ device.code }}</b></span>
          <span>类型 <b>{{ CATEGORY_LABELS[device.category_id] || device.category_id }}</b></span>
          <span>子系统 <b>{{ subsystemNameMap[device.subsystem_id] || device.subsystem_id }}</b></span>
          <span>状态 <b :class="`st-${device.status}`">{{ STATUS_TEXT[device.status] || device.status }}</b></span>
        </div>
      </div>

      <!-- GK-23 A.1 批量维度选择器 -->
      <div v-if="!isGroupMode" class="rc-batch">
        <div class="rc-batch__tabs">
          <button :class="{ active: dimMode === 'single' }" :disabled="controlBusy" @click="dimMode = 'single'">单台</button>
          <button :class="{ active: dimMode === 'batch' }" :disabled="controlBusy" @click="dimMode = 'batch'">
            <Layers :size="12" /> 批量
          </button>
        </div>
        <template v-if="dimMode === 'batch'">
          <div class="rc-batch__dim">
            <el-select v-model="batchDim" size="small" @change="() => { batchFloor = null; batchRoom = '' }">
              <el-option label="全院" value="all" />
              <el-option label="指定楼栋" value="building" />
              <el-option label="指定楼层" value="floor" />
              <el-option label="指定房间" value="room" />
            </el-select>
          </div>
          <div v-if="batchDim !== 'all'" class="rc-batch__row">
            <el-select v-model="batchBuilding" size="small" placeholder="楼栋" clearable @change="() => { batchFloor = null; batchRoom = '' }">
              <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
            <el-select v-if="batchDim === 'floor' || batchDim === 'room'" v-model="batchFloor" size="small" placeholder="楼层" clearable :disabled="!batchBuilding" @change="() => (batchRoom = '')">
              <el-option v-for="f in availableFloors" :key="f" :label="`${f} 楼`" :value="f" />
            </el-select>
            <el-select v-if="batchDim === 'room'" v-model="batchRoom" size="small" placeholder="房间" clearable :disabled="!batchFloor">
              <el-option v-for="r in availableRooms" :key="r" :label="r" :value="r" />
            </el-select>
          </div>
          <div class="rc-batch__count">
            命中 <b>{{ batchTargetCount }}</b> 台空调
            <span v-if="batchTargetCount === 0" class="rc-batch__hint">（当前范围无空调设备）</span>
          </div>
        </template>
      </div>

      <!-- 设备描述（单设备） -->
      <div v-if="!isGroupMode && deviceTitle" class="rc-title">{{ deviceTitle }}</div>

      <!-- GK-23 A.2 运行参数 + A.3 基本信息（单台空调） -->
      <div v-if="device && device.subsystem_id === 'hvac'" class="rc-cards">
        <div class="rc-card">
          <span class="rc-card__label"><Zap :size="12" /> 运行功率</span>
          <span class="rc-card__val">{{ runParams.power_kw != null ? runParams.power_kw + ' kW' : '—' }}</span>
          <span v-if="runParams.power_kw == null" class="rc-pending">待接入</span>
        </div>
        <div class="rc-card">
          <span class="rc-card__label"><Activity :size="12" /> 运行电流</span>
          <span class="rc-card__val">—</span>
          <span class="rc-pending">待接入</span>
        </div>
        <div class="rc-card">
          <span class="rc-card__label"><Thermometer :size="12" /> 运行时间</span>
          <span class="rc-card__val">—</span>
          <span class="rc-pending">待接入</span>
        </div>
        <div class="rc-card">
          <span class="rc-card__label"><Gauge :size="12" /> 累计用电量</span>
          <span class="rc-card__val">—</span>
          <span class="rc-pending">待接入</span>
        </div>
      </div>
      <div v-if="basicInfo" class="rc-basic">
        <div><span>类型</span><b>{{ basicInfo.type }}</b></div>
        <div><span>品牌</span><b>{{ basicInfo.brand }}</b></div>
        <div><span>类别</span><b>{{ basicInfo.category }}</b></div>
        <div><span>型号</span><b>{{ basicInfo.model }}</b></div>
      </div>

      <!-- 遥控器主体 -->
      <div v-if="isAc || isGroupMode" class="rc-remote">
        <div class="rc-display">
          <component :is="acModeIcon" :size="34" class="rc-mode-icon" />
          <span class="rc-temp">{{ acState.temp }}<i>℃</i></span>
        </div>

        <div class="rc-mini">
          <div class="rc-mini__cell">
            <span class="rc-mini__label">风速</span>
            <span class="rc-mini__val"><Wind :size="13" /> {{ AC_FANS.find((f) => f.value === acState.fan)?.label }}</span>
          </div>
          <div class="rc-mini__cell">
            <span class="rc-mini__label">摆风</span>
            <span class="rc-mini__val"><Move :size="13" /> {{ AC_SWINGS.find((s) => s.value === acState.swing)?.label }}</span>
          </div>
        </div>

        <label class="rc-eco">
          <input type="checkbox" v-model="acState.eco" :disabled="controlBusy" />
          <Zap :size="13" /> 节能命令（eco）
        </label>

        <div class="rc-power">
          <button class="rc-pwr" :class="{ active: acState.power === 'on' }" :disabled="controlBusy" @click="acState.power = 'on'">
            <Power :size="18" /><span>开机</span>
          </button>
          <button class="rc-pwr is-off" :class="{ active: acState.power === 'off' }" :disabled="controlBusy" @click="acState.power = 'off'">
            <PowerOff :size="18" /><span>关机</span>
          </button>
        </div>

        <div class="rc-temp-ctrl">
          <button class="rc-round" :disabled="acState.temp <= 16 || controlBusy" @click="acState.temp--"><Minus :size="18" /></button>
          <span class="rc-temp-mid">温度 <em>{{ acState.temp }}℃</em></span>
          <button class="rc-round" :disabled="acState.temp >= 30 || controlBusy" @click="acState.temp++"><Plus :size="18" /></button>
        </div>

        <div class="rc-group-rows">
          <div class="rc-circles">
            <button
              v-for="m in AC_MODES" :key="m.value"
              class="rc-circle" :class="{ active: acState.mode === m.value }" :disabled="controlBusy"
              @click="acState.mode = m.value"
            >
              <component :is="m.icon" :size="18" /><span>{{ m.label }}</span>
            </button>
          </div>
          <div class="rc-circles">
            <button
              v-for="f in AC_FANS" :key="f.value"
              class="rc-circle" :class="{ active: acState.fan === f.value }" :disabled="controlBusy"
              @click="acState.fan = f.value"
            >
              <component :is="f.icon" :size="18" /><span>{{ f.label }}</span>
            </button>
          </div>
          <div class="rc-circles">
            <button
              v-for="s in AC_SWINGS" :key="s.value"
              class="rc-circle" :class="{ active: acState.swing === s.value }" :disabled="controlBusy"
              @click="acState.swing = s.value"
            >
              <component :is="s.icon" :size="18" /><span>{{ s.label }}</span>
            </button>
          </div>
        </div>

      </div>

      <!-- 执行按钮：单台空调 / 群组 / 批量 三种范围统一展示（批量模式无单台设备时也能下发） -->
      <button
        v-if="isAc || isGroupMode || dimMode === 'batch'"
        class="rc-execute"
        :disabled="controlBusy"
        @click="executeRemote"
      >
        {{ controlBusy ? '下发中…' : (dimMode === 'batch' ? `批量执行（${batchTargetCount}）` : '执行') }}
      </button>

      <!-- GK-23 A.5 策略组（单台空调绑定内机 + 规则骨架） -->
      <div v-if="device && device.subsystem_id === 'hvac'" class="rc-strategy">
        <div class="rc-strategy__head"><Cog :size="14" /> 策略组（制冷下限 / 制热上限 / 开关机时间）</div>
        <div class="rc-strategy__list">
          <div v-if="!groups.length" class="rc-strategy__empty">暂无策略组，可在下方新建</div>
          <label v-for="g in groups" :key="g.id" class="rc-strategy__item">
            <input type="radio" name="rc-group" :value="g.id" v-model="selectedGroupId" />
            <span>{{ g.name }}</span>
            <span class="rc-strategy__cnt">{{ (g.device_ids || []).length }} 台</span>
          </label>
        </div>
        <div class="rc-strategy__bind">
          <button class="rc-btn" :disabled="!selectedGroupId || controlBusy" @click="groupBound ? unbindGroup() : bindGroup()">
            <Group :size="13" /> {{ groupBound ? '解绑内机' : '绑定内机' }}
          </button>
        </div>
        <div class="rc-strategy__rules">
          <div class="rc-rule"><span>制冷下限</span><input type="number" v-model.number="ruleCoolMin" min="16" max="30" /> ℃</div>
          <div class="rc-rule"><span>制热上限</span><input type="number" v-model.number="ruleHeatMax" min="16" max="30" /> ℃</div>
          <div class="rc-rule"><span>开机时间</span><input type="time" v-model="ruleOn" /></div>
          <div class="rc-rule"><span>关机时间</span><input type="time" v-model="ruleOff" /></div>
        </div>
        <button class="rc-btn rc-btn--primary" :disabled="controlBusy" @click="createStrategyGroup">新建策略组并绑定内机</button>
        <p class="rc-strategy__note">注：后端 ControlGroup 模型暂不含策略规则字段，规则以备注暂存；需后端扩展 strategies 段（见交付报告缺口清单）。</p>
      </div>

      <!-- 非空调设备：仅电源 -->
      <div v-else-if="device" class="rc-simple">
        <el-button type="success" :icon="Power" :loading="controlBusy" @click="device && sendDevice(device.id, 'power_on', {})">开机</el-button>
        <el-button type="danger" plain :icon="PowerOff" :loading="controlBusy" @click="device && sendDevice(device.id, 'power_off', {})">关机</el-button>
      </div>
      <div v-else class="rc-empty">该设备不支持远程控制</div>
    </div>
  </component>
</template>

<style scoped>
.rc { display: flex; flex-direction: column; gap: 10px; }

.rc-info { border: 1px solid var(--kp-border); border-radius: 8px; padding: 10px 12px; background: var(--kp-surface-raised); }
.rc-info__row { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--kp-fg); font-size: 14px; }
.rc-info__icon { color: var(--kp-accent); }
.rc-info__meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-size: 12px; color: var(--kp-fg-muted); }
.rc-info__meta b { color: var(--kp-fg); font-weight: 600; }
.rc-info__meta .st-running { color: var(--kp-success); }
.rc-info__meta .st-fault { color: var(--kp-danger); }
.rc-info__meta .st-maintenance { color: var(--kp-warn); }
.rc-info__meta .st-stopped, .rc-info__meta .st-offline { color: var(--kp-fg-subtle); }

.rc-group { display: flex; flex-direction: column; gap: 8px; }
.rc-group__head { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--kp-fg); font-size: 14px; }

.rc-title { font-size: 13px; color: var(--kp-fg); font-weight: 600; text-align: center; padding: 6px 0 8px; border-bottom: 1px solid var(--kp-border); }

/* GK-23 A.1 批量维度 */
.rc-batch { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; border: 1px dashed var(--kp-accent); border-radius: 8px; background: var(--kp-glow-soft); }
.rc-batch__tabs { display: flex; gap: 8px; }
.rc-batch__tabs button { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 14px; border: 1px solid var(--kp-border); border-radius: 999px; background: var(--kp-surface-raised); color: var(--kp-fg-muted); font-size: 13px; cursor: pointer; transition: all 0.15s; }
.rc-batch__tabs button.active { background: var(--kp-accent); color: var(--kp-accent-on, #000d14); border-color: var(--kp-accent); }
.rc-batch__row { display: flex; gap: 6px; flex-wrap: wrap; }
.rc-batch__count { font-size: 13px; color: var(--kp-fg-muted); }
.rc-batch__count b { color: var(--kp-accent); font-size: 15px; }
.rc-batch__hint { color: var(--kp-warn); font-size: 12px; }

/* GK-23 A.2/A.3 卡片 */
.rc-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rc-card { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-surface-raised); position: relative; }
.rc-card__label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--kp-fg-muted); }
.rc-card__val { font-size: 15px; font-weight: 700; color: var(--kp-fg); }
.rc-pending { position: absolute; top: 6px; right: 8px; font-size: 10px; color: var(--kp-warn); border: 1px solid var(--kp-warn); border-radius: 4px; padding: 0 4px; }
.rc-basic { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; padding: 8px 10px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-surface-raised); }
.rc-basic div { display: flex; justify-content: space-between; font-size: 12px; }
.rc-basic span { color: var(--kp-fg-muted); }
.rc-basic b { color: var(--kp-fg); font-weight: 600; }

/* 遥控器 */
.rc-remote { display: flex; flex-direction: column; gap: 10px; padding: 12px; background: var(--kp-bg-deep); border: 1px solid var(--kp-border); border-radius: 10px; }
.rc-display { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px 0; background: rgba(0, 0, 0, 0.35); border-radius: 8px; border: 1px solid var(--kp-border); }
.rc-mode-icon { color: var(--kp-accent); }
.rc-temp { font-size: 38px; font-weight: 700; color: var(--kp-fg); line-height: 1; letter-spacing: -0.5px; }
.rc-temp i { font-size: 20px; font-style: normal; color: var(--kp-fg-muted); margin-left: 2px; }

.rc-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rc-mini__cell { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; border-radius: 8px; background: var(--kp-surface-raised); border: 1px solid var(--kp-border); }
.rc-mini__label { font-size: 12px; color: var(--kp-fg-muted); }
.rc-mini__val { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--kp-fg); font-weight: 600; }

.rc-eco { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--kp-fg-muted); background: var(--kp-surface-raised); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--kp-border); }
.rc-eco input { accent-color: var(--kp-accent); }

.rc-power { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rc-pwr { display: flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border: 1px solid var(--kp-border); border-radius: 999px; background: var(--kp-surface-raised); color: var(--kp-fg-muted); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.rc-pwr:hover:not(:disabled) { border-color: var(--kp-accent); color: var(--kp-accent); }
.rc-pwr.active { background: var(--kp-accent); color: var(--kp-accent-on, #000d14); border-color: var(--kp-accent); }
.rc-pwr.is-off.active { background: var(--kp-fg-subtle); color: #fff; border-color: var(--kp-fg-subtle); }
.rc-pwr:disabled { opacity: 0.5; cursor: not-allowed; }

.rc-temp-ctrl { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; padding: 10px 12px; background: var(--kp-surface-raised); border-radius: 8px; border: 1px solid var(--kp-border); }
.rc-round { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--kp-border); border-radius: 50%; background: var(--kp-bg-deep); color: var(--kp-fg); cursor: pointer; transition: all 0.15s; }
.rc-round:hover:not(:disabled) { border-color: var(--kp-accent); color: var(--kp-accent); }
.rc-round:disabled { opacity: 0.4; cursor: not-allowed; }
.rc-temp-mid { font-size: 14px; color: var(--kp-fg-muted); text-align: center; }
.rc-temp-mid em { font-style: normal; color: var(--kp-fg); font-weight: 700; margin-left: 6px; }

.rc-group-rows { display: flex; flex-direction: column; gap: 8px; }
.rc-circles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.rc-circles:has(.rc-circle:nth-child(4):last-child) { grid-template-columns: repeat(4, 1fr); }
.rc-circle { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; aspect-ratio: 1 / 1; min-height: 50px; min-width: 0; padding: 4px 2px; border: 1px solid var(--kp-border); border-radius: 50%; background: var(--kp-surface-raised); color: var(--kp-fg-muted); font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s; overflow: hidden; }
.rc-circle span { font-size: 11px; line-height: 1.1; white-space: nowrap; }
.rc-circle:hover:not(:disabled) { border-color: var(--kp-accent); color: var(--kp-accent); }
.rc-circle.active { background: var(--kp-accent); color: var(--kp-accent-on, #000d14); border-color: var(--kp-accent); }
.rc-circle:disabled { opacity: 0.5; cursor: not-allowed; }

.rc-execute { height: 42px; border: none; border-radius: 999px; background: var(--kp-accent); color: var(--kp-accent-on, #000d14); font-size: 15px; font-weight: 600; letter-spacing: 0.2em; cursor: pointer; transition: filter 0.15s; margin-top: 4px; }
.rc-execute:hover:not(:disabled) { filter: brightness(1.05); }
.rc-execute:disabled { opacity: 0.6; cursor: not-allowed; }

/* GK-23 A.5 策略组 */
.rc-strategy { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-surface-raised); }
.rc-strategy__head { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--kp-fg); font-size: 13px; }
.rc-strategy__list { display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; }
.rc-strategy__empty { font-size: 12px; color: var(--kp-fg-muted); }
.rc-strategy__item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--kp-fg); }
.rc-strategy__cnt { margin-left: auto; font-size: 11px; color: var(--kp-fg-muted); }
.rc-strategy__bind { display: flex; }
.rc-strategy__rules { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.rc-rule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--kp-fg-muted); }
.rc-rule input { width: 72px; padding: 2px 6px; border: 1px solid var(--kp-border); border-radius: 6px; background: var(--kp-bg-deep); color: var(--kp-fg); }
.rc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 34px; padding: 0 12px; border: 1px solid var(--kp-accent); border-radius: 8px; background: transparent; color: var(--kp-accent); font-size: 13px; cursor: pointer; }
.rc-btn--primary { background: var(--kp-accent); color: var(--kp-accent-on, #000d14); }
.rc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rc-strategy__note { margin: 0; font-size: 11px; color: var(--kp-warn); line-height: 1.4; }

/* 非空调 / 空 */
.rc-simple { display: flex; gap: 10px; }
.rc-empty { color: var(--kp-fg-muted); font-size: 13px; padding: 14px 0; text-align: center; }

/* 嵌入模式（无外层 dialog 边距） */
.rc-embed { padding: 2px; }
</style>

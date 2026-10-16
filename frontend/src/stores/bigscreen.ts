import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { bigscreenApi } from '@/api'
import type { BigscreenConfigEntry, BigscreenLayoutEntry } from '@/types/api'
import { mergeEntry } from '@/lib/bigscreen-config'
import { mergeLayout } from '@/lib/bigscreen-layout'
import { useSceneStore } from './scene'
import { KP_ACCENT } from '@/lib/kp-accent'

// ============================================================
// 大屏面板数据契约（docs/phase4/EXPANSION.md §1）
// GET /bigscreen/panels?building_id=&subsystem= 返回的全量面板形状。
// 所有面板共享此单一数据源，选楼/选子系统时整体重新拉取（数据联动）。
// ============================================================

export type AlarmLevel = 'info' | 'warning' | 'critical'

export interface BigscreenAlarmItem {
  name: string
  key: string
  count: number
  level: AlarmLevel
}

export interface KpiStatItem {
  label: string
  value: number
  unit?: string
  color?: string
}

export interface SubsystemSlice {
  // code 为子系统唯一编码（lighting/hotwater 等），供前端按 code 精确匹配（避免依赖中文名称）
  code: string
  name: string
  value: number
  color: string
  // 综合概览：各系统设备数量与能耗
  device_count?: number
  kwh?: number
}

export interface BuildingEnergyItem {
  building_id: string
  building_name: string
  kwh: number
  cost: number
}

export interface DataSourceItem {
  device: string
  time: string
}
export interface StatusGauge {
  label: string
  value: number
  color: string
}
export interface ResponseItem {
  label: string
  key: string
}
export interface DeptAlarm {
  dept: string
  count: number
}

export interface BigscreenPanels {
  left: {
    alarmItems: BigscreenAlarmItem[]
    alarmTotal: number
  }
  right: {
    acStats: KpiStatItem[]
    powerStats: KpiStatItem[]
    energyStats: KpiStatItem[]
    elevatorStats: KpiStatItem[]
    tempTrend: number[]
    loadTrend: number[]
    energyTrend: number[]
    trafficTrend: number[]
    timeLabels: string[]
    voltageStability: number
    phaseA: number
    phaseB: number
    phaseC: number
    humidityRate: number
    dryHumidity: number
    wetHumidity: number
    onlineRate: number
    onlineCount: number
    offlineCount: number
  }
  bottom: {
    energyTrend: { t: string; value: number }[]
    categoryTrend: { t: string; value: number }[]
    bySubsystem: SubsystemSlice[]
    buildingEnergy: BuildingEnergyItem[]
    dataSources: DataSourceItem[]
    statusGauges: StatusGauge[]
    responses: ResponseItem[]
    deptAlarms: DeptAlarm[]
  }
}

function emptyPanels(): BigscreenPanels {
  return {
    left: { alarmItems: [], alarmTotal: 0 },
    right: {
      acStats: [],
      powerStats: [],
      energyStats: [],
      elevatorStats: [],
      tempTrend: [],
      loadTrend: [],
      energyTrend: [],
      trafficTrend: [],
      timeLabels: [],
      voltageStability: 0,
      phaseA: 0,
      phaseB: 0,
      phaseC: 0,
      humidityRate: 0,
      dryHumidity: 0,
      wetHumidity: 0,
      onlineRate: 0,
      onlineCount: 0,
      offlineCount: 0,
    },
    bottom: {
      energyTrend: [],
      categoryTrend: [],
      bySubsystem: [],
      buildingEnergy: [],
      dataSources: [],
      statusGauges: [],
      responses: [],
      deptAlarms: [],
    },
  }
}

// ---------- 本地演示夹具（§1 形状的脱机兜底，仅后端不可达时使用） ----------
const SYS_COLORS: Record<string, string> = {
  energy: KP_ACCENT,
  hvac: '#1BE5AD',
  power: '#3B82F6',
  water: '#FB923C',
  elevator: '#F43F5E',
  lighting: '#F59E0B',
  lifecycle: '#94A3B8',
}

function buildTimeLabels(n = 24): string[] {
  return Array.from({ length: n }, (_, i) => `${String(i).padStart(2, '0')}:00`)
}

// 确定性伪随机（保证演示数据稳定，不闪烁）
function wave(base: number, amp: number, i: number, phase = 0, noise = 0): number {
  const v = base + amp * Math.sin((i / 24) * Math.PI * 2 + phase) + (noise ? Math.sin(i * 1.7) * noise : 0)
  return Math.round(v * 10) / 10
}

function makeFixture(): BigscreenPanels {
  const timeLabels = buildTimeLabels(24)
  const tempTrend = timeLabels.map((_, i) => wave(25.2, 2.4, i, 0, 0.6))
  const loadTrend = timeLabels.map((_, i) => wave(520, 260, i, -1, 20))
  const energyTrend = timeLabels.map((_, i) => wave(150, 90, i, -1, 8))
  const trafficTrend = timeLabels.map((_, i) => wave(48, 40, i, 2, 4))

  const alarmItems: BigscreenAlarmItem[] = [
    { name: '空调系统告警', key: 'hvac', count: 12, level: 'warning' },
    { name: '供配电异常', key: 'power', count: 3, level: 'critical' },
    { name: '给排水 / 热水', key: 'hotwater', count: 5, level: 'warning' },
    { name: '电梯故障', key: 'elevator', count: 1, level: 'critical' },
    { name: '照明离线', key: 'lighting', count: 8, level: 'info' },
    { name: '设备生命周期', key: 'lifecycle', count: 2, level: 'info' },
  ]

  return {
    left: {
      alarmItems,
      alarmTotal: alarmItems.reduce((s, a) => s + a.count, 0),
    },
    right: {
      acStats: [
        { label: '实时功率', value: 386.4, unit: 'kW', color: SYS_COLORS.hvac },
        { label: '送风温度', value: 23.6, unit: '℃' },
        { label: '回风温度', value: 26.2, unit: '℃' },
        { label: '运行机组', value: 18, unit: '台' },
      ],
      powerStats: [
        { label: '总功率', value: 812.5, unit: 'kW', color: SYS_COLORS.power },
        { label: '功率因数', value: 0.94 },
        { label: '负载率', value: 68.3, unit: '%' },
        { label: '今日电量', value: 15420, unit: 'kWh' },
      ],
      energyStats: [
        { label: '今日能耗', value: 15420, unit: 'kWh', color: SYS_COLORS.energy },
        { label: '今日费用', value: 12336, unit: '元' },
        { label: '碳排放', value: 8231, unit: 'kg' },
        { label: '单位面积能耗', value: 38.2, unit: 'kWh/㎡' },
      ],
      elevatorStats: [
        { label: '运行电梯', value: 14, unit: '台', color: SYS_COLORS.elevator },
        { label: '累计乘梯', value: 3862, unit: '人次' },
        { label: '平均等待', value: 22, unit: 's' },
        { label: '故障停运', value: 1, unit: '台' },
      ],
      tempTrend,
      loadTrend,
      energyTrend,
      trafficTrend,
      timeLabels,
      voltageStability: 97.8,
      phaseA: 220.4,
      phaseB: 219.8,
      phaseC: 221.3,
      humidityRate: 56.3,
      dryHumidity: 41.2,
      wetHumidity: 68.7,
      onlineRate: 96.4,
      onlineCount: 1842,
      offlineCount: 68,
    },
    bottom: {
      energyTrend: energyTrend.map((v, i) => ({ t: timeLabels[i], value: v })),
      categoryTrend: loadTrend.map((v, i) => ({ t: timeLabels[i], value: v })),
      bySubsystem: [
        { code: 'hvac', name: '空调', value: 6420, color: SYS_COLORS.hvac },
        { code: 'power', name: '供配电', value: 3810, color: SYS_COLORS.power },
        { code: 'lighting', name: '照明', value: 1240, color: SYS_COLORS.lighting },
        { code: 'hotwater', name: '热水', value: 1980, color: SYS_COLORS.water },
        { code: 'elevator', name: '电梯', value: 970, color: SYS_COLORS.elevator },
        { code: 'lifecycle', name: '其他', value: 1000, color: SYS_COLORS.lifecycle },
      ],
      buildingEnergy: [
        { building_id: '1', building_name: '120急救中心', kwh: 3560, cost: 2848 },
        { building_id: '2', building_name: '门诊大楼', kwh: 4120, cost: 3296 },
        { building_id: '3', building_name: '住院大楼', kwh: 5280, cost: 4224 },
      ],
      dataSources: [
        { device: 'CT 扫描仪', time: '2026-08-17 11:20' },
        { device: '心电监护', time: '2026-08-17 11:14' },
        { device: '消防主机', time: '2026-08-17 10:58' },
        { device: '供水泵站', time: '2026-08-17 10:42' },
        { device: '空调机组', time: '2026-08-17 10:21' },
      ],
      statusGauges: [
        { label: '系统运行', value: 92, color: KP_ACCENT },
        { label: '网络畅通', value: 86, color: '#1BE5AD' },
        { label: '设备健康', value: 78, color: '#2EE6A6' },
      ],
      responses: [
        { label: '应急指挥', key: 'command' },
        { label: '应急预案', key: 'plan' },
        { label: '应急物资', key: 'supply' },
        { label: '应急车辆', key: 'vehicle' },
        { label: '应急通讯', key: 'comms' },
        { label: '应急培训', key: 'training' },
      ],
      deptAlarms: [
        { dept: '内科', count: 42 },
        { dept: '外科', count: 56 },
        { dept: '急诊', count: 78 },
        { dept: '儿科', count: 34 },
        { dept: '妇产', count: 62 },
        { dept: '重症', count: 48 },
        { dept: '检验', count: 55 },
      ],
    },
  }
}

// 实时告警按 key 去重，避免同一子系统/设备告警在大屏重复出现
function dedupeAlarms(items: BigscreenAlarmItem[]): BigscreenAlarmItem[] {
  const map = new Map<string, BigscreenAlarmItem>()
  for (const it of items) {
    const key = it.key || it.name
    const prev = map.get(key)
    if (prev) prev.count += it.count
    else map.set(key, { ...it })
  }
  return Array.from(map.values())
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export const useBigscreenStore = defineStore('bigscreen', () => {
  const scene = useSceneStore()

  const panels = reactive<BigscreenPanels>(emptyPanels())
  const loading = ref(false)
  // 数据来源：'api' = 后端实时；'fixture' = 后端不可达时的本地演示兜底
  const source = ref<'api' | 'fixture'>('api')
  const lastUpdated = ref<string | null>(null)
  const errorMsg = ref<string | null>(null)

  // 大屏样式配置（按系统维度，后台 DIY 可定制；与面板数据联动相互独立）
  const config = ref<BigscreenConfigEntry | null>(null)
  // 大屏布局配置（17 框的 x/y/w/h/frame，后台可视化拖拽 DIY；与面板数据联动相互独立）
  const layout = ref<BigscreenLayoutEntry | null>(null)

  let timer: ReturnType<typeof setInterval> | undefined

  // 跨标签布局同步（后台布局编辑器与大屏常开在不同标签，Pinia 各标签独立内存）
  let layoutChannel: BroadcastChannel | null = null
  let layoutSyncReady = false

  // 后台保存布局后广播，通知其他标签（大屏）重新拉取布局/配置
  function broadcastLayout(system: string) {
    layoutChannel?.postMessage({ type: 'bigscreen-layout', system })
  }

  // 当前系统 key（overview 或 7 子系统之一）
  function currentSystemKey(): string {
    const s = scene.activeSubsystem
    return s && s !== 'overview' ? (s as string) : 'overview'
  }

  // 拉取面板数据：API 优先，失败回退本地夹具（标记 source='fixture'）
  async function fetchPanels() {
    loading.value = true
    errorMsg.value = null
    try {
      const data = (await bigscreenApi.panels({
        building_id: scene.selectedBuilding ?? undefined,
        subsystem:
          scene.activeSubsystem && scene.activeSubsystem !== 'overview'
            ? (scene.activeSubsystem as string)
            : undefined,
      })) as unknown as BigscreenPanels

      if (!data || !data.left || !data.right || !data.bottom) {
        throw new Error('大屏面板数据结构异常')
      }
      panels.left = { ...data.left, alarmItems: dedupeAlarms(data.left.alarmItems || []) }
      panels.right = data.right
      panels.bottom = data.bottom
      source.value = 'api'
      lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    } catch (e) {
      // 后端不可达：使用 §1 形状的本地演示数据兜底，保证大屏永不空屏
      const fx = clone(makeFixture())
      panels.left = { ...fx.left, alarmItems: dedupeAlarms(fx.left.alarmItems || []) }
      panels.right = fx.right
      panels.bottom = fx.bottom
      source.value = 'fixture'
      errorMsg.value = e instanceof Error ? e.message : String(e)
      lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    } finally {
      loading.value = false
    }
  }

  // 拉取当前系统的样式配置（失败回退前端默认值，保证大屏永不空屏）
  async function fetchConfig(system?: string) {
    const key = system || currentSystemKey()
    try {
      const data = (await bigscreenApi.getConfig(key)) as BigscreenConfigEntry
      config.value = data
    } catch {
      config.value = mergeEntry(key)
    }
  }

  // 拉取当前系统的布局配置（失败回退前端默认值，保证大屏永不空屏）
  async function fetchLayout(system?: string) {
    const key = system || currentSystemKey()
    try {
      const data = (await bigscreenApi.getLayout(key)) as BigscreenLayoutEntry
      layout.value = data
    } catch {
      layout.value = mergeLayout(key)
    }
  }

  function start() {
    fetchPanels()
    fetchConfig()
    fetchLayout()
    stopPolling()
    timer = setInterval(fetchPanels, 15000)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  // 数据联动：选楼 / 选子系统 → 携带参数重新拉取面板 + 对应系统的样式配置 + 布局
  watch(
    () => [scene.selectedBuilding, scene.activeSubsystem],
    () => {
      fetchPanels()
      fetchConfig()
      fetchLayout()
    },
  )

  // 跨标签 / 聚焦兜底：收到后台布局编辑广播，或本标签重新可见时，
  // 从后端重拉最新布局 + 样式配置，使大屏立即反映 DIY 改动（与面板数据联动相互独立）。
  if (!layoutSyncReady) {
    layoutSyncReady = true
    if (typeof BroadcastChannel !== 'undefined') {
      layoutChannel = new BroadcastChannel('bigscreen-layout')
      layoutChannel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type?: string; system?: string }
        if (msg && msg.type === 'bigscreen-layout') {
          fetchLayout()
          fetchConfig()
        }
      }
      const onVis = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          fetchLayout()
          fetchConfig()
        }
      }
      document.addEventListener('visibilitychange', onVis)
    }
  }

  return {
    panels,
    loading,
    source,
    lastUpdated,
    errorMsg,
    config,
    layout,
    fetchPanels,
    fetchConfig,
    fetchLayout,
    broadcastLayout,
    start,
    stopPolling,
  }
})

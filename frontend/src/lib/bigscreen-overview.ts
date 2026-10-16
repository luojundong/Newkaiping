/**
 * 图1 主驾驶舱·全院总览数据层（Wave 1 范式核心）
 *
 * 数据全部来自现有后端 API（be-api-survey 已盘点，统一前缀 /api/v1）：
 *   GET /devices            → 全院设备在线 / 离线 / 告警数 + 楼栋设备台账
 *   GET /alarms             → 告警总数 / 分级 + 近 7 日告警趋势
 *   GET /work-orders/stats  → 工单 待处理 / 已完成
 *   GET /energy/summary     → 今日用电 / 碳排
 * 子系统摘要（S1–S7 卡片的能耗 / 运行指标）走 useBigscreenStore().panels（/bigscreen/panels）。
 *
 * 合规（GMP / 21 CFR Part 11 / EU Annex 11）：
 *   - 真实档案（楼栋 / 设备台账）来自 scene store，不经 v() 置空；
 *   - 示意值（天气）由组件层经 useDataMode().v() 包装，empty 模式输出 '--'。
 *   - 任一接口失败 → 回退本地示意值（与 stores/bigscreen.ts 同策略），保证大屏永不空屏；
 *     仅当四接口全部成功时 real=true（数据来源标识，供后续 UI 展示）。
 *
 * 复用范式：Screen 2–7 的后续工人可直接 import 本 composable 获取全院总览，
 * 再叠加各屏专属的子系统状态接口（hvacApi.status 等）。
 */
import { ref } from 'vue'
import { deviceApi, alarmApi, workOrderApi, energyApi } from '@/api'
import type { Device, Alarm, WorkOrderStats, EnergySummary } from '@/types/api'
import { MOCK, DEV_TOTAL } from '@/lib/bigscreen-demo-data'

export interface DeviceStats {
  /** 设备台账总数（真实档案口径） */
  total: number
  /** 在线（非 offline 即视为联网：running / stopped / fault / maintenance） */
  online: number
  /** 离线 */
  offline: number
  /** 告警（fault 态） */
  alarm: number
}

export interface BuildingDeviceStat {
  total: number
  online: number
  offline: number
}

export interface AlarmStats {
  total: number
  /** 紧急 critical */
  critical: number
  /** 重要 warning */
  warning: number
  /** 一般 info */
  info: number
  /** 近 7 日趋势日期标签（MM-DD） */
  trendLabels: string[]
  trendCritical: number[]
  trendWarning: number[]
  trendInfo: number[]
}

export interface WorkOrderView {
  /** 待处理 = processing + feedback + unfinished */
  pending: number
  /** 已完成 = completed */
  done: number
  total: number
}

export interface EnergyView {
  /** 今日用电 kWh */
  kwh: number
  /** 今日碳排 kg */
  carbonKg: number
  cost: number
}

const EMPTY_DEVICE: DeviceStats = { total: 0, online: 0, offline: 0, alarm: 0 }
const EMPTY_ALARM: AlarmStats = {
  total: 0,
  critical: 0,
  warning: 0,
  info: 0,
  trendLabels: [],
  trendCritical: [],
  trendWarning: [],
  trendInfo: [],
}

export function useBigscreenOverview() {
  const deviceStats = ref<DeviceStats>({ ...EMPTY_DEVICE })
  const buildingDeviceMap = ref<Record<string, BuildingDeviceStat>>({})
  const alarmStats = ref<AlarmStats>({ ...EMPTY_ALARM })
  const workOrder = ref<WorkOrderView>({ pending: 0, done: 0, total: 0 })
  const energy = ref<EnergyView>({ kwh: 0, carbonKg: 0, cost: 0 })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const real = ref(false)
  const loaded = ref(false)

  function computeDevices(items: Device[]): void {
    let online = 0
    let offline = 0
    let alarm = 0
    const map: Record<string, BuildingDeviceStat> = {}
    for (const d of items) {
      const isOffline = d.status === 'offline'
      if (isOffline) offline++
      else online++ // running / stopped / fault / maintenance 视为在线（已联网）
      if (d.status === 'fault') alarm++
      const bs =
        map[d.building_id] ?? (map[d.building_id] = { total: 0, online: 0, offline: 0 })
      bs.total++
      if (isOffline) bs.offline++
      else bs.online++
    }
    deviceStats.value = { total: items.length, online, offline, alarm }
    buildingDeviceMap.value = map
  }

  function computeAlarms(items: Alarm[]): void {
    let critical = 0
    let warning = 0
    let info = 0
    const dayMap = new Map<string, { c: number; w: number; i: number }>()
    for (const a of items) {
      if (a.level === 'critical') critical++
      else if (a.level === 'warning') warning++
      else info++
      const day = (a.first_at || '').slice(0, 10) // YYYY-MM-DD
      if (!day) continue
      const m = dayMap.get(day) ?? { c: 0, w: 0, i: 0 }
      m.c++
      m.w++
      m.i++
      dayMap.set(day, m)
    }
    const days = [...dayMap.keys()].sort().slice(-7)
    alarmStats.value = {
      total: items.length,
      critical,
      warning,
      info,
      trendLabels: days.map((d) => d.slice(5)),
      trendCritical: days.map((d) => dayMap.get(d)!.c),
      trendWarning: days.map((d) => dayMap.get(d)!.w),
      trendInfo: days.map((d) => dayMap.get(d)!.i),
    }
  }

  /** 拉取全院总览（四接口并行，各自容错；单接口失败不影响其余）。loaded 守卫：仅拉一次。 */
  async function init(): Promise<void> {
    if (loaded.value) return
    loading.value = true
    error.value = null
    const [devRes, alarmRes, woRes, energyRes] = await Promise.allSettled([
      deviceApi.list({ limit: 5000 }),
      alarmApi.list({}),
      workOrderApi.stats(),
      energyApi.summary({ period: 'day' }),
    ])

    let ok = true

    if (devRes.status === 'fulfilled') computeDevices(devRes.value.items)
    else {
      ok = false
      // 接口不可达：回退示意总量（逐设备明细缺失，楼栋台账由组件 v() 处理）
      deviceStats.value = {
        total: DEV_TOTAL,
        online: MOCK.online,
        offline: MOCK.offline,
        alarm: MOCK.alarm,
      }
    }

    if (alarmRes.status === 'fulfilled') computeAlarms(alarmRes.value.items)
    else {
      ok = false
      alarmStats.value = {
        total: MOCK.alarmUrgent + MOCK.alarmMajor + MOCK.alarmMinor,
        critical: MOCK.alarmUrgent,
        warning: MOCK.alarmMajor,
        info: MOCK.alarmMinor,
        trendLabels: MOCK.days,
        trendCritical: MOCK.alarmU7,
        trendWarning: MOCK.alarmM7,
        trendInfo: MOCK.alarmN7,
      }
    }

    if (woRes.status === 'fulfilled') {
      const s = woRes.value as WorkOrderStats
      workOrder.value = {
        pending: s.processing + s.feedback + s.unfinished,
        done: s.completed,
        total: s.total,
      }
    } else {
      ok = false
      workOrder.value = {
        pending: MOCK.woTodo + MOCK.woDoing,
        done: MOCK.woDone,
        total: MOCK.woTodo + MOCK.woDoing + MOCK.woDone,
      }
    }

    if (energyRes.status === 'fulfilled') {
      const e = energyRes.value as EnergySummary
      energy.value = { kwh: e.kwh, carbonKg: e.carbon_kg, cost: e.cost }
    } else {
      ok = false
      energy.value = { kwh: MOCK.power, carbonKg: Math.round(MOCK.carbon * 1000), cost: 0 }
    }

    real.value = ok
    loaded.value = true
    loading.value = false
  }

  return {
    deviceStats,
    buildingDeviceMap,
    alarmStats,
    workOrder,
    energy,
    loading,
    error,
    real,
    loaded,
    init,
  }
}

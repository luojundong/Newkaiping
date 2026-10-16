// GK-24 · 七大子系统概览指标规格（前端共享，避免重复定义）。
// 全部指标均来自各子系统真实状态接口，后端无接口的指标由消费组件标「待接入」。
import type { SubsystemCode } from '@/types/api'

export interface MetricSpec {
  label: string
  labelEn: string
  path: string[]
  unit: string
}

// 每个子系统的关键指标（概览级，≤4 项）
export const SUBSYSTEM_METRICS: Record<string, MetricSpec[]> = {
  regulation: [
    { label: '今日能耗', labelEn: 'Energy', path: ['total_kwh'], unit: 'kWh' },
    { label: '今日费用', labelEn: 'Cost', path: ['total_cost'], unit: '元' },
    { label: '碳排放', labelEn: 'Carbon', path: ['total_carbon_kg'], unit: 'kg' },
    { label: '峰值功率', labelEn: 'Peak', path: ['peak_kw'], unit: 'kW' },
  ],
  lifecycle: [
    { label: '设备总数', labelEn: 'Devices', path: ['total'], unit: '台' },
    { label: '运行中', labelEn: 'Running', path: ['by_status', 'running'], unit: '台' },
    { label: '故障', labelEn: 'Fault', path: ['by_status', 'fault'], unit: '台' },
    { label: '维护中', labelEn: 'Maint.', path: ['by_status', 'maintenance'], unit: '台' },
  ],
  hvac: [
    { label: '设备数', labelEn: 'Units', path: ['device_count'], unit: '台' },
    { label: '运行', labelEn: 'Running', path: ['running_count'], unit: '台' },
    { label: '总冷负荷', labelEn: 'Load', path: ['total_power_kw'], unit: 'kW' },
    { label: '平均COP', labelEn: 'COP', path: ['avg_cop'], unit: '' },
  ],
  lighting: [
    { label: '区域数', labelEn: 'Zones', path: ['zone_count'], unit: '个' },
    { label: '开启', labelEn: 'On', path: ['on_count'], unit: '个' },
    { label: '总功率', labelEn: 'Power', path: ['total_power_kw'], unit: 'kW' },
    { label: '今日用电', labelEn: 'Today', path: ['energy_today_kwh'], unit: 'kWh' },
  ],
  power: [
    { label: '总功率', labelEn: 'Power', path: ['total_power_kw'], unit: 'kW' },
    { label: '总电流', labelEn: 'Current', path: ['total_current_a'], unit: 'A' },
    { label: '功率因数', labelEn: 'PF', path: ['power_factor'], unit: '' },
    { label: '谐波THD', labelEn: 'THD', path: ['thd_percent'], unit: '%' },
  ],
  hotwater: [
    { label: '机组数', labelEn: 'Units', path: ['unit_count'], unit: '台' },
    { label: '运行', labelEn: 'Running', path: ['running_count'], unit: '台' },
    { label: '平均水温', labelEn: 'Water', path: ['avg_water_temp_c'], unit: '℃' },
    { label: '压缩机功率', labelEn: 'Comp.', path: ['total_compressor_power_kw'], unit: 'kW' },
  ],
  elevator: [
    { label: '电梯数', labelEn: 'Elevators', path: ['elevator_count'], unit: '台' },
    { label: '总运行', labelEn: 'Runs', path: ['total_runs'], unit: '次' },
    { label: '总能耗', labelEn: 'Energy', path: ['total_energy_kwh'], unit: 'kWh' },
    { label: '储能回馈', labelEn: 'Regen', path: ['regen_kwh'], unit: 'kWh' },
  ],
}

export function getPath(obj: any, path: string[]): unknown {
  let cur = obj
  for (const k of path) {
    if (cur == null) return undefined
    cur = cur[k]
  }
  return cur
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// 轻量健康度（概览提示，非告警数据源）
export function deriveStatus(code: string, raw: Record<string, unknown> | null): 'normal' | 'warning' | 'critical' {
  if (!raw) return 'normal'
  const fault = toNum(getPath(raw, ['by_status', 'fault'])) || toNum(getPath(raw, ['fault_count'])) || 0
  const off = toNum(getPath(raw, ['by_status', 'offline'])) || 0
  const thd = toNum(getPath(raw, ['thd_percent'])) || 0
  if (fault > 0 || off > 0 || thd > 5) return 'warning'
  return 'normal'
}

export function fmtMetric(v: number | null, unit: string): string {
  if (v === null) return '待接入'
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2)
  return unit ? `${s} ${unit}` : s
}

export const SUBSYSTEM_ORDER: SubsystemCode[] = [
  'regulation',
  'lifecycle',
  'hvac',
  'lighting',
  'power',
  'hotwater',
  'elevator',
]

// 大屏 KPI 数字格式化工具（纯函数，无依赖，P0 黑白灰风格无关）。
// 用途：统一能耗/告警/设备指标的数字呈现，避免各面板各自 toFixed 导致不一致。

// 千分位整数
export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return Math.round(value).toLocaleString('en-US')
}

// 固定小数位（默认 2 位），非有限返回占位符
export function formatFixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-'
  return value.toFixed(digits)
}

// 百分比（输入 0.1234 -> "12.34%"）
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-'
  return (value * 100).toFixed(digits) + '%'
}

// 带正号的变化率（用于同比/环比）
export function formatDelta(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-'
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(digits)
}

// 中文紧凑计数：万 / 亿（能耗/电量大屏常用）
// 1.2e4 -> "1.2万", 3.4e8 -> "3.4亿"
export function formatWan(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-'
  const abs = Math.abs(value)
  if (abs >= 1e8) return (value / 1e8).toFixed(digits) + '亿'
  if (abs >= 1e4) return (value / 1e4).toFixed(digits) + '万'
  return formatInt(value)
}

// 能耗电量：自动选 kWh / MWh（1 MWh = 1000 kWh）
export function formatEnergyKwh(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 1000) return (value / 1000).toFixed(digits) + ' MWh'
  return formatFixed(value, digits) + ' kWh'
}

// 紧凑字节（用于上传/存储类指标）
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes)) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return (i === 0 ? String(Math.round(v)) : v.toFixed(digits)) + ' ' + units[i]
}

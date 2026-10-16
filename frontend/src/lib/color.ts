// 颜色工具：用于把后台配置的 hex 色派生出 rgba（边框/辉光）与加深底色。

function normalizeHex(hex: string): string {
  const h = (hex || '').replace('#', '').trim()
  if (h.length === 3) return h.split('').map((c) => c + c).join('')
  return h.slice(0, 6)
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex)
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return [r, g, b]
}

// hex -> rgba(...,alpha)
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// 按比例加深（factor<1 变暗，用于派生 --kp-bg-deep）
export function darken(hex: string, factor: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`
}

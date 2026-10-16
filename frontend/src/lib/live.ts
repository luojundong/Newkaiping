// 实时通道（WS /api/v1/ws/live）：客户端发送 {building_id, subsystem, device_ids}，
// 服务端推送指标增量 + 告警事件。后端未就绪时静默降级，不阻断大屏渲染。
import { getToken } from './request'

export interface LiveSubscription {
  building_id?: string | null
  subsystem?: string | null
  device_ids?: string[]
}

type LiveHandler = (payload: unknown) => void

// 实时通道路径（与后端网关一致：WS /api/v1/ws/live），与 REST 同前缀，便于 dev proxy 统一转发。
const WS_PATH = '/api/v1/ws/live'

function buildWsUrl(): string {
  const base = import.meta.env.VITE_API_BASE || '/api/v1'
  // 相对路径（如 /api/v1）：同源，走当前域名 + WS_PATH，由 dev proxy / nginx 转发。
  if (base.startsWith('/')) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}${WS_PATH}`
  }
  // 绝对路径（如 http://host:port/api/v1）：取 origin 拼 WS_PATH。
  const origin = base.replace(/\/api\/v1\/?$/, '')
  const wsProto = origin.startsWith('https') ? 'wss' : 'ws'
  return `${wsProto}://${origin.replace(/^https?:\/\//, '')}${WS_PATH}`
}

/**
 * 打开一个实时通道。返回 { close }。
 * onMessage 收到服务端推送的增量指标/告警；异常自动计入降级。
 */
export function openLiveChannel(
  sub: LiveSubscription,
  onMessage: LiveHandler,
  onStatus?: (connected: boolean) => void,
): { close: () => void; send: (payload: unknown) => void } {
  let ws: WebSocket | null = null
  let closedByUser = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    try {
      ws = new WebSocket(buildWsUrl())
    } catch {
      onStatus?.(false)
      return
    }

    ws.onopen = () => {
      onStatus?.(true)
      const token = getToken()
      ws?.send(
        JSON.stringify({
          token: token || '',
          ...sub,
        }),
      )
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        onMessage(data)
      } catch {
        /* 忽略无法解析的帧 */
      }
    }

    ws.onclose = () => {
      onStatus?.(false)
      if (!closedByUser) {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  return {
    send: (payload: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload))
      }
    },
    close: () => {
      closedByUser = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
      ws = null
    },
  }
}

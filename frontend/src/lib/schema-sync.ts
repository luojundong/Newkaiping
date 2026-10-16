// GK-11 · schema.updated 跨端同步客户端（一处编辑、多端生效）
//
// 链路：PUT /api/v1/scene/schema 保存成功 → 后端经既有 WS 通道广播 schema.updated
// → 本模块（每个页签一个连接）收到事件 → 防抖后调用注入的 reload 回调重载 schema。
//
// 通道复用（与 lib/live.ts 既有客户端一致）：
//   - 裸 WebSocket，路径 /api/v1/ws/live（vite proxy ws:true 已放行）
//   - onopen 首帧发 JSON { token }（沿用既有鉴权模式，token 缺失不拒连）
//   - 后端裸 WS 半通道（backend/src/websocket/schema-sync.channel.ts）推送帧：
//     {"event":"schema.updated","data":{"version":N,"updatedAt":"ISO"}}
//
// 防自触发 / 防旧事件：
//   - 编辑页保存成功（schemaEditorApi.update）后调 noteSavedVersion(v) 记录已知版本，
//     本页随后收到同版本广播时跳过（自己刚保存过，无需重载）；
//   - reload 成功后推进 knownVersion；
//   - 事件缺 version 字段时仍重载（向后兼容，宁多刷不错过）。
//
// 自愈：重载失败仅 console.warn 不抛错；断线 3s 自动重连；防抖 800ms 合并风暴事件。
import { getToken } from './request'

export const SCHEMA_UPDATED_EVENT = 'schema.updated'

// 与 lib/live.ts 的 WS_PATH 一致（既有通道路径）
const WS_PATH = '/api/v1/ws/live'
const DEBOUNCE_MS = 800
const RECONNECT_MS = 3000

export interface SchemaUpdatedPayload {
  version?: number
  updatedAt?: string
}

export interface SchemaSyncOptions {
  /** 重载动作（由 main.ts 注入，避免反向依赖 GK-07/GK-10 领地）：如 () => useSceneStore().loadSchema() */
  reload: () => unknown | Promise<unknown>
  /** 可选：读取本地已知 schema 版本（首事件前建立基线，防旧事件误触发） */
  getVersion?: () => number | null | undefined
}

let inited = false
let knownVersion: number | null = null
let reloadFn: (() => unknown | Promise<unknown>) | null = null
let getVersionFn: (() => number | null | undefined) | null = null
let ws: WebSocket | null = null
let closedByUser = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function buildWsUrl(): string {
  const base = import.meta.env.VITE_API_BASE || '/api/v1'
  // 相对路径（如 /api/v1）：同源 + WS_PATH，由 dev proxy / nginx 转发（与 live.ts 口径一致）。
  if (base.startsWith('/')) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}${WS_PATH}`
  }
  const origin = base.replace(/\/api\/v1\/?$/, '')
  const wsProto = origin.startsWith('https') ? 'wss' : 'ws'
  return `${wsProto}://${origin.replace(/^https?:\/\//, '')}${WS_PATH}`
}

function bumpKnown(v: number): void {
  knownVersion = knownVersion === null ? v : Math.max(knownVersion, v)
}

function scheduleReload(nextVersion: number | null): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void (async () => {
      try {
        await reloadFn?.()
        if (nextVersion !== null) bumpKnown(nextVersion)
      } catch (err) {
        // 自愈：重载失败不抛错（下次事件/页面刷新仍可恢复）；knownVersion 不推进，
        // 下一次同版本事件仍会重试。
        console.warn('[schema-sync] schema reload failed:', err)
      }
    })()
  }, DEBOUNCE_MS)
}

function handleEvent(payload: SchemaUpdatedPayload): void {
  const v =
    typeof payload?.version === 'number' && Number.isFinite(payload.version)
      ? payload.version
      : null
  if (v !== null) {
    // 首个事件且注入了 getVersion：先建立本地版本基线（防连接建立前的旧事件/自触发）
    if (knownVersion === null && getVersionFn) {
      const base = getVersionFn()
      if (typeof base === 'number' && Number.isFinite(base)) bumpKnown(base)
    }
    if (knownVersion !== null && v <= knownVersion) {
      // 自触发（本页刚保存）或旧事件 → 跳过
      return
    }
  }
  // v === null：事件缺 version 字段 → 向后兼容，直接按需重载
  scheduleReload(v)
}

function connect(): void {
  try {
    ws = new WebSocket(buildWsUrl())
  } catch {
    setTimeout(connect, RECONNECT_MS)
    return
  }

  ws.onopen = () => {
    // 沿用 live.ts 既有鉴权模式：首帧 { token }
    try {
      ws?.send(JSON.stringify({ token: getToken() || '' }))
    } catch {
      /* 忽略 */
    }
  }

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as {
        event?: string
        data?: SchemaUpdatedPayload
        version?: number
        updatedAt?: string
      }
      // 兼容两种帧：裸 WS 半通道 {event, data} 与直接 payload {version, updatedAt}
      const payload =
        msg?.event === SCHEMA_UPDATED_EVENT && msg.data
          ? msg.data
          : typeof msg?.version === 'number' || msg?.updatedAt != null
            ? (msg as SchemaUpdatedPayload)
            : null
      if (payload) handleEvent(payload)
    } catch {
      /* 无法解析的帧忽略 */
    }
  }

  ws.onclose = () => {
    ws = null
    if (!closedByUser) reconnectTimer = setTimeout(connect, RECONNECT_MS)
  }

  ws.onerror = () => {
    try {
      ws?.close()
    } catch {
      /* 忽略 */
    }
  }
}

export const schemaSync = {
  /** 应用启动时调用一次（main.ts）；重复调用幂等忽略。 */
  init(options: SchemaSyncOptions): void {
    if (inited) return
    inited = true
    reloadFn = options.reload
    getVersionFn = options.getVersion ?? null
    connect()
  },

  /**
   * 编辑页保存成功后调用（schemaEditorApi.update 内部挂钩）：
   * 记录刚落盘的版本，使本页收到同版本广播时跳过重载（防自触发）。
   */
  noteSavedVersion(version: number): void {
    if (typeof version === 'number' && Number.isFinite(version)) bumpKnown(version)
  },

  /** 仅供探针/调试：当前内部状态快照 */
  __debug(): { inited: boolean; knownVersion: number | null; connected: boolean } {
    return { inited, knownVersion, connected: !!ws && ws.readyState === WebSocket.OPEN }
  },
}

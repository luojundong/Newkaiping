// 将高德地图 Key 写入后台 GIS 配置（服务端存储，前端不暴露）
// 用法：node set_gaode_key.mjs
import { readFileSync } from 'node:fs'

const HOST = 'http://117.21.178.39:5168'
const KEY = 'kaipingYY-demo'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function req(method, path, { token, payload, retry = 8 } = {}) {
  for (let i = 0; i < retry; i++) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = 'Bearer ' + token
      const init = { method, headers }
      if (payload !== undefined) init.body = JSON.stringify(payload)
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(HOST + path, { ...init, signal: ctrl.signal })
      clearTimeout(to)
      const text = await res.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch {}
      return { status: res.status, json, text }
    } catch (e) {
      if (i === retry - 1) throw e
      await sleep(800)
    }
  }
}

async function main() {
  // 1) 登录
  const login = await req('POST', '/api/v1/auth/login', { payload: { username: 'admin', password: 'admin123' } })
  if (login.status < 200 || login.status >= 300) {
    console.error('LOGIN_FAILED', login.status, login.text)
    process.exit(1)
  }
  const token = login.json?.data?.token || login.json?.token
  if (!token) {
    console.error('NO_TOKEN', JSON.stringify(login.json).slice(0, 300))
    process.exit(1)
  }
  console.log('[1] login ok, token len =', token.length)

  // 2) 写入高德 key 配置（保留其它默认项：矢量底图 + 注记 + 开平中心）
  const body = {
    provider: 'gaode',
    tiandituKey: '',
    tencentKey: '',
    gaodeKey: KEY,
    baiduKey: '',
    baseLayer: 'vec',
    showLabel: true,
    center: { lng: 112.698, lat: 22.368, zoom: 16 },
    reason: '填入高德地图 Key（kaipingYY-demo），由后台配置页承接',
  }
  const save = await req('PUT', '/api/v1/gis/config', { token, payload: body })
  console.log('[2] PUT /gis/config ->', save.status, JSON.stringify(save.json).slice(0, 400))

  // 3) 读回确认 key 已落库（后端返回完整配置，含 key；前端走 getPublicConfig 不含 key）
  const get = await req('GET', '/api/v1/gis/config', { token })
  const c = get.json?.data || get.json
  console.log('[3] GET /gis/config ->', get.status,
    'provider=', c?.provider, 'gaodeKeyMasked=', c?.gaodeKey ? '***' + c.gaodeKey.slice(-4) : '(空)',
    'baseLayer=', c?.baseLayer, 'showLabel=', c?.showLabel)

  // 4) 验证瓦片代理是否可拉到高德瓦片（开平市中心 z=16 附近）
  const z = 16, x = 53742, y = 27053 // 开平市中心近似瓦片号
  const tp = await req('GET', `/api/v1/gis/tile-proxy?provider=gaode&layer=vec&z=${z}&x=${x}&y=${y}`, { retry: 3 })
  const ct = tp.json?.code
  console.log('[4] GET /gis/tile-proxy (gaode) ->', tp.status, 'content-len=', (tp.text || '').length)
  if (tp.status === 200) {
    console.log('    ✅ 瓦片代理返回 200，高德底图可经后端加载')
  } else {
    console.log('    ⚠️ 瓦片代理返回非 200（', tp.status, JSON.stringify(tp.json).slice(0, 200), '）')
    console.log('    说明：该 Key(kaipingYY-demo) 可能为占位/试用 Key，高德瓦片服务或需有效注册 Key；')
    console.log('    后台「地图底图配置」已保存 provider=gaode，待有效 Key 后底图即可渲染。')
  }
}

main().catch((e) => { console.error('ERR', e?.message || e); process.exit(1) })

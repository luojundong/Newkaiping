// 端到端验证（公网 5168）：Phase 2 gis 端点 + Phase 3 楼层钻取数据
const BASE = 'http://117.21.178.39:5168/api/v1'
const U = 'admin', P = 'admin123'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function req(method, path, body, token, tries = 6) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = 'Bearer ' + token
      const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
      const text = await r.text()
      let data = null
      try { data = JSON.parse(text) } catch {}
      return { status: r.status, data, raw: text }
    } catch (e) {
      last = e
      await sleep(1200)
    }
  }
  return { status: 0, data: null, err: String(last && last.message) }
}

async function main() {
  const login = await req('POST', '/auth/login', { username: U, password: P })
  const token = login.data?.data?.token || login.data?.token
  if (!token) { console.log('LOGIN FAIL', login.status, login.raw?.slice(0, 200)); process.exit(1) }
  console.log('[1] login =>', login.status)

  // Phase 2: gis config 端点存在
  const gis = await req('GET', '/gis/config', null, token)
  console.log('[2] GET /gis/config =>', gis.status, 'provider=', gis.data?.data?.provider || '(empty)')

  // Phase 2: tile-proxy 无 key 应返回 400（端点存在且做了合规校验）
  const tp = await req('GET', '/gis/tile-proxy?provider=tianditu&layer=vec&z=10&x=1&y=1')
  console.log('[3] GET /gis/tile-proxy (no key) =>', tp.status, '(期望 400)')

  // Phase 3: 楼层标签
  const bd = await req('GET', '/scene/building-display', null, token)
  const b1 = (bd.data?.data?.floors_by_building) ? Object.keys(bd.data.data.floors_by_building)[0] : null
  const fls = b1 ? bd.data.data.floors_by_building[b1] : []
  console.log('[4] building-display floors_by_building:', b1, '=>', fls.length, '层 =>', fls.map((f) => f.index + 'F:' + f.label).join(', '))

  // Phase 3: 楼层钻取设备数据（取 1 号楼各层设备数）
  const buildings = (await req('GET', '/buildings', null, token)).data?.data?.items || []
  const bid = buildings[0]?.id
  for (const f of [1, 2, 3, 4, 5, 6]) {
    const d = await req('GET', `/devices?building_id=${bid}&floor=${f}&limit=1`, null, token)
    console.log(`[5] ${bid} ${f}F devices =>`, d.data?.data?.total ?? d.status)
  }
  console.log('VERIFY DONE')
}
main().catch((e) => { console.log('ERR', e.message); process.exit(1) })

// Round 3: API 层回归。验证：
// 1) 无 token GET building-display -> 401
// 2) 有 token GET -> 200 且 floor_model_3d_by_building = {4:true,6:true}
// 3) PUT 翻转 4->false -> 200，GET 确认持久化
// 4) 还原 PUT {4:true,6:true} -> GET 确认
// 5) 探查 scene/buildings、scene/config 端点可达性
const BASE = process.env.BASE || 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
const j = async (url, opts) => { const r = await fetch(url, opts); const t = await r.text(); let d = null; try { d = JSON.parse(t) } catch {} return { status: r.status, body: d } }
;(async () => {
  const login = await j(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
  if (![200, 201].includes(login.status) || !login.body?.data?.token) { console.log('LOGIN_FAIL', login.status); process.exit(2) }
  const token = login.body.data.token
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const noTok = await j(A('/scene/building-display'))
  console.log('NO_TOKEN_STATUS', noTok.status, '(expect 401)')

  const get1 = await j(A('/scene/building-display'), { headers: H })
  const sw1 = get1.body?.data?.floor_model_3d_by_building ?? get1.body?.floor_model_3d_by_building
  console.log('GET_INITIAL', JSON.stringify(sw1), '(expect {"4":true,"6":true})')

  // 翻转 4 -> false 测试持久化
  const putT = await j(A('/scene/building-display'), { method: 'PUT', headers: H, body: JSON.stringify({ floor_model_3d_by_building: { '4': false, '6': true } }) })
  const getT = await j(A('/scene/building-display'), { headers: H })
  const swT = getT.body?.data?.floor_model_3d_by_building ?? getT.body?.floor_model_3d_by_building
  console.log('AFTER_TOGGLE_4_OFF', JSON.stringify(swT), '(expect {"4":false,"6":true})')

  // 还原
  const putR = await j(A('/scene/building-display'), { method: 'PUT', headers: H, body: JSON.stringify({ floor_model_3d_by_building: { '4': true, '6': true } }) })
  const getR = await j(A('/scene/building-display'), { headers: H })
  const swR = getR.body?.data?.floor_model_3d_by_building ?? getR.body?.floor_model_3d_by_building
  console.log('AFTER_RESTORE', JSON.stringify(swR), '(expect {"4":true,"6":true})')

  // 探查其它 scene 端点
  for (const ep of ['/scene/buildings', '/scene/config', '/scene/points', '/buildings']) {
    const r = await j(A(ep), { headers: H })
    console.log('PROBE', ep, '->', r.status, r.body ? (Array.isArray(r.body.data) ? `[arr ${r.body.data.length}]` : typeof r.body.data) : (r.body ? 'obj' : 'null'))
  }

  const pass = noTok.status === 401 && JSON.stringify(sw1) === JSON.stringify({ '4': true, '6': true }) && JSON.stringify(swT) === JSON.stringify({ '4': false, '6': true }) && JSON.stringify(swR) === JSON.stringify({ '4': true, '6': true })
  console.log(pass ? 'R3_OK' : 'R3_FAIL')
  process.exit(pass ? 0 : 1)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

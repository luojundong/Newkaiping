// 部署后回归验证：直接 HTTP 打公网 117.21.178.39:5168（不依赖 SSH）。
const BASE = 'http://117.21.178.39:5168'
const A = { username: 'admin', password: 'admin123' }
const N = { username: 'viewer', password: 'view123456' } // role=leader，非 admin

async function login(creds) {
  const r = await fetch(BASE + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) })
  const j = await r.json()
  return { code: j.code, token: j?.data?.token, role: j?.data?.user?.role, status: r.status }
}
async function get(url, token) { return fetch(BASE + url, { headers: token ? { Authorization: 'Bearer ' + token } : {} }) }
async function put(url, token, body) { return fetch(BASE + url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }) }
async function del(url, token) { return fetch(BASE + url, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } }) }

let pass = 0, fail = 0
function check(name, ok, extra) { if (ok) { pass++; console.log('  PASS', name, extra || '') } else { fail++; console.log('  FAIL', name, extra || '') } }

;(async () => {
  // 0. 前端静态资源
  const idx = await get('/')
  check('前端 index.html 可访问 (200)', idx.status === 200, 'status=' + idx.status)

  const admin = await login(A)
  check('admin 登录成功', admin.code === 0 && !!admin.token, 'role=' + admin.role)
  const non = await login(N)
  check('非admin(viewer/leader) 登录成功', non.code === 0 && !!non.token, 'role=' + non.role)
  if (!admin.token || !non.token) { console.log('致命：缺 token，终止'); process.exit(1) }

  // 1. 数据保留：1号楼=139
  const b1 = await get('/api/v1/devices?building_id=1&limit=1', admin.token)
  const b1j = await b1.json()
  check('部署后 1号楼设备数=139（数据保留）', b1j?.data?.total === 139, 'total=' + b1j?.data?.total)

  // 2. B4：地图 Key 角色分支
  const gAdmin = await get('/api/v1/gis/config', admin.token); const gAj = await gAdmin.json()
  const gNon = await get('/api/v1/gis/config', non.token); const gNj = await gNon.json()
  const adminHasKey = !!(gAj?.data && (gAj.data.tiandituKey || gAj.data.gaodeKey || gAj.data.key))
  const nonHasKey = !!(gNj?.data && (gNj.data.tiandituKey || gNj.data.gaodeKey || gNj.data.key))
  check('B4 admin 可见完整地图配置(含key)', adminHasKey, JSON.stringify(Object.keys(gAj?.data || {})))
  check('B4 非admin 不泄露地图key', !nonHasKey, 'keys=' + JSON.stringify(Object.keys(gNj?.data || {})))

  // 3. B1：非admin 写接口 403
  const w1 = await put('/api/v1/bigscreen/config?system=overview', non.token, { accent: '#35c5ff' })
  check('B1 非admin PUT /bigscreen/config → 403', w1.status === 403, 'status=' + w1.status)
  const w2 = await fetch(BASE + '/api/v1/bigscreen/config?system=overview', { method: 'DELETE', headers: { Authorization: 'Bearer ' + non.token } })
  check('B1 非admin DELETE /bigscreen/config → 403 (B7守卫)', w2.status === 403, 'status=' + w2.status)
  const w3 = await put('/api/v1/users/non-existent-id', non.token, { username: 'x', role: 'admin' })
  check('B1 非admin PUT /users/:id → 403', w3.status === 403, 'status=' + w3.status)

  // 4. B3（前端修复）：不带 Content-Type 头的空 body DELETE 不应 400（模拟前端 apiDelete 行为）
  const dEmpty = await fetch(BASE + '/api/v1/devices/dev-nonexistent-regression', { method: 'DELETE', headers: { Authorization: 'Bearer ' + admin.token } })
  check('B3 无Content-Type空body DELETE 设备 → 404(非400)', dEmpty.status === 404, 'status=' + dEmpty.status)

  // 5. 读接口对非admin 正常
  const rd = await get('/api/v1/buildings', non.token)
  check('非admin 读 /buildings → 2xx', rd.status === 200, 'status=' + rd.status)

  console.log(`\n回归结果：PASS=${pass} FAIL=${fail}`)
  process.exitCode = fail ? 1 : 0
})().catch((e) => { console.log('异常:', e.message); process.exit(1) })

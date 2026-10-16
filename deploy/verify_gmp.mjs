// GMP 合规 RBAC + 权限验证（部署后运行）。
// 验证：admin 可读审计/复核/改间隔；非 admin（maintainer，仅 audit:trail）复核/改间隔须 403；普通读 200。
const B = 'http://117.21.178.39:5168/api/v1'
async function login(user, pass) {
  const r = await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })
  const j = await r.json()
  return j.data?.token
}
async function call(token, method, path, body) {
  const opt = { method, headers: { Authorization: 'Bearer ' + token } }
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body) }
  const r = await fetch(B + path, opt)
  return { status: r.status, ok: r.ok }
}
const results = []
const okStatus = (s) => s === 200 || s === 201
function check(name, cond, extra = '') { results.push({ name, pass: !!cond, extra }); console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? '  ' + extra : '')) }

const admin = await login('admin', 'admin123')
const op = await login('operator1', 'op123456')
check('admin 登录', !!admin)
check('operator1 登录', !!op)

check('admin GET /logs (audit:trail)', (await call(admin, 'GET', '/logs')).status === 200)
check('admin GET /logs/integrity', (await call(admin, 'GET', '/logs/integrity')).status === 200)
check('admin GET /logs/review-status', (await call(admin, 'GET', '/logs/review-status')).status === 200)
check('admin GET /logs/time-source', (await call(admin, 'GET', '/logs/time-source')).status === 200)
check('admin POST /logs/review', okStatus((await call(admin, 'POST', '/logs/review', { note: 'GMP 合规复核验证' })).status))
check('admin PUT /logs/review-settings', okStatus((await call(admin, 'PUT', '/logs/review-settings', { intervalDays: 30, reason: 'GMP 验证' })).status))

check('operator1 GET /logs (audit:trail)', (await call(op, 'GET', '/logs')).status === 200)
check('operator1 POST /logs/review 应 403', (await call(op, 'POST', '/logs/review', { note: 'x' })).status === 403)
check('operator1 PUT /logs/review-settings 应 403', (await call(op, 'PUT', '/logs/review-settings', { intervalDays: 30 })).status === 403)

const fails = results.filter((r) => !r.pass).length
console.log('\n=== GMP RBAC 验证: ' + (fails === 0 ? 'ALL PASS' : fails + ' FAIL') + ' ===')
process.exitCode = fails === 0 ? 0 : 1

// 详细诊断：打印每个审计写接口的 状态码 + 响应体。
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
  const txt = await r.text()
  return { status: r.status, body: txt.slice(0, 600) }
}
const admin = await login('admin', 'admin123')
console.log('--- admin GET /logs ---')
console.log(await call(admin, 'GET', '/logs?limit=1'))
console.log('--- admin POST /logs/review ---')
console.log(await call(admin, 'POST', '/logs/review', { note: 'GMP 合规复核验证' }))
console.log('--- admin PUT /logs/review-settings ---')
console.log(await call(admin, 'PUT', '/logs/review-settings', { intervalDays: 30, reason: 'GMP 验证' }))

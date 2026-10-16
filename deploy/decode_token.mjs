// 解码线上登录返回的 JWT payload（不校验签名，仅看权限点），用于诊断 RBAC。
const B = 'http://117.21.178.39:5168/api/v1'
async function login(user, pass) {
  const r = await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })
  const j = await r.json()
  return j.data?.token
}
function decode(t) {
  const seg = t.split('.')[1]
  const pad = seg + '==='.slice((seg.length + 3) % 4)
  const json = Buffer.from(pad, 'base64').toString('utf8')
  return JSON.parse(json)
}
const admin = await login('admin', 'admin123')
const op = await login('operator1', 'op123456')
console.log('admin.permissions =', JSON.stringify(decode(admin).permissions))
console.log('operator1.permissions =', JSON.stringify(decode(op).permissions))

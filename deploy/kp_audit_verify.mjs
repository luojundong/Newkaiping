// 公网审计埋点端到端验证：登录 → 回写 site/bigscreen 配置（触发埋点）→ 查 logs
const BASE = 'http://117.21.178.39:5168/api/v1'

async function main() {
  const loginRes = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const login = await loginRes.json()
  const token = login.data && login.data.token
  if (!token) {
    console.log('LOGIN_FAIL', JSON.stringify(login))
    return
  }
  console.log('LOGIN_OK token_len', String(token).length)
  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  // 1) site 配置：读后回写（触发 module=site 审计）
  const sc = await (await fetch(BASE + '/site/config', { headers: H })).json()
  const scData = sc.data || {}
  const sitePut = await fetch(BASE + '/site/config', {
    method: 'PUT',
    headers: H,
    body: JSON.stringify(scData),
  })
  console.log('SITE_PUT', sitePut.status)

  // 2) bigscreen 布局：读后回写 overview（触发 module=bigscreen 审计）
  const bl = await (await fetch(BASE + '/bigscreen/layout?system=overview', { headers: H })).json()
  const blData = bl.data || {}
  const bsPut = await fetch(BASE + '/bigscreen/layout', {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ system: 'overview', entry: blData }),
  })
  console.log('BIGSCREEN_PUT', bsPut.status)

  // 3) 查询审计日志
  const qs = await (await fetch(BASE + '/logs?module=site&limit=3', { headers: H })).json()
  const qb = await (await fetch(BASE + '/logs?module=bigscreen&limit=3', { headers: H })).json()
  const pick = (x) => ({ module: x.module, action: x.action, target: x.target, username: x.username, created_at: x.created_at })
  console.log('SITE_LOGS', JSON.stringify((qs.data && qs.data.items || []).map(pick)))
  console.log('BIGSCREEN_LOGS', JSON.stringify((qb.data && qb.data.items || []).map(pick)))
  console.log('VERIFY_DONE')
}
main().catch((e) => console.log('ERR', e && e.message))

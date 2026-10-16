// 公网 P1 审计埋点端到端验证：登录 → hvac/lighting/control-groups 控制（触发埋点）→ 查 logs
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

  const BID = 'B1'

  // 1) hvac 控制
  const hvacRes = await fetch(BASE + '/hvac/control', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ action: 'set_temperature', payload: { temp: 26 }, building_id: BID }),
  })
  console.log('HVAC_CONTROL', hvacRes.status, JSON.stringify(await hvacRes.json()))

  // 2) lighting 控制
  const lightRes = await fetch(BASE + '/lighting/control', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ action: 'dimming', payload: { level: 50 }, building_id: BID }),
  })
  console.log('LIGHTING_CONTROL', lightRes.status, JSON.stringify(await lightRes.json()))

  // 3) control-groups：先建群组再下发
  const cgCreate = await fetch(BASE + '/control-groups', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ name: 'P1审计验证群组', building_ids: [BID], device_ids: [] }),
  })
  const cg = await cgCreate.json()
  const cgId = cg.data && cg.data.id
  console.log('CG_CREATE', cgCreate.status, 'id=', cgId)
  let cgCtrlStatus = 'SKIP'
  if (cgId) {
    const cgCtrl = await fetch(BASE + '/control-groups/' + cgId + '/control', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ action: 'power_on', payload: {}, building_id: BID }),
    })
    cgCtrlStatus = cgCtrl.status
    console.log('CG_CONTROL', cgCtrlStatus, JSON.stringify(await cgCtrl.json()))
    // 清理：删除测试群组
    const del = await fetch(BASE + '/control-groups/' + cgId, { method: 'DELETE', headers: H })
    console.log('CG_DELETE', del.status)
  }

  // 4) 查询审计日志
  const q1 = await (await fetch(BASE + '/logs?module=hvac&limit=3', { headers: H })).json()
  const q2 = await (await fetch(BASE + '/logs?module=lighting&limit=3', { headers: H })).json()
  const q3 = await (await fetch(BASE + '/logs?module=control-groups&limit=3', { headers: H })).json()
  const pick = (x) => ({ module: x.module, action: x.action, target: x.target, username: x.username, result: x.result, created_at: x.created_at })
  console.log('HVAC_LOGS', JSON.stringify((q1.data && q1.data.items || []).map(pick)))
  console.log('LIGHTING_LOGS', JSON.stringify((q2.data && q2.data.items || []).map(pick)))
  console.log('CONTROLGROUPS_LOGS', JSON.stringify((q3.data && q3.data.items || []).map(pick)))
  console.log('VERIFY_DONE')
}
main().catch((e) => console.log('ERR', e && e.message))

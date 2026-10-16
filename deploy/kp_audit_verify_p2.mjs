// 公网 P2 审计埋点验证：对剩余缺口模块做写操作 → 查 logs 确认埋点出现
const BASE = 'http://117.21.178.39:5168/api/v1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const loginRes = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const login = await loginRes.json()
  const token = login.data && login.data.token
  if (!token) { console.log('LOGIN_FAIL', JSON.stringify(login)); return }
  console.log('LOGIN_OK')
  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const HD = { Authorization: 'Bearer ' + token } // DELETE 不带 Content-Type（避开 Fastify 空体坑）

  const results = {}

  // 1) device-types：create → update → delete
  {
    const c = await (await fetch(BASE + '/device-types', { method: 'POST', headers: H, body: JSON.stringify({ code: 'P2_DT', name: 'P2设备类型' }) })).json()
    const id = c.data && c.data.id
    console.log('DT_CREATE', (c.code || '') + (id ? ' id=' + id : ''))
    if (id) {
      const u = await (await fetch(BASE + '/device-types/' + id, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'P2设备类型改' }) })).json()
      console.log('DT_UPDATE', u.code)
      const d = await fetch(BASE + '/device-types/' + id, { method: 'DELETE', headers: HD })
      console.log('DT_DELETE', d.status)
    }
    const q = await (await fetch(BASE + '/logs?module=device-types&limit=5', { headers: H })).json()
    const acts = ((q.data && q.data.items) || []).map((x) => x.action)
    results['device-types'] = acts.includes('create') && acts.includes('update') && acts.includes('delete')
    console.log('DT_LOGS', JSON.stringify(acts))
  }

  // 2) device-brands：create → delete
  {
    const c = await (await fetch(BASE + '/device-brands', { method: 'POST', headers: H, body: JSON.stringify({ code: 'P2_DB', name: 'P2设备品牌' }) })).json()
    const id = c.data && c.data.id
    console.log('DB_CREATE', (c.code || '') + (id ? ' id=' + id : ''))
    if (id) {
      const d = await fetch(BASE + '/device-brands/' + id, { method: 'DELETE', headers: HD })
      console.log('DB_DELETE', d.status)
    }
    const q = await (await fetch(BASE + '/logs?module=device-brands&limit=5', { headers: H })).json()
    const acts = ((q.data && q.data.items) || []).map((x) => x.action)
    results['device-brands'] = acts.includes('create') && acts.includes('delete')
    console.log('DB_LOGS', JSON.stringify(acts))
  }

  // 3) alarm-rules：create → delete
  {
    const c = await (await fetch(BASE + '/alarm-rules', { method: 'POST', headers: H, body: JSON.stringify({ event_code: 'P2_EV', event_name: 'P2告警事件', subsystem: 'hvac' }) })).json()
    const id = c.data && c.data.id
    console.log('AR_CREATE', (c.code || '') + (id ? ' id=' + id : ''))
    if (id) {
      const d = await fetch(BASE + '/alarm-rules/' + id, { method: 'DELETE', headers: HD })
      console.log('AR_DELETE', d.status)
    }
    const q = await (await fetch(BASE + '/logs?module=alarm-rules&limit=5', { headers: H })).json()
    const acts = ((q.data && q.data.items) || []).map((x) => x.action)
    results['alarm-rules'] = acts.includes('create') && acts.includes('delete')
    console.log('AR_LOGS', JSON.stringify(acts))
  }

  // 4) menus：saveOrder（先读当前顺序，回写相同顺序，避免改动真实配置）
  {
    const cur = await (await fetch(BASE + '/menus/order', { headers: H })).json()
    const order = (cur.data && cur.data.order) || (cur.data && cur.data) || ['overview', 'energy']
    console.log('MENU_READ', JSON.stringify(order).slice(0, 80))
    const s = await (await fetch(BASE + '/menus/order', { method: 'PUT', headers: H, body: JSON.stringify({ order }) })).json()
    console.log('MENU_SAVE', s.code)
    const q = await (await fetch(BASE + '/logs?module=menus&limit=5', { headers: H })).json()
    const acts = ((q.data && q.data.items) || []).map((x) => x.action)
    results['menus'] = acts.includes('update')
    console.log('MENU_LOGS', JSON.stringify(acts))
  }

  // 5) reports：export（GET 导出 → 触发埋点）
  {
    const r = await fetch(BASE + '/reports/export?type=history&building_id=B1', { headers: H })
    const buf = Buffer.from(await r.arrayBuffer())
    console.log('REPORT_EXPORT', r.status, 'bytes=', buf.length)
    const q = await (await fetch(BASE + '/logs?module=reports&limit=5', { headers: H })).json()
    const acts = ((q.data && q.data.items) || []).map((x) => x.action)
    results['reports'] = acts.includes('export')
    console.log('REPORT_LOGS', JSON.stringify(acts))
  }

  // 6) control-groups：create → update → delete
  {
    const c = await (await fetch(BASE + '/control-groups', { method: 'POST', headers: H, body: JSON.stringify({ name: 'P2审计验证群组', building_ids: ['B1'], device_ids: [] }) })).json()
    const id = c.data && c.data.id
    console.log('CG_CREATE', (c.code || '') + (id ? ' id=' + id : ''))
    if (id) {
      const u = await (await fetch(BASE + '/control-groups/' + id, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'P2审计验证群组改' }) })).json()
      console.log('CG_UPDATE', u.code)
      const d = await fetch(BASE + '/control-groups/' + id, { method: 'DELETE', headers: HD })
      console.log('CG_DELETE', d.status)
    }
    const q = await (await fetch(BASE + '/logs?module=control-groups&limit=5', { headers: H })).json()
    const acts = ((q.data && q.data.items) || []).map((x) => x.action)
    results['control-groups'] = acts.includes('create') && acts.includes('update') && acts.includes('delete')
    console.log('CG_LOGS', JSON.stringify(acts))
  }

  // 汇总
  console.log('SUMMARY', JSON.stringify(results))
  const allPass = Object.values(results).every(Boolean)
  console.log(allPass ? 'VERIFY_ALL_PASS' : 'VERIFY_SOME_FAIL')
}
main().catch((e) => console.log('ERR', e && e.message))

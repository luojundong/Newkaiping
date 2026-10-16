// 清理 P1 验证产生的测试控制群组（DELETE 不带 Content-Type，规避 Fastify 空体坑）
const BASE = 'http://117.21.178.39:5168/api/v1'

async function main() {
  const login = await (await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })).json()
  const token = login.data && login.data.token
  if (!token) { console.log('LOGIN_FAIL', JSON.stringify(login)); return }
  const AUTH = { Authorization: 'Bearer ' + token }

  // 列出群组，找测试残留
  const list = await (await fetch(BASE + '/control-groups', { headers: AUTH })).json()
  const items = (list.data && list.data.items) || []
  const stray = items.filter((g) => (g.name || '').includes('P1审计验证'))
  console.log('GROUPS_TOTAL', items.length, 'STRAY', stray.length)
  for (const g of stray) {
    const del = await fetch(BASE + '/control-groups/' + g.id, { method: 'DELETE', headers: AUTH })
    console.log('DELETE', g.id, del.status, JSON.stringify(await del.json()))
  }
  // 复核
  const list2 = await (await fetch(BASE + '/control-groups', { headers: AUTH })).json()
  const items2 = (list2.data && list2.data.items) || []
  console.log('GROUPS_AFTER', items2.length, 'STRAY_AFTER', items2.filter((g) => (g.name || '').includes('P1审计验证')).length)
  console.log('CLEANUP_DONE')
}
main().catch((e) => console.log('ERR', e && e.message))

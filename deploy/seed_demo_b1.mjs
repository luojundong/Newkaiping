// 模拟楼栋楼层标签 + 相关数据（Phase 3/模拟数据）：
// 1) 为 1 号楼写入 6 层楼层标签（绑定 energy.kwh / power.kw 等实时指标）
// 2) 为尚缺设备的楼层（2/4/5/6F）播种演示设备，使楼层钻取每层都有数据
// 幂等：已存在楼层标签则整体覆盖；某层已有设备则跳过播种。
const BASE = 'http://117.21.178.39:5168/api/v1'
const U = 'admin'
const P = 'admin123'

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = 'Bearer ' + token
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { status: r.status, data }
}

async function main() {
  const login = await req('POST', '/auth/login', { username: U, password: P })
  const token = login.data?.data?.token || login.data?.token
  if (!token) { console.log('LOGIN FAIL', login.status, JSON.stringify(login.data).slice(0, 200)); process.exit(1) }
  console.log('login ok, token=', token.slice(0, 12) + '...')

  const bres = await req('GET', '/buildings', null, token)
  const buildings = bres.data?.data?.items || []
  console.log('buildings:', buildings.map((b) => b.id + ':' + b.name).join(', '))
  const b1 = buildings[0]
  console.log('target building:', b1.id, b1.name, b1.code)

  // 1) 楼层标签
  const cd = await req('GET', '/scene/building-display', null, token)
  const cur = cd.data?.data || {}
  const floors = cur.floors_by_building || {}
  const newFloors = [
    { index: 1, label: '门诊大厅', bound_fields: ['energy.kwh', 'power.kw'], color: '#00E5FF', opacity: 0.9, visible: true },
    { index: 2, label: '门诊诊区', bound_fields: ['energy.kwh', 'power.kw'], color: '#36D399', opacity: 0.9, visible: true },
    { index: 3, label: '住院病区', bound_fields: ['energy.kwh', 'power.kw'], color: '#FFB020', opacity: 0.9, visible: true },
    { index: 4, label: '手术中心', bound_fields: ['energy.kwh', 'power.kw'], color: '#FF6B6B', opacity: 0.9, visible: true },
    { index: 5, label: 'ICU重症', bound_fields: ['energy.kwh', 'power.kw'], color: '#B388FF', opacity: 0.9, visible: true },
    { index: 6, label: '设备层', bound_fields: ['energy.kwh', 'power.kw', 'water.ton'], color: '#4D9FFF', opacity: 0.9, visible: true },
  ]
  floors[b1.id] = newFloors
  const pr = await req('PUT', '/scene/building-display', { ...cur, floors_by_building: floors }, token)
  console.log('PUT building-display =>', pr.status, JSON.stringify(pr.data).slice(0, 120))

  // 2) 为缺设备楼层播种演示设备
  const cats = ['split_ac', 'power_meter', 'light_panel', 'fresh_air']
  for (const f of [2, 4, 5, 6]) {
    const chk = await req('GET', `/devices?building_id=${b1.id}&floor=${f}&limit=1`, null, token)
    const cnt = chk.data?.data?.total || 0
    if (cnt > 0) { console.log(`floor ${f}F already has ${cnt} devices, skip`); continue }
    for (let i = 0; i < 4; i++) {
      const cat = cats[i % cats.length]
      const name = `${b1.name}-${f}F-模拟设备${i + 1}`
      const dr = await req(
        'POST',
        '/devices',
        { building_id: b1.id, category: cat, name, status: 'running', location: { floor: f, room: `${f}0${i + 1}` } },
        token,
      )
      console.log(`  POST dev ${f}F ${cat}:`, dr.status, dr.data?.data?.id || JSON.stringify(dr.data).slice(0, 80))
    }
  }
  console.log('SEED DONE')
}
main().catch((e) => { console.log('ERR', e.message); process.exit(1) })

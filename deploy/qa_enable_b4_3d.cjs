// 在 WAN 上把楼栋显示配置 floor_model_3d_by_building 设为 {4:true,6:true}（仅 4、6 号楼开 3D 楼层模型）。
// 保留 building_display 其它字段，整存 PUT。
const BASE = process.env.BASE || 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
;(async () => {
  const token = (await (await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json()).data.token
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const cur = await (await fetch(A('/scene/building-display'), { headers: H })).json()
  console.log('BEFORE floor_model_3d_by_building:', JSON.stringify(cur.data?.floor_model_3d_by_building))
  const body = { ...cur.data, floor_model_3d_by_building: { ...(cur.data?.floor_model_3d_by_building || {}), '4': true, '6': true } }
  const put = await fetch(A('/scene/building-display'), { method: 'PUT', headers: H, body: JSON.stringify(body) })
  const res = await put.json()
  console.log('PUT status', put.status)
  console.log('AFTER floor_model_3d_by_building:', JSON.stringify(res.data?.floor_model_3d_by_building))
  // 回读确认落盘
  const re = await (await fetch(A('/scene/building-display'), { headers: H })).json()
  console.log('REGET floor_model_3d_by_building:', JSON.stringify(re.data?.floor_model_3d_by_building))
})().catch((e) => { console.error('ERR', e); process.exit(2) })

// GMP-P1 审计导出端点验证（部署后运行）。
// 验证：admin 可导出 CSV/JSON（含哈希链字段），且导出动作本身留痕于审计链。
const B = 'http://117.21.178.39:5168/api/v1'
async function login(user, pass) {
  const r = await fetch(B + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })
  const j = await r.json()
  return j.data?.token
}
async function get(token, path) {
  const r = await fetch(B + path, { headers: { Authorization: 'Bearer ' + token } })
  return { status: r.status, ct: r.headers.get('content-type'), cd: r.headers.get('content-disposition'), text: await r.text() }
}
const results = []
const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? '  ' + extra : '')) }

const admin = await login('admin', 'admin123')
check('admin 登录', !!admin)

const csv = await get(admin, '/logs/export?format=csv')
const json = await get(admin, '/logs/export?format=json')

check('admin 导出 CSV 状态 200', csv.status === 200)
check('admin 导出 CSV Content-Type=text/csv', (csv.ct || '').includes('text/csv'))
check('admin 导出 CSV 含 Content-Disposition', (csv.cd || '').includes('attachment'))
check('admin 导出 CSV 含表头(id,created_at,...)', csv.text.includes('id,created_at,username'))
check('admin 导出 CSV 含哈希链列(prev_hash,hash)', csv.text.includes('prev_hash') && csv.text.includes('hash'))

let arr = null
try { arr = JSON.parse(json.text) } catch {}
check('admin 导出 JSON 状态 200', json.status === 200)
check('admin 导出 JSON 为数组', Array.isArray(arr))

// 导出动作应留痕于审计链：查询 action=export 的记录
const logRes = await get(admin, '/logs?action=export&limit=5')
let items = []
try { items = JSON.parse(logRes.text)?.data?.items || [] } catch {}
check('导出动作写入审计链(action=export)', items.some((x) => x.action === 'export'), '最近导出条数=' + items.length)

const fails = results.filter((r) => !r.pass).length
console.log('\n=== GMP 导出验证: ' + (fails === 0 ? 'ALL PASS' : fails + ' FAIL') + ' ===')
process.exitCode = fails === 0 ? 0 : 1

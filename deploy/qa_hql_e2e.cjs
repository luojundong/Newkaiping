// Request E E2E: 后勤楼(building 6) whole-model + per-floor segmented model + data drawer
// Navigates via /bigscreen/building/6 (selects building 6 -> loads whole model), then clicks F1/F2/F3.
const { chromium } = require('playwright')
const BASE = 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  return cond ? 1 : 0
}

async function getToken() {
  const r = await fetch(A('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const j = await r.json()
  if (!j.data || !j.data.token) throw new Error('login failed: ' + JSON.stringify(j))
  return j.data.token
}

;(async () => {
  let pass = 0, fail = 0
  const token = await getToken()

  // ---- API-level data-source alignment ----
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const blds = (await (await fetch(A('/buildings'), { headers: H })).json()).data.items
  const b6 = blds.find((b) => b.id === '6')
  pass += check('API building#6 exists', !!b6, b6 && `${b6.name} floors=${b6.floors}`); if (!b6) fail++
  pass += check('API building#6 floors===3', b6 && b6.floors === 3, b6 && `(${b6.floors})`); if (!(b6 && b6.floors === 3)) fail++
  const cfg = (await (await fetch(A('/scene/config'), { headers: H })).json()).data
  const anc = (cfg.building_anchors || []).find((a) => a.building_id === '6')
  pass += check('API building#6 anchor present', !!anc, anc && `(${anc.position.x.toFixed(2)},${anc.position.y},${anc.position.z.toFixed(2)})`); if (!anc) fail++
  // static GLB serving
  for (const f of ['hql-building.glb', 'hql-f1.glb', 'hql-f2.glb', 'hql-f3.glb']) {
    const rr = await fetch(`${BASE}/models/${f}`, { method: 'HEAD' })
    pass += check(`static ${f} 200`, rr.status === 200, `(${rr.headers.get('content-length')}B)`); if (rr.status !== 200) fail++
  }

  // ---- Browser-level chain ----
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  const glb = {}
  page.on('response', (res) => {
    const u = res.url()
    if (u.includes('/models/') && u.endsWith('.glb')) glb[u] = res.status()
  })
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERR: ' + e.message))
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)

  await page.goto(`${BASE}/bigscreen/building/6`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(6000) // allow scene + whole-building GLB fetch

  const bUrl = `${BASE}/models/hql-building.glb`
  pass += check('Whole building GLB requested 200', glb[bUrl] === 200, `status=${glb[bUrl]}`); if (glb[bUrl] !== 200) fail++

  const flBtns = await page.locator('.bs-floorlist .fl').allTextContents().catch(() => [])
  const flSet = flBtns.map((s) => s.trim())
  console.log('floor buttons:', JSON.stringify(flSet))
  const floorsOk = ['F1', 'F2', 'F3'].every((f) => flSet.includes(f)) && !flSet.includes('F0') && !flSet.includes('0F')
  pass += check('Floor panel shows F1/F2/F3 (no 0F)', floorsOk, `(${flSet.join(',')})`); if (!floorsOk) fail++

  const floorOut = {}
  for (const f of [1, 2, 3]) {
    const btn = page.locator('.bs-floorlist .fl').filter({ hasText: `F${f}` })
    if (await btn.count() === 0) { console.log(`floor ${f}: no button`); fail++; continue }
    await btn.click()
    await page.waitForTimeout(6000)
    const u = `${BASE}/models/hql-f${f}.glb`
    const drawerVisible = await page.locator('.kp-modal.floor-drill').isVisible().catch(() => false)
    const drawerTitle = await page.locator('.fd__title').first().innerText().catch(() => '')
    floorOut[f] = { glbStatus: glb[u] || 'NOT_REQUESTED', drawerVisible, drawerTitle: drawerTitle.trim() }
    console.log(`floor ${f}:`, JSON.stringify(floorOut[f]))
    pass += check(`Floor ${f} segmented GLB 200`, glb[u] === 200, `status=${glb[u]}`); if (glb[u] !== 200) fail++
    pass += check(`Floor ${f} data drawer opens`, drawerVisible, `title="${drawerTitle.trim()}"`); if (!drawerVisible) fail++
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(800)
  }

  console.log('\nconsole errors (first 8):')
  consoleErrors.slice(0, 8).forEach((e) => console.log('  ', e))
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

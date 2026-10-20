// 针对性 QA：选 6 号楼后相机必须对准真实 hql-building.glb 模型（修复「选 6 号楼看不到模型」）。
// 两条到达路径都要验证：
//   A. 导航点击流（真实用户流）：overview 页加载完成（preset 目录就绪）→ 点顶栏「6号楼」→ flyToBuilding 命中
//      schema 预设 → translatePresetForAnchor 平移 → lookAt = (锚点x, 预设y=10, 锚点z)
//   B. 直链流：/bigscreen/building/6 直接打开（选中先于 schema 加载，preset 目录为空）→ 锚点回退
//      flyTo([x,0,z]) → lookAt = (锚点x, 0, 锚点z)
// 两条路径的 lookAt.x/z 都必须等于模型世界中心（runtime 锚点 x/z）。
const { chromium } = require('playwright')
const BASE = 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
const SHOT = 'D:/wwwroot/NewKaiPing/deploy'

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  return cond ? 1 : 0
}

async function getToken() {
  const r = await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
  const j = await r.json()
  if (!j.data || !j.data.token) throw new Error('login failed')
  return j.data.token
}

async function getB6Anchor(token) {
  const H = { Authorization: `Bearer ${token}` }
  const cfg = (await (await fetch(A('/scene/config'), { headers: H })).json()).data
  const a = (cfg.building_anchors || []).find((x) => String(x.building_id) === '6')
  return a ? { x: +a.position.x, y: +a.position.y, z: +a.position.z } : null
}

;(async () => {
  let pass = 0, fail = 0
  const token = await getToken()
  const anchor = await getB6Anchor(token)
  pass += check('b6 runtime anchor present', !!anchor, JSON.stringify(anchor)); if (!anchor) fail++

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const errors = []

  const newPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
    await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)
    return page
  }
  const assertAligned = (tag, cam, expectY, tolY) => {
    if (!cam) { fail += 2; pass += check(tag + ' camPose', false); return }
    const dx = Math.abs(cam.lookAt.x - anchor.x)
    const dz = Math.abs(cam.lookAt.z - anchor.z)
    const dy = Math.abs(cam.lookAt.y - expectY)
    const ok = dx < 3 && dz < 3 && dy < tolY
    pass += check(`${tag} lookAt aligned (x/z=anchor, y≈${expectY})`, ok,
      `dx=${dx.toFixed(2)} dz=${dz.toFixed(2)} dy=${dy.toFixed(2)} lookAt=${JSON.stringify(cam.lookAt)}`)
    if (!ok) fail++
  }

  // ---- A. 导航点击流（preset 路径）----
  console.log('--- A. nav-click flow (preset path) ---')
  let page = await newPage()
  const glb = {}
  page.on('response', (res) => { const u = res.url(); if (u.includes('/models/') && u.endsWith('.glb')) glb[u] = res.status() })
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(6000) // 等 schema/preset 目录与场景就绪
  const tab = page.locator('.bs-bldnav .btab').filter({ hasText: '6号楼' })
  pass += check('b6 nav tab present', (await tab.count()) > 0); if (!(await tab.count())) fail++
  await tab.first().dispatchEvent('click')
  // 等整栋模型加载 + 相机飞行（800ms）落定
  await page.waitForFunction(() => { try { return !!(window.__kpB6Jump && window.__kpB6Jump.wholeBox()); } catch { return false } }, { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(5000)
  pass += check('whole building GLB 200 (nav flow)', glb[`${BASE}/models/hql-building.glb`] === 200, `(${glb[`${BASE}/models/hql-building.glb`]})`); if (glb[`${BASE}/models/hql-building.glb`] !== 200) fail++
  const camA = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? { cam: h.camPose(), center: h.modelCenter(), box: h.wholeBox() } : null })
  console.log('  nav-flow state:', JSON.stringify(camA))
  if (camA && camA.box) pass += check('wholeBox loaded (nav flow)', true); else { fail++; pass += check('wholeBox loaded (nav flow)', false) }
  assertAligned('A preset-path', camA && camA.cam, 10, 4) // 预设 lookAt.y=10
  await page.screenshot({ path: `${SHOT}/_qa_b6_navflow.png` }).catch(() => {})
  await page.close()

  // ---- B. 直链流（锚点回退路径）----
  console.log('--- B. direct-url flow (anchor fallback path) ---')
  page = await newPage()
  await page.goto(`${BASE}/bigscreen/building/6`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => { try { return !!(window.__kpB6Jump && window.__kpB6Jump.wholeBox()); } catch { return false } }, { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(5000)
  const camB = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? h.camPose() : null })
  console.log('  direct-url cam:', JSON.stringify(camB))
  assertAligned('B fallback-path', camB, 0, 4) // 回退目标取地面 y=0
  await page.screenshot({ path: `${SHOT}/_qa_b6_directurl.png` }).catch(() => {})

  // ---- 楼层预设跟随锚点（在 B 页点 F2 Tab）----
  console.log('--- floor preset anchor follow ---')
  const f2tab = page.locator('.bld6-tab').filter({ hasText: 'F2' })
  if (await f2tab.count()) {
    await f2tab.first().dispatchEvent('click')
    await page.waitForTimeout(5000)
    const f2 = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? h.camPose() : null })
    if (f2) {
      const dx = Math.abs(f2.lookAt.x - anchor.x)
      const dz = Math.abs(f2.lookAt.z - anchor.z)
      const aligned = dx < 3 && dz < 3
      pass += check('floor F2 camera follows runtime anchor', aligned, `dx=${dx.toFixed(2)} dz=${dz.toFixed(2)} lookAt=${JSON.stringify(f2.lookAt)}`); if (!aligned) fail++
    } else { fail++; console.log('  FAIL no camPose after F2') }
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForSelector('.kp-modal.floor-drill', { state: 'hidden', timeout: 5000 }).catch(() => {})
  }
  await page.close()

  // ---- 院区全景回退 ----
  console.log('--- back to overview ---')
  page = await newPage()
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(5000)
  const ov = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? h.camPose() : null })
  if (ov) {
    const dx = Math.abs(ov.lookAt.x - anchor.x)
    const dz = Math.abs(ov.lookAt.z - anchor.z)
    const reset = dx > 10 || dz > 10
    pass += check('overview not stuck on b6 anchor', reset, `lookAt=${JSON.stringify(ov.lookAt)}`); if (!reset) fail++
  } else { fail++ }
  await page.close()

  console.log('\nconsole errors:', errors.length)
  errors.slice(0, 6).forEach((e) => console.log('  ', e))
  pass += check('no console errors', errors.length === 0, `(${errors.length})`); if (errors.length) fail++

  console.log(`\nB6 CAMERA QA RESULT: ${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

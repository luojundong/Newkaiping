// 「试一下」线上实测：选 6 号楼后等模型落定，稳定截图（解决字体加载 hang 导致 screenshot 超时）。
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
  return a ? { x: +a.position.x, z: +a.position.z } : null
}

;(async () => {
  let pass = 0, fail = 0
  const token = await getToken()
  const anchor = await getB6Anchor(token)
  pass += check('b6 runtime anchor present', !!anchor, JSON.stringify(anchor)); if (!anchor) process.exit(2)

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
  // 关键：中止外部字体请求，避免 document.fonts.ready 因离线字体 hang 导致截图超时
  await page.route('**/*', (route) => {
    const u = route.request().url()
    const rt = route.request().resourceType()
    if (rt === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {})
    return route.continue().catch(() => {})
  })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)

  const glb = {}
  page.on('response', (res) => { const u = res.url(); if (u.includes('/models/') && u.endsWith('.glb')) glb[u] = res.status() })

  // 直链流（最干净）：/bigscreen/building/6
  await page.goto(`${BASE}/bigscreen/building/6`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  const t0 = Date.now()
  let loaded = false
  try {
    await page.waitForFunction(() => {
      try {
        const h = window.__kpB6Jump
        if (!h || !h.wholeBox()) return false
        return !document.querySelector('.viewer-loading')
      } catch { return false }
    }, { timeout: 90000 })
    loaded = true
  } catch {}
  console.log(`  model settle: ${((Date.now() - t0) / 1000).toFixed(1)}s loaded=${loaded}`)
  pass += check('GLB 200', glb[`${BASE}/models/hql-building.glb`] === 200, `(${glb[`${BASE}/models/hql-building.glb`]})`); if (glb[`${BASE}/models/hql-building.glb`] !== 200) fail++
  pass += check('model loaded + overlay gone', loaded); if (!loaded) fail++

  await page.waitForTimeout(3500)
  const st = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? { cam: h.camPose(), center: h.modelCenter(), box: h.wholeBox() } : null })
  console.log('  state:', JSON.stringify(st))
  if (st && st.cam) {
    const ok = Math.abs(st.cam.lookAt.x - anchor.x) < 3 && Math.abs(st.cam.lookAt.z - anchor.z) < 3
    pass += check('camera on model anchor', ok, `lookAt=${JSON.stringify(st.cam.lookAt)}`); if (!ok) fail++
  } else { fail++; pass += check('camPose available', false) }

  try {
    await page.screenshot({ path: `${SHOT}/_qa_b6_try.png`, timeout: 60000, animations: 'disabled' })
    console.log('  screenshot OK -> _qa_b6_try.png')
  } catch (e) {
    console.log('  screenshot still failed:', e.message)
  }
  pass += check('no console errors', errors.length === 0, `(${errors.length})`); if (errors.length) fail++
  console.log(`\nB6 TRY RESULT: ${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

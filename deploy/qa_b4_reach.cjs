const { chromium } = require('playwright')
const BASE = 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
;(async () => {
  const token = (await (await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json()).data.token
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  await page.route('**/*', (route) => { const t = route.request().resourceType(), u = route.request().url(); if (t === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {}); return route.continue().catch(() => {}) })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await page.evaluate(() => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => /4号楼/.test(e.textContent || '')); t && t.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await page.waitForTimeout(2500)
  const state = await page.evaluate(() => ({
    selectedBuilding: window.__kpScene ? null : null,
    srcFloors: document.querySelectorAll('.src-floor').length,
    flBtns: document.querySelectorAll('.fl-btn').length,
    bsFloorlist: document.querySelectorAll('.bs-floorlist .fl').length,
    bottomBar: !!document.querySelector('.bottom-bar'),
    bld6Tabs: document.querySelectorAll('.bld6-tab').length,
    anyFloorBtn: [...document.querySelectorAll('button')].filter((b) => /F\d/.test(b.textContent || '')).slice(0, 8).map((b) => b.textContent.trim()),
  }))
  // 也读 store 状态（通过 DOM 不可得，改读 building_display API）
  const H = { Authorization: `Bearer ${token}` }
  const bd = await (await fetch(A('/scene/building-display'), { headers: H })).json()
  console.log('STATE', JSON.stringify(state, null, 1))
  console.log('floors_by_building keys', Object.keys(bd.data?.floors_by_building || {}))
  console.log('floors_by_building[4]', JSON.stringify(bd.data?.floors_by_building?.['4'] || null))
  await browser.close()
})().catch((e) => { console.error('ERR', e); process.exit(2) })

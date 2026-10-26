// Round 2: 楼层钻取 Tab 泛化回归。遍历 1..10 号楼，断言：
// - 6 号楼 -> .bld6-tabs 含 F1/F2/F3
// - 4 号楼 -> .bld6-tabs 含 F1
// - 其余楼 -> 无 .bld6-tabs（无楼层 GLB）
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
;(async () => {
  const token = (await (await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json()).data.token
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  const consoleErrs = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()) })
  await page.route('**/*', (route) => { const t = route.request().resourceType(), u = route.request().url(); if (t === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {}); return route.continue().catch(() => {}) })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const results = []
  for (let n = 1; n <= 10; n++) {
    const clicked = await page.evaluate((num) => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => new RegExp(num + '号楼').test(e.textContent || '')); if (!t) return false; t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true }, n)
    await page.waitForTimeout(700)
    const info = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.bld6-tabs')]
      const btns = [...document.querySelectorAll('.bld6-tab')].map((e) => (e.textContent || '').trim())
      return { tabsCount: tabs.length, btns }
    })
    results.push({ bld: n, clicked, ...info })
  }
  console.log('TAB_SCAN', JSON.stringify(results, null, 0))
  // 断言
  const b6 = results.find((r) => r.bld === 6)
  const b4 = results.find((r) => r.bld === 4)
  const others = results.filter((r) => r.bld !== 4 && r.bld !== 6)
  // BuildingFloorTabs 含「整楼」返回按钮 + 各楼层按钮；断言仅比对楼层按钮（剔除「整楼」）
  const floorsOf = (r) => r.btns.filter((b) => /^F\d+$/.test(b))
  const expect6 = b6 && b6.tabsCount === 1 && JSON.stringify(floorsOf(b6)) === JSON.stringify(['F1','F2','F3'])
  const expect4 = b4 && b4.tabsCount === 1 && JSON.stringify(floorsOf(b4)) === JSON.stringify(['F1'])
  const expectOthers = others.every((r) => r.tabsCount === 0)
  console.log('EXPECT_6', expect6, 'EXPECT_4', expect4, 'EXPECT_OTHERS', expectOthers)
  console.log('consoleErrs', consoleErrs.length)
  const pass = expect6 && expect4 && expectOthers && consoleErrs.length === 0
  console.log(pass ? 'R2_OK' : 'R2_FAIL')
  await browser.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

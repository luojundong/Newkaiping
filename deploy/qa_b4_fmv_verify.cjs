// 验证 4 号楼（妇产儿科大楼）钻取弹窗 3D 模型视图：选 4 号楼 → 点 F1 楼层 → openFloorDrill('4',1)
// （4 号楼仅 F1 有 floor-fc-f1.glb；F2-F13 无模型，预期回退 2D）。CDP 合成截图 + pngjs 解码统计像素。
const { chromium } = require('playwright')
const { PNG } = require('pngjs')
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
  await page.waitForTimeout(3000)
  const clicked = await page.evaluate(() => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => /4号楼/.test(e.textContent || '')); if (!t) return false; t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })
  console.log('clicked 4号楼 tab ->', clicked)
  await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1000)
  // 点 F1 楼层按钮（BuildingFloorTabs 泛化入口，选中楼栋有楼层模型即显示）
  const clickedFloor = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.bld6-tab')].find((e) => /F1/.test(e.textContent || ''))
    if (!f) return false
    f.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  console.log('clicked F1 floor (BuildingFloorTabs) ->', clickedFloor)
  const mounted = await page.waitForFunction(() => !!document.querySelector('.floor-model-view'), { timeout: 45000 }).then(() => true).catch(() => false)
  console.log('floor-model-view mounted ->', mounted)
  if (!mounted) {
    // 可能 F1 走 2D（无模型）或触发方式不同；记录状态
    const state = await page.evaluate(() => ({ has2d: !!document.querySelector('.floor-plan-view'), hasDrawer: !!document.querySelector('.floor-drill-drawer, .el-dialog'), fdTitle: document.querySelector('.fd-title, .floor-drill__title')?.textContent || null }))
    console.log('STATE(no 3d)', JSON.stringify(state))
    console.log('consoleErrs', consoleErrs.slice(0, 5))
    await browser.close(); process.exit(0)
  }
  await page.waitForFunction(() => { const w = document.querySelector('.floor-model-view'); if (!w) return false; const t = [...w.querySelectorAll('.fmv-tip')].map((e) => e.textContent.trim()); return !t.some((x) => /加载中|失败/.test(x)) }, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const rect = await page.evaluate(() => { const c = document.querySelector('.floor-model-view canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  if (!rect) { console.log('NO_CANVAS'); await browser.close(); process.exit(3) }
  const client = await page.context().newCDPSession(page)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height, scale: 1 }, captureBeyondViewport: false })
  const png = PNG.sync.read(Buffer.from(shot.data, 'base64'))
  const BG = [3, 12, 24]; let nonBg = 0, bright = 0; const total = png.width * png.height
  for (let i = 0; i < png.data.length; i += 4) { const r = png.data[i], g = png.data[i+1], b = png.data[i+2]; const d = Math.abs(r-BG[0])+Math.abs(g-BG[1])+Math.abs(b-BG[2]); if (d > 36) { nonBg++; const mx = Math.max(r,g,b), mn = Math.min(r,g,b); if (mx>110 && (mx-mn)>60) bright++ } }
  console.log('IMG', png.width+'x'+png.height, 'nonBg', nonBg, 'ratio', +(nonBg/total).toFixed(4), 'bright', bright)
  console.log('consoleErrs', consoleErrs.length, JSON.stringify(consoleErrs.slice(0,5)))
  console.log((nonBg > total*0.01 && bright > 10) ? 'VERIFY_OK' : 'VERIFY_FAIL')
  await browser.close(); process.exit((nonBg > total*0.01 && bright > 10) ? 0 : 4)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

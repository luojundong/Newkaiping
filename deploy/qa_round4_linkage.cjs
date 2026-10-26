// Round 4: 双向联动 & 抽屉交互。打开 6号楼 F2 钻取弹窗，验证：
// - 设备列表 .fd-item 渲染且数量 >=1（设备数据+列表链路 OK）
// - 点击首个 .fd-item 不报错，FloorModelView 仍挂载、canvas 仍在（selectedDeviceId -> 3D 高亮链路无异常）
// - 若存在 .fd-room-chip，点击后 .fd-room-chip--on 生效并过滤列表
// - 关闭 .fd__close 抽屉可关闭
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
;(async () => {
  const token = (await (await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json()).data.token
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  const consoleErrs = [], pageErrs = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()) })
  page.on('pageerror', (e) => pageErrs.push(String(e)))
  await page.route('**/*', (route) => { const t = route.request().resourceType(), u = route.request().url(); if (t === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {}); return route.continue().catch(() => {}) })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => /6号楼/.test(e.textContent || '')); t && t.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {})
  await page.evaluate(() => { const f = [...document.querySelectorAll('.bld6-tab')].find((e) => /F2/.test(e.textContent || '')); f && f.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const mounted = await page.waitForFunction(() => !!document.querySelector('.floor-model-view'), { timeout: 45000 }).then(() => true).catch(() => false)
  if (!mounted) { console.log('NO_DRAWER'); await browser.close(); process.exit(3) }
  await page.waitForFunction(() => { const w = document.querySelector('.floor-model-view'); if (!w) return false; const t = [...w.querySelectorAll('.fmv-tip')].map((e) => e.textContent.trim()); return !t.some((x) => /加载中|失败/.test(x)) }, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(2000)

  const devCount = await page.evaluate(() => document.querySelectorAll('.fd-item').length)
  console.log('DEVICE_ITEMS', devCount)
  const hasCanvas = await page.evaluate(() => !!document.querySelector('.floor-model-view canvas'))
  console.log('MODEL_CANVAS', hasCanvas)

  // 点击首个设备项（触发 selectedDeviceId -> 3D 高亮链路）
  let clickOk = false
  if (devCount > 0) {
    await page.evaluate(() => document.querySelector('.fd-item').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(1500)
    clickOk = await page.evaluate(() => !!document.querySelector('.floor-model-view canvas'))
  }
  console.log('AFTER_ITEM_CLICK_MODEL_ALIVE', clickOk)

  // 房间芯片过滤（可选）。注意：Vue class 更新是异步（nextTick），点击后必须等待再读取 --on 状态
  const hasRooms = await page.evaluate(() => document.querySelectorAll('.fd-room-chip').length > 0)
  let roomOn = false
  if (hasRooms) {
    await page.evaluate(() => document.querySelector('.fd-room-chip').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await page.waitForTimeout(600)
    roomOn = await page.evaluate(() => !!document.querySelector('.fd-room-chip--on'))
  }
  const roomInfo = { hasRooms, on: roomOn }
  console.log('ROOM_FILTER', JSON.stringify(roomInfo))

  // 关闭抽屉
  const closed = await page.evaluate(() => { const c = document.querySelector('.fd__close'); if (!c) return 'no-close-btn'; c.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'clicked' })
  await page.waitForTimeout(800)
  const drawerGone = await page.evaluate(() => !document.querySelector('.floor-model-view'))
  console.log('CLOSE', closed, 'DRAWER_GONE', drawerGone)

  const pass = devCount >= 1 && hasCanvas && clickOk && (roomInfo.hasRooms ? roomInfo.on : true) && drawerGone && consoleErrs.length === 0 && pageErrs.length === 0
  console.log('consoleErrs', consoleErrs.length, 'pageErrs', pageErrs.length)
  console.log(pass ? 'R4_OK' : 'R4_FAIL')
  await browser.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

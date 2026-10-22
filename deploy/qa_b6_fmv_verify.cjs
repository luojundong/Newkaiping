// 确定性验证：弹窗 FloorModelView 画布是否真的渲染了楼层模型 + 设备标记点。
// 触发：6 号楼 tab(dispatchEvent) → Bld6FloorTabs F2(dispatchEvent) → store.openFloorDrill('6',2)，
// 不依赖主 3D 模型。截图用 CDP 取合成后画布，pngjs 解码统计像素。
// BASE 可经环境变量覆盖（默认公网 WAN）。
const { chromium } = require('playwright')
const { PNG } = require('pngjs')
const BASE = process.env.BASE || 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`

async function getToken() {
  const r = await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
  return (await r.json()).data.token
}

;(async () => {
  const token = await getToken()
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  const consoleErrs = [], pageErrs = [], glbReq = {}
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()) })
  page.on('pageerror', (e) => pageErrs.push(String(e)))
  page.on('requestfinished', (r) => { const u = r.url(); if (/hql-f\d\.glb/.test(u)) glbReq[u] = (glbReq[u] || '') + ' ok' })
  page.on('requestfailed', (r) => { const u = r.url(); if (/hql-f\d\.glb/.test(u)) glbReq[u] = 'FAIL:' + (r.failure()?.errorText || '') })

  await page.route('**/*', (route) => {
    const t = route.request().resourceType(), u = route.request().url()
    if (t === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {})
    return route.continue().catch(() => {})
  })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)

  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(3000)
  // 1) 选 6 号楼
  const clickedTab = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => /6号楼/.test(e.textContent || ''))
    if (!tab) return false
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  console.log('clicked 6号楼 tab ->', clickedTab)
  await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {})
  // 2) 点 F2 → openFloorDrill('6',2)
  const clickedFloor = await page.evaluate(() => {
    const f = [...document.querySelectorAll('.bld6-tab')].find((e) => /F2/.test(e.textContent || ''))
    if (!f) return false
    f.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  console.log('clicked F2 ->', clickedFloor)
  await page.waitForFunction(() => !!document.querySelector('.floor-model-view'), { timeout: 45000 }).catch(() => {})
  await page.waitForFunction(() => {
    const wrap = document.querySelector('.floor-model-view')
    if (!wrap) return false
    const tips = [...wrap.querySelectorAll('.fmv-tip')].map((e) => e.textContent.trim())
    return !tips.some((t) => /加载中|失败/.test(t))
  }, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const rect = await page.evaluate(() => {
    const c = document.querySelector('.floor-model-view canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, cw: c.width, ch: c.height }
  })
  console.log('canvas rect ->', JSON.stringify(rect))
  if (!rect) { console.log('NO_CANVAS'); console.log('glbReq', JSON.stringify(glbReq)); console.log('consoleErrs', consoleErrs.slice(0, 5)); await browser.close(); process.exit(3) }

  const client = await page.context().newCDPSession(page)
  const clip = { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height, scale: 1 }
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false })
  const png = PNG.sync.read(Buffer.from(shot.data, 'base64'))
  const BG = [3, 12, 24]
  let nonBg = 0, bright = 0, total = png.width * png.height
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]
    const d = Math.abs(r - BG[0]) + Math.abs(g - BG[1]) + Math.abs(b - BG[2])
    if (d > 36) { nonBg++; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx > 110 && (mx - mn) > 60) bright++ }
  }
  const ratio = +(nonBg / total).toFixed(4)
  console.log('glbReq:', JSON.stringify(glbReq))
  console.log('IMG:', png.width + 'x' + png.height, 'total', total)
  console.log('nonBg', nonBg, 'ratio', ratio, 'bright(markers)', bright)
  console.log('consoleErrs', consoleErrs.length, JSON.stringify(consoleErrs.slice(0, 5)))
  console.log('pageErrs', pageErrs.length, JSON.stringify(pageErrs.slice(0, 5)))
  const ok = nonBg > total * 0.01 && bright > 10
  console.log(ok ? 'VERIFY_OK' : 'VERIFY_FAIL')
  await browser.close()
  process.exit(ok ? 0 : 4)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

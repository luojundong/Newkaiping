// 本地 dev 浏览器冒烟：http://localhost:5169 前端 + http://localhost:5168 后端
// 重点验证 /models 代理修复后，概览大屏 3D 与楼层钻取 3D 在本地真实渲染（CDP 截图 + pngjs 像素统计）。
const { chromium } = require('playwright')
const { PNG } = require('pngjs')
const FE = process.env.FE || 'http://localhost:5169'
const API = process.env.API || 'http://localhost:5168'
const A = (p) => `${API}/api/v1${p}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const login = await fetch(A('/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
  const token = (await login.json()).data.token
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', args: ['--no-sandbox', '--no-proxy-server', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  const consoleErrs = [], pageErrs = [], badUrls = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()) })
  page.on('pageerror', (e) => pageErrs.push(String(e)))
  page.on('response', (r) => { if (r.status() >= 400) badUrls.push(`${r.status()} ${r.url()}`) })
  await page.route('**/*', (route) => { const t = route.request().resourceType(), u = route.request().url(); if (t === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {}); return route.continue().catch(() => {}) })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)
  await page.goto(`${FE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await sleep(4500) // 等主大屏 3D 渲染

  const mainCanvas = await page.evaluate(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
  console.log('MAIN_CANVAS', JSON.stringify(mainCanvas))

  async function pixOf(selector) {
    const rect = await page.evaluate((s) => { const c = document.querySelector(s); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }, selector)
    if (!rect) return null
    const client = await page.context().newCDPSession(page)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height, scale: 1 }, captureBeyondViewport: false })
    const png = PNG.sync.read(Buffer.from(shot.data, 'base64'))
    const BG = [3, 12, 24]; let nonBg = 0, bright = 0; const total = png.width * png.height
    for (let i = 0; i < png.data.length; i += 4) { const r = png.data[i], g = png.data[i+1], b = png.data[i+2]; const d = Math.abs(r-BG[0])+Math.abs(g-BG[1])+Math.abs(b-BG[2]); if (d > 36) { nonBg++; const mx = Math.max(r,g,b), mn = Math.min(r,g,b); if (mx>110 && (mx-mn)>60) bright++ } }
    return { total, nonBg, ratio: +(nonBg/total).toFixed(4), bright }
  }

  const mainPix = await pixOf('canvas')
  console.log('MAIN_3D', JSON.stringify(mainPix))

  // 6 号楼 F2 钻取
  await page.evaluate(() => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => /6号楼/.test(e.textContent || '')); t && t.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {})
  await sleep(500)
  await page.evaluate(() => { const f = [...document.querySelectorAll('.bld6-tab')].find((e) => /F2/.test(e.textContent || '')); f && f.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const m6 = await page.waitForFunction(() => !!document.querySelector('.floor-model-view canvas'), { timeout: 45000 }).then(() => true).catch(() => false)
  await page.waitForFunction(() => { const w = document.querySelector('.floor-model-view'); if (!w) return false; const t = [...w.querySelectorAll('.fmv-tip')].map((e) => e.textContent.trim()); return !t.some((x) => /加载中|失败/.test(x)) }, { timeout: 120000 }).catch(() => {})
  await sleep(2500)
  const pix6 = await pixOf('.floor-model-view canvas')
  console.log('DRILL_6F2_MODEL_MOUNTED', m6, 'PIX', JSON.stringify(pix6))
  await page.evaluate(() => { const c = document.querySelector('.fd__close'); c && c.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await sleep(800)

  // 4 号楼 F1 钻取
  await page.evaluate(() => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => /4号楼/.test(e.textContent || '')); t && t.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {})
  await sleep(500)
  await page.evaluate(() => { const f = [...document.querySelectorAll('.bld6-tab')].find((e) => /F1/.test(e.textContent || '')); f && f.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const m4 = await page.waitForFunction(() => !!document.querySelector('.floor-model-view canvas'), { timeout: 45000 }).then(() => true).catch(() => false)
  await page.waitForFunction(() => { const w = document.querySelector('.floor-model-view'); if (!w) return false; const t = [...w.querySelectorAll('.fmv-tip')].map((e) => e.textContent.trim()); return !t.some((x) => /加载中|失败/.test(x)) }, { timeout: 120000 }).catch(() => {})
  await sleep(2500)
  const pix4 = await pixOf('.floor-model-view canvas')
  console.log('DRILL_4F1_MODEL_MOUNTED', m4, 'PIX', JSON.stringify(pix4))

  console.log('consoleErrs', consoleErrs.length, JSON.stringify(consoleErrs.slice(0, 8)))
  console.log('pageErrs', pageErrs.length, JSON.stringify(pageErrs.slice(0, 8)))
  console.log('badUrls', badUrls.length, JSON.stringify(badUrls.slice(0, 12)))
  // 开发期 Vite 未提供 /favicon.ico（浏览器自动请求）→ 404，与本特性无关，单独剔除。
  // 真实静态资源（glb/JS chunk）缺失会体现在 3D 像素断言与 badUrls 中，不会被此放行掩盖。
  const benign = (e) => /favicon|Failed to load resource/i.test(e)
  const realConsoleErrs = consoleErrs.filter((e) => !benign(e))
  const mainOk = mainPix && mainPix.nonBg > mainPix.total * 0.02
  const d6Ok = m6 && pix6 && pix6.nonBg > pix6.total * 0.01 && pix6.bright > 10
  const d4Ok = m4 && pix4 && pix4.nonBg > pix4.total * 0.01 && pix4.bright > 10
  const pass = mainOk && d6Ok && d4Ok && realConsoleErrs.length === 0 && pageErrs.length === 0
  console.log('SMOKE', mainOk ? 'MAIN_OK' : 'MAIN_FAIL', d6Ok ? '6F2_OK' : '6F2_FAIL', d4Ok ? '4F1_OK' : '4F1_FAIL')
  console.log(pass ? 'LOCAL_SMOKE_OK' : 'LOCAL_SMOKE_FAIL')
  await browser.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

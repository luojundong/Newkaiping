// Round 5: 健壮性/边界。验证：
// - 反复开/关 钻取弹窗 5 轮（6F2 <-> 4F1），每轮模型挂载、无卡死「加载中/失败」、无错
// - 跨楼栋快速切换（不等待关闭即切走）不崩
// - 全程 consoleErrs=0 && pageErrs=0
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
  await sleep(2500)

  const clickBld = (n) => page.evaluate((num) => { const t = [...document.querySelectorAll('.bs-bldnav .btab')].find((e) => new RegExp(num + '号楼').test(e.textContent || '')); t && t.dispatchEvent(new MouseEvent('click', { bubbles: true })) }, n)
  const clickFloor = (f) => page.evaluate((fl) => { const t = [...document.querySelectorAll('.bld6-tab')].find((e) => new RegExp(fl).test(e.textContent || '')); t && t.dispatchEvent(new MouseEvent('click', { bubbles: true })) }, f)
  const closeDrawer = () => page.evaluate(() => { const c = document.querySelector('.fd__close'); c && c.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  const modelReady = async () => page.waitForFunction(() => { const w = document.querySelector('.floor-model-view'); if (!w) return false; const t = [...w.querySelectorAll('.fmv-tip')].map((e) => e.textContent.trim()); return !t.some((x) => /加载中|失败/.test(x)) }, { timeout: 120000 }).then(() => true).catch(() => false)
  const stuckLoading = () => page.evaluate(() => { const w = document.querySelector('.floor-model-view'); if (!w) return false; return [...w.querySelectorAll('.fmv-tip')].some((e) => /加载中|失败/.test(e.textContent || '')) })

  let cycles = 0, stuck = 0
  for (let i = 1; i <= 5; i++) {
    // 6 号楼 F2
    await clickBld(6); await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {}); await sleep(500)
    await clickFloor('F2'); await page.waitForFunction(() => !!document.querySelector('.floor-model-view'), { timeout: 45000 }).catch(() => {})
    const ok6 = await modelReady(); if (await stuckLoading()) stuck++
    await closeDrawer(); await sleep(700)
    const gone6 = await page.evaluate(() => !document.querySelector('.floor-model-view'))
    // 4 号楼 F1
    await clickBld(4); await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {}); await sleep(500)
    await clickFloor('F1'); await page.waitForFunction(() => !!document.querySelector('.floor-model-view'), { timeout: 45000 }).catch(() => {})
    const ok4 = await modelReady(); if (await stuckLoading()) stuck++
    await closeDrawer(); await sleep(700)
    const gone4 = await page.evaluate(() => !document.querySelector('.floor-model-view'))
    cycles++
    console.log(`cycle ${i}: 6F2=${ok6} gone=${gone6} 4F1=${ok4} gone=${gone4}`)
    if (!(ok6 && gone6 && ok4 && gone4)) { console.log('CYCLE_FAIL at', i); break }
  }

  // 快速跨楼栋切换（不等待关闭即切走）
  await clickBld(6); await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {}); await sleep(300); await clickFloor('F2')
  await sleep(400)
  await clickBld(4); await page.waitForSelector('.bld6-tabs', { timeout: 20000 }).catch(() => {}); await sleep(300); await clickFloor('F1')
  await sleep(400)
  await clickBld(6); await sleep(300); await clickFloor('F2')
  const rapidOk = await modelReady().catch(() => false)
  console.log('RAPID_SWITCH_MODEL_OK', rapidOk)

  console.log('cycles', cycles, 'stuckLoading', stuck, 'consoleErrs', consoleErrs.length, 'pageErrs', pageErrs.length)
  const pass = cycles === 5 && stuck === 0 && rapidOk && consoleErrs.length === 0 && pageErrs.length === 0
  console.log(pass ? 'R5_OK' : 'R5_FAIL')
  await browser.close(); process.exit(pass ? 0 : 1)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

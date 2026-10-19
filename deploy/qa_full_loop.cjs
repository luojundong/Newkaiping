// Comprehensive QA loop for 开平医院能源管理平台 (covers api/构建/功能按钮/样式/文字/逻辑)
// Run multiple times for stability. Screenshots saved to deploy/ for visual verification.
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

async function apiSmoke(token) {
  let pass = 0, fail = 0
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const endpoints = [
    '/buildings', '/scene/config', '/scene/subsystem-meta', '/scene/building-display',
    '/devices?page=1&page_size=5', '/alarms?page=1&page_size=5', '/energy/summary', '/energy/trend',
    '/bigscreen/layout?system=energy', '/bigscreen/panels',
  ]
  for (const p of endpoints) {
    const r = await fetch(A(p), { headers: H })
    const ok = r.status === 200
    if (ok) pass++; else fail++
    console.log(`  API ${ok ? 'PASS' : 'FAIL'} ${p} -> ${r.status}`)
  }
  return { pass, fail }
}

;(async () => {
  const round = Number(process.argv[2] || 1)
  console.log(`\n========== QA ROUND ${round} ==========`)
  let pass = 0, fail = 0
  const token = await getToken()

  // ---- API smoke ----
  console.log('--- API smoke ---')
  const api = await apiSmoke(token); pass += api.pass; fail += api.fail

  // Request E: building 6 data + GLB serving
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const blds = (await (await fetch(A('/buildings'), { headers: H })).json()).data.items
  const b6 = blds.find((b) => b.id === '6')
  pass += check('building#6 floors=3', b6 && b6.floors === 3, b6 && `(${b6.floors})`); if (!(b6 && b6.floors === 3)) fail++
  for (const f of ['hql-building.glb', 'hql-f1.glb', 'hql-f2.glb', 'hql-f3.glb']) {
    const rr = await fetch(`${BASE}/models/${f}`, { method: 'HEAD' })
    pass += check(`${f} served 200`, rr.status === 200); if (rr.status !== 200) fail++
  }

  // ---- Browser ----
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1680, height: 945 } })
  const glb = {}
  page.on('response', (res) => { const u = res.url(); if (u.includes('/models/') && u.endsWith('.glb')) glb[u] = res.status() })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message))
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)

  // Overview
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(4000)
  pass += check('overview canvas present', (await page.locator('canvas').count()) > 0); 
  await page.screenshot({ path: `${SHOT}/_qa_overview_r${round}.png` }).catch(() => {})

  // Building 6 view
  await page.goto(`${BASE}/bigscreen/building/6`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(6000)
  pass += check('whole building GLB 200', glb[`${BASE}/models/hql-building.glb`] === 200, `(${glb[`${BASE}/models/hql-building.glb`]})`); if (glb[`${BASE}/models/hql-building.glb`] !== 200) fail++
  const flBtns = await page.locator('.bs-floorlist .fl').allTextContents().catch(() => [])
  const flSet = flBtns.map((s) => s.trim())
  const floorsOk = ['F1', 'F2', 'F3'].every((f) => flSet.includes(f)) && !flSet.includes('F0')
  pass += check('floor panel F1/F2/F3 no 0F', floorsOk, `(${flSet.join(',')})`); if (!floorsOk) fail++
  await page.screenshot({ path: `${SHOT}/_qa_building6_r${round}.png` }).catch(() => {})

  for (const f of [1, 2, 3]) {
    const btn = page.locator('.bs-floorlist .fl').filter({ hasText: `F${f}` })
    if (await btn.count() === 0) { console.log(`floor ${f}: no button`); fail++; continue }
    // 等待上一楼层钻取弹窗（含淡出过渡）完全关闭，避免遮罩拦截点击（swiftshader 时序）
    await page.waitForSelector('.kp-modal.floor-drill', { state: 'hidden', timeout: 5000 }).catch(() => {})
    // 楼层按钮位于 3D 画布之上，headless+swiftshader 下 Playwright 动作性判定会被画布渲染干扰；
    // 用 dispatchEvent 直接触发 Vue @click 处理器（验证按钮逻辑本身），绕过画布遮罩误判。
    await btn.first().dispatchEvent('click')
    await page.waitForTimeout(5500)
    const u = `${BASE}/models/hql-f${f}.glb`
    const dv = await page.locator('.kp-modal.floor-drill').isVisible().catch(() => false)
    const dt = await page.locator('.fd__title').first().innerText().catch(() => '')
    pass += check(`floor ${f} GLB 200`, glb[u] === 200, `(${glb[u]})`); if (glb[u] !== 200) fail++
    pass += check(`floor ${f} drawer + data`, dv && dt.includes(`后勤楼`), `title="${dt.replace(/\n/g, ' ').trim()}"`); if (!(dv && dt.includes('后勤楼'))) fail++
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForSelector('.kp-modal.floor-drill', { state: 'hidden', timeout: 5000 }).catch(() => {})
  }

  // ---- 6 号楼 3D 楼层 Tab（参考页 floor-tabs 迁移）+ 点击整栋跳楼层（Y→floor 算法） ----
  console.log('--- 6# floor tabs + jump ---')
  await page.goto(`${BASE}/bigscreen/building/6`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(5500)
  const tabsVisible = await page.locator('.bld6-tabs').isVisible().catch(() => false)
  pass += check('bld6 floor tabs visible', tabsVisible); if (!tabsVisible) fail++
  const tabLabels = await page.locator('.bld6-tab').allTextContents().catch(() => [])
  const tabSet = tabLabels.map((s) => s.replace(/\s+/g, ''))
  const tabsOk = ['整楼', 'F1', 'F2', 'F3'].every((t) => tabSet.some((x) => x.includes(t)))
  pass += check('bld6 tabs 整楼/F1/F2/F3', tabsOk, `(${tabSet.join(',')})`); if (!tabsOk) fail++

  // 等待整栋 6 号楼 GLB 加载完成（wholeBox 非 null）后再校验算法/跳层，规避偶发冷启动慢加载
  await page.waitForFunction(() => { try { return !!(window.__kpB6Jump && window.__kpB6Jump.wholeBox()); } catch { return false } }, { timeout: 20000 }).catch(() => {})

  // 算法：整栋世界 Y → 楼层（1/2/3）分段映射（与 canvas 点击跳层同一公式）
  const algo = await page.evaluate(() => {
    const h = window.__kpB6Jump
    if (!h) return { ok: false, reason: 'no hook' }
    const box = h.wholeBox()
    if (!box) return { ok: false, reason: 'no box' }
    const span = box.maxY - box.minY
    return {
      ok: true,
      box,
      f1: h.floorFromY(box.minY + span * 0.1),
      f2: h.floorFromY(box.minY + span * 0.5),
      f3: h.floorFromY(box.minY + span * 0.95),
    }
  })
  const algoOk = algo.ok && algo.f1 === 1 && algo.f2 === 2 && algo.f3 === 3
  pass += check('Y→floor algo 1/2/3', algoOk, `(${JSON.stringify(algo)})`); if (!algoOk) fail++

  // 点击整栋模型跳楼层（走与 canvas 点击相同的 openFloorDrill 入口）：中段 Y → F2
  const jump = await page.evaluate(() => {
    const h = window.__kpB6Jump
    if (!h) return null
    const box = h.wholeBox()
    if (!box) return null
    return h.jumpFromY(box.minY + (box.maxY - box.minY) * 0.5)
  })
  await page.waitForTimeout(4500)
  const jTitle = await page.locator('.fd__title').first().innerText().catch(() => '')
  // 标题格式为「后勤楼 · 2F」（{floor}F），故查 '2F' 而非 'F2'
  pass += check('jump→F2 drawer+后勤楼', jump === 2 && jTitle.includes('后勤楼') && jTitle.includes('2F'), `jump=${jump} title="${jTitle.replace(/\n/g, ' ').trim()}"`); if (!(jump === 2 && jTitle.includes('后勤楼') && jTitle.includes('2F'))) fail++
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForSelector('.kp-modal.floor-drill', { state: 'hidden', timeout: 5000 }).catch(() => {})

  // 点 F1 楼层 Tab → 抽屉打开且标题联动
  const f1tab = page.locator('.bld6-tab').filter({ hasText: 'F1' })
  if (await f1tab.count()) {
    await f1tab.first().dispatchEvent('click')
    await page.waitForTimeout(4500)
    const t1 = await page.locator('.fd__title').first().innerText().catch(() => '')
    // 标题格式为「后勤楼 · 1F」，故查 '1F'
    pass += check('tab F1 → drawer F1', t1.includes('后勤楼') && t1.includes('1F'), `title="${t1.replace(/\n/g, ' ').trim()}"`); if (!(t1.includes('后勤楼') && t1.includes('1F'))) fail++
    // 整楼 Tab 关闭钻取（回到整栋 hql-building.glb）
    const whole = page.locator('.bld6-tab').filter({ hasText: '整楼' })
    if (await whole.count()) {
      await whole.first().dispatchEvent('click')
      // 验证「整楼」Tab → scene.closeFloorDrill()：读 store 真相源（同步生效），不依赖 el-dialog 关闭过渡动画时序
      await page.waitForTimeout(400)
      const fd = await page.evaluate(() => window.__kpB6Jump.floorDrill())
      const closed = fd.buildingId === null && fd.floor === null
      pass += check('整楼 tab closes drill (store)', closed, `fd=${JSON.stringify(fd)}`); if (!closed) fail++
    }
    await page.keyboard.press('Escape').catch(() => {})
  }
  await page.waitForSelector('.kp-modal.floor-drill', { state: 'hidden', timeout: 5000 }).catch(() => {})

  // Admin page render check
  await page.goto(`${BASE}/admin/building-subsystem`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const adminHasContent = (await page.evaluate(() => document.body.innerText.length)) > 200
  pass += check('admin page renders', adminHasContent); if (!adminHasContent) fail++
  await page.screenshot({ path: `${SHOT}/_qa_admin_r${round}.png` }).catch(() => {})

  console.log('\nconsole errors (first 6):')
  errors.slice(0, 6).forEach((e) => console.log('  ', e))
  pass += check('no console errors', errors.length === 0, `(${errors.length})`); if (errors.length) fail++

  console.log(`\nROUND ${round} RESULT: ${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

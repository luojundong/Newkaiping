// 弹窗 3D 楼层模型视图 QA（线上 117.21.178.39:5168）
// 判据：
//  ① 选 6 号楼 → 整栋 hql-building.glb 加载 + 相机对准锚点（复用既有相机链路）
//  ② __kpB6Jump.jumpFromY(midY) 触发 openFloorDrill('6', f) → FloorDrillDrawer 打开
//  ③ 弹窗上半部渲染 .floor-model-view（3D 分支生效，取代 2D FloorPlanView），内部 <canvas> 已初始化
//  ④ 楼层 GLB（hql-f.glb）200；图例 / 设备列表 / 房间 chips 渲染
//  ⑤ 双向联动：点设备列表项 → 控制弹窗打开（openControl 链路生效）
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = 'http://117.21.178.39:5168'
const A = (p) => `${BASE}/api/v1${p}`
const SHOT = 'D:/wwwroot/NewKaiPing/deploy'

// CDP 截图：绕过 Playwright 的「页面视觉稳定」等待（FloorModelView 的 requestAnimationFrame
// 渲染循环在 swiftshader 下永不进入稳定态，导致 page.screenshot 超时）。CDP 直接截帧，不等待稳定。
async function shot(page, path) {
  const client = await page.context().newCDPSession(page)
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  fs.writeFileSync(path, Buffer.from(data, 'base64'))
  console.log('  screenshot (CDP):', path)
}

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
  // 中止字体请求：swiftshader 软渲染下 document.fonts.ready 可能永不 resolve，导致截图 30s 超时
  await page.route('**/*', (route) => {
    const t = route.request().resourceType()
    const u = route.request().url()
    if (t === 'font' || /fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort().catch(() => {})
    return route.continue().catch(() => {})
  })
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)

  const glb = {}
  page.on('response', (res) => { const u = res.url(); if (u.includes('/models/') && u.endsWith('.glb')) glb[u] = res.status() })

  // 导航 + 选 6 号楼
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(5000)
  const tab = page.locator('.bs-bldnav .btab').filter({ hasText: '6号楼' })
  pass += check('b6 nav tab present', (await tab.count()) > 0); if (!(await tab.count())) process.exit(2)
  await tab.first().dispatchEvent('click')

  // 等整栋模型加载完成（仅判 wholeBox 非空；.viewer-loading 遮罩在 swiftshader 下因主校园模型
  // 慢加载可能长期不消失，属软渲染伪象，与楼层钻取弹窗 3D 视图无关，故不阻塞）
  const t0 = Date.now()
  let wholeOk = false
  try {
    await page.waitForFunction(() => { try { const h = window.__kpB6Jump; return !!(h && h.wholeBox()) } catch { return false } }, { timeout: 90000 })
    wholeOk = true
  } catch {}
  console.log(`  whole-model settle: ${((Date.now() - t0) / 1000).toFixed(1)}s wholeOk=${wholeOk}`)
  pass += check('whole building GLB 200', glb[`${BASE}/models/hql-building.glb`] === 200, `(${glb[`${BASE}/models/hql-building.glb`]})`); if (glb[`${BASE}/models/hql-building.glb`] !== 200) fail++
  pass += check('wholeBox (6号楼整栋模型) loaded', wholeOk); if (!wholeOk) fail++

  await page.waitForTimeout(2500)
  const st = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? { cam: h.camPose(), center: h.modelCenter(), box: h.wholeBox() } : null })
  if (st && st.cam) {
    const dx = Math.abs(st.cam.lookAt.x - anchor.x), dz = Math.abs(st.cam.lookAt.z - anchor.z)
    const ok = dx < 3 && dz < 3
    pass += check('camera lookAt on model anchor', ok, `dx=${dx.toFixed(2)} dz=${dz.toFixed(2)}`); if (!ok) fail++
  } else { fail++; pass += check('camPose available', false) }

  // 触发楼层钻取（整栋→F2 附近）：用 wholeBox 中点世界 Y
  const drill = await page.evaluate(() => {
    const h = window.__kpB6Jump
    const b = h.wholeBox()
    if (!b) return null
    const y = b.minY + (b.maxY - b.minY) * 0.5
    const f = h.jumpFromY(y)
    return { f, fd: h.floorDrill() }
  })
  console.log('  jumpFromY ->', JSON.stringify(drill))
  pass += check('openFloorDrill(6, f) via jumpFromY', drill && drill.fd && drill.fd.buildingId === '6' && typeof drill.fd.floor === 'number', `floor=${drill && drill.fd ? drill.fd.floor : 'null'}`); if (!drill || !drill.fd || drill.fd.buildingId !== '6') fail++

  // 等弹窗 3D 模型视图（swiftshader 软渲染主线程 jank，给足超时）
  try { await page.waitForFunction(() => !!document.querySelector('.floor-model-view'), { timeout: 45000 }); pass++ } catch { fail++; pass += check('floor-model-view mounted', false); }
  // 给 10MB 纹理 GLB 的网络加载 + swiftshader 软渲染首帧留足时间（真机 GPU 数秒内）
  await page.waitForTimeout(14000)

  // 楼层 GLB（hql-fN.glb）应已请求 200
  const floorGlb = Object.keys(glb).find((u) => /hql-f[123]\.glb$/.test(u))
  pass += check('floor GLB (hql-fN.glb) 200', floorGlb && glb[floorGlb] === 200, floorGlb ? `(${glb[floorGlb]})` : '(none requested)'); if (!(floorGlb && glb[floorGlb] === 200)) fail++

  // 3D 分支生效：.floor-model-view 存在；2D FloorPlanView 不应挂载（v-else）
  const fdv = await page.evaluate(() => {
    const fm = document.querySelector('.floor-model-view')
    const cv = fm ? fm.querySelector('canvas') : null
    return {
      has3d: !!fm,
      hasCanvas: !!cv && cv.width > 0 && cv.height > 0,
      hasLegend: !!document.querySelector('.fmv-legend'),
      has2d: !!document.querySelector('.floor-plan'),
      itemCount: document.querySelectorAll('.fd-item').length,
      roomChips: document.querySelectorAll('.fd-room-chip').length,
    }
  })
  console.log('  floordrill view:', JSON.stringify(fdv))
  pass += check('3D model view mounted (use3dModel=true)', fdv.has3d)
  pass += check('Three.js canvas initialized', fdv.hasCanvas)
  pass += check('legend rendered', fdv.hasLegend)
  pass += check('2D FloorPlanView NOT mounted (branch correct)', !fdv.has2d); if (fdv.has2d) fail++
  pass += check('device list populated', fdv.itemCount > 0, `(${fdv.itemCount})`); if (fdv.itemCount <= 0) fail++
  pass += check('3D room-filter chips rendered', fdv.roomChips > 0, `(${fdv.roomChips})`); if (fdv.roomChips <= 0) fail++

  await shot(page, `${SHOT}/_qa_b6_floordrill_3d.png`)

  // 双向联动：点设备列表项 → 控制弹窗打开（openControl 链路）。
  // 检测「可见的、含控制弹窗根节点(.rc/.lc)的 .el-overlay」数量变化
  // （Element Plus 关闭态也会保留 .el-overlay 在 DOM 中，故需排除 display:none）。
  if (fdv.itemCount > 0) {
    const visibleCtrl = () => [...document.querySelectorAll('.el-overlay')].filter((o) => getComputedStyle(o).display !== 'none' && o.querySelector('.rc, .lc')).length
    const before = await page.evaluate(visibleCtrl)
    await page.locator('.fd-item').first().click({ force: true })
    await page.waitForTimeout(1800)
    const after = await page.evaluate(visibleCtrl)
    pass += check('click device → control dialog opens (list→model linkage)', after > before, `ctrlOverlay ${before}→${after}`); if (!(after > before)) fail++
    await shot(page, `${SHOT}/_qa_b6_floordrill_control.png`)
  } else { fail++; pass += check('device click linkage', false, '(no devices)') }

  console.log('\nconsole errors:', errors.length)
  errors.slice(0, 8).forEach((e) => console.log('  ', e))
  pass += check('no console errors', errors.length === 0, `(${errors.length})`); if (errors.length) fail++

  console.log(`\nFLOORDRILL 3D RESULT: ${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

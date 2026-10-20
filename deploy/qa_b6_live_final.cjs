// 最终实时验证（线上 117.21.178.39:5168）：选 6 号楼后，等「模型加载遮罩完全消失 + 整栋模型落位」再截图。
// 判据：① /models/hql-building.glb 200；② __kpB6Jump.wholeBox() 非空；③ .viewer-loading 遮罩从 DOM 移除；
//       ④ camPose.lookAt.x/z ≈ runtime 锚点 x/z；⑤ 最终截图目视模型居中可见。
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
  await page.addInitScript((t) => { localStorage.setItem('kp-auth-token', t) }, token)

  const glb = {}
  page.on('response', (res) => { const u = res.url(); if (u.includes('/models/') && u.endsWith('.glb')) glb[u] = res.status() })

  // 导航点击流（真实用户流）：overview → 点「6号楼」
  await page.goto(`${BASE}/bigscreen/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(6000)
  const tab = page.locator('.bs-bldnav .btab').filter({ hasText: '6号楼' })
  pass += check('b6 nav tab present', (await tab.count()) > 0); if (!(await tab.count())) process.exit(2)
  await tab.first().dispatchEvent('click')

  // 等整栋模型加载完成：wholeBox 非空 且 加载遮罩从 DOM 移除（上限 90s，软渲染慢）
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
  console.log(`  model settle wait: ${((Date.now() - t0) / 1000).toFixed(1)}s loaded=${loaded}`)
  pass += check('whole building GLB 200', glb[`${BASE}/models/hql-building.glb`] === 200, `(${glb[`${BASE}/models/hql-building.glb`]})`); if (glb[`${BASE}/models/hql-building.glb`] !== 200) fail++
  pass += check('wholeBox loaded + loading overlay gone', loaded); if (!loaded) fail++

  await page.waitForTimeout(3000) // 相机 tween(800ms)+渲染落定余量
  const st = await page.evaluate(() => { const h = window.__kpB6Jump; return h ? { cam: h.camPose(), center: h.modelCenter(), box: h.wholeBox() } : null })
  console.log('  state:', JSON.stringify(st))
  if (st && st.cam) {
    const dx = Math.abs(st.cam.lookAt.x - anchor.x)
    const dz = Math.abs(st.cam.lookAt.z - anchor.z)
    const ok = dx < 3 && dz < 3
    pass += check('camera lookAt on model anchor', ok, `dx=${dx.toFixed(2)} dz=${dz.toFixed(2)}`); if (!ok) fail++
  } else { fail++; pass += check('camPose available', false) }
  pass += check('model world y-center sane (0~40)', st && st.center && st.center.y !== null && st.center.y > 0 && st.center.y < 40, `y=${st && st.center ? st.center.y : 'null'}`)

  await page.screenshot({ path: `${SHOT}/_qa_b6_live_final.png` })
  console.log('  screenshot: _qa_b6_live_final.png')

  console.log('\nconsole errors:', errors.length)
  errors.slice(0, 5).forEach((e) => console.log('  ', e))
  pass += check('no console errors', errors.length === 0, `(${errors.length})`); if (errors.length) fail++

  console.log(`\nB6 LIVE FINAL RESULT: ${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('ERR', e); process.exit(2) })

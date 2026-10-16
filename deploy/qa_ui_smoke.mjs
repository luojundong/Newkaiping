// UI 冒烟 QA（健壮版）：加载 7 屏大屏，逐屏切换，捕获控制台/页面/请求错误并实时打印，截图。
// 运行：复制到 workspace 后 `node qa_ui_smoke.mjs`（playwright 在 workspace/node_modules；系统 Chrome 通过 executablePath）。
import { chromium } from 'playwright'
import fs from 'fs'

const URL = 'http://117.21.178.39:5168/bigscreen/overview'
const SHOTS = 'C:/Users/Admin/.workbuddy/qa-shots'
const TABS = ['图1主驾驶舱','图2空调与能源','图3电梯安全','图4供配电计量','图5告警工单','图6空间设备运维','图7建筑面积表']
// 各屏应有的大标题（来自 bigscreen-screens.ts SCREENS[].title），用于断言切屏成功且文案正确
const EXPECT_TITLE = ['开平市中心医院数字孪生驾驶舱','空调与能源管控驾驶舱','电梯安全运行驾驶舱','供配电与计量驾驶舱','告警工单驾驶舱','空间设备运维驾驶舱','权威建筑面积表']

fs.mkdirSync(SHOTS, { recursive: true })
const consoleErrors = [], pageErrors = [], failedReq = []
function log(...a) { console.log(...a) }

let browser
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); log('  CE:', m.text().slice(0, 160)) } })
  page.on('pageerror', (e) => { pageErrors.push(String(e.message || e)); log('  PE:', String(e.message || e).slice(0, 160)) })
  page.on('requestfailed', (r) => { const s = `${r.url()} :: ${r.failure()?.errorText}`; failedReq.push(s); log('  FR:', s.slice(0, 160)) })
  page.on('response', (r) => { const s = r.status(); if (s >= 400) { const t = `${r.url()} :: HTTP ${s}`; failedReq.push(t); log('  FR:', t.slice(0, 160)) } })

  log('NAV ->', URL)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { consoleErrors.push('goto: ' + e.message); log('goto err', e.message) })
  await page.waitForSelector('.ntab', { timeout: 20000 }).catch(() => log('wait .ntab timeout'))
  await page.waitForTimeout(2000)

  let allOk = true
  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i]
    // 用序号定位（tab 文案含空格，:has-text 不可靠）
    await page.locator('.ntab').nth(i).click({ timeout: 8000 }).catch((e) => log(`click tab${i + 1} err`, e.message))
    await page.waitForTimeout(1200)
    const txt = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ')
    const susp = /NaN|undefined|\[object Object\]|Error:|Cannot read/.test(txt)
    const titleOk = txt.includes(EXPECT_TITLE[i])
    await page.screenshot({ path: `${SHOTS}/screen${i + 1}.png` }).catch(() => {})
    log(`SCREEN ${i + 1} ${tab} | len=${txt.length} suspicious=${susp} titleMatch=${titleOk}`)
    if (susp || !titleOk) allOk = false
  }

  // 屏1 数据模式徽章切换（安全交互）
  await page.locator(`.ntab:has-text("${TABS[0]}")`).first().click().catch(() => {})
  await page.waitForTimeout(800)
  const b1 = await page.locator('.databadge').first().textContent().catch(() => '')
  await page.locator('.databadge').first().click({ timeout: 5000 }).catch((e) => log('databadge err', e.message))
  await page.waitForTimeout(600)
  const b2 = await page.locator('.databadge').first().textContent().catch(() => '')
  log('DATABADGE:', JSON.stringify(b1), '->', JSON.stringify(b2))
  await page.screenshot({ path: `${SHOTS}/screen1-mode.png` }).catch(() => {})

  log('\n===== UI QA 汇总 =====')
  log('控制台错误:', consoleErrors.length, '| 页面异常:', pageErrors.length, '| 失败请求:', failedReq.length)
  const fail = consoleErrors.length > 0 || pageErrors.length > 0 || failedReq.length > 0 || !allOk
  log(fail ? 'UI_QA: FAIL' : 'UI_QA: PASS')
  process.exitCode = fail ? 1 : 0
} catch (e) {
  log('FATAL', e && e.message)
  process.exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
}

// format 纯函数单测：esbuild 即时转译真实 TS 模块后断言
// 运行： cd frontend && node src/lib/__tests__/format.spec.mjs
import { readFileSync } from 'node:fs'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcPath = join(__dirname, '..', 'format.ts')
const src = readFileSync(srcPath, 'utf8')
const { code } = await transform(src, { loader: 'ts', format: 'esm', target: 'es2020' })
const dir = mkdtempSync(join(tmpdir(), 'kp-fmt-'))
const tmpFile = join(dir, 'format.mjs')
writeFileSync(tmpFile, code)
const {
  formatInt, formatFixed, formatPercent, formatDelta, formatWan, formatEnergyKwh, formatBytes,
} = await import(pathToFileURL(tmpFile).href)

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS | ${name}${detail ? ' | ' + detail : ''}`) }
  else { fail++; console.log(`FAIL | ${name}${detail ? ' | ' + detail : ''}`) }
}

check('formatInt-thousands', formatInt(1234567) === '1,234,567', formatInt(1234567))
check('formatInt-round', formatInt(1234.6) === '1,235', formatInt(1234.6))
check('formatInt-nan', formatInt(NaN) === '-', formatInt(NaN))

check('formatFixed-2', formatFixed(3.14159) === '3.14', formatFixed(3.14159))
check('formatFixed-nan', formatFixed(NaN) === '-', formatFixed(NaN))

check('formatPercent-basic', formatPercent(0.1234) === '12.3%', formatPercent(0.1234))
check('formatPercent-whole', formatPercent(1) === '100.0%', formatPercent(1))

check('formatDelta-plus', formatDelta(2.5) === '+2.5', formatDelta(2.5))
check('formatDelta-minus', formatDelta(-1.2) === '-1.2', formatDelta(-1.2))

check('formatWan-wan', formatWan(12345) === '1.2万', formatWan(12345))
check('formatWan-yi', formatWan(340000000) === '3.4亿', formatWan(340000000))
check('formatWan-small', formatWan(999) === '999', formatWan(999))
check('formatWan-nan', formatWan(NaN) === '-', formatWan(NaN))

check('formatEnergyKwh-kwh', formatEnergyKwh(450) === '450.0 kWh', formatEnergyKwh(450))
check('formatEnergyKwh-mwh', formatEnergyKwh(3400) === '3.4 MWh', formatEnergyKwh(3400))

check('formatBytes-kb', formatBytes(2048) === '2.0 KB', formatBytes(2048))
check('formatBytes-mb', formatBytes(1048576) === '1.0 MB', formatBytes(1048576))

console.log(`\nformat unit test: ${pass} passed, ${fail} failed`)
process.exitCode = fail === 0 ? 0 : 1

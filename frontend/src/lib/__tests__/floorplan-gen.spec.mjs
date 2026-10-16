// floorplan-gen 纯函数单测（无需 vitest：用 esbuild 即时转译真实 TS 模块后断言）
// 运行： cd frontend && node src/lib/__tests__/floorplan-gen.spec.mjs
import { readFileSync } from 'node:fs'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcPath = join(__dirname, '..', 'floorplan-gen.ts')
const src = readFileSync(srcPath, 'utf8')
const { code } = await transform(src, { loader: 'ts', format: 'esm', target: 'es2020' })
const dir = mkdtempSync(join(tmpdir(), 'kp-fp-'))
const tmpFile = join(dir, 'floorplan-gen.mjs')
writeFileSync(tmpFile, code)
const { generateFloorPlan, sceneToSvg } = await import(pathToFileURL(tmpFile).href)

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`PASS | ${name}${detail ? ' | ' + detail : ''}`)
  } else {
    fail++
    console.log(`FAIL | ${name}${detail ? ' | ' + detail : ''}`)
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---------- 构造测试数据 ----------
function mkDev(id, x, z, room = null, type = 'hvac') {
  return { id, name: 'dev-' + id, type, room, x, z }
}

// 1) 确定性：同一输入两次输出完全相等
{
  const input = [
    mkDev('a', 0, 0), mkDev('b', 95, 0), mkDev('c', 0, 95),
    mkDev('d', 10, 5), mkDev('e', 90, 8), mkDev('f', 5, 90),
  ]
  const p1 = generateFloorPlan('1', 6, input)
  const p2 = generateFloorPlan('1', 6, input)
  check('determinism-same-output', eq(p1, p2), '两次生成 JSON 全等')
  check('determinism-room-count', p1.rooms.length === 3, `rooms=${p1.rooms.length}`)
}

// 2) 聚类正确：3 簇互不相邻点位 → 生成 3 个房间
{
  const input = [
    mkDev('a1', 0, 0), mkDev('a2', 5, 5), mkDev('a3', 2, 8),     // 簇1 左下
    mkDev('b1', 100, 0), mkDev('b2', 105, 5), mkDev('b3', 98, 9), // 簇2 右下
    mkDev('c1', 0, 100), mkDev('c2', 6, 105), mkDev('c3', 3, 98), // 簇3 左上
  ]
  const p = generateFloorPlan('1', 3, input)
  check('clustering-3-rooms', p.rooms.length === 3, `rooms=${p.rooms.length}`)
  check('clustering-room-source-clustered', p.roomSource === 'clustered', `source=${p.roomSource}`)
  check('clustering-device-total', p.points.length === 9, `points=${p.points.length}`)
  // 每个房间设备数之和 = 总设备数
  const sum = p.rooms.reduce((s, r) => s + r.deviceCount, 0)
  check('clustering-count-sum', sum === 9, `sum=${sum}`)
}

// 3) 真实房间字段优先：room 字段 → 真实房间名，roomSource=real
{
  const input = [
    mkDev('x1', 0, 0, '601'), mkDev('x2', 5, 5, '601'),
    mkDev('y1', 100, 0, '602'), mkDev('y2', 105, 5, '602'),
  ]
  const p = generateFloorPlan('2', 6, input)
  const names = p.rooms.map((r) => r.name).sort()
  check('real-room-names', eq(names, ['601', '602']), JSON.stringify(names))
  check('real-room-isReal', p.rooms.every((r) => r.isRealRoom === true), 'all isRealRoom=true')
  check('real-room-source', p.roomSource === 'real', `source=${p.roomSource}`)
}

// 4) 空输入不崩
{
  const p = generateFloorPlan('1', 6, [])
  check('empty-no-throw', p.empty === true && Array.isArray(p.rooms) && p.rooms.length === 0 && Array.isArray(p.points), JSON.stringify({ empty: p.empty, rooms: p.rooms.length }))
}

// 5) 坐标映射保持长宽比 + 画布内居中不越界
{
  // 构造已知包围盒：x∈[0,100], z∈[0,50] → 宽100 深50 (2:1)
  const input = [mkDev('a', 0, 0), mkDev('b', 100, 0), mkDev('c', 0, 50), mkDev('d', 100, 50)]
  const W = 600, H = 460, P = 16
  const p = generateFloorPlan('1', 6, input, { canvasWidth: W, canvasHeight: H, padding: P })
  const t = p.transform
  // 统一缩放（x、z 同 scale）
  check('aspect-uniform-scale', Number.isFinite(t.scale) && t.scale > 0, `scale=${t.scale}`)
  // 角点映射后 svg 尺寸比例 == 场景比例
  const c0 = sceneToSvg(t, 0, 0)
  const c1 = sceneToSvg(t, 100, 50)
  const svgW = c1.x - c0.x
  const svgH = c1.y - c0.y
  const ratioScene = 100 / 50
  const ratioSvg = svgW / svgH
  check('aspect-ratio-preserved', Math.abs(ratioSvg - ratioScene) < 1e-6, `scene=${ratioScene} svg=${ratioSvg.toFixed(4)}`)
  // 居中不越界：footprint 在 padding 内
  check('aspect-within-canvas', c0.x >= P - 1e-6 && c1.x <= W - P + 1e-6 && c0.y >= P - 1e-6 && c1.y <= H - P + 1e-6,
    `c0=(${c0.x.toFixed(1)},${c0.y.toFixed(1)}) c1=(${c1.x.toFixed(1)},${c1.y.toFixed(1)}) canvas=${W}x${H} P=${P}`)
  // 房间矩形互不重叠（网格平铺保证）
  let overlap = false
  const rs = p.rooms
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j]
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0.01 && oy > 0.01) overlap = true
    }
  check('rooms-non-overlapping', !overlap, `rooms=${rs.length}`)
}

console.log(`\nfloorplan-gen unit test: ${pass} passed, ${fail} failed`)
process.exitCode = fail === 0 ? 0 : 1

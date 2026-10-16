// 楼层平面图生成器（纯函数，可单测，零副作用，确定性）
//
// 背景：产品需求「点楼层出现楼层的布局平面图；再点平面图当中的名称弹出对应数据」。
// 真实 CAD/SVG 平面图建模方尚未交付，故先由程序依据【该层设备点位】自动生成「示意图」，
// 后续可无缝替换成真实 CAD/SVG（本模块只产出与具体渲染无关的数据模型 FloorPlan）。
//
// 设计要点：
//   1. 房间来源：优先使用设备数据里的真实房间字段（Device.location.room，后端真实数据已存在），
//      没有房间字段的设备再按「坐标空间网格聚类」生成示意房间名（如「示意区-01」）。
//   2. 确定性：纯函数、无随机、无时钟、无 Map 遍历顺序依赖（分组后按 key 排序），
//      同样输入永远得到完全一致的 SVG 布局（否则每次打开平面图都在变）。
//   3. 坐标系：Three 场景坐标 (x, z)（单位米）→ SVG 2D 坐标映射（保留长宽比、加 padding、
//      可配置画布尺寸）。设备点位在房间内按「房间自身包围盒」局部投影到房间格，保证不重叠、
//      可点击、视觉紧凑；整体楼层轮廓（footprint）按其真实长宽比居中铺满内容区。
//   4. 房间矩形不重叠：所有房间按固定网格平铺在 footprint 内（row-major），点击无歧义。

export interface FloorPlanDeviceInput {
  /** 设备 id（用于点击下钻到控制弹窗） */
  id: string
  /** 设备名称 */
  name: string
  /** 设备类型（子系统 code：hvac/lighting/power…，驱动着色与路由） */
  type: string
  /** 设备类目 id（category_id），可选，用于更细粒度识别 */
  category?: string
  /** 真实房间名（Device.location.room）；无则留空/null 走聚类 */
  room?: string | null
  /** Three 场景坐标 x（米） */
  x: number
  /** Three 场景坐标 z（米） */
  z: number
}

export interface FloorPlanRoomBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FloorPlanRoom {
  /** 稳定 key（真实房间 = `R::<room>`，聚类 = `G::<cell>`） */
  key: string
  /** 展示名：真实房间用真实名，聚类用示意名 */
  name: string
  /** 是否来自真实房间字段（决定后续是否要返工：true=无需返工） */
  isRealRoom: boolean
  /** 房间内设备数 */
  deviceCount: number
  /** 房间内出现的设备类型（去重） */
  types: string[]
  /** SVG 矩形（px，相对画布左上角） */
  x: number
  y: number
  w: number
  h: number
  /** 该房间设备点位的场景坐标包围盒（米），仅供参考 */
  bounds: FloorPlanRoomBounds
}

export interface FloorPlanPoint {
  id: string
  name: string
  type: string
  category?: string
  /** 所属房间 key */
  roomKey: string
  /** 场景坐标（米） */
  sx: number
  sz: number
  /** SVG 坐标（px） */
  x: number
  y: number
}

export interface FloorPlanCoordTransform {
  /** 统一缩放比例（px / 米），x 与 z 轴相同 → 保持长宽比 */
  scale: number
  /** 场景 (0,0) 对应的 SVG 原点 x（px） */
  offsetX: number
  /** 场景 (0,0) 对应的 SVG 原点 y（px） */
  offsetY: number
  padding: number
  canvasWidth: number
  canvasHeight: number
}

export type FloorPlanRoomSource = 'real' | 'clustered' | 'mixed' | 'empty'

export interface FloorPlan {
  buildingId: string
  floor: number
  /** 楼层轮廓宽（米，场景 x 跨度） */
  width: number
  /** 楼层轮廓深（米，场景 z 跨度） */
  depth: number
  canvasWidth: number
  canvasHeight: number
  rooms: FloorPlanRoom[]
  points: FloorPlanPoint[]
  transform: FloorPlanCoordTransform
  empty: boolean
  /** 房间来源：real=全真实房间 / clustered=全聚类 / mixed=混合 / empty=无设备 */
  roomSource: FloorPlanRoomSource
}

export interface FloorPlanOptions {
  canvasWidth?: number
  canvasHeight?: number
  /** 画布外边距（px） */
  padding?: number
  /** 房间格内边距（px），设备点位与房间名不贴边 */
  cellPadding?: number
  /** 无房间字段设备的聚类网格密度（每边格数，确定性） */
  clusterGrid?: number
}

const DEFAULTS = {
  canvasWidth: 600,
  canvasHeight: 460,
  padding: 16,
  cellPadding: 10,
  clusterGrid: 4,
}

/** 场景坐标 → SVG 坐标（保留长宽比的全局映射，公式为 transform 推导结果） */
export function sceneToSvg(t: FloorPlanCoordTransform, x: number, z: number): { x: number; y: number } {
  return {
    x: t.offsetX + x * t.scale,
    y: t.offsetY + z * t.scale,
  }
}

function isRealRoomStr(room?: string | null): string | null {
  if (room == null) return null
  const s = String(room).trim()
  return s.length ? s : null
}

/**
 * 生成楼层平面图数据模型。
 * @param buildingId 楼栋 id
 * @param floor 楼层号
 * @param devices 该层完整设备点位（不被 3D 抽稀影响，建议直接拉该层全量）
 * @param options 画布与聚类参数
 */
export function generateFloorPlan(
  buildingId: string,
  floor: number,
  devices: FloorPlanDeviceInput[],
  options: FloorPlanOptions = {},
): FloorPlan {
  const W = options.canvasWidth ?? DEFAULTS.canvasWidth
  const H = options.canvasHeight ?? DEFAULTS.canvasHeight
  const P = options.padding ?? DEFAULTS.padding
  const P2 = options.cellPadding ?? DEFAULTS.cellPadding
  const clusterGrid = Math.max(1, options.clusterGrid ?? DEFAULTS.clusterGrid)

  const base: FloorPlan = {
    buildingId,
    floor,
    width: 0,
    depth: 0,
    canvasWidth: W,
    canvasHeight: H,
    rooms: [],
    points: [],
    transform: { scale: 1, offsetX: P, offsetY: P, padding: P, canvasWidth: W, canvasHeight: H },
    empty: true,
    roomSource: 'empty',
  }

  if (!devices || devices.length === 0) return base

  // ---- 1. 楼层轮廓：该层设备点位的场景包围盒（米），加最小保护避免除零 ----
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const d of devices) {
    if (d.x < minX) minX = d.x
    if (d.x > maxX) maxX = d.x
    if (d.z < minZ) minZ = d.z
    if (d.z > maxZ) maxZ = d.z
  }
  let width = maxX - minX
  let depth = maxZ - minZ
  if (width < 1e-6) {
    width = 1
    minX -= 0.5
    maxX = minX + 1
  }
  if (depth < 1e-6) {
    depth = 1
    minZ -= 0.5
    maxZ = minZ + 1
  }

  // ---- 2. 分组：真实房间字段优先，无房间字段的按坐标网格聚类 ----
  interface Group {
    key: string
    name: string | null
    isReal: boolean
    items: FloorPlanDeviceInput[]
  }
  const groups = new Map<string, Group>()
  const cellOf = (x: number, z: number) => {
    const cx = Math.min(clusterGrid - 1, Math.max(0, Math.floor(((x - minX) / width) * clusterGrid)))
    const cz = Math.min(clusterGrid - 1, Math.max(0, Math.floor(((z - minZ) / depth) * clusterGrid)))
    return `${cx}-${cz}`
  }
  for (const d of devices) {
    const real = isRealRoomStr(d.room)
    if (real) {
      const key = `R::${real}`
      let g = groups.get(key)
      if (!g) {
        g = { key, name: real, isReal: true, items: [] }
        groups.set(key, g)
      }
      g.items.push(d)
    } else {
      const key = `G::${cellOf(d.x, d.z)}`
      let g = groups.get(key)
      if (!g) {
        g = { key, name: null, isReal: false, items: [] }
        groups.set(key, g)
      }
      g.items.push(d)
    }
  }

  const realCount = [...groups.values()].filter((g) => g.isReal).length
  const clusteredCount = groups.size - realCount
  const roomSource: FloorPlanRoomSource = clusteredCount === 0 ? 'real' : realCount === 0 ? 'clustered' : 'mixed'

  // 确定性排序：按 key 字典序，保证每次布局一致
  const sorted = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  // ---- 3. 楼层轮廓按真实长宽比居中铺满内容区（保留长宽比） ----
  const contentW = W - 2 * P
  const contentH = H - 2 * P
  const scale = Math.min(contentW / width, contentH / depth) // 统一缩放
  const fitW = width * scale
  const fitH = depth * scale
  const fitX = P + (contentW - fitW) / 2
  const fitY = P + (contentH - fitH) / 2

  // ---- 4. 房间网格平铺（不重叠）：行主序铺满 footprint ----
  const n = sorted.length
  const aspect = width / depth
  let cols = Math.max(1, Math.round(Math.sqrt(n * aspect)))
  let rows = Math.max(1, Math.ceil(n / cols))
  // 保证 cols*rows >= n（Math.ceil 已满足，这里兜底）
  while (cols * rows < n) cols++
  const cellW = fitW / cols
  const cellH = fitH / rows

  const rooms: FloorPlanRoom[] = []
  const points: FloorPlanPoint[] = []
  let order = 0
  for (const [, g] of sorted) {
    const c = order % cols
    const r = Math.floor(order / cols)
    order++
    const rx = fitX + c * cellW + P2
    const ry = fitY + r * cellH + P2
    const rw = Math.max(1, cellW - 2 * P2)
    const rh = Math.max(1, cellH - 2 * P2)

    // 房间内设备点位包围盒（场景坐标）
    let mbMinX = Infinity
    let mbMaxX = -Infinity
    let mbMinZ = Infinity
    let mbMaxZ = -Infinity
    const types = new Set<string>()
    for (const it of g.items) {
      if (it.x < mbMinX) mbMinX = it.x
      if (it.x > mbMaxX) mbMaxX = it.x
      if (it.z < mbMinZ) mbMinZ = it.z
      if (it.z > mbMaxZ) mbMaxZ = it.z
      if (it.type) types.add(it.type)
    }
    const bW = mbMaxX - mbMinX || 1
    const bH = mbMaxZ - mbMinZ || 1

    // 房间名：真实房间用真实名；聚类生成示意名（按平铺序号，确定性）
    const name = g.name ?? `示意区-${String(order).padStart(2, '0')}`

    for (const it of g.items) {
      // 房间内局部投影：设备相对「房间自身包围盒」的位置 → 映射到房间格内
      const lx = (it.x - mbMinX) / bW // 0..1
      const lz = (it.z - mbMinZ) / bH
      // 留一点内缩，避免点位压在房间边线上
      const inset = 0.12
      const px = rx + (inset + lx * (1 - 2 * inset)) * rw
      const pz = ry + (inset + lz * (1 - 2 * inset)) * rh
      points.push({
        id: it.id,
        name: it.name,
        type: it.type,
        category: it.category,
        roomKey: g.key,
        sx: it.x,
        sz: it.z,
        x: px,
        y: pz,
      })
    }

    rooms.push({
      key: g.key,
      name,
      isRealRoom: g.isReal,
      deviceCount: g.items.length,
      types: [...types],
      x: rx,
      y: ry,
      w: rw,
      h: rh,
      bounds: { minX: mbMinX, maxX: mbMaxX, minZ: mbMinZ, maxZ: mbMaxZ },
    })
  }

  return {
    buildingId,
    floor,
    width,
    depth,
    canvasWidth: W,
    canvasHeight: H,
    rooms,
    points,
    transform: { scale, offsetX: fitX, offsetY: fitY, padding: P, canvasWidth: W, canvasHeight: H },
    empty: false,
    roomSource,
  }
}

<script setup lang="ts">
// 楼栋显示 DIY - 3D 视图：在 .glb 模型上自由拖动楼栋 box 调整 X/Y/Z 锚点
// 同时支持「楼栋区域热点」：在模型表面描多边形区域，点击区域变色高亮 + 跳链接/内部跳转 + 回传参数。
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { Building, SceneMarker, FloorLabel } from '@/types/api'
import { useSceneStore } from '@/stores/scene'
import { KP_ACCENT, KP_SCENE_BG, KP_AREA_SELECTED, KP_AREA_HOVER, KP_DRAW_VERTEX, KP_FALLBACK_CYAN, KP_ACCENT_LABEL, KP_MDED_HEMI_SKY, KP_MDED_HEMI_GROUND, KP_MDED_GRID_A, KP_MDED_GRID_B, KP_MDED_INACTIVE, KP_MDED_BUILDING, KP_MDED_LINE_SEL, KP_MDED_LINE } from '@/lib/kp-accent'

const props = defineProps<{
  modelUrl?: string | null
  buildings: Building[]
  /** 当前选中的楼栋 id（双向） */
  selectedBuildingId?: string | null
  /** 草稿位置：building_id -> { x, y, z }（保存前可拖动预编） */
  draftAnchors: Record<string, { x: number; y: number; z: number }>
  /** 已保存锚点映射：building_id -> { x, y, z }（保存后回退用，避免回到初始坐标） */
  anchors?: Record<string, { x: number; y: number; z: number }>
  /** 单个楼栋在锚点位置上的水平占地尺寸（基底边长），由父组件按 gross_area/floors 估算 */
  boxSizeOf: (b: Building) => number
  /** 区域编辑模式：'drag' 拖动楼栋 / 'area' 描区域热点 */
  editMode?: 'drag' | 'area'
  /** 当前楼栋已有的区域热点（用于渲染 + 点击） */
  areaMarkers?: SceneMarker[]
  /** 父组件联动高亮的选中区域 id */
  selectedAreaId?: string | null
}>()
const emit = defineEmits<{
  (e: 'select', buildingId: string): void
  (e: 'drag', payload: { buildingId: string; position: { x: number; y: number; z: number } }): void
  (e: 'area', points: { x: number; y: number; z: number }[]): void
  (e: 'area-click', payload: {
    id: string
    label: string
    building_id: string
    floor: number
    link?: SceneMarker['link'] | null
    params?: Record<string, string>
    position: { x: number; y: number; z: number }
  }): void
}>()

const sceneStore = useSceneStore()
const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let raf = 0
let disposed = false
let ready = false

const modelGroup = new THREE.Group()
const buildingsGroup = new THREE.Group()
const buildingMeshes = new Map<string, THREE.Mesh>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// 区域热点渲染 + 绘制
const areaGroup = new THREE.Group()
const drawVertexGroup = new THREE.Group()
const drawPreviewGroup = new THREE.Group()
const drawVertices = ref<{ x: number; y: number; z: number }[]>([])
const selectedAreaId = ref<string | null>(null)
const hoveredAreaId = ref<string | null>(null)
const areaMeshes: THREE.Mesh[] = []
const areaStatus = ref('')

// 区域配色（与 ThreeViewer 统一：选中金色高亮）
const AREA_SELECTED_COLOR = KP_AREA_SELECTED
const AREA_HOVER_COLOR = KP_AREA_HOVER
const AREA_BASE_OPACITY = 0.3
const AREA_SELECTED_OPACITY = 0.5
const AREA_HOVER_OPACITY = 0.42
const DRAW_VERTEX_COLOR = KP_DRAW_VERTEX

// 拖拽状态
let dragging: { id: string; plane: THREE.Plane; offset: THREE.Vector3 } | null = null
let downX = 0
let downY = 0
let downTime = 0
let pointerDownFlag = false
const DRAG_THRESHOLD = 5 // px

// 拖拽平面：水平（X/Z）+ 垂直（Y，含楼栋当前 y）
const horizPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const vertPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)

// ---------- 初始化 ----------
function initThree() {
  if (!container.value || renderer) return
  const el = container.value
  const w = el.clientWidth || 960
  const h = el.clientHeight || 540
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(KP_SCENE_BG, 1)
  el.appendChild(renderer.domElement)
  renderer.domElement.style.cursor = 'grab'

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 5000)
  camera.position.set(220, 200, 220)
  camera.lookAt(0, 0, 0)

  // 光照
  const hemi = new THREE.HemisphereLight(KP_MDED_HEMI_SKY, KP_MDED_HEMI_GROUND, 0.85)
  scene.add(hemi)
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(150, 250, 100)
  scene.add(dir)
  // 地面网格（辅助参考，便于感知 X/Z 平面）
  const grid = new THREE.GridHelper(600, 30, KP_MDED_GRID_A, KP_MDED_GRID_B)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.4
  scene.add(grid)

  scene.add(modelGroup)
  scene.add(buildingsGroup)
  scene.add(areaGroup)
  scene.add(drawVertexGroup)
  scene.add(drawPreviewGroup)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0, 0)
  controls.minDistance = 30
  controls.maxDistance = 800

  // 拖拽 / 点击事件
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointerleave', onPointerUp)

  animate()
}

function animate() {
  if (disposed || !renderer) return
  raf = requestAnimationFrame(animate)
  controls?.update()
  renderer.render(scene!, camera!)
}

// ---------- .glb 模型加载 ----------
async function loadModel() {
  if (!scene) return
  const url = props.modelUrl || '/models/hospital.glb'
  try {
    loading.value = true
    error.value = null
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
    loader.setDRACOLoader(draco)
    loader.setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(url)
    while (modelGroup.children.length) modelGroup.remove(modelGroup.children[0])
    modelGroup.add(gltf.scene)
    // 居中 + 缩放（与 MarkerEditor3D / ThreeViewer 同样 230 适配，保证区域坐标空间一致）
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    gltf.scene.position.sub(center)
    const FIT = 230
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const scale = FIT / maxDim
    gltf.scene.scale.setScalar(scale)
    // 让 OrbitControls 聚焦模型中心
    controls?.target.set(0, 0, 0)
  } catch (e: any) {
    error.value = e?.message || '模型加载失败'
    console.error('[BuildingDisplay3D] loadModel:', e)
  } finally {
    loading.value = false
    ready = true
    buildAreaMeshes()
  }
}

// ---------- 楼栋 box 构建 ----------
function buildingSize(b: Building) {
  const side = Math.max(8, props.boxSizeOf(b))
  const floors = Math.max(1, b.floors || 1)
  const height = Math.max(10, floors * 4)
  return { w: side, d: side, h: height }
}
function colorForBuilding(b: Building, selected: boolean) {
  if (b.status === 'inactive') return KP_MDED_INACTIVE
  // 选中色统一为 JS 运行时强调色 KP_ACCENT（'#35c5ff'），消除历史残留 0x00e5ff
  return selected ? KP_ACCENT : KP_MDED_BUILDING
}
// ---------- 楼层标签（Phase 1：后台 3D 预览展示每层自定义标签） ----------
let floorLabelGroup: THREE.Group | null = null
function makeFloorLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 40
  ctx.font = `bold ${fontSize}px sans-serif`
  const w = Math.ceil(ctx.measureText(text).width) + 24
  const h = fontSize + 18
  canvas.width = w
  canvas.height = h
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 12, h / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  const s = 0.05
  sprite.scale.set(w * s, h * s, 1)
  return sprite
}
function clearFloorLabelGroup() {
  if (!floorLabelGroup) return
  floorLabelGroup.children.forEach((c) => {
    const m = (c as THREE.Sprite).material as THREE.SpriteMaterial
    m.map?.dispose()
    m.dispose()
  })
  floorLabelGroup.clear()
}

function buildBuildingMeshes() {
  clearFloorLabelGroup()
  if (!floorLabelGroup && scene) {
    floorLabelGroup = new THREE.Group()
    scene.add(floorLabelGroup)
  }
  while (buildingsGroup.children.length) buildingsGroup.remove(buildingsGroup.children[0])
  buildingMeshes.clear()
  if (!scene) return
  for (const b of props.buildings) {
    const a = getDraftOrAnchor(b)
    const { w, d, h } = buildingSize(b)
    const geom = new THREE.BoxGeometry(w, h, d)
    const selected = props.selectedBuildingId === b.id
    const mat = new THREE.MeshBasicMaterial({
      color: colorForBuilding(b, selected),
      transparent: true,
      opacity: b.status === 'inactive' ? 0.25 : selected ? 0.55 : 0.35,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(a.x, a.y + h / 2, a.z)
    mesh.userData = { type: 'building', id: b.id, h }
    buildingMeshes.set(b.id, mesh)
    buildingsGroup.add(mesh)
    // 边框（便于观察 box 范围）
    const edges = new THREE.EdgesGeometry(geom)
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: selected ? KP_MDED_LINE_SEL : KP_MDED_LINE, transparent: true, opacity: 0.7 }),
    )
    mesh.add(line)
    // 楼层标签（Phase 1）：后台预览展示每层自定义标签（楼体右侧按楼层高度分布）
    const floors = sceneStore.buildingDisplay.floors_by_building?.[b.id]
    if (floors && floorLabelGroup) {
      const grp = floorLabelGroup
      const unitY = h / Math.max(1, b.floors || 1)
      floors.forEach((fl: FloorLabel) => {
        if (fl.visible === false) return
        const fy = a.y + (fl.index - 0.5) * unitY
        const color = fl.color || KP_ACCENT_LABEL
        const sprite = makeFloorLabelSprite(`${fl.index}F ${fl.label}`, color)
        sprite.position.set(a.x + w / 2 + 2, fy, a.z)
        grp.add(sprite)
      })
    }
  }
}
function getDraftOrAnchor(b: Building) {
  const d = props.draftAnchors[b.id]
  if (d) return d
  // 优先用已保存锚点（保存后父组件会更新该 prop，避免回退到初始坐标）
  const a = props.anchors?.[b.id]
  if (a) return a
  // fallback：无可用锚点时给一个稳定默认 0（避免 NaN）
  return { x: 0, y: 0, z: 0 }
}

function updateSelectedHighlight() {
  for (const [id, mesh] of buildingMeshes) {
    const b = props.buildings.find((x) => x.id === id)
    if (!b) continue
    const selected = props.selectedBuildingId === id
    const mat = mesh.material as THREE.MeshBasicMaterial
    mat.color.set(colorForBuilding(b, selected))
    mat.opacity = b.status === 'inactive' ? 0.25 : selected ? 0.55 : 0.35
    const line = mesh.children[0] as THREE.LineSegments
    ;(line.material as THREE.LineBasicMaterial).color.set(selected ? KP_MDED_LINE_SEL : KP_MDED_LINE)
  }
}

// ---------- 区域热点（多边形描边） ----------
function buildAreaMesh(m: SceneMarker, selected: boolean, hovered: boolean): THREE.Mesh {
  const arr = m.area_points || []
  const verts: number[] = []
  const centroid = new THREE.Vector3()
  arr.forEach((p) => centroid.add(new THREE.Vector3(p.x, p.y, p.z)))
  centroid.multiplyScalar(1 / (arr.length || 1))
  for (let i = 1; i < arr.length; i++) {
    const p0 = arr[i - 1]
    const p1 = arr[i]
    verts.push(centroid.x, centroid.y, centroid.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()

  let color = new THREE.Color(m.color || KP_FALLBACK_CYAN)
  let opacity = AREA_BASE_OPACITY
  if (selected) {
    color = new THREE.Color(AREA_SELECTED_COLOR)
    opacity = AREA_SELECTED_OPACITY
  } else if (hovered) {
    color = new THREE.Color(AREA_HOVER_COLOR)
    opacity = AREA_HOVER_OPACITY
  }
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData = { type: 'area', id: m.id, marker: m }

  // 选中时金色描边轮廓，强化“颜色变化”反馈
  if (arr.length >= 3) {
    const perimeter = arr.map((p) => new THREE.Vector3(p.x, p.y, p.z))
    const loopGeo = new THREE.BufferGeometry().setFromPoints(perimeter)
    const loopMat = new THREE.LineBasicMaterial({
      color: selected ? new THREE.Color(AREA_SELECTED_COLOR) : color,
      transparent: true,
      opacity: selected ? 0.95 : 0.5,
    })
    mesh.add(new THREE.LineLoop(loopGeo, loopMat))
  }
  return mesh
}
function buildAreaMeshes() {
  while (areaGroup.children.length) areaGroup.remove(areaGroup.children[0])
  for (let i = areaMeshes.length - 1; i >= 0; i--) areaMeshes.splice(i, 1)
  const list = (props.areaMarkers || []).filter(
    (m) => m.shape === 'area' && m.visible && m.area_points && m.area_points.length >= 3,
  )
  list.forEach((m) => {
    const sel = m.id === selectedAreaId.value || (!!props.selectedAreaId && m.id === props.selectedAreaId)
    const mesh = buildAreaMesh(m, sel, m.id === hoveredAreaId.value)
    areaGroup.add(mesh)
    areaMeshes.push(mesh)
  })
}
function addDrawVertex(p: THREE.Vector3) {
  const v = { x: p.x, y: p.y, z: p.z }
  drawVertices.value.push(v)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), new THREE.MeshBasicMaterial({ color: DRAW_VERTEX_COLOR }))
  ball.position.set(v.x, v.y, v.z)
  drawVertexGroup.add(ball)
  areaStatus.value = `已描 ${drawVertices.value.length} 个顶点`
  rebuildDrawPreview()
}
function rebuildDrawPreview() {
  while (drawPreviewGroup.children.length) drawPreviewGroup.remove(drawPreviewGroup.children[0])
  const pts = drawVertices.value
  if (pts.length < 2) return
  const verts: number[] = []
  const centroid = new THREE.Vector3()
  pts.forEach((p) => centroid.add(new THREE.Vector3(p.x, p.y, p.z)))
  centroid.multiplyScalar(1 / pts.length)
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    verts.push(centroid.x, centroid.y, centroid.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshBasicMaterial({
    color: DRAW_VERTEX_COLOR,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  drawPreviewGroup.add(new THREE.Mesh(geo, mat))
}
function finishDraw() {
  if (drawVertices.value.length < 3) {
    areaStatus.value = '至少需要 3 个顶点才能闭合区域'
    return
  }
  emit('area', [...drawVertices.value])
  areaStatus.value = `已提交区域（${drawVertices.value.length} 顶点）`
  clearDraw()
}
function clearDraw() {
  drawVertices.value = []
  while (drawVertexGroup.children.length) drawVertexGroup.remove(drawVertexGroup.children[0])
  while (drawPreviewGroup.children.length) drawPreviewGroup.remove(drawPreviewGroup.children[0])
  areaStatus.value = ''
}
function onAreaClick(ud: any) {
  const m = ud.marker as SceneMarker
  selectedAreaId.value = m.id
  buildAreaMeshes()
  // 执行跳转
  if (m.link?.type === 'url' && m.link.url) {
    window.open(m.link.url, '_blank')
  } else if (m.link?.type === 'internal' && m.link.target) {
    const t = m.link.target
    if (sceneStore.buildings.some((b) => b.id === t)) sceneStore.selectBuilding(t)
    else sceneStore.selectSubsystem(t as any)
  }
  // 回传固定信息 + 自定义参数
  emit('area-click', {
    id: m.id,
    label: m.label,
    building_id: m.building_id,
    floor: m.floor,
    link: m.link,
    params: m.params,
    position: m.position,
  })
}

// ---------- 交互：点击选中 + 拖拽 + 区域绘制 ----------
function setPointer(e: PointerEvent) {
  const rect = renderer!.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
}
function intersectBuilding(): THREE.Mesh | null {
  raycaster.setFromCamera(pointer, camera!)
  const meshes = Array.from(buildingMeshes.values())
  const hits = raycaster.intersectObjects(meshes, false)
  return hits.length ? (hits[0].object as THREE.Mesh) : null
}
function intersectGround(): THREE.Vector3 | null {
  raycaster.setFromCamera(pointer, camera!)
  const out = new THREE.Vector3()
  const ok = raycaster.ray.intersectPlane(dragging?.plane || horizPlane, out)
  return ok ? out : null
}
function pickAreaOrSurface(): { area?: THREE.Object3D; point: THREE.Vector3 | null } {
  raycaster.setFromCamera(pointer, camera!)
  // 命中已有区域（仅在未开始绘制时用于选中/跳转）
  const aHits = raycaster.intersectObjects(areaMeshes, false)
  if (!drawVertices.value.length && aHits.length) {
    return { area: aHits[0].object, point: null }
  }
  // 否则在模型表面 / 楼栋表面取点
  const pickTargets = [...modelGroup.children, ...buildingsGroup.children]
  const mHits = raycaster.intersectObjects(pickTargets, true)
  let pt: THREE.Vector3 | null = null
  if (mHits.length) pt = mHits[0].point.clone()
  else {
    const planeHits = raycaster.intersectObject(
      new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ visible: false })),
    )
    if (planeHits.length) pt = planeHits[0].point.clone()
  }
  return { point: pt }
}
function onPointerDown(e: PointerEvent) {
  if (!ready) return
  downX = e.clientX
  downY = e.clientY
  downTime = Date.now()
  pointerDownFlag = true
  // 区域绘制模式：不触发楼栋选中/拖拽
  if (props.editMode === 'area') return
  setPointer(e)
  const hit = intersectBuilding()
  if (hit) {
    ;(renderer!.domElement as HTMLElement).setPointerCapture?.(e.pointerId)
    const id = hit.userData.id as string
    emit('select', id)
    // 起拖：水平面 + 当前 y
    horizPlane.constant = -hit.position.y + hit.userData.h / 2
    const point = intersectGround()
    if (point) {
      dragging = {
        id,
        plane: horizPlane.clone(),
        offset: new THREE.Vector3().subVectors(hit.position, point),
      }
      renderer!.domElement.style.cursor = 'grabbing'
    }
  }
}
function onPointerMove(e: PointerEvent) {
  if (!ready) return
  setPointer(e)
  if (props.editMode === 'area') {
    // 区域模式：未绘制时做悬停高亮预览
    if (!pointerDownFlag && !drawVertices.value.length) {
      raycaster.setFromCamera(pointer, camera!)
      const hits = raycaster.intersectObjects(areaMeshes, false)
      const id = hits.length ? (hits[0].object.userData.id as string) : null
      if (id !== hoveredAreaId.value) {
        hoveredAreaId.value = id
        buildAreaMeshes()
      }
    }
    return
  }
  if (dragging) {
    const point = intersectGround()
    if (!point) return
    const newPos = point.clone().add(dragging.offset)
    emit('drag', { buildingId: dragging.id, position: { x: newPos.x, y: newPos.y, z: newPos.z } })
  } else {
    // hover 高效：选中的 building 不显示其他高亮
    const hit = intersectBuilding()
    renderer!.domElement.style.cursor = hit ? 'pointer' : 'grab'
  }
}
function onPointerUp(e: PointerEvent) {
  pointerDownFlag = false
  if (props.editMode === 'area') {
    const dist = Math.hypot(e.clientX - downX, e.clientY - downY)
    if (dist <= DRAG_THRESHOLD) {
      setPointer(e)
      const r = pickAreaOrSurface()
      if (r.area) {
        onAreaClick(r.area.userData)
      } else if (r.point) {
        addDrawVertex(r.point)
      }
    }
    return
  }
  ;(renderer!.domElement as HTMLElement).releasePointerCapture?.(e.pointerId)
  if (!dragging) return
  const dist = Math.hypot(e.clientX - downX, e.clientY - downY)
  const elapsed = Date.now() - downTime
  dragging = null
  renderer!.domElement.style.cursor = 'grab'
  // 单纯点击（位移 < 阈值 且时间短）也走选中逻辑（onPointerDown 已经 emit）
  void dist; void elapsed
}

// ---------- resize ----------
function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const w = el.clientWidth || 960
  const h = el.clientHeight || 540
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

// ---------- 生命周期 ----------
onMounted(async () => {
  initThree()
  window.addEventListener('resize', onResize)
  buildBuildingMeshes()
  await loadModel()
})
onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointerleave', onPointerUp)
    renderer.domElement.parentElement?.removeChild(renderer.domElement)
    renderer.dispose()
  }
  scene?.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
})

// ---------- 响应 props 变化 ----------
watch(() => props.buildings.map((b) => b.id).join(','), buildBuildingMeshes)
// 楼层标签（Phase 1）：后台编辑楼层标签后 3D 预览即时刷新
watch(() => JSON.stringify(sceneStore.buildingDisplay), buildBuildingMeshes)
watch(() => props.selectedBuildingId, updateSelectedHighlight)
// draftAnchors 变化：仅更新对应楼栋 mesh 位置，不全量重建（避免拖动时闪烁）
watch(
  () => JSON.stringify(props.draftAnchors),
  () => {
    for (const [id, mesh] of buildingMeshes) {
      const b = props.buildings.find((x) => x.id === id)
      if (!b) continue
      const a = getDraftOrAnchor(b)
      const { h } = buildingSize(b)
      mesh.position.set(a.x, a.y + h / 2, a.z)
    }
  },
)
// 已保存锚点变化（初次加载 / 保存后父组件更新）：同步刷新楼栋 mesh 位置，
// 保证「拖动 → 保存 → 清空草稿」后楼栋停在已保存坐标，而非回退到 (0,0,0)。
watch(
  () => JSON.stringify(props.anchors),
  () => {
    for (const [id, mesh] of buildingMeshes) {
      const b = props.buildings.find((x) => x.id === id)
      if (!b) continue
      const a = getDraftOrAnchor(b)
      const { h } = buildingSize(b)
      mesh.position.set(a.x, a.y + h / 2, a.z)
    }
  },
)
// 区域数据 / 选中高亮 / 编辑模式变化 → 重建区域渲染
watch(() => props.areaMarkers, buildAreaMeshes, { deep: true })
watch(
  () => props.selectedAreaId,
  (id) => {
    selectedAreaId.value = id || null
    buildAreaMeshes()
  },
)
watch(
  () => props.editMode,
  (m) => {
    if (m !== 'area') clearDraw()
    buildAreaMeshes()
  },
)

const readyState = computed(() => ready)
const drawCount = computed(() => drawVertices.value.length)
defineExpose({ ready: readyState, finishDraw, clearDraw, drawCount })
</script>

<template>
  <div class="bd3d">
    <div v-if="loading" class="bd3d__overlay">3D 模型加载中…</div>
    <div v-if="error" class="bd3d__overlay bd3d__overlay--error">3D 加载失败：{{ error }}（仍可在右下角精确输入 X/Y/Z）</div>
    <div ref="container" class="bd3d__canvas" />
    <!-- 区域绘制状态（仅区域模式显示） -->
    <div v-if="editMode === 'area'" class="bd3d__area-status">
      {{ areaStatus || '点击模型表面依次描点，≥3 点后点“完成描边”闭合区域' }}
    </div>
    <div class="bd3d__legend">
      <span>左键拖动建筑定位</span>
      <span>右键/中键旋转 · 滚轮缩放</span>
      <span>关闭/未激活楼栋以暗灰显示</span>
    </div>
  </div>
</template>

<style scoped>
.bd3d { position: relative; width: 100%; height: 100%; min-height: 480px; }
.bd3d__canvas { position: absolute; inset: 0; }
.bd3d__overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(var(--kp-bg-rgb), 0.55); color: var(--kp-fg-muted); font-size: 13px;
  z-index: 2; pointer-events: none;
}
.bd3d__overlay--error { color: var(--kp-danger); }
.bd3d__area-status {
  position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 3;
  padding: 6px 14px; background: rgba(var(--kp-bg-rgb), 0.75); border: 1px solid rgba(var(--kp-warn-rgb), 0.4);
  border-radius: var(--kp-radius-sm); color: var(--kp-warn); font-size: 12px; white-space: nowrap;
}
.bd3d__legend {
  position: absolute; left: 8px; bottom: 8px; z-index: 3; display: flex; flex-direction: column; gap: 2px;
  padding: 6px 10px; background: rgba(var(--kp-bg-rgb), 0.6); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg-muted); font-size: 11px;
}
</style>

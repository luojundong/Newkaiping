<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { SceneMarker } from '@/types/api'
import { KP_DRAW_VERTEX, KP_FALLBACK_CYAN, KP_MARKER_BG, KP_MARKER_GRID_A, KP_MARKER_GRID_B, KP_MARKER_EMISSIVE } from '@/lib/kp-accent'

type Pt = { x: number; y: number; z: number }

const props = defineProps<{
  modelUrl: string
  markers: SceneMarker[]
  selectedFloor: number
  buildingAnchorY: number
  shape?: 'point' | 'area'
  areaPoints?: Pt[]
}>()

const emit = defineEmits<{
  pick: [position: Pt]
  area: [points: Pt[]]
}>()

const container = ref<HTMLDivElement | null>(null)
const statusText = ref('正在加载 3D 模型...')
const pickedPos = ref<{ x: number; y: number; z: number } | null>(null)
const areaStatus = ref('')

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let raycaster = new THREE.Raycaster()
let pointer = new THREE.Vector2()
let modelGroup = new THREE.Group()
let markersGroup = new THREE.Group()
let areaVertexGroup = new THREE.Group() // 描边顶点小球
let areaPreviewGroup = new THREE.Group() // 半透明区域预览
let pickIndicator: THREE.Mesh | null = null
let raf = 0
let disposed = false
const FLOOR_HEIGHT = 4.2

// 区域描边（多边形）顶点
const areaVertices = ref<Pt[]>([])

function init() {
  const el = container.value!
  const w = el.clientWidth || 600
  const h = el.clientHeight || 400

  scene = new THREE.Scene()
  scene.background = new THREE.Color(KP_MARKER_BG)

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000)
  camera.position.set(0, 120, 200)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  // 光照
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 0.8)
  dir.position.set(50, 100, 50)
  scene.add(dir)

  // 网格
  const grid = new THREE.GridHelper(400, 40, KP_MARKER_GRID_A, KP_MARKER_GRID_B)
  scene.add(grid)

  // 控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 20, 0)

  scene.add(modelGroup)
  scene.add(markersGroup)
  scene.add(areaVertexGroup)
  scene.add(areaPreviewGroup)

  // 加载模型
  loadModel()

  // 点击拾取
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)

  animate()
}

let downX = 0
let downY = 0
function onPointerDown(e: PointerEvent) {
  downX = e.clientX
  downY = e.clientY
}

function onPointerUp(e: PointerEvent) {
  const dist = Math.hypot(e.clientX - downX, e.clientY - downY)
  if (dist > 6) return // 拖拽不算点击
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)

  // 射线检测模型表面
  const hits = raycaster.intersectObjects(modelGroup.children, true)
  let pt: THREE.Vector3 | null = null
  if (hits.length > 0) {
    pt = hits[0].point.clone()
  } else {
    const planeHits = raycaster.intersectObject(
      new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ visible: false })),
    )
    if (planeHits.length > 0) pt = planeHits[0].point.clone()
  }
  if (!pt) return

  if (props.shape === 'area') {
    addAreaVertex(pt)
  } else {
    // 点选模式：以楼层高度生成选点坐标
    const y = props.buildingAnchorY + (props.selectedFloor - 1) * FLOOR_HEIGHT + 2
    pickedPos.value = { x: pt.x, y, z: pt.z }
    emit('pick', pickedPos.value)
    updatePickIndicator(pt.x, y, pt.z)
  }
}

// ---------- 区域描边（多边形） ----------
function addAreaVertex(p: THREE.Vector3) {
  const v: Pt = { x: p.x, y: p.y, z: p.z }
  areaVertices.value.push(v)
  const geo = new THREE.SphereGeometry(1.2, 10, 10)
  const mat = new THREE.MeshBasicMaterial({ color: KP_DRAW_VERTEX })
  const ball = new THREE.Mesh(geo, mat)
  ball.position.set(v.x, v.y, v.z)
  areaVertexGroup.add(ball)
  areaStatus.value = `已描 ${areaVertices.value.length} 个顶点`
  rebuildAreaPreview()
}

function rebuildAreaPreview() {
  while (areaPreviewGroup.children.length) areaPreviewGroup.remove(areaPreviewGroup.children[0])
  const pts = areaVertices.value
  if (pts.length < 2) return
  const verts: number[] = []
  const centroid = new THREE.Vector3()
  pts.forEach((p) => centroid.add(new THREE.Vector3(p.x, p.y, p.z)))
  centroid.multiplyScalar(1 / pts.length)
  for (let i = 1; i < pts.length; i++) {
    const p0 = new THREE.Vector3(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z)
    const p1 = new THREE.Vector3(pts[i].x, pts[i].y, pts[i].z)
    verts.push(centroid.x, centroid.y, centroid.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshBasicMaterial({
    color: KP_DRAW_VERTEX,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  areaPreviewGroup.add(new THREE.Mesh(geo, mat))
}

function finishArea() {
  if (areaVertices.value.length < 3) {
    areaStatus.value = '至少需要 3 个顶点才能闭合区域'
    return
  }
  emit('area', [...areaVertices.value])
  areaStatus.value = `已提交区域（${areaVertices.value.length} 顶点）`
}

function clearArea() {
  areaVertices.value = []
  while (areaVertexGroup.children.length) areaVertexGroup.remove(areaVertexGroup.children[0])
  while (areaPreviewGroup.children.length) areaPreviewGroup.remove(areaPreviewGroup.children[0])
  areaStatus.value = ''
}

function loadAreaEcho() {
  clearArea()
  ;(props.areaPoints || []).forEach((p) => {
    areaVertices.value.push({ ...p })
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), new THREE.MeshBasicMaterial({ color: KP_DRAW_VERTEX }))
    ball.position.set(p.x, p.y, p.z)
    areaVertexGroup.add(ball)
  })
  if (areaVertices.value.length) {
    areaStatus.value = `已载入 ${areaVertices.value.length} 个顶点`
    rebuildAreaPreview()
  }
}

function updatePickIndicator(x: number, y: number, z: number) {
  if (pickIndicator) markersGroup.remove(pickIndicator)
  const geo = new THREE.SphereGeometry(2, 16, 16)
  const mat = new THREE.MeshStandardMaterial({ color: KP_MARKER_EMISSIVE, emissive: KP_MARKER_EMISSIVE, emissiveIntensity: 1 })
  pickIndicator = new THREE.Mesh(geo, mat)
  pickIndicator.position.set(x, y, z)
  markersGroup.add(pickIndicator)
}

function loadModel() {
  const url = props.modelUrl || '/models/hospital.glb'
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('/draco/')
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)

  loader.load(
    url,
    (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = maxDim > 0 ? 230 / maxDim : 1
      gltf.scene.scale.setScalar(scale)
      gltf.scene.position.sub(center.multiplyScalar(scale))
      modelGroup.add(gltf.scene)
      statusText.value = props.shape === 'area' ? '模型加载完成，点击表面依次描点' : '模型加载完成，点击模型表面选点'
      buildMarkers()
    },
    undefined,
    (err) => {
      statusText.value = '模型加载失败，仍可点击网格平面选点'
      console.warn('MarkerEditor3D model load error', err)
    },
  )
}

function buildMarkers() {
  while (markersGroup.children.length) markersGroup.remove(markersGroup.children[0])
  pickIndicator = null
  props.markers.forEach((m) => {
    if (m.shape === 'area' && m.area_points && m.area_points.length >= 3) {
      // 区域 marker：绘制半透明多边形
      const arr = m.area_points
      const verts: number[] = []
      const centroid = new THREE.Vector3()
      arr.forEach((p) => centroid.add(new THREE.Vector3(p.x, p.y, p.z)))
      centroid.multiplyScalar(1 / arr.length)
      for (let i = 1; i < arr.length; i++) {
        const p0 = arr[i - 1]
        const p1 = arr[i]
        verts.push(centroid.x, centroid.y, centroid.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      geo.computeVertexNormals()
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(m.color || KP_FALLBACK_CYAN),
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      markersGroup.add(new THREE.Mesh(geo, mat))
    } else {
      // 点 marker：彩球
      const geo = new THREE.SphereGeometry(1.5, 12, 12)
      const color = new THREE.Color(m.color || KP_FALLBACK_CYAN)
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(m.position.x, m.position.y, m.position.z)
      markersGroup.add(mesh)
    }
  })
}

function animate() {
  if (disposed) return
  raf = requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const w = el.clientWidth || 600
  const h = el.clientHeight || 400
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

// 标记变化时重建
watch(
  () => props.markers.map((m) => m.id).join(','),
  buildMarkers,
)
// 楼层变化时更新已选点的 y
watch(
  () => props.selectedFloor,
  () => {
    if (pickedPos.value) {
      pickedPos.value.y = props.buildingAnchorY + (props.selectedFloor - 1) * FLOOR_HEIGHT + 2
      emit('pick', pickedPos.value)
      updatePickIndicator(pickedPos.value.x, pickedPos.value.y, pickedPos.value.z)
    }
  },
)
// 区域回显（编辑已有区域）
watch(
  () => props.areaPoints,
  () => {
    if (props.shape === 'area') loadAreaEcho()
  },
  { deep: true },
)

onMounted(() => {
  init()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  clearArea()
  window.removeEventListener('resize', onResize)
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.dispose()
  }
})
</script>

<template>
  <div class="marker-editor-3d">
    <div ref="container" class="editor-canvas" />
    <div class="editor-status">{{ statusText }}</div>
    <div v-if="pickedPos" class="picked-info">
      已选点位: X={{ pickedPos.x.toFixed(1) }} Y={{ pickedPos.y.toFixed(1) }} Z={{ pickedPos.z.toFixed(1) }}
    </div>
    <div v-if="shape === 'area'" class="area-toolbar">
      <span class="area-status">{{ areaStatus || '点击模型表面依次描点，≥3 点后点“完成描边”闭合区域' }}</span>
      <div class="area-btns">
        <button type="button" class="area-btn area-btn--primary" @click="finishArea">完成描边</button>
        <button type="button" class="area-btn" @click="clearArea">清除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.marker-editor-3d {
  position: relative;
  width: 100%;
  height: 400px;
  background: var(--kp-surface);
  border-radius: 8px;
  overflow: hidden;
}
.editor-canvas {
  width: 100%;
  height: 100%;
}
.editor-status {
  position: absolute;
  top: 8px;
  left: 12px;
  color: var(--kp-accent);
  font-size: 12px;
  pointer-events: none;
}
.picked-info {
  position: absolute;
  bottom: 8px;
  left: 12px;
  color: var(--kp-success);
  font-size: 12px;
  pointer-events: none;
}
.area-toolbar {
  position: absolute;
  bottom: 8px;
  right: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 70%;
}
.area-status {
  color: var(--kp-success);
  font-size: 12px;
  background: color-mix(in srgb, var(--kp-surface) 75%, transparent);
  border: 1px solid rgba(var(--kp-accent-rgb), 0.35);
  border-radius: 6px;
  padding: 4px 8px;
  text-align: right;
}
.area-btns {
  display: flex;
  gap: 6px;
}
.area-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(var(--kp-accent-rgb), 0.4);
  background: color-mix(in srgb, var(--kp-surface) 85%, transparent);
  color: var(--kp-success);
  cursor: pointer;
}
.area-btn--primary {
  background: var(--kp-accent);
  color: var(--kp-bg-deep);
  border-color: var(--kp-accent);
  font-weight: 600;
}
.area-btn:hover {
  opacity: 0.85;
}
</style>

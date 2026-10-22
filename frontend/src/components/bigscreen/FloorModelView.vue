<script setup lang="ts">
// 楼层 3D 模型结构视图（弹窗内嵌独立查看器）。
// 取代 2D 平面示意图：加载对应楼层 GLB（如 hql-f1/f2/f3.glb），按设备真实坐标归一化映射到模型
// footprint 上打设备点；点击设备点 → emit('device-select') 驱动弹窗控制；弹窗选中设备/房间 →
// 高亮对应点（双向联动）。
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { Device } from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'

const props = defineProps<{
  buildingId: string
  floor: number
  modelUrl: string | null
  devices: Device[]
  loading?: boolean
  /** 房间/集合过滤命中的设备 id（高亮这些点） */
  highlightDeviceIds?: Set<string> | null
  /** 当前选中的单个设备 id（脉冲高亮） */
  selectedDeviceId?: string | null
}>()
const emit = defineEmits<{
  (e: 'device-select', deviceId: string): void
  (e: 'ready'): void
}>()

// 子系统 → 标记颜色（CSS var 不可用于 WebGL，转十六进制）
const SUB_HEX: Record<string, number> = {
  regulation: 0x35c5ff,
  lifecycle: 0x9b8cff,
  hvac: 0x36d399,
  lighting: 0xffcf5c,
  power: 0xff7a5c,
  water: 0x4db8ff,
  elevator: 0xff6bd6,
  security: 0x8fd0ff,
  fire: 0xff4d5e,
}
const subHex = (code: string) => SUB_HEX[code] ?? (SUBSYSTEMS.find((s) => s.code === code)?.colorVar ? 0x35c5ff : 0x35c5ff)

const canvasWrap = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let raf = 0
let disposed = false
const modelRoot = new THREE.Group()
const markerGroup = new THREE.Group()
const markerById = new Map<string, THREE.Mesh>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let modelTopY = 1.2 // 模型顶部世界 y（打点基准）

const error = ref<string | null>(null)
const ready = ref(false)

async function loadGLB(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
  loader.setDRACOLoader(draco)
  try {
    loader.setMeshoptDecoder(MeshoptDecoder)
  } catch {
    /* meshopt 可选 */
  }
  return (await loader.loadAsync(url)).scene
}

function clearModel() {
  while (modelRoot.children.length) {
    const c = modelRoot.children[0]
    c.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.()
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material]
        ms.forEach((m: any) => m.dispose?.())
      }
    })
    modelRoot.remove(c)
  }
  while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0])
  markerById.clear()
}

function fitModel(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  obj.position.sub(center) // 居中到原点
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const target = 6 // 归一化到 ~6 单位便于在 720px 弹窗内查看
  const scale = target / maxDim
  obj.scale.setScalar(scale)
  modelRoot.add(obj)
  const scBox = new THREE.Box3().setFromObject(modelRoot)
  modelTopY = scBox.max.y
}

function placeMarkers() {
  // 先清旧标记
  while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0])
  markerById.clear()
  const pts = props.devices.filter(
    (d) => typeof d.location?.x === 'number' && typeof d.location?.z === 'number',
  )
  if (!pts.length) return
  const xs = pts.map((d) => d.location!.x as number)
  const zs = pts.map((d) => d.location!.z as number)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const spanX = maxX - minX || 1
  const spanZ = maxZ - minZ || 1
  const scBox = new THREE.Box3().setFromObject(modelRoot)
  const padX = (scBox.max.x - scBox.min.x) * 0.12
  const padZ = (scBox.max.z - scBox.min.z) * 0.12
  const loX = scBox.min.x + padX
  const hiX = scBox.max.x - padX
  const loZ = scBox.min.z + padZ
  const hiZ = scBox.max.z - padZ
  const y = modelTopY + 0.45
  for (const d of pts) {
    const nx = (xs.includes(d.location!.x as number) ? (d.location!.x as number) - minX : 0) / spanX
    const nz = (zs.includes(d.location!.z as number) ? (d.location!.z as number) - minZ : 0) / spanZ
    const color = subHex(d.subsystem_id)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat)
    mesh.position.set(loX + nx * (hiX - loX), y, loZ + nz * (hiZ - loZ))
    mesh.userData = { deviceId: d.id, base: color }
    markerGroup.add(mesh)
    markerById.set(d.id, mesh)
  }
}

function applyHighlight() {
  const hl = props.highlightDeviceIds
  const sel = props.selectedDeviceId
  markerById.forEach((mesh, id) => {
    const isSel = id === sel
    const isHl = !!hl && hl.has(id)
    const s = isSel ? 2.4 : isHl ? 1.7 : 1
    mesh.scale.setScalar(s)
    const mat = mesh.material as THREE.MeshBasicMaterial
    mat.opacity = isSel || isHl ? 1 : 0.85
    mat.color.setHex(isSel ? 0xffffff : isHl ? brighter(mesh.userData.base) : mesh.userData.base)
  })
}

function brighter(hex: number): number {
  const c = new THREE.Color(hex)
  c.lerp(new THREE.Color(0xffffff), 0.45)
  return c.getHex()
}

function initThree() {
  const el = canvasWrap.value
  if (!el) return
  const w = el.clientWidth || 680
  const h = 300
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x030c18)
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
  camera.position.set(0, 4.2, 9)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h)
  el.appendChild(renderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.4, 0)
  controls.enableDamping = true
  controls.minDistance = 3
  controls.maxDistance = 24
  controls.maxPolarAngle = Math.PI / 2.05
  controls.update()

  scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(5, 10, 7)
  scene.add(dir)
  const dir2 = new THREE.DirectionalLight(0x88bbff, 0.4)
  dir2.position.set(-6, 4, -5)
  scene.add(dir2)

  scene.add(modelRoot)
  scene.add(markerGroup)

  renderer.domElement.addEventListener('pointerdown', onPick)
  renderer.domElement.style.cursor = 'grab'
  animate()
}

function onPick(e: PointerEvent) {
  if (!renderer || !camera) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(markerGroup.children, false)
  if (hits.length) {
    const id = hits[0].object.userData?.deviceId
    if (id) emit('device-select', id as string)
  }
}

let t0 = 0
function animate() {
  if (disposed || !renderer || !scene || !camera) return
  const t = (performance.now() - t0) / 1000
  if (controls) controls.update()
  // 选中设备脉冲
  if (props.selectedDeviceId) {
    const m = markerById.get(props.selectedDeviceId)
    if (m) m.scale.setScalar(2.4 + Math.sin(t * 6) * 0.35)
  }
  renderer.render(scene, camera)
  raf = requestAnimationFrame(animate)
}

async function setModel(url: string) {
  ready.value = false
  error.value = null
  clearModel()
  try {
    const obj = await loadGLB(url)
    if (disposed) return
    obj.traverse((c: any) => {
      if (c.isMesh) {
        c.castShadow = false
        c.receiveShadow = false
      }
    })
    fitModel(obj)
    placeMarkers()
    applyHighlight()
    ready.value = true
    emit('ready')
  } catch (err) {
    error.value = '楼层模型加载失败'
    console.warn('[FloorModelView] GLB 加载失败', url, err)
  }
}

function onResize() {
  const el = canvasWrap.value
  if (!el || !renderer || !camera) return
  const w = el.clientWidth || 680
  camera.aspect = w / 300
  camera.updateProjectionMatrix()
  renderer.setSize(w, 300)
}

onMounted(() => {
  t0 = performance.now()
  initThree()
  if (props.modelUrl) setModel(props.modelUrl)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  disposed = true
  if (raf) cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
  renderer?.domElement?.removeEventListener('pointerdown', onPick)
  controls?.dispose()
  renderer?.dispose()
  clearModel()
  scene = null
  camera = null
  renderer = null
})

watch(
  () => props.modelUrl,
  (u) => {
    if (u) setModel(u)
  },
)
watch(
  () => props.devices,
  () => {
    if (ready.value) placeMarkers()
    applyHighlight()
  },
  { deep: true },
)
watch(
  () => [props.highlightDeviceIds, props.selectedDeviceId],
  () => applyHighlight(),
  { deep: true },
)
</script>

<template>
  <div class="floor-model-view" data-floor-model="1">
    <div class="fmv-cap">
      <span>{{ buildingId }} 号楼 · {{ floor }}F 模型结构</span>
      <span class="fmv-hint">拖拽旋转 · 滚轮缩放 · 点击设备点联动</span>
    </div>
    <div ref="canvasWrap" class="fmv-canvas" />
    <div v-if="loading && !ready" class="fmv-tip">楼层模型加载中…</div>
    <div v-else-if="error" class="fmv-tip fmv-tip--err">{{ error }}</div>
    <div v-else-if="ready && !devices.filter((d) => typeof d.location?.x === 'number').length" class="fmv-tip">
      该楼层设备暂无坐标，无法打点
    </div>
    <div class="fmv-legend">
      <span v-for="s in SUBSYSTEMS.slice(0, 7)" :key="s.code" class="fmv-legend__i">
        <i :style="{ background: '#' + subHex(s.code).toString(16).padStart(6, '0') }" />
        {{ s.name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.floor-model-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 6px;
}
.fmv-cap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.fmv-hint { color: var(--kp-fg-subtle); font-size: 10px; }
.fmv-canvas {
  width: 100%;
  height: 300px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius);
  background:
    radial-gradient(120% 120% at 50% 0%, rgba(var(--kp-accent-rgb), 0.06), transparent 70%),
    var(--kp-bg-deep, #030c18);
  overflow: hidden;
  position: relative;
}
.fmv-tip {
  position: absolute;
  left: 12px;
  bottom: 10px;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--kp-fg-muted);
  background: rgba(3, 12, 24, 0.7);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-pill);
}
.fmv-tip--err { color: var(--kp-alarm, #ff4d5e); border-color: var(--kp-alarm, #ff4d5e); }
.fmv-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 2px 0;
  border-top: 1px solid var(--kp-border);
}
.fmv-legend__i {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--kp-fg-muted);
}
.fmv-legend__i i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
</style>

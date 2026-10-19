<script setup lang="ts">
/**
 * InteractionController.vue — GK-04 / GK-05 拆分产出
 *
 * 职责：接管 raycast / click / hover / focus 视觉，命中 SceneRenderer 暴露的 selectables 后按 userData.kind 分支发事件。
 *   - 不渲染任何 DOM（template 为空 span，纯逻辑组件）。
 *   - props：ThreeViewer facade 注入
 *     - renderer / scene / camera：从 SceneRenderer 暴露的 THREE 实例
 *     - selectablesGetter：selectables 的 getter（每次 pointer 事件取一次，避免脏引用）
 *     - hoverArea / hoverBuilding setter：用于触发 SceneRenderer 内部高亮重建
 *     - selectedArea setter：用于触发选中态重建
 *   - emits：与改造前 ThreeViewer.vue 兼容 + 增加 device-click
 *     - area-click：{ id, label, building_id, floor, link, params, position }（与原签名一致）
 *     - floor-click：{ buildingId, floor }（与原签名一致）
 *     - device-click：{ deviceId, markerId }（本期新增，GK-05 接 BigScreenLayout 消费）
 */
import { onBeforeUnmount, onMounted } from 'vue'
import * as THREE from 'three'

interface AreaClickPayload {
  id: string
  label: string
  building_id: string
  floor: number
  link?: any
  params?: Record<string, string>
  position: { x: number; y: number; z: number }
}

const props = defineProps<{
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  selectablesGetter: () => THREE.Object3D[]
  hoverArea: (id: string | null) => void
  hoverBuilding: (id: string | null) => void
  selectArea: (id: string | null) => void
}>()

const emit = defineEmits<{
  (e: 'area-click', payload: AreaClickPayload): void
  (e: 'floor-click', payload: { buildingId: string; floor: number }): void
  (e: 'device-click', payload: { deviceId: string; markerId?: string }): void
  (e: 'building-click', payload: { buildingId: string }): void
}>()

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let downX = 0
let downY = 0
let pointerDownFlag = false

const getCanvas = (): HTMLCanvasElement | null => props.renderer?.domElement ?? null

function attach() {
  const canvas = getCanvas()
  if (!canvas) return
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
}

function detach() {
  const canvas = getCanvas()
  if (!canvas) return
  canvas.removeEventListener('pointerdown', onPointerDown)
  canvas.removeEventListener('pointerup', onPointerUp)
  canvas.removeEventListener('pointermove', onPointerMove)
  canvas.removeEventListener('pointerleave', onPointerLeave)
}

function onPointerDown(e: PointerEvent) {
  downX = e.clientX
  downY = e.clientY
  pointerDownFlag = true
}

function onPointerUp(e: PointerEvent) {
  if (!props.camera || !props.renderer) return
  const dist = Math.hypot(e.clientX - downX, e.clientY - downY)
  pointerDownFlag = false
  if (dist > 6) return
  const rect = props.renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, props.camera)
  const selectables = props.selectablesGetter?.() || []
  const hits = raycaster.intersectObjects(selectables, false)
  if (!hits.length) return

  // 优先级：设备点 > 楼层标签 > 区域热点 > 楼栋热点。
  // GK-13 修复：楼层标签 sprite 悬挂在楼栋命中球（半径可达 60 的隐形球）内部，
  // 按 hits[0] 最近排序恒被 hitSphere 抢占 → 3D 下楼层标签永远点不到；
  // 显式小目标（sprite）应优先于大半径不可见命中球。
  const deviceHit = hits.find((h) => h.object.userData?.type === 'device')
  const labelHit = hits.find((h) => h.object.userData?.type === 'floorLabel')
  const target = deviceHit || labelHit || hits[0]
  const ud = target.object.userData
  if (!ud) return

  if (ud.type === 'device') {
    emit('device-click', { deviceId: ud.id as string, markerId: ud.id as string })
  } else if (ud.type === 'floorLabel') {
    emit('floor-click', { buildingId: ud.bid as string, floor: ud.fidx as number })
  } else if (ud.type === 'area') {
    handleAreaClick(ud)
  } else if (ud.type === 'building') {
    const id = (ud.id as string) || (ud.bid as string) || (ud.code as string)
    emit('building-click', { buildingId: id })
  } else if (ud.type === 'bldg6whole') {
    // 6 号楼整栋态：点击整栋模型 → 按命中世界 Y 映射楼层，跳转到该层钻取（仿参考页 click→jump floor）
    const hit = hits.find((h) => h.object.userData?.type === 'bldg6whole')
    if (hit) {
      const yMin = (hit.object.userData?.yMin as number) ?? 0
      const yMax = (hit.object.userData?.yMax as number) ?? 1
      let floor = Math.ceil(((hit.point.y - yMin) / Math.max(0.001, yMax - yMin)) * 3)
      floor = Math.min(3, Math.max(1, floor))
      emit('floor-click', { buildingId: '6', floor })
    }
  }
}

function handleAreaClick(ud: any) {
  const m = ud.marker
  if (!m) return
  // 本组件只派发事件，不修改 SceneRenderer 状态；选中态由 ThreeViewer facade 接管
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

function onPointerMove(e: PointerEvent) {
  if (!props.camera || !props.renderer) return
  if (pointerDownFlag) return
  const rect = props.renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, props.camera)
  const selectables = props.selectablesGetter?.() || []
  const hits = raycaster.intersectObjects(selectables, false)

  const areaHit = hits.find((h) => h.object.userData?.type === 'area')
  const id = areaHit ? (areaHit.object.userData.id as string) : null
  props.hoverArea?.(id)

  const buildingHit = areaHit ? null : hits.find((h) => h.object.userData?.type === 'building')
  const bid = buildingHit ? (buildingHit.object.userData.id as string) : null
  props.hoverBuilding?.(bid)

  const canvas = getCanvas()
  if (canvas) canvas.style.cursor = id || bid ? 'pointer' : ''
}

function onPointerLeave() {
  props.hoverBuilding?.(null)
  const canvas = getCanvas()
  if (canvas) canvas.style.cursor = ''
}

onMounted(() => attach())
onBeforeUnmount(() => detach())
</script>

<template>
  <span aria-hidden="true" />
</template>

<style scoped>
span {
  display: none;
}
</style>

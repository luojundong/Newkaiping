<script setup lang="ts">
/**
 * ThreeViewer.vue — GK-04 拆分后 facade
 *
 * 1172 行单文件 → SceneRenderer.vue（纯渲染）+ InteractionController.vue（pointer/事件）+ 本 facade（事件路由 + store 接线）。
 * 保持 BigScreenLayout 现有消费方式不变：@floor-click emit 签名按原契约。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SceneRenderer from './SceneRenderer.vue'
import InteractionController from './InteractionController.vue'
import { useSceneStore } from '@/stores/scene'

const sceneStore = useSceneStore()

const rendererRef = ref<InstanceType<typeof SceneRenderer> | null>(null)
const sceneSchema = computed<any>(() => sceneStore.sceneSchema)

const sceneObj = computed(() => rendererRef.value?.getScene())
const cameraObj = computed(() => rendererRef.value?.getCamera())
const rendererObj = computed(() => rendererRef.value?.getRenderer())
const rendererReady = computed(() => !!rendererObj.value && !!sceneObj.value && !!cameraObj.value)

const selectablesGetter = () => rendererRef.value?.getSelectables?.() ?? []
const hoverAreaFn = (id: string | null) => rendererRef.value?.setHoveredArea?.(id)
const hoverBuildingFn = (id: string | null) => rendererRef.value?.setHoveredBuilding?.(id)
const selectAreaFn = (id: string | null) => rendererRef.value?.setSelectedArea?.(id)

function onFloorClick(p: { buildingId: string; floor: number }) {
  sceneStore.openFloorDrill(p.buildingId, p.floor)
}
function onDeviceClick(p: { deviceId: string }) {
  sceneStore.openDevice(p.deviceId)
}
function onBuildingClick(p: { buildingId: string }) {
  if (p.buildingId) sceneStore.selectBuilding(p.buildingId)
}
function onAreaClick(p: any) {
  // 保留改造前 onAreaClick 的跳转行为（url → 新窗口 / internal → selectBuilding/selectSubsystem）
  const link = p?.link
  if (link?.type === 'url' && link.url) window.open(link.url, '_blank')
  else if (link?.type === 'internal' && link.target) {
    const t = link.target
    if (sceneStore.buildings.some((b: any) => b.id === t)) sceneStore.selectBuilding(t)
    else sceneStore.selectSubsystem(t as any)
  }
}

// 仍暴露给父组件的可调用方法（原 ThreeViewer.vue 的 ref 调用方式保留）
defineExpose({
  loadModel: (url: string) => rendererRef.value?.loadModel?.(url),
  flyTo: (target: [number, number, number]) => rendererRef.value?.flyTo?.(target),
  // GK-08：schema cameraPresets 单一入口（转发 SceneRenderer；大屏/后台统一走这里）
  flyToPreset: (presetId: string) => rendererRef.value?.flyToPreset?.(presetId),
  flyToBuilding: (buildingId: string) => rendererRef.value?.flyToBuilding?.(buildingId),
  flyToFloor: (buildingId: string, floor: number) => rendererRef.value?.flyToFloor?.(buildingId, floor),
  resetDefaultView: () => rendererRef.value?.resetDefaultView?.(),
  getActivePresetId: () => rendererRef.value?.getActivePresetId?.() ?? null,
  getCameraPose: () => rendererRef.value?.getCameraPose?.() ?? null,
  getScene: () => rendererRef.value?.getScene?.(),
  getCamera: () => rendererRef.value?.getCamera?.(),
  getRenderer: () => rendererRef.value?.getRenderer?.(),
  getControls: () => rendererRef.value?.getControls?.(),
})

const emit = defineEmits<{
  (e: 'area-click', payload: any): void
  (e: 'floor-click', payload: { buildingId: string; floor: number }): void
}>()

function forwardArea(p: any) {
  onAreaClick(p)
  emit('area-click', p)
}

// GK-08：dev-only 调试/QA 入口（生产构建不含）。供 CDP/手工验证从 Console 直接驱动相机 preset，
// 与 3D 点击/选楼 UI 共用同一 flyToPreset/flyToBuilding/flyToFloor 代码路径。
function installCameraDebugHook() {
  if (!import.meta.env.DEV) return
  const cam = {
    flyToPreset: (presetId: string) => rendererRef.value?.flyToPreset?.(presetId),
    flyToBuilding: (buildingId: string) => rendererRef.value?.flyToBuilding?.(buildingId),
    flyToFloor: (buildingId: string, floor: number) => rendererRef.value?.flyToFloor?.(buildingId, floor),
    resetDefaultView: () => rendererRef.value?.resetDefaultView?.(),
    getActivePresetId: () => rendererRef.value?.getActivePresetId?.() ?? null,
    getControls: () => rendererRef.value?.getControls?.() ?? null,
    getScene: () => rendererRef.value?.getScene?.() ?? null,
    getPose: () => {
      const c = rendererRef.value?.getCamera?.()
      if (!c) return null
      const ct = rendererRef.value?.getControls?.()
      return {
        position: { x: +c.position.x.toFixed(3), y: +c.position.y.toFixed(3), z: +c.position.z.toFixed(3) },
        fov: +c.fov.toFixed(3),
        lookAt: ct ? { x: +ct.target.x.toFixed(3), y: +ct.target.y.toFixed(3), z: +ct.target.z.toFixed(3) } : null,
      }
    },
  }
  ;(window as unknown as { __kpSceneCamera: unknown }).__kpSceneCamera = cam
}
function uninstallCameraDebugHook() {
  const w = window as unknown as { __kpSceneCamera?: unknown }
  if (w.__kpSceneCamera) delete w.__kpSceneCamera
}
onMounted(() => installCameraDebugHook())
onBeforeUnmount(() => uninstallCameraDebugHook())
</script>

<template>
  <SceneRenderer ref="rendererRef" :scene-schema="sceneSchema" />
  <InteractionController
    v-if="rendererReady"
    :renderer="rendererObj!"
    :scene="sceneObj!"
    :camera="cameraObj!"
    :selectables-getter="selectablesGetter"
    :hover-area="hoverAreaFn"
    :hover-building="hoverBuildingFn"
    :select-area="selectAreaFn"
    @area-click="forwardArea"
    @floor-click="(p) => { onFloorClick(p); emit('floor-click', p) }"
    @device-click="onDeviceClick"
    @building-click="onBuildingClick"
  />
</template>

<script setup lang="ts">
/**
 * 大屏布局外壳（参考页 body / #stage 的组件化复刻）
 *
 * 结构性根因修复（用户决策「做 B」= 完整复刻参考页结构）：
 *   改造前 .bs-scale-wrap 是 position:fixed + 100vw/100vh 流式布局，面板按百分比定位，
 *   与参考页 1920×1080 固定舞台 + transform:scale() 的像素几何**永远对不齐**。
 *   现切回参考页模型：.bs-shell(铺满视口) > .bs-stage(1920×1080, transform:scale 等比缩放)。
 *   附带收益：后台「布局 DIY」画布本来就是 1920×1080+scale，自此与真实大屏 1:1 所见即所得。
 *
 * 7 屏容器：ScreenHero(图1 主驾驶舱) … ScreenArea(图7 建筑面积表)。
 *   顶栏 tab 与图1 S 卡下钻(@drill)共同驱动 screen 屏号；图1 透出全屏 3D，图2-7 为平面屏。
 *
 * 后台「大屏样式 DIY」：styleToCssVars(bigscreen.config.style) 注入 .bs-shell 行内变量，覆盖 :root 令牌。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ThreeViewer from '@/components/three/ThreeViewer.vue'
import DeviceDetailDrawer from '@/components/device/DeviceDetailDrawer.vue'
import FloorDrillDrawer from '@/components/device/FloorDrillDrawer.vue'
import BsTopNav from '@/components/bigscreen/BsTopNav.vue'
import ScreenHero from '@/components/bigscreen/screens/ScreenHero.vue'
import ScreenHvac from '@/components/bigscreen/screens/ScreenHvac.vue'
import ScreenElevator from '@/components/bigscreen/screens/ScreenElevator.vue'
import ScreenPower from '@/components/bigscreen/screens/ScreenPower.vue'
import ScreenAlarm from '@/components/bigscreen/screens/ScreenAlarm.vue'
import ScreenAsset from '@/components/bigscreen/screens/ScreenAsset.vue'
import ScreenArea from '@/components/bigscreen/screens/ScreenArea.vue'
import { useSceneStore } from '@/stores/scene'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useDataMode } from '@/lib/bigscreen-data-mode'
import { styleToCssVars } from '@/lib/bigscreen-config'
import { SUBSYSTEMS } from '@/types/scene'
import type { ScreenNo } from '@/lib/bigscreen-screens'
import '@/styles/bigscreen-stage.css'
import '@/styles/bigscreen-content.css'

const scene = useSceneStore()
const bigscreen = useBigscreenStore()
// 解构成顶层 ref，确保模板 v-if / 插值能正确解包（嵌套在普通对象里不会自动解包）
const { isEmpty: dataEmpty } = useDataMode()

/* ============================ 屏号切换 ============================ */
const screen = ref<ScreenNo>(1)
function go(no: ScreenNo): void {
  screen.value = no
}

/* ============================ 等比缩放 ============================ */
// --bs-scale = min(vw/1920, vh/1080) 实时注入 .bs-stage（参考页 fit() L5345）
const scale = ref(1)
function fit(): void {
  scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
}
onMounted(() => {
  fit()
  window.addEventListener('resize', fit)
})
onBeforeUnmount(() => window.removeEventListener('resize', fit))

/* ============================ 后台样式 DIY ============================ */
// 把当前系统配置转成根元素行内 CSS 变量，覆盖 :root 设计令牌（不影响数据联动）
const styleVars = computed<Record<string, string>>(() => {
  const s = bigscreen.config?.style
  return s ? styleToCssVars(s) : {}
})

/* ============================ 场景初始化 ============================ */
// 根因修复（同改造前）：大屏挂载即初始化，使 3D 能读取后台上传的 model_url / 楼栋锚点 / 楼栋列表。
onMounted(async () => {
  await scene.init()
  await scene.loadSchema()
})

// 楼层钻取（点击 3D 楼层标签 → 抽屉列出该层设备）
function onFloorClick(p: { buildingId: string; floor: number }): void {
  scene.openFloorDrill(p.buildingId, p.floor)
}

/* ============================ 相机预设飞行（GK-07） ============================ */
const threeRef = ref<{ flyToPreset?: (presetId: string) => boolean } | null>(null)
let lastCameraPresetSeq = 0
watch(
  () => scene.pendingCameraPreset,
  (req) => {
    if (!req || req.seq === lastCameraPresetSeq) return
    lastCameraPresetSeq = req.seq
    threeRef.value?.flyToPreset?.(req.presetId)
  },
)

/* ============================ 聚焦隐藏（GK-14） ============================ */
// 子系统 focus 场景隐藏非成员 widget（仅当 hidden 集合非空时生效；默认 overview 全显）。
// 作用域限定 .bs-stage 内，避免影响后台预览页。
const scenarioHiddenSet = computed(() => new Set(scene.scenarioHiddenWidgetIds))
function applyScenarioFocusHide(): void {
  const set = scenarioHiddenSet.value
  if (set.size === 0) {
    document
      .querySelectorAll('[data-hud-id].kp-scenario-hidden')
      .forEach((el) => el.classList.remove('kp-scenario-hidden'))
    return
  }
  document.querySelectorAll<HTMLElement>('[data-hud-id]').forEach((el) => {
    const id = el.getAttribute('data-hud-id')
    el.classList.toggle('kp-scenario-hidden', !!id && set.has(id))
  })
}
watch(() => scene.scenarioHiddenWidgetIds, applyScenarioFocusHide)
onMounted(applyScenarioFocusHide)

/* ============================ 子系统聚焦高亮 ============================ */
// 仅图1 透出 3D 时显示全屏描边 + 角标（图2-7 为平面屏，无需 3D 聚焦高亮）
const activeSubsystemColor = computed(() => {
  const code = scene.activeSubsystem
  if (!code || code === 'overview') return null
  const meta = SUBSYSTEMS.find((s) => s.code === code)
  return meta ? `var(${meta.colorVar})` : 'var(--kp-accent)'
})
const activeSubsystemName = computed(() => {
  const code = scene.activeSubsystem
  if (!code || code === 'overview') return null
  return scene.subsystemName(code)
})
const activeSubsystemNameEn = computed(() => {
  const code = scene.activeSubsystem
  if (!code || code === 'overview') return null
  return scene.subsystemNameEn(code)
})
</script>

<template>
  <div class="bs-shell" :style="styleVars">
    <div class="bs-shell__halo" aria-hidden="true" />

    <div class="bs-stage" :style="{ '--bs-scale': scale }">
      <!-- 全屏 3D 背景层（z1）：图1 透出；图2-7 由 .bs-screen--flat 实底遮住 -->
      <div class="bs-scene">
        <ThreeViewer ref="threeRef" @floor-click="onFloorClick" />
      </div>

      <!-- 科技网格叠层（图1 透出 3D 之上） -->
      <div class="bs-stage__grid" aria-hidden="true" />

      <!-- 顶栏：7 屏 tab + 数据模式徽章 -->
      <BsTopNav :active="screen" @select="go" />

      <!-- 7 屏容器 -->
      <ScreenHero :active="screen === 1" @drill="go" />
      <ScreenHvac :active="screen === 2" />
      <ScreenElevator :active="screen === 3" />
      <ScreenPower :active="screen === 4" />
      <ScreenAlarm :active="screen === 5" />
      <ScreenAsset :active="screen === 6" />
      <ScreenArea :active="screen === 7" />

      <!-- 子系统聚焦高亮（仅图1） -->
      <div
        v-if="activeSubsystemColor && screen === 1"
        class="scene-focus"
        :style="{ '--focus-color': activeSubsystemColor }"
      >
        <span class="scene-focus__tag">
          <span class="scene-focus__dot" />
          {{ activeSubsystemName
          }}<span v-if="activeSubsystemNameEn"> · {{ activeSubsystemNameEn }}</span> 聚焦
        </span>
      </div>

      <!-- 无数据空态遮罩（empty 模式：全屏遮罩 + 数值置 --） -->
      <div v-if="dataEmpty" class="nodatamask">
        暂无数据接入
        <small>当前为「未接入数据」模式 · 数值以 -- 占位 · 点击左上角徽章切换演示 / 联机态</small>
      </div>
    </div>

    <!-- 全局弹层（脱离舞台缩放，固定视口） -->
    <DeviceDetailDrawer />
    <FloorDrillDrawer
      :building-id="scene.floorDrill.buildingId"
      :floor="scene.floorDrill.floor"
      @close="scene.closeFloorDrill"
    />
  </div>
</template>

<style scoped>
/* 子系统聚焦高亮（图1 全屏覆盖，居中角标；z 低于顶栏 z60，高于屏 z10） */
.scene-focus {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  border: 1px solid var(--focus-color);
  box-shadow: inset 0 0 30px color-mix(in srgb, var(--focus-color) 22%, transparent);
  border-radius: var(--kp-radius-md);
}
.scene-focus__tag {
  position: absolute;
  top: calc(var(--kp-topnav-h) + 12px);
  left: 52px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: var(--kp-text-xs);
  letter-spacing: 1px;
  color: var(--focus-color);
  background: color-mix(in srgb, var(--focus-color) 14%, transparent);
  border: 1px solid var(--focus-color);
  border-radius: var(--kp-radius-pill);
  text-shadow: 0 0 8px var(--focus-color);
}
.scene-focus__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--focus-color);
  box-shadow: 0 0 8px var(--focus-color);
}
</style>

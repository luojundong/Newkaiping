<script setup lang="ts">
/**
 * Bld6FloorTabs.vue — 6 号楼「后勤大楼」3D 楼层切换浮层（参考页 floor-tabs 迁移）。
 *
 * 仅当 selectedBuilding==='6' 时显示（挂载于 ScreenHero，仅屏1 透出 3D 时可见）。
 * - 「整楼」→ scene.closeFloorDrill()（露出整栋 hql-building.glb）+ 飞回建筑 overview 预设；
 * - F1 / F2 / F3 → scene.openFloorDrill('6', n)（加载对应 hql-fN.glb + 打开真实数据钻取抽屉 + 相机飞行）。
 * 与 3D「点击整栋模型按世界 Y 跳楼层」共用同一 openFloorDrill 状态，Tab 高亮即联动。
 *
 * P0：零硬编码色（仅令牌）；图标只用 lucide-vue-next，禁 emoji。
 */
import { computed } from 'vue'
import { LayoutGrid } from 'lucide-vue-next'
import { useSceneStore } from '@/stores/scene'
import { presetIdForBuilding } from '@/lib/cameraPreset'

const props = defineProps<{ active: boolean }>()

const scene = useSceneStore()
const visible = computed(() => props.active && scene.selectedBuilding === '6')
const bldName = computed(() => scene.buildings.find((b) => b.id === '6')?.name || '后勤楼')

const activeFloor = computed<number | null>(() =>
  scene.floorDrill.buildingId === '6' && typeof scene.floorDrill.floor === 'number'
    ? scene.floorDrill.floor
    : null,
)

const floors: { label: string; floor: number | null }[] = [
  { label: '整楼', floor: null },
  { label: 'F1', floor: 1 },
  { label: 'F2', floor: 2 },
  { label: 'F3', floor: 3 },
]

function pick(floor: number | null): void {
  if (floor === null) {
    scene.closeFloorDrill()
    scene.requestCameraPreset(presetIdForBuilding('6'))
  } else {
    scene.openFloorDrill('6', floor)
  }
}
</script>

<template>
  <div v-if="visible" class="bld6-tabs">
    <div class="bld6-tabs__title">{{ bldName }} · 楼层</div>
    <div class="bld6-tabs__row">
      <button
        v-for="t in floors"
        :key="t.label"
        class="bld6-tab"
        :class="{
          on:
            (t.floor === null && activeFloor === null) ||
            t.floor === activeFloor,
        }"
        @click="pick(t.floor)"
      >
        <LayoutGrid v-if="t.floor === null" :size="14" />
        <span>{{ t.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bld6-tabs {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 92px;
  z-index: 55;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
}
.bld6-tabs__title {
  font-size: var(--kp-text-xs);
  letter-spacing: 2px;
  color: var(--kp-fg-muted);
  text-shadow: 0 0 8px var(--kp-glow);
}
.bld6-tabs__row {
  display: flex;
  gap: 6px;
  padding: 5px;
  background: rgba(var(--kp-bg-rgb), 0.62);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-md);
  backdrop-filter: blur(6px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
.bld6-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  font-size: var(--kp-text-sm);
  font-weight: 560;
  letter-spacing: 1px;
  color: var(--kp-fg-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.bld6-tab:hover {
  color: var(--kp-fg);
  border-color: var(--kp-border-strong);
}
.bld6-tab.on {
  color: var(--kp-accent);
  background: rgba(var(--kp-accent-rgb), 0.12);
  border-color: var(--kp-accent);
  box-shadow: 0 0 12px var(--kp-glow);
}
</style>

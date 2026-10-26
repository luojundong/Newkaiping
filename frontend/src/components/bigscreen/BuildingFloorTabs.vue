<script setup lang="ts">
/**
 * BuildingFloorTabs.vue — 楼层 3D 切换浮层（泛化版，原 Bld6FloorTabs）
 *
 * 仅当 active（屏1 透出 3D）且 选中楼栋在 FLOOR_MODELS 有楼层模型映射时显示。
 * 列出该楼「有模型的楼层」F1..FN，点击 → scene.openFloorDrill(buildingId, floor)
 * （加载对应楼层 GLB + 打开真实数据钻取抽屉 + 相机飞行）。
 * 「整楼」→ closeFloorDrill + 飞回建筑 overview 预设。
 * 与 3D「点击整栋模型按世界 Y 跳楼层」共用同一 openFloorDrill 状态，Tab 高亮即联动。
 *
 * P0：零硬编码色（仅令牌）；图标只用 lucide-vue-next，禁 emoji。
 */
import { computed } from 'vue'
import { LayoutGrid } from 'lucide-vue-next'
import { useSceneStore } from '@/stores/scene'
import { presetIdForBuilding } from '@/lib/cameraPreset'
import { FLOOR_MODELS } from '@/lib/floorModels'

const props = defineProps<{ active: boolean }>()

const scene = useSceneStore()
const bid = computed(() => scene.selectedBuilding)
// 该楼在 FLOOR_MODELS 中有映射的楼层（按楼层号升序）
const floorModels = computed(() =>
  FLOOR_MODELS.filter((m) => String(m.buildingId) === String(bid.value)).sort((a, b) => a.floor - b.floor),
)
// 仅屏1 透出 3D 且 选中楼栋确有楼层模型时显示（6 号楼全 3 层；4 号楼仅 F1；其余楼无映射则不显示）
const visible = computed(() => props.active && !!bid.value && floorModels.value.length > 0)
const bldName = computed(() => scene.buildings.find((b) => b.id === bid.value)?.name || '')

const activeFloor = computed<number | null>(() =>
  scene.floorDrill.buildingId === bid.value && typeof scene.floorDrill.floor === 'number'
    ? scene.floorDrill.floor
    : null,
)

const floors = computed<{ label: string; floor: number | null }[]>(() => [
  { label: '整楼', floor: null },
  ...floorModels.value.map((m) => ({ label: 'F' + m.floor, floor: m.floor })),
])

function pick(floor: number | null): void {
  if (!bid.value) return
  if (floor === null) {
    scene.closeFloorDrill()
    scene.requestCameraPreset(presetIdForBuilding(bid.value))
  } else {
    scene.openFloorDrill(bid.value, floor)
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

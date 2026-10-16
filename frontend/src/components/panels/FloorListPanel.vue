<script setup lang="ts">
/**
 * FloorListPanel.vue — GK-28 大屏左侧楼层列表
 *
 * 形态：固定在大屏左侧中部，仅当选中某楼栋（scene.selectedBuilding != null）时显示。
 * 内容：F1~FN 按钮（N = 该楼栋 buildings.floors 真实值，来源 /api/v1/buildings，不硬编码），
 *  **从下往上排列**（F1 在最底部、FN 在最顶部）；纵向空间不足时自动换行到下一列，
 *  整体仍保持「自下而上」的阅读顺序（DOM 顺序 F1..FN，CSS column-reverse 使 F1 视觉在底）。
 * 功能：
 *  - 点击 Fx → scene.openFloorDrill(buildingId, x)（复用 GK-30 楼层钻取链路：FloorDrillDrawer 弹出 + 真实楼层模型加载）；
 *  - 当前钻取楼层高亮（floorDrill.buildingId/floor 命中）。
 */
import { computed } from 'vue'
import { Layers } from 'lucide-vue-next'
import { useSceneStore } from '@/stores/scene'
import { useI18nStore } from '@/stores/i18n'

const scene = useSceneStore()
const { t } = useI18nStore()

const selectedId = computed(() => scene.selectedBuilding)
// 仅当选中楼栋时显示
const visible = computed(() => !!selectedId.value)

const selectedBuilding = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return scene.buildings.find((b) => b.id === id) || null
})

// 楼层数来源：/api/v1/buildings 返回的 floors 字段（store.buildings 已由 buildingApi.list 拉取）。
// 严禁硬编码：直接取 building.floors。
const floorCount = computed(() => selectedBuilding.value?.floors ?? 0)

// F1..FN（DOM 顺序 1..N；CSS column-reverse 负责「F1 在底、FN 在顶」的视觉排布）
const floors = computed<number[]>(() => {
  const n = floorCount.value
  const arr: number[] = []
  for (let i = 1; i <= n; i++) arr.push(i)
  return arr
})

const selectedFloor = computed(() => {
  const fd = scene.floorDrill
  return fd.buildingId === selectedId.value ? fd.floor : null
})

function onFloorClick(f: number) {
  if (!selectedId.value) return
  scene.openFloorDrill(selectedId.value, f)
}
</script>

<template>
  <aside
    v-if="visible"
    class="floor-list-panel"
    data-hud-id="floor-list"
    aria-label="楼层列表"
  >
    <header class="fl-panel__head">
      <Layers :size="14" />
      <span class="fl-panel__title">{{ selectedBuilding?.name }}</span>
      <span class="fl-panel__count">{{ floorCount }}{{ t('层', 'F') }}</span>
    </header>

    <div class="fl-panel__floors">
      <button
        v-for="f in floors"
        :key="f"
        type="button"
        class="fl-btn"
        :class="{ 'is-active': selectedFloor === f }"
        :data-floor="f"
        @click="onFloorClick(f)"
      >
        F{{ f }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.floor-list-panel {
  position: fixed;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  width: 138px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kp-border-strong, #1c3a52);
  border-radius: var(--kp-radius-md, 8px);
  background: linear-gradient(180deg, rgba(11, 24, 39, 0.92), rgba(4, 16, 31, 0.92));
  box-shadow: 0 0 20px rgba(var(--kp-accent-rgb), 0.18), inset 0 0 28px rgba(var(--kp-accent-rgb), 0.05);
  backdrop-filter: blur(2px);
  color: var(--kp-fg, #cfe8f5);
  pointer-events: auto;
}

.fl-panel__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 8px;
  margin-bottom: 8px;
  font-size: var(--kp-text-sm, 12px);
  color: var(--kp-fg, #dcefff);
  border-bottom: 1px solid var(--kp-border, #14364c);
}
.fl-panel__head svg {
  color: var(--kp-accent);
}
.fl-panel__title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fl-panel__count {
  font-family: var(--kp-font-mono, monospace);
  font-size: 11px;
  color: var(--kp-accent);
  flex-shrink: 0;
}

/* 自底向上排列：column-reverse 使首个 DOM 子节点（F1）落在最底部、末节点（FN）在最顶部；
   flex-wrap:wrap + 受限高度 → 列满后自动换行到右侧下一列，每列仍自底向上（整体阅读顺序不变）。 */
.fl-panel__floors {
  display: flex;
  flex-direction: column-reverse;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px;
  max-height: calc(100vh - 260px);
  overflow: visible;
}

.fl-btn {
  display: grid;
  place-items: center;
  width: 38px;
  height: 26px;
  border: 1px solid var(--kp-border, #14364c);
  border-radius: 5px;
  background: rgba(var(--kp-accent-rgb), 0.04);
  font-family: var(--kp-font-mono, monospace);
  font-size: 11px;
  color: var(--kp-fg, #cfe8f5);
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.fl-btn:hover {
  background: var(--kp-glow-soft, rgba(var(--kp-accent-rgb), 0.14));
  border-color: var(--kp-accent);
  color: var(--kp-accent);
}
.fl-btn.is-active {
  background: var(--kp-accent);
  color: #04101f;
  border-color: var(--kp-accent);
  box-shadow: 0 0 10px rgba(var(--kp-accent-rgb), 0.5);
}
</style>

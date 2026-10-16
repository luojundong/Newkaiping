<script setup lang="ts">
/**
 * TopBuildingNav.vue — GK-28 大屏顶部楼栋导航
 *
 * 形态：固定在大屏顶部（标题栏下方、居中），横向一排 10 栋楼名称按钮（Tab 式）。
 * 功能：
 *  - 列出全部可见楼栋（来自 scene.visibleBuildings，即 /api/v1/buildings 返回且 status!=='inactive'）；
 *  - 点击楼栋 → scene.selectBuilding(id)（SceneRenderer 的 selectedBuilding watch 自动飞 preset_bldg_<id>_overview）；
 *    再次点击已选中楼栋 → 取消选中并回院区全景（selectedBuilding=null + requestCameraPreset 哨兵触发 resetDefaultView）；
 *  - 「全院总览」按钮：取消当前选中、回院区全景（不带 data-bid，不计入楼栋按钮计数）；
 *  - 当前选中楼栋高亮（active class + data-bid）。
 * 与 GK-21 左侧楼栋导航面板互斥：该面板已被本顶部导航取代，BigScreenLayout 不再挂载 BuildingNavPanel。
 * 数据全部来自 scene store，不另拉接口；楼栋名/楼层数均来自后端 buildings 真实字段。
 */
import { computed } from 'vue'
import { Building2 } from 'lucide-vue-next'
import { useSceneStore } from '@/stores/scene'
import { useI18nStore } from '@/stores/i18n'

const scene = useSceneStore()
const { t } = useI18nStore()

// 全部可见楼栋（status !== 'inactive'；后端返回 10 栋，id 1~10）
const buildings = computed(() => scene.visibleBuildings)

const selectedId = computed(() => scene.selectedBuilding)

function onBuildingClick(b: { id: string }) {
  if (selectedId.value === b.id) {
    // 再次点击已选中楼栋 → 取消选中，回院区全景
    scene.closeFloorDrill()
    scene.selectBuilding(null)
    // 哨兵 preset id 不存在 → SceneRenderer flyToPreset 回退 resetDefaultView（院区全景）
    scene.requestCameraPreset('preset_overview')
  } else {
    scene.selectBuilding(b.id)
  }
}

function onAllClick() {
  if (!selectedId.value) return
  scene.closeFloorDrill()
  scene.selectBuilding(null)
  scene.requestCameraPreset('preset_overview')
}
</script>

<template>
  <nav class="top-bldg-nav" aria-label="楼栋导航">
    <span class="top-bldg-nav__lead">
      <Building2 :size="15" />
      <span>{{ t('楼栋', 'Buildings') }}</span>
    </span>

    <button
      v-for="b in buildings"
      :key="b.id"
      type="button"
      class="bldg-tab"
      :class="{ active: selectedId === b.id }"
      :data-bid="b.id"
      :title="b.name"
      @click="onBuildingClick(b)"
    >
      {{ b.name }}
    </button>

    <button
      type="button"
      class="bldg-tab bldg-tab--all"
      :class="{ active: !selectedId }"
      @click="onAllClick"
    >
      {{ t('全院', 'All') }}
    </button>
  </nav>
</template>

<style scoped>
.top-bldg-nav {
  position: fixed;
  top: calc(var(--kp-header-h, 110px) + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  max-width: min(94vw, 1180px);
  padding: 6px 12px;
  border: 1px solid var(--kp-border-strong, #1c3a52);
  border-radius: var(--kp-radius-md, 8px);
  background: linear-gradient(180deg, rgba(11, 24, 39, 0.92), rgba(4, 16, 31, 0.92));
  box-shadow: 0 0 18px rgba(var(--kp-accent-rgb), 0.16), inset 0 0 24px rgba(var(--kp-accent-rgb), 0.05);
  backdrop-filter: blur(2px);
  color: var(--kp-fg, #cfe8f5);
  /* 根容器接管事件（整条导航条可交互）；空白区不穿透（与 3D 拖拽区隔离） */
  pointer-events: auto;
}

.top-bldg-nav__lead {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-right: 4px;
  padding: 0 6px 0 2px;
  font-size: var(--kp-text-xs, 12px);
  letter-spacing: 2px;
  color: var(--kp-fg-muted, #7fa6bd);
  border-right: 1px solid var(--kp-border, #14364c);
}
.top-bldg-nav__lead svg {
  color: var(--kp-accent);
}

.bldg-tab {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--kp-border, #14364c);
  border-radius: var(--kp-radius-pill, 999px);
  background: rgba(var(--kp-accent-rgb), 0.04);
  color: var(--kp-fg-muted, #7fa6bd);
  font-size: var(--kp-text-xs, 12px);
  letter-spacing: 0.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--kp-motion-fast, 0.16s) var(--kp-ease-standard, ease);
}
.bldg-tab:hover {
  color: var(--kp-fg, #dcefff);
  border-color: var(--kp-border-strong, #1c3a52);
  background: var(--kp-glow-soft, rgba(var(--kp-accent-rgb), 0.12));
}
.bldg-tab.active {
  color: var(--kp-accent);
  background: linear-gradient(180deg, rgba(var(--kp-accent-rgb), 0.22), rgba(var(--kp-accent-rgb), 0.05));
  border-color: var(--kp-accent);
  box-shadow: 0 0 12px rgba(var(--kp-accent-rgb), 0.35), inset 0 0 10px rgba(var(--kp-accent-rgb), 0.12);
}
.bldg-tab--all {
  color: var(--kp-fg-muted, #7fa6bd);
}
.bldg-tab--all.active {
  color: var(--kp-accent);
}
</style>

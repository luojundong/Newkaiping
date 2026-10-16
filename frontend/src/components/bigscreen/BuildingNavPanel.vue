<script setup lang="ts">
/**
 * BuildingNavPanel.vue — GK-21 大屏左侧楼栋导航面板
 *
 * 形态：固定在大屏左侧（不遮挡中间 3D 画布），宽度 ~220px，可折叠为细栏。
 * 功能：
 *  - 列出全部楼栋：楼栋名 + 楼层数（来自 buildingDisplay.floors_by_building，与楼层列表口径一致）+ 面积（buildings.gross_area）；
 *  - 点击楼栋 → scene.selectBuilding(id)（SceneRenderer 的 selectedBuilding watch 自动飞 preset_bldg_<id>_overview）；
 *    再次点击已选中楼栋 → 取消选中并回院区全景（selectedBuilding=null + requestCameraPreset 哨兵触发 resetDefaultView）；
 *  - 选中后展开该楼楼层列表（来自 floors_by_building[bid]），点击楼层 → openFloorDrill（GK-22 的 FloorDrillDrawer 监听 floorDrill）；
 *  - 楼栋搜索框 + 楼层搜索框（楼层多，需可筛）。
 * 数据全部来自 scene store，不另拉接口。
 */
import { computed, ref } from 'vue'
import { Building2, Search, Layers, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { useSceneStore } from '@/stores/scene'
import { useI18nStore } from '@/stores/i18n'

const scene = useSceneStore()
const { t } = useI18nStore()

const collapsed = ref(false)
const buildingFilter = ref('')
const floorFilter = ref('')

// 全部楼栋（status 不论；后端返回 10 栋）
const allBuildings = computed(() => scene.buildings)

// 楼栋过滤（按名称 / 楼层数 / 面积）
const filteredBuildings = computed(() => {
  const q = buildingFilter.value.trim().toLowerCase()
  if (!q) return allBuildings.value
  return allBuildings.value.filter((b) => {
    const fc = floorCountOf(b.id)
    const area = b.gross_area
    return (
      (b.name || '').toLowerCase().includes(q) ||
      String(fc).includes(q) ||
      (area != null && String(area).includes(q))
    )
  })
})

const selectedId = computed(() => scene.selectedBuilding)

// 楼栋楼层数：优先 floors_by_building 配置（与楼层列表、GK-19 口径一致），缺失回退 buildings.floors
function floorCountOf(bid: string): number {
  const fb = scene.buildingDisplay?.floors_by_building
  const list = fb && fb[bid]
  if (list && list.length) return list.length
  const b = scene.buildings.find((x) => x.id === bid)
  return b ? b.floors : 0
}

// 楼栋楼层列表（来自 floors_by_building[bid]）
function floorsOf(bid: string) {
  const fb = scene.buildingDisplay?.floors_by_building
  return (fb && fb[bid]) || []
}

const filteredFloors = computed(() => {
  if (!selectedId.value) return []
  const list = floorsOf(selectedId.value)
  const q = floorFilter.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (f) => (f.label || '').toLowerCase().includes(q) || String(f.index).includes(q),
  )
})

const selectedBuildingName = computed(() => {
  const b = scene.buildings.find((x) => x.id === selectedId.value)
  return b ? b.name : ''
})

function formatArea(a: number | null | undefined): string {
  if (a == null || Number.isNaN(Number(a))) return '—'
  const n = Number(a)
  if (n === 0) return '—'
  return `${n.toLocaleString('zh-CN')} m²`
}

function onBuildingClick(b: { id: string }) {
  if (selectedId.value === b.id) {
    // 再次点击已选中楼栋 → 取消选中，回院区全景
    scene.closeFloorDrill()
    scene.selectBuilding(null)
    // 哨兵 preset id 不存在 → SceneRenderer flyToPreset 回退 resetDefaultView（院区全景）
    scene.requestCameraPreset('preset_overview')
    floorFilter.value = ''
  } else {
    scene.selectBuilding(b.id)
  }
}

function onFloorClick(f: { index: number; label: string }) {
  if (!selectedId.value) return
  scene.openFloorDrill(selectedId.value, f.index)
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside
    class="bldg-nav"
    :class="{ 'bldg-nav--collapsed': collapsed }"
    data-hud-id="building-nav"
  >
    <!-- 折叠态：仅留一条带图标的细栏 -->
    <button
      v-if="collapsed"
      class="bldg-nav__rail"
      type="button"
      :title="t('展开楼栋导航', 'Expand building nav')"
      @click="toggleCollapse"
    >
      <Building2 :size="20" />
    </button>

    <!-- 展开态 -->
    <template v-else>
      <header class="bldg-nav__head">
        <span class="bldg-nav__title">
          <Building2 :size="16" />
          <span>{{ t('楼栋导航', 'Buildings') }}</span>
        </span>
        <button
          class="bldg-nav__collapse"
          type="button"
          :title="t('折叠', 'Collapse')"
          @click="toggleCollapse"
        >
          <PanelLeftClose :size="16" />
        </button>
      </header>

      <!-- 楼栋搜索 -->
      <div class="bldg-nav__search">
        <Search :size="14" class="bldg-nav__search-icon" />
        <input
          v-model="buildingFilter"
          class="bldg-nav__search-input"
          type="text"
          :placeholder="t('搜索楼栋 / 楼层 / 面积', 'Search building / floor / area')"
        />
      </div>

      <!-- 楼栋列表 -->
      <ul class="bldg-nav__list">
        <li
          v-for="b in filteredBuildings"
          :key="b.id"
          class="bldg-nav__item"
          :class="{ 'is-active': selectedId === b.id }"
          :data-bid="b.id"
          @click="onBuildingClick(b)"
        >
          <span class="bldg-nav__item-main">
            <span class="bldg-nav__item-name">{{ b.name }}</span>
            <span class="bldg-nav__item-floors">{{ floorCountOf(b.id) }}F</span>
          </span>
          <span class="bldg-nav__item-area">{{ formatArea(b.gross_area) }}</span>
          <ChevronRight
            v-if="selectedId === b.id"
            :size="14"
            class="bldg-nav__item-chev"
          />
        </li>
        <li v-if="!filteredBuildings.length" class="bldg-nav__empty">
          {{ t('无匹配楼栋', 'No matching building') }}
        </li>
      </ul>

      <!-- 选中楼栋的楼层列表 -->
      <section v-if="selectedId" class="bldg-nav__floors">
        <header class="bldg-nav__floors-head">
          <Layers :size="14" />
          <span class="bldg-nav__floors-title">{{ selectedBuildingName }}</span>
          <span class="bldg-nav__floors-count">{{ filteredFloors.length }}{{ t('层', 'F') }}</span>
        </header>
        <div class="bldg-nav__search bldg-nav__search--floor">
          <Search :size="14" class="bldg-nav__search-icon" />
          <input
            v-model="floorFilter"
            class="bldg-nav__search-input"
            type="text"
            :placeholder="t('筛选楼层', 'Filter floor')"
          />
        </div>
        <ul class="bldg-nav__floor-list">
          <li
            v-for="f in filteredFloors"
            :key="f.index"
            class="bldg-nav__floor"
            :class="{ 'is-active': scene.floorDrill.buildingId === selectedId && scene.floorDrill.floor === f.index }"
            :data-floor="f.index"
            @click="onFloorClick(f)"
          >
            {{ f.label }}
          </li>
          <li v-if="!filteredFloors.length" class="bldg-nav__empty">
            {{ t('无匹配楼层', 'No matching floor') }}
          </li>
        </ul>
      </section>
    </template>
  </aside>
</template>

<style scoped>
.bldg-nav {
  position: fixed;
  left: 10px;
  top: calc(var(--kp-header-h, 110px) + 10px);
  bottom: 10px;
  width: 220px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  padding: 10px;
  border: 1px solid var(--kp-border-strong, #1c3a52);
  border-radius: var(--kp-radius-md, 8px);
  background: linear-gradient(180deg, rgba(11, 24, 39, 0.92), rgba(4, 16, 31, 0.92));
  box-shadow: 0 0 20px rgba(var(--kp-accent-rgb), 0.18), inset 0 0 28px rgba(var(--kp-accent-rgb), 0.05);
  backdrop-filter: blur(2px);
  color: var(--kp-fg, #cfe8f5);
  /* 根容器 pointer-events:none：仅交互控件（按钮/搜索/楼栋项/楼层项）接管事件，
     空白区与楼栋项间隙穿透到 3D 画布，避免遮挡中间 3D 的楼栋拾取/轨道（与 LeftPanel/RightPanel 浮层一致）。 */
  pointer-events: none;
  overflow: hidden;
}

/* 折叠细栏 */
.bldg-nav--collapsed {
  width: 44px;
  padding: 8px 0;
  align-items: center;
}
.bldg-nav__rail {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--kp-border-strong, #1c3a52);
  border-radius: var(--kp-radius-md, 8px);
  background: rgba(var(--kp-accent-rgb), 0.06);
  color: var(--kp-accent);
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.18s ease;
}
.bldg-nav__rail:hover {
  background: rgba(var(--kp-accent-rgb), 0.16);
}

.bldg-nav__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 4px 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--kp-border, #14364c);
  pointer-events: auto;
}
.bldg-nav__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--kp-text-md, 14px);
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--kp-fg, #e6f6ff);
  text-shadow: 0 0 10px var(--kp-glow, rgba(var(--kp-accent-rgb), 0.5));
}
.bldg-nav__title svg {
  color: var(--kp-accent);
  filter: drop-shadow(0 0 4px var(--kp-glow, rgba(var(--kp-accent-rgb), 0.5)));
}
.bldg-nav__collapse {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--kp-fg-muted, #7fa6bd);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s ease, color 0.15s ease;
}
.bldg-nav__collapse:hover {
  background: var(--kp-glow-soft, rgba(var(--kp-accent-rgb), 0.1));
  color: var(--kp-accent);
}

/* 搜索框 */
.bldg-nav__search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  pointer-events: auto;
}
.bldg-nav__search-icon {
  position: absolute;
  left: 8px;
  color: var(--kp-fg-muted, #7fa6bd);
  pointer-events: none;
}
.bldg-nav__search-input {
  width: 100%;
  height: 30px;
  padding: 0 8px 0 28px;
  border: 1px solid var(--kp-border, #14364c);
  border-radius: 6px;
  background: rgba(2, 12, 24, 0.7);
  color: var(--kp-fg, #cfe8f5);
  font-size: var(--kp-text-sm, 12px);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.bldg-nav__search-input::placeholder {
  color: var(--kp-fg-subtle, #4f7790);
}
.bldg-nav__search-input:focus {
  border-color: var(--kp-accent);
  box-shadow: 0 0 8px rgba(var(--kp-accent-rgb), 0.35);
}

/* 楼栋列表 */
.bldg-nav__list {
  list-style: none;
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
}
.bldg-nav__item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(var(--kp-accent-rgb), 0.04);
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.bldg-nav__item:hover {
  background: var(--kp-glow-soft, rgba(var(--kp-accent-rgb), 0.12));
  border-color: var(--kp-border, #14364c);
}
.bldg-nav__item.is-active {
  background: linear-gradient(90deg, rgba(var(--kp-accent-rgb), 0.22), rgba(var(--kp-accent-rgb), 0.05));
  border-color: var(--kp-accent);
  box-shadow: 0 0 12px rgba(var(--kp-accent-rgb), 0.35), inset 0 0 10px rgba(var(--kp-accent-rgb), 0.12);
}
.bldg-nav__item-main {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}
.bldg-nav__item-name {
  font-size: var(--kp-text-sm, 12px);
  color: var(--kp-fg, #dcefff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bldg-nav__item-floors {
  font-family: var(--kp-font-mono, monospace);
  font-size: 11px;
  color: var(--kp-accent);
  flex-shrink: 0;
}
.bldg-nav__item-area {
  font-family: var(--kp-font-mono, monospace);
  font-size: 10px;
  color: var(--kp-fg-muted, #7fa6bd);
  text-align: right;
  white-space: nowrap;
}
.bldg-nav__item-chev {
  color: var(--kp-accent);
}
.bldg-nav__empty {
  list-style: none;
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: var(--kp-fg-muted, #7fa6bd);
}

/* 楼层列表 */
.bldg-nav__floors {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  max-height: 44%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--kp-border, #14364c);
}
.bldg-nav__floors-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 6px;
  font-size: var(--kp-text-sm, 12px);
  color: var(--kp-fg, #dcefff);
}
.bldg-nav__floors-head svg {
  color: var(--kp-accent);
}
.bldg-nav__floors-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bldg-nav__floors-count {
  font-family: var(--kp-font-mono, monospace);
  font-size: 11px;
  color: var(--kp-accent);
}
.bldg-nav__search--floor {
  margin-bottom: 6px;
}
.bldg-nav__floor-list {
  list-style: none;
  flex: 1 1 auto;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin: 0;
  padding: 0;
}
.bldg-nav__floor {
  display: grid;
  place-items: center;
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
.bldg-nav__floor:hover {
  background: var(--kp-glow-soft, rgba(var(--kp-accent-rgb), 0.14));
  border-color: var(--kp-accent);
  color: var(--kp-accent);
}
.bldg-nav__floor.is-active {
  background: var(--kp-accent);
  color: #04101f;
  border-color: var(--kp-accent);
  box-shadow: 0 0 10px rgba(var(--kp-accent-rgb), 0.5);
}

/* 细滚动条 */
.bldg-nav__list::-webkit-scrollbar,
.bldg-nav__floor-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.bldg-nav__list::-webkit-scrollbar-thumb,
.bldg-nav__floor-list::-webkit-scrollbar-thumb {
  background: rgba(var(--kp-accent-rgb), 0.3);
  border-radius: 3px;
}
</style>

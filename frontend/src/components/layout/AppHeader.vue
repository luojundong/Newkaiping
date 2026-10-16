<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Gauge,
  ClipboardList,
  Fan,
  Lightbulb,
  Zap,
  Droplet,
  MoveVertical,
  LayoutDashboard,
  Languages,
  Palette,
  User,
  LogOut,
  RefreshCw,
  ChevronDown,
} from 'lucide-vue-next'
import { KP_ACCENT } from '@/lib/kp-accent'
import { useSceneStore } from '@/stores/scene'
import { useUserStore } from '@/stores/user'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useI18nStore } from '@/stores/i18n'
import { SUBSYSTEMS } from '@/types/scene'
import type { BigscreenHeaderLayout, HeaderModuleKey, HeaderModulePos, HeaderSlot } from '@/types/api'

const scene = useSceneStore()
const user = useUserStore()
const bigscreen = useBigscreenStore()
const i18n = useI18nStore()
const { t: T, locale } = i18n

// 大屏标题：后台可自定义（标题名 + 字号），缺省回退默认名
const displayTitle = computed(
  () => bigscreen.config?.title || '开平市中心医院能源管理平台',
)
// 大屏英文副标题：后台可自定义，显示在中文标题下方
const displayTitleEn = computed(() => bigscreen.config?.titleEn || '')
// 大屏中英文标题独立显示开关（后台站点配置，默认都开）
const showCn = computed(() => scene.siteConfig?.showChinese !== false)
const showEn = computed(() => scene.siteConfig?.showEnglish !== false)
// 页眉主标题：显示中文优先；关中文且开英文且有英文副标题时显示英文；都关则空
const platformMain = computed(() => {
  if (showCn.value) return displayTitle.value
  if (showEn.value && displayTitleEn.value) return displayTitleEn.value
  return ''
})
const showPlatformSubEn = computed(() => showCn.value && showEn.value && !!displayTitleEn.value)
// 子系统页签标签：按中/英文开关组合
function tabText(tab: { name: string; nameEn: string }): string {
  if (showCn.value && showEn.value) return tab.nameEn ? `${tab.name} ${tab.nameEn}` : tab.name
  if (showCn.value) return tab.name
  if (showEn.value) return tab.nameEn || tab.name
  return tab.name
}
const titleFontSize = computed(() => bigscreen.config?.titleFontSize || 30)

// 顶部布局：后台 DIY（1/2/3 行；platform/clock/tabs/tools 各自分配到某行 + 行内左/中/右；时间可单行/换行）
// 缺省：1 行，平台名左、时钟右、子系统菜单中、工具组右，时间换行。点击子系统菜单不改变平台名。
const headerLayout = computed<BigscreenHeaderLayout>(() => {
  const h = bigscreen.config?.style?.header
  if (h && h.rows) return h
  // 兼容极旧数据（无 rows 字段）
  const fb: BigscreenHeaderLayout = {
    rows: 1,
    platform: { row: 1, slot: 'left' },
    clock: { row: 1, slot: 'right' },
    tabs: { row: 1, slot: 'center' },
    tools: { row: 1, slot: 'right' },
    clockSingleLine: false,
  }
  return h || fb
})
const headerRows = computed<number[]>(() => {
  const n = headerLayout.value.rows || 1
  return Array.from({ length: n }, (_, i) => i + 1)
})
// 把某行的模块按 slot 分配到 start/center/end 三个区
function slotsForRow(row: number): Record<'start' | 'center' | 'end', HeaderModuleKey[]> {
  const h = headerLayout.value
  const toSlot = (s: HeaderSlot) => (s === 'left' ? 'start' : s === 'right' ? 'end' : 'center')
  const map: Record<'start' | 'center' | 'end', HeaderModuleKey[]> = { start: [], center: [], end: [] }
  ;(['platform', 'clock', 'tabs', 'tools'] as HeaderModuleKey[]).forEach((k) => {
    const pos = h[k] as HeaderModulePos
    if (pos && pos.row === row) map[toSlot(pos.slot)].push(k)
  })
  return map
}

// 子系统 lucide 图标映射（ADR-002：全项目唯一图标源）
const SYS_ICONS: Record<string, unknown> = {
  regulation: Gauge,
  lifecycle: ClipboardList,
  hvac: Fan,
  lighting: Lightbulb,
  power: Zap,
  hotwater: Droplet,
  elevator: MoveVertical,
  overview: LayoutDashboard,
}

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => clearInterval(timer))

const clockLocale = computed(() => (i18n.isEn ? 'en-US' : 'zh-CN'))
const clockTime = computed(() =>
  now.value.toLocaleTimeString(clockLocale.value, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
)

// 院区真实地理原点（GIS 定位，后端 /scene/config.geo_origin 驱动）
const geoOrigin = computed(() => scene.sceneConfig?.geo_origin ?? null)
const geoText = computed(() => {
  const g = geoOrigin.value
  if (!g) return ''
  return `${g.address} · ${g.latitude.toFixed(6)}°N, ${g.longitude.toFixed(6)}°E`
})
const clockDate = computed(() => now.value.toLocaleDateString(clockLocale.value, { year: 'numeric', month: '2-digit', day: '2-digit' }))
const clockWeek = computed(() => now.value.toLocaleDateString(clockLocale.value, { weekday: 'long' }))

// 子系统页签：全院显示全部可见；选楼后仅显示该楼 enabled 的（AC-02 隐藏禁用项）
const subsystemTabs = computed(() => {
  const tabs = [
    { code: 'overview', name: scene.subsystemName('overview'), nameEn: scene.subsystemNameEn('overview'), icon: SYS_ICONS.overview },
  ]
  scene.visibleSubsystemCodes.forEach((code) => {
    const meta = SUBSYSTEMS.find((s) => s.code === code)
    if (meta) tabs.push({ code, name: scene.subsystemName(code), nameEn: scene.subsystemNameEn(code), icon: SYS_ICONS[code] })
  })
  return tabs
})

// GK-18：header 8 个 tab = 切换子系统场景（产品决策：点 tab 切子系统/场景，非选楼）。
// tab code 与 schema scenario 的 subsystem 字段一一对应；overview tab = 退出剧本回自由态全显。
// 显式常量映射，避免字符串拼接猜测。
const SUBSYSTEM_TAB_CODES = [
  'overview',
  'regulation',
  'lifecycle',
  'hvac',
  'lighting',
  'power',
  'hotwater',
  'elevator',
] as const

// tab code → 对应子系统剧本引用（subsystem 字段匹配；overview 无对应 focus 剧本）
function scenarioRefForTab(code: string) {
  if (!SUBSYSTEM_TAB_CODES.includes(code as (typeof SUBSYSTEM_TAB_CODES)[number])) return null
  if (code === 'overview') return null
  return scene.scenarios.find((s) => s.subsystem === code) ?? null
}

// tab 高亮态与 activeScenario 双向同步：
// - 子系统剧本激活 → 高亮其 tab（剧本被其他途径激活时 tab 也高亮）
// - 退出剧本（自由态 overview）→ 高亮 overview tab
const activeTabCode = computed<string>(() => {
  if (scene.activeScenarioId && scene.activeScenario) return scene.activeScenario.subsystem as string
  const s = scene.activeSubsystem
  return s === 'overview' || s == null ? 'overview' : (s as string)
})

function pickSubsystem(code: string) {
  if (code === 'overview') {
    // 回自由态 overview：退出当前剧本（停止时间轴 + 清除聚焦隐藏），高亮 overview tab
    if (scene.activeScenarioId === null && scene.activeSubsystem === 'overview') return // 幂等
    scene.exitScenario()
    scene.activeSubsystem = 'overview'
    return
  }
  // 子系统 tab → 切到对应子系统剧本（沿用 tracks 视图/相机轨道驱动，GK-14 atSec 时序）
  const sc = scenarioRefForTab(code)
  if (sc) {
    if (scene.activeScenarioId === sc.id) return // 幂等：已激活则不重复触发
    scene.selectScenario(sc.id)
  } else {
    // schema 未覆盖该子系统时回退旧硬编码路径（保证 tab 仍可高亮 + 数据联动）
    if (scene.activeSubsystem === code) return
    scene.selectSubsystem(code as never)
  }
}

// 主题切换（dark-navy / green / amber）
const themeMenuOpen = ref(false)
const THEMES = [
  { key: 'dark-navy', name: '深蓝指挥舱', nameEn: 'Dark Navy', color: KP_ACCENT },
  { key: 'green', name: '翠绿值守', nameEn: 'Emerald Watch', color: '#1BE5AD' },
  { key: 'amber', name: '琥珀高对比', nameEn: 'Amber High-Contrast', color: '#FFB020' },
] as const
function switchTheme(key: 'dark-navy' | 'green' | 'amber') {
  scene.setTheme(key)
  themeMenuOpen.value = false
}

// 语言切换（中 / EN）
function toggleLang() {
  i18n.toggle()
}
function setLang(l: 'zh' | 'en') {
  i18n.setLocale(l)
}

// 用户菜单
const userMenuOpen = ref(false)
const username = computed(() => user.user?.username || '系统管理员')
function logout() {
  user.logout()
  userMenuOpen.value = false
}

async function refreshData() {
  await scene.init()
}
</script>

<template>
  <header class="app-header" :class="{ 'app-header--multi': headerLayout.rows > 1 }">
    <div class="app-header__bg" />

    <!-- 按行渲染（1/2/3 行，每行内按 slot 分左/中/右） -->
    <div
      v-for="row in headerRows"
      :key="row"
      class="app-header__row"
    >
      <!-- 左区 -->
      <div class="app-header__slot app-header__slot--start">
        <template v-for="el in slotsForRow(row).start" :key="el">
          <div v-if="el === 'platform'" class="app-header__platform-wrap">
            <h1 v-if="platformMain" class="app-header__platform" :style="{ fontSize: titleFontSize + 'px' }">{{ platformMain }}</h1>
            <span v-if="showPlatformSubEn" class="app-header__platform-en">{{ displayTitleEn }}</span>
          </div>
          <div v-else-if="el === 'clock'" :class="headerLayout.clockSingleLine ? 'clock-box clock-box--single' : 'clock-box'">
            <strong class="mono">{{ clockTime }}</strong>
            <span v-if="!headerLayout.clockSingleLine">{{ clockDate }} {{ clockWeek }}</span>
            <span v-else class="clock-sep">{{ clockDate }} {{ clockWeek }}</span>
          </div>
          <nav v-else-if="el === 'tabs'" class="app-header__tabs" aria-label="子系统切换">
            <button
              v-for="tab in subsystemTabs"
              :key="tab.code"
              class="subsystem-tab"
              :data-tab-code="tab.code"
              :class="{ active: activeTabCode === tab.code }"
              @click="pickSubsystem(tab.code)"
            >
              <component :is="tab.icon" :size="16" />
              <span>{{ tabText(tab) }}</span>
            </button>
          </nav>
          <div v-else-if="el === 'tools'" class="app-header__tools">
            <div class="theme-switcher">
              <button class="tool-btn" :title="T('切换主题', 'Switch Theme')" @click="themeMenuOpen = !themeMenuOpen">
                <Palette :size="16" />
                <span>{{ T('主题', 'Theme') }}</span>
                <ChevronDown :size="12" />
              </button>
              <Transition name="drop">
                <div v-if="themeMenuOpen" class="theme-dropdown">
                  <button
                    v-for="t in THEMES"
                    :key="t.key"
                    class="theme-option"
                    :class="{ active: scene.themeType === t.key }"
                    @click="switchTheme(t.key)"
                  >
                    <span class="theme-swatch" :style="{ background: t.color }" />
                    <span>{{ T(t.name, t.nameEn) }}</span>
                  </button>
                </div>
              </Transition>
            </div>
            <button
              class="tool-btn lang-btn"
              :class="{ active: i18n.isEn }"
              :title="T('切换语言', 'Switch Language')"
              @click="toggleLang"
            >
              <Languages :size="16" />
              <span class="lang-opt" :class="{ active: locale === 'zh' }" @click.stop="setLang('zh')">中</span>
              <span class="lang-sep">/</span>
              <span class="lang-opt" :class="{ active: locale === 'en' }" @click.stop="setLang('en')">EN</span>
            </button>
            <div class="user-menu">
              <button class="tool-btn" @click="userMenuOpen = !userMenuOpen">
                <User :size="16" />
                <span>{{ username }}</span>
                <ChevronDown :size="12" />
              </button>
              <Transition name="drop">
                <div v-if="userMenuOpen" class="user-dropdown">
                  <button class="user-dropdown__item" @click="refreshData">
                    <RefreshCw :size="14" />
                    <span>{{ T('刷新数据', 'Refresh') }}</span>
                  </button>
                  <button class="user-dropdown__item" @click="logout">
                    <LogOut :size="14" />
                    <span>{{ T('退出登录', 'Logout') }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </template>
      </div>

      <!-- 中区 -->
      <div class="app-header__slot app-header__slot--center">
        <template v-for="el in slotsForRow(row).center" :key="el">
          <div v-if="el === 'platform'" class="app-header__platform-wrap">
            <h1 v-if="platformMain" class="app-header__platform" :style="{ fontSize: titleFontSize + 'px' }">{{ platformMain }}</h1>
            <span v-if="showPlatformSubEn" class="app-header__platform-en">{{ displayTitleEn }}</span>
          </div>
          <div v-else-if="el === 'clock'" :class="headerLayout.clockSingleLine ? 'clock-box clock-box--single' : 'clock-box'">
            <strong class="mono">{{ clockTime }}</strong>
            <span v-if="!headerLayout.clockSingleLine">{{ clockDate }} {{ clockWeek }}</span>
            <span v-else class="clock-sep">{{ clockDate }} {{ clockWeek }}</span>
          </div>
          <nav v-else-if="el === 'tabs'" class="app-header__tabs" aria-label="子系统切换">
            <button
              v-for="tab in subsystemTabs"
              :key="tab.code"
              class="subsystem-tab"
              :data-tab-code="tab.code"
              :class="{ active: activeTabCode === tab.code }"
              @click="pickSubsystem(tab.code)"
            >
              <component :is="tab.icon" :size="16" />
              <span>{{ tabText(tab) }}</span>
            </button>
          </nav>
        </template>
      </div>

      <!-- 右区 -->
      <div class="app-header__slot app-header__slot--end">
        <template v-for="el in slotsForRow(row).end" :key="el">
          <div v-if="el === 'platform'" class="app-header__platform-wrap">
            <h1 v-if="platformMain" class="app-header__platform" :style="{ fontSize: titleFontSize + 'px' }">{{ platformMain }}</h1>
            <span v-if="showPlatformSubEn" class="app-header__platform-en">{{ displayTitleEn }}</span>
          </div>
          <div v-else-if="el === 'clock'" :class="headerLayout.clockSingleLine ? 'clock-box clock-box--single' : 'clock-box'">
            <strong class="mono">{{ clockTime }}</strong>
            <span v-if="!headerLayout.clockSingleLine">{{ clockDate }} {{ clockWeek }}</span>
            <span v-else class="clock-sep">{{ clockDate }} {{ clockWeek }}</span>
          </div>
          <nav v-else-if="el === 'tabs'" class="app-header__tabs" aria-label="子系统切换">
            <button
              v-for="tab in subsystemTabs"
              :key="tab.code"
              class="subsystem-tab"
              :data-tab-code="tab.code"
              :class="{ active: activeTabCode === tab.code }"
              @click="pickSubsystem(tab.code)"
            >
              <component :is="tab.icon" :size="16" />
              <span>{{ tabText(tab) }}</span>
            </button>
          </nav>
          <div v-else-if="el === 'tools'" class="app-header__tools">
            <div class="theme-switcher">
              <button class="tool-btn" :title="T('切换主题', 'Switch Theme')" @click="themeMenuOpen = !themeMenuOpen">
                <Palette :size="16" />
                <span>{{ T('主题', 'Theme') }}</span>
                <ChevronDown :size="12" />
              </button>
              <Transition name="drop">
                <div v-if="themeMenuOpen" class="theme-dropdown">
                  <button
                    v-for="t in THEMES"
                    :key="t.key"
                    class="theme-option"
                    :class="{ active: scene.themeType === t.key }"
                    @click="switchTheme(t.key)"
                  >
                    <span class="theme-swatch" :style="{ background: t.color }" />
                    <span>{{ T(t.name, t.nameEn) }}</span>
                  </button>
                </div>
              </Transition>
            </div>
            <button
              class="tool-btn lang-btn"
              :class="{ active: i18n.isEn }"
              :title="T('切换语言', 'Switch Language')"
              @click="toggleLang"
            >
              <Languages :size="16" />
              <span class="lang-opt" :class="{ active: locale === 'zh' }" @click.stop="setLang('zh')">中</span>
              <span class="lang-sep">/</span>
              <span class="lang-opt" :class="{ active: locale === 'en' }" @click.stop="setLang('en')">EN</span>
            </button>
            <div class="user-menu">
              <button class="tool-btn" @click="userMenuOpen = !userMenuOpen">
                <User :size="16" />
                <span>{{ username }}</span>
                <ChevronDown :size="12" />
              </button>
              <Transition name="drop">
                <div v-if="userMenuOpen" class="user-dropdown">
                  <button class="user-dropdown__item" @click="refreshData">
                    <RefreshCw :size="14" />
                    <span>{{ T('刷新数据', 'Refresh') }}</span>
                  </button>
                  <button class="user-dropdown__item" @click="logout">
                    <LogOut :size="14" />
                    <span>{{ T('退出登录', 'Logout') }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 0 18px;
  pointer-events: none;
  /* 顶栏底色（contract §5）：引用新 token，不被 styleToCssVars 覆盖 */
  background: var(--kp-topnav-bg);
  border-bottom: 1px solid var(--kp-border-strong);
}
/* 多行布局：每行均分高度 */
.app-header--multi { justify-content: space-between; padding-top: 4px; padding-bottom: 4px; }
.app-header__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, var(--kp-glow-soft), transparent 30%, transparent 70%, var(--kp-glow-soft));
  opacity: 0.5;
}

/* 顶部行：每行内 左/中/右 三区 */
.app-header__row {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1 1 0;
  min-height: 0;
}
/* 顶部三槽位：starT(左) / center(中) / end(右)，按后台 header 布局配置分配内容 */
.app-header__slot {
  display: flex;
  align-items: center;
  gap: 14px;
  pointer-events: auto;
  flex-shrink: 0;
  min-width: 0;
}
.app-header__slot--start { flex: 1 1 0; justify-content: flex-start; }
.app-header__slot--center { flex: 0 0 auto; justify-content: center; }
.app-header__slot--end { flex: 1 1 0; justify-content: flex-end; }

/* 工具组（主题/消防/用户） */
.app-header__tools {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
}

/* 左上角：系统平台名称（固定，后台 DIY 标题名 + 字号；点击子系统菜单不变） */
.app-header__platform {
  margin: 0;
  font-family: var(--kp-font-display);
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--kp-fg);
  text-shadow: 0 0 10px var(--kp-glow);
  white-space: nowrap;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-header__platform-wrap { display: flex; flex-direction: column; align-items: flex-start; }
.app-header__platform-en {
  margin-top: 3px;
  font-size: var(--kp-text-xs);
  font-weight: 400;
  letter-spacing: 2px;
  color: var(--kp-fg-subtle);
  text-shadow: none;
  white-space: nowrap;
}

.clock-box {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.clock-box strong {
  font-size: var(--kp-text-2xl);
  color: var(--kp-fg);
  letter-spacing: 2px;
  text-shadow: 0 0 14px var(--kp-glow);
  font-family: var(--kp-font-mono);
  font-variant-numeric: tabular-nums;
}
.clock-box span {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  letter-spacing: 1px;
}
/* 时间单行：时分秒与年月日星期在同一行 */
.clock-box--single {
  flex-direction: row;
  align-items: baseline;
  gap: 10px;
}
.clock-box--single .clock-sep {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  letter-spacing: 1px;
}

/* 楼栋选择器（标题下方的独立一行，居中） */
.building-selector {
  display: flex;
  justify-content: center;
  flex-wrap: nowrap;
  gap: 5px;
  max-width: 720px;
  overflow: hidden;
}
.building-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--kp-radius-pill);
  background: transparent;
  border: 1px solid var(--kp-border);
  color: var(--kp-fg-muted);
  font-size: var(--kp-text-xs);
  letter-spacing: 0.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.building-pill:hover {
  color: var(--kp-fg);
  border-color: var(--kp-border-strong);
}
.building-pill.active {
  background: var(--kp-glow-soft);
  border-color: var(--kp-accent);
  color: var(--kp-accent);
  box-shadow: 0 0 12px var(--kp-glow);
}
.building-pill--all.active {
  background: var(--kp-glow-soft);
}

/* 子系统页签容器（参考页 .tabs：无底框，仅 flex + gap） */
.app-header__tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  flex-shrink: 0;
}
.subsystem-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--kp-panel-edge);
  border-radius: var(--kp-radius-panel);
  background: rgba(var(--kp-panel-fill-rgb), 0.7);
  color: var(--kp-fg-muted);
  font-size: var(--kp-text-md);
  letter-spacing: 0.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.subsystem-tab svg {
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.subsystem-tab:hover {
  border-color: var(--kp-accent);
  color: var(--kp-fg);
}
.subsystem-tab.active {
  background: var(--kp-accent);
  border-color: var(--kp-accent);
  color: var(--kp-bg);
  font-weight: 700;
}
.subsystem-tab.active svg {
  color: var(--kp-bg);
}

/* 右侧工具 */
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--kp-radius-sm);
  background: var(--kp-surface);
  border: 1px solid var(--kp-border);
  color: var(--kp-fg);
  cursor: pointer;
  font-size: var(--kp-text-xs);
  white-space: nowrap;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.tool-btn:hover {
  border-color: var(--kp-border-strong);
  box-shadow: 0 0 12px var(--kp-glow-soft);
}
.tool-btn.active {
  background: var(--kp-glow-soft);
  border-color: var(--kp-accent);
  color: var(--kp-accent);
  box-shadow: 0 0 12px var(--kp-glow);
}
.tool-btn__pulse {
  animation: kp-pulse 1.2s ease-in-out infinite;
}
.lang-btn {
  font-weight: 600;
  letter-spacing: 0.5px;
}
.lang-opt {
  padding: 0 1px;
  border-radius: 3px;
  transition: color var(--kp-motion-fast) var(--kp-ease-standard);
  cursor: pointer;
}
.lang-sep {
  opacity: 0.45;
  margin: 0 1px;
}
.lang-btn .lang-opt.active {
  color: var(--kp-accent);
  text-shadow: 0 0 8px var(--kp-glow);
}
.lang-btn.active {
  border-color: var(--kp-accent);
  color: var(--kp-accent);
  box-shadow: 0 0 12px var(--kp-glow);
}

.theme-switcher,
.user-menu {
  position: relative;
}
.theme-dropdown,
.user-dropdown {
  position: absolute;
  top: 42px;
  right: 0;
  width: 180px;
  padding: 8px;
  background: var(--kp-surface);
  border: 1px solid var(--kp-border-strong);
  border-radius: var(--kp-radius-md);
  box-shadow: var(--kp-elev-raised);
  backdrop-filter: blur(14px);
  z-index: 300;
}
.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--kp-fg-muted);
  cursor: pointer;
  border-radius: var(--kp-radius-sm);
}
.theme-option:hover,
.theme-option.active {
  color: var(--kp-fg);
  background: var(--kp-glow-soft);
}
.theme-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}
.user-dropdown__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--kp-fg-muted);
  cursor: pointer;
  border-radius: var(--kp-radius-sm);
}
.user-dropdown__item:hover {
  color: var(--kp-fg);
  background: var(--kp-glow-soft);
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity var(--kp-motion-fast) var(--kp-ease-standard), transform var(--kp-motion-fast) var(--kp-ease-standard);
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

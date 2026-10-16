<script setup lang="ts">
/**
 * 图1 主驾驶舱（参考页 #scr1 + renderSubPanels() L5402-5494 / bdLighting() L5057-5073 的组件化复刻）
 * 契约：docs/design/bigscreen-ref-style-v2.md §6 + docs/design/bigscreen-panel-specs.md §1
 *
 * ★ Wave 1 范式（fe-bigscreen-shell）：屏1 综合态势「全部数据来自现有后端 API」。
 *   数据层 = useBigscreenOverview()（/devices /alarms /work-orders/stats /energy/summary）
 *          + useBigscreenStore().panels（/bigscreen/panels，覆盖 S1–S7 子系统摘要）。
 *   几何全部由 bigscreen-stage.css 提供，本组件只负责 DOM + 数据。
 *
 * 结构（固定几何，禁改坐标）：
 *   .bs-title    标题栏 [40,48,1840,72]：左天气 / 中标题 / 右时钟
 *   .bs-bldnav   楼栋导航 [40,128,1840,56]：真实 10 栋（scene.visibleBuildings）
 *   .bs-floorlist 楼层列表 [480,200,120,380]：真实层数，点击下钻 openFloorDrill
 *   S1–S7 悬浮卡  左列 pL1-4 h212 / 右列 p192·p488·p784 h288 —— 7 个子系统摘要卡，点击下钻对应详情屏
 *   .bs-panel--today 今日运行情况 [640,872,640,200] 六宫格
 *   .bs-note     数据来源脚注
 *
 * ★ 合规（GMP / 21 CFR Part 11）：
 *   - 真实档案数据（楼栋名 / 层数 / 建筑面积 / 设备台账）来自 scene store，**不经 v() 置空**；
 *   - 示意值（天气，后端暂无对应接口）经 useDataMode().v() 包装，empty 模式输出 '--'。
 *
 * P0：零硬编码色（色值只来自 SERIES 的 token 字符串）；图标只用 lucide-vue-next，禁 emoji。
 */
import {
  Activity,
  BarChart3,
  Cloud,
  Cpu,
  Droplet,
  Gauge,
  Lightbulb,
  Thermometer,
  Wind,
  Zap,
} from 'lucide-vue-next'
import type { LucideIcon } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import BsPanel from '../BsPanel.vue'
import BsDonut from '../charts/BsDonut.vue'
import BsGauge from '../charts/BsGauge.vue'
import BsLine from '../charts/BsLine.vue'
import BsStack from '../charts/BsStack.vue'
import BsWave from '../charts/BsWave.vue'
import { SERIES, f0, f2 } from '@/lib/bigscreen-palette'
import { useClock } from '@/lib/bigscreen-clock'
import { useDataMode } from '@/lib/bigscreen-data-mode'
import { HERO_CARDS, SUBSYSTEM_SCREEN, screenMeta } from '@/lib/bigscreen-screens'
import type { HeroCard, ScreenNo } from '@/lib/bigscreen-screens'
import { useSceneStore } from '@/stores/scene'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useBigscreenOverview } from '@/lib/bigscreen-overview'
import type { Building } from '@/types/api'

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ (e: 'drill', no: ScreenNo): void }>()

const scene = useSceneStore()
const bigscreen = useBigscreenStore()
// 全院总览数据层（/devices /alarms /work-orders/stats /energy/summary）
const overview = useBigscreenOverview()
const {
  deviceStats,
  buildingDeviceMap,
  alarmStats,
  workOrder,
  energy,
} = overview

const { v } = useDataMode()
const { footNote } = useDataMode()
const { dateText, timeText } = useClock()
const meta = screenMeta(1)

// 面板聚合数据（/bigscreen/panels，S1–S7 子系统摘要）
const panels = bigscreen.panels

/* ============================ 屏1 激活即拉取总览（仅一次） ============================ */
watch(
  () => props.active,
  (on) => {
    if (on) void overview.init()
  },
  { immediate: true },
)
onMounted(() => {
  if (props.active) void overview.init()
})

/* ============================ 楼栋（真实档案） ============================ */

/** 楼栋编号：B3 → 3（用于「N号楼」文案） */
function buildingNo(code: string): number {
  return Number.parseInt(code.replace(/\D/g, ''), 10) || 0
}

/** 导航楼栋列表：按楼栋号升序（参考页 BUILDINGS 顺序） */
const navBuildings = computed<Building[]>(() =>
  [...scene.visibleBuildings].sort((a, b) => buildingNo(a.code) - buildingNo(b.code)),
)

/**
 * S 卡聚焦楼栋：优先后台/交互选中的楼栋；未选时回退 4 号楼（参考页 selBuilding=3 默认妇产儿科大楼）。
 */
const heroBuilding = computed<Building | null>(() => {
  const list = navBuildings.value
  if (!list.length) return null
  if (scene.selectedBuilding) {
    return list.find((b) => b.id === scene.selectedBuilding) ?? list[0]
  }
  return list.find((b) => buildingNo(b.code) === 4) ?? list[0]
})

const heroNo = computed(() => (heroBuilding.value ? buildingNo(heroBuilding.value.code) : 0))
const heroName = computed(() => heroBuilding.value?.name ?? '—')
const heroArea = computed(() => heroBuilding.value?.gross_area ?? 0)

function onBuildingClick(b: Building): void {
  scene.selectBuilding(scene.selectedBuilding === b.id ? null : b.id)
}

/* ---------------- 楼栋 hover 台账卡（真实设备台账，来自 /devices 聚合） ---------------- */
const tipIndex = ref<number | null>(null)
const tipLeft = ref(40)

function onTipEnter(ev: MouseEvent, i: number): void {
  const el = ev.currentTarget as HTMLElement | null
  if (el) {
    // 参考页口径：left = 导航容器起点(40) + tab 中心 - 卡宽半(140)，夹在 [40, 1600]
    const raw = 40 + el.offsetLeft + el.offsetWidth / 2 - 140
    tipLeft.value = Math.max(40, Math.min(1920 - 40 - 280, raw))
  }
  tipIndex.value = i
}
function onTipLeave(): void {
  tipIndex.value = null
}
const tipBuilding = computed<Building | null>(() =>
  tipIndex.value === null ? null : navBuildings.value[tipIndex.value] ?? null,
)
const tipDev = computed<{ total: number; online: number; offline: number }>(
  () => buildingDeviceMap.value[tipBuilding.value?.id ?? ''] ?? { total: 0, online: 0, offline: 0 },
)

/* ============================ 楼层列表（真实层数） ============================ */
const selFloor = ref(1)
const floors = computed<number[]>(() => {
  const n = heroBuilding.value?.floors ?? 0
  return Array.from({ length: n }, (_, i) => n - i)
})
function onFloorClick(n: number): void {
  selFloor.value = n
  if (heroBuilding.value) scene.openFloorDrill(heroBuilding.value.id, n)
}

/* ============================ 天气（唯一示意值：后端暂无接口） ============================ */
const weather = { txt: '多云', temp: 26, wind: '东南风 2级', hum: 78 }

/* ============================ S1–S7 卡片元数据 ============================ */
const CARD_ICON: Record<string, LucideIcon> = {
  regulation: Gauge,
  lifecycle: Cpu,
  hvac: Thermometer,
  lighting: Lightbulb,
  power: Zap,
  hotwater: Droplet,
  elevator: Activity,
}

/** 面板标题：后台自定义名优先，否则参考页原文；前缀保留参考页 "S{n} · " 序号 */
function cardTitle(c: HeroCard): string {
  const custom = scene.subsystemMeta[c.code]?.label
  return `S${c.order} · ${custom || c.refTitle}`
}
function cardClass(c: HeroCard): string {
  return `${c.col === 'l' ? 'col-l' : 'col-r'} ${c.slot}`
}
/** 后台「子系统菜单」开关隐藏的卡片不渲染（与顶部 tab 同一口径） */
const cards = computed(() => HERO_CARDS.filter((c) => scene.subsystemVisible(c.code)))
function onDrill(c: HeroCard): void {
  scene.selectSubsystem(c.code as never)
  emit('drill', SUBSYSTEM_SCREEN[c.code] ?? 1)
}
function cardOf(code: string): HeroCard | undefined {
  return cards.value.find((c) => c.code === code)
}

/* ============================ S1–S7 / 今日运行情况（实时数据派生） ============================ */

// 子系统能耗色板（按 bySubsystem 顺序循环，全部为 SERIES token 字符串）
const SUBSYS_COLORS = [
  SERIES.cyan,
  SERIES.blue,
  SERIES.green,
  SERIES.amber,
  SERIES.red,
  SERIES.teal,
  SERIES.dim,
  SERIES.soft,
]

/** 全院能耗合计（bySubsystem 各系统 value 之和） */
const energyTotal = computed(() =>
  panels.bottom.bySubsystem.reduce((s, x) => s + x.value, 0),
)

/** S1 能源结构环形：按 bySubsystem 真实能耗占比 */
const shareSegs = computed(() => {
  const total = energyTotal.value || 1
  return panels.bottom.bySubsystem.map((x, i) => ({
    v: x.value,
    c: SUBSYS_COLORS[i % SUBSYS_COLORS.length],
    total,
  }))
})
/** S1 环形图例（名称 + 占比%） */
const shareLegend = computed(() => {
  const total = energyTotal.value || 1
  return panels.bottom.bySubsystem.map((x, i) => ({
    nm: x.name,
    v: Math.round((x.value / total) * 100),
    c: SUBSYS_COLORS[i % SUBSYS_COLORS.length],
  }))
})

/** S2 近 7 日告警堆叠柱（按等级拆分，真实） */
const alarmSeries = computed(() => [
  { data: alarmStats.value.trendCritical, color: SERIES.red },
  { data: alarmStats.value.trendWarning, color: SERIES.amber },
  { data: alarmStats.value.trendInfo, color: SERIES.blue },
])

/** S3 24h 温度折线（来自 /bigscreen/panels 的 tempTrend 真实序列） */
const tempSeries = computed(() =>
  panels.right.tempTrend.length ? [{ data: panels.right.tempTrend, color: SERIES.cyan }] : [],
)

/** S4 照明能耗 + S6 热水能耗（按子系统 code 精确匹配，避免依赖中文名称） */
const lightingKwh = computed(
  () => panels.bottom.bySubsystem.find((x) => x.code === 'lighting')?.value ?? 0,
)
const lightingPct = computed(() =>
  energyTotal.value > 0 ? Math.round((lightingKwh.value / energyTotal.value) * 100) : 0,
)
const hotwaterKwh = computed(
  () => panels.bottom.bySubsystem.find((x) => x.code === 'hotwater')?.value ?? 0,
)
const hotwaterPct = computed(() =>
  energyTotal.value > 0 ? Math.round((hotwaterKwh.value / energyTotal.value) * 100) : 0,
)
const hotwaterFrac = computed(() =>
  energyTotal.value > 0 ? Math.min(1, hotwaterKwh.value / energyTotal.value) : 0,
)

/** S4 全院负荷波浪（energyTrend 真实序列） */
const energyTrendVals = computed(() => panels.bottom.energyTrend.map((p) => p.value))
const energyTrendLabels = computed(() => panels.bottom.energyTrend.map((p) => p.t))

/** 今日运行情况六宫格（全院 KPI 快照，全部真实） */
const todayItems = computed(() => [
  { k: '设备在线', val: f0(deviceStats.value.online), u: '台' },
  { k: '设备离线', val: f0(deviceStats.value.offline), u: '台' },
  { k: '今日用电', val: f0(energy.value.kwh), u: 'kWh' },
  { k: '今日碳排', val: f0(energy.value.carbonKg), u: 'kg' },
  { k: '工单待处理', val: f0(workOrder.value.pending), u: '单' },
  { k: '工单已完成', val: f0(workOrder.value.done), u: '单' },
])

/** S1 环形中心：今日用能 kWh */
const energyKwhText = computed(() => (energy.value.kwh ? f0(energy.value.kwh) : '—'))
</script>

<template>
  <section class="bs-screen bs-screen--1" :class="{ 'is-on': active }">
    <!-- ============ 标题栏：天气 / 院名 / 时钟 ============ -->
    <div class="bs-title">
      <div class="tb-left">
        <span class="wx">
          <Cloud :size="20" />
          <span>{{ v(weather.txt) }}</span>
          <span class="v">{{ v(`${weather.temp}℃`) }}</span>
        </span>
        <span class="tb-sep" />
        <span class="wx"><Wind :size="18" /><span class="s">{{ v(weather.wind) }}</span></span>
        <span class="tb-sep" />
        <span class="wx">
          <Droplet :size="18" />
          <span class="s">湿度 {{ v(`${weather.hum}%`) }}</span>
        </span>
      </div>
      <div class="tb-mid">
        <h1>{{ meta.title }}</h1>
        <div class="sub">{{ meta.titleEn }}</div>
      </div>
      <div class="tb-right">
        <div class="d">{{ dateText }}</div>
        <div class="t">{{ timeText }}</div>
      </div>
    </div>

    <!-- ============ 楼栋导航（真实 10 栋） ============ -->
    <div class="bs-bldnav">
      <div
        v-for="(b, i) in navBuildings"
        :key="b.id"
        class="btab"
        :class="{ on: heroBuilding?.id === b.id }"
        @mouseenter="onTipEnter($event, i)"
        @mouseleave="onTipLeave"
        @click="onBuildingClick(b)"
      >
        <span>{{ buildingNo(b.code) }}号楼</span>
        <span class="idx">{{ b.floors }}F</span>
      </div>
    </div>

    <!-- 楼栋台账悬浮卡（真实档案 + 真实设备台账，不置空） -->
    <div
      v-if="tipBuilding"
      class="bs-bldtip"
      :style="{ left: `${tipLeft}px`, top: '188px' }"
    >
      <div class="n">{{ tipBuilding.name }}</div>
      <div class="hr" />
      <div class="r"><span>建筑层数</span><span>{{ tipBuilding.floors }} 层</span></div>
      <div class="r">
        <span>建筑面积</span>
        <span v-if="tipBuilding.gross_area === null" class="tip-pend">待核</span>
        <span v-else>{{ f2(tipBuilding.gross_area) }} m² <i class="tip-done">已核</i></span>
      </div>
      <div class="r"><span>设备总数</span><span>{{ f0(tipDev.total) }} 台</span></div>
      <div class="r">
        <span>在线 / 离线</span>
        <span><b class="t-on">{{ f0(tipDev.online) }}</b> / {{ f0(tipDev.offline) }}</span>
      </div>
      <div class="tot">合计 <b>{{ f0(tipDev.total) }}</b> 台 / {{ tipBuilding.code }}</div>
    </div>

    <!-- ============ 楼层列表（真实层数，点击下钻） ============ -->
    <div class="bs-floorlist">
      <div class="p-bd">
        <div
          v-for="n in floors"
          :key="n"
          class="fl"
          :class="{ on: n === selFloor }"
          @click="onFloorClick(n)"
        >
          F{{ n }}
        </div>
      </div>
    </div>

    <!-- ============ S1 · 智慧能源一体化调控（环形图） ============ -->
    <BsPanel
      v-if="cardOf('regulation')"
      :class="cardClass(cardOf('regulation')!)"
      :title="cardTitle(cardOf('regulation')!)"
      :icon="CARD_ICON.regulation"
      drill
      hud-id="hero-s1"
      @click="onDrill(cardOf('regulation')!)"
    >
      <div class="ck">
        <div class="ck-row">
          <div class="ck-ring">
            <BsDonut :size="120" :r="50" :sw="13" :segs="shareSegs" />
            <div class="dk-ctr">
              <b>{{ v(energyKwhText) }}</b>
              <span>今日用能 kWh</span>
            </div>
          </div>
          <div class="ck-lg">
            <div v-for="x in shareLegend" :key="x.nm" class="lr">
              <span><i :style="{ background: x.c }" />{{ x.nm }}</span>
              <b>{{ v(`${x.v}%`) }}</b>
            </div>
          </div>
        </div>
        <div class="ck-foot">
          <span>全院设备 <b class="fs">{{ f0(deviceStats.total) }}</b> 台 · {{ heroNo }}号楼 {{ heroName }}</span>
          <span class="fb">环形图</span>
        </div>
      </div>
    </BsPanel>

    <!-- ============ S2 · 设备生命周期管理（告警分级 + 近7日趋势） ============ -->
    <BsPanel
      v-if="cardOf('lifecycle')"
      :class="cardClass(cardOf('lifecycle')!)"
      :title="cardTitle(cardOf('lifecycle')!)"
      :icon="CARD_ICON.lifecycle"
      drill
      hud-id="hero-s2"
      @click="onDrill(cardOf('lifecycle')!)"
    >
      <div class="ck">
        <div class="ck-kpis">
          <span class="ck-kpi">紧急<b :style="{ color: SERIES.red }">{{ v(f0(alarmStats.critical)) }}</b></span>
          <span class="ck-kpi">重要<b :style="{ color: SERIES.amber }">{{ v(f0(alarmStats.warning)) }}</b></span>
          <span class="ck-kpi">一般<b :style="{ color: SERIES.blue }">{{ v(f0(alarmStats.info)) }}</b></span>
          <span class="ck-kpi">闭环<b :style="{ color: SERIES.green }">{{ v(f0(workOrder.done)) }}</b></span>
        </div>
        <div v-if="alarmStats.trendLabels.length" class="ck-svg">
          <BsStack :w="384" :h="104" :cats="alarmStats.trendLabels" :series="alarmSeries" />
        </div>
        <div v-else class="ck-svg mini">暂无近 7 日告警数据</div>
        <div class="ck-foot">
          <span>近 7 日告警（紧急 / 重要 / 一般）</span><span class="fb">堆叠柱</span>
        </div>
      </div>
    </BsPanel>

    <!-- ============ S3 · 空调集中控制调度（实时指标 + 24h 趋势） ============ -->
    <BsPanel
      v-if="cardOf('hvac')"
      :class="cardClass(cardOf('hvac')!)"
      :title="cardTitle(cardOf('hvac')!)"
      :icon="CARD_ICON.hvac"
      drill
      hud-id="hero-s3"
      @click="onDrill(cardOf('hvac')!)"
    >
      <div class="ck">
        <div class="ck-kpis">
          <span v-for="k in panels.right.acStats" :key="k.label" class="ck-kpi">
            {{ k.label }}<b>{{ v(k.value != null ? f0(k.value) : '—') }}<em v-if="k.unit">{{ k.unit }}</em></b>
          </span>
        </div>
        <div v-if="tempSeries.length" class="ck-svg">
          <BsLine :w="384" :h="104" :series="tempSeries" :labels="panels.right.timeLabels" />
        </div>
        <div v-else class="ck-svg mini">暂无温度趋势</div>
        <div class="ck-foot">
          <span>24h 空调运行趋势（实时）</span><span class="fb">折线图</span>
        </div>
      </div>
    </BsPanel>

    <!-- ============ S4 · 智慧照明管理（能耗占比 + 负荷波浪） ============ -->
    <BsPanel
      v-if="cardOf('lighting')"
      :class="cardClass(cardOf('lighting')!)"
      :title="cardTitle(cardOf('lighting')!)"
      :icon="CARD_ICON.lighting"
      drill
      hud-id="hero-s4"
      @click="onDrill(cardOf('lighting')!)"
    >
      <div class="ck">
        <div class="ck-kpis">
          <span class="ck-kpi">照明能耗<b>{{ v(f0(lightingKwh)) }}<em>kWh</em></b></span>
          <span class="ck-kpi">占比<b>{{ v(`${lightingPct}%`) }}</b></span>
          <span class="ck-kpi">全院能耗<b>{{ v(f0(energyTotal)) }}<em>kWh</em></b></span>
        </div>
        <div v-if="energyTrendVals.length" class="ck-svg">
          <BsWave :w="384" :h="102" :vals="energyTrendVals" :labels="energyTrendLabels" :color="SERIES.cyan" />
        </div>
        <div v-else class="ck-svg mini">暂无负荷曲线</div>
        <div class="ck-foot">
          <span>全院负荷 7 日曲线（实时）</span><span class="fb">波浪图</span>
        </div>
      </div>
    </BsPanel>

    <!-- ============ S5 · 医院电力监控（计量指标列表） ============ -->
    <BsPanel
      v-if="cardOf('power')"
      :class="cardClass(cardOf('power')!)"
      :title="cardTitle(cardOf('power')!)"
      :icon="CARD_ICON.power"
      drill
      hud-id="hero-s5"
      @click="onDrill(cardOf('power')!)"
    >
      <div class="ck">
        <div class="sub-rows">
          <div v-for="k in panels.right.powerStats" :key="k.label" class="sub-row">
            <span class="k">{{ k.label }}</span>
            <span class="v">{{ v(k.value != null ? f0(k.value) : '—') }}<span v-if="k.unit" class="u">{{ k.unit }}</span></span>
          </div>
        </div>
        <div class="ck-foot">
          <span>配电房变压器 / 本楼计量（实时）</span><span class="fb">列表</span>
        </div>
      </div>
    </BsPanel>

    <!-- ============ S6 · 热水集中控制调度（能耗占比圆环） ============ -->
    <BsPanel
      v-if="cardOf('hotwater')"
      :class="cardClass(cardOf('hotwater')!)"
      :title="cardTitle(cardOf('hotwater')!)"
      :icon="CARD_ICON.hotwater"
      drill
      hud-id="hero-s6"
      @click="onDrill(cardOf('hotwater')!)"
    >
      <div class="ck">
        <div class="ck-gauges">
          <div class="gm">
            <BsGauge :size="84" :frac="hotwaterFrac" :color="SERIES.cyan" :val="String(v(f0(hotwaterKwh)))" />
            <div class="gl">热水能耗 <b>{{ v(`${hotwaterPct}%`) }}</b></div>
            <div class="gt">全院占比</div>
          </div>
        </div>
        <div class="ck-foot">
          <span>全院热水能耗 {{ f0(hotwaterKwh) }} kWh</span><span class="fb">圆圈</span>
        </div>
      </div>
    </BsPanel>

    <!-- ============ S7 · 电梯节能管理（运行指标网格） ============ -->
    <BsPanel
      v-if="cardOf('elevator')"
      :class="cardClass(cardOf('elevator')!)"
      :title="cardTitle(cardOf('elevator')!)"
      :icon="CARD_ICON.elevator"
      drill
      hud-id="hero-s7"
      @click="onDrill(cardOf('elevator')!)"
    >
      <div class="cb">
        <div class="cb-t">电梯节能运行 · {{ heroNo }}号楼</div>
        <div class="cb-grid">
          <div v-for="k in panels.right.elevatorStats" :key="k.label" class="cb-cell">
            <b>{{ v(k.value != null ? f0(k.value) : '—') }}</b><span>{{ k.label }}</span>
          </div>
        </div>
        <div class="cb-foot"><i />当前聚焦楼栋 · {{ heroNo }}号楼 {{ heroName }}</div>
      </div>
    </BsPanel>

    <!-- ============ 今日运行情况（六宫格底条） ============ -->
    <BsPanel class="bs-panel--today" title="今日运行情况" :icon="BarChart3" no-chev hud-id="hero-today">
      <div class="lit-box">
        <div v-for="it in todayItems" :key="it.k" class="bt">
          <div class="k">{{ it.k }}</div>
          <div class="v">
            {{ v(it.val) }}<span v-if="it.u" class="u">{{ it.u }}</span>
          </div>
        </div>
      </div>
    </BsPanel>

    <!-- ============ 数据来源脚注 ============ -->
    <div v-if="footNote" class="bs-note">{{ footNote }}</div>
  </section>
</template>

<style scoped>
/* 楼栋台账卡的「待核 / 已核」状态色（参考页用行内 amber/green，此处走令牌） */
.tip-pend {
  color: var(--kp-warn);
}
.tip-done {
  font-style: normal;
  color: var(--kp-success);
  margin-left: 4px;
}
/* 台账卡在线数（真值）稍加强调 */
.t-on {
  color: var(--kp-success);
  font-weight: 700;
}
/* S1 脚注里的全院设备台数（真值）稍加强调，参考页 style="color:#EAF6FF" */
.ck-foot .fs {
  color: var(--kp-fg);
  font-weight: 700;
}
</style>

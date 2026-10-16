<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import {
  Database,
  LineChart,
  Gauge,
  Siren,
  BarChart3,
  Building2,
  Radio,
  FileText,
  Package,
  Truck,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-vue-next'
import { KP_ACCENT, KP_ACCENT_RGBA } from '@/lib/kp-accent'
import PanelCard from '@/components/common/PanelCard.vue'
import EChart from '@/components/panels/EChart.vue'
import SubsystemFocusCard from '@/components/panels/SubsystemFocusCard.vue'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useI18nStore } from '@/stores/i18n'
import { useSceneStore } from '@/stores/scene'
import { Layers } from 'lucide-vue-next'

const bs = useBigscreenStore()
const scene = useSceneStore()
const { t } = useI18nStore()
const B = computed(() => bs.panels.bottom)

// GK-24：聚焦态底部框联携子系统真实数据。
// 这 3 个底部框在 schema 中绑定到「无专属右侧框」的子系统（lighting/hotwater/lifecycle），
// 当对应子系统被聚焦时，该框改由 SubsystemFocusCard 展示该子系统真实状态，避免「框在但内容不变」。
const FOCUS_BOX: Record<string, string> = {
  'bottom-category-trend': 'lighting',
  'bottom-traffic-trend': 'hotwater',
  'bottom-dept-alarm': 'lifecycle',
}
// 当前聚焦子系统（非 overview）若匹配某底部框绑定，返回该子系统 code，否则 null
const activeSub = computed(() => {
  const s = scene.activeSubsystem
  return s && s !== 'overview' ? (s as string) : null
})
function focusCodeFor(boxKey: string): string | null {
  const bind = FOCUS_BOX[boxKey]
  return bind && activeSub.value === bind ? bind : null
}

// ---------- 数据分类趋势（折线图，后端预留接口 categoryTrend） ----------
function lineOption(data: { t: string; value: number }[], color: string): EChartsOption {
  return {
    grid: { left: 6, right: 8, top: 8, bottom: 18 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4,16,31,0.92)',
      borderColor: KP_ACCENT_RGBA(0.35),
      textStyle: { color: '#E6F7FF', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.t),
      axisLine: { lineStyle: { color: KP_ACCENT_RGBA(0.2) } },
      axisLabel: { color: '#8CA8BE', fontSize: 10, interval: 'auto' },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { show: false },
    },
    series: [
      {
        type: 'line',
        data: data.map((d) => d.value),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + '55' },
              { offset: 1, color: color + '08' },
            ],
          },
        },
      },
    ],
  } as EChartsOption
}
const categoryTrend = computed(() =>
  lineOption(B.value.categoryTrend?.length ? B.value.categoryTrend : B.value.energyTrend, KP_ACCENT),
)

// ---------- 系统设备与能耗（各系统设备数量 + 能耗） ----------
const sysEnergy = computed(() => (B.value.bySubsystem || []).map((s) => ({ ...s })))
// ---------- 楼栋能耗（综合概览：整个园区各楼栋能耗统计） ----------
const buildingEnergy = computed(() => (B.value.buildingEnergy || []).slice(0, 10))

function pctOf(v: number | undefined, list: Array<{ value?: number; kwh?: number }>): number {
  const max = Math.max(...list.map((i) => i.value ?? i.kwh ?? 0), 1)
  return Math.round(((v ?? 0) / max) * 100)
}
function fmtKwh(v: number | undefined): string {
  if (!v && v !== 0) return '—'
  return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)
}

// ---------- 数据来源及更新（不滚动，固定展示前 5 条） ----------
const sources = computed(() => (B.value.dataSources || []).slice(0, 5))

// ---------- 实时数据通道状态（Phase 3：数据来源框展示真实连通性） ----------
const liveOn = computed(() => scene.liveConnected)
const metricCount = computed(() => Object.keys(scene.liveMetrics).length)

// ---------- 楼层钻取快捷入口（Phase 3：数据来源框可下钻楼层） ----------
// 取当前选中楼（无选中则取首楼），列出其 floors_by_building 楼层标签，点击打开钻取抽屉
const drillBuildingId = computed(() => scene.selectedBuilding || (scene.buildings[0]?.id ?? null))
const drillBuildingName = computed(() => {
  const b = scene.buildings.find((x) => x.id === drillBuildingId.value)
  return b ? b.name : ''
})
const drillFloors = computed(() => {
  const bid = drillBuildingId.value
  if (!bid) return []
  return scene.buildingDisplay.floors_by_building?.[bid] || []
})
function drillTo(floor: number) {
  if (drillBuildingId.value) scene.openFloorDrill(drillBuildingId.value, floor)
}

// ---------- 当前状态（3 个仪表盘） ----------
function gaugeSmall(value: number, color: string): EChartsOption {
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '92%',
        center: ['50%', '60%'],
        progress: { show: true, width: 7, itemStyle: { color } },
        axisLine: { lineStyle: { width: 7, color: [[1, 'rgba(255,255,255,0.08)']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true,
          formatter: `{v|{value}%}`,
          rich: { v: { color: '#E6F7FF', fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 } },
          offsetCenter: [0, 0],
        },
        data: [{ value }],
      },
    ],
  } as EChartsOption
}
const statusGauges = computed(() =>
  (B.value.statusGauges || []).map((g) => ({ ...g, option: gaugeSmall(g.value, g.color) })),
)

// ---------- 应急响应（可点击按钮，仅高亮，无实际业务跳转） ----------
const RESP_ICONS: Record<string, LucideIcon> = {
  command: Radio,
  plan: FileText,
  supply: Package,
  vehicle: Truck,
  comms: MessageSquare,
  training: ShieldCheck,
}
const activeResponse = ref(0)
const responses = computed(() =>
  (B.value.responses || []).map((r, i) => ({
    ...r,
    icon: RESP_ICONS[r.key] || Siren,
    active: i === activeResponse.value,
  })),
)
</script>

<template>
  <div class="bottom-bar">
    <!-- 数据来源及更新 -->
    <PanelCard :title="t('数据来源及更新', 'Data Sources & Updates')" :icon="Database" class="bp-card bp-card--src" box-key="bottom-source" :accent="true">
      <div class="src">
        <!-- 实时通道状态条 -->
        <div class="src-status">
          <span class="src-dot" :class="liveOn ? 'is-on' : 'is-off'" />
          <span class="src-status__txt">{{ liveOn ? t('实时通道已连接', 'Live Connected') : t('通道未连接', 'Disconnected') }}</span>
          <span class="src-status__sep">·</span>
          <span class="mono">{{ metricCount }} {{ t('指标点', 'metrics') }}</span>
        </div>

        <!-- 楼层钻取快捷入口（点击下钻该层设备） -->
        <div v-if="drillFloors.length" class="src-floors">
          <span class="src-floors__tag"><Layers :size="11" /> {{ drillBuildingName }}</span>
          <button
            v-for="f in drillFloors"
            :key="f.index"
            class="src-floor"
            :title="f.label ? f.label : ''"
            @click="drillTo(f.index)"
          >
            {{ f.index }}F
          </button>
        </div>

        <!-- 数据源更新列表（不滚动） -->
        <div class="src-table">
          <div class="src-row src-row--head">
            <span>{{ t('设备名称', 'Device') }}</span><span>{{ t('最近更新', 'Last Update') }}</span>
          </div>
          <div v-for="(d, i) in sources" :key="d.device + i" class="src-row">
            <span class="src-name">{{ d.device }}</span><span class="src-time mono">{{ d.time }}</span>
          </div>
          <div v-if="!sources.length" class="src-row src-row--empty">{{ t('暂无数据源记录', 'No source records') }}</div>
        </div>
      </div>
    </PanelCard>

    <!-- 数据分类趋势（折线图）；lighting 聚焦时联携照明真实数据 -->
    <PanelCard :title="t('数据分类趋势', 'Category Trend')" :icon="LineChart" class="bp-card bp-card--line" box-key="bottom-category-trend" :accent="true">
      <SubsystemFocusCard v-if="focusCodeFor('bottom-category-trend')" :code="focusCodeFor('bottom-category-trend')!" />
      <div v-else class="bp-line">
        <EChart v-if="!bs.loading && categoryTrend.series" :option="categoryTrend" :height="'100%'" />
        <div v-else class="kp-empty">{{ t('暂无趋势数据', 'No Trend Data') }}</div>
      </div>
    </PanelCard>

    <!-- 当前状态 -->
    <PanelCard :title="t('当前状态', 'Current Status')" :icon="Gauge" class="bp-card bp-card--gauges" box-key="bottom-status" :accent="true">
      <div class="bp-gauges">
        <div v-for="g in statusGauges" :key="g.label" class="bp-gauge">
          <EChart :option="g.option" :height="'100%'" />
          <span class="bp-gauge__label">{{ t(g.label) }}</span>
        </div>
      </div>
    </PanelCard>

    <!-- 应急响应 -->
    <PanelCard :title="t('应急响应', 'Emergency Response')" :icon="Siren" class="bp-card bp-card--acts" box-key="bottom-response" :accent="true">
      <div class="bp-acts">
        <button
          v-for="(a, i) in responses"
          :key="a.key"
          class="bp-act"
          :class="{ active: a.active }"
          @click="activeResponse = i"
        >
          <component :is="a.icon" :size="14" />
          <span>{{ t(a.label) }}</span>
        </button>
      </div>
    </PanelCard>

    <!-- 系统设备与能耗（各系统设备数量 + 能耗）；lifecycle 聚焦时联携设备生命真实数据 -->
    <PanelCard :title="t('系统设备与能耗', 'System Devices & Energy')" :icon="BarChart3" class="bp-card bp-card--bars" box-key="bottom-dept-alarm" :accent="true">
      <SubsystemFocusCard v-if="focusCodeFor('bottom-dept-alarm')" :code="focusCodeFor('bottom-dept-alarm')!" />
      <template v-else>
        <div v-if="!bs.loading && sysEnergy.length" class="bp-syslist">
          <div v-for="s in sysEnergy" :key="s.name" class="bp-sysrow">
            <span class="bp-sysrow__name">{{ t(s.name) }}</span>
            <span class="bp-sysrow__bar"><i :style="{ width: pctOf(s.kwh, sysEnergy) + '%', background: s.color }" /></span>
            <span class="bp-sysrow__meta mono">{{ s.device_count }} {{ t('台', 'units') }} · {{ fmtKwh(s.kwh) }}kWh</span>
          </div>
        </div>
        <div v-else-if="!bs.loading" class="kp-empty">{{ t('暂无系统能耗数据', 'No System Energy Data') }}</div>
      </template>
    </PanelCard>

    <!-- 楼栋能耗（综合概览：园区各楼栋能耗统计）；hotwater 聚焦时联携热水真实数据 -->
    <PanelCard :title="t('楼栋能耗', 'Building Energy')" :icon="Building2" class="bp-card bp-card--bars" box-key="bottom-traffic-trend" :accent="true">
      <SubsystemFocusCard v-if="focusCodeFor('bottom-traffic-trend')" :code="focusCodeFor('bottom-traffic-trend')!" />
      <template v-else>
        <div v-if="!bs.loading && buildingEnergy.length" class="bp-syslist">
          <div v-for="b in buildingEnergy" :key="b.building_id" class="bp-sysrow">
            <span class="bp-sysrow__name">{{ b.building_name }}</span>
            <span class="bp-sysrow__bar"><i :style="{ width: pctOf(b.kwh, buildingEnergy) + '%' }" /></span>
            <span class="bp-sysrow__meta mono">{{ fmtKwh(b.kwh) }}kWh · ¥{{ (b.cost || 0).toFixed(0) }}</span>
          </div>
        </div>
        <div v-else-if="!bs.loading" class="kp-empty">{{ t('综合概览下展示园区各楼栋能耗', 'Building energy shown in overview') }}</div>
      </template>
    </PanelCard>
  </div>
</template>

<style scoped>
.bottom-bar {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: block;
  min-height: 0;
}
.bp-card {
  min-width: 0;
  min-height: 0;
}

/* 数据来源容器（状态条 + 楼层钻取 + 列表） */
.src {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 5px;
}
.src-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--kp-fg-muted);
  flex-shrink: 0;
}
.src-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.src-dot.is-on { background: var(--kp-success); box-shadow: 0 0 6px rgba(var(--kp-success-rgb), 0.6); }
.src-dot.is-off { background: var(--kp-fg-muted); }
.src-status__sep { opacity: 0.4; }
.src-status__txt { color: var(--kp-fg); }

.src-floors {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.src-floors__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--kp-accent);
  margin-right: 2px;
}
.src-floor {
  height: 20px;
  padding: 0 8px;
  font-size: 11px;
  border: 1px solid var(--kp-border);
  background: var(--kp-glow-soft);
  color: var(--kp-fg);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  transition: all 0.16s ease;
}
.src-floor:hover {
  border-color: var(--kp-accent);
  color: var(--kp-accent);
  box-shadow: 0 0 8px var(--kp-glow-soft);
}

/* 数据来源表格（不滚动） */
.src-table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  font-size: var(--kp-text-sm);
}
.src-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 22px;
  padding: 0 4px;
  border-bottom: 1px solid var(--kp-border);
  white-space: nowrap;
  overflow: hidden;
}
.src-row--head {
  height: 20px;
  color: var(--kp-accent);
  font-weight: 600;
  background: var(--kp-glow-soft);
  border-bottom: 1px solid var(--kp-border-strong);
}
.src-name {
  color: var(--kp-fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.src-time {
  color: var(--kp-fg);
  flex-shrink: 0;
}
.src-row--empty {
  color: var(--kp-fg-muted);
  justify-content: flex-start;
  border-bottom: none;
}

/* 底部折线图容器（数据分类趋势 / 流量趋势） */
.bp-line {
  flex: 1;
  min-height: 0;
  width: 100%;
}

/* 当前状态仪表 */
.bp-gauges {
  display: flex;
  height: 100%;
  min-height: 0;
  gap: 4px;
}
.bp-gauge {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  min-width: 0;
}
.bp-gauge :deep(.echart-box) {
  flex: 1;
  min-height: 0;
}
.bp-gauge__label {
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
  margin-top: -6px;
}

/* 应急响应按钮 */
.bp-acts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 6px;
  height: 100%;
  min-height: 0;
}
.bp-act {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 0;
  border: 1px solid var(--kp-border);
  background: linear-gradient(135deg, var(--kp-glow-soft), transparent);
  color: var(--kp-fg-muted);
  font-size: var(--kp-text-sm);
  letter-spacing: 0.5px;
  cursor: pointer;
  border-radius: var(--kp-radius-sm);
  transition: all 0.18s ease;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);
}
.bp-act svg {
  color: var(--kp-accent);
  flex-shrink: 0;
}
.bp-act:hover {
  border-color: var(--kp-border-strong);
  color: var(--kp-fg);
  box-shadow: 0 0 10px var(--kp-glow-soft);
}
.bp-act.active {
  background: linear-gradient(135deg, var(--kp-accent), var(--kp-accent-secondary));
  color: var(--kp-accent-on);
  border-color: transparent;
  box-shadow: 0 0 14px var(--kp-glow);
}
.bp-act.active svg {
  color: var(--kp-accent-on);
}

/* 系统设备与能耗 / 楼栋能耗 列表 */
.bp-syslist {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.bp-sysrow {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
  min-height: 0;
  font-size: var(--kp-text-xs);
}
.bp-sysrow__name {
  width: 74px;
  flex-shrink: 0;
  color: var(--kp-fg);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bp-sysrow__bar {
  flex: 1;
  min-width: 0;
  height: 6px;
  background: var(--kp-border-soft);
  border-radius: 3px;
  overflow: hidden;
}
.bp-sysrow__bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--kp-accent), var(--kp-accent-secondary));
  box-shadow: 0 0 6px var(--kp-glow-soft);
}
.bp-sysrow__meta {
  width: 96px;
  flex-shrink: 0;
  text-align: right;
  color: var(--kp-fg-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>

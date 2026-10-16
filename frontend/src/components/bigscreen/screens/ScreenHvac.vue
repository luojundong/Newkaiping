<script setup lang="ts">
/**
 * 图2 空调与能源管控驾驶舱（参考页 #scr2 / rS2() L5091-5148 的组件化复刻）
 * 契约：docs/design/bigscreen-panel-specs.md §2
 *
 * Wave 1 范式（fe-bigscreen-shell）：屏2 空调能源「核心指标全部来自现有后端 API」。
 *   数据层 = Promise.allSettled 并行拉取：
 *     hvacApi.status()            → 设备数 / 运行数 / 故障数 / 总功率 / 平均 COP / units
 *     energyApi.summary({day})    → 今日全院能耗 kWh（REAL：总能耗）
 *     energyApi.trend({hvac})     → 空调分项趋势（当前仅作冗余探测，进出水温仍示意）
 *     alarmApi.list({hvac})       → 空调实时告警（REAL：故障告警列表）
 *     deviceApi.list({hvac})      → 全量空调设备台账（REAL：冷机/冷却塔/水泵/热泵 链路台数）
 *   任一核心接口失败 → 回退本地 S2 常量（示意）；仅当 hvac/summary/alarm/device 全部成功时 real=true。
 *
 * 8 面板：scenter 系统总览链路 / 左列 温度热力·故障告警·运行策略 / 右列 能效·占比·排名 / sbot 趋势+健康度
 * P0：零硬编码色（色值一律来自 bigscreen-palette 的 token 字符串）；图标只用 lucide-vue-next；
 *     所有示意数值经 useDataMode().v() 包装（empty 模式输出 '--'），并以 .ov-note 诚实标注「示意」。
 */
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronRight,
  Layers,
  Leaf,
  Thermometer,
  Wind,
} from 'lucide-vue-next'
import type { Alarm, Device } from '@/types/api'
import { computed, onMounted, ref, watch } from 'vue'
import BsPanel from '../BsPanel.vue'
import BsScreenHead from '../BsScreenHead.vue'
import BsDonut from '../charts/BsDonut.vue'
import BsHBar from '../charts/BsHBar.vue'
import BsLine from '../charts/BsLine.vue'
import { hvacApi, energyApi, alarmApi, deviceApi } from '@/api'
import { AREA_TOTAL, MOCK, S2 } from '@/lib/bigscreen-demo-data'
import { LEVEL_LABEL, SERIES, f0, tempColor } from '@/lib/bigscreen-palette'
import { useDataMode } from '@/lib/bigscreen-data-mode'

const props = defineProps<{ active: boolean }>()
const { v, isEmpty } = useDataMode()

/* ============================ 后端真实状态 ============================ */
const hvac = ref<Record<string, unknown> | null>(null)
const energy = ref<{ kwh: number; cost: number; carbon_kg: number; peak_kw: number } | null>(null)
const alarms = ref<Alarm[]>([])
const devices = ref<Device[]>([])
const real = ref(false)
const loaded = ref(false)

/** 空调中央空调链路段（冷机→冷却塔→冷冻水泵→热泵）对应的设备分类 id */
const CHAIN_DEFS: { nm: string; cats: string[] }[] = [
  { nm: '冷机', cats: ['screw_chiller', 'air_cooled_module'] },
  { nm: '冷却塔', cats: ['cooling_tower'] },
  { nm: '冷冻水泵', cats: ['water_pump'] },
  { nm: '热泵', cats: ['heat_pump_water'] },
]

/* ============================ 派生：中央空调链路（REAL） ============================ */
// 按真实设备台账 category_id 聚合各链路段台数 / 运行率
const link = computed(() => {
  if (!devices.value.length) return S2.link // 设备接口失败 → 回退示意链路
  return CHAIN_DEFS.map((d) => {
    const ds = devices.value.filter((x) => d.cats.includes(x.category_id))
    const total = ds.length
    const running = ds.filter((x) => x.status === 'running').length
    const load = total ? Math.round((running / total) * 100) : 0
    return { nm: d.nm, n: total, load, st: running > 0 ? 'run' : 'stop' }
  })
})

/* ============================ 派生：故障告警（REAL） ============================ */
const faults = computed<{ t: string; lv: 'u' | 'm' | 'n' }[]>(() => {
  if (alarms.value.length) {
    return alarms.value.slice(0, 8).map((a) => ({
      t: a.title || a.message,
      lv: a.level === 'critical' ? 'u' : a.level === 'warning' ? 'm' : 'n',
    }))
  }
  const fc = typeof hvac.value?.fault_count === 'number' ? (hvac.value!.fault_count as number) : 0
  if (fc > 0) return [{ t: `空调设备故障 ${fc} 台（实时）`, lv: 'm' as const }]
  return S2.faults.map((f) => ({ t: f.t, lv: f.lv as 'u' | 'm' | 'n' }))
})

/* ============================ 派生：能效 KPI ============================ */
// 总能耗：今日全院能耗 kWh（REAL）
const total = computed(() => energy.value?.kwh ?? S2.total)
// 系统 COP：实时平均 COP（REAL）
const cop = computed(() => {
  const c = hvac.value?.avg_cop
  return typeof c === 'number' ? c : S2.cop
})
// EUC 单位面积能耗：真实今日能耗 ×365 ÷ 已核建筑面积（估算，标注诚实）
const euc = computed(() => {
  const kwh = energy.value?.kwh
  if (kwh == null) return S2.euc
  return Math.round((kwh * 365 / AREA_TOTAL) * 10) / 10
})

/* ============================ 派生：占比 / 排名 / 进出水温（示意） ============================ */
// 分项占比：暂无逐系统能耗接口 → 示意（empty 模式清空环形）
const shareTotal = computed(() => S2.share.reduce((a, b) => a + b.v, 0))
const shareSegs = computed(() =>
  isEmpty.value ? [] : S2.share.map((s) => ({ v: s.v, c: s.c, total: shareTotal.value })),
)
// 楼栋能耗排名：暂无逐楼栋能耗接口 → 示意（empty 模式清空条形）
const rankItems = computed(() =>
  isEmpty.value
    ? []
    : S2.rank.map((r) => ({ nm: r.nm, val: r.v, color: SERIES.cyan, unit: ' kWh' })),
)
// 进出水温：后端未提供冷水温度序列 → 示意（empty 模式清空折线）
const waterSeries = computed(() =>
  isEmpty.value
    ? []
    : [
        { data: S2.inWater, color: SERIES.blue },
        { data: S2.outWater, color: SERIES.red },
      ],
)

/* ============================ 屏2 激活即拉取（仅一次） ============================ */
async function init(): Promise<void> {
  if (loaded.value) return
  loaded.value = true
  const [hvacRes, sumRes, trendRes, alarmRes, devRes] = await Promise.allSettled([
    hvacApi.status(),
    energyApi.summary({ period: 'day' }),
    energyApi.trend({ subsystem: 'hvac' }),
    alarmApi.list({ subsystem: 'hvac' }),
    deviceApi.list({ subsystem: 'hvac', limit: 5000 }),
  ])

  let ok = true
  if (hvacRes.status === 'fulfilled') hvac.value = hvacRes.value
  else ok = false
  if (sumRes.status === 'fulfilled') energy.value = sumRes.value
  else ok = false
  if (alarmRes.status === 'fulfilled') alarms.value = alarmRes.value.items
  else ok = false
  if (devRes.status === 'fulfilled') devices.value = devRes.value.items
  else ok = false
  // trendRes 仅作冗余探测（进出水温仍为示意），不计入 real 门槛
  void trendRes
  real.value = ok
}

watch(
  () => props.active,
  (on) => {
    if (on) void init()
  },
  { immediate: true },
)
onMounted(() => {
  if (props.active) void init()
})
</script>

<template>
  <section class="bs-screen bs-screen--flat" :class="{ 'is-on': active }">
    <BsScreenHead :no="2" />

    <!-- 中央：空调系统总览链路（REAL：按设备台账分类聚合） -->
    <BsPanel
      class="scenter"
      title="空调系统总览（冷机→冷却塔→水泵→末端）"
      :icon="Wind"
      no-chev
    >
      <div class="chain">
        <template v-for="(nd, i) in link" :key="nd.nm">
          <div v-if="i > 0" class="arrow"><ChevronRight :size="18" /></div>
          <div class="node">
            <span class="st" :class="nd.st">{{ nd.st === 'run' ? '运行' : '停' }}</span>
            <span class="cn">{{ nd.nm }}</span>
            <span class="cv">{{ v(nd.n) }} 台</span>
            <span class="cl" :style="{ color: SERIES.cyan }">{{ v(`${nd.load}%`) }}</span>
            <span class="cv">负载</span>
          </div>
        </template>
      </div>
    </BsPanel>

    <!-- 左列 1：分区温度热力（示意：后端未提供点位温度） -->
    <BsPanel class="col col-l pl1 h250" title="分区温度热力" :icon="Thermometer" no-chev>
      <div class="heat">
        <div
          v-for="(t, i) in S2.zones"
          :key="i"
          class="cell"
          :style="{ background: tempColor(t) }"
        >
          {{ v(t) }}<small>℃</small>
        </div>
      </div>
      <div class="ov-note">分区温度为示意值（后端未提供点位温度）</div>
    </BsPanel>

    <!-- 左列 2：故障告警（REAL：空调实时告警） -->
    <BsPanel class="col col-l pl2 h250" title="故障告警" :icon="AlertTriangle" no-chev>
      <div class="lst">
        <div v-for="x in faults" :key="x.t" class="it">
          <span class="tg" :class="x.lv">{{ LEVEL_LABEL[x.lv] }}</span>
          <span class="tx">{{ x.t }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 3：运行策略 / 逆控状态（示意：控制策略配置） -->
    <BsPanel class="col col-l pl3 h250" title="运行策略 / 逆控状态" :icon="Leaf" no-chev>
      <div class="strat">
        <div v-for="s in S2.strategy" :key="s" class="row-line">
          <span class="nm"><Leaf :size="14" /> {{ s }}</span>
          <span class="vl ok">已启用</span>
        </div>
        <div class="row-line">
          <span class="nm">逆控控制</span>
          <span class="vl ok">{{ v(S2.invCtrl) }}</span>
        </div>
      </div>
      <div class="ov-note">运行策略 / 逆控状态为示意值</div>
    </BsPanel>

    <!-- 右列 1：能效分析（总能耗 REAL / COP REAL / EUC 估算） -->
    <BsPanel class="col col-r pl1 h250" title="能效分析" :icon="BarChart3" no-chev>
      <div class="kpis">
        <div class="kpi cyan">
          <div class="k">总能耗</div>
          <div class="v">{{ v(f0(total)) }}<span class="u">kWh</span></div>
        </div>
        <div class="kpi blue">
          <div class="k">EUC 单位面积</div>
          <div class="v">{{ v(euc) }}<span class="u">kWh/m²·a</span></div>
        </div>
        <div class="kpi green">
          <div class="k">系统 COP</div>
          <div class="v">{{ v(cop) }}</div>
        </div>
      </div>
      <div class="ov-note">EUC 为单位面积能耗估算值（今日能耗×365÷建筑面积），COP 为实时真值</div>
    </BsPanel>

    <!-- 右列 2：能耗占比（示意：暂无逐系统能耗接口） -->
    <BsPanel class="col col-r pl2 h250" title="能耗占比" :icon="Layers" no-chev>
      <div class="on-wrap">
        <div class="donut">
          <BsDonut :size="140" :r="52" :sw="16" :segs="shareSegs" />
          <div class="ct">
            <div class="n">{{ v(`${shareTotal}%`) }}</div>
            <div class="l">总能耗占比</div>
          </div>
        </div>
        <div class="on-leg">
          <div v-for="s in S2.share" :key="s.nm" class="li">
            <i :style="{ background: s.c }" />
            <span class="nm">{{ s.nm }}</span>
            <span class="rt"><span class="n">{{ v(`${s.v}%`) }}</span></span>
          </div>
        </div>
      </div>
      <div class="ov-note">分项占比为示意值</div>
    </BsPanel>

    <!-- 右列 3：能耗排名（按楼栋）（示意：暂无逐楼栋能耗接口） -->
    <BsPanel class="col col-r pl3 h250" title="能耗排名（按楼栋）" :icon="Building2" no-chev>
      <BsHBar :w="440" :h="186" :items="rankItems" />
      <div class="ov-note">楼栋排名为示意值</div>
    </BsPanel>

    <!-- 底条：进出水温趋势（示意）+ 设备健康度（示意） -->
    <BsPanel class="sbot" title="运行趋势（进出水温） / 设备健康度" :icon="Activity" no-chev>
      <div class="botrow">
        <div class="bot-l">
          <div class="mini">运行趋势 · 进出水温（℃）近 7 日（示意）</div>
          <BsLine :w="900" :h="70" :series="waterSeries" :labels="MOCK.days" />
          <div class="legend">
            <span class="li"><i :style="{ background: SERIES.blue }" />进水</span>
            <span class="li"><i :style="{ background: SERIES.red }" />出水</span>
          </div>
        </div>
        <div class="bot-r">
          <div class="mini">设备健康度（6 台，示意）</div>
          <div class="hcards">
            <div v-for="hd in S2.health" :key="hd.n" class="hcard">
              <div class="hn">{{ hd.n }}</div>
              <div class="hv" :style="{ color: hd.c }">{{ v(hd.v) }}</div>
              <div class="hs" :style="{ color: hd.c }">{{ hd.s }}</div>
            </div>
          </div>
          <div class="ov-note">设备健康度为示意值</div>
        </div>
      </div>
    </BsPanel>
  </section>
</template>

<style scoped>
/* 运行策略列表纵向排布（参考页内联 flex-column gap:6px 的类化） */
.strat {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* 策略行图标继承 currentColor（lucide 默认 stroke=currentColor），色值走令牌 */
.strat .row-line .nm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.strat .row-line .nm svg {
  color: var(--kp-success);
  flex: none;
}
/* 底条两栏（参考页内联 flex gap:14px） */
.botrow {
  display: flex;
  gap: 14px;
  height: 100%;
}
.bot-l {
  flex: 1.3;
  min-width: 0;
}
.bot-r {
  flex: 1;
  min-width: 0;
}
.bot-l .mini,
.bot-r .mini {
  margin-bottom: 2px;
}
/* 底条高度 94px：6 台健康度卡走单行（参考页 3 列 2 行会被 p-bd overflow 裁掉一半） */
.bot-r .hcards {
  height: calc(100% - 20px);
}
</style>

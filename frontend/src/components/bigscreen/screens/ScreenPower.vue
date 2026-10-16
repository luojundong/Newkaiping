<script setup lang="ts">
/**
 * 图4 供配电与计量驾驶舱（参考页 #scr4 / rS4() L5196-5240 的组件化复刻）
 * 契约：docs/design/bigscreen-panel-specs.md §4
 *
 * ★ Wave 范式（对齐 ScreenHero / ScreenArea）：S4 配电实时数据来自后端
 *   GET /power/status（经 powerApi.status → SubsystemService.status(building_id,'power')）
 *   与 GET /energy/trend?subsystem=power（经 energyApi.trend）。
 *   - 总有功/总电流/功率因数/THD、三相电压/电流/功率、馈线 → 真实；
 *   - 用电需求趋势（近 7 日）：后端 power 能耗尚未计量（kwh 全 0），
 *     此时如实显示「用电计量待接入」，绝不臆造用电数；
 *   - 异常用能 / 计量体系树 / 能耗排名 / 能耗结构 暂无对应实时接口，保留示意值作回退。
 *
 * 8 面板：scenter 配电总览 / 左列 变压器负载·馈线状态·异常用能 / 右列 计量体系树·需求趋势·电能质量 / sbot 三栏
 */
import { Activity, AlertTriangle, BarChart3, Grid3x3, Layers, Zap } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import BsPanel from '../BsPanel.vue'
import BsScreenHead from '../BsScreenHead.vue'
import BsDonut from '../charts/BsDonut.vue'
import BsHBar from '../charts/BsHBar.vue'
import BsLine from '../charts/BsLine.vue'
import { S4 } from '@/lib/bigscreen-demo-data'
import { LEVEL_LABEL, SERIES, f0, f2 } from '@/lib/bigscreen-palette'
import { useDataMode } from '@/lib/bigscreen-data-mode'
import { powerApi, energyApi } from '@/api'

const props = defineProps<{ active: boolean }>()

const { v } = useDataMode()

/* ============================ 实时数据层 ============================ */
interface PowerPhase {
  phase: string
  voltage_v: number
  current_a: number
  power_kw: number
}

const status = ref<Awaited<ReturnType<typeof powerApi.status>> | null>(null)
const trend = ref<Awaited<ReturnType<typeof energyApi.trend>> | null>(null)
/** 仅当 /power/status 成功才为 true（能耗趋势缺口不阻断 real） */
const real = ref(false)
const loaded = ref(false)

async function init(): Promise<void> {
  if (loaded.value) return
  loaded.value = true
  const [st, tr] = await Promise.allSettled([
    powerApi.status(),
    energyApi.trend({ subsystem: 'power' }),
  ])
  status.value = st.status === 'fulfilled' ? st.value : null
  trend.value = tr.status === 'fulfilled' ? tr.value : null
  real.value = st.status === 'fulfilled'
}

// 屏激活即拉取（仅一次；loaded 守卫防重复）
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

/* ============================ 真实派生值 ============================ */
const phases = computed<PowerPhase[]>(() => {
  const p = status.value?.phases
  return Array.isArray(p) ? (p as PowerPhase[]) : []
})

function num(x: unknown): number | null {
  return typeof x === 'number' && !Number.isNaN(x) ? x : null
}
function r1(n: number | null): number {
  return n == null ? 0 : Math.round(n * 10) / 10
}
function r2(n: number | null): number {
  return n == null ? 0 : Math.round(n * 100) / 100
}
function fmtKw(n: number | null): string {
  return n == null ? '—' : `${f2(n)} kW`
}
function fmtA(n: number | null): string {
  return n == null ? '—' : `${f0(n)} A`
}
function fmtV(n: number | null): string {
  return n == null ? '—' : `${f0(n)} V`
}
function fmt2(n: number | null): string {
  return n == null ? '—' : f2(n)
}
function fmtPct(n: number | null): string {
  return n == null ? '—' : `${f2(n)} %`
}

const totalPowerKw = computed(() => num(status.value?.total_power_kw))
const totalCurrentA = computed(() => num(status.value?.total_current_a))
const powerFactor = computed(() => num(status.value?.power_factor))
const thdPct = computed(() => num(status.value?.thd_percent))

/** scenter 总览：4 项真实电气参数（总有功/总电流/功率因数/THD） */
const totalKpis = computed(() => [
  { k: '总有功功率', t: fmtKw(totalPowerKw.value) },
  { k: '总电流', t: fmtA(totalCurrentA.value) },
  { k: '功率因数', t: fmt2(powerFactor.value) },
  { k: '谐波 THD', t: fmtPct(thdPct.value) },
])

/** 三相电压/电流/功率（实时，来自 /power/status.phases） */
const phaseGrid = computed(() =>
  phases.value.map((p) => ({
    nm: `${p.phase}相`,
    v: fmtV(p.voltage_v),
    a: fmtA(p.current_a),
    kw: fmtKw(p.power_kw),
  })),
)

/** 变压器负载条 → 三相功率（实时）；无相位数据时回退示意变压器负载率 */
const transItems = computed(() => {
  const ps = phases.value
  if (!ps.length) {
    return S4.transLoad.map((t) => ({
      nm: t.nm,
      val: t.v,
      color: t.v > 60 ? SERIES.amber : SERIES.green,
      unit: '%',
    }))
  }
  const avg = ps.reduce((s, p) => s + p.power_kw, 0) / ps.length
  return ps.map((p) => ({
    nm: `${p.phase}相`,
    val: r1(p.power_kw),
    color: p.power_kw > avg * 1.15 ? SERIES.amber : SERIES.green,
    unit: ' kW',
  }))
})

/** 电能质量（5 项）：电压偏差/三相不平衡由真实相位电压推导；THD/功率因数取真实值；
 *  频率偏差后端暂无接口 → 回退示意；无 status 时整组回退示意。 */
const qualityItems = computed(() => {
  const st = status.value
  if (!st) {
    return S4.quality.map((q) => ({
      nm: q.nm,
      val: q.v,
      max: q.max,
      color: q.st === 'ok' ? SERIES.green : SERIES.amber,
      unit: q.u,
    }))
  }
  const ps = phases.value
  const avgV = ps.length ? ps.reduce((s, p) => s + p.voltage_v, 0) / ps.length : 220
  const vBias = ((avgV - 220) / 220) * 100
  const unbalance =
    ps.length
      ? (Math.max(...ps.map((p) => p.voltage_v)) - Math.min(...ps.map((p) => p.voltage_v))) /
        (avgV || 1) *
        100
      : 0
  const thd = thdPct.value ?? 0
  const pf = powerFactor.value ?? 0
  const freqDemo = S4.quality.find((q) => q.nm === '频率偏差')?.v ?? 0.03
  return [
    {
      nm: '电压偏差',
      val: r1(vBias),
      max: 5,
      color: Math.abs(vBias) > 3 ? SERIES.amber : SERIES.green,
      unit: '%',
    },
    { nm: '频率偏差', val: r2(freqDemo), max: 0.2, color: SERIES.green, unit: 'Hz' },
    {
      nm: '谐波畸变',
      val: r1(thd),
      max: 5,
      color: thd > 4 ? SERIES.amber : SERIES.green,
      unit: '%',
    },
    {
      nm: '三相不平衡',
      val: r1(unbalance),
      max: 4,
      color: unbalance > 2 ? SERIES.amber : SERIES.green,
      unit: '%',
    },
    {
      nm: '功率因数',
      val: r2(pf),
      max: 1,
      color: pf < 0.9 ? SERIES.amber : SERIES.green,
      unit: '',
    },
  ]
})

/** 馈线状态：真实 feeders 若存在则用之，否则回退示意 */
const feeders = computed(() => {
  const f = status.value?.feeders
  if (Array.isArray(f) && f.length) {
    return (f as { nm: string; st: string }[]).map((x) => ({ nm: x.nm, st: x.st }))
  }
  return S4.feeders
})

/** 需求趋势（近 7 日）：power 能耗尚未计量（kwh 全 0）→ 如实显示待接入，不臆造 */
const demandHasData = computed(() => {
  const pts = trend.value?.points ?? []
  return pts.length > 0 && pts.some((p) => (p.kwh ?? 0) > 0)
})
const demandSeries = computed(() => {
  const pts = trend.value?.points ?? []
  if (!demandHasData.value) return []
  return [{ data: pts.map((p) => p.kwh), color: SERIES.cyan }]
})
const demandLabels = computed(() => (trend.value?.points ?? []).map((p) => (p.time || '').slice(5)))

/* ============================ 示意回退（暂无实时接口） ============================ */
const abnormalItems = computed(() => S4.abnormal)
const treeItems = computed(() => S4.tree)
const rankItems = computed(() =>
  S4.rank.map((r) => ({ nm: r.nm, val: r.v, color: SERIES.cyan, unit: ' kWh' })),
)
const structureSegs = computed(() => S4.structure.map((s) => ({ v: s.v, c: s.c, total: 100 })))
</script>

<template>
  <section class="bs-screen bs-screen--flat" :class="{ 'is-on': active }">
    <BsScreenHead :no="4" />

    <!-- 中央：配电总览（2 路 10kV + 2 变压器） -->
    <BsPanel class="scenter" title="配电总览（2 路 10kV + 2 变压器）" :icon="Zap" no-chev>
      <div class="ovrow">
        <div class="ov-l">
          <div class="row-line" v-for="k in totalKpis" :key="k.k">
            <span class="nm">{{ k.k }}</span>
            <span class="vl">{{ v(k.t) }}</span>
          </div>
        </div>
        <div class="ov-r">
          <BsHBar :w="400" :h="150" :items="transItems" />
          <div class="mini ov-cap">三相功率（实时 kW）</div>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 1：变压器负载 -->
    <BsPanel class="col col-l pl1 h250" title="变压器负载" :icon="BarChart3" no-chev>
      <BsHBar :w="440" :h="150" :items="transItems" />
      <div class="phasegrid">
        <div class="pg-h"><span>相</span><span>电压</span><span>电流</span><span>功率</span></div>
        <div class="pg-r" v-for="p in phaseGrid" :key="p.nm">
          <span class="pn">{{ p.nm }}</span>
          <span>{{ v(p.v) }}</span>
          <span>{{ v(p.a) }}</span>
          <span>{{ v(p.kw) }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 2：馈线状态（6 路） -->
    <BsPanel class="col col-l pl2 h250" title="馈线状态（6 路）" :icon="Grid3x3" no-chev>
      <div class="lst">
        <div v-for="x in feeders" :key="x.nm" class="it">
          <span class="tx">{{ x.nm }}</span>
          <span class="vl" :class="x.st === 'ok' ? 'ok' : 'warn'">
            {{ v(x.st === 'ok' ? '正常' : '告警') }}
          </span>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 3：异常用能 -->
    <BsPanel class="col col-l pl3 h250" title="异常用能" :icon="AlertTriangle" no-chev>
      <div class="lst">
        <div v-for="x in abnormalItems" :key="x.t" class="it">
          <span class="tg" :class="x.lv">{{ LEVEL_LABEL[x.lv] }}</span>
          <span class="tx">{{ v(x.t) }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 1：计量体系树 -->
    <BsPanel class="col col-r pl1 h250" title="计量体系树" :icon="Layers" no-chev>
      <div class="tree">
        <div v-for="n in treeItems" :key="n.nm" class="b">
          <div class="bh">
            <Layers :size="14" />{{ n.nm }}<span class="ct">{{ v(n.v) }}</span>
          </div>
          <div v-for="c in n.ch" :key="c.nm" class="fl">
            {{ c.nm }}
            <div v-if="c.ch" class="leafwrap">
              <div v-for="cc in c.ch" :key="cc.nm" class="rm">{{ cc.nm }} · {{ v(cc.v) }}</div>
            </div>
          </div>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 2：需求趋势（近 7 日） -->
    <BsPanel class="col col-r pl2 h250" title="需求趋势（近 7 日）" :icon="BarChart3" no-chev>
      <div class="mini">用电需求（kWh）近 7 日</div>
      <BsLine v-if="demandHasData" :w="440" :h="160" :series="demandSeries" :labels="demandLabels" />
      <div v-else class="mini pending">用电计量待接入 · 暂无 7 日用电曲线</div>
    </BsPanel>

    <!-- 右列 3：电能质量（5 项） -->
    <BsPanel class="col col-r pl3 h250" title="电能质量（5 项）" :icon="Activity" no-chev>
      <BsHBar :w="440" :h="186" :items="qualityItems" />
    </BsPanel>

    <!-- 底条：异常用能 / 能耗排名 / 能耗结构 -->
    <BsPanel class="sbot" title="异常用能 / 能耗排名 / 能耗结构" :icon="Layers" no-chev>
      <div class="botrow">
        <div class="bcol">
          <div class="mini">异常用能</div>
          <div class="lst lst--auto">
            <div v-for="x in abnormalItems" :key="x.t" class="it">
              <span class="tg" :class="x.lv">{{ LEVEL_LABEL[x.lv] }}</span>
              <span class="tx">{{ v(x.t) }}</span>
            </div>
          </div>
        </div>
        <div class="bcol">
          <div class="mini">能耗排名（楼栋）</div>
          <BsHBar :w="600" :h="72" :items="rankItems" />
        </div>
        <div class="bcol bcol--donut">
          <div class="mini">能耗结构</div>
          <div class="dwrap">
            <BsDonut :size="76" :r="30" :sw="10" :segs="structureSegs" />
            <div class="legend legend--col">
              <span v-for="s in S4.structure" :key="s.nm" class="li">
                <i :style="{ background: s.c }" />{{ s.nm }} {{ v(`${s.v}%`) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </BsPanel>
  </section>
</template>

<style scoped>
/* 中央两栏（参考页内联 flex gap:14px align-items:center） */
.ovrow {
  display: flex;
  gap: 14px;
  height: 100%;
  align-items: center;
}
.ov-l,
.ov-r {
  flex: 1;
  min-width: 0;
}
.ov-l .row-line {
  padding: 3px 0;
}
.ov-cap {
  text-align: center;
  color: var(--kp-fg-subtle);
}
/* 变压器负载面板：三相参数紧凑表（电压/电流/功率，真实） */
.phasegrid {
  margin-top: 8px;
  font-size: 12px;
}
.pg-h,
.pg-r {
  display: grid;
  grid-template-columns: 44px 1fr 1fr 1fr;
  gap: 6px;
  align-items: center;
}
.pg-h {
  color: var(--kp-fg-subtle);
  border-bottom: 1px solid var(--kp-edge);
  padding-bottom: 3px;
  margin-bottom: 3px;
}
.pg-r .pn {
  color: var(--kp-fg-body);
  font-weight: 700;
}
.pg-r span:not(.pn) {
  font-variant-numeric: tabular-nums;
}
/* 计量树三级缩进（参考页内联 margin-left:14px） */
.leafwrap {
  margin-left: 14px;
}
/* 树头图标着色（lucide stroke=currentColor） */
.tree .bh svg {
  color: var(--kp-accent);
  flex: none;
}
/* 馈线状态值（参考页把 .vl 放进 .lst .it，但只给 .row-line .vl 定义了颜色 → 此处补齐令牌配色） */
.lst .it .vl {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--kp-fg-body);
  flex: none;
}
.lst .it .vl.ok {
  color: var(--kp-success);
}
.lst .it .vl.warn {
  color: var(--kp-warn);
}
/* 底条三栏 */
.botrow {
  display: flex;
  gap: 14px;
  height: 100%;
}
.bcol {
  flex: 1;
  min-width: 0;
}
.bcol--donut {
  flex: 0 0 300px;
}
.lst--auto {
  height: auto;
}
.dwrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.legend--col {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin: 0;
}
/* 用电计量待接入提示（真实缺口，诚实标注，不臆造） */
.pending {
  color: var(--kp-warn);
  margin-top: 18px;
}
</style>

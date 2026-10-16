<script setup lang="ts">
/**
 * 图5 告警工单驾驶舱（参考页 #scr5 / rS5() L5242-5278 的组件化复刻）
 * 契约：docs/design/bigscreen-panel-specs.md §5
 *
 * 8 面板：scenter 近 7 日告警趋势大图 / 左列 告警中心·实时告警表·等级分布 / 右列 漏斗·响应时效·闭环统计 / sbot 流程+团队
 */
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Users,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import BsPanel from '../BsPanel.vue'
import BsScreenHead from '../BsScreenHead.vue'
import BsDonut from '../charts/BsDonut.vue'
import BsHBar from '../charts/BsHBar.vue'
import BsLine from '../charts/BsLine.vue'
import { MOCK, S5 } from '@/lib/bigscreen-demo-data'
import { LEVEL_LABEL, SERIES } from '@/lib/bigscreen-palette'
import { useDataMode } from '@/lib/bigscreen-data-mode'
import { alarmApi, workOrderApi } from '@/api'
import type { Alarm, WorkOrder, WorkOrderStats } from '@/types/api'

const props = defineProps<{ active: boolean }>()

const { v } = useDataMode()

/* ============================ 数据层（Wave 范式：refs + Promise.allSettled 容错） ============================ */
const alarms = ref<Alarm[]>([])
const woStats = ref<WorkOrderStats | null>(null)
const woList = ref<WorkOrder[]>([])
const real = ref(false)
const inited = ref(false)

interface AlarmAgg {
  total: number
  critical: number
  warning: number
  info: number
  trendLabels: string[]
  trendCritical: number[]
  trendWarning: number[]
  trendInfo: number[]
}
const EMPTY_AGG: AlarmAgg = {
  total: 0,
  critical: 0,
  warning: 0,
  info: 0,
  trendLabels: [],
  trendCritical: [],
  trendWarning: [],
  trendInfo: [],
}

/** 复用 ScreenHero 的聚合思路：按 first_at 日切片近 7 日 + 等级计数 */
function aggregateAlarms(items: Alarm[]): AlarmAgg {
  let critical = 0
  let warning = 0
  let info = 0
  const dayMap = new Map<string, { c: number; w: number; i: number }>()
  for (const a of items) {
    if (a.level === 'critical') critical++
    else if (a.level === 'warning') warning++
    else info++
    const day = (a.first_at || '').slice(0, 10)
    if (!day) continue
    const m = dayMap.get(day) ?? { c: 0, w: 0, i: 0 }
    m.c++
    m.w++
    m.i++
    dayMap.set(day, m)
  }
  const days = [...dayMap.keys()].sort().slice(-7)
  return {
    total: items.length,
    critical,
    warning,
    info,
    trendLabels: days.map((d) => d.slice(5)),
    trendCritical: days.map((d) => dayMap.get(d)!.c),
    trendWarning: days.map((d) => dayMap.get(d)!.w),
    trendInfo: days.map((d) => dayMap.get(d)!.i),
  }
}

const alarmAgg = ref<AlarmAgg>({ ...EMPTY_AGG })

async function init(): Promise<void> {
  if (inited.value) return
  inited.value = true
  const [aRes, wRes, lRes] = await Promise.allSettled([
    alarmApi.list({}),
    workOrderApi.stats(),
    workOrderApi.list({ limit: 50 }),
  ])
  let ok = true
  if (aRes.status === 'fulfilled') {
    alarms.value = aRes.value.items
    alarmAgg.value = aggregateAlarms(aRes.value.items)
  } else ok = false
  if (wRes.status === 'fulfilled') woStats.value = wRes.value
  else ok = false
  if (lRes.status === 'fulfilled') woList.value = lRes.value.items
  else ok = false
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

/** 近 7 日告警趋势（紧急 / 重要 / 一般） */
const trendSeries = computed(() =>
  real.value
    ? [
        { data: alarmAgg.value.trendCritical, color: SERIES.red },
        { data: alarmAgg.value.trendWarning, color: SERIES.amber },
        { data: alarmAgg.value.trendInfo, color: SERIES.blue },
      ]
    : [
        { data: MOCK.alarmU7, color: SERIES.red },
        { data: MOCK.alarmM7, color: SERIES.amber },
        { data: MOCK.alarmN7, color: SERIES.blue },
      ],
)
const trendLabels = computed(() => (real.value ? alarmAgg.value.trendLabels : MOCK.days))

/** 等级分布 donut（紧急红 / 重要橙 / 一般蓝，总数 = 等级合计） */
const levelSegs = computed(() =>
  real.value
    ? [
        { v: alarmAgg.value.critical, c: SERIES.red, total: alarmAgg.value.total, nm: '紧急' },
        { v: alarmAgg.value.warning, c: SERIES.amber, total: alarmAgg.value.total, nm: '重要' },
        { v: alarmAgg.value.info, c: SERIES.blue, total: alarmAgg.value.total, nm: '一般' },
      ]
    : [
        { v: S5.urgent, c: SERIES.red, total: S5.levelDist, nm: '紧急' },
        { v: S5.major, c: SERIES.amber, total: S5.levelDist, nm: '重要' },
        { v: S5.minor, c: SERIES.blue, total: S5.levelDist, nm: '一般' },
      ],
)
const levelTotal = computed(() => (real.value ? alarmAgg.value.total : S5.levelDist))

/** 告警中心 KPI（紧急 / 重要 / 一般） */
const urgentVal = computed(() => (real.value ? alarmAgg.value.critical : S5.urgent))
const majorVal = computed(() => (real.value ? alarmAgg.value.warning : S5.major))
const minorVal = computed(() => (real.value ? alarmAgg.value.info : S5.minor))

/** 实时告警表（真实 items：title / level / first_at） */
function levelKey(lv: string): 'u' | 'm' | 'n' {
  return lv === 'critical' ? 'u' : lv === 'warning' ? 'm' : 'n'
}
function fmtTs(s: string): string {
  return s ? s.slice(5, 16).replace('T', ' ') : ''
}
const alarmRows = computed(() =>
  real.value
    ? alarms.value.slice(0, 8).map((a) => ({
        t: a.title,
        lv: levelKey(a.level),
        tm: fmtTs(a.first_at),
      }))
    : S5.alarms,
)

/** 响应时效（后端暂无对应接口 → 保持示意值，仅作兜底） */
const respItems = computed(() =>
  S5.resp.map((r) => ({ nm: r.nm, val: r.v, color: SERIES.blue, unit: ' 单' })),
)

/** 派单处置漏斗（真实工单生命周期，来自 workOrderApi.stats） */
const funnel = computed(() => {
  if (real.value && woStats.value) {
    const s = woStats.value
    const total = s.total
    const pending = s.processing + s.feedback + s.unfinished
    const dispatched = total - pending
    const onsite = pending
    const handling = s.processing
    const closed = s.completed + s.closed
    return [
      { nm: '告警产生', v: total },
      { nm: '自动派单', v: dispatched },
      { nm: '现场响应', v: onsite },
      { nm: '处置中', v: handling },
      { nm: '闭环', v: closed },
    ]
  }
  return S5.funnel
})
/** 漏斗条宽（参考页 max(20, v/首值*100)） */
function funnelWidth(val: number): string {
  const mx = funnel.value[0]?.v || 1
  return `${Math.max(20, (val / mx) * 100).toFixed(1)}%`
}

/** 闭环统计（近 7 日 创建 / 完成，来自 workOrderApi.list） */
const closedData = computed(() => {
  if (real.value && woList.value.length) {
    const dayMap = new Map<string, { c: number; d: number }>()
    for (const w of woList.value) {
      const day = (w.created_at || '').slice(0, 10)
      if (!day) continue
      const m = dayMap.get(day) ?? { c: 0, d: 0 }
      m.c++
      if (w.status === 'completed' || w.status === 'closed') m.d++
      dayMap.set(day, m)
    }
    const days = [...dayMap.keys()].sort().slice(-7)
    return {
      series: [
        { data: days.map((d) => dayMap.get(d)!.c), color: SERIES.cyan },
        { data: days.map((d) => dayMap.get(d)!.d), color: SERIES.green },
      ],
      labels: days.map((d) => d.slice(5)),
    }
  }
  return {
    series: [
      { data: S5.closedNew, color: SERIES.cyan },
      { data: S5.closedDone, color: SERIES.green },
    ],
    labels: MOCK.days,
  }
})
const closedSeries = computed(() => closedData.value.series)
const closedLabels = computed(() => closedData.value.labels)
</script>

<template>
  <section class="bs-screen bs-screen--flat" :class="{ 'is-on': active }">
    <BsScreenHead :no="5" />

    <!-- 中央：近 7 日告警趋势 -->
    <BsPanel class="scenter" title="近 7 日告警趋势" :icon="BarChart3" no-chev>
      <div class="mini">近 7 日告警趋势（紧急 / 重要 / 一般）</div>
      <BsLine :w="830" :h="420" :series="trendSeries" :labels="trendLabels" />
      <div class="legend">
        <span class="li"><i :style="{ background: SERIES.red }" />紧急</span>
        <span class="li"><i :style="{ background: SERIES.amber }" />重要</span>
        <span class="li"><i :style="{ background: SERIES.blue }" />一般</span>
      </div>
    </BsPanel>

    <!-- 左列 1：告警中心 -->
    <BsPanel class="col col-l pl1 h250" title="告警中心" :icon="AlertTriangle" no-chev>
      <div class="kpis">
        <div class="kpi red">
          <div class="k">紧急</div>
          <div class="v">{{ v(S5.urgent) }}<span class="u">条</span></div>
        </div>
        <div class="kpi amber">
          <div class="k">重要</div>
          <div class="v">{{ v(S5.major) }}<span class="u">条</span></div>
        </div>
        <div class="kpi blue">
          <div class="k">一般</div>
          <div class="v">{{ v(S5.minor) }}<span class="u">条</span></div>
        </div>
      </div>
      <div class="ov-note">告警中心为示意值，接入告警引擎后由后端实时推送</div>
    </BsPanel>

    <!-- 左列 2：实时告警表 -->
    <BsPanel class="col col-l pl2 h250" title="实时告警表" :icon="ClipboardList" no-chev>
      <table class="tbl">
        <thead>
          <tr><th>告警内容</th><th>等级</th><th>时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in S5.alarms" :key="a.t">
            <td>{{ a.t }}</td>
            <td><span class="tg" :class="a.lv">{{ LEVEL_LABEL[a.lv] }}</span></td>
            <td>{{ v(a.tm) }}</td>
          </tr>
        </tbody>
      </table>
    </BsPanel>

    <!-- 左列 3：等级分布 -->
    <BsPanel class="col col-l pl3 h250" title="等级分布" :icon="ChevronRight" no-chev>
      <div class="on-wrap">
        <div class="donut">
          <BsDonut :size="140" :r="52" :sw="16" :segs="levelSegs" />
          <div class="ct">
            <div class="n">{{ v(S5.levelDist) }}</div>
            <div class="l">等级总数</div>
          </div>
        </div>
        <div class="on-leg">
          <div v-for="s in levelSegs" :key="s.nm" class="li">
            <i :style="{ background: s.c }" />
            <span class="nm">{{ s.nm }}</span>
            <span class="rt"><span class="n">{{ v(s.v) }}</span></span>
          </div>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 1：派单处置漏斗 -->
    <BsPanel class="col col-r pl1 h250" title="派单处置漏斗" :icon="ChevronRight" no-chev>
      <div class="funnel">
        <div v-for="st in S5.funnel" :key="st.nm" class="f">
          <div class="fb" :style="{ width: funnelWidth(st.v), background: SERIES.cyan }">
            {{ st.nm }} {{ v(st.v) }}
          </div>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 2：响应时效 -->
    <BsPanel class="col col-r pl2 h250" title="响应时效" :icon="Clock" no-chev>
      <BsHBar :w="440" :h="186" :items="respItems" />
    </BsPanel>

    <!-- 右列 3：闭环统计 -->
    <BsPanel class="col col-r pl3 h250" title="闭环统计" :icon="CheckCircle2" no-chev>
      <div class="mini">闭环 创建 / 完成（近 7 日）</div>
      <BsLine :w="440" :h="160" :series="closedSeries" :labels="closedLabels" />
    </BsPanel>

    <!-- 底条：处置流程 / 维护团队 -->
    <BsPanel class="sbot" title="处置流程 / 维护团队" :icon="Users" no-chev>
      <div class="botrow">
        <div class="bot-l">
          <div class="mini">处置流程（5 步）</div>
          <div class="steps">
            <span v-for="(s, i) in S5.steps" :key="s" class="step">{{ i + 1 }}. {{ s }}</span>
          </div>
        </div>
        <div class="bot-r">
          <div class="mini">维护团队</div>
          <div class="teamrow">
            <Users :size="34" />
            <div>
              <div class="num num--team">{{ v(S5.team) }}</div>
              <div class="lbl">在岗工程师（人 · 示意值）</div>
            </div>
          </div>
        </div>
      </div>
    </BsPanel>
  </section>
</template>

<style scoped>
/* 底条两栏 */
.botrow {
  display: flex;
  gap: 14px;
  height: 100%;
}
.bot-l {
  flex: 1.4;
  min-width: 0;
}
.bot-r {
  flex: 1;
  min-width: 0;
}
/* 处置流程药丸（参考页内联 rgba(53,197,255,.12) + #EAF6FF → 令牌化） */
.steps {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.step {
  background: rgba(var(--kp-accent-rgb), 0.12);
  border: 1px solid var(--kp-accent);
  border-radius: 14px;
  padding: 4px 12px;
  font-size: var(--kp-text-sm);
  color: var(--kp-fg);
  white-space: nowrap;
}
/* 维护团队 */
.teamrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.teamrow svg {
  color: var(--kp-accent);
  flex: none;
}
.num--team {
  font-size: 32px;
  line-height: 1.05;
}
</style>

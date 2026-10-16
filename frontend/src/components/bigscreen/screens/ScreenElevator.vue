<script setup lang="ts">
/**
 * 图3 电梯安全运行驾驶舱（参考页 #scr3 / rS3() L5151-5194 的组件化复刻）
 * 契约：docs/design/bigscreen-panel-specs.md §3
 *
 * 8 面板：scenter 电梯编号表 / 左列 总览·故障告警·运行统计 / 右列 井道行程·维保计划·工单统计 / sbot 4 KPI
 *
 * ★ Wave 范式（参考 ScreenHero / useBigscreenOverview）：电梯状态走 elevatorApi.status()，
 *   故障告警走 alarmApi.list({subsystem:'elevator'})；两接口并行 allSettled，
 *   成功用真实值，失败回退本地示意（S3 / MOCK）。real 仅当两接口均成功置 true。
 *
 * 真实可映射字段（后端 elevator/status 聚合，synthetic.aggregate.ts:202）：
 *   elevator_count / total_runs / total_energy_kwh / regen_kwh / standby_kwh
 * 每梯明细（编号/楼层/状态/井道位置/维保）后端 units 暂未下发 → 经 v() 标为示意。
 */
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Grid3x3,
  Users,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import BsPanel from '../BsPanel.vue'
import BsScreenHead from '../BsScreenHead.vue'
import BsStack from '../charts/BsStack.vue'
import { MOCK, S3 } from '@/lib/bigscreen-demo-data'
import { LEVEL_LABEL, SERIES, f0, f2 } from '@/lib/bigscreen-palette'
import { useDataMode } from '@/lib/bigscreen-data-mode'
import { elevatorApi, alarmApi } from '@/api'
import type { Alarm } from '@/types/api'

const props = defineProps<{ active: boolean }>()

const { v } = useDataMode()

/** 状态 → 令牌色（运行绿 / 故障红 / 维保橙） */
function stColor(st: string): string {
  if (st === '运行') return SERIES.green
  if (st === '故障') return SERIES.red
  return SERIES.amber
}

/* ============================ 真实数据层 ============================ */
const real = ref(false)
const loaded = ref(false)

// 电梯状态聚合（/elevator/status，真实）
const elev = ref({ count: 0, runs: 0, energy: 0, regen: 0, standby: 0 })
// 电梯告警（/alarms?subsystem=elevator，真实）
const alarms = ref<Alarm[]>([])

/** 故障告警列表：真实优先，失败回退示意（S3.faults） */
const elevFaults = computed(() =>
  alarms.value.length
    ? alarms.value.map((a) => ({
        t: a.title,
        lv: a.level === 'critical' ? 'u' : a.level === 'warning' ? 'm' : 'n',
      }))
    : S3.faults,
)

/** 运行统计（真实聚合）：总运行次数 / 总能耗 / 再生能源 / 待机能耗 */
const statReal = computed(() => [
  { k: '总运行次数', v: f0(elev.value.runs), u: '次', c: 'cyan' },
  { k: '总能耗', v: f2(elev.value.energy), u: 'kWh', c: 'green' },
  { k: '再生能源', v: f2(elev.value.regen), u: 'kWh', c: 'blue' },
  { k: '待机能耗', v: f2(elev.value.standby), u: 'kWh', c: 'amber' },
])

// 工单统计堆叠（示意回退，MOCK / S3）
const woSeries = computed(() => [
  { data: S3.woNew, color: SERIES.cyan },
  { data: S3.woDone, color: SERIES.green },
  { data: S3.woOver, color: SERIES.amber },
])

async function init(): Promise<void> {
  if (loaded.value) return
  loaded.value = true
  const [statusRes, alarmRes] = await Promise.allSettled([
    elevatorApi.status(),
    alarmApi.list({ subsystem: 'elevator' }),
  ])

  let ok = true

  if (statusRes.status === 'fulfilled') {
    const s = statusRes.value as Record<string, unknown>
    elev.value = {
      count: Number(s.elevator_count ?? 0),
      runs: Number(s.total_runs ?? 0),
      energy: Number(s.total_energy_kwh ?? 0),
      regen: Number(s.regen_kwh ?? 0),
      standby: Number(s.standby_kwh ?? 0),
    }
  } else {
    ok = false
    // 回退示意总量（真实 units 未下发，仅聚合计数可用）
    elev.value = { count: S3.total, runs: 7579, energy: 133.44, regen: 33.38, standby: 40.8 }
  }

  if (alarmRes.status === 'fulfilled') {
    alarms.value = alarmRes.value.items
  } else {
    ok = false
    alarms.value = []
  }

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
    <BsScreenHead :no="3" />

    <!-- 中央：电梯编号表 -->
    <BsPanel class="scenter" title="电梯编号表" :icon="Grid3x3" no-chev>
      <table class="tbl">
        <thead>
          <tr><th>编号</th><th>所属楼栋</th><th>当前层</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="e in S3.elevators" :key="e.id">
            <td>{{ e.id }}</td>
            <td>{{ e.b }}</td>
            <td>{{ v(`F${e.f}`) }}</td>
            <td :style="{ color: stColor(e.st) }">{{ v(e.st) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="ov-note">
        共 {{ v(elev.count) }} 台（实时）；下列编号 / 楼层 / 状态为示意（电梯物联网未接入）
      </div>
    </BsPanel>

    <!-- 左列 1：电梯总览 -->
    <BsPanel class="col col-l pl1 h250" title="电梯总览" :icon="Users" no-chev>
      <div class="kpis">
        <div class="kpi cyan">
          <div class="k">电梯总数</div>
          <div class="v">{{ v(elev.count) }}<span class="u">台</span></div>
        </div>
        <div class="kpi green">
          <div class="k">运行中</div>
          <div class="v">{{ v(S3.run) }}<span class="u">台</span></div>
        </div>
        <div class="kpi red">
          <div class="k">故障</div>
          <div class="v">{{ v(S3.fault) }}<span class="u">台</span></div>
        </div>
        <div class="kpi amber">
          <div class="k">维护</div>
          <div class="v">{{ v(S3.maint) }}<span class="u">台</span></div>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 2：故障告警 -->
    <BsPanel class="col col-l pl2 h250" title="故障告警" :icon="AlertTriangle" no-chev>
      <div class="lst">
        <div v-for="x in elevFaults" :key="x.t" class="it">
          <span class="tg" :class="x.lv">{{ LEVEL_LABEL[x.lv] }}</span>
          <span class="tx">{{ x.t }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 3：运行统计 -->
    <BsPanel class="col col-l pl3 h250" title="运行统计" :icon="BarChart3" no-chev>
      <div class="kpis">
        <div v-for="s in statReal" :key="s.k" class="kpi" :class="s.c">
          <div class="k">{{ s.k }}</div>
          <div class="v">{{ v(s.v) }}<span v-if="s.u" class="u">{{ s.u }}</span></div>
        </div>
      </div>
      <div class="ov-note">总运行次数 / 总能耗 / 再生能源 / 待机能耗为真实聚合值（elevator/status）</div>
    </BsPanel>

    <!-- 右列 1：实时位置（井道行程图） -->
    <BsPanel class="col col-r pl1 h250" title="实时位置（井道行程图）" :icon="ChevronRight" no-chev>
      <div class="shafts">
        <div v-for="s in S3.shafts" :key="s.id" class="shaft">
          <div class="cap">{{ s.id }}</div>
          <div class="car" :style="{ top: `${(100 - (s.f / s.mx) * 100).toFixed(1)}%` }">
            {{ v(`F${s.f}`) }}
          </div>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 2：维保计划 -->
    <BsPanel class="col col-r pl2 h250" title="维保计划" :icon="ClipboardList" no-chev>
      <div class="lst">
        <div v-for="x in S3.maintain" :key="x.t" class="it">
          <span class="tx">{{ x.t }}</span>
          <span class="tm">{{ v(x.d) }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 3：工单统计 -->
    <BsPanel class="col col-r pl3 h250" title="工单统计" :icon="CheckCircle2" no-chev>
      <div class="mini">工单 创建 / 完成 / 超时（近 7 日）</div>
      <BsStack :w="440" :h="160" :cats="MOCK.days" :series="woSeries" />
      <div class="legend">
        <span class="li"><i :style="{ background: SERIES.cyan }" />创建</span>
        <span class="li"><i :style="{ background: SERIES.green }" />完成</span>
        <span class="li"><i :style="{ background: SERIES.amber }" />超时</span>
      </div>
    </BsPanel>

    <!-- 底条：运行统计 / 平均响应 / 巡检 / 工单 -->
    <BsPanel class="sbot" title="运行统计 / 平均响应 / 巡检 / 工单" :icon="Activity" no-chev>
      <div class="kpis kpis--bot">
        <div class="kpi green">
          <div class="k">运行统计</div>
          <div class="v">{{ v(S3.runRate) }}<span class="u">%</span></div>
        </div>
        <div class="kpi cyan">
          <div class="k">平均响应</div>
          <div class="v">{{ v(S3.resp) }}<span class="u">min</span></div>
        </div>
        <div class="kpi blue">
          <div class="k">巡检完成</div>
          <div class="v">{{ v(S3.patrol) }}<span class="u">%</span></div>
        </div>
        <div class="kpi amber">
          <div class="k">本月工单</div>
          <div class="v">{{ v(38) }}<span class="u">单</span></div>
        </div>
      </div>
    </BsPanel>
  </section>
</template>

<style scoped>
/* 底条 KPI 垂直居中撑满（参考页内联 height:100%;align-items:center） */
.kpis--bot {
  height: 100%;
  align-items: center;
}
/* 中央表格下方注脚与表格留白 */
.scenter .ov-note {
  margin-top: 10px;
}
</style>

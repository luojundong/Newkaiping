<script setup lang="ts">
/**
 * 图6 空间设备运维驾驶舱（参考页 #scr6 / rS6() L5281-5312 的组件化复刻）
 * 契约：docs/design/bigscreen-panel-specs.md §6
 *
 * 8 面板：scenter 空间树 / 左列 巡检路线·资产档案·维护记录 / 右列 健康状态·资产明细·实时告警 / sbot 定位+告警
 *
 * ★ 数据分野：
 *   - 中央空间树用 **scene store 的真实楼栋台账**（10 栋 / 层数由后端 building 模块下发），本文件不改动。
 *   - 其余运维指标（资产档案 / 巡检路线 / 维护记录 / 健康状态 / 资产明细 / 实时告警）
 *     已切换为真实后端 API（deviceApi / workOrderApi / alarmApi），失败时回退 S6 示意值。
 */
import {
  Activity,
  AlertTriangle,
  Building2,
  ClipboardList,
  Grid3x3,
  Layers,
  MapPin,
  Maximize2,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import BsPanel from '../BsPanel.vue'
import BsScreenHead from '../BsScreenHead.vue'
import BsDonut from '../charts/BsDonut.vue'
import BsHBar from '../charts/BsHBar.vue'
import { S6 } from '@/lib/bigscreen-demo-data'
import { LEVEL_LABEL, SERIES, f0 } from '@/lib/bigscreen-palette'
import { useDataMode } from '@/lib/bigscreen-data-mode'
import { useSceneStore } from '@/stores/scene'
import { deviceApi, workOrderApi, alarmApi } from '@/api'
import { CATEGORY_LABELS } from '@/types/api'
import type { Alarm, Device, WorkOrder } from '@/types/api'

const props = defineProps<{ active: boolean }>()

const { v } = useDataMode()
const scene = useSceneStore()

/** 楼栋序号：code 'B3' → 3（真实台账口径） */
function buildingNo(code: string): number {
  const n = Number.parseInt(code.replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * 空间树 = 真实楼栋 → 前 4 层 → 科室（房间类型循环，示意）。
 * 参考页做法一致（Math.min(floors,4)），但楼栋 / 层数取真实值。
 */
const spaceTree = computed(() =>
  [...scene.visibleBuildings]
    .sort((a, b) => buildingNo(a.code) - buildingNo(b.code))
    .map((b) => {
      const no = buildingNo(b.code)
      const lv = Math.max(1, Math.min(b.floors || 1, 4))
      return {
        key: b.id,
        nm: `${no}号楼 ${b.name}`,
        f: b.floors,
        ch: Array.from({ length: lv }, (_, i) => ({
          nm: `F${i + 1}`,
          rm: S6.roomTypes[(no + i) % S6.roomTypes.length],
        })),
      }
    }),
)

/* ============================ 真实运维指标数据层 ============================ */
const deviceItems = ref<Device[]>([])
const deviceTotal = ref<number>(0)
const locatedCount = ref<number>(0)
const workOrders = ref<WorkOrder[]>([])
const alarms = ref<Alarm[]>([])
const real = ref(false)
const loaded = ref(false)

/** 设备分类 → 中文短名（与 CATEGORY_LABELS 对齐，取简名便于大屏展示） */
const CATEGORY_NAMES: Record<string, string> = {
  split_ac: '分体机',
  vrf_outdoor: '多联机',
  heat_pump_water: '热泵',
  screw_chiller: '螺杆机',
  air_cooled_module: '风冷模块',
  water_pump: '水泵',
  cooling_tower: '冷却塔',
  lighting_loop: '照明',
}
const CATEGORY_COLORS = [
  SERIES.cyan,
  SERIES.blue,
  SERIES.green,
  SERIES.amber,
  SERIES.teal,
  SERIES.red,
  SERIES.dim,
  SERIES.soft,
]

function categoryName(id: string): string {
  return CATEGORY_NAMES[id] ?? CATEGORY_LABELS[id] ?? id
}
function levelToTag(level: Alarm['level']): string {
  if (level === 'critical') return 'u'
  if (level === 'warning') return 'm'
  return 'n'
}
/** ISO 时间 → MM-DD（大屏列表口径） */
function fmtDate(iso: string | undefined): string {
  return (iso ?? '').slice(5, 10) || '—'
}

/**
 * 拉取真实运维数据（三接口并行，各自容错）。
 * deviceApi + alarmApi 均成功时 real=true；任一失败回退 S6 示意值。
 */
async function init(): Promise<void> {
  if (loaded.value) return
  loaded.value = true
  const [devRes, woRes, alarmRes] = await Promise.allSettled([
    deviceApi.list({ limit: 5000 }),
    workOrderApi.list({ limit: 50 }),
    alarmApi.list({}),
  ])
  let devOk = false
  let alarmOk = false
  if (devRes.status === 'fulfilled') {
    devOk = true
    const data = devRes.value
    deviceItems.value = data.items
    deviceTotal.value = data.total ?? data.items.length
    locatedCount.value = data.items.filter(
      (d) => !!d.location && (d.location.floor != null || !!d.location.room),
    ).length
  }
  if (woRes.status === 'fulfilled') workOrders.value = woRes.value.items
  if (alarmRes.status === 'fulfilled') {
    alarmOk = true
    alarms.value = alarmRes.value.items
  }
  real.value = devOk && alarmOk
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

/* ---------------- 资产档案 KPI（真实台账；失败回退 S6） ---------------- */
const assetTotal = computed(() =>
  deviceItems.value.length ? deviceTotal.value : S6.assets.total,
)
const locatedVal = computed(() =>
  deviceItems.value.length ? locatedCount.value : S6.assets.located,
)
const locateRate = computed(() => {
  if (deviceItems.value.length && deviceTotal.value > 0) {
    return Math.round((locatedCount.value / deviceTotal.value) * 100)
  }
  return S6.assets.rate
})

/* ---------------- 巡检路线：处理中工单（真实）；回退 S6 ---------------- */
const routeItems = computed(() => {
  if (workOrders.value.length) {
    const active = workOrders.value.filter((w) =>
      ['pending', 'processing', 'feedback', 'unfinished'].includes(w.status),
    )
    const src = active.length ? active : workOrders.value
    return src.map((w) => ({ t: w.title, d: fmtDate(w.created_at) }))
  }
  return S6.routes
})
/* ---------------- 维护记录：已完成工单（真实）；回退 S6 ---------------- */
const recordItems = computed(() => {
  if (workOrders.value.length) {
    const done = workOrders.value.filter(
      (w) => w.status === 'completed' || w.status === 'closed',
    )
    const src = done.length ? done : workOrders.value
    return src.map((w) => ({ t: w.title, d: fmtDate(w.created_at) }))
  }
  return S6.records
})

/* ---------------- 健康评分（示意值，按真实告警量派生） ---------------- */
const healthScore = computed(() => {
  if (alarms.value.length) {
    const critical = alarms.value.filter((a) => a.level === 'critical').length
    const warning = alarms.value.filter((a) => a.level === 'warning').length
    return Math.max(0, 100 - critical * 5 - warning * 2)
  }
  return S6.health
})
const healthSegs = computed(() => [{ v: healthScore.value, c: SERIES.green, total: 100 }])

/* ---------------- 资产明细（分类台数，真实聚合）；回退 S6.locate ---------------- */
const locateItems = computed(() => {
  if (deviceItems.value.length) {
    const map = new Map<string, number>()
    for (const d of deviceItems.value) {
      map.set(d.category_id, (map.get(d.category_id) ?? 0) + 1)
    }
    let i = 0
    return [...map.entries()].map(([id, n]) => ({
      nm: categoryName(id),
      val: n,
      color: CATEGORY_COLORS[i++ % CATEGORY_COLORS.length],
      unit: ' 台',
    }))
  }
  return S6.locate.map((l) => ({ nm: l.nm, val: l.v, color: l.c, unit: ' 台' }))
})

/* ---------------- 实时告警（真实 top N）；回退 S6.alarms ---------------- */
const alarmItems = computed<{ t: string; lv: string; id: string }[]>(() => {
  if (alarms.value.length) {
    return alarms.value.slice(0, 8).map((a) => ({
      t: a.title,
      lv: levelToTag(a.level),
      id: a.id,
    }))
  }
  return S6.alarms.map((a) => ({ t: a.t, lv: a.lv, id: a.t }))
})

/** 资产档案脚注：按 real 态诚实标注数据来源 */
const assetNote = computed(() =>
  real.value
    ? '资产总数 / 已定位 / 分类台数 = 真实设备台账；综合健康评分为示意值'
    : '接口未接入：运维指标为示意值',
)
</script>

<template>
  <section class="bs-screen bs-screen--flat" :class="{ 'is-on': active }">
    <BsScreenHead :no="6" />

    <!-- 中央：空间树（真实 10 栋 → 楼层 → 科室） -->
    <BsPanel class="scenter" title="空间树（10 栋 → 楼层 → 科室）" :icon="Maximize2" no-chev>
      <div class="tree">
        <div v-for="b in spaceTree" :key="b.key" class="b">
          <div class="bh">
            <Building2 :size="14" />{{ b.nm }}<span class="ct">{{ b.f }}F</span>
          </div>
          <div v-for="fl in b.ch" :key="fl.nm" class="fl">{{ fl.nm }} · {{ fl.rm }}</div>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 1：巡检路线 -->
    <BsPanel class="col col-l pl1 h250" title="巡检路线" :icon="MapPin" no-chev>
      <div class="lst">
        <div v-for="x in routeItems" :key="x.t" class="it">
          <span class="tx">{{ x.t }}</span>
          <span class="tm">{{ v(x.d) }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 左列 2：资产档案 -->
    <BsPanel class="col col-l pl2 h250" title="资产档案" :icon="Layers" no-chev>
      <div class="kpis">
        <div class="kpi cyan">
          <div class="k">资产总数</div>
          <div class="v">{{ f0(assetTotal) }}<span class="u">台</span></div>
        </div>
        <div class="kpi green">
          <div class="k">已定位</div>
          <div class="v">{{ f0(locatedVal) }}<span class="u">台</span></div>
        </div>
        <div class="kpi blue">
          <div class="k">定位率</div>
          <div class="v">{{ locateRate }}<span class="u">%</span></div>
        </div>
      </div>
      <div class="ov-note">{{ assetNote }}</div>
    </BsPanel>

    <!-- 左列 3：维护记录 -->
    <BsPanel class="col col-l pl3 h250" title="维护记录" :icon="ClipboardList" no-chev>
      <div class="lst">
        <div v-for="x in recordItems" :key="x.t" class="it">
          <span class="tx">{{ x.t }}</span>
          <span class="tm">{{ v(x.d) }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 右列 1：健康状态 -->
    <BsPanel class="col col-r pl1 h250" title="健康状态" :icon="Activity" no-chev>
      <div class="gauge">
        <div class="score">{{ v(healthScore) }}</div>
        <div class="lab">综合健康评分（示意值）</div>
        <div class="gwrap"><BsDonut :size="96" :r="38" :sw="12" :segs="healthSegs" /></div>
      </div>
    </BsPanel>

    <!-- 右列 2：资产明细 -->
    <BsPanel class="col col-r pl2 h250" title="资产明细" :icon="Grid3x3" no-chev>
      <BsHBar :w="440" :h="186" :items="locateItems" />
    </BsPanel>

    <!-- 右列 3：实时告警 -->
    <BsPanel class="col col-r pl3 h250" title="实时告警" :icon="AlertTriangle" no-chev>
      <div class="lst">
        <div v-for="x in alarmItems" :key="x.id" class="it">
          <span class="tg" :class="x.lv">{{ LEVEL_LABEL[x.lv] }}</span>
          <span class="tx">{{ x.t }}</span>
        </div>
      </div>
    </BsPanel>

    <!-- 底条：设备定位 / 实时告警 -->
    <BsPanel class="sbot" title="设备定位 / 实时告警" :icon="MapPin" no-chev>
      <div class="botrow">
        <div class="bot-l">
          <div class="mini">设备定位（分类台数）</div>
          <BsHBar :w="1000" :h="70" :items="locateItems" />
        </div>
        <div class="bot-r">
          <div class="mini">实时告警</div>
          <div class="lst lst--auto">
            <div v-for="x in alarmItems" :key="x.id" class="it">
              <span class="tg" :class="x.lv">{{ LEVEL_LABEL[x.lv] }}</span>
              <span class="tx">{{ x.t }}</span>
            </div>
          </div>
        </div>
      </div>
    </BsPanel>
  </section>
</template>

<style scoped>
/* 空间树头图标（lucide stroke=currentColor） */
.tree .bh svg {
  color: var(--kp-accent);
  flex: none;
}
/* 空间树两列排布：10 栋 × 4 层在 830×476 内需分栏，避免滚动 */
.tree {
  column-count: 2;
  column-gap: 18px;
}
.tree .b {
  break-inside: avoid;
}
/* 健康度环 */
.gwrap {
  margin-top: 8px;
}
/* 底条两栏 */
.botrow {
  display: flex;
  gap: 14px;
  height: 100%;
}
.bot-l {
  flex: 1.2;
  min-width: 0;
}
.bot-r {
  flex: 1;
  min-width: 0;
}
.lst--auto {
  height: auto;
}
</style>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { LineChart, FileDown, FileText } from 'lucide-vue-next'
import { KP_ACCENT } from '@/lib/kp-accent'
import { ElMessage } from 'element-plus'
import KpiStat from '@/components/common/KpiStat.vue'
import PanelCard from '@/components/common/PanelCard.vue'
import TrendChart from '@/components/panels/TrendChart.vue'
import { buildingApi, energyApi, reportApi } from '@/api'
import type { Building, EnergySummary, EnergyTrendPoint } from '@/types/api'
import { downloadTextFile } from '@/lib/download'

const activeTab = ref<'analysis' | 'report'>('analysis')

const buildingOptions = ref<Building[]>([])
const filterBuilding = ref<string>('')
const period = ref<'hour' | 'day' | 'month' | 'year'>('day')
const summary = ref<EnergySummary | null>(null)
const points = ref<EnergyTrendPoint[]>([])
const loading = ref(false)

const PERIODS = [
  { value: 'hour', label: '小时' },
  { value: 'day', label: '日' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
] as const

const summaryKpis = computed(() => {
  const s = summary.value
  if (!s) return []
  return [
    { label: `${PERIODS.find((p) => p.value === period.value)?.label}能耗`, value: s.kwh.toFixed(1), unit: 'kWh' },
    { label: '费用', value: s.cost.toFixed(0), unit: '元' },
    { label: '碳排放', value: s.carbon_kg.toFixed(1), unit: 'kg' },
    { label: '峰值功率', value: s.peak_kw.toFixed(1), unit: 'kW' },
  ]
})

const chartData = computed(() => points.value.map((p) => Number(p.kwh.toFixed(2))))
const chartLabels = computed(() => points.value.map((p) => (p.time || '').slice(0, 16)))

function accentColor(): string {
  if (typeof document === 'undefined') return KP_ACCENT
  return getComputedStyle(document.documentElement).getPropertyValue('--kp-accent').trim() || KP_ACCENT
}
const chartColor = ref(accentColor())

async function load() {
  loading.value = true
  try {
    const [s, t] = await Promise.all([
      energyApi.summary({ building_id: filterBuilding.value || undefined, period: period.value }),
      energyApi.trend({ building_id: filterBuilding.value || undefined }),
    ])
    summary.value = s
    points.value = t.points
  } catch {
    summary.value = null
    points.value = []
  } finally {
    loading.value = false
  }
}

// ---------- 报表导出 ----------
const exportingType = ref<string>('')

const REPORT_TYPES = [
  { value: 'devices', label: '设备台账' },
  { value: 'energy', label: '能耗汇总' },
  { value: 'alarms', label: '告警记录' },
  { value: 'history', label: '历史指标' },
] as const

async function exportReport(type: string) {
  exportingType.value = type
  try {
    const csv = (await reportApi.exportCsv({
      type,
      format: 'csv',
      building_id: filterBuilding.value || undefined,
    })) as unknown as string
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const label = REPORT_TYPES.find((t) => t.value === type)?.label || type
    downloadTextFile(`report_${type}_${stamp}.csv`, csv)
    ElMessage.success(`「${label}」报表已下载`)
  } catch (e) {
    ElMessage.error((e as Error).message || '导出失败')
  } finally {
    exportingType.value = ''
  }
}

onMounted(async () => {
  try {
    buildingOptions.value = (await buildingApi.list()).items
  } catch {
    buildingOptions.value = []
  }
  load()
})
</script>

<template>
  <div class="admin-page">
    <el-tabs v-model="activeTab" class="energy-tabs">
      <!-- 能耗分析 -->
      <el-tab-pane label="能耗分析" name="analysis">
        <div class="admin-toolbar">
          <LineChart :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">能耗报表</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="filterBuilding" placeholder="全院" clearable style="width: 180px" @change="load">
              <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
            <el-radio-group v-model="period" @change="load">
              <el-radio-button v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.label }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <div class="energy-kpis">
          <KpiStat v-for="k in summaryKpis" :key="k.label" :label="k.label" :value="k.value" :unit="k.unit" />
          <div v-if="!summary" class="energy-kpis__empty">暂无能耗汇总数据</div>
        </div>

        <PanelCard title="能耗趋势" :accent="true" class="energy-trend">
          <TrendChart v-if="chartData.length" :data="chartData" :labels="chartLabels" :color="chartColor" />
          <div v-else class="kp-empty">暂无趋势数据</div>
        </PanelCard>
      </el-tab-pane>

      <!-- 报表导出 -->
      <el-tab-pane label="报表导出" name="report">
        <div class="admin-toolbar">
          <FileText :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">报表导出</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="filterBuilding" placeholder="全院" clearable style="width: 180px">
              <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id" />
            </el-select>
          </div>
        </div>

        <section class="report-grid">
          <div v-for="t in REPORT_TYPES" :key="t.value" class="report-card kp-panel">
            <span class="kp-corner kp-corner--tl" />
            <span class="kp-corner kp-corner--tr" />
            <span class="kp-corner kp-corner--bl" />
            <span class="kp-corner kp-corner--br" />
            <div class="report-card__icon"><FileText :size="26" /></div>
            <h3 class="report-card__title">{{ t.label }}</h3>
            <p class="report-card__desc">导出「{{ t.label }}」全量数据 CSV 报表</p>
            <el-button
              type="primary"
              :icon="FileDown"
              :loading="exportingType === t.value"
              @click="exportReport(t.value)"
            >
              导出 CSV
            </el-button>
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.energy-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.energy-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.energy-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; align-items: center; }
.energy-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.energy-kpis__empty { grid-column: 1 / -1; color: var(--kp-fg-muted); font-size: var(--kp-text-sm); }
.energy-trend { flex: 1; min-height: 0; }
.report-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; align-content: start; }
.report-card {
  position: relative;
  border-radius: var(--kp-radius-md);
  padding: 22px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}
.report-card__icon { color: var(--kp-accent); filter: drop-shadow(0 0 8px var(--kp-glow)); }
.report-card__title { margin: 4px 0 0; font-size: var(--kp-text-xl); color: var(--kp-fg); letter-spacing: var(--kp-tracking-label); }
.report-card__desc { margin: 0 0 10px; font-size: var(--kp-text-sm); color: var(--kp-fg-muted); line-height: 1.6; }
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { FileDown, FileText } from 'lucide-vue-next'
import { buildingApi, reportApi } from '@/api'
import type { Building } from '@/types/api'
import { downloadTextFile } from '@/lib/download'

const exportingType = ref<string>('')
const buildingOptions = ref<Building[]>([])
const filterBuilding = ref<string>('')

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
})
</script>

<template>
  <div class="admin-page">
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
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
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

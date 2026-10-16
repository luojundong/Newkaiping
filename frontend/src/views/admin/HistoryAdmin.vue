<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { History, Download, Search } from 'lucide-vue-next'
import { buildingApi, historyApi } from '@/api'
import type { Building, HistoryItem } from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'
import { downloadTextFile } from '@/lib/download'

const loading = ref(false)
const rows = ref<HistoryItem[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(15)
const exporting = ref(false)
const buildingOptions = ref<Building[]>([])

const query = reactive({
  building_id: '',
  device_id: '',
  subsystem: '',
  from: '',
  to: '',
})

async function load() {
  loading.value = true
  try {
    const res = await historyApi.query({
      building_id: query.building_id || undefined,
      device_id: query.device_id || undefined,
      subsystem: query.subsystem || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      page: page.value,
      limit: limit.value,
    })
    rows.value = res.items as unknown as HistoryItem[]
    total.value = res.total
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onQuery() {
  page.value = 1
  load()
}

async function exportCsv() {
  exporting.value = true
  try {
    const csv = await historyApi.exportCsv({
      building_id: query.building_id || undefined,
      device_id: query.device_id || undefined,
      subsystem: query.subsystem || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      format: 'csv',
    })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadTextFile(`history_${stamp}.csv`, csv)
    ElMessage.success('CSV 已下载')
  } catch (e) {
    ElMessage.error((e as Error).message || '导出失败')
  } finally {
    exporting.value = false
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
    <div class="admin-toolbar">
      <History :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">历史数据</span>
      <div class="admin-toolbar__filters">
        <el-button :icon="Download" :loading="exporting" @click="exportCsv">下载 CSV</el-button>
      </div>
    </div>

    <section class="history-query kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <el-form :inline="true" :model="query" class="history-query__form">
        <el-form-item label="楼栋">
          <el-select v-model="query.building_id" placeholder="全部" clearable style="width: 160px">
            <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="设备">
          <el-input v-model="query.device_id" placeholder="设备编码/ID" clearable style="width: 160px" />
        </el-form-item>
        <el-form-item label="子系统">
          <el-select v-model="query.subsystem" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="s in SUBSYSTEMS" :key="s.code" :label="s.name" :value="s.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始">
          <el-date-picker v-model="query.from" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="开始时间" style="width: 190px" />
        </el-form-item>
        <el-form-item label="结束">
          <el-date-picker v-model="query.to" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="结束时间" style="width: 190px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="onQuery">查询</el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
      <el-table-column label="序号" width="64" class-name="seq-col" fixed>
        <template #default="{ $index }">{{ (page - 1) * limit + $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="ts" label="时间" width="180" />
      <el-table-column prop="device_name" label="设备" min-width="150" />
      <el-table-column prop="building_id" label="楼栋" width="130" />
      <el-table-column prop="key" label="指标" width="140" />
      <el-table-column label="数值" width="140">
        <template #default="{ row }">{{ row.value }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column prop="device_id" label="设备ID" min-width="180" show-overflow-tooltip />
    </el-table>

    <div class="admin-pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        :total="total"
        layout="total, prev, pager, next"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.history-query { position: relative; border-radius: var(--kp-radius-md); padding: 14px; }
.history-query__form { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
.admin-table { flex: 1; min-height: 0; }
.admin-pager { display: flex; justify-content: flex-end; }
</style>

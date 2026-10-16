<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ScrollText, Search } from 'lucide-vue-next'
import { logsApi } from '@/api'
import type { AuditLog } from '@/types/api'

const loading = ref(false)
const rows = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(15)

const query = reactive({
  username: '',
  module: '',
  from: '',
  to: '',
})

// 模块字典（与后端 AuditLog.module 对应）
const MODULE_OPTIONS = [
  { value: 'auth', label: '登录认证' },
  { value: 'users', label: '用户管理' },
  { value: 'roles', label: '角色管理' },
  { value: 'devices', label: '设备管理' },
  { value: 'buildings', label: '楼栋管理' },
  { value: 'billing', label: '计费管理' },
  { value: 'scene', label: '场景/标记' },
  { value: 'work-orders', label: '工单管理' },
  { value: 'control-groups', label: '群组控制' },
  { value: 'hvac', label: '空调控制' },
  { value: 'lighting', label: '照明控制' },
  { value: 'power', label: '电力控制' },
  { value: 'hotwater', label: '热水控制' },
  { value: 'elevator', label: '电梯控制' },
  { value: 'regulation', label: '用能调控' },
  { value: 'lifecycle', label: '生命周期' },
  { value: 'site', label: '站点配置' },
  { value: 'bigscreen', label: '大屏配置' },
  { value: 'device-types', label: '设备类型' },
  { value: 'device-brands', label: '设备品牌' },
  { value: 'alarm-rules', label: '告警规则' },
  { value: 'menus', label: '菜单配置' },
  { value: 'reports', label: '报表导出' },
  { value: 'system', label: '系统' },
  { value: 'audit', label: '审计复核' },
]

// 操作类型字典
const ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '更新',
  delete: '删除',
  control: '控制',
  login: '登录',
  logout: '登出',
  config: '配置',
  switch: '开关',
  anchors: '锚点',
  upload: '上传',
  export: '导出',
  review: '审查',
}

function moduleLabel(m: string): string {
  return MODULE_OPTIONS.find((o) => o.value === m)?.label || m
}

function actionLabel(a: string): string {
  return ACTION_LABELS[a] || a
}

function fmtTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

async function load() {
  loading.value = true
  try {
    const res = await logsApi.list({
      username: query.username || undefined,
      module: query.module || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
      page: page.value,
      limit: limit.value,
    })
    rows.value = res.items
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

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <div class="admin-toolbar">
      <ScrollText :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">操作日志</span>
    </div>

    <section class="log-query kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <el-form :inline="true" :model="query" class="log-query__form">
        <el-form-item label="操作人">
          <el-input v-model="query.username" placeholder="账号模糊搜索" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item label="模块">
          <el-select v-model="query.module" placeholder="全部模块" clearable style="width: 150px">
            <el-option v-for="m in MODULE_OPTIONS" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始">
          <el-date-picker v-model="query.from" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="开始时间" style="width: 185px" />
        </el-form-item>
        <el-form-item label="结束">
          <el-date-picker v-model="query.to" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="结束时间" style="width: 185px" />
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
      <el-table-column label="操作人" width="110">
        <template #default="{ row }">
          <span class="log-user">{{ row.username }}</span>
        </template>
      </el-table-column>
      <el-table-column label="模块" width="110">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ moduleLabel(row.module) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }">{{ actionLabel(row.action) }}</template>
      </el-table-column>
      <el-table-column prop="target" label="操作对象" min-width="180" show-overflow-tooltip />
      <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
      <el-table-column label="结果" width="80">
        <template #default="{ row }">
          <el-tag :type="row.result === 'success' ? 'success' : 'danger'" size="small">
            {{ row.result === 'success' ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="IP" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.ip || '-' }}</template>
      </el-table-column>
    </el-table>

    <div class="admin-pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        :total="total"
        layout="total, prev, pager, next"
        background
        @current-change="load"
      />
    </div>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.log-query { position: relative; border-radius: var(--kp-radius-md); padding: 14px; }
.log-query__form { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
.log-user { color: var(--kp-accent); font-weight: 500; }
.admin-table { flex: 1; min-height: 0; }
.admin-pager { display: flex; justify-content: flex-end; }
</style>

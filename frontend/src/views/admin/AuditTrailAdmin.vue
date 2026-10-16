<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ShieldCheck, Search, Download, Printer, ClipboardCheck, Clock, Settings } from 'lucide-vue-next'
import { ElMessage, ElMessageBox } from 'element-plus'
import { logsApi } from '@/api'
import type { AuditLog } from '@/types/api'

const loading = ref(false)
const rows = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(15)
const integrity = ref<{ ok: boolean; count: number; checked: number; legacyCount: number; brokenAt?: string } | null>(null)
// GMP：NTP 时间源可信状态 + 周期性复核状态
const timeSource = ref<{ serverTime: string; ntpSynced: boolean | null; source: string; timezone: string } | null>(null)
const review = ref<{
  lastReview: { reviewer: string; reviewed_at: string; record_count: number; note?: string } | null
  intervalDays: number
  daysSince: number | null
  dueInDays: number | null
  overdue: boolean
} | null>(null)

// 复核间隔配置（后台可配置项）
const intervalDraft = ref<number>(30)
const savingInterval = ref(false)
watch(review, (v) => {
  if (v && typeof v.intervalDays === 'number') intervalDraft.value = v.intervalDays
})

const query = reactive({
  username: '',
  module: '',
  action: '',
  from: '',
  to: '',
  keyword: '',
})

// 模块字典（与后端 AuditLog.module 对应，含 5 个新子系统控制）
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

const ACTION_OPTIONS = [
  { value: 'create', label: '新增' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'control', label: '控制' },
  { value: 'config', label: '配置' },
  { value: 'switch', label: '开关' },
  { value: 'login', label: '登录' },
  { value: 'logout', label: '登出' },
  { value: 'anchors', label: '锚点' },
  { value: 'upload', label: '上传' },
  { value: 'export', label: '导出' },
  { value: 'review', label: '复核' },
]

function moduleLabel(m: string): string {
  return MODULE_OPTIONS.find((o) => o.value === m)?.label || m
}
function actionLabel(a: string): string {
  return ACTION_OPTIONS.find((o) => o.value === a)?.label || a
}
function fmtTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function shortHash(h?: string): string {
  if (!h) return '—'
  return h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-4)}` : h
}
function jsonOrDash(v: any): string {
  if (v === null || v === undefined) return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

async function load() {
  loading.value = true
  try {
    const res = await logsApi.list({
      username: query.username || undefined,
      module: query.module || undefined,
      action: query.action || undefined,
      keyword: query.keyword || undefined,
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

async function loadIntegrity() {
  try {
    integrity.value = await logsApi.integrity()
  } catch {
    integrity.value = null
  }
}

async function loadTimeSource() {
  try {
    timeSource.value = await logsApi.timeSource()
  } catch {
    timeSource.value = null
  }
}

async function loadReviewStatus() {
  try {
    review.value = await logsApi.reviewStatus()
  } catch {
    review.value = null
  }
}

// 执行周期性复核：确认后写入复核结论 + 一条 review 审计（纳入哈希链）
async function doReview() {
  let note: string | undefined
  try {
    const { value } = await ElMessageBox.prompt('请输入本次复核说明/结论（可选，将写入审计链）', '执行周期性复核', {
      confirmButtonText: '确认复核',
      cancelButtonText: '取消',
      inputPlaceholder: '如：已完成本月审计链复核，记录与哈希校验未发现异常',
    })
    note = (value || '').trim() || undefined
  } catch {
    return // 用户取消
  }
  try {
    await logsApi.review(note)
    ElMessage.success('复核完成：结论已写入审计链（不可篡改）')
  } catch (e: any) {
    ElMessage.error(`复核失败：${(e && e.message) || String(e)}`)
    return
  }
  await Promise.all([load(), loadIntegrity(), loadReviewStatus()])
}

function onQuery() {
  page.value = 1
  load()
}

function resetIntervalDraft() {
  intervalDraft.value = review.value?.intervalDays ?? 30
}

async function saveInterval() {
  const days = Math.floor(Number(intervalDraft.value))
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    ElMessage.error('复核间隔必须为 1~3650 之间的整数（天）')
    return
  }
  let reason: string | undefined
  try {
    const { value } = await ElMessageBox.prompt(
      `确认将复核间隔从 ${review.value?.intervalDays ?? 30} 天改为 ${days} 天？\n请输入本次变更原因（写入审计链）：`,
      '更新复核间隔',
      {
        inputPlaceholder: '如：合规要求每 14 天复核',
        confirmButtonText: '保存',
        cancelButtonText: '取消',
      },
    )
    reason = (value || '').trim() || undefined
  } catch {
    return // 用户取消
  }
  savingInterval.value = true
  try {
    await logsApi.setReviewSettings(days, reason)
    ElMessage.success('复核间隔已更新（已写入审计链）')
    await loadReviewStatus()
  } catch (e: any) {
    ElMessage.error(`保存失败：${(e && e.message) || String(e)}`)
  } finally {
    savingInterval.value = false
  }
}

// 输出：将当前查询页导出为 CSV（UTF-8 BOM，Excel 友好）
function csvCell(v: string): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
function exportCsv() {
  const headers = ['时间', '操作人', '模块', '操作类型', '操作对象', '详情', '变更理由', '修改前原值', '修改后新值', '结果', 'IP']
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows.value) {
    lines.push(
      [
        fmtTime(r.created_at),
        r.username,
        moduleLabel(r.module),
        actionLabel(r.action),
        r.target || '',
        r.detail || '',
        r.reason || '',
        jsonOrDash(r.before),
        jsonOrDash(r.after),
        r.result === 'success' ? '成功' : '失败',
        r.ip || '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `审查追踪_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// 打印：调用浏览器打印，样式已做 @media print 处理（仅保留表格）
function printTrail() {
  window.print()
}

// GMP-P1：服务端导出（含哈希链完整记录，导出动作留痕于审计链）。下载当前筛选条件下的全量审计轨迹。
async function serverExport(format: 'csv' | 'json') {
  try {
    const blob = await logsApi.exportAudit(
      {
        username: query.username || '',
        module: query.module || '',
        action: query.action || '',
        keyword: query.keyword || '',
        from: query.from || '',
        to: query.to || '',
      },
      format,
    )
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `审查追踪_服务端_${ts}.${format}`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`已导出服务端审计记录（${format.toUpperCase()}，含哈希链）`)
  } catch (e: any) {
    ElMessage.error(`服务端导出失败：${(e && e.message) || String(e)}`)
  }
}

onMounted(() => {
  load()
  loadIntegrity()
  loadTimeSource()
  loadReviewStatus()
})
</script>

<template>
  <div class="admin-page audit-trail">
    <div class="admin-toolbar">
      <ShieldCheck :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">审查追踪</span>
      <span
        v-if="integrity"
        class="audit-integrity"
        :class="integrity.ok ? 'is-ok' : 'is-broken'"
        :title="integrity.ok ? '审计哈希链完整，未被篡改' : `检测到篡改，断裂于 ${integrity.brokenAt}`"
      >
        <ShieldCheck :size="14" />
        {{ integrity.ok ? `审计链完整（已校验 ${integrity.checked} 条` : `检测到篡改` }}
        <template v-if="integrity.ok && integrity.legacyCount"> · 历史记录 {{ integrity.legacyCount }} 条</template>
        <template v-if="!integrity.ok">：{{ integrity.brokenAt }}</template>
      </span>
      <span
        v-if="timeSource"
        class="audit-badge"
        :class="timeSource.ntpSynced === false ? 'is-warn' : 'is-ok'"
        :title="`服务器可信时间：${fmtTime(timeSource.serverTime)} · 时区 ${timeSource.timezone} · ${timeSource.ntpSynced === true ? 'NTP 已同步（时间戳可信）' : timeSource.ntpSynced === false ? '系统时钟未同步 NTP（GMP 要求同步）' : 'NTP 状态未知'}`"
      >
        <Clock :size="13" />
        时间源: {{ timeSource.ntpSynced === true ? 'NTP 已同步' : timeSource.ntpSynced === false ? '系统时钟' : '未知' }}
      </span>
      <span
        v-if="review"
        class="audit-badge"
        :class="review.overdue ? 'is-overdue' : review.lastReview && review.dueInDays !== null && review.dueInDays <= 7 ? 'is-warn' : 'is-ok'"
        :title="review.lastReview ? `上次复核：${fmtTime(review.lastReview.reviewed_at)} · 复核人 ${review.lastReview.reviewer} · 覆盖 ${review.lastReview.record_count} 条` + (review.lastReview.note ? ` · 结论：${review.lastReview.note}` : '') : `尚未执行过复核 · 建议每 ${review.intervalDays} 天复核一次`"
      >
        <ClipboardCheck :size="13" />
        <template v-if="review.lastReview">
          上次复核: {{ fmtTime(review.lastReview.reviewed_at) }} ·
          <span v-if="review.overdue">已逾期 {{ Math.abs(review.dueInDays ?? 0) }} 天</span>
          <span v-else>{{ review.dueInDays }} 天后到期</span>
        </template>
        <template v-else>尚未复核 · 建议每 {{ review.intervalDays }} 天一次</template>
      </span>
      <el-button class="audit-review-btn" type="primary" plain size="small" :icon="ClipboardCheck" @click="doReview">执行复核</el-button>
      <el-popover placement="bottom-end" :width="320" trigger="click">
        <template #reference>
          <el-button class="audit-review-btn" plain size="small" :icon="Settings">复核间隔</el-button>
        </template>
        <div class="audit-interval-form">
          <div class="audit-interval-form__title">复核间隔（天）</div>
          <p class="audit-interval-form__hint">
            建议每 30 天复核一次；可按业务合规要求调整（1~3650）。保存后写入审计链。
          </p>
          <el-input-number
            v-model="intervalDraft"
            :min="1"
            :max="3650"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
          <div class="audit-interval-form__actions">
            <el-button size="small" @click="resetIntervalDraft">恢复</el-button>
            <el-button size="small" type="primary" :loading="savingInterval" @click="saveInterval">保存</el-button>
          </div>
          <div v-if="review" class="audit-interval-form__current">
            当前：每 <b>{{ review.intervalDays }}</b> 天复核一次
          </div>
        </div>
      </el-popover>
    </div>

    <section class="log-query kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <el-form :inline="true" :model="query" class="log-query__form">
        <el-form-item label="操作人">
          <el-input v-model="query.username" placeholder="账号模糊搜索" clearable style="width: 130px" />
        </el-form-item>
        <el-form-item label="模块">
          <el-select v-model="query.module" placeholder="全部模块" clearable style="width: 130px">
            <el-option v-for="m in MODULE_OPTIONS" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="query.action" placeholder="全部" clearable style="width: 110px">
            <el-option v-for="a in ACTION_OPTIONS" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="query.keyword" placeholder="对象/详情/原因" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item label="开始">
          <el-date-picker v-model="query.from" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="开始时间" style="width: 175px" />
        </el-form-item>
        <el-form-item label="结束">
          <el-date-picker v-model="query.to" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="结束时间" style="width: 175px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="onQuery">查询</el-button>
          <el-button :icon="Download" @click="exportCsv">导出CSV(本页)</el-button>
          <el-button type="primary" plain :icon="Download" @click="serverExport('csv')">服务端导出CSV</el-button>
          <el-button type="primary" plain :icon="Download" @click="serverExport('json')">服务端导出JSON</el-button>
          <el-button :icon="Printer" @click="printTrail">打印</el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="audit-detail">
            <div class="audit-detail__block">
              <div class="audit-detail__h">修改前原值 (Before)</div>
              <pre class="audit-detail__pre">{{ jsonOrDash(row.before) }}</pre>
            </div>
            <div class="audit-detail__arrow">→</div>
            <div class="audit-detail__block">
              <div class="audit-detail__h">修改后新值 (After)</div>
              <pre class="audit-detail__pre">{{ jsonOrDash(row.after) }}</pre>
            </div>
            <div class="audit-detail__block audit-detail__block--wide">
              <div class="audit-detail__h">变更理由 (Why)</div>
              <div class="audit-detail__reason">{{ row.reason || '—（未填写）' }}</div>
              <div class="audit-detail__h audit-detail__h--hash">哈希链</div>
              <div class="audit-detail__hash">prev: {{ shortHash(row.prev_hash) }}</div>
              <div class="audit-detail__hash">hash: {{ shortHash(row.hash) }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="序号" width="60" class-name="seq-col" fixed>
        <template #default="{ $index }">{{ (page - 1) * limit + $index + 1 }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="100">
        <template #default="{ row }"><span class="log-user">{{ row.username }}</span></template>
      </el-table-column>
      <el-table-column label="模块" width="100">
        <template #default="{ row }"><el-tag size="small" effect="plain">{{ moduleLabel(row.module) }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="70">
        <template #default="{ row }">{{ actionLabel(row.action) }}</template>
      </el-table-column>
      <el-table-column prop="target" label="操作对象" min-width="150" show-overflow-tooltip />
      <el-table-column prop="detail" label="详情" min-width="180" show-overflow-tooltip />
      <el-table-column label="变更理由" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.reason" class="audit-reason">{{ row.reason }}</span>
          <span v-else class="audit-reason--na">—</span>
        </template>
      </el-table-column>
      <el-table-column label="前后值" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.before || row.after" size="small" type="warning" effect="plain">有</el-tag>
          <span v-else class="audit-reason--na">—</span>
        </template>
      </el-table-column>
      <el-table-column label="结果" width="70">
        <template #default="{ row }">
          <el-tag :type="row.result === 'success' ? 'success' : 'danger'" size="small">
            {{ row.result === 'success' ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ fmtTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="IP" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.ip || '-' }}</template>
      </el-table-column>
      <el-table-column label="完整性" width="90">
        <template #default="{ row }">
          <span v-if="row.hash" class="audit-hash-ok" title="本条已纳入哈希链">🔒 已签名</span>
          <span v-else class="audit-reason--na" title="历史记录（本功能上线前）">历史</span>
        </template>
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
.audit-integrity {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--kp-text-xs); padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--kp-border);
}
.audit-integrity.is-ok { color: var(--kp-success, #2ecc71); border-color: color-mix(in srgb, var(--kp-success, #2ecc71) 40%, transparent); background: color-mix(in srgb, var(--kp-success, #2ecc71) 12%, transparent); }
.audit-integrity.is-broken { color: var(--kp-danger); border-color: var(--kp-danger); background: color-mix(in srgb, var(--kp-danger) 12%, transparent); }
.audit-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: var(--kp-text-xs); padding: 3px 10px; border-radius: 999px;
  border: 1px solid var(--kp-border); white-space: nowrap;
}
.audit-badge.is-ok { color: var(--kp-success, #2ecc71); border-color: color-mix(in srgb, var(--kp-success, #2ecc71) 40%, transparent); background: color-mix(in srgb, var(--kp-success, #2ecc71) 12%, transparent); }
.audit-badge.is-warn { color: #e6a23c; border-color: #e6a23c; background: rgba(230, 162, 60, 0.12); }
.audit-badge.is-overdue { color: #ff5b5b; border-color: #ff5b5b; background: rgba(255, 91, 91, 0.12); font-weight: 600; }
.audit-review-btn { margin-left: 2px; }
.audit-interval-form { display: flex; flex-direction: column; gap: 10px; }
.audit-interval-form__title { font-size: var(--kp-text-sm); font-weight: 600; color: var(--kp-fg); }
.audit-interval-form__hint { margin: 0; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); line-height: 1.5; }
.audit-interval-form__actions { display: flex; gap: 8px; justify-content: flex-end; }
.audit-interval-form__current { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); padding-top: 4px; border-top: 1px solid var(--kp-border); }
.log-query { position: relative; border-radius: var(--kp-radius-md); padding: 14px; }
.log-query__form { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
.log-user { color: var(--kp-accent); font-weight: 500; }
.admin-table { flex: 1; min-height: 0; }
.admin-pager { display: flex; justify-content: flex-end; }

.audit-reason { color: var(--kp-fg); }
.audit-reason--na { color: var(--kp-fg-subtle); }
.audit-hash-ok { color: var(--kp-success, #2ecc71); font-size: var(--kp-text-xs); white-space: nowrap; }

.audit-detail { display: flex; gap: 14px; align-items: stretch; padding: 4px 8px; flex-wrap: wrap; }
.audit-detail__block { min-width: 220px; flex: 1; }
.audit-detail__block--wide { min-width: 260px; }
.audit-detail__h { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin-bottom: 6px; letter-spacing: var(--kp-tracking-label); }
.audit-detail__h--hash { margin-top: 10px; }
.audit-detail__pre {
  margin: 0; max-height: 220px; overflow: auto;
  background: var(--kp-bg-deep); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); padding: 8px 10px;
  font-size: var(--kp-text-xs); color: var(--kp-fg); white-space: pre-wrap; word-break: break-all;
}
.audit-detail__reason { font-size: var(--kp-text-sm); color: var(--kp-fg); background: var(--kp-bg-deep); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-sm); padding: 8px 10px; }
.audit-detail__hash { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); font-family: monospace; }
.audit-detail__arrow { align-self: center; color: var(--kp-accent); font-size: var(--kp-text-lg); }
</style>

<!-- 打印样式：仅保留审查追踪表格，隐藏后台侧栏/页头/查询工具条/分页 -->
<style>
@media print {
  .admin__aside, .admin__header, .admin__back, .admin__menu-hint { display: none !important; }
  .admin__main { padding: 0 !important; background: #fff !important; }
  .audit-trail .log-query, .audit-trail .admin-pager, .audit-integrity, .audit-badge, .audit-review-btn, .audit-interval-form { display: none !important; }
  .audit-trail .admin-table { height: auto !important; }
  .el-table { font-size: 11px; }
}
</style>

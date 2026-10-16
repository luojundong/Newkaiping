<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BellRing, Plus, Edit, Trash2, SlidersHorizontal } from 'lucide-vue-next'
import { alarmApi, alarmRuleApi } from '@/api'
import type {
  Alarm,
  AlarmLevel,
  AlarmStatus,
  AlarmRuleFull,
  AlarmRuleLevel,
  AlarmRuleComparator,
} from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'
import {
  ALARM_RULE_LEVELS,
  ALARM_RULE_COMPARATORS,
} from '@/types/api'

const activeTab = ref<'list' | 'rule'>('list')

// =====================================================
// 一、告警列表
// =====================================================
const loading = ref(false)
const rows = ref<Alarm[]>([])
const filterLevel = ref<string>('')
const filterStatus = ref<string>('')

const LEVEL_MAP: Record<AlarmLevel, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  critical: { text: '严重', type: 'danger' },
  warning: { text: '预警', type: 'warning' },
  info: { text: '提示', type: 'info' },
}
const STATUS_MAP: Record<AlarmStatus, { text: string; type: 'success' | 'info' | 'warning' | 'danger' }> = {
  active: { text: '活动', type: 'warning' },
  acknowledged: { text: '已确认', type: 'info' },
  cleared: { text: '已清除', type: 'success' },
  suppressed: { text: '已抑制', type: 'info' },
}

async function loadAlarms() {
  loading.value = true
  try {
    const res = await alarmApi.list({
      level: filterLevel.value || undefined,
      status: filterStatus.value || undefined,
    })
    rows.value = res.items
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function ack(a: Alarm) {
  try {
    await alarmApi.ack(a.id)
    ElMessage.success('告警已确认')
    loadAlarms()
  } catch {
    ElMessage.error('确认失败')
  }
}
async function clear(a: Alarm) {
  try {
    await alarmApi.clear(a.id)
    ElMessage.success('告警已清除')
    loadAlarms()
  } catch {
    ElMessage.error('清除失败')
  }
}

// =====================================================
// 二、异常配置（告警规则）
// =====================================================
const ruleLoading = ref(false)
const rules = ref<AlarmRuleFull[]>([])
const filterSubsystem = ref<string>('')

const RULE_LEVEL_MAP: Record<AlarmRuleLevel, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  critical: { text: '严重', type: 'danger' },
  warning: { text: '预警', type: 'warning' },
  info: { text: '提示', type: 'info' },
}

const ruleDialog = ref(false)
const ruleSaving = ref(false)
const ruleEditingId = ref<string | null>(null)
const ruleFormRef = ref()

const emptyRuleForm = () => ({
  event_code: '',
  event_name: '',
  description: '',
  subsystem: SUBSYSTEMS[0].code,
  device_category: '',
  notify_enabled: true,
  alarm_enabled: true,
  level: 'warning' as AlarmRuleLevel,
  threshold: 0,
  recovery_threshold: 0,
  unit: '',
  comparator: '>' as AlarmRuleComparator,
})
const ruleForm = reactive(emptyRuleForm())

const ruleFormRules = {
  event_code: [{ required: true, message: '请输入事件编码', trigger: 'blur' }],
  event_name: [{ required: true, message: '请输入事件名称', trigger: 'blur' }],
  subsystem: [{ required: true, message: '请选择子系统', trigger: 'change' }],
  level: [{ required: true, message: '请选择级别', trigger: 'change' }],
  comparator: [{ required: true, message: '请选择比较符', trigger: 'change' }],
}

async function loadRules() {
  ruleLoading.value = true
  try {
    const res = (await alarmRuleApi.list({
      subsystem: filterSubsystem.value || undefined,
    })) as unknown as AlarmRuleFull[]
    rules.value = res
  } catch {
    rules.value = []
  } finally {
    ruleLoading.value = false
  }
}

function openRuleCreate() {
  ruleEditingId.value = null
  Object.assign(ruleForm, emptyRuleForm())
  ruleDialog.value = true
}

function openRuleEdit(r: AlarmRuleFull) {
  ruleEditingId.value = r.id
  Object.assign(ruleForm, {
    event_code: r.event_code,
    event_name: r.event_name,
    description: r.description || '',
    subsystem: r.subsystem,
    device_category: r.device_category || '',
    notify_enabled: r.notify_enabled,
    alarm_enabled: r.alarm_enabled,
    level: r.level,
    threshold: r.threshold,
    recovery_threshold: r.recovery_threshold,
    unit: r.unit || '',
    comparator: r.comparator,
  })
  ruleDialog.value = true
}

async function submitRule() {
  if (!ruleFormRef.value) return
  try {
    await ruleFormRef.value.validate()
  } catch {
    return
  }
  ruleSaving.value = true
  const body: Record<string, unknown> = {
    event_code: ruleForm.event_code,
    event_name: ruleForm.event_name,
    description: ruleForm.description || undefined,
    subsystem: ruleForm.subsystem,
    device_category: ruleForm.device_category || undefined,
    notify_enabled: ruleForm.notify_enabled,
    alarm_enabled: ruleForm.alarm_enabled,
    level: ruleForm.level,
    threshold: ruleForm.threshold,
    recovery_threshold: ruleForm.recovery_threshold,
    unit: ruleForm.unit || undefined,
    comparator: ruleForm.comparator,
  }
  try {
    if (ruleEditingId.value) {
      await alarmRuleApi.update(ruleEditingId.value, body)
      ElMessage.success('规则已更新')
    } else {
      await alarmRuleApi.create(body)
      ElMessage.success('规则已创建')
    }
    ruleDialog.value = false
    loadRules()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    ruleSaving.value = false
  }
}

async function removeRule(r: AlarmRuleFull) {
  try {
    await ElMessageBox.confirm(`确认删除规则「${r.event_name}」（${r.event_code}）？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await alarmRuleApi.remove(r.id)
    ElMessage.success('规则已删除')
    loadRules()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

onMounted(() => {
  loadAlarms()
  loadRules()
})
</script>

<template>
  <div class="admin-page">
    <el-tabs v-model="activeTab" class="alarm-tabs">
      <!-- 告警列表 -->
      <el-tab-pane label="告警列表" name="list">
        <div class="admin-toolbar">
          <BellRing :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">告警记录</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="filterLevel" placeholder="全部级别" clearable style="width: 130px" @change="loadAlarms">
              <el-option v-for="(v, k) in LEVEL_MAP" :key="k" :label="v.text" :value="k" />
            </el-select>
            <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 130px" @change="loadAlarms">
              <el-option v-for="(v, k) in STATUS_MAP" :key="k" :label="v.text" :value="k" />
            </el-select>
          </div>
        </div>

        <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="级别" width="90">
            <template #default="{ row }">
              <el-tag :type="LEVEL_MAP[row.level as AlarmLevel].type" size="small">
                {{ LEVEL_MAP[row.level as AlarmLevel].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="160" />
          <el-table-column prop="message" label="描述" min-width="220" show-overflow-tooltip />
          <el-table-column prop="building_id" label="楼栋" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="STATUS_MAP[row.status as AlarmStatus].type" size="small">
                {{ STATUS_MAP[row.status as AlarmStatus].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="last_at" label="最近时间" width="170" />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <span
                class="kp-action-link"
                :class="{ 'is-disabled': row.status === 'cleared' }"
                @click="row.status !== 'cleared' && ack(row)"
              >确认</span>
              <span class="kp-sep" />
              <span
                class="kp-action-link kp-action-link--danger"
                :class="{ 'is-disabled': row.status === 'cleared' }"
                @click="row.status !== 'cleared' && clear(row)"
              >清除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 异常配置 -->
      <el-tab-pane label="异常配置" name="rule">
        <div class="admin-toolbar">
          <SlidersHorizontal :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">告警异常配置</span>
          <div class="admin-toolbar__filters">
            <el-select v-model="filterSubsystem" placeholder="全部子系统" clearable style="width: 150px" @change="loadRules">
              <el-option v-for="s in SUBSYSTEMS" :key="s.code" :label="s.name" :value="s.code" />
            </el-select>
            <el-button type="primary" :icon="Plus" @click="openRuleCreate">新增规则</el-button>
          </div>
        </div>

        <el-table :data="rules" v-loading="ruleLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="event_code" label="事件编码" width="150" />
          <el-table-column prop="event_name" label="事件名称" min-width="150" />
          <el-table-column label="子系统" width="120">
            <template #default="{ row }">{{ SUBSYSTEMS.find((s) => s.code === row.subsystem)?.name || row.subsystem }}</template>
          </el-table-column>
          <el-table-column label="条件" width="180">
            <template #default="{ row }">
              {{ row.comparator }} {{ row.threshold }}{{ row.unit }}
              <span class="rule-recover">/ 恢复 {{ row.recovery_threshold }}{{ row.unit }}</span>
            </template>
          </el-table-column>
          <el-table-column label="级别" width="90">
            <template #default="{ row }">
              <el-tag :type="RULE_LEVEL_MAP[row.level as AlarmRuleLevel].type" size="small">
                {{ RULE_LEVEL_MAP[row.level as AlarmRuleLevel].text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="通知" width="80">
            <template #default="{ row }">
              <el-tag :type="row.notify_enabled ? 'success' : 'info'" size="small">{{ row.notify_enabled ? '开' : '关' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="告警" width="80">
            <template #default="{ row }">
              <el-tag :type="row.alarm_enabled ? 'warning' : 'info'" size="small">{{ row.alarm_enabled ? '开' : '关' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openRuleEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeRule(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 告警规则对话框 -->
    <el-dialog
      v-model="ruleDialog"
      :title="ruleEditingId ? '编辑告警规则' : '新增告警规则'"
      width="600px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-width="96px" class="rule-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="事件编码" prop="event_code">
              <el-input v-model="ruleForm.event_code" placeholder="如 TEMP_HIGH" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="事件名称" prop="event_name">
              <el-input v-model="ruleForm.event_name" placeholder="如 温度过高" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="子系统" prop="subsystem">
              <el-select v-model="ruleForm.subsystem" style="width: 100%">
                <el-option v-for="s in SUBSYSTEMS" :key="s.code" :label="s.name" :value="s.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备类型">
              <el-input v-model="ruleForm.device_category" placeholder="选填，如 空调" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input v-model="ruleForm.description" type="textarea" :rows="2" placeholder="规则说明" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="比较符" prop="comparator">
              <el-select v-model="ruleForm.comparator" style="width: 100%">
                <el-option v-for="c in ALARM_RULE_COMPARATORS" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="阈值" prop="threshold">
              <el-input-number v-model="ruleForm.threshold" :step="0.1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单位">
              <el-input v-model="ruleForm.unit" placeholder="如 ℃" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="恢复阈值">
              <el-input-number v-model="ruleForm.recovery_threshold" :step="0.1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="级别" prop="level">
              <el-select v-model="ruleForm.level" style="width: 100%">
                <el-option v-for="l in ALARM_RULE_LEVELS" :key="l.value" :label="l.label" :value="l.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="启用通知">
              <el-switch v-model="ruleForm.notify_enabled" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用告警">
              <el-switch v-model="ruleForm.alarm_enabled" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialog = false">取消</el-button>
        <el-button type="primary" :loading="ruleSaving" @click="submitRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.alarm-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.alarm-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.alarm-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.admin-table { flex: 1; min-height: 0; }
.rule-recover { color: var(--kp-fg-muted); font-size: var(--kp-text-xs); margin-left: 4px; }
</style>

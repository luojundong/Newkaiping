<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BellRing, Plus, Edit, Trash2 } from 'lucide-vue-next'
import { alarmRuleApi } from '@/api'
import type { AlarmRuleFull, AlarmRuleLevel, AlarmRuleComparator } from '@/types/api'
import { SUBSYSTEMS } from '@/types/scene'
import {
  ALARM_RULE_LEVELS,
  ALARM_RULE_COMPARATORS,
} from '@/types/api'

const loading = ref(false)
const rows = ref<AlarmRuleFull[]>([])
const filterSubsystem = ref<string>('')

const LEVEL_MAP: Record<AlarmRuleLevel, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  critical: { text: '严重', type: 'danger' },
  warning: { text: '预警', type: 'warning' },
  info: { text: '提示', type: 'info' },
}

const dialogVisible = ref(false)
const dialogSaving = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref()

const emptyForm = () => ({
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
const form = reactive(emptyForm())

const rules = {
  event_code: [{ required: true, message: '请输入事件编码', trigger: 'blur' }],
  event_name: [{ required: true, message: '请输入事件名称', trigger: 'blur' }],
  subsystem: [{ required: true, message: '请选择子系统', trigger: 'change' }],
  level: [{ required: true, message: '请选择级别', trigger: 'change' }],
  comparator: [{ required: true, message: '请选择比较符', trigger: 'change' }],
}

async function load() {
  loading.value = true
  try {
    const res = (await alarmRuleApi.list({
      subsystem: filterSubsystem.value || undefined,
    })) as unknown as AlarmRuleFull[]
    rows.value = res
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function onFilter() {
  load()
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

function openEdit(r: AlarmRuleFull) {
  editingId.value = r.id
  Object.assign(form, {
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
  dialogVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  dialogSaving.value = true
  const body: Record<string, unknown> = {
    event_code: form.event_code,
    event_name: form.event_name,
    description: form.description || undefined,
    subsystem: form.subsystem,
    device_category: form.device_category || undefined,
    notify_enabled: form.notify_enabled,
    alarm_enabled: form.alarm_enabled,
    level: form.level,
    threshold: form.threshold,
    recovery_threshold: form.recovery_threshold,
    unit: form.unit || undefined,
    comparator: form.comparator,
  }
  try {
    if (editingId.value) {
      await alarmRuleApi.update(editingId.value, body)
      ElMessage.success('规则已更新')
    } else {
      await alarmRuleApi.create(body)
      ElMessage.success('规则已创建')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    dialogSaving.value = false
  }
}

async function remove(r: AlarmRuleFull) {
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
    load()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <div class="admin-toolbar">
      <BellRing :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">告警异常配置</span>
      <div class="admin-toolbar__filters">
        <el-select v-model="filterSubsystem" placeholder="全部子系统" clearable style="width: 150px" @change="onFilter">
          <el-option v-for="s in SUBSYSTEMS" :key="s.code" :label="s.name" :value="s.code" />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增规则</el-button>
      </div>
    </div>

    <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
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
          <el-tag :type="LEVEL_MAP[row.level as AlarmRuleLevel].type" size="small">
            {{ LEVEL_MAP[row.level as AlarmRuleLevel].text }}
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
              <span class="kp-action-link" @click="openEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="remove(row)">删除</span>
            </template>
          </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑告警规则' : '新增告警规则'"
      width="600px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" class="rule-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="事件编码" prop="event_code">
              <el-input v-model="form.event_code" placeholder="如 TEMP_HIGH" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="事件名称" prop="event_name">
              <el-input v-model="form.event_name" placeholder="如 温度过高" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="子系统" prop="subsystem">
              <el-select v-model="form.subsystem" style="width: 100%">
                <el-option v-for="s in SUBSYSTEMS" :key="s.code" :label="s.name" :value="s.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设备类型">
              <el-input v-model="form.device_category" placeholder="选填，如 空调" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="规则说明" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="比较符" prop="comparator">
              <el-select v-model="form.comparator" style="width: 100%">
                <el-option v-for="c in ALARM_RULE_COMPARATORS" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="阈值" prop="threshold">
              <el-input-number v-model="form.threshold" :step="0.1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="单位">
              <el-input v-model="form.unit" placeholder="如 ℃" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="恢复阈值">
              <el-input-number v-model="form.recovery_threshold" :step="0.1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="级别" prop="level">
              <el-select v-model="form.level" style="width: 100%">
                <el-option v-for="l in ALARM_RULE_LEVELS" :key="l.value" :label="l.label" :value="l.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="启用通知">
              <el-switch v-model="form.notify_enabled" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用告警">
              <el-switch v-model="form.alarm_enabled" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.admin-table { flex: 1; min-height: 0; }
.rule-recover { color: var(--kp-fg-muted); font-size: var(--kp-text-xs); margin-left: 4px; }
</style>

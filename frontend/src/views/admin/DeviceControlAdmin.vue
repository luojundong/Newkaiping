<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { SlidersHorizontal, Send } from 'lucide-vue-next'
import { deviceControlApi, buildingApi } from '@/api'
import type { Building, ControlAck, SubsystemCode } from '@/types/api'

const SUBS = [
  { code: 'hvac', label: '空调' },
  { code: 'lighting', label: '照明' },
  { code: 'power', label: '电力' },
  { code: 'hotwater', label: '热水' },
  { code: 'elevator', label: '电梯' },
  { code: 'regulation', label: '用能调控' },
  { code: 'lifecycle', label: '生命周期' },
] as const

const ACTIONS = [
  { value: 'power_on', label: '开机' },
  { value: 'power_off', label: '关机' },
  { value: 'set_temperature', label: '设定温度' },
  { value: 'set_mode', label: '设定模式' },
  { value: 'set_strategy', label: '设定策略' },
  { value: 'dimming', label: '调光' },
  { value: 'reboot', label: '重启' },
  { value: 'remote', label: '远程遥控' },
] as const

const buildings = ref<Building[]>([])
const sending = ref(false)
const result = ref<ControlAck | null>(null)
const errMsg = ref('')

const form = reactive({
  subsystem: 'hvac' as SubsystemCode,
  buildingId: '' as string,
  action: 'power_on' as string,
  payloadText: '{}',
  reason: '' as string,
})

function subLabel(c: string): string {
  return SUBS.find((s) => s.code === c)?.label || c
}

async function loadBuildings() {
  try {
    const res = await buildingApi.list()
    buildings.value = res.items || []
  } catch {
    buildings.value = []
  }
}

async function send() {
  errMsg.value = ''
  result.value = null
  if (!form.reason.trim()) {
    errMsg.value = '变更理由(Why)为必填项：关键设备控制动作必须记录操作原因。'
    return
  }
  let payload: Record<string, unknown> = {}
  if (form.payloadText.trim()) {
    try {
      payload = JSON.parse(form.payloadText)
    } catch {
      errMsg.value = '参数(JSON)格式不正确，请检查。'
      return
    }
  }
  sending.value = true
  try {
    const ack = await deviceControlApi.control(form.subsystem, {
      action: form.action as any,
      payload,
      building_id: form.buildingId || undefined,
      reason: form.reason.trim(),
    })
    result.value = ack
  } catch (e: any) {
    errMsg.value = String((e && e.message) || e) || '控制指令下发失败'
  } finally {
    sending.value = false
  }
}

onMounted(loadBuildings)
</script>

<template>
  <div class="admin-page">
    <div class="admin-toolbar">
      <SlidersHorizontal :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">设备控制</span>
    </div>

    <section class="ctrl-panel kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <el-form :model="form" label-width="92px" class="ctrl-form">
        <el-form-item label="子系统" required>
          <el-select v-model="form.subsystem" style="width: 220px">
            <el-option v-for="s in SUBS" :key="s.code" :label="s.label" :value="s.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="楼栋">
          <el-select v-model="form.buildingId" placeholder="全部楼栋（留空=楼栋级/全域）" clearable style="width: 220px">
            <el-option v-for="b in buildings" :key="b.id" :label="`${b.name}（${b.code}）`" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="控制动作" required>
          <el-select v-model="form.action" style="width: 220px">
            <el-option v-for="a in ACTIONS" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="参数(JSON)">
          <el-input v-model="form.payloadText" type="textarea" :rows="3" placeholder='如 {"value": 26}' style="width: 360px" />
        </el-form-item>
        <el-form-item label="变更理由" required>
          <el-input v-model="form.reason" type="textarea" :rows="2" placeholder="关键设备控制动作必须填写操作原因（如：工艺优化 / 巡检异常处理）" style="width: 360px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Send" :loading="sending" @click="send">下发控制指令</el-button>
        </el-form-item>
        <el-alert v-if="errMsg" type="error" :closable="false" :title="errMsg" show-icon style="width: 480px" />
        <el-alert
          v-if="result"
          type="success"
          :closable="false"
          show-icon
          style="width: 480px"
          :title="`指令已下发：${result.message}`"
        >
          <template #default>
            <div class="ctrl-ack">
              <div>受理：{{ result.accepted ? '是' : '否' }}</div>
              <div>设备：{{ result.device_id || '楼栋级/全域' }}</div>
            </div>
          </template>
        </el-alert>
      </el-form>
      <p class="ctrl-tip">
        说明：本页控制动作将实时下发至 {{ subLabel(form.subsystem) }} 子系统，并写入「审查追踪」审计日志（含操作人、前后值、变更理由、防篡改哈希链）。
      </p>
    </section>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.ctrl-panel { position: relative; border-radius: var(--kp-radius-md); padding: 18px 16px 8px; }
.ctrl-form { max-width: 640px; }
.ctrl-tip { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin: 4px 0 12px 92px; }
.ctrl-ack { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin-top: 4px; }
</style>

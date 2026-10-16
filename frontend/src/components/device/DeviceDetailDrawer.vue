<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Box, MapPin, Gauge, Power, PowerOff, Settings2, Activity, Lock, Minus, Plus, Snowflake, Sun, Wind, Droplets, Fan } from 'lucide-vue-next'
import { KP_ACCENT } from '@/lib/kp-accent'
import TrendChart from '@/components/panels/TrendChart.vue'
import DeviceWidgetBoard from '@/components/device/DeviceWidgetBoard.vue'
import RemoteControlDialog from '@/components/RemoteControlDialog.vue'
import LightingControlDialog from '@/components/device/LightingControlDialog.vue'
import { useSceneStore } from '@/stores/scene'
import { useUserStore } from '@/stores/user'
import { useI18nStore } from '@/stores/i18n'
import { deviceApi } from '@/api'
import { buildDeviceTemplatePlan } from '@/lib/schema-device-template'
import type { Device, Metric, ControlCommand } from '@/types/api'

const scene = useSceneStore()
const user = useUserStore()
const { t } = useI18nStore()

const device = ref<Device | null>(null)
const latest = ref<Metric[]>([])
const history = ref<Metric[]>([])
const loading = ref(false)
const controlling = ref(false)

// AC-07：低权限账号（非 admin/operator 且无 device:control）禁用高危控制
const controllable = computed(() => user.canControl())

const STATUS_MAP: Record<string, { zh: string; en: string }> = {
  running: { zh: '运行中', en: 'Running' },
  stopped: { zh: '已停止', en: 'Stopped' },
  fault: { zh: '故障', en: 'Fault' },
  offline: { zh: '离线', en: 'Offline' },
  maintenance: { zh: '检修中', en: 'Maintenance' },
}
const statusText = computed(() => {
  if (!device.value) return '—'
  const m = STATUS_MAP[device.value.status]
  return m ? t(m.zh, m.en) : device.value.status
})

const accentColor = () => {
  if (typeof document === 'undefined') return KP_ACCENT
  return getComputedStyle(document.documentElement).getPropertyValue('--kp-accent').trim() || KP_ACCENT
}
const chartColor = ref(accentColor())
const chartData = computed(() => history.value.map((m) => Number(m.value.toFixed(2))))
const chartLabels = computed(() => history.value.map((m) => (m.time || '').slice(11, 16)))

// GK-10 · schema widget.type 模板计划：按 REST 设备 id 在 Scene Schema 中解析
// deviceType/marker_type → widget 区块组合。schema 缺失/离线/未命中 → null（回退旧内容）。
const templatePlan = computed(() =>
  buildDeviceTemplatePlan(scene.sceneSchema, scene.selectedDeviceId),
)
const isAcDevice = computed(() => templatePlan.value?.isAc === true)
// GK-23 C：照明设备按 subsystem 判断（schema 模板计划未覆盖照明时同样可靠）
const isLightingDevice = computed(() => device.value?.subsystem_id === 'lighting')

// 空调遥控器面板本地状态（仅 UI；下发走现有控制 API）
const acTemp = ref(26)
const acMode = ref<'cool' | 'heat' | 'fan' | 'dry'>('cool')
const acFan = ref<'auto' | 'low' | 'mid' | 'high'>('auto')
const AC_MODES: Array<{ key: 'cool' | 'heat' | 'fan' | 'dry'; zh: string; en: string; icon: typeof Snowflake }> = [
  { key: 'cool', zh: '制冷', en: 'Cool', icon: Snowflake },
  { key: 'heat', zh: '制热', en: 'Heat', icon: Sun },
  { key: 'fan', zh: '送风', en: 'Fan', icon: Wind },
  { key: 'dry', zh: '除湿', en: 'Dry', icon: Droplets },
]
const AC_FANS: Array<{ key: 'auto' | 'low' | 'mid' | 'high'; zh: string; en: string }> = [
  { key: 'auto', zh: '自动', en: 'Auto' },
  { key: 'low', zh: '低风', en: 'Low' },
  { key: 'mid', zh: '中风', en: 'Mid' },
  { key: 'high', zh: '高风', en: 'High' },
]

async function loadDetail() {
  const id = scene.selectedDeviceId
  if (!id) return
  loading.value = true
  try {
    const [dev, l] = await Promise.all([deviceApi.detail(id), deviceApi.metricsLatest(id)])
    device.value = dev
    latest.value = l.metrics
    const key = l.metrics[0]?.metric_key
    if (key) {
      const h = await deviceApi.metrics(id, {
        keys: [key],
        from: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        to: new Date().toISOString(),
      })
      history.value = h.metrics
    } else {
      history.value = []
    }
  } catch {
    device.value = null
    latest.value = []
    history.value = []
  } finally {
    loading.value = false
  }
}

// 控制下发：完全复用现有 REST 控制链路（POST /devices/{id}/control，后端不改）。
// GK-10 空调遥控器面板复用同一函数：set_temperature/set_mode 带 payload。
async function control(action: ControlCommand['action'], payload: Record<string, unknown> = {}) {
  const id = scene.selectedDeviceId
  if (!id || !controllable.value) return
  controlling.value = true
  try {
    const ack = await deviceApi.control(id, { action, payload })
    if (ack.accepted) {
      ElMessage.success(ack.message || t('指令已下发', 'Command sent'))
    } else {
      ElMessage.warning(ack.message || t('指令被拒绝', 'Command rejected'))
    }
  } catch (e) {
    ElMessage.error(t('控制指令下发失败，请稍后重试', 'Failed to send command, please retry'))
  } finally {
    controlling.value = false
  }
}

// 遥控器动作（GK-10）：仅扩展 action/payload 组合，链路与 deviceApi.control 完全一致
function acSetTemp(delta: number) {
  const next = Math.min(30, Math.max(16, acTemp.value + delta))
  if (next === acTemp.value) return
  acTemp.value = next
  control('set_temperature', { temperature: next })
}
function acSetMode(mode: 'cool' | 'heat' | 'fan' | 'dry') {
  acMode.value = mode
  control('set_mode', { mode })
}
function acSetFan(fan: 'auto' | 'low' | 'mid' | 'high') {
  acFan.value = fan
  control('set_mode', { mode: acMode.value, fan })
}

watch(
  () => [scene.deviceDetailOpen, scene.selectedDeviceId, scene.themeType],
  ([open]) => {
    chartColor.value = accentColor()
    if (open && scene.selectedDeviceId) loadDetail()
  },
)
</script>

<template>
  <el-dialog
    :model-value="scene.deviceDetailOpen"
    align-center
    :with-header="false"
    class="kp-modal device-detail-modal device-drawer"
    width="640px"
    append-to-body
    @update:model-value="(v: boolean) => !v && scene.closeDevice()"
  >
    <div class="device-detail">
      <header class="device-detail__head">
        <span class="kp-corner kp-corner--tl" />
        <span class="kp-corner kp-corner--tr" />
        <Box :size="20" class="device-detail__icon" />
        <div class="device-detail__title">
          <h3>{{ device?.name || t('设备详情', 'Device Details') }}</h3>
          <span class="mono device-detail__code">{{ device?.code || '—' }}</span>
        </div>
        <button class="device-detail__close" aria-label="关闭" @click="scene.closeDevice()">×</button>
      </header>

      <div v-if="loading" class="kp-empty">{{ t('设备数据加载中…', 'Loading device data…') }}</div>
      <div v-else-if="!device" class="kp-empty">{{ t('未获取到设备信息', 'No device info') }}</div>

      <div v-else class="device-detail__body">
        <!-- 设备元数据 -->
        <section class="dd-section">
          <h4 class="dd-section__title"><Gauge :size="15" /> {{ t('设备档案', 'Device Profile') }}</h4>
          <dl class="dd-meta">
            <div><dt>{{ t('型号', 'Model') }}</dt><dd>{{ device.model || '—' }}</dd></div>
            <div><dt>{{ t('厂商', 'Manufacturer') }}</dt><dd>{{ device.manufacturer || '—' }}</dd></div>
            <div><dt>{{ t('状态', 'Status') }}</dt><dd class="dd-status">{{ statusText }}</dd></div>
            <div><dt>{{ t('位置', 'Location') }}</dt>
              <dd><MapPin :size="12" /> {{ device.location.floor }}F {{ device.location.room }}</dd>
            </div>
            <div class="dd-meta__full"><dt>{{ t('安装日期', 'Install Date') }}</dt><dd class="mono">{{ device.install_date?.slice(0, 10) }}</dd></div>
          </dl>
        </section>

        <!-- GK-10：schema widget.type 模板区块（device_board/status_grid/stat_card） -->
        <DeviceWidgetBoard
          v-if="templatePlan"
          :plan="templatePlan"
          :metrics="latest"
          :status="device.status"
        />

        <!-- 回退：schema 缺失/离线/未命中模板时保持改造前内容（GK-10 向后兼容） -->
        <section v-if="!templatePlan" class="dd-section">
          <h4 class="dd-section__title"><Activity :size="15" /> {{ t('实时参数', 'Real-time Parameters') }}</h4>
          <div v-if="!latest.length" class="kp-empty kp-empty--sm">{{ t('暂无实时参数', 'No real-time parameters') }}</div>
          <div v-else class="dd-params">
            <div v-for="m in latest" :key="m.metric_key" class="dd-param">
              <span class="dd-param__key">{{ m.metric_key }}</span>
              <span class="dd-param__val mono">{{ m.value }}<i>{{ m.unit }}</i></span>
            </div>
          </div>
        </section>

        <!-- 趋势 -->
        <section class="dd-section dd-section--grow">
          <h4 class="dd-section__title"><Activity :size="15" /> {{ t('近 24 小时趋势', '24h Trend') }}</h4>
          <div class="dd-chart">
            <TrendChart v-if="chartData.length" :data="chartData" :labels="chartLabels" :color="chartColor" :height="'100%'" />
            <div v-else class="kp-empty kp-empty--sm">{{ t('暂无历史数据', 'No history data') }}</div>
          </div>
        </section>

        <!-- 控制（AC-07 权限门控） -->
        <!-- GK-23 C 弹窗分流：按设备类型路由到独立控制组件 -->
        <!-- 照明 → 智慧照明管理系统 -->
        <section v-if="isLightingDevice" class="dd-section">
          <h4 class="dd-section__title">
            <Settings2 :size="15" /> {{ t('智慧照明管理', 'Lighting Control') }}
            <Lock v-if="!controllable" :size="12" class="dd-lock" />
          </h4>
          <LightingControlDialog
            v-if="controllable"
            :embedded="true"
            :model-value="true"
            :device="device"
            :key="'lc-' + (device?.id || 'none')"
          />
          <p v-else class="dd-tip">{{ t('当前账号无设备控制权限，请联系管理员开通。', 'Current account has no device control permission. Contact admin.') }}</p>
        </section>
        <!-- 空调 → 空调集中控制调度系统（复用 RemoteControlDialog 深度面板） -->
        <section v-else-if="isAcDevice" class="dd-section">
          <h4 class="dd-section__title">
            <Fan :size="15" /> {{ t('空调集中控制调度', 'AC Central Control') }}
            <Lock v-if="!controllable" :size="12" class="dd-lock" />
          </h4>
          <RemoteControlDialog
            v-if="controllable"
            :embedded="true"
            :model-value="true"
            :device="device"
            :key="'rc-' + (device?.id || 'none')"
          />
          <p v-else class="dd-tip">{{ t('当前账号无设备控制权限，请联系管理员开通。', 'Current account has no device control permission. Contact admin.') }}</p>
        </section>
        <!-- 其他设备：沿用开关/策略三按钮 -->
        <section v-else class="dd-section">
          <h4 class="dd-section__title">
            <Settings2 :size="15" /> {{ t('设备控制', 'Device Control') }}
            <Lock v-if="!controllable" :size="12" class="dd-lock" />
          </h4>
          <div class="dd-controls">
            <button class="dd-btn" :disabled="!controllable || controlling" @click="control('power_on')">
              <Power :size="15" /> {{ t('开机', 'Power On') }}
            </button>
            <button class="dd-btn" :disabled="!controllable || controlling" @click="control('power_off')">
              <PowerOff :size="15" /> {{ t('关机', 'Power Off') }}
            </button>
            <button class="dd-btn" :disabled="!controllable || controlling" @click="control('set_strategy')">
              <Settings2 :size="15" /> {{ t('策略切换', 'Switch Strategy') }}
            </button>
          </div>
          <p v-if="!controllable" class="dd-tip">{{ t('当前账号无设备控制权限，请联系管理员开通。', 'Current account has no device control permission. Contact admin.') }}</p>
        </section>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.device-detail {
  position: relative;
  display: flex;
  flex-direction: column;
  color: var(--kp-fg);
}
.device-detail__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--kp-border-strong);
  background: linear-gradient(90deg, var(--kp-glow-soft), transparent);
}
.device-detail__icon {
  color: var(--kp-accent);
  filter: drop-shadow(0 0 6px var(--kp-glow));
}
.device-detail__title { flex: 1; min-width: 0; }
.device-detail__title h3 {
  margin: 0;
  font-size: var(--kp-text-lg);
  font-weight: 590;
  letter-spacing: var(--kp-tracking-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.device-detail__code { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.device-detail__close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--kp-border);
  background: transparent;
  color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-sm);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.device-detail__close:hover { color: var(--kp-fg); border-color: var(--kp-border-strong); }

.device-detail__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px;
}
.dd-section { flex-shrink: 0; }
.dd-section--grow { flex: 1; min-height: 140px; display: flex; flex-direction: column; }
.dd-section__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: var(--kp-text-md);
  font-weight: 510;
  color: var(--kp-fg);
  letter-spacing: var(--kp-tracking-label);
}
.dd-section__title svg { color: var(--kp-accent); }
.dd-lock { color: var(--kp-warn); }

.dd-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  margin: 0;
}
.dd-meta > div { display: flex; flex-direction: column; gap: 2px; }
.dd-meta__full { grid-column: 1 / -1; }
.dd-meta dt { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.dd-meta dd { margin: 0; font-size: var(--kp-text-sm); display: flex; align-items: center; gap: 4px; }
.dd-status { color: var(--kp-accent); }

.dd-params {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.dd-param {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
}
.dd-param__key { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dd-param__val { font-size: var(--kp-text-md); color: var(--kp-fg); }
.dd-param__val i { font-style: normal; font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin-left: 2px; }

.dd-chart { flex: 1; min-height: 0; }

.dd-controls { display: flex; gap: 8px; }
.dd-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 38px;
  border: 1px solid var(--kp-border-strong);
  background: var(--kp-glow-soft);
  color: var(--kp-fg);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.dd-btn:hover:not(:disabled) { border-color: var(--kp-accent); color: var(--kp-accent); box-shadow: var(--kp-elev-glow); }
.dd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dd-tip { margin: 8px 0 0; font-size: var(--kp-text-xs); color: var(--kp-warn); }

/* GK-10 · 空调遥控器面板 */
.ac-remote {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--kp-border-strong);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(var(--kp-accent-rgb), 0.06), rgba(var(--kp-accent-rgb), 0.02));
}
.ac-remote__screen {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: rgba(0, 0, 0, 0.35);
}
.ac-remote__temp { font-size: 22px; font-weight: 620; color: var(--kp-accent); }
.ac-remote__mode { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.ac-remote__row { display: flex; gap: 6px; }
.ac-remote__btn { padding: 0 6px; font-size: var(--kp-text-xs); }
.ac-remote__chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ac-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-pill, 999px);
  background: transparent;
  color: var(--kp-fg-muted);
  font-size: var(--kp-text-xs);
  cursor: pointer;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.ac-chip:hover:not(:disabled) { color: var(--kp-fg); border-color: var(--kp-border-strong); }
.ac-chip--active {
  color: var(--kp-accent);
  border-color: var(--kp-accent);
  box-shadow: 0 0 6px rgba(var(--kp-accent-rgb), 0.35);
}
.ac-chip:disabled { opacity: 0.4; cursor: not-allowed; }

.kp-empty--sm { min-height: 60px; font-size: var(--kp-text-xs); }
</style>

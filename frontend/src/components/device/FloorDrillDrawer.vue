<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Layers, Box, Activity, Building2, ChevronRight, LayoutGrid, ChevronLeft } from 'lucide-vue-next'
import { useSceneStore } from '@/stores/scene'
import { useI18nStore } from '@/stores/i18n'
import { deviceApi } from '@/api'
import { SUBSYSTEMS } from '@/types/scene'
import type { Device } from '@/types/api'
import { generateFloorPlan, type FloorPlan, type FloorPlanDeviceInput } from '@/lib/floorplan-gen'
import FloorPlanView from '@/components/bigscreen/FloorPlanView.vue'
import RemoteControlDialog from '@/components/RemoteControlDialog.vue'
import LightingControlDialog from '@/components/device/LightingControlDialog.vue'

const props = defineProps<{
  buildingId: string | null
  floor: number | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const scene = useSceneStore()
const { t } = useI18nStore()

const devices = ref<Device[]>([])
const loading = ref(false)

const open = computed(() => !!props.buildingId && props.floor != null)
const buildingName = computed(() => {
  const b = scene.buildings.find((x) => x.id === props.buildingId)
  return b ? b.name : props.buildingId || ''
})
// 若该楼层在 floors_by_building 有自定义标签，标题一并显示
const customFloorLabel = computed(() => {
  const fls = props.buildingId ? scene.buildingDisplay.floors_by_building?.[props.buildingId] : undefined
  const f = fls?.find((x) => x.index === props.floor)
  return f?.label || ''
})

const subName = (code: string) => {
  const s = SUBSYSTEMS.find((x) => x.code === code)
  return s ? t(s.name, s.nameEn) : code
}
const subColorVar = (code: string) => {
  const s = SUBSYSTEMS.find((x) => x.code === code)
  return s ? `var(${s.colorVar})` : 'var(--kp-accent)'
}

const STATUS_MAP: Record<string, { zh: string; en: string; cls: string }> = {
  running: { zh: '运行中', en: 'Running', cls: 'ok' },
  stopped: { zh: '已停止', en: 'Stopped', cls: 'muted' },
  fault: { zh: '故障', en: 'Fault', cls: 'alarm' },
  offline: { zh: '离线', en: 'Offline', cls: 'offline' },
  maintenance: { zh: '检修中', en: 'Maintenance', cls: 'warn' },
}
const statusText = (s: string) => {
  const m = STATUS_MAP[s] || { zh: s, en: s, cls: 'muted' }
  return t(m.zh, m.en)
}
const statusCls = (s: string) => (STATUS_MAP[s] || { cls: 'muted' }).cls

// 实时指标：复用 scene.liveMetrics（WebSocket 2s 推送），显示该设备首个指标
const liveKeyOf = (devId: string) => {
  const prefix = devId + ':'
  for (const k in scene.liveMetrics) if (k.startsWith(prefix)) return k.slice(prefix.length)
  return ''
}
const liveValOf = (devId: string) => {
  const k = liveKeyOf(devId)
  if (!k) return null
  const v = scene.liveMetrics[devId + ':' + k]
  return typeof v === 'number' ? v : null
}

// 楼层钻取深化：聚合该楼层 KPI（设备数 / 在线 / 故障 + 实时能耗/功率汇总）
const floorKpis = computed(() => {
  const counts: Record<string, number> = { total: devices.value.length, online: 0, fault: 0, offline: 0, maintenance: 0, stopped: 0 }
  const metrics: Record<string, number> = {}
  for (const dev of devices.value) {
    if (counts[dev.status] !== undefined) counts[dev.status]++
    const prefix = dev.id + ':'
    for (const k in scene.liveMetrics) {
      if (k.startsWith(prefix)) {
        const suffix = k.slice(prefix.length)
        const v = scene.liveMetrics[k]
        if (typeof v === 'number') metrics[suffix] = (metrics[suffix] || 0) + v
      }
    }
  }
  const pick = (...keys: string[]) => keys.map((k) => ({ k, v: metrics[k] })).filter((x) => x.v != null)
  const top = pick('energy.kwh', 'kwh', 'power.kw', 'kw', 'water.ton', 'ton')
  const others = Object.keys(metrics)
    .filter((k) => !['energy.kwh', 'kwh', 'power.kw', 'kw', 'water.ton', 'ton'].includes(k))
    .sort((a, b) => metrics[b] - metrics[a])
    .slice(0, 2)
    .map((k) => ({ k, v: metrics[k] }))
  return { counts, metrics: [...top, ...others] }
})
const fmtMetric = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + 'k' : v.toFixed(v >= 100 ? 0 : 1))

// ============ GK-22：楼层平面示意图 ============
// 用「该层完整设备点位」（deviceApi.list 不受 3D 抽稀影响）驱动 floorplan-gen 生成示意图。
// 设备点位含真实房间字段（Device.location.room）→ 直接用真实房间名；否则按坐标聚类生成示意名。
const plan = computed<FloorPlan | null>(() => {
  if (!props.buildingId || props.floor == null) return null
  const inputs: FloorPlanDeviceInput[] = devices.value.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.subsystem_id,
    category: d.category_id,
    room: d.location?.room ?? null,
    x: d.location?.x ?? 0,
    z: d.location?.z ?? 0,
  }))
  return generateFloorPlan(props.buildingId, props.floor, inputs, { canvasWidth: 600, canvasHeight: 360 })
})

// 当前选中房间（平面图点击 → 该房间设备列表；null = 全部设备兜底/补充）
const selectedRoomKey = ref<string | null>(null)
const selectedRoomName = computed(() => {
  if (!selectedRoomKey.value || !plan.value) return ''
  return plan.value.rooms.find((r) => r.key === selectedRoomKey.value)?.name || ''
})
// 选中房间 → 设备 id 集合（用平面图点位映射，真实/聚类房间都能正确还原）
const roomDeviceIds = computed<Set<string>>(() => {
  const set = new Set<string>()
  if (selectedRoomKey.value && plan.value) {
    for (const p of plan.value.points) if (p.roomKey === selectedRoomKey.value) set.add(p.id)
  }
  return set
})
const displayDevices = computed<Device[]>(() =>
  selectedRoomKey.value ? devices.value.filter((d) => roomDeviceIds.value.has(d.id)) : devices.value,
)

function onRoomSelect(roomKey: string) {
  selectedRoomKey.value = roomKey
}
function onDeviceDot(deviceId: string) {
  const dev = devices.value.find((d) => d.id === deviceId)
  if (dev) openControl(dev)
}
function backToAll() {
  selectedRoomKey.value = null
}

// ============ 设备控制路由（空调→遥控器；照明→GK-23 组件/兜底） ============
const rcVisible = ref(false)
const rcDevice = ref<Device | null>(null)
const rcDeviceMap = computed<Record<string, Device>>(() => (rcDevice.value ? { [rcDevice.value.id]: rcDevice.value } : {}))

// GK-22 + GK-23 集成：照明控制直接复用 GK-23 交付的 LightingControlDialog（按楼栋/楼层范围控制）
const lightingVisible = ref(false)
const lightingDevice = ref<Device | null>(null)

const isAc = (d: Device) => d.subsystem_id === 'hvac' || d.category_id === '空调'
const isLight = (d: Device) => d.subsystem_id === 'lighting' || d.category_id === '照明'

function openControl(dev: Device) {
  if (isAc(dev)) {
    rcDevice.value = dev
    rcVisible.value = true
    return
  }
  if (isLight(dev)) {
    // 照明：打开 GK-23 的 LightingControlDialog（按 scope 内楼栋/楼层范围控制）
    lightingDevice.value = dev
    lightingVisible.value = true
    return
  }
  // 其它类型：复用空调遥控器的简易电源能力（不打断控制流程）
  rcDevice.value = dev
  rcVisible.value = true
}

const buildingNameById = (id: string) => {
  const b = scene.buildings.find((x) => x.id === id)
  return b ? b.name : id
}

async function load() {
  if (!props.buildingId || props.floor == null) return
  loading.value = true
  try {
    const res = await deviceApi.list({ building_id: props.buildingId, floor: props.floor, limit: 200 })
    devices.value = res.items || []
  } catch {
    devices.value = []
  } finally {
    loading.value = false
  }
}

// 抽屉打开 或 切换楼栋/楼层 → 重新拉取设备，并重置房间选择
watch(
  () => [props.buildingId, props.floor],
  () => {
    selectedRoomKey.value = null
    rcVisible.value = false
    lightingVisible.value = false
    if (open.value) load()
  },
  { immediate: true },
)
</script>

<template>
  <el-dialog
    :model-value="open"
    align-center
    :with-header="false"
    class="kp-modal floor-drill"
    width="720px"
    append-to-body
    @update:model-value="(v: boolean) => !v && emit('close')"
  >
    <div class="fd">
      <header class="fd__head">
        <span class="kp-corner kp-corner--tl" />
        <span class="kp-corner kp-corner--tr" />
        <Building2 :size="20" class="fd__icon" />
        <div class="fd__title">
          <h3>{{ buildingName }} · {{ floor }}F</h3>
          <span class="fd__sub">
            <Layers :size="12" />
            {{ customFloorLabel ? customFloorLabel + ' · ' : '' }}{{ t('楼层钻取', 'Floor Drill') }}
          </span>
        </div>
        <button class="fd__close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <!-- 楼层聚合 KPI -->
      <div v-if="!loading && devices.length" class="fd-kpi">
        <div class="fd-kpi__cell">
          <span class="fd-kpi__num">{{ floorKpis.counts.total }}</span>
          <span class="fd-kpi__lbl">{{ t('设备', 'Devices') }}</span>
        </div>
        <div class="fd-kpi__cell fd-kpi__cell--ok">
          <span class="fd-kpi__num">{{ floorKpis.counts.online }}</span>
          <span class="fd-kpi__lbl">{{ t('在线', 'Online') }}</span>
        </div>
        <div class="fd-kpi__cell fd-kpi__cell--alarm">
          <span class="fd-kpi__num">{{ floorKpis.counts.fault }}</span>
          <span class="fd-kpi__lbl">{{ t('故障', 'Fault') }}</span>
        </div>
        <div class="fd-kpi__cell" v-for="m in floorKpis.metrics" :key="m.k">
          <span class="fd-kpi__num mono">{{ fmtMetric(m.v) }}</span>
          <span class="fd-kpi__lbl">{{ m.k }}</span>
        </div>
      </div>

      <div v-if="loading" class="kp-empty">{{ t('楼层设备加载中…', 'Loading floor devices…') }}</div>
      <div v-else-if="!devices.length" class="kp-empty">{{ t('该楼层暂未登记设备', 'No devices registered on this floor') }}</div>

      <template v-else>
        <!-- GK-22 上半部分：楼层平面示意图 -->
        <div class="fd-plan">
          <FloorPlanView
            :plan="plan"
            :building-name="buildingName"
            :floor="props.floor"
            :loading="loading"
            :selected-room-key="selectedRoomKey"
            :plan-key="`${props.buildingId}-${props.floor}`"
            @room-select="onRoomSelect"
            @device-select="onDeviceDot"
          />
        </div>

        <!-- 下半部分：设备列表（房间选中时过滤为该房间，否则全量兜底） -->
        <div class="fd-listhead">
          <span class="fd-listhead__title">
            <LayoutGrid :size="13" />
            <template v-if="selectedRoomKey">
              {{ t('房间', 'Room') }} {{ selectedRoomName }} · {{ displayDevices.length }}
            </template>
            <template v-else>
              {{ t('设备清单', 'Device List') }} · {{ devices.length }}
            </template>
          </span>
          <button v-if="selectedRoomKey" class="fd-back" @click="backToAll">
            <ChevronLeft :size="13" /> {{ t('全部', 'All') }}
          </button>
        </div>

        <div class="fd__list">
          <button
            v-for="dev in displayDevices"
            :key="dev.id"
            class="fd-item"
            @click="openControl(dev)"
          >
            <div class="fd-item__top">
              <span class="fd-item__name">{{ dev.name }}</span>
              <ChevronRight :size="15" class="fd-item__arrow" />
            </div>
            <div class="fd-item__meta">
              <span class="fd-sub" :style="{ color: subColorVar(dev.subsystem_id) }">
                <Box :size="11" /> {{ subName(dev.subsystem_id) }}
              </span>
              <span class="fd-status" :class="'fd-status--' + statusCls(dev.status)">{{ statusText(dev.status) }}</span>
            </div>
            <div class="fd-item__live" v-if="liveValOf(dev.id) != null">
              <Activity :size="12" /> {{ liveKeyOf(dev.id) }} <b class="mono">{{ liveValOf(dev.id) }}</b>
            </div>
          </button>
        </div>
      </template>
    </div>

      <!-- 空调遥控器（复用既有 RemoteControlDialog，340 行，含开关/模式/温度/风速 + 群组控制） -->
    <RemoteControlDialog
      :model-value="rcVisible"
      :device="rcDevice"
      :group="null"
      :device-map="rcDeviceMap"
      :building-name="buildingNameById"
      @update:model-value="(v: boolean) => (rcVisible = v)"
    />

    <!-- GK-23 照明控制：直接复用 LightingControlDialog（按楼栋/楼层范围控制） -->
    <LightingControlDialog
      :model-value="lightingVisible"
      :device="lightingDevice"
      :scope="{ buildingId: props.buildingId, floor: props.floor }"
      :building-name="buildingNameById"
      @update:model-value="(v: boolean) => (lightingVisible = v)"
    />
  </el-dialog>
</template>

<style scoped>
.fd {
  position: relative;
  display: flex;
  flex-direction: column;
  color: var(--kp-fg);
}
.fd__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--kp-border-strong);
  background: linear-gradient(90deg, var(--kp-glow-soft), transparent);
}
.fd__icon { color: var(--kp-accent); filter: drop-shadow(0 0 6px var(--kp-glow)); }
.fd__title { flex: 1; min-width: 0; }
.fd__title h3 {
  margin: 0;
  font-size: var(--kp-text-lg);
  font-weight: 590;
  letter-spacing: var(--kp-tracking-label);
}
.fd__sub {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.fd__close {
  width: 30px; height: 30px;
  border: 1px solid var(--kp-border);
  background: transparent;
  color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-sm);
  font-size: 18px; line-height: 1;
  cursor: pointer;
}
.fd__close:hover { color: var(--kp-fg); border-color: var(--kp-border-strong); }

.fd-kpi {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--kp-border);
  background: rgba(var(--kp-accent-rgb), 0.04);
  overflow-x: auto;
}
.fd-kpi__cell {
  flex: 1;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
}
.fd-kpi__num {
  font-size: var(--kp-text-lg);
  font-weight: 620;
  font-family: var(--kp-mono, monospace);
  color: var(--kp-fg);
  line-height: 1.1;
}
.fd-kpi__cell--ok .fd-kpi__num { color: var(--kp-ok, #36d399); }
.fd-kpi__cell--alarm .fd-kpi__num { color: var(--kp-alarm, #ff4d5e); }
.fd-kpi__lbl {
  font-size: 10px;
  color: var(--kp-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.fd-plan {
  padding: 10px 12px 4px;
  border-bottom: 1px solid var(--kp-border);
  max-height: 360px;
  overflow-y: auto;
}

.fd-listhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 4px;
}
.fd-listhead__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--kp-text-sm);
  font-weight: 560;
  color: var(--kp-fg);
}
.fd-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--kp-text-xs);
  color: var(--kp-accent);
  background: transparent;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  padding: 2px 8px;
  cursor: pointer;
}
.fd-back:hover { border-color: var(--kp-accent); }

.fd__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px 14px;
}
.fd-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
  cursor: pointer;
  text-align: left;
  color: var(--kp-fg);
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.fd-item:hover {
  border-color: var(--kp-accent);
  box-shadow: var(--kp-elev-glow);
  transform: translateX(2px);
}
.fd-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fd-item__name {
  font-size: var(--kp-text-sm);
  font-weight: 510;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fd-item__arrow { color: var(--kp-fg-muted); flex-shrink: 0; }
.fd-item:hover .fd-item__arrow { color: var(--kp-accent); }
.fd-item__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fd-sub {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--kp-text-xs);
}
.fd-status {
  font-size: var(--kp-text-xs);
  padding: 1px 8px;
  border-radius: var(--kp-radius-pill);
  border: 1px solid currentColor;
}
.fd-status--ok { color: var(--kp-ok, #36d399); }
.fd-status--muted { color: var(--kp-fg-muted); }
.fd-status--alarm { color: var(--kp-alarm, #ff4d5e); }
.fd-status--offline { color: var(--kp-fg-muted); opacity: 0.7; }
.fd-status--warn { color: var(--kp-warn, #f5a623); }
.fd-item__live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.fd-item__live b { color: var(--kp-fg); font-size: var(--kp-text-sm); }
.fd-item__live svg { color: var(--kp-accent); }
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Lightbulb,
  Group,
  Plug,
  CircleSlash,
  Cog,
  Layers,
  Building2,
  MapPin,
  Calendar,
  Filter,
  Server,
  Zap,
  Activity,
} from 'lucide-vue-next'
import '@/styles/modal-theme.css'
import { lightingApi, buildingApi, energyApi } from '@/api'
import type { Device, Building, LightingStatus, LightingZoneStatus, ControlCommand } from '@/types/api'

const props = defineProps<{
  modelValue: boolean
  /** 单个照明设备（当前后端无照明设备记录，通常为 null；保留以便未来接入） */
  device: Device | null
  /** 外部范围（GK-22 平面图传入）：楼栋 / 楼层 */
  scope?: { buildingId?: string | null; floor?: number | null } | null
  buildingName?: (id: string) => string
  /** 嵌入模式：去掉外层 el-dialog，直接渲染内部面板（供 DeviceDetailDrawer 内联复用） */
  embedded?: boolean
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'controlled'): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

// ===================== 楼栋选择 =====================
const buildings = ref<Building[]>([])
const selectedBuildingId = ref<string>('')
const floorFilter = ref<number | null>(null)

// ===================== 区域状态（真实：来自 /lighting/status） =====================
const zones = ref<LightingZoneStatus[]>([])
const zonesLoading = ref(false)
const statusMeta = reactive<{ zoneCount: number; onCount: number; totalPower: number; energyToday: number | null }>({
  zoneCount: 0,
  onCount: 0,
  totalPower: 0,
  energyToday: null,
})
const controlBusy = ref(false)

const STATUS_TEXT: Record<string, string> = {
  running: '运行中',
  stopped: '已停止',
  fault: '故障',
  offline: '离线',
  maintenance: '检修中',
}

async function ensureBuildings() {
  if (buildings.value.length) return
  try {
    const { items } = await buildingApi.list()
    buildings.value = items || []
  } catch {
    buildings.value = []
  }
}

async function loadLightingStatus(buildingId?: string) {
  zonesLoading.value = true
  try {
    const data = (await lightingApi.status(buildingId)) as unknown as LightingStatus
    zones.value = (data.zones || []) as LightingZoneStatus[]
    statusMeta.zoneCount = data.zone_count || 0
    statusMeta.onCount = data.on_count || 0
    statusMeta.totalPower = data.total_power_kw || 0
    statusMeta.energyToday = data.energy_today_kwh ?? null
  } catch {
    zones.value = []
    statusMeta.zoneCount = 0
    statusMeta.onCount = 0
    statusMeta.totalPower = 0
    statusMeta.energyToday = null
  } finally {
    zonesLoading.value = false
  }
}

// ===================== B.1 区域集中控制（楼栋 / 楼层 / 区域 开关 + 调光） =====================
const regionZone = ref<string>('') // '' = 全部区域
const regionDimming = ref<number>(80)

const buildingOptions = computed(() => buildings.value)

// 过滤后的区域（按楼层占位：当前 zone 模型无楼层字段，留待后端接入区域楼层映射）
const filteredZones = computed(() => zones.value)

async function sendLighting(action: ControlCommand['action'], extra: Record<string, unknown> = {}) {
  if (!selectedBuildingId.value && !props.scope?.buildingId) {
    ElMessage.warning('请先选择楼栋')
    return false
  }
  const building_id = selectedBuildingId.value || props.scope?.buildingId || ''
  try {
    await lightingApi.control({
      action,
      building_id,
      payload: { ...extra },
    })
    return true
  } catch {
    return false
  }
}

// 区域批量开关
async function regionPower(on: boolean) {
  controlBusy.value = true
  try {
    const target = regionZone.value
    const ok = await sendLighting(on ? 'power_on' : 'power_off', target ? { zone: target } : {})
    if (ok) {
      ElMessage.success(target ? `区域「${target}」已${on ? '开启' : '关闭'}` : `全部区域已${on ? '开启' : '关闭'}`)
      // 乐观更新 UI（mock 后端不持久化真实状态，前端以指令结果为准）
      zones.value.forEach((z) => {
        if (!target || z.zone === target) z.on = on
      })
      emit('controlled')
    }
  } finally {
    controlBusy.value = false
  }
}

async function applyDimming() {
  controlBusy.value = true
  try {
    const target = regionZone.value
    const ok = await sendLighting('dimming', { dimming: regionDimming.value, ...(target ? { zone: target } : {}) })
    if (ok) {
      ElMessage.success(`调光已下发 ${regionDimming.value}%`)
      zones.value.forEach((z) => {
        if (!target || z.zone === target) z.dimming = regionDimming.value
      })
      emit('controlled')
    }
  } finally {
    controlBusy.value = false
  }
}

// ===================== B.4 远程单灯 / 分组开关 =====================
async function toggleZone(z: LightingZoneStatus, on: boolean) {
  controlBusy.value = true
  try {
    const ok = await sendLighting(on ? 'power_on' : 'power_off', { zone: z.zone })
    if (ok) {
      z.on = on
      ElMessage.success(`「${z.zone}」已${on ? '开启' : '关闭'}`)
      emit('controlled')
    }
  } finally {
    controlBusy.value = false
  }
}

async function setZoneDimming(z: LightingZoneStatus, val: number) {
  z.dimming = val
  const ok = await sendLighting('dimming', { zone: z.zone, dimming: val })
  if (ok) emit('controlled')
}

// ===================== B.2 联动控制（多区域一起开关；持久化联动组后端缺口） =====================
const linkSelected = ref<Set<string>>(new Set())
function toggleLink(zone: string) {
  const s = new Set(linkSelected.value)
  if (s.has(zone)) s.delete(zone)
  else s.add(zone)
  linkSelected.value = s
}
const linkHas = (zone: string) => linkSelected.value.has(zone)

async function linkPower(on: boolean) {
  const list = Array.from(linkSelected.value)
  if (!list.length) {
    ElMessage.warning('请先勾选要联动的区域')
    return
  }
  controlBusy.value = true
  try {
    let done = 0
    for (const zone of list) {
      const ok = await sendLighting(on ? 'power_on' : 'power_off', { zone })
      if (ok) {
        done++
        const z = zones.value.find((x) => x.zone === zone)
        if (z) z.on = on
      }
    }
    if (done) {
      ElMessage.success(`联动组已${on ? '开启' : '关闭'} ${done} 个区域`)
      emit('controlled')
    }
  } finally {
    controlBusy.value = false
  }
}

// ===================== B.3 定时控制（UI + 后端缺口说明） =====================
const timingOn = ref<string>('18:00')
const timingOff = ref<string>('07:00')
function saveTiming() {
  // 后端暂无照明定时任务持久化接口，此处仅做前端占位与提示；需后端扩展 /lighting/schedule（见交付报告缺口）
  ElMessage.info(`定时方案已暂存前端（开 ${timingOn.value} / 关 ${timingOff.value}）；后端定时持久化待接入`)
}

// ===================== B.5 楼宇能耗统计 =====================
const energy = reactive<{ kwh: number | null; cost: number | null; loading: boolean }>({
  kwh: null,
  cost: null,
  loading: false,
})
async function loadEnergy(buildingId?: string) {
  energy.loading = true
  energy.kwh = null
  energy.cost = null
  try {
    // 楼宇总能耗（真实聚合）；照明分项能耗后端暂无独立核算，标注「待接入」
    const data = await energyApi.summary({ building_id: buildingId, period: 'day' })
    energy.kwh = typeof data.kwh === 'number' ? data.kwh : null
    energy.cost = typeof data.cost === 'number' ? data.cost : null
  } catch {
    energy.kwh = null
    energy.cost = null
  } finally {
    energy.loading = false
  }
}

// ===================== B.6 智能感应（感知开关状态 + 自动/手动 切换；硬件依赖缺口） =====================
// 后端合成数据未提供 sensor_mode 字段，且真实感应需硬件支持；此处为 UI 骨架，标注待接入。
const sensingReady = ref(false)
async function setSensingMode(_zone: string, _mode: 'auto' | 'manual') {
  // 硬件依赖：真实感应模式切换需现场传感网络；前端骨架已就绪，后端暂未开放接口（见交付报告缺口）
  ElMessage.info('智能感应模式切换需硬件传感网络支持，当前为 UI 骨架（待接入）')
}

// ===================== 打开时初始化 =====================
async function initDialog() {
  await ensureBuildings()
  // 优先使用设备所在楼栋 / 外部 scope，否则默认第一栋
  const bid = props.device?.building_id || props.scope?.buildingId || buildings.value[0]?.id || ''
  selectedBuildingId.value = bid
  floorFilter.value = props.scope?.floor ?? null
  if (bid) {
    await Promise.all([loadLightingStatus(bid), loadEnergy(bid)])
  } else {
    zones.value = []
  }
}

watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    await initDialog()
  },
)
// 嵌入模式（无 dialog 切换）：挂载即初始化
onMounted(async () => {
  if (props.embedded && props.modelValue) await initDialog()
})

function onBuildingChange() {
  if (selectedBuildingId.value) {
    loadLightingStatus(selectedBuildingId.value)
    loadEnergy(selectedBuildingId.value)
  }
}

const dialogProps = computed(() => ({
  'model-value': visible.value,
  title: '智慧照明管理',
  width: '600px',
  alignCenter: true,
  appendToBody: true,
  class: 'kp-modal lc-dialog',
}))
function onVisible(v: boolean) {
  if (!props.embedded) visible.value = v
}
const wrapperTag = computed(() => (props.embedded ? 'div' : 'el-dialog'))
const wrapperBind = computed(() => (props.embedded ? { class: 'kp-modal lc-embed' } : dialogProps.value))
</script>

<template>
  <component :is="wrapperTag" v-bind="wrapperBind" @update:model-value="onVisible">
    <div class="lc">
      <!-- 楼栋选择 -->
      <div class="lc-scope">
        <div class="lc-scope__row">
          <Building2 :size="14" class="lc-scope__icon" />
          <el-select
            v-model="selectedBuildingId"
            size="small"
            placeholder="选择楼栋"
            style="flex: 1"
            @change="onBuildingChange"
          >
            <el-option v-for="b in buildingOptions" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </div>
        <p class="lc-scope__hint">照明以「区域」为最小控制单元（后端合成 zone 数据，无独立照明设备记录）</p>
      </div>

      <!-- 概览指标 -->
      <div class="lc-overview">
        <div class="lc-ov">
          <span class="lc-ov__label"><MapPin :size="12" /> 区域总数</span>
          <b>{{ statusMeta.zoneCount }}</b>
        </div>
        <div class="lc-ov">
          <span class="lc-ov__label"><Lightbulb :size="12" /> 点亮区域</span>
          <b>{{ statusMeta.onCount }}</b>
        </div>
        <div class="lc-ov">
          <span class="lc-ov__label"><Zap :size="12" /> 总功率</span>
          <b>{{ statusMeta.totalPower }} kW</b>
        </div>
        <div class="lc-ov">
          <span class="lc-ov__label"><Activity :size="12" /> 今日用电</span>
          <b>{{ statusMeta.energyToday != null ? statusMeta.energyToday + ' kWh' : '—' }}</b>
          <span v-if="statusMeta.energyToday == null" class="lc-pending">待接入</span>
        </div>
      </div>

      <!-- B.1 区域集中控制 -->
      <section class="lc-sec">
        <div class="lc-sec__head"><Layers :size="14" /> 区域集中控制（楼栋 / 区域 开关 + 调光）</div>
        <div class="lc-sec__body">
          <el-select v-model="regionZone" size="small" clearable placeholder="全部区域" style="flex: 1" :disabled="controlBusy">
            <el-option v-for="z in filteredZones" :key="z.zone" :label="z.zone" :value="z.zone" />
          </el-select>
          <div class="lc-row">
            <button class="lc-btn lc-btn--on" :disabled="controlBusy" @click="regionPower(true)"><Plug :size="13" /> 全部开启</button>
            <button class="lc-btn lc-btn--off" :disabled="controlBusy" @click="regionPower(false)"><CircleSlash :size="13" /> 全部关闭</button>
          </div>
          <div class="lc-dim">
            <span>调光 {{ regionDimming }}%</span>
            <input type="range" min="0" max="100" v-model.number="regionDimming" :disabled="controlBusy" @change="applyDimming()" />
          </div>
        </div>
      </section>

      <!-- B.4 远程单灯 / 分组 -->
      <section class="lc-sec">
        <div class="lc-sec__head"><Cog :size="14" /> 远程控制（单灯 / 分组开关）</div>
        <div class="lc-sec__body">
          <div class="lc-zones">
            <div v-if="zonesLoading" class="lc-zones__loading">加载中…</div>
            <div v-else-if="!zones.length" class="lc-zones__empty">该楼栋暂无照明区域数据</div>
            <label v-for="z in filteredZones" :key="z.zone" class="lc-zone" :class="{ on: z.on }">
              <span class="lc-zone__name">{{ z.zone }}</span>
              <span class="lc-zone__power">{{ z.power_kw }} kW</span>
              <span class="lc-zone__dim">调光 {{ z.dimming ?? '—' }}%</span>
              <span class="lc-zone__state" :class="z.on ? 'is-on' : 'is-off'">{{ z.on ? '亮' : '灭' }}</span>
            </label>
          </div>
          <div class="lc-row">
            <button class="lc-btn lc-btn--on" :disabled="controlBusy || !filteredZones.length" @click="filteredZones.forEach((z) => !z.on && toggleZone(z, true))">一键全开</button>
            <button class="lc-btn lc-btn--off" :disabled="controlBusy || !filteredZones.length" @click="filteredZones.forEach((z) => z.on && toggleZone(z, false))">一键全关</button>
          </div>
        </div>
      </section>

      <!-- B.2 联动控制 -->
      <section class="lc-sec">
        <div class="lc-sec__head"><Group :size="14" /> 联动控制（多区域一起开关）</div>
        <div class="lc-sec__body">
          <div class="lc-link">
            <label v-for="z in filteredZones" :key="z.zone" class="lc-link__item" :class="{ active: linkHas(z.zone) }">
              <input type="checkbox" :checked="linkHas(z.zone)" @change="toggleLink(z.zone)" />
              <span>{{ z.zone }}</span>
            </label>
          </div>
          <div class="lc-row">
            <button class="lc-btn lc-btn--on" :disabled="controlBusy || !linkSelected.size" @click="linkPower(true)">联动开启</button>
            <button class="lc-btn lc-btn--off" :disabled="controlBusy || !linkSelected.size" @click="linkPower(false)">联动关闭</button>
          </div>
          <p class="lc-gap">注：持久化「联动组」配置后端暂未开放（ControlGroup 绑定的是设备，照明无设备记录），当前为前端临时联动；需后端扩展照明联动组接口。</p>
        </div>
      </section>

      <!-- B.3 定时控制 -->
      <section class="lc-sec">
        <div class="lc-sec__head"><Calendar :size="14" /> 定时控制</div>
        <div class="lc-sec__body">
          <div class="lc-time">
            <label>开启时间 <input type="time" v-model="timingOn" /></label>
            <label>关闭时间 <input type="time" v-model="timingOff" /></label>
            <button class="lc-btn lc-btn--primary" :disabled="controlBusy" @click="saveTiming">保存定时</button>
          </div>
          <p class="lc-gap">注：后端暂无照明定时任务持久化接口，当前为前端占位；需后端扩展 /lighting/schedule。</p>
        </div>
      </section>

      <!-- B.5 楼宇能耗统计 -->
      <section class="lc-sec">
        <div class="lc-sec__head"><Server :size="14" /> 楼宇能耗统计</div>
        <div class="lc-sec__body">
          <div class="lc-energy">
            <div class="lc-en">
              <span class="lc-en__label">楼宇今日总能耗</span>
              <b>{{ energy.loading ? '…' : energy.kwh != null ? energy.kwh + ' kWh' : '—' }}</b>
              <span v-if="!energy.loading && energy.kwh == null" class="lc-pending">待接入</span>
            </div>
            <div class="lc-en">
              <span class="lc-en__label">预估电费</span>
              <b>{{ energy.loading ? '…' : energy.cost != null ? '¥' + energy.cost : '—' }}</b>
              <span v-if="!energy.loading && energy.cost == null" class="lc-pending">待接入</span>
            </div>
          </div>
          <p class="lc-gap">注：照明分项能耗后端暂无独立核算接口，此处展示楼宇总能耗（真实聚合）；照明分项待接入。</p>
        </div>
      </section>

      <!-- B.6 智能感应 -->
      <section class="lc-sec">
        <div class="lc-sec__head"><Filter :size="14" /> 智能感应（自动 / 手动）</div>
        <div class="lc-sec__body">
          <div class="lc-sense">
            <label v-for="z in filteredZones.slice(0, 6)" :key="z.zone" class="lc-sense__item">
              <span>{{ z.zone }}</span>
              <span class="lc-sense__mode">模式：<b>待接入</b></span>
              <button class="lc-btn lc-btn--ghost" :disabled="controlBusy" @click="setSensingMode(z.zone, 'auto')">自动</button>
              <button class="lc-btn lc-btn--ghost" :disabled="controlBusy" @click="setSensingMode(z.zone, 'manual')">手动</button>
            </label>
            <div v-if="!filteredZones.length" class="lc-zones__empty">暂无区域</div>
          </div>
          <p class="lc-gap">注：真实感应需现场传感网络（人体/光照），后端合成数据未提供 sensor_mode 字段；当前为 UI 骨架，待硬件与后端接口接入。</p>
          <p v-if="!sensingReady" class="lc-gap">硬件依赖：智能感应开关状态与自动/手动切换依赖现场传感设备。</p>
        </div>
      </section>
    </div>
  </component>
</template>

<style scoped>
.lc { display: flex; flex-direction: column; gap: 10px; }

.lc-scope { display: flex; flex-direction: column; gap: 4px; }
.lc-scope__row { display: flex; align-items: center; gap: 6px; }
.lc-scope__icon { color: var(--kp-accent); }
.lc-scope__hint { margin: 0; font-size: 11px; color: var(--kp-fg-subtle); }

.lc-overview { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.lc-ov { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-surface-raised); }
.lc-ov__label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--kp-fg-muted); }
.lc-ov b { font-size: 16px; color: var(--kp-fg); }
.lc-pending { position: absolute; top: 6px; right: 8px; font-size: 10px; color: var(--kp-warn); border: 1px solid var(--kp-warn); border-radius: 4px; padding: 0 4px; }

.lc-sec { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-surface-raised); }
.lc-sec__head { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--kp-fg); font-size: 13px; }
.lc-sec__head svg { color: var(--kp-accent); }
.lc-sec__body { display: flex; flex-direction: column; gap: 8px; }
.lc-row { display: flex; gap: 8px; }

.lc-zones { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; }
.lc-zones__loading, .lc-zones__empty { font-size: 12px; color: var(--kp-fg-muted); padding: 8px 0; text-align: center; }
.lc-zone { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-bg-deep); font-size: 12px; }
.lc-zone.on { border-color: var(--kp-accent); background: rgba(var(--kp-accent-rgb), 0.08); }
.lc-zone__name { color: var(--kp-fg); }
.lc-zone__power, .lc-zone__dim { color: var(--kp-fg-muted); }
.lc-zone__state { font-size: 11px; padding: 1px 8px; border-radius: 999px; }
.lc-zone__state.is-on { color: var(--kp-accent-on, #000d14); background: var(--kp-accent); }
.lc-zone__state.is-off { color: var(--kp-fg-muted); background: var(--kp-surface-raised); }

.lc-dim { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--kp-fg-muted); }
.lc-dim input[type='range'] { flex: 1; accent-color: var(--kp-accent); }

.lc-link { display: flex; flex-wrap: wrap; gap: 6px; }
.lc-link__item { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 8px; border: 1px solid var(--kp-border); border-radius: 999px; cursor: pointer; color: var(--kp-fg); }
.lc-link__item.active { border-color: var(--kp-accent); background: rgba(var(--kp-accent-rgb), 0.12); color: var(--kp-accent); }
.lc-link__item input { accent-color: var(--kp-accent); }

.lc-time { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--kp-fg-muted); }
.lc-time label { display: inline-flex; align-items: center; gap: 4px; }
.lc-time input { padding: 2px 6px; border: 1px solid var(--kp-border); border-radius: 6px; background: var(--kp-bg-deep); color: var(--kp-fg); }

.lc-energy { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.lc-en { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-surface-raised); }
.lc-en__label { font-size: 12px; color: var(--kp-fg-muted); }
.lc-en b { font-size: 16px; color: var(--kp-fg); }

.lc-sense { display: flex; flex-direction: column; gap: 4px; }
.lc-sense__item { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--kp-border); border-radius: 8px; background: var(--kp-bg-deep); font-size: 12px; }
.lc-sense__mode { color: var(--kp-fg-muted); }

.lc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 32px; padding: 0 12px; border: 1px solid var(--kp-accent); border-radius: 8px; background: transparent; color: var(--kp-accent); font-size: 13px; cursor: pointer; }
.lc-btn--on { border-color: var(--kp-success); color: var(--kp-success); }
.lc-btn--off { border-color: var(--kp-fg-subtle); color: var(--kp-fg-muted); }
.lc-btn--primary { background: var(--kp-accent); color: var(--kp-accent-on, #000d14); }
.lc-btn--ghost { height: 26px; padding: 0 10px; font-size: 12px; }
.lc-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.lc-gap { margin: 0; font-size: 11px; color: var(--kp-warn); line-height: 1.4; }

.lc-embed { padding: 2px; }
</style>

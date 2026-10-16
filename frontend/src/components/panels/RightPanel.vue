<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import {
  Fan,
  Zap,
  Thermometer,
  Activity,
  Droplets,
  TrendingUp,
  BarChart3,
  MoveVertical,
  LineChart,
  Wifi,
} from 'lucide-vue-next'
import { KP_ACCENT } from '@/lib/kp-accent'
import PanelCard from '@/components/common/PanelCard.vue'
import KpiStat from '@/components/common/KpiStat.vue'
import TrendChart from '@/components/panels/TrendChart.vue'
import EChart from '@/components/panels/EChart.vue'
import { useBigscreenStore } from '@/stores/bigscreen'
import { useI18nStore } from '@/stores/i18n'

const bs = useBigscreenStore()
const { t } = useI18nStore()
const R = computed(() => bs.panels.right)

const labels = computed(() => R.value.timeLabels)

function decOf(v: number): number {
  return Number.isInteger(v) ? 0 : 1
}

// 通用仪表盘配置（电压稳定度 / 在线率 / 湿度控制率）
function gaugeOption(value: number, color: string, suffix: string, max = 100): EChartsOption {
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max,
        radius: '94%',
        center: ['50%', '58%'],
        progress: { show: true, width: 8, itemStyle: { color } },
        axisLine: { lineStyle: { width: 8, color: [[1, 'rgba(255,255,255,0.08)']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true,
          formatter: `{v|{value}${suffix}}`,
          rich: { v: { color: '#E6F7FF', fontSize: 18, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 } },
          offsetCenter: [0, 0],
        },
        data: [{ value }],
      },
    ],
  } as EChartsOption
}

const voltageGauge = computed(() => gaugeOption(R.value.voltageStability, KP_ACCENT, '%'))
const onlineGauge = computed(() => gaugeOption(R.value.onlineRate, '#2EE6A6', '%'))
const humidityGauge = computed(() => gaugeOption(R.value.humidityRate, '#1BE5AD', '%'))

const phases = computed(() => [
  { key: 'A', v: R.value.phaseA },
  { key: 'B', v: R.value.phaseB },
  { key: 'C', v: R.value.phaseC },
])

const humidity = computed(() => [
  { label: '干燥区', labelEn: 'Dry Zone', value: R.value.dryHumidity, unit: '%' },
  { label: '湿润区', labelEn: 'Humid Zone', value: R.value.wetHumidity, unit: '%' },
])
</script>

<template>
  <div class="right-panel">
    <!-- Row 1: 空调系统 | 供配电 -->
    <PanelCard :title="t('空调系统', 'HVAC System')" :icon="Fan" class="rp-card" box-key="right-hvac" :accent="true">
      <div class="rp-stats">
        <KpiStat
          v-for="s in R.acStats"
          :key="s.label"
          :label="s.label"
          :value="s.value"
          :unit="s.unit"
          :color="s.color || 'var(--kp-sys-hvac)'"
          :decimals="decOf(s.value)"
        />
      </div>
    </PanelCard>

    <PanelCard :title="t('供配电', 'Power Supply')" :icon="Zap" class="rp-card" box-key="right-power" :accent="true">
      <div class="rp-stats">
        <KpiStat
          v-for="s in R.powerStats"
          :key="s.label"
          :label="s.label"
          :value="s.value"
          :unit="s.unit"
          :color="s.color || 'var(--kp-sys-power)'"
          :decimals="decOf(s.value)"
        />
      </div>
    </PanelCard>

    <!-- Row 2: 温度趋势 | 电压稳定度 -->
    <PanelCard :title="t('温度趋势', 'Temperature Trend')" :icon="Thermometer" class="rp-card" box-key="right-temp-trend" :accent="true">
      <div class="rp-chart"><TrendChart :data="R.tempTrend" :labels="labels" color="#1BE5AD" :height="'100%'" /></div>
    </PanelCard>

    <PanelCard :title="t('电压稳定度', 'Voltage Stability')" :icon="Activity" class="rp-card" box-key="right-voltage" :accent="true">
      <div class="rp-split">
        <div class="rp-gauge"><EChart :option="voltageGauge" :height="'100%'" /></div>
        <div class="rp-phases">
          <div v-for="p in phases" :key="p.key" class="rp-phase">
            <span class="rp-phase__k">{{ t('相', 'Phase') }}{{ p.key }}</span>
            <span class="rp-phase__v mono">{{ p.v.toFixed(1) }}</span>
            <span class="rp-phase__u">V</span>
          </div>
        </div>
      </div>
    </PanelCard>

    <!-- Row 3: 湿度统计 | 负载趋势 -->
    <PanelCard :title="t('湿度统计', 'Humidity Stats')" :icon="Droplets" class="rp-card" box-key="right-humidity" :accent="true">
      <div class="rp-split">
        <div class="rp-gauge"><EChart :option="humidityGauge" :height="'100%'" /></div>
        <div class="rp-hum">
          <div v-for="h in humidity" :key="h.label" class="rp-hum__item">
            <span class="rp-hum__v mono">{{ h.value }}<i>{{ h.unit }}</i></span>
            <span class="rp-hum__l">{{ t(h.label, h.labelEn) }}</span>
          </div>
        </div>
      </div>
    </PanelCard>

    <PanelCard :title="t('负载趋势', 'Load Trend')" :icon="TrendingUp" class="rp-card" box-key="right-load-trend" :accent="true">
      <div class="rp-chart"><TrendChart :data="R.loadTrend" :labels="labels" color="#FFC043" :area="false" :height="'100%'" /></div>
    </PanelCard>

    <!-- Row 4: 能耗统计 | 电梯运行 -->
    <PanelCard :title="t('能耗统计', 'Energy Consumption')" :icon="BarChart3" class="rp-card" box-key="right-energy" :accent="true">
      <div class="rp-stats">
        <KpiStat
          v-for="s in R.energyStats"
          :key="s.label"
          :label="s.label"
          :value="s.value"
          :unit="s.unit"
          :color="s.color || 'var(--kp-sys-energy)'"
          :decimals="decOf(s.value)"
        />
      </div>
    </PanelCard>

    <PanelCard :title="t('电梯运行', 'Elevator Operation')" :icon="MoveVertical" class="rp-card" box-key="right-elevator" :accent="true">
      <div class="rp-stats">
        <KpiStat
          v-for="s in R.elevatorStats"
          :key="s.label"
          :label="s.label"
          :value="s.value"
          :unit="s.unit"
          :color="s.color || 'var(--kp-sys-elevator)'"
          :decimals="decOf(s.value)"
        />
      </div>
    </PanelCard>

    <!-- Row 5: 用电趋势（能耗趋势）| 设备在线量 -->
    <PanelCard :title="t('用电趋势', 'Power Usage Trend')" :icon="LineChart" class="rp-card" box-key="right-energy-trend" :accent="true">
      <div class="rp-chart"><TrendChart :data="R.energyTrend" :labels="labels" :color="KP_ACCENT" :height="'100%'" /></div>
    </PanelCard>

    <PanelCard :title="t('设备在线量', 'Online Devices')" :icon="Wifi" class="rp-card" box-key="right-online" :accent="true">
      <div class="rp-split">
        <div class="rp-gauge"><EChart :option="onlineGauge" :height="'100%'" /></div>
        <div class="rp-online">
          <div class="rp-online__num">
            <span class="rp-online__v mono" style="color: var(--kp-success)">{{ R.onlineCount }}</span>
            <span class="rp-online__l">{{ t('在线设备', 'Online Devices') }}</span>
          </div>
          <div class="rp-online__num">
            <span class="rp-online__v mono" style="color: var(--kp-status-offline)">{{ R.offlineCount }}</span>
            <span class="rp-online__l">{{ t('离线设备', 'Offline Devices') }}</span>
          </div>
        </div>
      </div>
    </PanelCard>
  </div>
</template>

<style scoped>
.right-panel {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: block;
  min-height: 0;
  overflow: hidden;
}
.rp-card {
  min-height: 0;
  min-width: 0;
}
.rp-card :deep(.kp-panel-title) {
  height: 30px;
  font-size: var(--box-title-size, var(--kp-text-sm));
  padding: 0 10px 0 12px;
}
.rp-card :deep(.panel-card__body) {
  padding: 6px 8px 8px;
}

/* 2x2 指标网格，内容更少、字更大 */
.rp-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
  height: 100%;
  min-height: 0;
}
.rp-stats :deep(.kpi) {
  padding: 4px 6px;
  gap: 1px;
}
.rp-stats :deep(.kpi__value) {
  font-size: var(--kp-text-lg);
}
.rp-stats :deep(.kpi__label) {
  font-size: 10px;
  color: var(--kp-fg-subtle);
}

/* 图表容器（撑满卡片剩余高度，减少内边距） */
.rp-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.rp-chart :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

/* 仪表 + 侧数字 两栏布局 */
.rp-split {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  min-height: 0;
}
.rp-gauge {
  flex: 0 0 48%;
  height: 100%;
  min-height: 0;
}
.rp-phases {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  min-height: 0;
}
.rp-phase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 3px 0;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
}
.rp-phase__k {
  font-size: 10px;
  color: var(--kp-fg-muted);
}
.rp-phase__v {
  font-size: var(--kp-text-md);
  color: var(--kp-accent);
  text-shadow: 0 0 6px var(--kp-glow);
}
.rp-phase__u {
  font-size: 10px;
  color: var(--kp-fg-subtle);
}

.rp-hum {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  min-height: 0;
}
.rp-hum__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 3px 0;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
}
.rp-hum__v {
  font-size: var(--kp-text-lg);
  color: var(--kp-accent-secondary);
  text-shadow: 0 0 8px var(--kp-glow);
}
.rp-hum__v i {
  font-size: 10px;
  font-style: normal;
  margin-left: 1px;
  color: var(--kp-fg-muted);
}
.rp-hum__l {
  font-size: 10px;
  color: var(--kp-fg-muted);
}

.rp-online {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
}
.rp-online__num {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 8px;
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  background: var(--kp-glow-soft);
}
.rp-online__v {
  font-size: var(--kp-text-xl);
  text-shadow: 0 0 8px currentColor;
}
.rp-online__l {
  font-size: 10px;
  color: var(--kp-fg-muted);
}
</style>

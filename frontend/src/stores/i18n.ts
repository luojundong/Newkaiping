import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type Locale = 'zh' | 'en'

// 动态文案（来自后端配置、无法在组件内联写死的）中英对照表。
// 组件内静态文字直接用 t('中文', 'English') 即可；此处仅兜底运行期动态字符串。
const DICT: Record<string, string> = {
  '开平市中心医院能源管理平台': 'KaiPing Central Hospital Energy Management Platform',
  '综合概览': 'Overview',
  '全院': 'All Campus',
  // 左面板默认框名
  '监控报警': 'Monitoring & Alarm',
  // 右侧 KPI 指标名
  '实时功率': 'Real-time Power',
  '送风温度': 'Supply Air Temp',
  '回风温度': 'Return Air Temp',
  '运行机组': 'Running Units',
  '总功率': 'Total Power',
  '功率因数': 'Power Factor',
  '负载率': 'Load Rate',
  '今日电量': "Today's Energy",
  '今日能耗': "Today's Consumption",
  '今日费用': "Today's Cost",
  '碳排放': 'Carbon Emission',
  '单位面积能耗': 'Energy per Area',
  '运行电梯': 'Running Elevators',
  '累计乘梯': 'Total Rides',
  '平均等待': 'Avg Wait',
  '故障停运': 'Fault Outage',
  // 底部状态仪表
  '系统运行': 'System Running',
  '网络畅通': 'Network OK',
  '设备健康': 'Device Health',
  // 底部应急响应
  '应急指挥': 'Command',
  '应急预案': 'Plan',
  '应急物资': 'Supplies',
  '应急车辆': 'Vehicles',
  '应急通讯': 'Comms',
  '应急培训': 'Training',
  // 常用单位
  '台': 'units',
  '元': 'CNY',
  '人次': 'trips',
  '㎡': 'm²',
}

const STORAGE_KEY = 'kp-locale'

function readInitial(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

/**
 * 统一翻译函数。
 * - locale=zh：始终返回 zh（中文原文）。
 * - locale=en：优先返回显式传入的 en；否则查 DICT；都没有则回退 zh。
 * 在模板/computed 中调用会自动追踪 locale，切换语言时整体重渲染。
 */
export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<Locale>(readInitial())

  const isEn = computed(() => locale.value === 'en')

  function setLocale(l: Locale) {
    locale.value = l
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* 忽略存储异常（隐私模式等） */
    }
  }

  function toggle() {
    setLocale(locale.value === 'zh' ? 'en' : 'zh')
  }

  function t(zh: string, en?: string | null): string {
    if (locale.value === 'zh') return zh
    if (en !== undefined && en !== null && en !== '') return en
    return DICT[zh] ?? zh
  }

  return { locale, isEn, setLocale, toggle, t }
})

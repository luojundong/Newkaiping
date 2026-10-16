/**
 * 大屏数据模式三态（参考页 applyDataMode() / .databadge 机制的复刻）
 * 契约：docs/design/bigscreen-ref-style-v2.md §9
 *
 * 产品决策（用户确认）：「照参考页做法：数据模式徽章 + 前端占位」。
 *
 * 合规底线（GMP / 21 CFR Part 11 / EU Annex 11，与 backend/src/logs 审计链同一原则）：
 *   **禁止把 mock/示意值冒充实测值**。因此：
 *   - demo  演示数据：徽章醒目橙色标注「演示数据 DEMO DATA」，屏底常驻脚注列出示意指标范围。
 *   - empty 未接入  ：全屏遮罩 +「所有数值置 --」，宁可空着也不显示假数。
 *   - sim   仿真联机：接入真实/仿真后端时的联机态，青色徽章。
 *
 * 与 lib/dataSource.ts 的分工（互补，不重复）：
 *   dataSource.ts = 「按后端集合」的细粒度来源分类（real/mock/pending），用于单个卡片角标。
 *   本模块        = 「全局屏级」三态开关，控制徽章 / 遮罩 / 数值置空，可由值守人员手动切换。
 */

import { computed, ref } from 'vue'
import { DATA_SOURCE_MODE, hasBackendDataSourceInfo } from './dataSource'

export type DataMode = 'demo' | 'empty' | 'sim'

/** 初始模式：后端真值为 real → 联机(sim)；否则演示(demo)。URL ?datamode= 可强制覆盖（值守/演示用）。 */
function initialMode(): DataMode {
  const forced = new URLSearchParams(window.location.search).get('datamode')
  if (forced === 'demo' || forced === 'empty' || forced === 'sim') return forced
  if (hasBackendDataSourceInfo() && DATA_SOURCE_MODE === 'real') return 'sim'
  return 'demo'
}

// 模块级单例：所有屏组件共享同一模式（参考页也是全局一份）
const mode = ref<DataMode>(initialMode())

const BADGE_TEXT: Record<DataMode, string> = {
  demo: '演示数据 DEMO DATA',
  empty: '未接入数据 NO DATA',
  sim: '仿真联机 SIM LIVE',
}

const BADGE_TEXT_EN: Record<DataMode, string> = {
  demo: 'DEMO DATA',
  empty: 'NO DATA',
  sim: 'SIM LIVE',
}

/**
 * 屏底常驻脚注（参考页 #note 原文口径）：明确列出哪些指标为示意值。
 * empty 模式无需脚注（已全屏遮罩），sim 模式改为联机说明。
 */
const FOOT_NOTE: Record<DataMode, string> = {
  demo: '* 部分指标为示意值：在线/离线/告警、能源、告警、工单、运行概况、天气',
  empty: '',
  sim: '* 联机模式：数值来自后端实时推送，台账为真实档案数据',
}

export function useDataMode() {
  /** 是否未接入态（全屏遮罩 + 数值置空） */
  const isEmpty = computed(() => mode.value === 'empty')
  /** 徽章 class（对应 bigscreen-stage.css 的 .m-demo / .m-empty / .m-sim） */
  const badgeClass = computed(() => `m-${mode.value}`)
  const badgeText = computed(() => BADGE_TEXT[mode.value])
  const badgeTextEn = computed(() => BADGE_TEXT_EN[mode.value])
  const footNote = computed(() => FOOT_NOTE[mode.value])

  /** 点击徽章：demo ↔ empty 互切（参考页同样只在这两态间切；sim 由后端联机决定，点击退回 demo）。 */
  function cycle(): void {
    mode.value = mode.value === 'empty' ? (hasBackendDataSourceInfo() && DATA_SOURCE_MODE === 'real' ? 'sim' : 'demo') : 'empty'
  }

  function setMode(m: DataMode): void {
    mode.value = m
  }

  /**
   * 数值占位包装 —— **所有大屏数值必须经此函数输出**。
   * empty 模式统一返回 '--'，从机制上保证「未接入时不显示任何数字」。
   * @param value 原始值
   * @param placeholder 占位符（默认 '--'）
   */
  function v<T>(value: T, placeholder = '--'): T | string {
    return isEmpty.value ? placeholder : value
  }

  /** 数值 + 单位组合的便捷包装（empty 时单位也一并隐藏，避免出现 "-- kW" 的伪精确感） */
  function vu(value: unknown, unit: string): { value: unknown; unit: string } {
    return isEmpty.value ? { value: '--', unit: '' } : { value, unit }
  }

  return { mode, isEmpty, badgeClass, badgeText, badgeTextEn, footNote, cycle, setMode, v, vu }
}

/**
 * 大屏时钟（参考页 tick() L4626-4634 的组件化复刻）
 * 单一 setInterval 模块级共享，所有屏的时钟同源（参考页也是全局一份）。
 * 文案格式一字不差：`2026年09月08日 星期一` / `14:22:07`
 */
import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

const WD = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

const dateText = ref('')
const timeText = ref('')
let timer: ReturnType<typeof setInterval> | null = null
let refCount = 0

function tick(): void {
  const d = new Date()
  dateText.value = `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${WD[d.getDay()]}`
  timeText.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

tick()

/** 引用计数：多个屏组件共用同一 interval，全部卸载后停表（避免离屏空转） */
export function useClock() {
  onMounted(() => {
    refCount += 1
    if (!timer) timer = setInterval(tick, 1000)
  })
  onBeforeUnmount(() => {
    refCount -= 1
    if (refCount <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  return { dateText: readonly(dateText), timeText: readonly(timeText) }
}

import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { Building, BuildingSubsystem, DevicePoint, SceneConfig, SceneMarker, MarkerSwitch, BuildingDisplay, SubsystemCode, SiteConfig, GisConfig, SceneSchemaDocument, SceneSchemaHudCanvas, SceneSchemaHudLayout, SceneSchemaHudWidget, SceneSchemaScenarioTrack } from '@/types/api'
import { DEFAULT_BUILDING_DISPLAY, DEFAULT_GIS_CONFIG } from '@/types/api'
import { buildingApi, sceneApi, siteConfigApi, gisConfigApi } from '@/api'
import { openLiveChannel, type LiveSubscription } from '@/lib/live'
import { useI18nStore } from '@/stores/i18n'
import { BUILDING_META, OVERVIEW_META, SUBSYSTEMS, getBuildingMeta } from '@/types/scene'
import { buildScenarioRefs, widgetIdsForSubsystem, type ScenarioRef } from '@/lib/scenario'
// GK-24：17 框 → 7 子系统的静态绑定表（前端默认布局同一份口径），用于「聚焦隐藏 / 面板数据联动」派生
import { BOX_SUBSYSTEM_MAP } from '@/lib/bigscreen-layout'
import { setBackendDataSourceInfo } from '@/lib/dataSource'

export type ActiveSubsystem = SubsystemCode | 'overview' | null

const ALL_SUBSYSTEMS: SubsystemCode[] = [
  'regulation',
  'lifecycle',
  'hvac',
  'lighting',
  'power',
  'hotwater',
  'elevator',
]

// 跨标签模型地址同步（后台与大屏常开在不同标签/窗口，Pinia store 各标签独立内存）
let modelChannel: BroadcastChannel | null = null
let modelSyncReady = false

// 跨标签楼栋显示配置同步（后台改框框/透明度，大屏即时刷新）
let buildingDisplayChannel: BroadcastChannel | null = null
let buildingDisplaySyncReady = false

export const useSceneStore = defineStore('scene', () => {
  // ---------- 楼栋与子系统 ----------
  const buildings = ref<Building[]>([])
  // 每栋楼启用子系统清单（building_subsystem_config），用于 AC-02 隐藏禁用项
  const enabledByBuilding = reactive<Record<string, SubsystemCode[]>>({})
  // 楼栋锚点（模型局部坐标）：优先来自 scene/config，fallback 到静态元数据
  const anchorByBuilding = reactive<Record<string, [number, number, number]>>({})

  // 大屏可见楼栋（status !== inactive）；新增/删除/开关后据此联动大屏
  const visibleBuildings = computed<Building[]>(() =>
    buildings.value.filter((b) => b.status !== 'inactive'),
  )

  const selectedBuilding = ref<string | null>(null) // null = 全院总览
  const activeSubsystem = ref<ActiveSubsystem>('overview')

  const sceneConfig = ref<SceneConfig | null>(null)
  const devicePoints = ref<DevicePoint[]>([])
  const markers = ref<SceneMarker[]>([])
  const markerSwitch = ref<MarkerSwitch>({ show_building_markers: true, show_device_points: true })
  // 楼栋显示 DIY（框框区域 + 背景透明度），默认盒体 35% 透明
  const buildingDisplay = ref<BuildingDisplay>({ ...DEFAULT_BUILDING_DISPLAY })
  // 子系统菜单元信息（后台可自定义名称 + 开关）：key=subsystem code
  const subsystemMeta = ref<Record<string, { label?: string; visible?: boolean }>>({})
  // 站点全局配置（标题/描述/关键字 → 浏览器 tab + meta 标签）
  const siteConfig = ref<SiteConfig>({ title: '开平市中心医院能源管理平台', description: '', keywords: '', showChinese: true, showEnglish: true })
  // 地图底图配置（Phase 2：Key 由后端代理，前端不暴露；provider/baseLayer/showLabel/center 供大屏底图使用）
  const gisConfig = ref<GisConfig>({ ...DEFAULT_GIS_CONFIG })

  // GK-06：后端 Scene Schema 实时物化文档（GK-01/03 产出），真实数据源 GET /scene/schema。
  // 结构对齐 D:\NewPrSz\spec\scene-schema.v1.schema.json（冻结契约）。
  // ThreeViewer / SceneRenderer 与 GK-06 大屏 17 框共用同一 ref：
  //   - Three 侧读 sceneGraph 段，节点缺失时 SceneRenderer 自动回退 sceneStore（GK-04 契约）；
  //   - HUD 侧读 hudLayout 段（GK-06），失败/为空时大屏走 lib/bigscreen-layout 默认布局回退。
  const sceneSchema = ref<SceneSchemaDocument | null>(null)

  // ---------- GK-06：hudLayout 段派生（大屏 17 框布局源） ----------
  const hudLayout = computed<SceneSchemaHudLayout | null>(() => sceneSchema.value?.hudLayout ?? null)
  const hudCanvas = computed<SceneSchemaHudCanvas | null>(() => hudLayout.value?.canvas ?? null)
  const hudWidgets = computed<SceneSchemaHudWidget[]>(() => hudLayout.value?.widgets ?? [])

  // GK-27：仅「已启用」面板（enabled !== false）。管理后台关闭的面板不渲染但配置保留。
  // 大屏 BigScreenLayout 与后台面板管理均消费此派生，保证开关语义单一来源。
  const hudWidgetsEnabled = computed<SceneSchemaHudWidget[]>(() =>
    hudWidgets.value.filter((w) => w.enabled !== false),
  )

  // GK-24：聚焦隐藏 / 面板数据联动所需的「框 → 子系统」解析层（内存态，不改 schema 文档/版本）。
  // 派生规则：
  //   1) schema widget.subsystem 优先（已带绑定的 4 个框保持原样，零回归）；
  //   2) 否则回退 BOX_SUBSYSTEM_MAP（补齐 lighting/hotwater/lifecycle 等缺失绑定，使聚焦不再全盘隐藏）；
  //   3) left-alarm 为「跨子系统通配」：聚焦态绑定到当前子系统（显示该子系统告警），
  //      overview 态不绑定（全显，无框被隐藏）。
  // 仅覆盖 subsystem 字段，其余（rect/frame/type/title）原样保留，布局/标题零回归。
  // 注（GK-24 / 兼容 GK-14 冻结契约）：left-alarm（监控报警）为跨子系统通配面板，
  // 不在此静态绑定到某子系统，故在「子系统聚焦」场景下按 scenario 机制被淡出（非成员），
  // 仅 overview 全显。GK-14 e2e 已锁定此行为（focus 时 left-alarm 隐藏）。
  // 子系统聚焦时的真实告警联动由 BigscreenStore 的 fetchPanels(subsystem) 在选中子系统时
  // 重新拉取（watch activeSubsystem）→ 数据仍真实绑定，只是该面板在聚焦态不常驻。
  const hudWidgetsResolved = computed<SceneSchemaHudWidget[]>(() => {
    const list = hudWidgets.value || []
    return list.map((w) => {
      const sub = (w.subsystem && String(w.subsystem).trim()) || BOX_SUBSYSTEM_MAP[w.id] || ''
      return sub === w.subsystem ? w : { ...w, subsystem: sub }
    })
  })

  function hudWidgetById(id: string): SceneSchemaHudWidget | null {
    if (!id) return null
    return hudWidgetsResolved.value.find((w) => w.id === id) ?? null
  }

  // ---------- GK-07：scenarios 段派生（游戏引擎式场景管理） ----------
  // schema 场景清单（overview + sys_<code>_focus）：由 lib/scenario 解析，
  // sceneSchema=null / scenarios 为空时为 [] → 一切走旧硬编码路径（零回归）。
  const scenarios = computed<ScenarioRef[]>(() => buildScenarioRefs(sceneSchema.value?.scenarios))
  // 当前激活场景 id（selectScenario / scenario 化的 selectSubsystem 写入；回退路径置 null）
  const activeScenarioId = ref<string | null>(null)
  const activeScenario = computed<ScenarioRef | null>(() =>
    activeScenarioId.value ? scenarios.value.find((s) => s.id === activeScenarioId.value) ?? null : null,
  )
  // scenario → hudLayout widget 的面板派生（「显示哪些面板」口径；本阶段只读，不改 17 框可见性）
  const activeScenarioWidgetIds = computed<string[]>(() =>
    widgetIdsForSubsystem(hudWidgetsResolved.value, activeScenario.value?.subsystem ?? null),
  )
  // scenario camera.apply 轨道 → 相机飞行请求。由 BigScreenLayout 经 ThreeViewer facade 的
  // flyToPreset 单一入口消费（与 GK-08 楼栋/楼层 preset 共用同一飞行实现，不绕过 facade）。
  // 注：该请求的发出已下沉到时间轴 tick（applyDueTracks）——atSec=0 的相机轨道在激活瞬间（t=0）
  // 立即触发，与改造前「激活即飞」行为一致；atSec>0 的相机轨道在时间轴推进到对应秒数时触发。
  const pendingCameraPreset = ref<{ presetId: string; seq: number } | null>(null)
  let cameraPresetSeq = 0

  /** 子系统 key（'overview' 或 SubsystemCode）→ 对应 scenario；无匹配（schema 缺失/不覆盖）返回 null */
  function scenarioForSubsystem(code: string): ScenarioRef | null {
    if (!code) return null
    return scenarios.value.find((s) => s.subsystem === code) ?? null
  }

  // ---------- GK-14：scenario 时序演出时间轴 + 聚焦隐藏无关框 ----------
  // 时间轴以 performance.now 为基准推进；tick 内只做 dirty 检查（appliedIdx 去重），
  // 无到期 track 时零 DOM 操作 / 零额外计算（相机飞行与日志仅在轨道到期时产生副作用）。
  interface AppliedTrack {
    index: number
    atSec: number
    action: string
    presetId?: string
    appliedAt: number
  }
  const scenarioClock = ref(0) // 时间轴当前秒数（DEV 句柄可读）
  const scenarioPlaying = ref(false)
  const scenarioAppliedLog = ref<AppliedTrack[]>([])
  const appliedIdx = new Set<number>()
  let scenarioStartTs = 0
  let scenarioRAF = 0
  let scenarioIV = 0

  // 聚焦隐藏：仅对「真实子系统 focus 场景」（subsystem 为 SubsystemCode，非 'overview'）生效；
  // overview 场景 members 为空 → 不隐藏任何框（与改造前总览全显一致，零回归）。
  const scenarioHiddenWidgetIds = computed<string[]>(() => {
    const sc = activeScenario.value
    if (!sc || !sc.subsystem || sc.subsystem === 'overview') return []
    const members = new Set(activeScenarioWidgetIds.value)
    return hudWidgetsResolved.value.filter((w) => !!w.id && !members.has(w.id)).map((w) => w.id as string)
  })

  function applyTrack(t: SceneSchemaScenarioTrack) {
    if (t.action === 'camera.apply' && t.presetId) {
      pendingCameraPreset.value = { presetId: t.presetId, seq: ++cameraPresetSeq }
    }
    scenarioAppliedLog.value = [
      ...scenarioAppliedLog.value,
      {
        index: appliedIdx.size - 1,
        atSec: typeof t.atSec === 'number' ? t.atSec : 0,
        action: t.action,
        presetId: t.presetId,
        appliedAt: +scenarioClock.value.toFixed(3),
      },
    ]
  }

  // 把「时钟推进到 clock 秒时已到期且尚未应用」的轨道依次应用（idempotent：appliedIdx 去重）
  function applyDueTracks(clock: number) {
    const sc = activeScenario.value
    if (!sc) return
    sc.tracks.forEach((t, idx) => {
      const at = typeof t.atSec === 'number' ? t.atSec : 0
      if (at <= clock && !appliedIdx.has(idx)) {
        appliedIdx.add(idx)
        applyTrack(t)
      }
    })
  }

  function tick(now: number) {
    if (!scenarioPlaying.value) return
    scenarioClock.value = (now - scenarioStartTs) / 1000
    applyDueTracks(scenarioClock.value)
  }

  function stopScenarioTimeline() {
    scenarioPlaying.value = false
    if (scenarioRAF) {
      cancelAnimationFrame(scenarioRAF)
      scenarioRAF = 0
    }
    if (scenarioIV) {
      clearInterval(scenarioIV)
      scenarioIV = 0
    }
  }

  function startScenarioTimeline() {
    stopScenarioTimeline()
    appliedIdx.clear()
    scenarioAppliedLog.value = []
    scenarioClock.value = 0
    scenarioStartTs = performance.now()
    scenarioPlaying.value = true
    applyDueTracks(0) // atSec<=0 轨道在激活瞬间立即应用（保持改造前行为不回归）
    scenarioRAF = requestAnimationFrame(tick)
    // 安全网：headless / 后台标签 rAF 可能被节流，setInterval 兜底推进，保证时钟不卡死
    scenarioIV = window.setInterval(() => tick(performance.now()), 100)
  }

  /**
   * GK-14：DEV-only 时间轴调试句柄（仅 import.meta.env.DEV 注入，生产构建不存在）。
   * - getTime()：当前时间轴秒数
   * - seek(sec)：把时间轴基准跳到 sec（重放：清空已应用集合与日志后按 sec 重新应用到期轨道）
   * - stop()：停止时间轴
   * - state()：playing/clock/activeScenarioId/applied/hidden/activeWidgetIds，供 e2e 断言
   */
  if (import.meta.env.DEV) {
    ;(window as unknown as { __kpScenario: unknown }).__kpScenario = {
      getTime: () => scenarioClock.value,
      isPlaying: () => scenarioPlaying.value,
      seek: (sec: number) => {
        if (!scenarioPlaying.value || !activeScenario.value) return
        appliedIdx.clear()
        scenarioAppliedLog.value = []
        scenarioStartTs = performance.now() - sec * 1000
        scenarioClock.value = sec
        applyDueTracks(sec)
      },
      stop: () => stopScenarioTimeline(),
      state: () => ({
        playing: scenarioPlaying.value,
        clock: scenarioClock.value,
        activeScenarioId: activeScenarioId.value,
        // JSON 回合：scenarioAppliedLog 为 reactive，CDP 序列化会变成 {0:{...}} 对象形态，
        // 转成纯数组便于 e2e 断言（Object.values 兜底）。
        applied: JSON.parse(JSON.stringify(scenarioAppliedLog.value)),
        hidden: JSON.parse(JSON.stringify(scenarioHiddenWidgetIds.value)),
        activeWidgetIds: JSON.parse(JSON.stringify(activeScenarioWidgetIds.value)),
      }),
    }
  }

  /**
   * GK-07 / GK-14：按 scenario id 切换场景（游戏引擎式 loadScene 语义）。
   * - 命中：写 activeScenarioId + activeSubsystem（驱动面板数据联动/WS/高亮，与旧链路同一状态），
   *   并启动时序演出时间轴：atSec<=0 的轨道（含 camera.apply）在激活瞬间（t=0）立即应用，
   *   其余 atSec>0 轨道随时间轴推进依次应用。
   * - 未命中 / scenario 无子系统语义：返回 false，调用方走旧路径。
   */
  function selectScenario(id: string): boolean {
    const sc = scenarios.value.find((s) => s.id === id)
    if (!sc || !sc.subsystem) return false
    activeScenarioId.value = sc.id
    activeSubsystem.value = sc.subsystem as ActiveSubsystem
    restartLiveChannel()
    startScenarioTimeline()
    return true
  }

  /** GK-14：退出当前 scenario（切回自由态）：停止时间轴并把聚焦隐藏的面板恢复到剧本前状态 */
  function exitScenario() {
    stopScenarioTimeline()
    appliedIdx.clear()
    scenarioAppliedLog.value = []
    scenarioClock.value = 0
    activeScenarioId.value = null
  }

  // ---------- 实时 / 主题 / 加载 ----------
  const realtimeMode = ref(false)
  const liveConnected = ref(false)
  const themeType = ref<'dark-navy' | 'green' | 'amber'>('dark-navy')
  const loading = reactive({ isLoading: false, progress: 0, message: '' })

  // 3D 医院模型加载状态（HospitalModel 写入，ThreeViewer 用于加载遮罩 / 兜底提示）
  const modelLoading = ref(false)
  const modelError = ref(false)
  // 大屏模型加载提示文案（后台可自定义，默认「模型加载中…」）
  const modelLoadingHint = ref('模型加载中…')

  // ---------- 初始化守卫 ----------
  const initialized = ref(false)

  // ---------- 设备详情 ----------
  const selectedDeviceId = ref<string | null>(null)
  const deviceDetailOpen = ref(false)

  // ---------- 楼层钻取（Phase 3：可被 3D 楼层标签 / 大屏面板触发） ----------
  const floorDrill = ref<{ buildingId: string | null; floor: number | null }>({
    buildingId: null,
    floor: null,
  })
  function openFloorDrill(buildingId: string, floor: number) {
    floorDrill.value = { buildingId, floor }
  }
  function closeFloorDrill() {
    floorDrill.value = { buildingId: null, floor: null }
  }

  // ---------- GK-19：设备点「显示层」分级过滤（只过滤渲染，不删任何后端数据） ----------
  // 背景：全院 1842 个设备点一次性全渲染 → 视觉糊成一团 + 拖性能。
  // 口径（产品定版）：
  //   ① 全景态（未选楼栋、未钻楼层）→ 按楼栋分层均匀抽稀到配额（默认 300），每栋至少保留 1 个；
  //   ② 选中楼栋 → 只显示该楼栋，不抽稀（全显）；
  //   ③ 钻取楼层（floorDrill 有值）→ 只显示该楼层；
  //   ④ 总开关 markerSwitch.show_device_points=false → 一个都不显示。
  // 注：后端 PUT /scene/marker-switch 虽接受 additive 新字段（HTTP 200），但
  //     scene.service.setMarkerSwitch 只合并 show_building_markers / show_device_points 两个字段，
  //     新字段不会落库（实测 GET 不回传）→ 配额暂为前端常量，DEV 句柄可调（见文件末 __kpSetDeviceQuota）。
  const DEFAULT_DEVICE_POINT_QUOTA = 300
  const devicePointQuota = ref<number>(DEFAULT_DEVICE_POINT_QUOTA)

  /** 当前设备点视图态（决定过滤口径）：楼层钻取 > 选中楼栋 > 全景 */
  const deviceViewMode = computed<'panorama' | 'building' | 'floor'>(() => {
    const fd = floorDrill.value
    if (fd && fd.buildingId && typeof fd.floor === 'number') return 'floor'
    if (selectedBuilding.value) return 'building'
    return 'panorama'
  })

  /**
   * 楼栋分层等比分配额：每栋至少 1 个（保证全景态不出现「某栋楼一个点都没有」），
   * 余数用最大余额法（largest remainder）按小数部分从大到小分配。
   */
  function allocateQuotaByBuilding(counts: number[], quota: number): number[] {
    const n = counts.length
    const shares = new Array<number>(n).fill(0)
    const total = counts.reduce((a, b) => a + b, 0)
    if (n === 0 || total <= 0 || quota <= 0) return shares
    if (quota >= total) return counts.slice()
    const fracs = new Array<{ i: number; frac: number }>(n)
    let used = 0
    for (let i = 0; i < n; i++) {
      fracs[i] = { i, frac: 0 }
      if (counts[i] <= 0) continue
      const exact = (quota * counts[i]) / total
      const base = Math.floor(exact)
      shares[i] = Math.min(counts[i], Math.max(1, base)) // 保底 1，且不超本栋真实数量
      fracs[i].frac = exact - base
      used += shares[i]
    }
    // 保底 1 可能使总额超过配额 → 从份额最大的非保底组开始回退（保底 1 不动）
    if (used > quota) {
      const order = fracs
        .map((f) => f.i)
        .filter((i) => counts[i] > 0 && shares[i] > 1)
        .sort((a, b) => shares[b] - shares[a])
      for (const i of order) {
        if (used <= quota) break
        const cut = Math.min(shares[i] - 1, used - quota)
        shares[i] -= cut
        used -= cut
      }
    }
    // 余量：按小数部分从大到小逐个 +1，直到分完或无组可加
    if (used < quota) {
      const order = fracs
        .filter((f) => counts[f.i] > 0 && shares[f.i] < counts[f.i])
        .sort((a, b) => b.frac - a.frac)
      while (used < quota && order.length) {
        let progressed = false
        for (const f of order) {
          if (used >= quota) break
          if (shares[f.i] < counts[f.i]) {
            shares[f.i] += 1
            used += 1
            progressed = true
          }
        }
        if (!progressed) break
      }
    }
    return shares
  }

  /** 组内等距（居中）采样：确定性（非随机）→ 同一状态下重建不抖动、不闪烁 */
  function evenSample<T>(items: T[], take: number): T[] {
    const n = items.length
    if (take <= 0 || n === 0) return []
    if (take >= n) return items.slice()
    const step = n / take
    const out: T[] = []
    const seen = new Set<number>()
    for (let k = 0; k < take; k++) {
      const idx = Math.min(n - 1, Math.floor((k + 0.5) * step))
      if (seen.has(idx)) continue
      seen.add(idx)
      out.push(items[idx])
    }
    return out
  }

  /**
   * GK-19 单一过滤入口（供 SceneRenderer 消费，算法留在 store，渲染层只调用）。
   * 入参元素需带 building_id；floor 可选（缺失时楼层钻取口径退化为「按楼栋过滤」）。
   */
  function filterDevicePoints<T extends { building_id: string; floor?: number | null }>(
    items: T[],
  ): T[] {
    if (!markerSwitch.value?.show_device_points) return []
    const mode = deviceViewMode.value
    if (mode === 'floor') {
      const bid = floorDrill.value?.buildingId
      const fl = floorDrill.value?.floor
      if (!bid || typeof fl !== 'number') return []
      return items.filter((p) => String(p.building_id) === String(bid) && (p.floor ?? null) === fl)
    }
    if (mode === 'building') {
      const bid = selectedBuilding.value
      if (!bid) return []
      return items.filter((p) => String(p.building_id) === String(bid))
    }
    // 全景态：按楼栋分层均匀抽稀到配额
    const quota = Math.floor(Number(devicePointQuota.value))
    if (!Number.isFinite(quota) || quota <= 0) return []
    if (items.length <= quota) return items
    const groups = new Map<string, T[]>()
    items.forEach((p) => {
      const key = String(p.building_id ?? '')
      const g = groups.get(key)
      if (g) g.push(p)
      else groups.set(key, [p])
    })
    const keys = [...groups.keys()]
    const shares = allocateQuotaByBuilding(keys.map((k) => groups.get(k)!.length), quota)
    const picked = new Set<T>()
    keys.forEach((k, i) => {
      evenSample(groups.get(k)!, shares[i]).forEach((p) => picked.add(p))
    })
    // 按原始顺序输出，保证渲染顺序稳定（便于 raycast / e2e 断言）
    return items.filter((p) => picked.has(p))
  }

  /** 配额调整（DEV 句柄 / 后续后台配置的唯一入口）；非法值忽略 */
  function setDevicePointQuota(n: number) {
    const v = Math.floor(Number(n))
    if (!Number.isFinite(v) || v < 0) return
    devicePointQuota.value = v
  }

  // DEV-only 调参句柄（仅 import.meta.env.DEV 注入，生产构建不存在）
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__kpSetDeviceQuota = (n: number) => {
      setDevicePointQuota(n)
      return devicePointQuota.value
    }
    ;(window as unknown as Record<string, unknown>).__kpDeviceQuota = () => ({
      quota: devicePointQuota.value,
      mode: deviceViewMode.value,
    })
    // GK-28：楼层钻取态 DEV 句柄（供 e2e 断言点击 Fx 后 floorDrill 真正生效，
    // 避免依赖 el-dialog 关闭态 DOM 是否存在造成误判）
    ;(window as unknown as Record<string, unknown>).__kpFloorDrill = () => ({
      buildingId: floorDrill.value.buildingId,
      floor: floorDrill.value.floor,
    })
  }

  // ---------- WS 通道 ----------
  let liveChannel: { close: () => void; send: (p: unknown) => void } | null = null
  const liveMetrics = reactive<Record<string, number>>({})
  let liveSocketWarning = false

  // ---------- 派生：顶部页签可见子系统 ----------
  // 过滤后台「子系统菜单」全局开关（visible=false 隐藏），再叠加楼栋级 enabled（AC-02）
  const visibleSubsystemCodes = computed<SubsystemCode[]>(() => {
    const list = !selectedBuilding.value
      ? ALL_SUBSYSTEMS
      : enabledByBuilding[selectedBuilding.value] || []
    return list.filter((code) => subsystemMeta.value[code]?.visible !== false)
  })

  // 子系统显示名：后台自定义 label 优先，否则默认名
  function subsystemName(code: string): string {
    const custom = subsystemMeta.value[code]?.label
    if (custom) return custom
    if (code === 'overview') return OVERVIEW_META.name
    return SUBSYSTEMS.find((s) => s.code === code)?.name || code
  }

  // 子系统英文名（用于大屏中英切换）：忽略后台自定义中文 label，取静态英文注册名
  function subsystemNameEn(code: string): string {
    if (code === 'overview') return OVERVIEW_META.nameEn
    return SUBSYSTEMS.find((s) => s.code === code)?.nameEn || code
  }

  // 子系统全局可见（默认 true）
  function subsystemVisible(code: string): boolean {
    return subsystemMeta.value[code]?.visible !== false
  }

  // 派生：当前顶部标题（"{楼栋名} · {子系统名}" 或 "全院 · {子系统名}"）
  const headerTitle = computed(() => {
    const i18n = useI18nStore()
    const bName = selectedBuilding.value
      ? buildings.value.find((b) => b.id === selectedBuilding.value)?.name ||
        getBuildingMeta(selectedBuilding.value)?.shortName ||
        '全院'
      : '全院'
    const sName =
      activeSubsystem.value === 'overview'
        ? i18n.t('综合概览', 'Overview')
        : activeSubsystem.value
          ? i18n.isEn
            ? subsystemNameEn(activeSubsystem.value)
            : subsystemName(activeSubsystem.value)
          : i18n.t('综合概览', 'Overview')
    return `${bName} · ${sName}`
  })

  const selectedAnchor = computed<[number, number, number] | null>(() => {
    if (!selectedBuilding.value) return null
    return anchorByBuilding[selectedBuilding.value] || getBuildingMeta(selectedBuilding.value)?.anchor || null
  })

  // ---------- 初始化：楼栋 + 场景配置 ----------
  async function init() {
    if (initialized.value) return
    loading.isLoading = true
    loading.progress = 10
    loading.message = '正在加载楼栋与场景配置…'
    try {
      const [bRes, cfg] = await Promise.allSettled([
        buildingApi.list(),
        sceneApi.config(),
      ])

      if (bRes.status === 'fulfilled') {
        buildings.value = bRes.value.items
        // 为每栋楼准备锚点（来自 scene config 或静态 fallback）
        bRes.value.items.forEach((b) => {
          const meta = BUILDING_META.find((m) => m.code === b.code)
          anchorByBuilding[b.id] = meta?.anchor || [0, 0, 0]
        })
      } else {
        // 接口异常时回退静态元数据，保证大屏骨架可渲染
        buildings.value = BUILDING_META.map((m, i) => ({
          id: m.code,
          code: m.code,
          name: m.shortName,
          floors: 0,
          gross_area: 0,
          status: 'active' as const,
        }))
        BUILDING_META.forEach((m) => (anchorByBuilding[m.code] = m.anchor))
      }

      if (cfg.status === 'fulfilled' && cfg.value) {
        sceneConfig.value = cfg.value
        // 后端数据驱动：GET /scene/config 的 building_anchors[].position({x,y,z})
        // 优先覆盖上方静态兜底锚点（仅当后端未返回该楼锚点时保留 BUILDING_META fallback）。
        // 楼栋 3D 摆位完全由后端坐标决定（AC-09 / Spec §13）。
        cfg.value.building_anchors?.forEach((a) => {
          anchorByBuilding[a.building_id] = [a.position.x, a.position.y, a.position.z]
        })
        // 加载标注开关
        if (cfg.value.marker_switch) {
          markerSwitch.value = cfg.value.marker_switch
        }
        // 加载子系统菜单元信息（自定义名称 + 开关）
        if (cfg.value.subsystem_meta) {
          subsystemMeta.value = cfg.value.subsystem_meta
        }
      }

      // 拉取标注开关（确保最新值）
      try {
        const sw = await sceneApi.getMarkerSwitch()
        if (sw) markerSwitch.value = sw
      } catch { /* 接口异常时保留默认值 */ }

      // 拉取楼栋显示 DIY 配置（框框区域 + 透明度）
      try {
        const bd = await sceneApi.getBuildingDisplay()
        if (bd) {
          // 合并前端默认楼层标签（仅补齐后端未覆盖的楼栋，如 6 号楼 HQL 真实三层）；
          // 后端若已存储该楼标签则以后端为准（后台 DIY 优先）。
          // floor_model_3d_by_building：新增字段，旧服务端配置不含 → 用前端默认（6 号楼默认开）；
          // 若服务端已显式存了该字段（含用户后台开关结果，可能为空对象表示全部关），则尊重服务端值。
          buildingDisplay.value = {
            ...bd,
            floors_by_building: {
              ...DEFAULT_BUILDING_DISPLAY.floors_by_building,
              ...(bd.floors_by_building || {}),
            },
            floor_model_3d_by_building:
              bd.floor_model_3d_by_building && Object.keys(bd.floor_model_3d_by_building).length
                ? bd.floor_model_3d_by_building
                : { ...DEFAULT_BUILDING_DISPLAY.floor_model_3d_by_building },
          }
        }
      } catch { /* 接口异常时保留默认值 */ }

      // 拉取子系统菜单元信息（确保最新值，覆盖他处改动）
      try {
        const meta = await sceneApi.getSubsystemMeta()
        if (meta) subsystemMeta.value = meta
      } catch { /* 接口异常时保留默认值 */ }

      // 拉取大屏模型加载提示文案（后台可自定义）
      try {
        const hint = await sceneApi.getModelLoadingHint()
        if (hint && typeof hint.hint === 'string' && hint.hint.trim()) {
          modelLoadingHint.value = hint.hint
        }
      } catch { /* 接口异常时保留默认 */ }

      // 拉取站点全局配置（标题/描述/关键字）
      try {
        const sc = await siteConfigApi.get()
        if (sc) siteConfig.value = sc
      } catch { /* 接口异常时保留默认值 */ }

      // 拉取地图底图配置（provider/baseLayer/showLabel/center；Key 不返回前端）
      try {
        const gc = await gisConfigApi.get()
        if (gc) gisConfig.value = gc
      } catch { /* 接口异常时保留默认值 */ }

      loading.progress = 100
    } catch (e) {
      console.warn('场景初始化失败', e)
    } finally {
      loading.isLoading = false
    }

    // 加载 3D 标记（含区域热点），供后台/大屏渲染
    try {
      await loadMarkers()
    } catch {
      /* 接口异常时保留默认 */
    }

    // 默认全院总览：预载所有楼的启用子系统（避免切换时空白）
    await Promise.all(buildings.value.map((b) => refreshEnabledSubsystems(b.id)))
    initialized.value = true
  }

  /**
   * GK-06：拉取后端 Scene Schema（真实数据源，接替 GK-04 本地 mock 派生）。
   *
   * - 成功：完整文档写入 sceneSchema（hudLayout 段驱动大屏 17 框；sceneGraph 段供 Three 消费）。
   * - 失败：console.warn 并保留 sceneSchema=null → HUD 走 lib/bigscreen-layout 默认布局回退、
   *   Three 走 sceneStore 兜底（两路均「与改造前行为一致」）。
   *
   * 返回文档或 null，供调用方 await 判定是否已驱动 schema。
   */
  async function loadSchema(): Promise<SceneSchemaDocument | null> {
    try {
      const doc = await sceneApi.schema()
      if (!doc || typeof doc !== 'object') {
        throw new Error('GET /scene/schema 返回非对象')
      }
      sceneSchema.value = doc
      // GK-24 收尾：把后端 GK-26 暴露的 dataSource 真值注入来源分类器（additive，缺段则回退镜像）
      setBackendDataSourceInfo((doc as Record<string, unknown>).dataSource as never)
      return doc
    } catch (e) {
      console.warn(
        '[scene] GET /scene/schema 失败，sceneSchema=null（大屏 17 框按默认布局渲染，Three 按 sceneStore 兜底）',
        e,
      )
      sceneSchema.value = null
      return null
    }
  }

  // 拉取某楼启用子系统清单（AC-02 数据来源）
  async function refreshEnabledSubsystems(buildingId: string): Promise<SubsystemCode[]> {
    try {
      const res = await buildingApi.subsystems(buildingId)
      const enabled = res.items.filter((s: BuildingSubsystem) => s.enabled).map((s) => s.subsystem_code)
      enabledByBuilding[buildingId] = enabled
      return enabled
    } catch {
      enabledByBuilding[buildingId] = ALL_SUBSYSTEMS
      return ALL_SUBSYSTEMS
    }
  }

  // 重新拉取楼栋列表（新增/删除/开关后联动大屏）
  async function refreshBuildings() {
    try {
      const res = await buildingApi.list()
      buildings.value = res.items
      res.items.forEach((b) => {
        const meta = BUILDING_META.find((m) => m.code === b.code)
        anchorByBuilding[b.id] = meta?.anchor || anchorByBuilding[b.id] || [0, 0, 0]
      })
    } catch {
      /* 保留当前值 */
    }
  }

  // ---------- 双联动：选楼（AC-01） ----------
  async function selectBuilding(buildingId: string | null) {
    // GK-30b 修正：切换楼栋（含回院区全景）时关闭楼层钻取，避免旧楼层的真实模型残留挂载在其它楼视角。
    if (buildingId === null || buildingId !== floorDrill.value?.buildingId) {
      closeFloorDrill()
    }
    selectedBuilding.value = buildingId
    // 确保该楼启用清单已加载
    if (buildingId) {
      await refreshEnabledSubsystems(buildingId)
    }
    // 若当前子系统在选中楼被禁用，则回退到综合概览（AC-02）
    if (buildingId && activeSubsystem.value && activeSubsystem.value !== 'overview') {
      if (!visibleSubsystemCodes.value.includes(activeSubsystem.value as SubsystemCode)) {
        activeSubsystem.value = 'overview'
      }
    }
    // 模型 + 数据联动：选楼后加载该楼真实设备点位（点击 3D 设备球即可打开真实设备详情）
    loadDevicePoints()
    restartLiveChannel()
  }

  // ---------- GK-21：楼栋导航面板相机飞行入口 ----------
  // 复用 pendingCameraPreset → BigScreenLayout watch → ThreeViewer.flyToPreset 单一入口，
  // 与 GK-07/GK-08 楼栋/楼层 preset 飞行同一条链路（不自建相机操控、不绕过 facade）。
  // 传不存在的 presetId（如 overview 哨兵）会触发 SceneRenderer flyToPreset 的回退默认视角
  // （院区全景 resetDefaultView），用于「取消选中楼栋 → 回院区全景」。
  function requestCameraPreset(presetId: string) {
    if (!presetId) return
    pendingCameraPreset.value = { presetId, seq: ++cameraPresetSeq }
  }

  // ---------- 双联动：选子系统（AC-01） ----------
  function selectSubsystem(code: ActiveSubsystem) {
    // GK-07：schema scenarios 覆盖该子系统时改由 scenario 驱动（tab 切换 → activeScenario，
    // 含 camera.apply 轨道 → 相机飞行）；schema 缺失 / scenarios 为空 / 无对应 scenario 时
    // 回退旧硬编码路径（activeSubsystem 直写，行为与改造前完全一致）。
    if (code) {
      const sc = scenarioForSubsystem(code)
      if (sc && selectScenario(sc.id)) return
    }
    activeScenarioId.value = null
    activeSubsystem.value = code
    restartLiveChannel()
  }

  // ---------- 设备点位 ----------
  async function loadDevicePoints() {
    try {
      const res = await sceneApi.points({
        building_id: selectedBuilding.value || undefined,
        subsystem: activeSubsystem.value && activeSubsystem.value !== 'overview'
          ? (activeSubsystem.value as string)
          : undefined,
      })
      devicePoints.value = res.points
    } catch {
      devicePoints.value = []
    }
  }

  // ---------- 3D 标记管理（后台 DIY 点位） ----------
  async function loadMarkers(buildingId?: string) {
    try {
      markers.value = await sceneApi.markers(buildingId)
    } catch {
      markers.value = []
    }
  }

  async function updateMarkerSwitch(patch: Partial<MarkerSwitch>) {
    try {
      const sw = await sceneApi.setMarkerSwitch(patch)
      if (sw) markerSwitch.value = sw
    } catch { /* 接口异常时保留当前值 */ }
  }

  // ---------- 楼栋显示 DIY（框框区域 + 背景透明度） ----------
  function applyBuildingDisplay(cfg: BuildingDisplay) {
    // 与 init() 保持一致：服务端若未返回 floor_model_3d_by_building（旧数据），
    // 回退前端默认（6 号楼默认开 3D 模型视图）；服务端已显式存了该字段则尊重之。
    buildingDisplay.value = {
      ...cfg,
      floor_model_3d_by_building:
        cfg.floor_model_3d_by_building && Object.keys(cfg.floor_model_3d_by_building).length
          ? cfg.floor_model_3d_by_building
          : { ...DEFAULT_BUILDING_DISPLAY.floor_model_3d_by_building },
    }
  }
  async function updateBuildingDisplay(patch: Partial<BuildingDisplay>) {
    try {
      const bd = await sceneApi.setBuildingDisplay(patch)
      if (bd) {
        buildingDisplay.value = bd
        // 跨标签广播：通知大屏等其他标签即时刷新楼栋框框显示
        buildingDisplayChannel?.postMessage({ type: 'building-display', config: bd })
      }
    } catch { /* 接口异常时保留当前值 */ }
  }
  // 跨标签 / 刷新兜底：大屏重新聚焦时从后端拉取最新楼栋显示配置
  async function refreshBuildingDisplayFromServer() {
    try {
      const bd = await sceneApi.getBuildingDisplay()
      if (bd) applyBuildingDisplay(bd)
    } catch {
      /* 接口异常时保留当前值 */
    }
  }

  // ---------- 楼栋锚点批量更新（后台 DIY 拖动楼栋位置） ----------
  function applyAnchors(anchors: Array<Record<string, any>>) {
    if (!Array.isArray(anchors)) return
    anchors.forEach((a) => {
      if (a?.building_id && a?.position) {
        anchorByBuilding[a.building_id] = [a.position.x, a.position.y, a.position.z]
      }
    })
  }
  async function updateAnchors(anchors: Array<Record<string, any>>) {
    try {
      const saved = await sceneApi.setAnchors(anchors)
      if (Array.isArray(saved)) {
        applyAnchors(saved)
        // 跨标签广播：通知大屏等其他标签即时刷新 3D 楼栋位置
        buildingDisplayChannel?.postMessage({ type: 'anchors', anchors: saved })
      }
    } catch { /* 接口异常时保留当前值 */ }
  }
  // 跨标签 / 刷新兜底：大屏重新聚焦时从后端拉取最新楼栋锚点
  async function refreshAnchorsFromServer() {
    try {
      const cfg = (await sceneApi.config()) as SceneConfig
      if (Array.isArray(cfg?.building_anchors)) applyAnchors(cfg.building_anchors)
    } catch {
      /* 接口异常时保留当前值 */
    }
  }

  // ---------- 子系统菜单 DIY（自定义名称 + 开关） ----------
  function applySubsystemMeta(meta: Record<string, { label?: string; visible?: boolean }>) {
    subsystemMeta.value = meta || {}
  }
  async function updateSubsystemMeta(meta: Record<string, { label?: string; visible?: boolean }>) {
    try {
      const saved = await sceneApi.setSubsystemMeta(meta)
      if (saved) {
        applySubsystemMeta(saved)
        // 跨标签广播：通知大屏等其他标签即时刷新子系统菜单
        buildingDisplayChannel?.postMessage({ type: 'subsystem-meta', meta: saved })
      }
    } catch { /* 接口异常时保留当前值 */ }
  }
  // 跨标签 / 刷新兜底：大屏重新聚焦时从后端拉取最新子系统菜单元信息
  async function refreshSubsystemMetaFromServer() {
    try {
      const meta = await sceneApi.getSubsystemMeta()
      if (meta) applySubsystemMeta(meta)
    } catch {
      /* 接口异常时保留当前值 */
    }
  }

  // ---------- 站点全局配置（标题/描述/关键字） ----------
  async function saveSiteConfig(body: Partial<SiteConfig>) {
    try {
      const saved = await siteConfigApi.update(body)
      if (saved) siteConfig.value = saved
    } catch {
      /* 接口异常时保留当前值 */
    }
  }

  // ---------- 地图底图配置（Phase 2：Key 由后端代理，前端不暴露） ----------
  async function saveGisConfig(body: Partial<GisConfig>) {
    try {
      const saved = await gisConfigApi.update(body)
      if (saved) gisConfig.value = saved
    } catch {
      /* 接口异常时保留当前值 */
    }
  }

  // ---------- 场景模型 URL / 类型更新（后台上传后即时回写，驱动大屏 3D 模型重载） ----------
  function applyModelUrl(url: string, type?: SceneConfig['model_type']) {
    if (sceneConfig.value) {
      sceneConfig.value.model_url = url
      if (type) sceneConfig.value.model_type = type
    }
  }
  function updateModelUrl(url: string, type?: SceneConfig['model_type']) {
    applyModelUrl(url, type)
    // 跨标签广播：通知其他标签（如大屏）重载场景模型
    modelChannel?.postMessage({ type: 'model-url', url })
  }
  // 跨标签 / 刷新兜底：大屏重新聚焦（获得焦点/可见）时从后端拉取最新 model_url，
  // 覆盖「另一标签上传」「他处改动」「刷新未重拉」等场景
  async function refreshModelUrlFromServer() {
    try {
      const cfg = (await sceneApi.config()) as SceneConfig
      if (cfg?.model_url) applyModelUrl(cfg.model_url)
    } catch {
      /* 接口异常时保留当前值 */
    }
  }

  // ---------- 设备详情（AC-04） ----------
  function openDevice(deviceId: string) {
    selectedDeviceId.value = deviceId
    deviceDetailOpen.value = true
    // 订阅该设备 WS（在 restartLiveChannel 中纳入 device_ids）
    restartLiveChannel()
  }

  function closeDevice() {
    deviceDetailOpen.value = false
    selectedDeviceId.value = null
  }

  // ---------- 实时模式 / WS ----------
  function setRealtimeMode(val: boolean) {
    realtimeMode.value = val
    if (val) restartLiveChannel()
    else stopLiveChannel()
  }

  function currentSubscription(): LiveSubscription {
    return {
      building_id: selectedBuilding.value,
      subsystem:
        activeSubsystem.value && activeSubsystem.value !== 'overview'
          ? (activeSubsystem.value as string)
          : undefined,
      device_ids: selectedDeviceId.value ? [selectedDeviceId.value] : undefined,
    }
  }

  function restartLiveChannel() {
    if (!realtimeMode.value) return
    stopLiveChannel()
    try {
      liveChannel = openLiveChannel(
        currentSubscription(),
        (payload) => {
          // 增量指标：{ device_id, metric_key, value } 等
          const p = payload as { device_id?: string; metric_key?: string; value?: number }
          if (p?.device_id && p?.metric_key && typeof p.value === 'number') {
            liveMetrics[`${p.device_id}:${p.metric_key}`] = p.value
          }
        },
        (connected) => {
          liveConnected.value = connected
        },
      )
    } catch (e) {
      if (!liveSocketWarning) {
        liveSocketWarning = true
        console.warn('实时通道不可用，已降级为定时轮询模式', e)
      }
    }
  }

  function stopLiveChannel() {
    liveChannel?.close()
    liveChannel = null
    liveConnected.value = false
  }

  // ---------- 主题 ----------
  function setTheme(type: 'dark-navy' | 'green' | 'amber') {
    themeType.value = type
    document.documentElement.setAttribute('data-kp-theme', type)
  }

  function setLoading(isLoading: boolean, progress = 0, message = '') {
    loading.isLoading = isLoading
    loading.progress = progress
    loading.message = message
  }

  // ---------- 跨标签同步注册（仅一次） ----------
  if (!modelSyncReady) {
    modelSyncReady = true
    if (typeof BroadcastChannel !== 'undefined') {
      modelChannel = new BroadcastChannel('kp-scene-model')
      modelChannel.onmessage = (e: MessageEvent) => {
        if (e.data && e.data.type === 'model-url') applyModelUrl(e.data.url)
      }
      buildingDisplayChannel = new BroadcastChannel('kp-scene-building-display')
      buildingDisplayChannel.onmessage = (e: MessageEvent) => {
        if (e.data && e.data.type === 'building-display' && e.data.config) {
          applyBuildingDisplay(e.data.config)
        }
        if (e.data && e.data.type === 'anchors' && Array.isArray(e.data.anchors)) {
          applyAnchors(e.data.anchors)
        }
        if (e.data && e.data.type === 'subsystem-meta' && e.data.meta) {
          applySubsystemMeta(e.data.meta)
        }
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        refreshModelUrlFromServer()
        refreshBuildingDisplayFromServer()
        refreshAnchorsFromServer()
        refreshSubsystemMetaFromServer()
      })
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          refreshModelUrlFromServer()
          refreshBuildingDisplayFromServer()
          refreshAnchorsFromServer()
          refreshSubsystemMetaFromServer()
        }
      })
    }
  }

  return {
    // state
    buildings,
    visibleBuildings,
    enabledByBuilding,
    anchorByBuilding,
    selectedBuilding,
    activeSubsystem,
    sceneConfig,
    devicePoints,
    markers,
    markerSwitch,
    buildingDisplay,
    subsystemMeta,
    siteConfig,
    gisConfig,
    sceneSchema,
    hudLayout,
    hudCanvas,
    hudWidgets,
    hudWidgetsEnabled,
    hudWidgetById,
    // GK-07：scenarios 派生（游戏引擎式场景管理）
    scenarios,
    activeScenarioId,
    activeScenario,
    activeScenarioWidgetIds,
    // GK-14：时序演出时间轴 + 聚焦隐藏
    scenarioClock,
    scenarioPlaying,
    scenarioAppliedLog,
    scenarioHiddenWidgetIds,
    pendingCameraPreset,
    realtimeMode,
    liveConnected,
    themeType,
    loading,
    modelLoading,
    modelError,
    modelLoadingHint,
    liveMetrics,
    selectedDeviceId,
    deviceDetailOpen,
    floorDrill,
    openFloorDrill,
    closeFloorDrill,
    initialized,
    // GK-19：设备点显示层分级过滤（配额 + 派生过滤入口）
    devicePointQuota,
    deviceViewMode,
    filterDevicePoints,
    setDevicePointQuota,
    // getters
    visibleSubsystemCodes,
    headerTitle,
    selectedAnchor,
    // actions
    init,
    loadSchema,
    refreshEnabledSubsystems,
    refreshBuildings,
    selectBuilding,
    selectSubsystem,
    // GK-07：scenario 切换（selectSubsystem 已 scenario 化，此为显式按 id 切换入口）
    selectScenario,
    scenarioForSubsystem,
    // GK-21：楼栋导航面板相机飞行入口
    requestCameraPreset,
    // GK-14：退出 scenario（恢复聚焦隐藏面板 + 停止时间轴）
    exitScenario,
    loadDevicePoints,
    loadMarkers,
    updateMarkerSwitch,
    updateBuildingDisplay,
    refreshBuildingDisplayFromServer,
    saveGisConfig,
    updateAnchors,
    refreshAnchorsFromServer,
    updateSubsystemMeta,
    refreshSubsystemMetaFromServer,
    saveSiteConfig,
    subsystemName,
    subsystemNameEn,
    subsystemVisible,
    updateModelUrl,
    openDevice,
    closeDevice,
    setRealtimeMode,
    setTheme,
    setLoading,
  }
})

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Building2,
  Cpu,
  BellRing,
  LineChart,
  User,
  MonitorCog,
  ArrowLeftRight,
  LogOut,
  Building,
  Banknote,
  History,
  Box,
  ScrollText,
  LayoutTemplate,
  GripVertical,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  MapPin,
  Square,
  ListTree,
  Layers,
  Globe,
  ShieldCheck,
  SlidersHorizontal,
  Map as MapIcon,
  Braces,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import { useSceneStore } from '@/stores/scene'
import { menuOrderApi } from '@/api'

const router = useRouter()
const user = useUserStore()
// 后台页也初始化场景 store（楼栋/锚点/子系统菜单元信息），
// 保证布局 DIY 预览、顶部子系统名等与大屏一一对应（此前仅在刷新按钮/大屏页触发）
const scene = useSceneStore()

const username = computed(() => user.user?.username || '值班用户')

interface MenuItem {
  path: string
  name: string
  icon: unknown
  // 访问此菜单所需的权限点（PERMISSION_OPTIONS.value）。未配置 = 不限权限（admin 角色始终可见）。
  permission?: string
}

// 顶层菜单项（已合并：用户管理含角色、告警管理含异常配置、能耗报表含报表导出）
// 权限点（permission 字段）与后端 PERMISSION_OPTIONS 对应；admin 角色默认可见全部，其他角色按权限点过滤。
const DEFAULT_MENUS: MenuItem[] = [
  { path: '/admin/building-subsystem', name: '楼栋子系统配置', icon: Building2, permission: 'building:config' },
  { path: '/admin/device', name: '设备管理', icon: Cpu, permission: 'device:edit' },
  { path: '/admin/user', name: '用户管理', icon: User, permission: 'user:manage' },
  { path: '/admin/alarm', name: '告警管理', icon: BellRing, permission: 'alarm:manage' },
  { path: '/admin/monitoring', name: '监控运维', icon: MonitorCog, permission: 'monitoring:view' },
  { path: '/admin/billing', name: '计费管理', icon: Banknote, permission: 'billing:manage' },
  { path: '/admin/history', name: '历史数据', icon: History, permission: 'history:view' },
  { path: '/admin/energy', name: '能耗报表', icon: LineChart, permission: 'energy:report' },
  { path: '/admin/building', name: '楼栋管理', icon: Building, permission: 'building:manage' },
  { path: '/admin/scene', name: '场景模型', icon: Box, permission: 'scene:upload' },
  { path: '/admin/marker', name: '标记管理', icon: MapPin, permission: 'scene:marker' },
  { path: '/admin/building-display', name: '楼栋显示DIY', icon: Square, permission: 'scene:display' },
  { path: '/admin/floor-label', name: '楼栋楼层标签', icon: Layers, permission: 'scene:display' },
  { path: '/admin/subsystem-menu', name: '子系统菜单', icon: ListTree, permission: 'scene:menu' },
  { path: '/admin/site-config', name: '站点配置', icon: Globe, permission: 'site:config' },
  { path: '/admin/gis-config', name: '地图底图配置', icon: MapIcon, permission: 'scene:display' },
  { path: '/admin/bigscreen-style', name: '大屏样式配置', icon: LayoutTemplate, permission: 'bigscreen:style' },
  { path: '/admin/bigscreen-layout', name: '大屏布局DIY', icon: LayoutGrid, permission: 'bigscreen:layout' },
  // GK-27：大屏面板系统（7 子系统综合面板 + 自由增删 / 开关 / DIY / 拖拽），持久化走 PUT /scene/schema
  { path: '/admin/panel-system', name: '大屏面板系统', icon: LayoutGrid, permission: 'bigscreen:layout' },
  // GK-09：Schema 编辑器（hudLayout 可视化编辑）。'scene:schema' 为前端门禁用权限点，
  // admin 角色默认可见；后端 PUT 仅 JWT 守卫（菜单机制为前端 DEFAULT_MENUS，无需库数据变更）。
  { path: '/admin/schema-editor', name: 'Schema 编辑器', icon: Braces, permission: 'scene:schema' },
  { path: '/admin/log', name: '操作日志', icon: ScrollText },
  { path: '/admin/audit-trail', name: '审查追踪', icon: ShieldCheck, permission: 'audit:trail' },
  { path: '/admin/device-control', name: '设备控制', icon: SlidersHorizontal, permission: 'device:control' },
]

// 当前用户是否为 admin 角色（admin 角色默认可见全部菜单；其他角色按权限点过滤）
const isAdmin = computed(() => (user.user?.role || '') === 'admin')
const userPerms = computed(() => Array.isArray(user.user?.permissions) ? (user.user!.permissions as string[]) : [])
// 顶层菜单（已应用用户自定义顺序 + 权限过滤）
const allMenus = ref<MenuItem[]>([...DEFAULT_MENUS])
const menus = computed<MenuItem[]>(() => {
  // user 尚未加载（auto-login / fetchMe 进行中或失败，如本地开发后端未启动）：
  // 先展示全部菜单，避免菜单塌缩成仅「无权限要求」的一项（操作日志），造成「菜单显示不全」。
  if (!user.user) return allMenus.value
  if (isAdmin.value) return allMenus.value
  const allow = new Set(userPerms.value)
  return allMenus.value.filter((m) => !m.permission || allow.has(m.permission))
})
const dragIndex = ref<number | null>(null)

function isActive(path: string): boolean {
  return router.currentRoute.value.path === path
}

// ---------- 拖拽排序（直接作用于 allMenus，保证 admin/非 admin 顺序一致） ----------
function onDragStart(i: number) {
  if (!isAdmin.value) return
  dragIndex.value = i
}
function onDragOver(e: Event) {
  if (!isAdmin.value) return
  e.preventDefault()
}
function onDrop(i: number) {
  if (!isAdmin.value) {
    dragIndex.value = null
    return
  }
  if (dragIndex.value === null || dragIndex.value === i) {
    dragIndex.value = null
    return
  }
  const arr = allMenus.value
  const moved = arr.splice(dragIndex.value, 1)[0]
  arr.splice(i, 0, moved)
  dragIndex.value = null
  persistOrder()
}
function move(i: number, dir: -1 | 1) {
  if (!isAdmin.value) return
  const j = i + dir
  if (j < 0 || j >= allMenus.value.length) return
  const arr = allMenus.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  persistOrder()
}

// ---------- 持久化菜单顺序 ----------
async function persistOrder() {
  try {
    await menuOrderApi.save(allMenus.value.map((m) => m.path))
  } catch {
    // 菜单顺序保存失败不影响使用
  }
}

async function loadOrder() {
  try {
    const order = (await menuOrderApi.get()) as string[]
    if (Array.isArray(order) && order.length) {
      const byPath = new Map(allMenus.value.map((m) => [m.path, m]))
      const ordered: MenuItem[] = []
      order.forEach((p) => {
        const m = byPath.get(p)
        if (m) {
          ordered.push(m)
          byPath.delete(p)
        }
      })
      // 追加后端未记录的新菜单项
      byPath.forEach((m) => ordered.push(m))
      allMenus.value = ordered
    }
  } catch {
    // 拉取失败则保持默认顺序
  }
}

function backToBigscreen() {
  router.push('/bigscreen/overview')
}
function logout() {
  user.logout()
  router.push('/bigscreen/overview')
}

// 权限兜底：当前路由不在可见菜单中（权限被回收/未配置）时，强制重定向到首个可见页面。
// 判定优先级：
//  1) 路由 meta.permission 显式声明 → 必须命中该权限（或 admin 角色）
//  2) 路径等于某可见菜单路径，或命中其子路径（m.path + '/' + ...）
//  3) 根 /admin 走路由层 redirect
// 注意：用户尚未加载完成时（user.value 为 null，处于 bootstrap auto-login 阶段）跳过重定向，
// 避免与 fetchMe 的异步结果竞态导致误跳。
watch(
  [() => router.currentRoute.value, menus, () => user.user],
  ([route, visible, u]) => {
    const path = route.path
    if (!path.startsWith('/admin')) return
    if (path === '/admin' || path === '/admin/') return
    if (!u) return // 用户尚未加载完成（auto-login / fetchMe 进行中）
    if (!visible || visible.length === 0) {
      router.replace('/bigscreen/overview')
      return
    }
    // admin 角色默认放行
    if (isAdmin.value) return
    const allow = new Set(userPerms.value)
    // 1) 显式 meta.permission
    const metaPerm = (route.meta && (route.meta as Record<string, any>).permission) as string | undefined
    if (metaPerm) {
      if (allow.has(metaPerm)) return
      router.replace(visible[0].path)
      return
    }
    // 2) 路径匹配
    const matched = visible.some((m) => path === m.path || path.startsWith(m.path + '/'))
    if (!matched) router.replace(visible[0].path)
  },
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  loadOrder()
  scene.init()
  // token 存在但 user 尚未加载（bootstrap 自动登录被跳过 / 本地后端未启动导致登录失败）：
  // 主动拉取当前用户，保证菜单权限与真实角色一致。无 token 或拉取失败则保持现状
  // （菜单按「全部展示」兜底，不会出现塌缩成单项的问题）。
  if (!user.user && user.isAuthenticated()) {
    user.fetchMe()
  }
})
</script>

<template>
  <el-container class="admin">
    <el-aside width="228px" class="admin__aside">
      <div class="admin__brand">
        <MonitorCog :size="22" class="admin__brand-icon" />
        <div class="admin__brand-text">
          <strong>能源管理平台</strong>
          <span>运营管理后台</span>
        </div>
      </div>
      <div class="admin__menu-hint">拖拽或上下箭头可排序</div>
      <ul class="admin__menu">
        <li
          v-for="(m, i) in menus"
          :key="m.path"
          class="admin__menu-item"
          :class="{ 'is-active': isActive(m.path), 'is-dragging': dragIndex === i }"
          draggable="true"
          @dragstart="onDragStart(i)"
          @dragover="onDragOver"
          @drop="onDrop(i)"
          @click="router.push(m.path)"
        >
          <GripVertical :size="13" class="admin__menu-grip" />
          <component :is="m.icon" :size="17" class="admin__menu-icon" />
          <span class="admin__menu-label">{{ m.name }}</span>
          <span class="admin__menu-moves">
            <button class="admin__menu-move" :disabled="i === 0" title="上移" @click.stop="move(i, -1)">
              <ChevronUp :size="14" />
            </button>
            <button class="admin__menu-move" :disabled="i === menus.length - 1" title="下移" @click.stop="move(i, 1)">
              <ChevronDown :size="14" />
            </button>
          </span>
        </li>
      </ul>
      <button class="admin__back" @click="backToBigscreen">
        <ArrowLeftRight :size="16" /> 返回态势大屏
      </button>
    </el-aside>

    <el-container>
      <el-header class="admin__header">
        <h2 class="admin__page-title">{{ $route.meta.title || '运营管理' }}</h2>
        <div class="admin__header-right">
          <span class="admin__user"><User :size="15" /> {{ username }}</span>
          <button class="admin__logout" @click="logout"><LogOut :size="15" /> 退出</button>
        </div>
      </el-header>
      <el-main class="admin__main">
        <router-view :key="$route.path" />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.admin {
  height: 100vh;
  background: var(--kp-bg);
  color: var(--kp-fg);
}
.admin__aside {
  background: linear-gradient(180deg, var(--kp-bg-deep), var(--kp-surface));
  border-right: 1px solid var(--kp-border-strong);
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
}
.admin__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 16px;
  border-bottom: 1px solid var(--kp-border);
  margin-bottom: 8px;
}
.admin__brand-icon { color: var(--kp-accent); filter: drop-shadow(0 0 6px var(--kp-glow)); }
.admin__brand-text { display: flex; flex-direction: column; }
.admin__brand-text strong { font-size: var(--kp-text-md); letter-spacing: var(--kp-tracking-label); }
.admin__brand-text span { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }

.admin__menu-hint { font-size: var(--kp-text-xs); color: var(--kp-fg-subtle); padding: 0 8px 8px; }
.admin__menu { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; min-height: 0; }
.admin__menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px;
  border-radius: var(--kp-radius-sm);
  color: var(--kp-fg-muted);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  user-select: none;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.admin__menu-item:hover { color: var(--kp-fg); background: var(--kp-glow-soft); }
.admin__menu-item.is-active { color: var(--kp-accent); background: var(--kp-glow-soft); }
.admin__menu-item.is-dragging { opacity: 0.4; }
.admin__menu-grip { color: var(--kp-fg-subtle); cursor: grab; flex-shrink: 0; }
.admin__menu-icon { color: inherit; flex-shrink: 0; }
.admin__menu-label { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.admin__menu-moves { display: flex; gap: 2px; opacity: 0; transition: opacity var(--kp-motion-fast); }
.admin__menu-item:hover .admin__menu-moves { opacity: 1; }
.admin__menu-move {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--kp-fg-muted);
  cursor: pointer;
  border-radius: 3px;
}
.admin__menu-move:hover:not(:disabled) { color: var(--kp-accent); background: var(--kp-surface-raised); }
.admin__menu-move:disabled { opacity: 0.25; cursor: not-allowed; }

.admin__back {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 38px;
  border: 1px solid var(--kp-border);
  background: transparent;
  color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
}
.admin__back:hover { color: var(--kp-fg); border-color: var(--kp-border-strong); }

.admin__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  border-bottom: 1px solid var(--kp-border);
  background: var(--kp-surface);
}
.admin__page-title {
  margin: 0;
  font-size: var(--kp-text-xl);
  font-weight: 590;
  letter-spacing: var(--kp-tracking-label);
}
.admin__header-right { display: flex; align-items: center; gap: 16px; }
.admin__user { display: inline-flex; align-items: center; gap: 6px; color: var(--kp-fg-muted); font-size: var(--kp-text-sm); }
.admin__logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--kp-border);
  background: transparent;
  color: var(--kp-fg);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
}
.admin__logout:hover { border-color: var(--kp-border-strong); color: var(--kp-accent); }
.admin__main { background: var(--kp-bg); padding: 18px; }
</style>

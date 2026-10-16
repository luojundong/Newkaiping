import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AuthUser } from '@/types/api'
import { authApi } from '@/api'
import { getToken, removeToken, setToken } from '@/lib/request'

// user 持久化键（与 token 分离，便于刷新后无感恢复登录态）
const USER_STORAGE_KEY = 'kp-admin-user'

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

// 用户与权限（AC-07：低权限账号禁用高危控制）
export const useUserStore = defineStore('user', () => {
  // token 有效时优先从 localStorage 水合 user，避免刷新瞬间空白 / 权限 watch 竞态
  const stored = getToken() ? readStoredUser() : null
  const user = ref<AuthUser | null>(stored)
  const permissions = ref<string[]>(stored?.permissions || [])

  // 将当前 user 写入 / 清除 localStorage（与 token 生命周期对齐）
  function persistUser() {
    try {
      if (user.value) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user.value))
      else localStorage.removeItem(USER_STORAGE_KEY)
    } catch {
      /* 隐私模式等场景 localStorage 不可用时静默降级 */
    }
  }

  function hasPermission(perm: string): boolean {
    if (!user.value) return false
    // 超管放行一切；否则校验 permissions 列表或角色
    if (user.value.role === 'admin') return true
    return permissions.value.includes(perm) || user.value.permissions.includes(perm)
  }

  // 高危控制权限（下发设备控制指令）
  function canControl(): boolean {
    if (!user.value) return false
    // 与后端一致：设备控制接口仅 admin 可写（@Roles('admin')），其余角色需具备 device:control 权限点。
    // 注意：后端角色集为 admin/maintainer/duty/leader/viewer，不存在 'operator' 角色（旧残留已移除）。
    if (user.value.role === 'admin') return true
    return hasPermission('device:control')
  }

  async function login(username: string, password: string) {
    const res = await authApi.login(username, password)
    setToken(res.token)
    user.value = res.user
    permissions.value = res.user.permissions || []
    persistUser()
    return res.user
  }

  async function fetchMe() {
    try {
      const me = await authApi.me()
      user.value = me
      permissions.value = me.permissions || []
      persistUser()
    } catch {
      /* 未登录或 token 失效：保持空态，由路由守卫处理 */
    }
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      /* ignore */
    }
    removeToken()
    user.value = null
    permissions.value = []
    persistUser()
  }

  function isAuthenticated(): boolean {
    return !!getToken()
  }

  return {
    user,
    permissions,
    hasPermission,
    canControl,
    login,
    fetchMe,
    logout,
    isAuthenticated,
  }
})

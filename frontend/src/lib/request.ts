import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { ApiEnvelope } from '@/types/api'

// API 基地址取自环境变量，切换真实后端只改 .env（AC-03：前端零改动）。
// 默认相对路径 /api/v1：浏览器走同源，由 dev proxy（vite）或 nginx 反代转发到后端，
// 避免写死具体端口，便于演示与后续部署。
const BASE_URL = import.meta.env.VITE_API_BASE || '/api/v1'

export const TOKEN_KEY = 'kp-auth-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  // 大文件 .glb 上传（可达数百 MB）耗时较长，15s 默认超时会提前中断导致 Network Error，
  // 统一放宽到 120s；普通 API 请求仍是毫秒级响应，不影响体验。
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 统一响应处理：解包 { code, data, message } 包络，仅返回 data。
// 业务错误（code !== 0）抛出异常，由调用方 catch 处理。
http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope<unknown>
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code !== 0) {
        return Promise.reject(new Error(body.message || `接口返回错误码 ${body.code}`))
      }
      return body.data as never
    }
    // 部分端点（如登录）可能直接返回 data 对象
    return response.data
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      // 令牌失效：清除本地令牌，由路由守卫在下次导航时引导重新登录。
      removeToken()
    }
    let msg = error?.response?.data?.message || error.message || '网络请求失败'
    if (status === 403) {
      // 后端 RBAC（@Roles）拒绝：统一给出可读的「权限不足」提示，避免抛出原始异常。
      msg = '权限不足，请联系管理员或使用 admin 账号操作'
    }
    return Promise.reject(new Error(msg))
  },
)

// 泛型请求封装
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return http.get(url, config) as Promise<T>
}

export async function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  // 上传 multipart 时，必须清除实例默认的 Content-Type: application/json，
  // 否则浏览器不会自动补 "multipart/form-data; boundary=..."，后端自定义 busboy 解析器不触发，
  // 导致上传返回「未接收到上传文件」。设置 undefined 后 axios 会删除该头（AxiosHeaders: value==null 即删除）。
  if (data instanceof FormData) {
    const cfg: AxiosRequestConfig = {
      ...(config || {}),
      headers: { ...(config?.headers || {}), 'Content-Type': undefined },
    }
    return http.post(url, data, cfg) as Promise<T>
  }
  return http.post(url, data, config) as Promise<T>
}

export async function apiPut<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return http.put(url, data, config) as Promise<T>
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const cfg = config || {}
  // Fastify 内置 JSON 解析器对「带 Content-Type: application/json 但无 body」的请求会抛 400
  // ("Body cannot be empty")，导致 DELETE 等无 body 接口（如删除楼栋）在浏览器中失败。
  // 无 body 时移除该默认头，后端即按空体正确处理（经验证 curl 不带该头返回 200）。
  if (cfg.data === undefined) {
    cfg.headers = { ...(cfg.headers || {}), 'Content-Type': undefined }
  }
  return http.delete(url, cfg) as Promise<T>
}

export default http

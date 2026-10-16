// 仅供 e2e（gk23-hvac-lighting-control.mjs）独立挂载组件使用：
// 通过 Vite 服务的模块动态 import('vue') 才能正确解析，浏览器原生裸 import('vue') 无法解析。
// 该文件不参与任何业务链路；仅作为测试挂载桥。
import { createApp } from 'vue'

export function mountComp(Comp: unknown, props: Record<string, unknown>): string {
  const host = document.createElement('div')
  host.id = 'gk23-host-' + Math.random().toString(36).slice(2, 8)
  document.body.appendChild(host)
  const app = createApp(Comp as never, props)
  app.mount(host)
  return host.id
}

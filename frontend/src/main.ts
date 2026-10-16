import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import './styles/design-tokens.css'
import './styles/app.css'
import './styles/admin.css'

import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import { useSceneStore } from './stores/scene'
import { schemaSync } from './lib/schema-sync'

// 默认主题：dark-navy（与 design-tokens.css :root 对齐）。green/amber 备用主题由 data-kp-theme 切换。
document.documentElement.setAttribute('data-kp-theme', 'dark-navy')

const app = createApp(App)
const pinia = createPinia()

// GK-08：dev-only QA 句柄 —— CDP/手工验证从 Console 动态 import('/src/stores/scene.ts') 访问 store
// （如临时切换当前标签的 model_type 以验证 3D 相机 preset；仅内存态，不触碰后端持久化）。
if (import.meta.env.DEV) {
  ;(window as unknown as { __kpPinia: typeof pinia }).__kpPinia = pinia
}

app.use(pinia)
app.use(router)
app.use(ElementPlus)

// 演示自动登录：本交付无独立登录页，应用启动即以前端演示账号换取 token，
// 保证大屏/管理后台所有鉴权接口（含楼栋列表）可直接访问。账号密码可由
// .env 的 VITE_DEMO_USER / VITE_DEMO_PASSWORD 覆盖（默认 admin/admin123）。
async function bootstrap() {
  const userStore = useUserStore(pinia)
  if (!userStore.isAuthenticated()) {
    try {
      const demoUser = import.meta.env.VITE_DEMO_USER || 'admin'
      const demoPass = import.meta.env.VITE_DEMO_PASSWORD || 'admin123'
      await userStore.login(demoUser, demoPass)
    } catch (err) {
      // 自动登录失败（后端未起或网络异常）：保持未登录态，页面按既有逻辑报错/兜底。
      console.warn('[bootstrap] 演示自动登录失败，请确认后端 :5168 已启动', err)
    }
  }
  // GK-11：一处编辑、多端生效 —— 连接既有 WS 通道监听 schema.updated 广播，
  // 其他页签自动重载 schema（重载动作经参数注入，schema-sync 不反向依赖 scene store）。
  schemaSync.init({ reload: () => useSceneStore(pinia).loadSchema() })

  // GK-11：dev-only QA 句柄 —— 探针/控制台直取 schemaSync 实例（动态 import 会得到
  // 另一个模块实例，__debug 恒为未连接，故必须经窗口句柄读取）。
  if (import.meta.env.DEV) {
    ;(window as unknown as { __kpSchemaSync?: typeof schemaSync }).__kpSchemaSync = schemaSync
  }

  app.mount('#app')
}

bootstrap()

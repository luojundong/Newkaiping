import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 开平市中心医院能源管理平台 — Vite 配置
// 演示端口：前端 :5169，后端 :5168（dev 代理 /api → 5168）
export default defineConfig(({ mode }) => {
  // loadEnv 读取 .env 中的 VITE_* 变量（vite.config 运行在 Node 环境，
  // process.env 不会自动注入 .env，必须显式 loadEnv），否则 VITE_API_TARGET 失效。
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:5168'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5169,
      // 后端 API 代理：将 /api 转发到后端（默认 :5168），可用 VITE_API_TARGET 覆盖。
      // 支持 WebSocket 升级（/api/v1/ws/live 经同一前缀代理，便于大屏实时通道联调）。
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
        // 后端静态资源（上传的 .glb 模型等）：/uploads → 后端 :5168
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      // 关闭 Vite 自带的 outDir 安全删除（Windows 下 safe-delete 截断会失败）；改用构建前 bash rm 清理
      emptyOutDir: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three', '@tresjs/core', '@tresjs/cientos'],
            echarts: ['echarts'],
            element: ['element-plus'],
          },
        },
      },
    },
  }
})

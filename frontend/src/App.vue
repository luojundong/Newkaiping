<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSceneStore } from '@/stores/scene'

const scene = useSceneStore()
const { siteConfig } = storeToRefs(scene)
const route = useRoute()

// ---- 文档标题：站点标题 · 当前页面 ----
function applyTitle(pageTitle?: string) {
  const site = siteConfig.value?.title || '开平市中心医院能源管理平台'
  document.title = pageTitle ? `${pageTitle} · ${site}` : site
}
// ---- meta description / keywords ----
function ensureMeta(name: string, content: string) {
  let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}
function applyMeta() {
  const sc = siteConfig.value
  if (sc?.description) ensureMeta('description', sc.description)
  if (sc?.keywords) ensureMeta('keywords', sc.keywords)
}

onMounted(() => {
  scene.init() // 后台页 + 大屏页统一触发，确保 siteConfig / subsystemMeta 等已加载
  applyTitle()
  applyMeta()
})
watch(siteConfig, () => {
  applyTitle()
  applyMeta()
})
watch(
  () => route.meta?.title as string | undefined,
  (t) => applyTitle(t),
)
</script>

<template>
  <RouterView />
</template>

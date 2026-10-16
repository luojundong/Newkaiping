<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import BigScreenLayout from '@/components/layout/BigScreenLayout.vue'
import { useSceneStore } from '@/stores/scene'
import type { SubsystemCode } from '@/types/api'

const route = useRoute()
const scene = useSceneStore()

function applyRoute() {
  const id = route.params.id as string
  const sub = route.params.subsystem as string | undefined
  // 双联动：选中楼栋（驱动 3D 相机 / 左面板 / 右面板 / WS 订阅）
  scene.selectBuilding(id)
  // 选中子系统；缺省则综合概览该楼
  scene.selectSubsystem((sub as SubsystemCode) || 'overview')
}

onMounted(applyRoute)

// 同一组件内切换楼栋 / 子系统参数时重新应用
watch(
  () => [route.params.id, route.params.subsystem],
  applyRoute,
)
</script>

<template>
  <BigScreenLayout />
</template>

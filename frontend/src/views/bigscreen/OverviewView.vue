<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import BigScreenLayout from '@/components/layout/BigScreenLayout.vue'
import SubsystemOverviewGrid from '@/components/panels/SubsystemOverviewGrid.vue'
import { useSceneStore } from '@/stores/scene'
import { useBigscreenStore } from '@/stores/bigscreen'

const scene = useSceneStore()
const bigscreen = useBigscreenStore()

// GK-24：综合概述（overview）场景下额外呈现「七大系统」数据总览层
const showOverviewGrid = computed(() => !scene.activeSubsystem || scene.activeSubsystem === 'overview')

onMounted(() => {
  // 综合概览：全院范围 + 综合概览子系统（AC-01 双联动起点）
  scene.selectBuilding(null)
  scene.selectSubsystem('overview')
  // 启动大屏面板轮询（每 15s），选楼/选子系统由 store watch 自动重新拉取
  bigscreen.start()
})

onBeforeUnmount(() => {
  bigscreen.stopPolling()
})
</script>

<template>
  <div class="overview-view">
    <BigScreenLayout />
    <SubsystemOverviewGrid v-if="showOverviewGrid" />
  </div>
</template>

<script setup lang="ts">
/**
 * 图7 权威建筑面积表（参考页 #scr7 / rS7() L5314-5326 的组件化复刻）
 * 契约：docs/design/bigscreen-panel-specs.md §7
 *
 * ★ 本屏是**唯一全真实数据屏**：楼栋 / 名称 / 层数 / 建筑面积均来自 scene store 的 building 台账
 *   （后端 backend/data/runtime.json 已回填 10 栋权威盘点值），
 *   gross_area 为 null 的 1 号楼 / 9 号楼显示「待核」且不计入合计 —— 合规要求：不臆造面积。
 *   因此表内数值**不经 v() 置空**（真实档案数据与数据模式无关）。
 *
 * 无 .panel 框架，仅 .t7wrap（几何 left:40 top:120 width:1840 bottom:60）内含 table.t7。
 */
import { computed } from 'vue'
import BsScreenHead from '../BsScreenHead.vue'
import { f2 } from '@/lib/bigscreen-palette'
import { useSceneStore } from '@/stores/scene'

defineProps<{ active: boolean }>()

const scene = useSceneStore()

/** 楼栋序号：code 'B3' → 3 */
function buildingNo(code: string): number {
  const n = Number.parseInt(code.replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? 0 : n
}

interface AreaRow {
  key: string
  no: number
  name: string
  floors: number
  area: number | null
}

const rows = computed<AreaRow[]>(() =>
  [...scene.visibleBuildings]
    .sort((a, b) => buildingNo(a.code) - buildingNo(b.code))
    .map((b) => ({
      key: b.id,
      no: buildingNo(b.code),
      name: b.name,
      floors: b.floors,
      area: (b.gross_area as number | null) ?? null,
    })),
)

/** 已核栋数 / 合计面积：只累加非 null（待核栋不计入，合规口径） */
const verified = computed(() => rows.value.filter((r) => r.area !== null))
const areaTotal = computed(() => verified.value.reduce((a, r) => a + (r.area ?? 0), 0))
</script>

<template>
  <section class="bs-screen bs-screen--flat" :class="{ 'is-on': active }">
    <BsScreenHead :no="7" />

    <div class="t7wrap">
      <table class="t7">
        <thead>
          <tr>
            <th>楼栋</th>
            <th>名称</th>
            <th>层数</th>
            <th class="right">建筑面积 (m²)</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <td class="bno">{{ r.no }}号楼</td>
            <td>{{ r.name }}</td>
            <td>{{ r.floors }}</td>
            <td class="right">
              <span v-if="r.area === null" class="pend">待核</span>
              <span v-else>{{ f2(r.area) }}</span>
            </td>
            <td>
              <span v-if="r.area === null" class="pend">待核</span>
              <span v-else class="done">已核</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">合计（已核 {{ verified.length }} 栋）</td>
            <td class="right">{{ f2(areaTotal) }}</td>
            <td><span class="done">{{ verified.length }} 栋已核</span></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>

<style scoped>
/* 「已核」绿（参考页内联 #34D98A → 令牌） */
.done {
  color: var(--kp-success);
  font-weight: 700;
}
</style>

<script setup lang="ts">
// 楼层平面图渲染组件（内联 SVG，无外部图表库）。
// 数据来自 floorplan-gen.ts 的 generateFloorPlan() 输出（FloorPlan 模型）。
// 交互：点击房间矩形/房间名 → emit('room-select')；点击设备点位 → emit('device-select')。
import { computed } from 'vue'
import type { FloorPlan, FloorPlanRoom } from '@/lib/floorplan-gen'
import { SUBSYSTEMS } from '@/types/scene'

const props = defineProps<{
  plan: FloorPlan | null
  buildingName?: string
  floor?: number | null
  loading?: boolean
  selectedRoomKey?: string | null
  /** 平面图标识（楼栋-层），便于测试断言切换 */
  planKey?: string
}>()

const emit = defineEmits<{
  (e: 'room-select', roomKey: string): void
  (e: 'device-select', deviceId: string): void
}>()

const hasPlan = computed(() => !!props.plan && !props.plan.empty && props.plan.rooms.length > 0)

// 楼层轮廓矩形（footprint）= 场景包围盒按 transform 映射后的居中矩形
const footprint = computed(() => {
  const p = props.plan
  if (!p) return null
  const t = p.transform
  return {
    x: t.offsetX,
    y: t.offsetY,
    w: p.width * t.scale,
    h: p.depth * t.scale,
  }
})

const sysMeta = (code: string) => SUBSYSTEMS.find((s) => s.code === code)
const sysColor = (code: string) => {
  const m = sysMeta(code)
  return m ? `var(${m.colorVar})` : 'var(--kp-accent)'
}
const sysName = (code: string) => sysMeta(code)?.name ?? code

// 图例：该平面图出现的所有设备类型（去重，确定性顺序）
const legend = computed(() => {
  const p = props.plan
  if (!p) return []
  const seen = new Set<string>()
  const out: { code: string; name: string; color: string }[] = []
  for (const r of p.rooms) {
    for (const t of r.types) {
      if (seen.has(t)) continue
      seen.add(t)
      out.push({ code: t, name: sysName(t), color: sysColor(t) })
    }
  }
  return out
})

function onRoom(room: FloorPlanRoom) {
  emit('room-select', room.key)
}
function onDot(deviceId: string) {
  emit('device-select', deviceId)
}
</script>

<template>
  <div class="floor-plan" data-floor-plan="1" :data-plan-key="planKey || ''">
    <!-- 加载中 -->
    <div v-if="loading" class="fp-empty">楼层平面图加载中…</div>

    <!-- 空态：无设备 → 明确提示，不白屏 -->
    <div v-else-if="!hasPlan" class="fp-empty">
      <span class="fp-empty__icon">▦</span>
      <p>该楼层暂未登记设备平面图</p>
      <small>点选其它楼层查看布局示意</small>
    </div>

    <!-- 平面图主体 -->
    <template v-else>
      <div class="fp-caption">
        <span>{{ buildingName }}<template v-if="floor != null"> · {{ floor }}F</template> 平面示意图</span>
        <span class="fp-caption__tag" :class="'fp-caption__tag--' + (plan!.roomSource)">
          {{ plan!.roomSource === 'real' ? '真实房间' : plan!.roomSource === 'clustered' ? '聚类生成' : plan!.roomSource === 'mixed' ? '真实+聚类' : '空' }}
        </span>
      </div>

      <svg
        class="fp-svg"
        :viewBox="`0 0 ${plan!.canvasWidth} ${plan!.canvasHeight}`"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="楼层平面示意图"
      >
        <!-- 楼层轮廓（footprint） -->
        <rect
          v-if="footprint"
          class="fp-outline"
          :x="footprint.x"
          :y="footprint.y"
          :width="footprint.w"
          :height="footprint.h"
          rx="6"
        />

        <!-- 房间 -->
        <g
          v-for="room in plan!.rooms"
          :key="room.key"
          class="fp-room"
          :class="{ 'fp-room--active': selectedRoomKey && room.key === selectedRoomKey }"
          :data-room-key="room.key"
          @click="onRoom(room)"
        >
          <rect
            class="fp-room__rect"
            :x="room.x"
            :y="room.y"
            :width="room.w"
            :height="room.h"
            rx="5"
          />
          <text
            class="fp-room__name"
            :x="room.x + room.w / 2"
            :y="room.y + room.h / 2 - 4"
            text-anchor="middle"
          >{{ room.name }}</text>
          <text
            class="fp-room__count"
            :x="room.x + room.w / 2"
            :y="room.y + room.h / 2 + 12"
            text-anchor="middle"
          >{{ room.deviceCount }} 台</text>
        </g>

        <!-- 设备点位（按类型着色） -->
        <circle
          v-for="pt in plan!.points"
          :key="pt.id"
          class="fp-dot"
          :data-device-id="pt.id"
          :data-type="pt.type"
          :cx="pt.x"
          :cy="pt.y"
          :r="4"
          :fill="sysColor(pt.type)"
          @click.stop="onDot(pt.id)"
        >
          <title>{{ pt.name }}（{{ sysName(pt.type) }}）</title>
        </circle>
      </svg>

      <!-- 图例 -->
      <div v-if="legend.length" class="fp-legend">
        <span
          v-for="l in legend"
          :key="l.code"
          class="fp-legend__item"
        >
          <i class="fp-legend__dot" :style="{ background: l.color }" />
          {{ l.name }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.floor-plan {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 6px;
}
.fp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 28px 12px;
  color: var(--kp-fg-muted);
  font-size: var(--kp-text-sm);
  border: 1px dashed var(--kp-border-strong);
  border-radius: var(--kp-radius);
  background: var(--kp-glow-soft);
}
.fp-empty__icon { font-size: 28px; opacity: 0.5; }
.fp-empty p { margin: 0; color: var(--kp-fg); }
.fp-empty small { color: var(--kp-fg-subtle); }

.fp-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--kp-text-xs);
  color: var(--kp-fg-muted);
}
.fp-caption__tag {
  padding: 1px 8px;
  border-radius: var(--kp-radius-pill);
  border: 1px solid var(--kp-border);
  font-size: 10px;
}
.fp-caption__tag--real { color: var(--kp-ok, #36d399); border-color: var(--kp-ok, #36d399); }
.fp-caption__tag--clustered { color: var(--kp-fg-muted); }
.fp-caption__tag--mixed { color: var(--kp-warn, #f5a623); border-color: var(--kp-warn, #f5a623); }

.fp-svg {
  width: 100%;
  height: auto;
  max-height: 320px;
  display: block;
  background:
    radial-gradient(120% 120% at 50% 0%, rgba(var(--kp-accent-rgb), 0.06), transparent 70%),
    var(--kp-bg-deep, #030c18);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius);
}

.fp-outline {
  fill: rgba(var(--kp-accent-rgb), 0.04);
  stroke: var(--kp-border-strong);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.fp-room { cursor: pointer; }
.fp-room__rect {
  fill: rgba(var(--kp-accent-rgb), 0.05);
  stroke: var(--kp-accent);
  stroke-width: 1;
  transition: fill 0.15s, stroke 0.15s;
}
.fp-room:hover .fp-room__rect {
  fill: rgba(var(--kp-accent-rgb), 0.16);
  stroke: var(--kp-accent-hover, #33eaff);
}
.fp-room--active .fp-room__rect {
  fill: rgba(var(--kp-accent-rgb), 0.22);
  stroke: var(--kp-accent-active, #66efff);
  stroke-width: 1.5;
}
.fp-room__name {
  fill: var(--kp-fg);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
  font-family: var(--kp-mono, monospace);
}
.fp-room__count {
  fill: var(--kp-fg-muted);
  font-size: 10px;
  pointer-events: none;
}

.fp-dot {
  stroke: rgba(0, 0, 0, 0.45);
  stroke-width: 0.6;
  cursor: pointer;
  transition: r 0.12s;
}
.fp-dot:hover { r: 6; }

.fp-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 2px 0;
  border-top: 1px solid var(--kp-border);
}
.fp-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--kp-fg-muted);
}
.fp-legend__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
</style>

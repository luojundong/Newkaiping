<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListTree, Save, RotateCcw, Gauge, ClipboardList, Fan, Lightbulb, Zap, Droplet, MoveVertical } from 'lucide-vue-next'
import { buildingApi, sceneApi } from '@/api'
import { SUBSYSTEMS } from '@/types/scene'
import type { Building, SubsystemCode } from '@/types/api'

// 图标映射（与 AppHeader 一致：lucide 单一图标源，P0-1 禁 emoji）
const ICONS: Record<string, unknown> = {
  regulation: Gauge,
  lifecycle: ClipboardList,
  hvac: Fan,
  lighting: Lightbulb,
  power: Zap,
  hotwater: Droplet,
  elevator: MoveVertical,
}

function defaultName(code: string) {
  return SUBSYSTEMS.find((s) => s.code === code)?.name || code
}

// 行数据：label=自定义名称（空=默认）；visible=是否在大屏显示
// 预初始化所有子系统行，避免表格首帧渲染时 rows[row.code] 为 undefined 崩溃（load 是异步的）
const rows = reactive<Record<string, { label: string; visible: boolean }>>(
  Object.fromEntries(SUBSYSTEMS.map((s) => [s.code, { label: '', visible: true }])),
)
const loading = ref(false)
const saving = ref(false)

// ---------- GK-20 ③：楼栋维度切换（默认「全局」——即改造前的语义） ----------
// scope = ''            → 全局模式：「在大屏显示」列 = 全局 subsystem_meta.visible，保存走 setSubsystemMeta
// scope = <buildingId>  → 楼栋模式：「在大屏显示」列 = 该楼 building_subsystem.enabled，保存走
//                          buildingApi.updateSubsystems；同时仍把「自定义名称」写回全局 meta，
//                          且 globalMeta 里的 visible 原值照发，绝不用楼栋值覆盖全局开关（关键不变式）。
const scope = ref('')
const buildings = ref<Building[]>([])
// 全局 meta 快照（楼栋模式下保存时用于回填 visible，保证不污染全局语义）
const globalMeta = ref<Record<string, { label?: string; visible?: boolean }>>({})
const scoped = computed(() => scope.value !== '')

async function loadBuildings() {
  try {
    const res = await buildingApi.list()
    buildings.value = res.items
  } catch {
    buildings.value = []
  }
}

// 拉取全局 meta（名称 + 全局可见开关），并写入 rows.label
async function loadGlobalMeta() {
  const meta = (await sceneApi.getSubsystemMeta()) || {}
  globalMeta.value = meta
  SUBSYSTEMS.forEach((s) => {
    rows[s.code].label = meta[s.code]?.label ?? ''
  })
}

// 按当前 scope 载入「在大屏显示」列
async function loadVisibility() {
  if (!scoped.value) {
    SUBSYSTEMS.forEach((s) => {
      rows[s.code].visible = globalMeta.value[s.code]?.visible !== false
    })
    return
  }
  try {
    const res = await buildingApi.subsystems(scope.value)
    const map: Record<string, boolean> = {}
    res.items.forEach((it) => (map[it.subsystem_code] = it.enabled))
    SUBSYSTEMS.forEach((s) => {
      rows[s.code].visible = map[s.code] !== false
    })
  } catch {
    SUBSYSTEMS.forEach((s) => (rows[s.code].visible = true))
  }
}

async function load() {
  loading.value = true
  try {
    await loadGlobalMeta()
  } catch {
    SUBSYSTEMS.forEach((s) => (rows[s.code] = { label: '', visible: true }))
    globalMeta.value = {}
  }
  try {
    await loadVisibility()
  } finally {
    loading.value = false
  }
  snapshot()
}

// 未保存改动检测（切换楼栋时提示，避免静默丢改动）
const savedSnapshot = ref('')
function snapshot() {
  savedSnapshot.value = JSON.stringify(rows)
}
const dirty = computed(() => JSON.stringify(rows) !== savedSnapshot.value)

async function onScopeChange(next: string) {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('当前修改尚未保存，切换范围将丢失修改，确认继续？', '未保存提示', {
        type: 'warning',
        confirmButtonText: '切换',
        cancelButtonText: '取消',
      })
    } catch {
      // 用户取消：下拉用 :model-value 绑定，显示值自动回弹到当前 scope，无需手动还原
      return
    }
  }
  scope.value = next
  await load()
}

async function save() {
  saving.value = true
  try {
    const payload: Record<string, { label?: string; visible?: boolean }> = {}
    SUBSYSTEMS.forEach((s) => {
      const r = rows[s.code]
      const item: { label?: string; visible?: boolean } = {}
      // 始终发送 label 与 visible 字段（后端对缺失字段保留旧值）：
      // - label 空串=清除回退默认名，避免「改回默认名保存」失效
      // - visible 必须显式发送：开关打开(visible:true)若省略，后端保留旧值(false)，导致「打开后仍关闭」
      const custom = r.label.trim()
      item.label = custom && custom !== defaultName(s.code) ? custom : ''
      // GK-20 ③：楼栋模式下 visible 列代表「本楼启用」，不能写进全局 meta；
      // 全局 visible 一律取 globalMeta 快照原值，确保切换范围不污染全局语义。
      item.visible = scoped.value ? globalMeta.value[s.code]?.visible !== false : r.visible
      payload[s.code] = item
    })
    await sceneApi.setSubsystemMeta(payload)
    if (scoped.value) {
      const items = SUBSYSTEMS.map((s) => ({
        subsystem_code: s.code as SubsystemCode,
        enabled: !!rows[s.code].visible,
      }))
      await buildingApi.updateSubsystems(scope.value, items)
    }
    ElMessage.success(scoped.value ? '该楼栋子系统启用状态已更新，大屏即时生效' : '子系统菜单已更新，大屏即时生效')
    // 回写快照前先重拉一次，确认后端确已落库（label / visible 以服务端为准）
    await loadGlobalMeta()
    snapshot()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function resetOne(code: string) {
  rows[code].label = ''
  rows[code].visible = true
}

onMounted(async () => {
  await loadBuildings()
  await load()
})
</script>

<template>
  <div class="admin-page sysmenu">
    <div class="admin-toolbar">
      <ListTree :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">子系统菜单</span>
      <span class="sysmenu__desc">
        {{ scoped ? '当前为「楼栋」范围：「在大屏显示」列 = 该楼启用的子系统' : '自定义大屏顶部菜单名称与显示开关，保存后大屏即时生效' }}
      </span>
      <div class="admin-toolbar__filters">
        <!-- GK-20 ③：楼栋维度切换器，默认「全局」（改造前的语义） -->
        <span class="sysmenu__scope-label">范围</span>
        <el-select
          data-testid="sysmenu-scope-select"
          class="sysmenu__scope-select"
          :model-value="scope"
          filterable
          size="small"
          placeholder="全局"
          @change="onScopeChange"
        >
          <el-option label="全局（默认）" value="" />
          <el-option
            v-for="b in buildings"
            :key="b.id"
            :label="`${b.name} (${b.floors}F / ${b.gross_area}㎡)`"
            :value="b.id"
          />
        </el-select>
        <button class="sysmenu__btn" @click="load"><RotateCcw :size="15" /> 刷新</button>
        <button class="sysmenu__btn sysmenu__btn--primary" :disabled="saving" @click="save">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <el-table :data="SUBSYSTEMS" v-loading="loading" class="admin-table sysmenu__table" height="100%">
      <el-table-column label="序号" width="64" class-name="seq-col" fixed>
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column label="系统" width="120">
        <template #default="{ row }">
          <span class="sysmenu__icon"><component :is="ICONS[row.code]" :size="16" /></span>
        </template>
      </el-table-column>
      <el-table-column label="系统标识" width="140">
        <template #default="{ row }"><code class="sysmenu__code">{{ row.code }}</code></template>
      </el-table-column>
      <el-table-column label="默认名称" width="140">
        <template #default="{ row }">
          <span :class="{ 'sysmenu__renamed': rows[row.code]?.label && rows[row.code].label !== defaultName(row.code) }">
            {{ defaultName(row.code) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="自定义名称" min-width="200">
        <template #default="{ row }">
          <el-input
            v-model="rows[row.code].label"
            size="small"
            :placeholder="`留空使用默认「${defaultName(row.code)}」`"
            class="sysmenu__input"
          />
        </template>
      </el-table-column>
      <el-table-column :label="scoped ? '本楼启用' : '在大屏显示'" width="130">
        <template #default="{ row }">
          <el-switch v-model="rows[row.code].visible" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <button class="sysmenu__link" @click="resetOne(row.code)">恢复默认</button>
        </template>
      </el-table-column>
    </el-table>

    <p class="sysmenu__hint">
      提示：{{ scoped
        ? '「本楼启用」仅影响选中该楼时大屏顶部菜单显示哪些子系统，不影响全局开关；切换范围会重新载入。'
        : '关闭的系统在大屏顶部菜单隐藏（数据仍保留）；改名后大屏页签、标题、面包屑即时使用新名称。'
      }}
      {{ scoped ? '' : '如需按楼栋配置，请在上方「范围」切换到具体楼栋。' }}
    </p>
  </div>
</template>

<style scoped>
.sysmenu { display: flex; flex-direction: column; height: 100%; gap: 12px; }
.sysmenu__desc { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.sysmenu__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--kp-border);
  background: transparent;
  color: var(--kp-fg);
  border-radius: var(--kp-radius-sm);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  transition: all var(--kp-motion-fast);
}
.sysmenu__btn:hover:not(:disabled) { border-color: var(--kp-border-strong); color: var(--kp-accent); }
.sysmenu__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sysmenu__btn--primary {
  background: linear-gradient(135deg, var(--kp-accent), var(--kp-accent-secondary));
  color: var(--kp-accent-on);
  border-color: transparent;
}
.sysmenu__btn--primary:hover:not(:disabled) { color: var(--kp-accent-on); box-shadow: 0 0 14px var(--kp-glow); }
/* GK-20 ③：楼栋维度切换器 */
.sysmenu__scope-label { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); margin-right: 6px; }
.sysmenu__scope-select { width: 268px; margin-right: 8px; }
.sysmenu__table { flex: 1; min-height: 0; }
.sysmenu__icon { display: inline-flex; color: var(--kp-accent); }
.sysmenu__code { font-family: var(--kp-font-mono); font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }
.sysmenu__renamed { color: var(--kp-warn); }
.sysmenu__input { max-width: 260px; }
.sysmenu__link {
  border: none;
  background: transparent;
  color: var(--kp-info);
  font-size: var(--kp-text-sm);
  cursor: pointer;
}
.sysmenu__link:hover { color: var(--kp-accent); }
.sysmenu__hint { font-size: var(--kp-text-xs); color: var(--kp-fg-subtle); margin: 0; }
</style>

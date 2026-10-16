<script setup lang="ts">
import { onMounted, ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sceneApi, buildingApi, deviceApi } from '@/api'
import { SUBSYSTEMS } from '@/types/scene'
import type { SceneMarker, MarkerSwitch, Building } from '@/types/api'
import MarkerEditor3D from '@/components/three/MarkerEditor3D.vue'
import { KP_ACCENT } from '@/lib/kp-accent'

// ---------- 数据 ----------
const buildings = ref<Building[]>([])
const markers = ref<SceneMarker[]>([])
const loading = ref(false)
const selectedBuilding = ref<string>('')
const selectedFloor = ref<number>(1)

// 标注开关
const markerSwitch = ref<MarkerSwitch>({ show_building_markers: true, show_device_points: true })
const switchLoading = ref(false)

// 楼栋锚点
const anchors = ref<Array<Record<string, any>>>([])

// 弹窗
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingMarker = reactive<Partial<SceneMarker>>({
  id: '',
  building_id: '',
  floor: 1,
  position: { x: 0, y: 0, z: 0 },
  marker_type: 'equipment',
  label: '',
  device_id: null,
  visible: true,
  color: '#00ccff',
  shape: 'point',
  area_points: [],
})
const pickedPosition = ref<{ x: number; y: number; z: number } | null>(null)

// 区域热点 UI 辅助字段（保存时组装进 link / params）
const linkType = ref<'none' | 'url' | 'internal'>('none')
const linkUrl = ref('')
const linkTarget = ref('')
const paramRows = ref<{ key: string; val: string }[]>([])

// 联动校验
const linkageDrawer = ref(false)
const linkageDevice = ref<any>(null)
const linkageLoading = ref(false)

// 楼栋选项
const buildingOptions = computed(() =>
  buildings.value.map((b) => ({ value: b.id, label: b.name, floors: b.floors })),
)

// 楼层选项
const floorOptions = computed(() => {
  const b = buildings.value.find((x) => x.id === editingMarker.building_id)
  const maxFloors = b?.floors || 10
  return Array.from({ length: maxFloors }, (_, i) => ({ value: i + 1, label: `${i + 1} 层` }))
})

// 当前编辑楼栋的锚点 Y
const editingAnchorY = computed(() => {
  const a = anchors.value.find((x) => x.building_id === editingMarker.building_id)
  return a?.position?.y ?? 0
})

// 跳转目标选项（楼栋 + 子系统）
const subsystemOptions = computed(() => SUBSYSTEMS.map((s) => ({ value: s.code, label: s.name })))

// 过滤后的标记
const filteredMarkers = computed(() => {
  let list = markers.value
  if (selectedBuilding.value) {
    list = list.filter((m) => m.building_id === selectedBuilding.value)
  }
  return list
})

// ---------- 加载 ----------
async function loadBuildings() {
  try {
    const res = await buildingApi.list()
    buildings.value = res.items
  } catch {
    buildings.value = []
  }
}

async function loadMarkers() {
  loading.value = true
  try {
    markers.value = await sceneApi.markers(selectedBuilding.value || undefined)
  } catch {
    markers.value = []
  } finally {
    loading.value = false
  }
}

async function loadConfig() {
  try {
    const cfg = await sceneApi.config()
    if (cfg?.building_anchors) anchors.value = cfg.building_anchors
    if (cfg?.marker_switch) markerSwitch.value = cfg.marker_switch
  } catch { /* ignore */ }
}

async function loadSwitch() {
  try {
    const sw = await sceneApi.getMarkerSwitch()
    if (sw) markerSwitch.value = sw
  } catch { /* ignore */ }
}

// ---------- 标注开关 ----------
async function onSwitchChange() {
  switchLoading.value = true
  try {
    await sceneApi.setMarkerSwitch(markerSwitch.value)
    ElMessage.success('标注开关已更新')
  } catch {
    ElMessage.error('开关更新失败')
  } finally {
    switchLoading.value = false
  }
}

// ---------- CRUD ----------
function openCreate() {
  dialogMode.value = 'create'
  editingMarker.id = ''
  editingMarker.building_id = selectedBuilding.value || buildings.value[0]?.id || ''
  editingMarker.floor = selectedFloor.value
  editingMarker.position = { x: 0, y: 0, z: 0 }
  editingMarker.marker_type = 'equipment'
  editingMarker.label = ''
  editingMarker.device_id = null
  editingMarker.visible = true
  editingMarker.color = '#00ccff'
  editingMarker.shape = 'point'
  editingMarker.area_points = []
  editingMarker.link = null
  editingMarker.params = undefined
  linkType.value = 'none'
  linkUrl.value = ''
  linkTarget.value = ''
  paramRows.value = []
  pickedPosition.value = null
  dialogVisible.value = true
}

function openEdit(row: SceneMarker) {
  dialogMode.value = 'edit'
  Object.assign(editingMarker, row)
  pickedPosition.value = { ...row.position }
  // 区域热点辅助字段回显
  editingMarker.shape = row.shape || 'point'
  editingMarker.area_points = row.area_points ? row.area_points.map((p) => ({ ...p })) : []
  if (row.link?.type === 'url') {
    linkType.value = 'url'
    linkUrl.value = row.link.url || ''
    linkTarget.value = ''
  } else if (row.link?.type === 'internal') {
    linkType.value = 'internal'
    linkTarget.value = row.link.target || ''
    linkUrl.value = ''
  } else {
    linkType.value = 'none'
    linkUrl.value = ''
    linkTarget.value = ''
  }
  paramRows.value = row.params ? Object.entries(row.params).map(([k, v]) => ({ key: k, val: v })) : []
  dialogVisible.value = true
}

async function saveMarker() {
  if (!editingMarker.building_id) {
    ElMessage.warning('请选择楼栋')
    return
  }
  if (!editingMarker.label) {
    ElMessage.warning('请输入标记名称')
    return
  }
  if (editingMarker.shape === 'area' && (!editingMarker.area_points || editingMarker.area_points.length < 3)) {
    ElMessage.warning('区域形态至少需要描 3 个顶点')
    return
  }
  // 如果有 3D 编辑器选点，使用选点坐标（点形态）
  if (pickedPosition.value && editingMarker.shape !== 'area') {
    editingMarker.position = { ...pickedPosition.value }
  }
  // 组装跳转链接
  if (linkType.value === 'url') {
    editingMarker.link = { type: 'url', url: linkUrl.value.trim() || undefined }
  } else if (linkType.value === 'internal') {
    editingMarker.link = { type: 'internal', target: linkTarget.value || undefined }
  } else {
    editingMarker.link = null
  }
  // 组装自定义参数
  const params: Record<string, string> = {}
  paramRows.value.forEach((r) => {
    const k = r.key.trim()
    if (k) params[k] = r.val
  })
  editingMarker.params = Object.keys(params).length ? params : undefined
  try {
    const payload = { ...editingMarker }
    if (dialogMode.value === 'create') {
      await sceneApi.createMarker(payload)
      ElMessage.success('标记已创建')
    } else {
      await sceneApi.updateMarker(editingMarker.id!, payload)
      ElMessage.success('标记已更新')
    }
    dialogVisible.value = false
    await loadMarkers()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  }
}

async function deleteMarker(row: SceneMarker) {
  try {
    await ElMessageBox.confirm(`确定删除标记「${row.label}」吗？`, '提示', { type: 'warning' })
    await sceneApi.deleteMarker(row.id)
    ElMessage.success('标记已删除')
    await loadMarkers()
  } catch { /* cancel */ }
}

function onPick(pos: { x: number; y: number; z: number }) {
  pickedPosition.value = pos
}
function onAreaPick(points: { x: number; y: number; z: number }[]) {
  editingMarker.area_points = points.map((p) => ({ ...p }))
}
function clearAreaPick() {
  editingMarker.area_points = []
}
function addParam() {
  paramRows.value.push({ key: '', val: '' })
}
function removeParam(idx: number) {
  paramRows.value.splice(idx, 1)
}

// ---------- 插入示例区域热点（供直接点测） ----------
async function seedDemoArea() {
  if (!buildings.value.length) await loadBuildings()
  const b = buildings.value[0]
  if (!b) {
    ElMessage.warning('请先加载楼栋')
    return
  }
  const demo = {
    label: '示例区域热点（点击测试）',
    building_id: b.id,
    building: b.name,
    floor: 1,
    marker_type: 'area',
    shape: 'area',
    position: { x: 0, y: 2, z: 10 },
    area_points: [
      { x: -60, y: 2, z: -20 },
      { x: 60, y: 2, z: -20 },
      { x: 60, y: 2, z: 40 },
      { x: -60, y: 2, z: 40 },
    ],
    link: { type: 'url', url: 'https://example.com' },
    params: { 示例: '区域热点', 用途: '点击测试颜色变化与跳转' },
    visible: true,
    color: KP_ACCENT,
  }
  try {
    await sceneApi.createMarker(demo as any)
    ElMessage.success('已插入示例区域热点，可到大屏/3D 视图点击测试')
    await loadMarkers()
  } catch (e: any) {
    ElMessage.error(e?.message || '插入失败')
  }
}

// ---------- 联动校验 ----------
async function checkLinkage(row: SceneMarker) {
  if (!row.device_id) {
    ElMessage.info('该标记未绑定设备')
    return
  }
  linkageDrawer.value = true
  linkageLoading.value = true
  linkageDevice.value = null
  try {
    const res = await deviceApi.list({ page: 1, limit: 1, building_id: row.building_id })
    const dev = res.items.find((d) => d.id === row.device_id)
    linkageDevice.value = dev || { id: row.device_id, name: '设备未找到', status: 'unknown' }
  } catch {
    linkageDevice.value = { id: row.device_id, name: '查询失败', status: 'unknown' }
  } finally {
    linkageLoading.value = false
  }
}

// ---------- 楼栋名 ----------
function buildingName(id: string) {
  return buildings.value.find((b) => b.id === id)?.name || id
}

// ---------- 模型 URL ----------
const modelUrl = ref('/models/hospital.glb')

onMounted(async () => {
  await Promise.all([loadBuildings(), loadConfig()])
  try {
    const cfg = await sceneApi.config()
    if (cfg?.model_url) modelUrl.value = cfg.model_url
  } catch { /* ignore */ }
  await loadMarkers()
})
</script>

<template>
  <div class="admin-page marker-admin">
    <!-- 工具栏 -->
    <div class="admin-toolbar">
      <div class="toolbar-left">
        <el-select v-model="selectedBuilding" placeholder="全部楼栋" clearable style="width: 180px" @change="loadMarkers">
          <el-option v-for="b in buildingOptions" :key="b.value" :label="b.label" :value="b.value" />
        </el-select>
        <el-button type="primary" @click="openCreate">新增标记</el-button>
        <el-button @click="seedDemoArea">插入示例区域</el-button>
      </div>
      <div class="toolbar-right">
        <div class="switch-group">
          <span class="switch-label">楼栋立柱</span>
          <el-switch v-model="markerSwitch.show_building_markers" :loading="switchLoading" @change="onSwitchChange" />
        </div>
        <div class="switch-group">
          <span class="switch-label">设备点位</span>
          <el-switch v-model="markerSwitch.show_device_points" :loading="switchLoading" @change="onSwitchChange" />
        </div>
      </div>
    </div>

    <!-- 标记列表 -->
    <el-table :data="filteredMarkers" v-loading="loading" class="admin-table" height="100%">
      <el-table-column label="序号" width="64" class-name="seq-col" fixed>
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="label" label="标记名称" min-width="160" />
      <el-table-column label="所属楼栋" width="140">
        <template #default="{ row }">{{ buildingName(row.building_id) }}</template>
      </el-table-column>
      <el-table-column prop="floor" label="楼层" width="80" />
      <el-table-column prop="marker_type" label="类型" width="120" />
      <el-table-column label="形态" width="80">
        <template #default="{ row }">{{ row.shape === 'area' ? '区域' : '点' }}</template>
      </el-table-column>
      <el-table-column label="绑定设备" width="160">
        <template #default="{ row }">
          <span v-if="row.device_id" class="device-link" @click="checkLinkage(row)">{{ row.device_id }}</span>
          <span v-else class="muted">未绑定</span>
        </template>
      </el-table-column>
      <el-table-column label="颜色" width="80">
        <template #default="{ row }">
          <span class="color-dot" :style="{ background: row.color }" />
        </template>
      </el-table-column>
      <el-table-column prop="visible" label="可见" width="70">
        <template #default="{ row }">
          <el-tag :type="row.visible ? 'success' : 'info'" size="small">{{ row.visible ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="坐标" width="200">
        <template #default="{ row }">
          <span class="coord">X:{{ row.position.x.toFixed(1) }} Y:{{ row.position.y.toFixed(1) }} Z:{{ row.position.z.toFixed(1) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text type="danger" @click="deleteMarker(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增标记' : '编辑标记'"
      width="900px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="标记名称">
              <el-input v-model="editingMarker.label" placeholder="如：1号冷冻机组" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="标记类型">
              <el-input v-model="editingMarker.marker_type" placeholder="如：equipment / subsystem" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="标记形态">
              <el-select v-model="editingMarker.shape" style="width: 100%">
                <el-option label="点（单点）" value="point" />
                <el-option label="区域（多边形描边）" value="area" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属楼栋">
              <el-select v-model="editingMarker.building_id" placeholder="选择楼栋" style="width: 100%">
                <el-option v-for="b in buildingOptions" :key="b.value" :label="b.label" :value="b.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="楼层">
              <el-select v-model="editingMarker.floor" placeholder="选择楼层" style="width: 100%">
                <el-option v-for="f in floorOptions" :key="f.value" :label="f.label" :value="f.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="绑定设备">
              <el-input v-model="editingMarker.device_id" placeholder="设备 ID（可选）" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="颜色">
              <el-color-picker v-model="editingMarker.color" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="可见">
              <el-switch v-model="editingMarker.visible" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="3D 选点">
          <div style="width: 100%">
            <template v-if="editingMarker.shape !== 'area'">
              <p class="pick-hint">在下方 3D 预览中点击模型表面选点，或手动填写坐标：</p>
              <MarkerEditor3D
                v-if="dialogVisible && editingMarker.building_id"
                :model-url="modelUrl"
                :markers="markers.filter((m) => m.building_id === editingMarker.building_id)"
                :selected-floor="editingMarker.floor || 1"
                :building-anchor-y="editingAnchorY"
                @pick="onPick"
              />
              <el-row :gutter="8" style="margin-top: 8px">
                <el-col :span="8">
                  <el-input v-model.number="editingMarker.position!.x" size="small">
                    <template #prepend>X</template>
                  </el-input>
                </el-col>
                <el-col :span="8">
                  <el-input v-model.number="editingMarker.position!.y" size="small">
                    <template #prepend>Y</template>
                  </el-input>
                </el-col>
                <el-col :span="8">
                  <el-input v-model.number="editingMarker.position!.z" size="small">
                    <template #prepend>Z</template>
                  </el-input>
                </el-col>
              </el-row>
            </template>
            <template v-else>
              <p class="pick-hint">点击模型表面依次描点（≥3 点），再点编辑器内「完成描边」生成区域：</p>
              <MarkerEditor3D
                v-if="dialogVisible && editingMarker.building_id"
                :model-url="modelUrl"
                :markers="markers.filter((m) => m.building_id === editingMarker.building_id)"
                :selected-floor="editingMarker.floor || 1"
                :building-anchor-y="editingAnchorY"
                shape="area"
                :area-points="editingMarker.area_points"
                @area="onAreaPick"
              />
              <div class="area-summary">
                已描顶点：<b>{{ (editingMarker.area_points || []).length }}</b>
                <el-button size="small" text type="danger" @click="clearAreaPick">清除重画</el-button>
              </div>
            </template>
          </div>
        </el-form-item>

        <!-- 跳转配置 -->
        <el-form-item label="跳转类型">
          <el-select v-model="linkType" style="width: 100%">
            <el-option label="不跳转" value="none" />
            <el-option label="外部链接（新标签）" value="url" />
            <el-option label="内部跳转（楼栋/子系统）" value="internal" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="linkType === 'url'" label="链接地址">
          <el-input v-model="linkUrl" placeholder="https://..." />
        </el-form-item>
        <el-form-item v-if="linkType === 'internal'" label="跳转目标">
          <el-select v-model="linkTarget" style="width: 100%" placeholder="选择楼栋或子系统">
            <el-option v-for="b in buildingOptions" :key="b.value" :label="`楼栋：${b.label}`" :value="b.value" />
            <el-option v-for="s in subsystemOptions" :key="s.value" :label="`子系统：${s.label}`" :value="s.value" />
          </el-select>
        </el-form-item>

        <!-- 自定义参数 -->
        <el-form-item label="自定义参数">
          <div class="params-editor">
            <div v-for="(row, idx) in paramRows" :key="idx" class="param-row">
              <el-input v-model="row.key" size="small" placeholder="参数名" />
              <el-input v-model="row.val" size="small" placeholder="参数值" />
              <el-button size="small" text type="danger" @click="removeParam(idx)">删</el-button>
            </div>
            <el-button size="small" @click="addParam">+ 添加参数</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMarker">保存</el-button>
      </template>
    </el-dialog>

    <!-- 联动校验抽屉 -->
    <el-drawer v-model="linkageDrawer" title="设备联动校验" size="400px">
      <div v-loading="linkageLoading">
        <div v-if="linkageDevice" class="linkage-info">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="设备 ID">{{ linkageDevice.id }}</el-descriptions-item>
            <el-descriptions-item label="设备名称">{{ linkageDevice.name }}</el-descriptions-item>
            <el-descriptions-item label="所属楼栋">{{ buildingName(linkageDevice.building_id) }}</el-descriptions-item>
            <el-descriptions-item label="设备状态">
              <el-tag :type="linkageDevice.status === 'running' ? 'success' : linkageDevice.status === 'fault' ? 'danger' : 'info'" size="small">
                {{ linkageDevice.status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="设备类型">{{ linkageDevice.category_id }}</el-descriptions-item>
            <el-descriptions-item label="安装位置">{{ linkageDevice.location?.room || '-' }}</el-descriptions-item>
          </el-descriptions>
          <p class="linkage-tip">
            该设备已绑定到标记，大屏点击对应彩球时将打开此设备详情。<br />
            请确认设备信息正确，以确保数据联动有效。
          </p>
        </div>
        <div v-else-if="!linkageLoading" class="empty-tip">未找到设备信息</div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.marker-admin {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.toolbar-right {
  display: flex;
  gap: 20px;
  align-items: center;
}
.switch-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.switch-label {
  font-size: 13px;
  color: var(--kp-fg-muted, #94a3b8);
}
.device-link {
  color: var(--kp-accent);
  cursor: pointer;
  text-decoration: underline;
}
.device-link:hover {
  opacity: 0.8;
}
.muted {
  color: var(--kp-fg-muted, #64748b);
  font-size: 12px;
}
.color-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.coord {
  font-size: 11px;
  font-family: monospace;
  color: var(--kp-fg-muted, #94a3b8);
}
.pick-hint {
  font-size: 12px;
  color: var(--kp-fg-muted, #94a3b8);
  margin: 0 0 8px 0;
}
.linkage-info {
  padding: 0 4px;
}
.linkage-tip {
  margin-top: 16px;
  font-size: 12px;
  color: var(--kp-fg-muted, #94a3b8);
  line-height: 1.6;
}
.empty-tip {
  text-align: center;
  padding: 40px;
  color: var(--kp-fg-muted, #64748b);
}
.area-summary {
  margin-top: 8px;
  font-size: 12px;
  color: var(--kp-fg-muted, #94a3b8);
  display: flex;
  align-items: center;
  gap: 10px;
}
.area-summary b {
  color: #33ff99;
}
.params-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.param-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.param-row .el-input {
  flex: 1;
}
</style>

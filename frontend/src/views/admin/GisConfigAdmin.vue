<script setup lang="ts">
// Phase 2：地图底图配置（合规底图 Key 由后端代理，前端不暴露）。
// 中国区域仅允许天地图 / 腾讯 / 高德 / 百度（GCJ-02）。Key 保存在后端，
// 大屏经 GET /api/v1/gis/tile-proxy 拉取瓦片，前端绝不接触原始 key。
import { ref, reactive, onMounted } from 'vue'
import { Save, RotateCcw, Map as MapIcon, ShieldCheck } from 'lucide-vue-next'
import { ElMessage, ElRadioGroup, ElRadioButton, ElSwitch } from 'element-plus'
import { useSceneStore } from '@/stores/scene'
import { DEFAULT_GIS_CONFIG, type GisConfig, type GisProvider } from '@/types/api'

const scene = useSceneStore()
const saving = ref(false)
const loading = ref(false)

const form = reactive<GisConfig>({
  provider: '',
  tiandituKey: '',
  tencentKey: '',
  gaodeKey: '',
  baiduKey: '',
  baseLayer: 'vec',
  showLabel: true,
  center: { lng: 112.698, lat: 22.368, zoom: 16 },
})

const PROVIDERS: { value: GisProvider; name: string; desc: string }[] = [
  { value: 'tianditu', name: '天地图', desc: '国家地理信息公共服务平台，政府/医院项目首选，合规最稳' },
  { value: 'tencent', name: '腾讯地图', desc: 'GCJ-02，适合与微信生态联动' },
  { value: 'gaode', name: '高德地图', desc: 'GCJ-02，路网/POI 数据丰富' },
  { value: 'baidu', name: '百度地图', desc: 'BD-09 坐标系，瓦片代理暂未开放（仅存 Key）' },
]

async function load() {
  loading.value = true
  try {
    const { gisConfigApi } = await import('@/api')
    const gc = await gisConfigApi.get()
    form.provider = gc.provider
    form.tiandituKey = gc.tiandituKey
    form.tencentKey = gc.tencentKey
    form.gaodeKey = gc.gaodeKey
    form.baiduKey = gc.baiduKey
    form.baseLayer = gc.baseLayer
    form.showLabel = gc.showLabel !== false
    form.center = { ...gc.center }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await scene.saveGisConfig({
      provider: form.provider,
      tiandituKey: form.tiandituKey,
      tencentKey: form.tencentKey,
      gaodeKey: form.gaodeKey,
      baiduKey: form.baiduKey,
      baseLayer: form.baseLayer,
      showLabel: form.showLabel,
      center: { ...form.center },
    })
    ElMessage.success('底图配置已保存（Key 仅存于后端，前端不暴露）')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function reset() {
  form.provider = DEFAULT_GIS_CONFIG.provider
  form.tiandituKey = ''
  form.tencentKey = ''
  form.gaodeKey = ''
  form.baiduKey = ''
  form.baseLayer = DEFAULT_GIS_CONFIG.baseLayer
  form.showLabel = DEFAULT_GIS_CONFIG.showLabel
  form.center = { ...DEFAULT_GIS_CONFIG.center }
}

onMounted(load)
</script>

<template>
  <div class="admin-page giscfg">
    <div class="admin-toolbar">
      <MapIcon :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">地图底图配置</span>
      <span class="giscfg__desc">合规底图 Key 由后端代理，前端不暴露；选中服务商并填写 Key 后大屏底图即可加载</span>
      <div class="admin-toolbar__filters">
        <button class="giscfg__btn" @click="load" :disabled="loading">
          <RotateCcw :size="15" /> 刷新
        </button>
        <button class="giscfg__btn giscfg__btn--primary" @click="save" :disabled="saving">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <section class="kp-panel giscfg__panel" v-loading="loading">
      <span class="kp-corner kp-corner--tl" /><span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" /><span class="kp-corner kp-corner--br" />

      <div class="giscfg__notice">
        <ShieldCheck :size="15" />
        <span>合规要求：中国区域底图仅限天地图 / 腾讯 / 高德 / 百度（GCJ-02）。Key 一律保存在后端，前端经瓦片代理 <code>/api/v1/gis/tile-proxy</code> 拉取，原始 Key 不会下发到浏览器。</span>
      </div>

      <div class="giscfg__field">
        <label class="giscfg__label"><span class="giscfg__required">*</span> 底图服务商</label>
        <ElRadioGroup v-model="form.provider" class="giscfg__radio">
          <ElRadioButton v-for="p in PROVIDERS" :key="p.value" :value="p.value">
            {{ p.name }}
          </ElRadioButton>
        </ElRadioGroup>
        <p class="giscfg__hint">{{ PROVIDERS.find((p) => p.value === form.provider)?.desc || '请选择合规底图服务商（政府/医院项目推荐天地图）' }}</p>
      </div>

      <div class="giscfg__keys">
        <div class="giscfg__field" v-for="p in PROVIDERS" :key="p.value">
          <label class="giscfg__label">
            {{ p.name }} Key
            <span class="giscfg__keystate" :class="form[p.value + 'Key' as 'tiandituKey'] ? 'is-set' : 'is-empty'">
              {{ (form as any)[p.value + 'Key'] ? '已填写' : '待填写' }}
            </span>
          </label>
          <input
            v-model="(form as any)[p.value + 'Key']"
            class="giscfg__input"
            type="password"
            autocomplete="new-password"
            :placeholder="p.value === 'baidu' ? '百度 Key（瓦片代理暂未开放）' : '粘贴 ' + p.name + ' 开放平台 Key，后续由您填写'"
          />
        </div>
      </div>

      <div class="giscfg__field">
        <label class="giscfg__label">底图类型</label>
        <ElRadioGroup v-model="form.baseLayer" class="giscfg__radio">
          <ElRadioButton value="vec">矢量底图</ElRadioButton>
          <ElRadioButton value="img">影像底图</ElRadioButton>
          <ElRadioButton value="ter">地形底图</ElRadioButton>
        </ElRadioGroup>
      </div>

      <div class="giscfg__field">
        <label class="giscfg__label">叠加注记层（路名 / 地名）</label>
        <div class="giscfg__switches">
          <label class="giscfg__switch">
            <span class="giscfg__switch-label">显示注记</span>
            <ElSwitch v-model="form.showLabel" />
          </label>
        </div>
        <p class="giscfg__hint">关闭后仅显示纯底图，无路名/地名标注（如叠加自有业务图层时可用）</p>
      </div>

      <div class="giscfg__field">
        <label class="giscfg__label">默认视角（GCJ-02，开平市中心医院）</label>
        <div class="giscfg__coords">
          <label class="giscfg__coord">
            <span>经度</span>
            <input v-model.number="form.center.lng" class="giscfg__input" type="number" step="0.0001" />
          </label>
          <label class="giscfg__coord">
            <span>纬度</span>
            <input v-model.number="form.center.lat" class="giscfg__input" type="number" step="0.0001" />
          </label>
          <label class="giscfg__coord">
            <span>缩放</span>
            <input v-model.number="form.center.zoom" class="giscfg__input" type="number" step="1" min="3" max="22" />
          </label>
        </div>
        <p class="giscfg__hint">中心点坐标与大屏底图初始视角一致；留空使用默认值（112.698, 22.368, z16）</p>
      </div>

      <div class="giscfg__actions">
        <button class="giscfg__btn" @click="reset">恢复默认</button>
        <button class="giscfg__btn giscfg__btn--primary" @click="save" :disabled="saving">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.giscfg__desc { color: var(--kp-fg-muted); margin-left: 10px; font-size: 13px; }
.giscfg__btn {
  height: 30px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid var(--kp-border); color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-sm); cursor: pointer; font-size: 12px;
}
.giscfg__btn:hover:not(:disabled) { color: var(--kp-fg); border-color: var(--kp-border-strong); }
.giscfg__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.giscfg__btn--primary { background: var(--kp-accent-soft); border-color: var(--kp-accent); color: var(--kp-accent); }
.giscfg__panel { max-width: 920px; padding: 20px 24px; }
.giscfg__notice {
  display: flex; gap: 8px; align-items: flex-start; margin-bottom: 18px; padding: 10px 14px;
  background: rgba(var(--kp-accent-rgb), 0.06); border: 1px solid var(--kp-accent-soft);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg-muted); font-size: 12px; line-height: 1.6;
}
.giscfg__notice :deep(svg) { color: var(--kp-accent); flex-shrink: 0; margin-top: 2px; }
.giscfg__notice code { padding: 1px 5px; background: rgba(255,255,255,0.08); border-radius: 3px; font-size: 11px; }
.giscfg__field { margin-bottom: 18px; }
.giscfg__label { display: block; font-size: 13px; color: var(--kp-fg); margin-bottom: 6px; font-weight: 500; }
.giscfg__required { color: #ff6b6b; margin-right: 2px; }
.giscfg__radio { display: flex; flex-wrap: wrap; }
.giscfg__keys { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
.giscfg__keystate { font-size: 11px; margin-left: 6px; padding: 1px 7px; border-radius: 10px; }
.giscfg__keystate.is-set { background: rgba(46, 204, 113, 0.15); color: #2ecc71; }
.giscfg__keystate.is-empty { background: rgba(255,255,255,0.06); color: var(--kp-fg-muted); }
.giscfg__input {
  width: 100%; height: 34px; padding: 0 10px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg); font-size: 13px;
  outline: none; transition: border-color var(--kp-motion-fast);
}
.giscfg__input:focus { border-color: var(--kp-accent); }
.giscfg__hint { margin-top: 4px; font-size: 11px; color: var(--kp-fg-muted); }
.giscfg__hint code { padding: 1px 5px; background: rgba(255,255,255,0.06); border-radius: 3px; font-size: 11px; }
.giscfg__switches { display: flex; gap: 22px; margin-top: 4px; }
.giscfg__switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
.giscfg__switch-label { font-size: 13px; color: var(--kp-fg); font-weight: 500; }
.giscfg__switch :deep(.el-switch.is-checked) { --el-switch-on-color: var(--kp-accent); }
.giscfg__coords { display: flex; gap: 14px; }
.giscfg__coord { flex: 1; }
.giscfg__coord span { display: block; font-size: 11px; color: var(--kp-fg-muted); margin-bottom: 4px; }
.giscfg__actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--kp-border); }
</style>

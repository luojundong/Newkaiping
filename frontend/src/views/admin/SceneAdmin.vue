<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, UploadCloud, Type } from 'lucide-vue-next'
import { sceneApi, sceneModelApi } from '@/api'
import type { SceneConfig } from '@/types/api'
import { useSceneStore } from '@/stores/scene'

const sceneStore = useSceneStore()
const currentUrl = ref<string>('')
const currentType = ref<string>('3d')
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const loadingHint = ref<string>('')
const savingHint = ref(false)

// 场景模型类型选项（影响文件格式校验与上传 type 参数）
const MODEL_TYPES = [
  { key: '3d', name: '3D 模型', exts: ['.glb', '.gltf'], accept: '.glb,.gltf', hint: '支持 .glb / .gltf 三维模型' },
  { key: 'video', name: '视频', exts: ['.mp4', '.webm'], accept: '.mp4,.webm', hint: '支持 .mp4 / .webm 视频，将作为大屏背景循环播放' },
  { key: 'image', name: '图片', exts: ['.png', '.jpg', '.jpeg', '.webp'], accept: '.png,.jpg,.jpeg,.webp', hint: '支持 .png / .jpg / .jpeg / .webp 图片，将铺底作为大屏背景' },
  { key: 'panorama', name: '360 全景图', exts: ['.png', '.jpg', '.jpeg', '.webp'], accept: '.png,.jpg,.jpeg,.webp', hint: '等距 360 全景大图，将包裹成沉浸式全景场景' },
] as const
const activeType = ref<(typeof MODEL_TYPES)[number]['key']>('3d')
const activeTypeMeta = computed(() => MODEL_TYPES.find((m) => m.key === activeType.value)!)

const TYPE_LABEL: Record<string, string> = {
  '3d': '3D 模型',
  video: '视频',
  image: '图片',
  panorama: '360 全景图',
}

async function loadConfig() {
  try {
    const cfg = (await sceneApi.config()) as SceneConfig
    currentUrl.value = cfg.model_url || ''
    currentType.value = cfg.model_type || '3d'
  } catch {
    currentUrl.value = ''
    currentType.value = '3d'
  }
  try {
    const r = await sceneApi.getModelLoadingHint()
    loadingHint.value = (r && r.hint) || ''
  } catch {
    loadingHint.value = ''
  }
}

function pickFile() {
  // 切换类型时重置 input 的 accept，确保文件选择器只显示对应格式
  if (fileInput.value) fileInput.value.accept = activeTypeMeta.value.accept
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const lower = file.name.toLowerCase()
  const ok = activeTypeMeta.value.exts.some((ext: string) => lower.endsWith(ext))
  if (!ok) {
    ElMessage.warning(`当前类型「${activeTypeMeta.value.name}」仅支持 ${activeTypeMeta.value.exts.join(' / ')} 格式`)
    target.value = ''
    return
  }
  selectedFile.value = file
}

async function upload() {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  uploading.value = true
  try {
    const res = (await sceneModelApi.upload(selectedFile.value, activeType.value)) as {
      model_url: string
      model_type: string
    }
    currentUrl.value = res.model_url
    currentType.value = res.model_type || activeType.value
    sceneStore.updateModelUrl(res.model_url, (res.model_type as SceneConfig['model_type']) || activeType.value)
    ElMessage.success(`场景${TYPE_LABEL[activeType.value] || '模型'}上传成功，已更新`)
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
  } catch (e) {
    ElMessage.error((e as Error).message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function saveLoadingHint() {
  const text = (loadingHint.value || '').trim()
  if (text === (sceneStore.modelLoadingHint || '').trim()) {
    ElMessage.info('提示文案无变化')
    return
  }
  savingHint.value = true
  try {
    let reason: string | undefined
    if (text) {
      try {
        const { value } = await ElMessageBox.prompt('请输入本次修改原因（关键文案建议留痕）', '保存加载提示', {
          inputPlaceholder: '如：更换为通用文案',
          confirmButtonText: '保存',
          cancelButtonText: '取消',
        })
        reason = (value || '').trim() || undefined
      } catch {
        return // 用户取消
      }
    }
    const r = await sceneApi.setModelLoadingHint(text, reason)
    sceneStore.modelLoadingHint = r.hint
    loadingHint.value = r.hint
    ElMessage.success(text ? '加载提示已更新，大屏即将生效' : '已恢复默认文案「模型加载中…」')
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    savingHint.value = false
  }
}

function resetHint() {
  loadingHint.value = ''
}

onMounted(loadConfig)
</script>

<template>
  <div class="admin-page">
    <div class="admin-toolbar">
      <Box :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">场景模型上传</span>
    </div>

    <section class="scene-card kp-panel">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <div class="scene-card__body">
        <div class="scene-card__icon"><UploadCloud :size="30" /></div>
        <h3>上传场景模型</h3>

        <div class="scene-card__types">
          <button
            v-for="m in MODEL_TYPES"
            :key="m.key"
            class="scene-type"
            :class="{ active: activeType === m.key }"
            @click="activeType = m.key"
          >
            {{ m.name }}
          </button>
        </div>
        <p class="scene-card__hint">
          {{ activeTypeMeta.hint }}。上传后将覆盖当前场景模型并更新 <code>scene_config.model_url</code> / <code>model_type</code>，
          由后端静态托管 <code>/uploads</code>。大文件（数十 MB）上传可能耗时数秒，请耐心等待。
        </p>

        <input ref="fileInput" type="file" accept=".glb,.gltf" hidden @change="onFileChange" />
        <div class="scene-card__actions">
          <el-button :icon="UploadCloud" @click="pickFile">选择文件</el-button>
          <el-button type="primary" :icon="UploadCloud" :loading="uploading" :disabled="!selectedFile" @click="upload">
            上传
          </el-button>
        </div>
        <div v-if="selectedFile" class="scene-card__file">
          已选择：<code>{{ selectedFile.name }}</code> ({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MB)
        </div>
      </div>

      <div class="scene-card__current">
        <span class="scene-card__label">当前场景模型</span>
        <code class="scene-card__url">{{ currentUrl || '（未配置）' }}</code>
        <span class="scene-card__type-badge" :data-type="currentType">类型：{{ TYPE_LABEL[currentType] || currentType }}</span>
      </div>
    </section>

    <section class="scene-card kp-panel scene-card--hint">
      <span class="kp-corner kp-corner--tl" />
      <span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" />
      <span class="kp-corner kp-corner--br" />
      <div class="scene-card__body scene-card__body--left">
        <div class="scene-card__icon"><Type :size="26" /></div>
        <div class="scene-card__hint-text">
          <h3>大屏模型加载提示</h3>
          <p class="scene-card__hint">
            自定义大屏 3D 模型加载遮罩显示的提示文案（默认「模型加载中…」）。
            留空保存将恢复默认；保存后大屏下次加载模型即时生效，并写入审查追踪。
          </p>
        </div>
        <div class="scene-card__hint-form">
          <el-input
            v-model="loadingHint"
            placeholder="模型加载中…"
            clearable
            maxlength="40"
            show-word-limit
            style="width: 320px"
          />
          <div class="scene-card__actions">
            <el-button @click="resetHint">恢复默认</el-button>
            <el-button type="primary" :loading="savingHint" @click="saveLoadingHint">保存</el-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.scene-card { position: relative; border-radius: var(--kp-radius-md); padding: 26px; }
.scene-card--hint { margin-top: 18px; }
.scene-card__body--left { flex-direction: row; align-items: flex-start; text-align: left; gap: 18px; }
.scene-card__hint-text { flex: 1; }
.scene-card__hint-text h3 { margin: 0 0 6px; font-size: var(--kp-text-lg); color: var(--kp-fg); letter-spacing: var(--kp-tracking-label); }
.scene-card__hint-form { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
.scene-card__body { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
.scene-card__icon { color: var(--kp-accent); filter: drop-shadow(0 0 10px var(--kp-glow)); }
.scene-card__body h3 { margin: 0; font-size: var(--kp-text-xl); color: var(--kp-fg); letter-spacing: var(--kp-tracking-label); }
.scene-card__hint { margin: 0; font-size: var(--kp-text-sm); color: var(--kp-fg-muted); line-height: 1.7; max-width: 520px; }
.scene-card__hint code, .scene-card__file code, .scene-card__url { color: var(--kp-accent); font-family: var(--kp-font-mono); font-size: var(--kp-text-sm); }
.scene-card__actions { display: flex; gap: 12px; margin-top: 6px; }
.scene-card__file { font-size: var(--kp-text-sm); color: var(--kp-fg); }
.scene-card__current { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--kp-border); display: flex; flex-direction: column; gap: 6px; }
.scene-card__label { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); letter-spacing: var(--kp-tracking-label); }
.scene-card__url { word-break: break-all; }
.scene-card__type-badge { font-size: var(--kp-text-xs); color: var(--kp-accent); letter-spacing: var(--kp-tracking-label); }
.scene-card__types { display: flex; gap: 8px; flex-wrap: wrap; }
.scene-type {
  height: 34px;
  padding: 0 16px;
  border-radius: var(--kp-radius-sm);
  background: var(--kp-surface);
  border: 1px solid var(--kp-border);
  color: var(--kp-fg-muted);
  cursor: pointer;
  font-size: var(--kp-text-sm);
  letter-spacing: 0.5px;
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.scene-type:hover { border-color: var(--kp-border-strong); color: var(--kp-fg); }
.scene-type.active {
  background: var(--kp-glow-soft);
  border-color: var(--kp-accent);
  color: var(--kp-accent);
  box-shadow: 0 0 12px var(--kp-glow);
}
</style>

<script setup lang="ts">
// 站点全局配置：标题（浏览器 tab + 后台页头）/ 描述（meta description）/ 关键字（meta keywords）
// + 大屏中英文标题独立显示开关（showChinese / showEnglish）
import { ref, onMounted } from 'vue'
import { Save, RotateCcw, Globe } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { useSceneStore } from '@/stores/scene'

const scene = useSceneStore()
const form = ref({ title: '', description: '', keywords: '', showChinese: true, showEnglish: true })
const saving = ref(false)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    // 直接从后端拉取，确保拿到最新值（不受 store 缓存影响）
    const { siteConfigApi } = await import('@/api')
    const sc = await siteConfigApi.get()
    form.value = {
      title: sc.title,
      description: sc.description,
      keywords: sc.keywords,
      showChinese: sc.showChinese !== false,
      showEnglish: sc.showEnglish !== false,
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await scene.saveSiteConfig(form.value)
    ElMessage.success('站点配置已保存，浏览器标题、meta 标签与大屏中英文标题开关即时生效')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function reset() {
  form.value = {
    title: '开平市中心医院能源管理平台',
    description: '开平市中心医院能源管理平台 — 园区综合态势监控、设备联动、能耗调控一站式管理',
    keywords: '医院能源,能耗管理,智慧医院,设备监控,大屏可视化',
    showChinese: true,
    showEnglish: true,
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page sitecfg">
    <div class="admin-toolbar">
      <Globe :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">站点配置</span>
      <span class="sitecfg__desc">站点标题、描述、关键字（保存后浏览器 tab 标题、meta description/keywords 即时生效）</span>
      <div class="admin-toolbar__filters">
        <button class="sitecfg__btn" @click="load" :disabled="loading">
          <RotateCcw :size="15" /> 刷新
        </button>
        <button class="sitecfg__btn sitecfg__btn--primary" @click="save" :disabled="saving">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <section class="kp-panel sitecfg__panel" v-loading="loading">
      <span class="kp-corner kp-corner--tl" /><span class="kp-corner kp-corner--tr" />
      <span class="kp-corner kp-corner--bl" /><span class="kp-corner kp-corner--br" />

      <div class="sitecfg__field">
        <label class="sitecfg__label">
          <span class="sitecfg__required">*</span> 站点标题（Site Title）
        </label>
        <input v-model="form.title" class="sitecfg__input" maxlength="80" placeholder="如：开平市中心医院能源管理平台" />
        <p class="sitecfg__hint">浏览器 tab 标题主体；后台页标题 = 「页面 · 站点标题」</p>
      </div>

      <div class="sitecfg__field">
        <label class="sitecfg__label">站点描述（Description）</label>
        <textarea v-model="form.description" class="sitecfg__textarea" rows="3" maxlength="300" placeholder="SEO/分享用的站点描述，建议 80-160 字" />
        <p class="sitecfg__hint">写入 <code>&lt;meta name="description"&gt;</code>，影响分享卡片与搜索引擎摘要</p>
      </div>

      <div class="sitecfg__field">
        <label class="sitecfg__label">关键字（Keywords）</label>
        <input v-model="form.keywords" class="sitecfg__input" maxlength="200" placeholder="逗号分隔，如：医院能源,能耗管理,智慧医院" />
        <p class="sitecfg__hint">写入 <code>&lt;meta name="keywords"&gt;</code>，逗号分隔</p>
      </div>

      <div class="sitecfg__field">
        <label class="sitecfg__label">大屏标题语言显示</label>
        <div class="sitecfg__switches">
          <label class="sitecfg__switch">
            <span class="sitecfg__switch-label">显示中文</span>
            <el-switch v-model="form.showChinese" />
          </label>
          <label class="sitecfg__switch">
            <span class="sitecfg__switch-label">显示英文</span>
            <el-switch v-model="form.showEnglish" />
          </label>
        </div>
        <p class="sitecfg__hint">独立控制大屏各面板标题与页眉标题的中英文显隐：两者都开 → 中文标题 + 其下方英文副标题；关中文 → 仅英文；关英文 → 仅中文。</p>
      </div>

      <div class="sitecfg__actions">
        <button class="sitecfg__btn" @click="reset">恢复默认</button>
        <button class="sitecfg__btn sitecfg__btn--primary" @click="save" :disabled="saving">
          <Save :size="15" /> {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sitecfg__desc { color: var(--kp-fg-muted); margin-left: 10px; font-size: 13px; }
.sitecfg__btn {
  height: 30px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid var(--kp-border); color: var(--kp-fg-muted);
  border-radius: var(--kp-radius-sm); cursor: pointer; font-size: 12px;
}
.sitecfg__btn:hover:not(:disabled) { color: var(--kp-fg); border-color: var(--kp-border-strong); }
.sitecfg__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sitecfg__btn--primary { background: var(--kp-accent-soft); border-color: var(--kp-accent); color: var(--kp-accent); }
.sitecfg__panel { max-width: 880px; padding: 20px 24px; }
.sitecfg__field { margin-bottom: 18px; }
.sitecfg__label { display: block; font-size: 13px; color: var(--kp-fg); margin-bottom: 6px; font-weight: 500; }
.sitecfg__required { color: #ff6b6b; margin-right: 2px; }
.sitecfg__input {
  width: 100%; height: 34px; padding: 0 10px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg); font-size: 13px;
  outline: none; transition: border-color var(--kp-motion-fast);
}
.sitecfg__input:focus { border-color: var(--kp-accent); }
.sitecfg__textarea {
  width: 100%; padding: 8px 10px; resize: vertical; min-height: 72px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm); color: var(--kp-fg); font-size: 13px;
  outline: none; transition: border-color var(--kp-motion-fast); font-family: inherit;
}
.sitecfg__textarea:focus { border-color: var(--kp-accent); }
.sitecfg__hint { margin-top: 4px; font-size: 11px; color: var(--kp-fg-muted); }
.sitecfg__hint code {
  padding: 1px 5px; background: rgba(255,255,255,0.06); border-radius: 3px;
  font-size: 11px; color: var(--kp-fg-muted);
}
.sitecfg__actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--kp-border); }
.sitecfg__switches { display: flex; gap: 22px; margin-top: 4px; }
.sitecfg__switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
.sitecfg__switch-label { font-size: 13px; color: var(--kp-fg); font-weight: 500; }
.sitecfg__switch :deep(.el-switch.is-checked) { --el-switch-on-color: var(--kp-accent); }
</style>
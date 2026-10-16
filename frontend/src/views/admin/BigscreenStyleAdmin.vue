<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Palette, RotateCcw, Save, ChevronRight } from 'lucide-vue-next'
import { bigscreenApi } from '@/api'
import type { BigscreenConfigEntry } from '@/types/api'
import { SYSTEM_KEYS, SYSTEM_LABELS, mergeAll, styleToCssVars } from '@/lib/bigscreen-config'
// SYSTEM_LABELS 仅作为 tabName 回退兜底，不再直接展示
import { SCREENS } from '@/lib/bigscreen-screens'
import { useSceneStore } from '@/stores/scene'
import '@/styles/bigscreen-stage.css'

const scene = useSceneStore()
const activeSystem = ref<string>('overview')
// Tab 名称：overview 用站点配置标题（默认「全院综合态势」），其余子系统跟随子系统菜单自定义名
function tabName(sys: string): string {
  if (sys === 'overview') return scene.siteConfig?.title || '全院综合态势'
  return scene.subsystemName(sys)
}
// 全部系统已合并默认值的完整配置（key -> entry）
const entries = reactive<Record<string, BigscreenConfigEntry>>({})
// 当前编辑副本（深拷贝，保存时才写回）
const form = ref<BigscreenConfigEntry | null>(null)
const saving = ref(false)
const dirty = ref(false)

async function loadAll() {
  try {
    const map = (await bigscreenApi.getAllConfigs()) as Record<string, Partial<BigscreenConfigEntry>>
    Object.assign(entries, mergeAll(map))
  } catch {
    Object.assign(entries, mergeAll({}))
  }
  selectSystem(activeSystem.value)
}

function selectSystem(key: string) {
  activeSystem.value = key
  form.value = entries[key] ? JSON.parse(JSON.stringify(entries[key])) : null
  dirty.value = false
}

function markDirty() {
  dirty.value = true
}

async function save() {
  if (!form.value) return
  saving.value = true
  try {
    const saved = (await bigscreenApi.saveConfig(activeSystem.value, form.value)) as BigscreenConfigEntry
    entries[activeSystem.value] = saved
    dirty.value = false
    ElMessage.success(`「${tabName(activeSystem.value)}」大屏样式已保存`)
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    saving.value = false
  }
}

function reset() {
  selectSystem(activeSystem.value)
}

// 实时预览：把当前 form 的 style 转成 CSS 变量，应用到迷你 mock
const previewVars = computed<Record<string, string>>(() => {
  return form.value ? styleToCssVars(form.value.style) : {}
})

// 预览 header：与 AppHeader 同一套按行分配逻辑
const previewHeaderRows = computed<number[]>(() => {
  const n = (form.value?.style?.header?.rows as number) || 1
  return Array.from({ length: n }, (_, i) => i + 1)
})
function previewSlotsForRow(row: number): Record<'start' | 'center' | 'end', string[]> {
  const h = form.value?.style?.header
  const toSlot = (s: string) => (s === 'left' ? 'start' : s === 'right' ? 'end' : 'center')
  const map: Record<'start' | 'center' | 'end', string[]> = { start: [], center: [], end: [] }
  if (!h) return map
  ;(['platform', 'clock', 'tabs', 'tools'] as const).forEach((k) => {
    const pos = h[k]
    if (pos && pos.row === row) map[toSlot(pos.slot)].push(k)
  })
  return map
}

onMounted(loadAll)
</script>

<template>
  <div class="bs-style-admin admin-page">
    <div class="bsa-toolbar admin-toolbar">
      <div class="bsa-toolbar__title">
        <Palette :size="18" class="bsa-toolbar__icon" />
        <span>大屏样式 DIY 配置</span>
      </div>
      <span class="bsa-toolbar__hint">按系统独立配置，保存后刷新对应大屏页面即生效（不影响数据联动）</span>
    </div>

    <!-- 系统切换页签 -->
    <div class="bsa-tabs">
      <button
        v-for="key in SYSTEM_KEYS"
        :key="key"
        class="bsa-tab"
        :class="{ active: activeSystem === key }"
        @click="selectSystem(key)"
      >
        {{ tabName(key) }}
      </button>
    </div>

    <div class="bsa-body" v-if="form">
      <!-- 左：表单 -->
      <section class="bsa-form kp-panel">
        <span class="kp-corner kp-corner--tl" />
        <span class="kp-corner kp-corner--tr" />
        <span class="kp-corner kp-corner--bl" />
        <span class="kp-corner kp-corner--br" />
        <div class="bsa-form__head">视觉令牌</div>

        <div class="bsa-field">
          <label>标题名称</label>
          <input class="bsa-input" v-model="form.title" @input="markDirty" />
        </div>

        <div class="bsa-field">
          <label>英文标题 (Title En)</label>
          <input class="bsa-input" v-model="form.titleEn" @input="markDirty" placeholder="留空则不显示英文副标题" />
        </div>

        <div class="bsa-field">
          <label>标题字号 <b>{{ form.titleFontSize }}px</b></label>
          <el-slider :min="18" :max="60" v-model="form.titleFontSize" @input="markDirty" />
        </div>

        <div class="bsa-field">
          <label>顶部行数</label>
          <el-radio-group v-model="form.style.header.rows" size="small" @change="markDirty">
            <el-radio-button :label="1">一行</el-radio-button>
            <el-radio-button :label="2">二行</el-radio-button>
            <el-radio-button :label="3">三行</el-radio-button>
          </el-radio-group>
        </div>

        <div class="bsa-field">
          <label>顶部模块布局（每个模块可自由选所在行 + 行内位置）</label>
          <div class="bsa-header-layout">
            <div class="bsa-hl-row" v-for="mod in ['platform','clock','tabs','tools'] as const" :key="mod">
              <span class="bsa-hl-label">{{ { platform:'系统平台名称', clock:'实时时钟', tabs:'子系统菜单', tools:'工具组' }[mod] }}</span>
              <div class="bsa-hl-controls">
                <el-select v-model="form.style.header[mod].row" size="small" style="width:84px" @change="markDirty">
                  <el-option v-for="r in form.style.header.rows" :key="r" :label="'第'+r+'行'" :value="r" />
                </el-select>
                <el-radio-group v-model="form.style.header[mod].slot" size="small" @change="markDirty">
                  <el-radio-button label="left">左</el-radio-button>
                  <el-radio-button label="center">中</el-radio-button>
                  <el-radio-button label="right">右</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </div>
        </div>

        <div class="bsa-field">
          <label>时间显示方式</label>
          <el-radio-group v-model="form.style.header.clockSingleLine" size="small" @change="markDirty">
            <el-radio-button :label="false">换行（时分秒 / 年月日星期 上下两行）</el-radio-button>
            <el-radio-button :label="true">单行（时间 + 日期 同一行）</el-radio-button>
          </el-radio-group>
        </div>

        <div class="bsa-field bsa-field--row">
          <div class="bsa-color">
            <label>主题强调色</label>
            <el-color-picker v-model="form.style.accent" @change="markDirty" />
            <code>{{ form.style.accent }}</code>
          </div>
          <div class="bsa-color">
            <label>背景底色</label>
            <el-color-picker v-model="form.style.bg" @change="markDirty" />
            <code>{{ form.style.bg }}</code>
          </div>
        </div>

        <div class="bsa-field">
          <label>面板背景透明度 <b>{{ form.style.panelAlpha.toFixed(2) }}</b></label>
          <el-slider :min="0" :max="1" :step="0.05" v-model="form.style.panelAlpha" @input="markDirty" />
        </div>

        <div class="bsa-field">
          <label>顶部高度 <b>{{ form.style.headerHeight }}px</b></label>
          <el-slider :min="60" :max="220" v-model="form.style.headerHeight" @input="markDirty" />
        </div>

        <div class="bsa-field">
          <label>圆角 <b>{{ form.style.radius }}px</b></label>
          <el-slider :min="0" :max="24" v-model="form.style.radius" @input="markDirty" />
        </div>

        <div class="bsa-actions">
          <el-button :icon="RotateCcw" :disabled="!dirty" @click="reset">重置</el-button>
          <el-button type="primary" :icon="Save" :loading="saving" :disabled="!dirty" @click="save">
            保存样式
          </el-button>
        </div>
      </section>

      <!-- 右：实时预览 -->
      <section class="bsa-preview">
        <div class="bsa-preview__head">实时预览 · {{ tabName(activeSystem) }}</div>
        <div class="bsa-preview__stage" :style="previewVars">
          <div class="bs-stage bsa-stage">
            <!-- 顶栏：7 屏 tab（静态简化版，DOM 取自 BsTopNav.vue） -->
            <div class="bs-topnav bsa-topnav">
              <div class="brand">开平市中心医院<small>数字孪生综合管控平台</small></div>
              <div class="tabs">
                <div
                  v-for="s in SCREENS"
                  :key="s.no"
                  class="ntab"
                  :class="{ on: s.no === 1 }"
                >
                  <span class="ni">{{ s.badge }}</span>{{ s.tab }}
                </div>
              </div>
              <div class="bs-topnav__tools">
                <div class="databadge m-sim">演示</div>
              </div>
            </div>

            <!-- 面板 chrome 示意（背景/圆角/描角随 DIY 令牌变化） -->
            <div class="bsa-grid">
              <div class="bs-panel" v-for="p in 3" :key="p">
                <div class="p-hd">
                  <span class="p-bar" />
                  <span class="p-title">面板标题示意</span>
                  <span class="p-chev"><ChevronRight :size="14" /></span>
                </div>
                <div class="p-bd">
                  <span class="bsa-bar" />
                  <span class="bsa-bar short" />
                </div>
                <span class="c tl" /><span class="c tr" /><span class="c bl" /><span class="c br" />
              </div>
              <div class="bs-panel wide">
                <div class="p-hd">
                  <span class="p-bar" />
                  <span class="p-title">宽面板示意</span>
                  <span class="p-chev"><ChevronRight :size="14" /></span>
                </div>
                <div class="p-bd">
                  <span class="bsa-bar" />
                  <span class="bsa-bar" />
                  <span class="bsa-bar short" />
                </div>
                <span class="c tl" /><span class="c tr" /><span class="c bl" /><span class="c br" />
              </div>
            </div>
          </div>
        </div>
        <p class="bsa-preview__note">
          预览仅示意令牌效果；实际大屏数据（告警/指标/图表）由后台实时联动，不受样式配置影响。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.bs-style-admin { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.bsa-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bsa-toolbar__icon { color: var(--kp-accent); }
.bsa-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); display: inline-flex; align-items: center; gap: 8px; }
.bsa-toolbar__hint { font-size: var(--kp-text-xs); color: var(--kp-fg-muted); }

.bsa-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.bsa-tab {
  height: 32px; padding: 0 14px; border-radius: var(--kp-radius-panel);
  background: rgba(var(--kp-panel-fill-rgb), 0.7); border: 1px solid var(--kp-panel-edge);
  color: var(--kp-fg-muted); cursor: pointer; font-size: var(--kp-text-sm);
  transition: all var(--kp-motion-fast) var(--kp-ease-standard);
}
.bsa-tab:hover { color: var(--kp-fg); border-color: var(--kp-accent); }
.bsa-tab.active { color: var(--kp-bg); background: var(--kp-accent); border-color: var(--kp-accent); font-weight: 700; }

.bsa-body { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.1fr); gap: 16px; flex: 1; min-height: 0; }

.bsa-form { position: relative; border-radius: var(--kp-radius-panel); padding: 18px 20px 20px; overflow-y: auto; }
.bsa-form__head {
  font-size: var(--kp-text-md); font-weight: 600; letter-spacing: var(--kp-tracking-label);
  color: var(--kp-fg); margin-bottom: 14px; padding-left: 10px;
  border-left: 3px solid var(--kp-accent);
}
.bsa-field { margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
.bsa-field > label { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); letter-spacing: 0.5px; }
.bsa-field > label b { color: var(--kp-accent); font-weight: 600; }
.bsa-field--row { flex-direction: row; gap: 18px; }
.bsa-field--row > div { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.bsa-input {
  height: 34px; padding: 0 12px; border-radius: var(--kp-radius-panel);
  background: var(--kp-bg-deep); border: 1px solid var(--kp-border); color: var(--kp-fg);
  font-size: var(--kp-text-sm); outline: none;
}
.bsa-input:focus { border-color: var(--kp-accent); box-shadow: 0 0 0 2px var(--kp-glow-soft); }
.bsa-color { display: flex; flex-direction: column; gap: 6px; }
.bsa-color label { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); }
.bsa-color code { font-size: var(--kp-text-xs); color: var(--kp-fg-subtle); font-family: var(--kp-font-mono); }

.bsa-header-layout { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border-radius: var(--kp-radius-sm); background: var(--kp-bg-deep); border: 1px solid var(--kp-border); }
.bsa-hl-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bsa-hl-label { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); letter-spacing: 0.5px; }

.bsa-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 6px; }

/* 预览 */
.bsa-preview { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.bsa-preview__head { font-size: var(--kp-text-sm); color: var(--kp-fg-muted); letter-spacing: var(--kp-tracking-label); }
.bsa-preview__stage {
  position: relative;
  flex: 1; min-height: 360px; border-radius: var(--kp-radius-panel);
  background: var(--kp-bg);
  border: 1px solid var(--kp-panel-edge);
  overflow: hidden;
}
/* 复用大屏 .bs-stage 皮肤（迷你预览：撑满父容器、不缩放） */
.bsa-preview__stage .bs-stage {
  position: relative;
  width: 100%;
  height: 100%;
  transform: none;
  transform-origin: 0 0;
  background: var(--kp-bg);
  color: var(--kp-fg-body);
  font-family: var(--kp-font-body);
  display: flex;
  flex-direction: column;
}
/* 顶栏覆盖为相对流式（原 .bs-topnav 为绝对 1920 定位，仅 7 屏 tab 预览用） */
.bsa-preview__stage .bs-topnav { position: relative; width: 100%; flex: none; }
.bsa-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--kp-space-2);
  padding: var(--kp-space-3);
  min-height: 0;
}
.bsa-grid .bs-panel {
  position: relative;
  width: auto;
  height: auto;
  min-height: 120px;
}
.bsa-grid .bs-panel.wide { grid-column: 1 / -1; }
.bsa-bar {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--kp-accent) 35%, transparent);
  margin-bottom: 8px;
}
.bsa-bar.short { max-width: 50%; }
.bsa-preview__note { font-size: var(--kp-text-xs); color: var(--kp-fg-subtle); line-height: 1.6; margin: 0; }
</style>

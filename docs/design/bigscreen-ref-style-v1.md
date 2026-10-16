# 大屏视觉规范 v1 — 参考页对齐（hud-dashboard-style-spec v1）

主理人指定参考页：`开平市中心医院数字孪生驾驶舱 · 大屏`（7 屏单文件 HTML）。
本文件是「前端大屏 + 大屏样式 DIY + 大屏布局 DIY + 后台各模块」共同遵守的视觉契约。
参考页原始副本已落盘 `deploy/_ref_index.html`（只读参考，不参与构建）。

## P0 硬约束（不可违反）

1. **禁止在组件 / 页面 CSS 中写字面色值**（`#fff` / `#000` 除外）。所有颜色只能引用 `--kp-*` token。
   唯一可以写颜色的文件是 `frontend/src/styles/design-tokens.css`。
2. 禁止 emoji 图标 —— 图标只用 `lucide-vue-next`。
3. 禁止紫粉渐变、禁止 AI 模板套话文案。
4. 改样式不得改数据链路：接口、store、props、DIY 字段语义全部保持不变。

## 1. 参考页 → 项目 token 映射表

| 参考页字面值 | 语义 | 项目 token |
| --- | --- | --- |
| `#35C5FF` | 强调色（青） | `--kp-accent` |
| `#EAF6FF` / `#E8F4FF` | 主文字 | `--kp-fg` |
| `#9FC3E0` | 次文字 | `--kp-fg-muted` |
| `#62809C` | 静默文字 / 单位 / 说明 | `--kp-fg-subtle` |
| `rgba(10,28,52,.82)` | 面板底色 | `rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha))` |
| `#1E4E7E` | 面板钢蓝实边 | `--kp-panel-edge` |
| `rgba(30,78,126,.5)` | 次级标签边框 | `--kp-panel-edge-soft` |
| `border-radius:4px` | 面板圆角 | `--kp-radius-panel` |
| 面板头高 `36px` | 标题栏高度 | `--kp-panel-title-h` |
| `rgba(53,197,255,.05)` + `60px` | 舞台网格 | `--kp-grid-line` / `--kp-grid-size` |
| `linear-gradient(180deg,#04101E,#072038 52%,#0A2342)` | 舞台底 | `--kp-stage-bg` |
| `radial-gradient(ellipse at 50% 42%,rgba(53,197,255,.10),transparent 62%)` | 舞台光晕 | `--kp-stage-halo` |
| `radial-gradient(120% 120% at 50% 15%,#0C2D55,#072038 45%,#04101E)` | 外壳底（缩放留边） | `--kp-shell-bg` |
| `linear-gradient(180deg,rgba(8,26,48,.95),rgba(8,26,48,.55))` | 顶栏底 | `--kp-topnav-bg` |
| `#FFFFFF` 大数字 | KPI 数值 | `#fff`（白允许）+ `--kp-font-mono` |

## 2. 面板 Chrome（已在 `styles/app.css` 全局落地，勿重复实现）

```
.kp-panel  → 1px solid var(--kp-panel-edge)
             border-radius: var(--kp-radius-panel)
             background: rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha))
             box-shadow: inset 0 0 28px var(--kp-glow-soft)     ← 无外发光，克制
.kp-corner → 12×12，2px solid var(--kp-accent)，外侧圆角 = var(--kp-radius-panel)
.kp-panel-title
           → height var(--kp-panel-title-h)，无底色填充，无 clip-path 斜切
             font-size var(--kp-text-lg) / weight 600 / letter-spacing 1.5px
             ::after = 1px 渐变下划线 linear-gradient(90deg, var(--kp-accent), transparent)
```

标题栏左侧竖条（参考页 `.p-bar`）：`4px × 16px`，`background: var(--kp-accent)`，直角不圆角。

**明确取消的旧装饰**：标题栏 `clip-path` 斜切、标题栏 glow 底色填充、面板外发光 `0 0 18px`、
`backdrop-filter: blur()`、四角 `drop-shadow` 光晕。参考页均无，视觉噪音大。

## 3. 舞台 / 外壳背景

```
外壳（缩放留边区）：background: var(--kp-shell-bg)
舞台（1920×1080）：background: var(--kp-stage-bg)
舞台网格叠层（::before，pointer-events:none）：
  background-image:
    linear-gradient(var(--kp-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--kp-grid-line) 1px, transparent 1px);
  background-size: var(--kp-grid-size) var(--kp-grid-size);
舞台中心光晕（可选第二层）：var(--kp-stage-halo)
```

## 4. 页签（顶栏 / 后台系统切换）统一形态

```
默认态：height 32px / padding 0 16px / border-radius var(--kp-radius-panel)
        background rgba(var(--kp-panel-fill-rgb), 0.7)
        border 1px solid var(--kp-panel-edge)
        color var(--kp-fg-muted) / font-size var(--kp-text-md)
hover ：border-color var(--kp-accent)；color var(--kp-fg)
选中态：background var(--kp-accent)；border-color var(--kp-accent)
        color var(--kp-bg)；font-weight 700      ← 参考页是「实心填充反白字」，不是描边高亮
```

## 5. 顶栏（参考页 `.topnav`）

- 高 48px，`background: var(--kp-topnav-bg)`，`border-bottom: 1px solid var(--kp-border-strong)`。
- 品牌名 15px / 700 / letter-spacing 2px / `text-shadow: 0 0 10px var(--kp-glow)`；
  下方英文小字 10px / `--kp-fg-subtle` / letter-spacing 2px。
- 页签靠右（`margin-left:auto`），间距 8px，形态见 §4。

## 6. 后台页统一外壳（所有 `/admin/*` 必须一致）

```
根容器  .admin-page      （深色底 + Element Plus 令牌深色化，见 styles/admin.css）
工具栏  .admin-toolbar    （标题 + 图标 + 说明 + 右侧操作）
内容块  .kp-panel + 四个 .kp-corner + .kp-panel-title
```

新增/改造后台页不要再造 `.se-*` / `.bsa-*` / `.la-*` 这类私有外壳类，
布局细节可用私有类，但**外壳骨架必须复用上面三件套**。

## 7. 数字与单位

- 所有数值使用 `--kp-font-mono` + `font-variant-numeric: tabular-nums`。
- 单位/后缀用 `--kp-fg-subtle`，字号比数值小一档。

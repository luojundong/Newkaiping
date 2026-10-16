# 大屏样式微调 · 修改位置清单（手动调整用）

> 对应最新诉求：①满屏自适应（不限宽度）②顶部两行（标题/7系统，去掉楼栋）③glb 全屏铺底聚焦中间 ④左侧 14 项分类统计 ⑤右侧内容精简、字更大 ⑥所有框背景50%透明。
> 改完 `npm run dev` 即时生效（或 HMR 热更新）；涉及后端接口的改完需 `npm run build` + 重启后端。
> 修改原则：集中改 `design-tokens.css` 的变量；组件级微调改对应 `.vue` 的 `<style scoped>`。

---

## ① 顶部 Header（两行：标题 / 7系统，去掉楼栋）

- 文件：`frontend/src/components/layout/AppHeader.vue`
- 布局结构（`.app-header__center` 内纵向两行堆叠）：
  - 第 1 行：`.app-header__title` 平台标题
  - 第 2 行：`.app-header__tabs` 7+1 子系统 tab
  - 左侧：实时时钟（`app-header__side--left` / `.clock-box`）
  - 右侧：`.app-header__side--right` 放「主题」「消防」「系统管理员」
- 调法：
  - 两行间距：`.app-header__center { gap: 10px; }`
  - 标题字号：`.app-header__title { font-size: var(--kp-text-hero); }`（当前 40px）
  - tab 字号间距：`.subsystem-tab { padding / font-size }`
  - 头部总高：`design-tokens.css` → `--kp-header-h`（当前 110px）
  - 右侧按钮：`.tool-btn`；消防 active：`.fire-btn.active`
  - 如需恢复楼栋选择器：在 `.app-header__center` 内标题与 tabs 之间插入 `.building-selector`（旧样式仍保留在文件中，可直接复制）

---

## ② 整体满屏布局（glb 全屏铺底 + 面板浮层）

- 文件：`frontend/src/components/layout/BigScreenLayout.vue`
- 关键点（**已从固定 1920×1080 缩放改为 100vw×100vh 满屏自适应**）：
  - 根 `.bs-scale-wrap { position: fixed; inset: 0; width:100vw; height:100vh; overflow:hidden; }`
  - **全屏 3D 背景层** `.bs-bg-3d { position:absolute; inset:0; z-index:0; }` 内放 `<ThreeViewer />` → glb 铺满整屏
  - 扫描线/网格暗角 `.bs-stage__bg` / `.bs-stage__grid-bg`（z-index:1，pointer-events:none）
  - **覆盖层网格** `.bs-grid`（z-index:2）：`grid-template-columns: var(--kp-left-w) 1fr var(--kp-right-w)`；`grid-template-rows: var(--kp-header-h) 1fr var(--kp-bottom-h)`
    - 中间列（col2/row2）**故意留空** → 透出下方 3D 模型
    - 容器 `.bs-grid { pointer-events: none; }`，仅面板单元格 `.bs-grid__header/.bs-grid__col/.bs-grid__bottom { pointer-events:auto; }` → 中间空白区鼠标可穿透去拖拽/缩放 3D
    - 左列 `grid-column:1; grid-row:2`；右列 `grid-column:3; grid-row:2`；底部 `grid-column:1/-1; grid-row:3`
- 调法：
  - 改各区域宽度/高度 → `frontend/src/styles/design-tokens.css`：
    - `--kp-header-h: 134px;`（三行所需）
    - `--kp-left-w: 280px;`
    - `--kp-right-w: 520px;`
    - `--kp-bottom-h: 140px;`
    - `--kp-gutter: 24px;`
  - 想让模型不铺满、回到"中间一个框"：把 `<ThreeViewer />` 移回 `.bs-grid__center` 单元格并补回 `.bs-grid__center { grid-column:2; grid-row:2; }` 与 `.bs-grid__scene` 边框样式
  - 中间鼠标穿透不想穿透：把 `.bs-grid { pointer-events:none }` 删掉即可（但 3D 无法在中间拖拽）
  - 注意：去掉楼栋后 header 高度回到 `--kp-header-h: 110px`，中部可用高度增加

---

## ③ 左侧「监控报警」分类统计列表

- 文件：`frontend/src/components/panels/LeftPanel.vue`
- 当前行为：
  - 固定 14 个分类（`CATEGORIES` 常量）：温度/湿度/烟雾/电压/电流/水压/气压/离线/门禁/电梯/空调/照明/网络/消防
  - 数量从 `bs.panels.left.alarmItems` 按 `key` 匹配，未匹配到显示 0
  - 文字（`alarm-name`）靠左；数字（`alarm-count`）靠右
  - 底部显示总条数（`alarmTotal`）
  - 背景透明：`rgba(...,0.5)`
- 调法：
  - 宽度：`design-tokens.css` → `--kp-left-w`
  - 增删分类：修改 `CATEGORIES` 数组
  - 行高：`.alarm-list li { min-height: 30px }`
  - 列表滚动：`.alarm-list { overflow-y: auto }`
  - 数量颜色：`.alarm-count.warn { color: var(--kp-warn) }`
  - 图标颜色：每个 `CATEGORIES` 条目的 `color` 字段

---

## ④ 右侧 10 个数据框（内容精简、字更大）

- 文件：`frontend/src/components/panels/RightPanel.vue`
- 当前布局：`.right-panel { grid-template-columns: 1fr 1fr; grid-template-rows: repeat(5, minmax(0, 1fr)); }`
- 顺序（从上到下，从左到右）：
  1. 空调系统 | 供配电
  2. 温度趋势 | 电压稳定度
  3. 湿度统计 | 负载趋势
  4. 能耗统计 | 电梯运行
  5. 用电趋势 | 设备在线量
- 精简措施：
  - KPI 框（空调/供配电/能耗/电梯）：2×2 网格，数字字号 `var(--kp-text-lg)`，label 改为 10px 浅灰
  - 趋势框（温度/负载/用电）：图表占满 body，标题高度压缩到 30px，body 内边距减小到 `6px 8px 8px`
  - 仪表框（电压稳定度/湿度统计/设备在线量）：仪表占比 48%，数字字号 18px，辅助数字用 `var(--kp-text-md)`
- 调法：
  - 右列总宽：`design-tokens.css` → `--kp-right-w`（当前 520px）
  - KPI 字号：`.rp-stats :deep(.kpi__value) { font-size: ... }`
  - 标题高度：`.rp-card :deep(.kp-panel-title) { height: ... }`
  - body 内边距：`.rp-card :deep(.panel-card__body) { padding: ... }`
  - 仪表数字：`.rp-gauge` 所在 ECharts `detail.rich.v.fontSize`
  - 增删框：直接改模板；注意 `grid-template-rows` 同步调整行数

---

## ⑤ 底部 6 个等份框

- 文件：`frontend/src/components/panels/BottomBar.vue`
- 当前布局：`.bottom-bar { display: grid; grid-template-columns: repeat(6, 1fr); }`
- 当前顺序：
  1. 数据来源及更新
  2. 数据分类趋势
  3. 当前状态
  4. 应急响应
  5. 科室告警
  6. 流量趋势
- 调法：
  - 等份数：`repeat(6, 1fr)` 改数字
  - 各框不等宽：改成如 `repeat(6, 1fr)` → `1.2fr 1fr 1fr 1fr 1fr 1fr`
  - 数据分类趋势数据源：后端 `bottom.categoryTrend`；回退用 `bottom.energyTrend`
  - 流量趋势数据源：`right.trafficTrend` + `right.timeLabels`
  - 增删框：改模板 + 同步 `grid-template-columns`

---

## ⑥ 中间 `.glb` 铺满整屏 + 聚焦中间

- 文件：`frontend/src/components/three/ThreeViewer.vue`
- 当前相机机位：`camera.position.set(74, 56, 102)`
- 当前视点：`controls.target.set(30, 20, 0)`（抬高视点使楼栋群在整屏居中）
- 当前最小滚轮距离：`controls.minDistance = 18`
- 调法：
  - 三个数整体调小 = 相机更近 = 模型铺得更满
  - `target` 的 Y 值（当前 20）：调大 → 视点更靠楼栋上方；调小 → 更贴地面
  - 允许用户滚轮放大多近：改 `minDistance`（越小可放越大）
- ⚠️ 模型世界尺寸 `const FIT = 230` 慎改，会联动影响楼栋锚点/设备点位

---

## ⑦ 所有框框背景 50% 透明

- 通用数据框：`frontend/src/components/common/PanelCard.vue`
  - `.panel-card { background: linear-gradient(180deg, rgba(11, 24, 39, 0.5), rgba(4, 16, 31, 0.5)); }`
  - 两个 `0.5` 即透明度
- 左侧告警框：`frontend/src/components/panels/LeftPanel.vue`
  - `.left-panel { background: linear-gradient(180deg, rgba(11, 24, 39, 0.5), rgba(4, 16, 31, 0.5)); }`
- 中间 3D 区域：本就无填充背景，仅边框；想更透改 `ThreeViewer.vue` 的 `.three-viewer` 径向渐变 alpha

---

## ⑧ 后端数据接口预留

- 文件：`backend/src/bigscreen/bigscreen.service.ts`
- `panels()` 返回 `bottom.categoryTrend: Array<{ t: string; value: number }>`
- 前端类型：`frontend/src/stores/bigscreen.ts` → `BigscreenPanels.bottom.categoryTrend`
- 前端兜底：`frontend/src/stores/bigscreen.ts` → `makeFixture()` 已填充示例数据

---

## 快速对照表

| 诉求 | 改哪里 | 关键变量/代码 |
|------|--------|----------------|
| 满屏自适应 | BigScreenLayout.vue | `.bs-scale-wrap { width:100vw; height:100vh }`（已去掉固定缩放） |
| 顶部两行（去楼栋） | AppHeader.vue | `.app-header__center` 内只保留 `.app-header__title` + `.app-header__tabs` |
| glb 全屏铺底 | BigScreenLayout.vue | `.bs-bg-3d { z-index:0 }` + 网格中间留空 |
| glb 聚焦居中 | ThreeViewer.vue | `camera.position.set(74,56,102)` / `target.set(30,20,0)` |
| 整体网格 | BigScreenLayout.vue | `.bs-grid { grid-template-* }` |
| 左栏窄 | design-tokens.css | `--kp-left-w` |
| 左侧 14 项分类 | LeftPanel.vue | `CATEGORIES` 常量 |
| 右侧 10 框 | RightPanel.vue | `.right-panel` grid + 模板 |
| 右侧字更大 | RightPanel.vue | `.rp-stats :deep(.kpi__value)` / `.rp-gauge` detail fontSize |
| 底部 6 框 | BottomBar.vue | `repeat(6, 1fr)` + 模板 |
| 右栏宽 | design-tokens.css | `--kp-right-w` |
| 框背景透明 | PanelCard.vue + LeftPanel.vue | `rgba(...,0.5)` |
| 数据分类趋势接口 | backend bigscreen.service.ts | `bottom.categoryTrend` |

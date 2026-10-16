# 大屏参考页复刻契约 v2（数字孪生驾驶舱 7 屏）

> **单一真相源**。所有实施工必须以本文件为准，不得凭截图猜测。
> 参考页：`D:\NewPrSz\bigscreen-portable\index.html`（单文件，CSS 位于 L7–437，DOM 位于 L439–603）
> 本契约取代 v1（`bigscreen-ref-style-v1.md`）。v1 只做了「CSS 令牌对齐」，v2 是**结构复刻**。

---

## 0. P0 绝对规则（违反即返工）

1. **禁止硬编码颜色**。唯一允许出现字面色值的文件是 `frontend/src/styles/design-tokens.css`。
   例外：`#fff` / `#000` 仅可用于遮罩与纯黑/纯白语义。
2. **禁止 emoji**。图标只用 `lucide-vue-next`。参考页里的内联 SVG 图标必须换成 lucide 等价图标。
3. **禁止紫→粉渐变**。
4. **禁止 AI 模板文案**（"赋能""一站式""助力"等）。文案照参考页原文或按业务实写。
5. 带 alpha 的颜色一律用 `rgba(var(--kp-*-rgb), α)` 组合，**不得**新写 `rgba(53,197,255,.35)` 这类字面值。

---

## 1. 令牌层改造（design-tokens.css）

### 1.1 需要修正的既有令牌

| 令牌 | 现值 | 改为 | 依据（参考页） |
|---|---|---|---|
| `--kp-accent` | `#00e5ff` | `#35c5ff` | 全页强调色 `#35C5FF` |
| `--kp-fg` | `#e6f7ff` | `#eaf6ff` | `.t1` / `.p-title` / `.brand` |
| `--kp-fg-muted` | `#8ca8be` | `#9fc3e0` | `.t3` / `.lbl` / 所有字段名 |
| `--kp-fg-subtle` | `#5a7a94` | `#62809c` | `.t4` / `.unit` / 所有单位与脚注 |
| `--kp-success` | `#2ee6a6` | `#34d98a` | `.st.run` / `.gauge .score` / `.tg.ok` |
| `--kp-warn` | `#ffc043` | `#ffb03a` | `.st.warn` / `.tg.m` / `.t7 .pend` |
| `--kp-danger` | `#ff4d5e` | `#ff5252` | `.st.stop` / `.tg.u` / `.kpi.red` |
| `--kp-info` | `#4d9fff` | `#2e8bff` | `.tg.n` / `.kpi.blue` / `.cb` 渐变 |
| `--kp-bg` | `#04101f` | `#04101e` | `html,body` / `#stage` 起始色 |

> ⚠️ 改 `--kp-accent` 必须**同步**三处默认值，否则样式 DIY 的强调色注入判断失效
> （`styleToCssVars()` 仅在 `style.accent !== DEFAULT_STYLE.accent` 时才注入行内 `--kp-accent`）：
> 1. `frontend/src/lib/bigscreen-config.ts` → `DEFAULT_STYLE.accent = '#35C5FF'`
> 2. `frontend/src/lib/bigscreen-config.ts` → `DEFAULT_STYLE.bg = '#04101E'`
> 3. `backend/src/bigscreen/bigscreen-config.service.ts` → 后端 `DEFAULT_STYLE` 同步

### 1.2 必须新增的令牌

**RGB 三元组**（用于所有 alpha 合成，杜绝硬编码 rgba）：

```
--kp-accent-rgb: 53, 197, 255;    /* #35C5FF */
--kp-edge-rgb: 30, 78, 126;       /* #1E4E7E — 参考页大量用 rgba(30,78,126,.12~.6) */
--kp-success-rgb: 52, 217, 138;
--kp-warn-rgb: 255, 176, 58;
--kp-danger-rgb: 255, 82, 82;
--kp-info-rgb: 46, 139, 255;
/* --kp-panel-fill-rgb: 10, 28, 52  已存在，勿改 */
```

**文字层级补全**：

```
--kp-fg-strong: #ffffff;   /* 所有大数字 .num/.kpi .v/.ov-row .n */
--kp-fg-body: #e8f4ff;     /* .t2 正文 — 注意比 --kp-fg-muted 亮，不可复用 */
```

**结构常量**：

```
--kp-topnav-h: 48px;          /* .topnav 高度（现 --kp-header-h:110px 是旧两行顶栏，图1 不再用） */
--kp-panel-title-size: 15px;  /* .p-title */
--kp-panel-title-tracking: 1.5px;
--kp-corner-size: 12px;       /* .panel .c */
--kp-corner-width: 2px;
```

**外壳背景**（参考页 `body` 的径向渐变，铺满缩放留白）：

```
--kp-bg-shell: radial-gradient(120% 120% at 50% 15%, #0c2d55 0%, #072038 45%, #04101e 100%);
```

### 1.3 主题块同步

`[data-kp-theme="green"]` / `[data-kp-theme="amber"]` 必须补 `--kp-accent-rgb`，否则换主题后所有 alpha 合成色仍是蓝色。

---

## 2. 舞台与背景（**外壳底色铁律 v2**）

参考页有三层背景，职责必须分清：

| 参考页选择器 | 值 | 项目落点 | 令牌 |
|---|---|---|---|
| `body` | `radial-gradient(120% 120% at 50% 15%,#0C2D55,#072038 45%,#04101E)` | 缩放容器外层（留白区） | `--kp-bg-shell` |
| `body::before` | `radial-gradient(ellipse at 50% 42%, rgba(53,197,255,.10), transparent 62%)` | 同上，叠加光晕 | `--kp-stage-halo` |
| `#stage` | `linear-gradient(180deg,#04101E,#072038 52%,#0A2342)` | **仅图2–图7 的屏容器** | `--kp-stage-bg` |
| `#stage::before` | 60px 双向网格线 `rgba(53,197,255,.05)` | 同上 | `--kp-grid-line` / `--kp-grid-size` |

**铁律**：`.bs-scale-wrap`（1920×1080 根）背景仍为 `var(--kp-bg-deep)`，**保留样式 DIY 背景色链路**
（`styleToCssVars()` 注入 `--kp-bg` / `--kp-bg-deep`）。
`--kp-stage-bg` 只能挂在**没有 3D 的屏容器**（图2–图7）与后台两个 DIY 页的平面画布上。
理由：图1 的 `#w_scene` 是 1920×1080 全屏 3D，会完全盖住 stage 渐变，此时若把渐变写在根上会废掉 DIY 背景色。

---

## 3. 面板 Chrome（.panel — 全站统一，PanelCard.vue 承载）

```
.panel      position:absolute;
            background: rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha));   /* 参考 rgba(10,28,52,.82) */
            border: 1px solid var(--kp-panel-edge);                               /* #1E4E7E */
            border-radius: var(--kp-radius-panel);                               /* 4px，DIY 可调 */

.panel .c   12px×12px 四角，border 2px solid var(--kp-accent)，对应角 radius = var(--kp-radius-panel)
            .tl left/top:-1px  .tr right/top:-1px  .bl left/bottom:-1px  .br right/bottom:-1px

.p-hd       height: var(--kp-panel-title-h) /* 36px */; flex; align-items:center; gap:8px; padding:0 12px
.p-hd::after  绝对定位底边 1px，background: linear-gradient(90deg, var(--kp-accent) 0%, transparent 100%)
.p-bar      4px × 16px，background: var(--kp-accent)，flex:none
.p-title    15px / var(--kp-fg) / letter-spacing 1.5px / weight 600
.p-chev     margin-left:auto，色 var(--kp-accent)，opacity .85  ← lucide `chevron-right`
.p-bd       position:relative; padding:14px; height:calc(100% - 36px); overflow:hidden
```

`.sbot .p-bd` 与 `#panel-lighting .p-bd` 的 padding 为 **10px**（不是 14px）。
`#w_floor_list .p-bd` padding **8px** 且 `flex-direction:column; gap:2px`。

---

## 4. 顶栏（.topnav）

```
.topnav     0,0,1920,48  z-index:60  flex align-center gap:10px padding:0 22px
            background: var(--kp-topnav-bg)
            border-bottom: 1px solid rgba(var(--kp-accent-rgb), .35)
.brand      15px / weight 700 / var(--kp-fg) / letter-spacing 2px
            text-shadow: 0 0 10px rgba(var(--kp-accent-rgb), .45)
            文案：开平市中心医院数字孪生
.brand small  block / 10px / var(--kp-fg-subtle) / letter-spacing 2px / weight 400
            文案：KAIPING CENTRAL HOSPITAL · DIGITAL TWIN
.tabs       margin-left:auto; flex; gap:8px
.ntab       h32 / padding 0 16px / gap 6px / cursor pointer
            background: rgba(var(--kp-panel-fill-rgb), .7)
            border: 1px solid var(--kp-panel-edge); radius: var(--kp-radius-panel)
            14px / var(--kp-fg-muted) / transition all .15s
.ntab:hover border-color: var(--kp-accent); color: var(--kp-fg)
.ntab.on    background: var(--kp-accent); border-color: var(--kp-accent);
            color: var(--kp-bg); font-weight: 700          ← 实心反白，关键特征
.ntab .ni   11px / weight 700 / rgba(var(--kp-bg-rgb),.6) → 用 var(--kp-fg-subtle) 在未选中态；
            选中态为 rgba(4,16,30,.6) → 用 color-mix 或独立类，禁硬编码
```

**7 个 tab 文案（照抄，`.ni` 为前缀小标）**：

| data-s | .ni | 标签 |
|---|---|---|
| 1 | 图1 | 主驾驶舱 |
| 2 | 图2 | 空调与能源 |
| 3 | 图3 | 电梯安全 |
| 4 | 图4 | 供配电计量 |
| 5 | 图5 | 告警工单 |
| 6 | 图6 | 空间设备运维 |
| 7 | 图7 | 建筑面积表 |

顶栏右侧还有 `#dataBadge`（数据模式徽章）与 `#simTabs`（仿真剧本切换，默认 `display:none`）。

---

## 5. 屏容器

```
.screen     absolute 0,0,1920,1080; display:none
.screen.on  display:block
```

---

## 6. 图1 主驾驶舱 — 精确几何（1920×1080）

| 元素 | left | top | width | height | z-index | 说明 |
|---|---|---|---|---|---|---|
| `#w_scene` 全屏 3D | 0 | 0 | 1920 | 1080 | 1 | `radial-gradient(circle at 50% 38%, #0E3358, #06182E 72%)` 兜底 |
| `#w_title` 标题栏 | 40 | 48 | 1840 | 72 | 16 | `::after` 中间亮两端透明的 1px 分隔线 |
| `#w_building_nav` 楼栋导航 | 40 | 128 | 1840 | 56 | 16 | flex center，gap 10 |
| `#w_floor_list` 楼层列表 | 480 | 200 | 120 | 380 | 20 | 背景透明，无面板边框 |
| `.panel.col-l.pL1` S1 | 40 | 192 | 420 | 212 | 12 | |
| `.panel.col-l.pL2` S2 | 40 | 412 | 420 | 212 | 12 | |
| `.panel.col-l.pL3` S3 | 40 | 632 | 420 | 212 | 12 | |
| `.panel.col-l.pL4` S4 | 40 | 852 | 420 | 212 | 12 | |
| `.panel.col-r.p192` S5 | 1460 | 192 | 420 | 288 | 12 | 图1 的 col-r 是 **1460**（不是图2-7 的 1410） |
| `.panel.col-r.p488` S6 | 1460 | 488 | 420 | 288 | 12 | |
| `.panel.col-r.p784` S7 | 1460 | 784 | 420 | 288 | 12 | |
| `#panel-lighting` 今日运行情况 | 640 | 872 | 640 | 200 | 12 | |
| `#note` 脚注 | right 40 | bottom 8 | — | — | 30 | 11px `--kp-fg-subtle` |
| `#bldTip` 楼栋气泡 | 动态 | 动态 | 280 | auto | 70 | `display:none`，hover 楼栋时出现 |

### 6.1 标题栏内部

```
.tb-left    absolute left:8 top:22; flex gap:16       ← #wx 天气
.wx         flex gap:6; 13px var(--kp-fg-body)
.wx .v      16px weight700 var(--kp-fg-strong)
.wx .s      12px var(--kp-fg-muted)
.tb-sep     1px × 18px, background rgba(var(--kp-accent-rgb), .28)
.tb-mid     absolute left:0 right:0 top:6; text-align:center; pointer-events:none
.tb-mid h1  30px weight700 var(--kp-fg-strong) letter-spacing 6px
            text-shadow 0 0 12px rgba(var(--kp-accent-rgb),.55)
            文案：开平市中心医院数字孪生驾驶舱
.tb-mid .sub  margin-top4; 11px var(--kp-fg-subtle) letter-spacing 3px
            文案：KAIPING CENTRAL HOSPITAL DIGITAL TWIN OPERATION CENTER
.tb-right   absolute right:8 top:16; text-align:right
.tb-right .d  13px var(--kp-fg-muted) letter-spacing 1px       ← #clk-d 日期
.tb-right .t  24px weight700 var(--kp-fg-strong) letter-spacing 2px margin-top2  ← #clk-t 时间
```

### 6.2 楼栋按钮 `.btab`

```
.btab       h36 padding 0 22px gap 8
            background rgba(var(--kp-panel-fill-rgb), var(--kp-panel-alpha))
            border 1px solid var(--kp-panel-edge); radius var(--kp-radius-panel)
            14px var(--kp-fg-muted); transition all .15s
.btab .idx  11px var(--kp-fg-subtle); font-variant-numeric: tabular-nums
.btab:hover border-color var(--kp-accent); color var(--kp-fg)
.btab.on    background var(--kp-accent); border-color var(--kp-accent);
            color var(--kp-bg); weight 700       ← 实心反白
```

### 6.3 楼层按钮 `.fl`

```
.fl         100% × 22px; flex center; 13px var(--kp-fg-muted)
            background rgba(var(--kp-edge-rgb), .22)
            border 1px solid var(--kp-panel-edge); radius 3px; tabular-nums
.fl:hover   border-color var(--kp-accent); color var(--kp-fg)
.fl.on      background rgba(var(--kp-accent-rgb), .18); border-color var(--kp-accent)
            color var(--kp-fg-strong); weight 700
            box-shadow inset 0 0 10px rgba(var(--kp-accent-rgb), .25)
```

### 6.4 S1–S7 面板标题与图标（data-icon → lucide 映射）

| 面板 | 标题（照抄） | 参考 data-icon | **lucide-vue-next 组件** |
|---|---|---|---|
| S1 | `S1 · 智慧能源一体化调控` | gauge | `Gauge` |
| S2 | `S2 · 设备生命周期管理` | cpu | `Cpu` |
| S3 | `S3 · 空调集中控制调度` | thermometer | `Thermometer` |
| S4 | `S4 · 智慧照明管理` | bulb | `Lightbulb` |
| S5 | `S5 · 医院电力监控` | zap | `Zap` |
| S6 | `S6 · 热水集中控制调度` | drop | `Droplet` |
| S7 | `S7 · 电梯节能管理` | activity | `Activity` |
| 底条 | `今日运行情况` | chart | `BarChart3` |

其余屏用到的图标映射：`wind→Wind`、`leaf→Leaf`、`layers→Layers`、`building→Building2`、
`alert→AlertTriangle`、`grid→Grid3x3`、`users→Users`、`chev→ChevronRight`、
`clipboard→ClipboardList`、`check→CheckCircle2`、`clock→Clock`、`area→Maximize2`、`pin→MapPin`。

---

## 7. 图2–图6 通用子屏骨架（精确几何）

| 元素 | left | top | width | height |
|---|---|---|---|---|
| `.shead` | 40 | 56 | 1840 | 44 |
| `.panel.scenter` | 530 | 110 | 860 | 540 |
| `.panel.col.col-l.pl1` | 40 | 110 | 470 | 250 |
| `.panel.col.col-l.pl2` | 40 | 370 | 470 | 250 |
| `.panel.col.col-l.pl3` | 40 | 630 | 470 | 250 |
| `.panel.col.col-r.pl1` | 1410 | 110 | 470 | 250 |
| `.panel.col.col-r.pl2` | 1410 | 370 | 470 | 250 |
| `.panel.col.col-r.pl3` | 1410 | 630 | 470 | 250 |
| `.panel.sbot` | 40 | 900 | 1840 | 150 |

```
.shead .st      22px weight700 var(--kp-fg-strong) letter-spacing 3px
                text-shadow 0 0 10px rgba(var(--kp-accent-rgb),.4)
.shead .ss      12px var(--kp-fg-muted) letter-spacing 2px
.shead .sclock  margin-left:auto; flex align-items:flex-end gap:14
.sclock .d      12px var(--kp-fg-muted)
.sclock .t      20px weight700 var(--kp-fg-strong) letter-spacing 1px
```

**六屏标题（中/英，照抄）**：

| 屏 | .st | .ss |
|---|---|---|
| 图2 | 空调与能源管控驾驶舱 | HVAC & ENERGY CONTROL |
| 图3 | 电梯安全运行驾驶舱 | ELEVATOR SAFETY |
| 图4 | 供配电与计量驾驶舱 | POWER & METERING |
| 图5 | 告警工单驾驶舱 | ALARM & WORK ORDER |
| 图6 | 空间设备运维驾驶舱 | SPACE & ASSET OPS |
| 图7 | 权威建筑面积表 | AUTHORITATIVE GROSS AREA |

### 7.1 各屏 8 面板标题（照抄参考页 data-title）

**图2 空调与能源**：中央「空调系统总览（冷机→冷却塔→水泵→末端）」wind；
左「分区温度热力」thermometer /「故障告警」alert /「运行策略 / 逆控状态」leaf；
右「能效分析」chart /「能耗占比」layers /「能耗排名（按楼栋）」building；
底「运行趋势（进出水温） / 设备健康度」activity。

**图3 电梯安全**：中央「电梯编号表」grid；
左「电梯总览」users /「故障告警」alert /「运行统计」chart；
右「实时位置（井道行程图）」chev /「维保计划」clipboard /「工单统计」check；
底「运行统计 / 平均响应 / 巡检 / 工单」activity。

**图4 供配电计量**：中央「配电总览（2 路 10kV + 2 变压器）」zap；
左「变压器负载」chart /「馈线状态（6 路）」grid /「异常用能」alert；
右「计量体系树」layers /「需求趋势（近 7 日）」chart /「电能质量（5 项）」activity；
底「异常用能 / 能耗排名 / 能耗结构」layers。

**图5 告警工单**：中央「近 7 日告警趋势」chart；
左「告警中心」alert /「实时告警表」clipboard /「等级分布」layers；
右「派单处置漏斗」chev /「响应时效」clock /「闭环统计」check；
底「处置流程 / 维护团队」users。

**图6 空间设备运维**：中央「空间树（10 栋 → 楼层 → 科室）」area；
左「巡检路线」pin /「资产档案」layers /「维护记录」clipboard；
右「健康状态」activity /「资产明细」grid /「实时告警」alert；
底「设备定位 / 实时告警」pin。

**图7**：无 `.panel`，只有 `.t7wrap`（40,120,1840, bottom:60）内含 `table.t7`。

---

## 8. 内容组件库（必须实现为 Vue 组件，class 名照抄）

所有组件的 alpha 色一律走 `rgba(var(--kp-*-rgb), α)`。

| class | 用途 | 结构要点 |
|---|---|---|
| `.kpis` / `.kpi` | KPI 横排 | `.k` 11px 标签 / `.v` 21px 数字 / `.u` 单位；修饰类 `.red/.amber/.cyan/.green/.blue` 改 `.v` 颜色 |
| `.sub-top` / `.sub-code` / `.sub-name` | 子系统小标头 | `.sub-code` 实心反白徽标（bg accent，色 `--kp-bg`） |
| `.sub-rows` / `.sub-row` | 键值行 | 左 2px accent 竖条，`.k` 12px / `.v` 17px |
| `.ov-row` | 院区总览行 | h40，`.ic` 26px 图标框 / `.nm` / `.vl > .n(22px)+.u` |
| `.dv-row` | 设备分类条形 | `.nm` 74px / `.tr` 6px 进度槽 / `.ct` 56px 右对齐数字 |
| `.on-wrap` / `.donut` / `.on-leg` | 在线率环图 | donut 150px，中心 `.n(26px)/.l/.p`；图例行 h44 虚线分隔 |
| `.lit-box` / `.bt` | 今日运行情况 | 3×2 grid，`.bt` 内 `.k(11px)/.v(19px)` |
| `.legend` | 图例 | `i` 8px 色块 |
| `.row-line` | 通用行 | h30 虚线底，`.vl` 右对齐加粗，修饰 `.ok/.warn/.bad` |
| `.chain` / `.node` / `.arrow` | 链路图（图2 中央） | node flex1，`.cn/.cv/.cl`，右上角状态 `.st.run/.warn/.stop` |
| `.heat` / `.cell` | 温度热力 | 8 列 grid，cell 内文字色 `--kp-bg`（深色字压亮底） |
| `.lst` / `.it` | 告警列表 | `.tg` 药丸标签（`.u/.m/.n/.ok`）+ `.tx` 省略号 + `.tm` 时间 |
| `.tbl` | 表格 | th 底边 1px accent 30%，td 虚线底，hover 行高亮 accent 8% |
| `.shafts` / `.shaft` / `.car` | 井道行程图 | shaft 26px 条纹重复渐变，`.car` 22px 轿厢，`.cap` 顶部标注 |
| `.funnel` / `.f` / `.fb` | 漏斗 | `.fb` h30，文字色 `--kp-bg` |
| `.tree` / `.b` / `.bh` / `.fl` / `.rm` | 空间树 | 三级缩进 16/30px |
| `.gauge` / `.score` | 健康度 | 46px 大数字，色 success，发光 |
| `.hcards` / `.hcard` | 6 台健康卡 | 6 列 grid，`.hn/.hv/.hs` |
| `.t7` | 权威面积表 | th 背景 `rgba(var(--kp-edge-rgb),.4)` + 2px accent 底边；tfoot 合计行 |
| `.ck` 系列 | 图1 S1–S7 图表 | `.ck-ring`(122px SVG 环) / `.dk-ctr` / `.ck-lg` / `.ck-kpis` / `.ck-svg` / `.ck-foot` |
| `.ck-tree` 系列 | S5 电力计量树 | `.ct-l0/.ct-br/.ct-l1/.ct-leaf/.ct-alert` |
| `.ck-gauges` / `.gm` | S6 热水机组环 | 86px 宽小环 |
| `.cb` 系列 | S7 电梯主卡 | 渐变卡 `.cb-t/.cb-nums/.cb-line/.cb-grid/.cb-cell/.cb-foot` |

---

## 9. 数据模式与仿真（A2 合规：禁止 mock 冒充真值）

```
.databadge          h26 药丸，顶栏内 margin-left:14
.databadge.m-demo   色/边 var(--kp-warn)，底 rgba(var(--kp-warn-rgb),.14)   文案：演示数据 DEMO DATA
.databadge.m-empty  色 var(--kp-fg-muted)/边 var(--kp-fg-subtle)            文案：未接入数据
.databadge.m-sim    色/边 var(--kp-accent)，底 rgba(var(--kp-accent-rgb),.14)
.nodatamask         0,48,1920,1032  z-index:55  底 rgba(4,16,30,.74) → rgba(var(--kp-bg-rgb),.74)
                    34px var(--kp-fg-muted) letter-spacing 4px
                    文案：未接入真实数据 / small：当前为「无数据」空态 —— 与演示数据严格区分，避免被误认为已接入
.simtabs / .simb    仿真剧本切换药丸，`.simb.on` 实心反白
.simpanel           right:18 top:60 width:296 z-index:56，`.on` 显示
                    行：全院总功率 kW / 今日用电 kWh / 单位面积能耗 Wh/m²·日 / 当前楼栋功率 kW / 活跃告警 条
                    canvas 268×64 迷你趋势
                    脚注：数据来源：本地仿真引擎（source=SIM）· 每 5 秒刷新 · **非实测数据**
```

`#note` 脚注文案（图1 右下）：
`* 部分指标为示意值（MOCK(PDF)）：在线/离线/告警、能源、告警、工单、运行概况、天气`

---

## 10. 与既有 DIY 系统的关系（不得废掉）

- **样式 DIY**（`styleToCssVars()` 行内注入 `.bs-scale-wrap`）继续生效：
  `--kp-bg` / `--kp-bg-deep` / `--kp-panel-alpha` / `--kp-radius-panel` / `--kp-radius-md` /
  强调色一组（仅当偏离默认值）。**新增令牌若需 DIY 可调，必须同时在此注入。**
- **布局 DIY**：参考页几何即为**新的默认布局**。第 6、7 节的 x/y/w/h 表格就是各屏 frame 的默认值，
  必须写进 `frontend/src/lib/bigscreen-layout.ts`。
- `mergeLayout` 复制字段清单不得漏：
  `x / y / w / h / frame / subsystem / title / titleSize / titleColor / borderColor`。

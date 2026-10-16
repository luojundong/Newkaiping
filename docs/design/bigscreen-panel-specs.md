# 大屏参考页 · 各屏面板 DOM 渲染规格（内容工实施手册）

> **用途**：给「内容工」逐面板 DOM 渲染规格，照抄成 Vue 组件。
> **单一真相源**：参考页 `D:\NewPrSz\bigscreen-portable\index.html`（业务 JS 在 L614–4245、L4247–5629；CSS L7–437；DOM L439–603）。第 611、4246 行为巨型行（内联 three.js / 3.99MB base64 模型），勿读。
> **配套契约**：`bigscreen-ref-style-v2.md` —— §6 图1 几何 / §7 子屏骨架几何 / §8 内容组件库 class 清单 / §6.4 图标→lucide 映射。
> **规则**：所有图表/列表/表格必须实现为 §8 的 Vue 组件，class 名照抄；图标全部换成 `lucide-vue-next`，不得内联 SVG；禁止硬编码颜色/emoji（见契约 §0）。
> **数据来源**：参考页全部为 `MOCK`/仿真占位（`?api=` 仿真引擎除外），无真实数据源。字段语义见各屏「数据字段」。

---

## 0. 跨屏公共机制（先读，所有屏通用）

| 机制 | 函数 | 行号 | 说明 |
|---|---|---|---|
| 标题栏注入 | `buildChrome()` | L4442–4464 | 遍历 `#stage .panel`，对每个带 `data-title` 的面板**前置** `.p-hd`（`.p-bar`+`.p-title`+`.p-chev`），面板末尾追加 4 个 `.c` 角标（`.c.tl/.tr/.bl/.br`）。内容工**只填 `data-title`/`data-icon`**，标题 DOM 自动生成 |
| 图标生成 | `ic(n,s,c)` / `ICON` 对象 | L4433–4437 / L4409–4432 | 内联 24 个 lucide 风 path；复刻时换成 `lucide-vue-next`（映射见 §6.4） |
| 图表原语 | `donut/lineChart/stackChart/hbarChart/waveChart/gauge/treeHTML/kpisHTML/tagHTML` | L4470–4561 / L5307–5355 / L5033–5042 | 全部生成 SVG 字符串，复刻为 §8 对应 Vue 组件 |
| 数据模式 | `applyDataMode()/setDataMode()` | L5487–5515 | demo/empty/sim 三态；`#dataBadge` 点击切换，`?mode=`+localStorage 记忆；每秒 tick 重新套用 |
| 仿真联机 | `simInit/simBuildTabs/simRefresh/simSeries` | L5526–5624 | 仅当 URL 带 `?api=` 时启用，每 5s 拉 `/api/v1/sim/summary`，写回 `#simPanel` |
| 天气 `#wx` | `buildWeather()` | L4571–4580 | **mock**（`MOCK.weather`）：云+温度 / 风 / 湿度，三段 + `.tb-sep` 分隔 |
| 楼栋导航 `#w_building_nav` | `buildNav()` | L4594–4613 | 10 个 `.btab`（`<no>号楼` + `.idx`层数F），默认 `selBuilding=3`（4 号楼）；hover→`#bldTip`，click→联动楼层/3D/图1 七宫格 |
| 楼栋气泡 `#bldTip` | `showTip()/hideTip()` | L4614–4637 | 楼栋名/层数/面积(null=待核)/设备台账合计/6 类设备明细 |
| 楼层列表 `#floor-body` | `renderFloors()` | L4648–4667 | 降序 `F{n}` 按钮 `.fl`，点击仅切换 `.on` 高亮 |

**图1 额外 3 个支撑面板**（DOM 中 `#bd-regulation` / `#bd-lifecycle` / `#bd-hvac`，非 S1–S7 七宫格，复刻时一并实现）：
- `#bd-regulation`（`bdRegulation()` L4910）：`.ov-row` ×4 —— 建筑总面积(`f2(AREA_TOTAL)` m²·已核8栋) / 覆盖楼栋(10栋) / 开放床位(`MOCK.beds`) / 在院人数(无源→`—`)
- `#bd-lifecycle`（`bdLifecycle()` L4930）：`.on-wrap`+`donut` —— 设备总数 `DEV_TOTAL`(1701)，在线/离线/告警三段（在线率）
- `#bd-hvac`（`bdHvac()` L4946）：`.kpis` —— 今日用电/用水/制冷 + `.ov-note`

---

## 1. 图1 主驾驶舱（scr1）— 几何见契约 §6

8 个面板（S1–S7 + 底条「今日运行情况」），由 `renderSubPanels(bi)`（L5357–5449）按当前选中楼栋 `selBuilding` 派生渲染；底条由 `bdLighting()`（L5021–5027）注入。

| 面板 | data-title（照抄） | 几何(x/y/w/h) | data-icon → lucide | body id | 渲染函数 |
|---|---|---|---|---|---|
| S1 | `S1 · 智慧能源一体化调控` | 40 / 192 / 420 / 212 | gauge → `Gauge` | `#w_s1` | renderSubPanels L5369 |
| S2 | `S2 · 设备生命周期管理` | 40 / 412 / 420 / 212 | cpu → `Cpu` | `#w_s2` | renderSubPanels L5376 |
| S3 | `S3 · 空调集中控制调度` | 40 / 632 / 420 / 212 | thermometer → `Thermometer` | `#w_s3` | renderSubPanels L5386 |
| S4 | `S4 · 智慧照明管理` | 40 / 852 / 420 / 212 | bulb → `Lightbulb` | `#w_s4` | renderSubPanels L5396 |
| S5 | `S5 · 医院电力监控` | 1460 / 192 / 420 / 288 | zap → `Zap` | `#w_s5` | renderSubPanels L5415 |
| S6 | `S6 · 热水集中控制调度` | 1460 / 488 / 420 / 288 | drop → `Droplet` | `#w_s6` | renderSubPanels L5420 |
| S7 | `S7 · 电梯节能管理` | 1460 / 784 / 420 / 288 | activity → `Activity` | `#w_s7` | renderSubPanels L5436 |
| 底条 | `今日运行情况` | 640 / 872 / 640 / 200 | chart → `BarChart3` | `#bd-lighting`（面板 `#panel-lighting`） | bdLighting L5021 |

### 1.1 各面板内部 DOM 结构与数据字段

**S1 智慧能源一体化调控**（`.ck` 环形图卡片）
```
<div class="ck">
  <div class="ck-row">
    <div class="ck-ring">{donut(120,50,13, share)}<div class="dk-ctr"><b>{本楼今日用能 kWh}</b><span>今日用能 kWh</span></div></div>
    <div class="ck-lg">{lr*}</div>     <!-- 4 行：空调系统/照明插座/动力设备/其他 占比% -->
  </div>
  <div class="ck-foot"><span>全院设备 {DEV_TOTAL} 台 · {N号楼 short}</span><span class="fb">环形图</span></div>
</div>
```
- 字段：`share`=图2 能耗占比(S2.share：空调系统42%/照明插座23%/动力设备21%/其他14%)；本楼今日用能 kWh = `18542 × 本楼面积 / AREA_TOTAL(117245.22)`（面积 null→`—`）；`.lr`=`<div class="lr"><span><i style=background:色></i>{nm}</span><b>{v}%</b></div>`。

**S2 设备生命周期管理**（`.ck` 堆叠柱）
```
<div class="ck">
  <div class="ck-kpis">{ck-kpi×4: 紧急/重要/一般/闭环}</div>
  <div class="ck-svg">{stackChart(384,104, days, [alarmU7红,alarmM7橙,alarmN7蓝])}</div>
  <div class="ck-foot"><span>近 7 日告警（紧急/重要/一般）</span><span class="fb">堆叠柱</span></div>
</div>
```
- 字段：`MOCK.alarmUrgent/Major/Minor`（12/36/98）、`MOCK.woDone7[6]`(闭环46)、`MOCK.alarmU7/M7/N7`(7日数组)、`MOCK.days`(日期标签)。

**S3 空调集中控制调度**（`.ck` 折线图）
```
<div class="ck">
  <div class="ck-kpis">{ck-kpi×4: 供水℃/回水℃/COP/EUC}</div>
  <div class="ck-svg">{lineChart(384,104,[S2.inWater,S2.outWater],days)}</div>
  <div class="ck-foot"><span>7 日冷冻水进出水温度（℃）</span><span class="fb">折线图</span></div>
</div>
```
- 字段：`S2.outWater[6]/inWater[6]`(末日温度)、`S2.cop`(4.82)、`S2.euc`(158.6)、`S2.inWater/outWater`(7日℃数组)。

**S4 智慧照明管理**（`.ck` 波浪图）
```
<div class="ck">
  <div class="ck-kpis">{ck-kpi×3: LED盏/功率kW/智能感应}</div>
  <div class="ck-svg">{waveChart(384,102, MOCK.power7, days, "#35C5FF","a1")}</div>
  <div class="ck-foot"><span>全院负荷 7 日平滑曲线（示意）</span><span class="fb">波浪图</span></div>
</div>
```
- 字段：LED 盏 = `round(11325 × 本楼面积 / AREA_TOTAL)`；功率 kW = `round(LED × 0.012)`；`MOCK.power7`(全院负荷7日，示意)。

**S5 医院电力监控**（`.ck` 树状图）
```
<div class="ck" style="justify-content:flex-start">
  <div class="ct-l0">{ic zap}{院区总计量名}<b>{总 kWh}</b></div>
  <div class="ct-br">
    <div class="ct-l1"><i></i>{动力支路}<b>{kW}</b></div>
    <div class="ct-leaf"><span><i></i>空调 {kW}</span><span><i></i>医疗 {kW}</span></div>
    ...照明支路/特殊用电同构...
  </div>
  <div class="ct-alert">{ic alert}{S4.abnormal[0].t}</div>
  <div class="ck-foot"><span>配电房 4 · 变压器 9 · 本楼 {powerKwh} kWh</span><span class="fb">树状图</span></div>
</div>
```
- 字段：`S4.tree[0]`(院区总计量→动力/照明/特殊 支路→末端房间：空调/医疗/公共照明/应急照明/手术室/ICU)、`S4.abnormal[0].t`(告警文案)、`powerKwh`(本楼派生)。

**S6 热水集中控制调度**（`.ck` 圆圈仪表）
```
<div class="ck">
  <div class="ck-gauges">
    <div class="gm">{gauge(84,0.78,"#35C5FF","78%")}<div class="gl">水箱水位</div><div class="gt">蓄热 39 t</div></div>
    <div class="gm">{gauge(84,0.85,"#34D98A","4.2")}<div class="gl">平均 COP</div><div class="gt">热泵群运行</div></div>
    <div class="gm">{gauge(84,0.62,"#FFB03A","55℃")}<div class="gl">出水平均温</div><div class="gt">管网 48℃</div></div>
  </div>
  <div class="ck-uni">{#1运行/#2运行/#3运行/#4待机/#5检修/#6运行}</div>
  <div class="ck-foot"><span>本楼热泵 {dev[3]} 台 · 全院 20 台</span><span class="fb">圆圈</span></div>
</div>
```
- 字段：`dev[3]`=本楼热泵台数；3 个 `gauge` 为固定示意值（水箱水位78%/平均COP4.2/出水平均温55℃）；`ck-uni` 6 台机组状态（示意，2运行/1待机/1检修…）。

**S7 电梯节能管理**（`.cb` 主卡）
```
<div class="cb">
  <div class="cb-t">电梯节能运行 · {N号楼}</div>
  <div class="cb-nums">{ni×3: 运行/总数 · 当前故障 · 维保中}</div>
  <div class="cb-line"></div>
  <div class="cb-grid">{cb-cell×4: 平均响应min/巡检完成%/运行可靠率%/维保计划日}</div>
  <div class="cb-foot"><i></i>当前聚焦楼栋 · {4号楼→"4号楼·妇产儿科大楼（F1 妇科一层）" | 其他→"N号楼 short"}</div>
</div>
```
- 字段：`S3.run/S3.total`(28/32)、`S3.fault`(2)、`S3.maint`(2)、`S3.resp`(5min)、`S3.patrol`(92%)、`S3.runRate`(96.9%)、`S3.maintain[0].d`(维保日)、`b.no/b.short`。

**底条 今日运行情况**（`.lit-box`）
```
<div class="lit-box">{bt×10}</div>    <!-- 每 .bt：<div class="k">{名}</div><div class="v">{值}<span class="u">{单位}</span></div> -->
```
- 10 行 KPI（名/单位）：在线设备 台 / 告警设备 台 / 今日用电 kWh / 今日用水 m³ / 今日制冷 kWh / 系统总数 空 / 今日巡视点位 个 / 今日巡检任务 % / 今日工单完成率 % / 今日碳排放(估) 吨。来源 `MOCK`（online/alarm/power/water/cooling/sysCount/patrolPts/patrolRate/woRate/carbon）。

---

## 2. 图2 空调与能源（scr2 · HVAC & ENERGY CONTROL）— 几何见 §7

统一渲染函数 `rS2()`（L5045–5105）。屏标题：`.st`「空调与能源管控驾驶舱」/ `.ss`「HVAC & ENERGY CONTROL」。8 面板：

| 位置 class | data-title（照抄） | data-icon → lucide | body id |
|---|---|---|---|
| `.panel.scenter` | 空调系统总览（冷机→冷却塔→水泵→末端） | wind → `Wind` | `#s2-link` |
| `.panel.col.col-l.pl1` | 分区温度热力 | thermometer → `Thermometer` | `#s2-zone` |
| `.panel.col.col-l.pl2` | 故障告警 | alert → `AlertTriangle` | `#s2-fault` |
| `.panel.col.col-l.pl3` | 运行策略 / 逆控状态 | leaf → `Leaf` | `#s2-strat` |
| `.panel.col.col-r.pl1` | 能效分析 | chart → `BarChart3` | `#s2-eff` |
| `.panel.col.col-r.pl2` | 能耗占比 | layers → `Layers` | `#s2-share` |
| `.panel.col.col-r.pl3` | 能耗排名（按楼栋） | building → `Building2` | `#s2-rank` |
| `.panel.sbot` | 运行趋势（进出水温） / 设备健康度 | activity → `Activity` | `#s2-bot` |

**#s2-link**（`.chain` 链路图）：4 节点 `冷机→冷却塔→冷冻水泵→热泵`，节点间 `.arrow`(`ic chev`)。
```
<div class="chain">
  <div class="node"><span class="st {run|stop}">运行/停</span><span class="cn">{nm}</span><span class="cv">{n} 台</span><span class="cl">{load}%</span><span class="cv">负载</span></div>
  <div class="arrow">{ic chev}</div> ... ×4
</div>
```
- 字段：`S2.link[]`{nm,n,load,st}（st:run/stop）。

**#s2-zone**（`.heat` 温度热力）：40 个 `.cell`（8 列×5 行），背景 `tempColor(t)` 蓝→橙→红插值（18–30℃）。
```
<div class="heat">{<div class="cell" style="background:{tempColor(t)}">{t}<small>℃</small></div> ×40}</div>
```
- 字段：`S2.zones[]`（40 个分区温度℃）。

**#s2-fault**（`.lst` 告警列表）：`.it`=`{tagHTML(lv)}`+`.tx`。
- 字段：`S2.faults[]`{t,lv}（lv:u/m/n，4 条）。

**#s2-strat**（`.row-line` 列表）：4 条策略(`S2.strategy[]`，前带 `ic leaf` + `vl ok`「已启用」) + 末尾逆控状态 `S2.invCtrl`。

**#s2-eff**（`.kpis`）：`kpisHTML([总能耗 kWh, EUC kWh/m²·a, 系统COP])` + `.ov-note`(EUC/COP 示意)。
- 字段：`S2.total`(18542)、`S2.euc`(158.6)、`S2.cop`(4.82)。

**#s2-share**（`.on-wrap`+`donut`）：donut(140,52,16, S2.share) + 中心「100% 总能耗占比」+ `.on-leg` 4 行。
- 字段：`S2.share[]`{nm,v,c}（空调系统42/照明插座23/动力设备21/其他14）。

**#s2-rank**（横向条形 `hbarChart`）：`hbarChart(442,200, S2.rank→{nm,val,color:cyan,unit:" kWh"})`，8 楼栋。
- 字段：`S2.rank[]`{nm,v}（3号楼8920/4号楼6210/8号楼4180/5号楼3120/2号楼2860/7号楼1640/6号楼980/10号楼620）。

**#s2-bot**（底条 flex 两栏）：左 `lineChart(520,92,[inWater,outWater],days)` + `.legend`(进水/出水)；右 `.hcards`(3列) 6 台设备健康度。
```
<div class="hcards" style="grid-template-columns:repeat(3,1fr)">{<div class="hcard"><div class="hn">{n}</div><div class="hv" style=color>{v}</div><div class="hs" style=color>{s}</div></div> ×6}</div>
```
- 字段：`S2.inWater/outWater`(7日℃)、`S2.health[]`{n,v,s,c}（冷机A96/冷机B92/冷却塔188/冷冻泵190/冷冻泵279/热泵群85）。

---

## 3. 图3 电梯安全（scr3 · ELEVATOR SAFETY）— 几何见 §7

统一渲染函数 `rS3()`（L5108–5147）。屏标题：`.st`「电梯安全运行驾驶舱」/ `.ss`「ELEVATOR SAFETY」。8 面板：

| 位置 class | data-title（照抄） | data-icon → lucide | body id |
|---|---|---|---|
| `.panel.scenter` | 电梯编号表 | grid → `Grid3x3` | `#s3-center` |
| `.panel.col.col-l.pl1` | 电梯总览 | users → `Users` | `#s3-over` |
| `.panel.col.col-l.pl2` | 故障告警 | alert → `AlertTriangle` | `#s3-fault` |
| `.panel.col.col-l.pl3` | 运行统计 | chart → `BarChart3` | `#s3-stat` |
| `.panel.col.col-r.pl1` | 实时位置（井道行程图） | chev → `ChevronRight` | `#s3-shaft` |
| `.panel.col.col-r.pl2` | 维保计划 | clipboard → `ClipboardList` | `#s3-maint` |
| `.panel.col.col-r.pl3` | 工单统计 | check → `CheckCircle2` | `#s3-wo` |
| `.panel.sbot` | 运行统计 / 平均响应 / 巡检 / 工单 | activity → `Activity` | `#s3-bot` |

**#s3-center**（`.tbl` 电梯编号表）：列 = 编号 / 所属楼栋 / 当前层 / 状态（状态色：运行绿/故障红/维保橙）。
- 字段：`S3.elevators[]`{id,b,f,st}（样例 8 台，总数 32）。

**#s3-over**（`.kpis`）：电梯总数/运行中/故障/维护。字段：`S3.total/run/fault/maint`(32/28/2/2)。

**#s3-fault**（`.lst`）：字段 `S3.faults[]`{t,lv}(2 条)。

**#s3-stat**（`.kpis`）+ `.ov-note`：字段 `S3.stat[]`{k,v,u,c}(运行统计96.9%/平均响应5min/巡检完成92%/本月工单38单)。

**#s3-shaft**（`.shafts` 井道行程图）：每台电梯一个 `.shaft`，`.car` 垂直位置按 `top=(100 - f/mx*100)%`。
```
<div class="shafts">{<div class="shaft"><div class="cap">{id}</div><div class="car" style="top:{100-f/mx*100}%">F{f}</div></div> ×4}</div>
```
- 字段：`S3.shafts[]`{id,f,mx}（DT-04 f5mx13 / DT-03 f11mx13 / DT-01 f8mx12 / DT-06 f2mx13）。

**#s3-maint**（`.lst`）：字段 `S3.maintain[]`{t,d}(4 条，右 `.tm` 日期)。

**#s3-wo**（`.stackChart` 堆叠柱）：`stackChart(442,180, days, [woNew青,woDone绿,woOver橙])`。字段 `S3.woNew/woDone/woOver`(7日数组)。

**#s3-bot**（`.kpis` 一行四卡）：运行统计/平均响应/巡检完成/本月工单（同 S3.stat 口径）。

---

## 4. 图4 供配电计量（scr4 · POWER & METERING）— 几何见 §7

统一渲染函数 `rS4()`（L5150–5187）。屏标题：`.st`「供配电与计量驾驶舱」/ `.ss`「POWER & METERING」。8 面板：

| 位置 class | data-title（照抄） | data-icon → lucide | body id |
|---|---|---|---|
| `.panel.scenter` | 配电总览（2 路 10kV + 2 变压器） | zap → `Zap` | `#s4-over` |
| `.panel.col.col-l.pl1` | 变压器负载 | chart → `BarChart3` | `#s4-load` |
| `.panel.col.col-l.pl2` | 馈线状态（6 路） | grid → `Grid3x3` | `#s4-feed` |
| `.panel.col.col-l.pl3` | 异常用能 | alert → `AlertTriangle` | `#s4-abn` |
| `.panel.col.col-r.pl1` | 计量体系树 | layers → `Layers` | `#s4-tree` |
| `.panel.col.col-r.pl2` | 需求趋势（近 7 日） | chart → `BarChart3` | `#s4-demand` |
| `.panel.col.col-r.pl3` | 电能质量（5 项） | activity → `Activity` | `#s4-qual` |
| `.panel.sbot` | 异常用能 / 能耗排名 / 能耗结构 | layers → `Layers` | `#s4-bot` |

**#s4-over**（flex 两栏）：左 4 行 `.row-line`(10kV 进线2路/1#变压器/2#变压器/运行方式) + 右 `hbarChart(420,150, transLoad)` + mini 说明。
- 字段：固定文案 + `S4.transLoad[]`{nm,v}（1#变压器58%/2#变压器66%）。

**#s4-load**（`.hbarChart`）：`hbarChart(442,200, transLoad, v>60?amber:green, "%")`。

**#s4-feed**（`.lst`）：6 路馈线，`.vl ok|warn`（正常/告警）。字段 `S4.feeders[]`{nm,st}（住院楼Ⅰ/Ⅱ段/门诊楼段/妇儿楼段warn/后勤段/放疗楼段）。

**#s4-abn**（`.lst`）：字段 `S4.abnormal[]`{t,lv}(2 条：妇儿楼段夜间尖峰超容/放疗楼瞬时冲击负荷)。

**#s4-tree**（`.tree` 计量体系树，`treeHTML()` 递归）：三级 `.b>.bh` + `.fl` + `.rm`。
```
<div class="tree">{<div class="b"><div class="bh">{ic layers}{nm}<span class="ct">{v}</span></div>
  {<div class="fl">{子支}<div style="margin-left:14px">{<div class="rm">{末端} · {v}</div>}</div></div>}</div>}</div>
```
- 字段：`S4.tree[0]`（院区总计量1,854kWh→动力支路982[空调620/医疗362] / 照明支路512[公共照明310/应急照明202] / 特殊用电360[手术室240/ICU120]）。

**#s4-demand**（`.lineChart`）：`lineChart(442,180,[demand],days)`。字段 `S4.demand[]`(7日 kWh：1680/1540/1720/1610/1850/1760/1854)。

**#s4-qual**（`.hbarChart` 带 max）：`hbarChart(442,200, quality, v>max?amber:green)`。字段 `S4.quality[]`{nm,v,u,max,st}(电压偏差2.1%/频率0.03Hz/谐波3.2%/三相不平衡1.8%/功率因数0.96)。

**#s4-bot**（底条 flex 三栏）：异常用能(`.lst`) / 能耗排名(楼栋 `hbarChart`) / 能耗结构(`donut(120,44,14, structure)`)。
- 字段：`S4.abnormal[]`、`S4.rank[]`{nm,v}(3号楼8920/4号楼6210/8号楼4180/5号楼3120/2号楼2860)、`S4.structure[]`{nm,v,c}(空调48/动力27/照明15/医疗10)。

---

## 5. 图5 告警工单（scr5 · ALARM & WORK ORDER）— 几何见 §7

统一渲染函数 `rS5()`（L5190–5233）。屏标题：`.st`「告警工单驾驶舱」/ `.ss`「ALARM & WORK ORDER」。8 面板：

| 位置 class | data-title（照抄） | data-icon → lucide | body id |
|---|---|---|---|
| `.panel.scenter` | 近 7 日告警趋势 | chart → `BarChart3` | `#s5-center` |
| `.panel.col.col-l.pl1` | 告警中心 | alert → `AlertTriangle` | `#s5-over` |
| `.panel.col.col-l.pl2` | 实时告警表 | clipboard → `ClipboardList` | `#s5-table` |
| `.panel.col.col-l.pl3` | 等级分布 | layers → `Layers` | `#s5-level` |
| `.panel.col.col-r.pl1` | 派单处置漏斗 | chev → `ChevronRight` | `#s5-funnel` |
| `.panel.col.col-r.pl2` | 响应时效 | clock → `Clock` | `#s5-resp` |
| `.panel.col.col-r.pl3` | 闭环统计 | check → `CheckCircle2` | `#s5-closed` |
| `.panel.sbot` | 处置流程 / 维护团队 | users → `Users` | `#s5-bot` |

**#s5-center**（大图 `.lineChart`）：`lineChart(858,468,[alarmU7红,alarmM7橙,alarmN7蓝],days)`。字段 `MOCK.alarmU7/M7/N7`(7日三级告警数)。

**#s5-over**（`.kpis` + `.ov-note`）：紧急/重要/一般。字段 `S5.urgent/major/minor`(24/38/56)。

**#s5-table**（`.tbl` 实时告警表）：列 = 告警内容 / 等级(`tagHTML`) / 时间。字段 `S5.alarms[]`{t,lv,tm}(5 条)。

**#s5-level**（`.on-wrap`+`donut`）：donut(140,52,16,[urgent红,major橙,minor蓝])，中心总数 `S5.levelDist`(118)。字段 `S5.urgent/major/minor/levelDist`。

**#s5-funnel**（`.funnel` 派单漏斗）：`.fb` 宽度 = `v/首值×100%`。
```
<div class="funnel">{<div class="f"><div class="fb" style="width:{v/首值*100}%">{nm} {v}</div></div>}</div>
```
- 字段：`S5.funnel[]`{nm,v}(告警产生118/自动派单110/现场响应98/处置中82/闭环76)。

**#s5-resp**（`.hbarChart`）：`hbarChart(442,200, resp, color:blue, "单")`（`S5.resp[]`{nm,v}：<5min62/5-15min34/15-30min18/>30min4）。

**#s5-closed**（`.lineChart`）：`lineChart(442,180,[closedNew青,closedDone绿],days)`。字段 `S5.closedNew/closedDone`(7日)。

**#s5-bot**（底条 flex 两栏）：左 5 步处置流程 pill（`S5.steps`：告警接入/智能派单/现场处置/审核验收/闭环归档）+ 右 维护团队人数 `S5.team`(48)（`ic users` + 大数字）。

---

## 6. 图6 空间设备运维（scr6 · SPACE & ASSET OPS）— 几何见 §7

统一渲染函数 `rS6()`（L5236–5264）。屏标题：`.st`「空间设备运维驾驶舱」/ `.ss`「SPACE & ASSET OPS」。8 面板：

| 位置 class | data-title（照抄） | data-icon → lucide | body id |
|---|---|---|---|
| `.panel.scenter` | 空间树（10 栋 → 楼层 → 科室） | area → `Maximize2` | `#s6-tree` |
| `.panel.col.col-l.pl1` | 巡检路线 | pin → `MapPin` | `#s6-route` |
| `.panel.col.col-l.pl2` | 资产档案 | layers → `Layers` | `#s6-asset` |
| `.panel.col.col-l.pl3` | 维护记录 | clipboard → `ClipboardList` | `#s6-rec` |
| `.panel.col.col-r.pl1` | 健康状态 | activity → `Activity` | `#s6-health` |
| `.panel.col.col-r.pl2` | 资产明细 | grid → `Grid3x3` | `#s6-asset2` |
| `.panel.col.col-r.pl3` | 实时告警 | alert → `AlertTriangle` | `#s6-alarm` |
| `.panel.sbot` | 设备定位 / 实时告警 | pin → `MapPin` | `#s6-bot` |

**#s6-tree**（`.tree` 空间树，`treeHTML()`）：三级 `.b>.bh`(楼栋+层数F) + `.fl`(楼层·科室)。
```
<div class="tree">{<div class="b"><div class="bh">{ic building}{nm}<span class="ct">{f}F</span></div>{<div class="fl">{楼层} · {科室}</div>}</div>}</div>
```
- 字段：`S6.tree[]`（由 `BUILDINGS` 派生：10 栋→`Math.min(floors,4)` 层→科室名[护士站/病房/设备间/诊室/药房/CT室/会议室]）。

**#s6-route**（`.lst`）：字段 `S6.routes[]`{t,d}(4 条巡检路线+频次)。

**#s6-asset**（`.kpis`）：资产总数/已定位/定位率。字段 `S6.assets`{total,located,rate}(1701/1685/99%)。

**#s6-rec**（`.lst`）：字段 `S6.records[]`{t,d}(4 条维护记录)。

**#s6-health**（`.gauge` 健康度）：`<div class="gauge"><div class="score">{health}</div><div class="lab">综合健康评分</div>{donut(120,44,14,[{v:health,c:green,total:100}])}</div>`。字段 `S6.health`(92，示意)。

**#s6-asset2**（`.hbarChart`）：`hbarChart(442,200, locate, unit:" 台")`。字段 `S6.locate[]`{nm,v,c}(分体机1626/多联机35/热泵20/螺杆机10/风冷模块8/水泵8/冷却塔2)。

**#s6-alarm**（`.lst`）：字段 `S6.alarms[]`{t,lv}(3 条)。

**#s6-bot**（底条 flex 两栏）：左 设备定位 `hbarChart(620,108, locate)`；右 实时告警 `.lst`(`S6.alarms`)。

---

## 7. 图7 权威建筑面积表（scr7 · AUTHORITATIVE GROSS AREA）

无 `.panel` 框架，仅 `.t7wrap`（几何 40 / 120 / 1840 / bottom:60）内含 `table.t7`。渲染函数 `rS7()`（L5267–5279）。

**DOM 结构（`.t7` 表格）**：
```
<div class="t7wrap"><table class="t7">
  <thead><tr><th>楼栋</th><th>名称</th><th>层数</th><th class="right">建筑面积 (m²)</th><th>状态</th></tr></thead>
  <tbody>
    {<tr><td class="bno">{no}号楼</td><td>{short}</td><td>{floors}</td>
        <td>{area===null ? <span class="pend">待核</span> : <span style="float:right">{f2(area)}</span>}</td>
        <td>{area===null ? <span class="pend">待核</span> : <span style="color:#34D98A">已核</span>}</td></tr> ×10}</tbody>
  <tfoot><tr><td colspan="3">合计（已核 8 栋）</td><td class="right">{f2(117245.22)}</td><td><span style="color:#34D98A">8 栋已核</span></td></tr></tfoot>
</table></div>
```
- 列名：楼栋 / 名称 / 层数 / 建筑面积(m²) / 状态。
- 数据源 `BUILDINGS[]`（L4261–4272），字段：`id/no/name/short/floors/area/dev[]`。
- **面积待核两栋**：`area===null` → 1 号楼(B01)、9 号楼(B09)，显示「待核」橙色，不计入合计。
- 合计：已核 8 栋 `AREA_TOTAL = 117245.22 m²`（`AREA_VERIFIED=8`）。

---

## 8. 数据来源与占位建议（关键发现）

参考页**全部 7 屏数据均为前端硬编码 `MOCK`/仿真占位**（除 URL `?api=` 接本地仿真引擎外无任何真实数据源）。据此对内容工/后端联调给出占位建议：

| 屏 | 参考页数据性质 | 复刻建议（接后端真实模块） |
|---|---|---|
| 图1 S1–S7 | 院区级聚合派生值（按选中楼栋面积/总数折算）+ 部分 `MOCK` 示意 | 接「院区总览/能源/设备」聚合接口，按 `BUILDINGS` 真实台账动态折算；S6 圆圈、S4 波浪为示意，后端给真值后替换 |
| 图1 今日运行情况 / 楼栋台账 | 权威盘点口径（`DEV_TOTAL`/面积/床位） | **接真实资产盘点**（building/device 模块），属可落地真实数据 |
| 图1 3D 场景 | 程序化院区 + 4 号楼真实 F1 glb | 沿用既有 TresJS 模型坐标（任务 #22） |
| 图7 建筑面积表 | **权威真实盘点**（10 栋面积，2 栋待核） | **接真实 building 模块**，1/9 号楼保持「待核」待客户确认 |
| 图2 空调与能源 | 全 `MOCK`（S2.*） | 接 HVAC/能源子系统 API（冷机/冷却塔/水泵/热泵运行 + 温度/能耗） |
| 图3 电梯安全 | 全 `MOCK`（S3.*） | 接电梯子系统（编号/状态/位置/维保/工单） |
| 图4 供配电计量 | 全 `MOCK`（S4.*） | 接电力计量（变压器/馈线/计量树/电能质量） |
| 图5 告警工单 | 全 `MOCK`（S5.*） | 接告警+工单模块（等级/漏斗/响应时效） |
| 图6 空间设备运维 | 全 `MOCK`（S6.*） | 接空间/资产/运维模块（空间树/巡检/健康/定位） |
| 天气 `#wx` | `MOCK.weather` | 接真实天气 API 或留占位（契约 `#note` 已标注示意值） |

**结论**：图1 楼栋台账、图7 建筑面积表为真实盘点口径，应优先接真实数据；图2–图6 各子系统在后端 7 子系统模块（任务 #11–#12）落地后即可接真实数据；图1 S1–S7 聚合值与图4 波浪/S6 圆圈等示意项，后端给真值前先按 `MOCK` 占位并保持「演示数据 DEMO DATA」徽章（§9 三态合规）。

## 9. 验收清单

- [x] 覆盖 7 屏全部面板（图1 八面板含底条 / 图2–6 各 8 面板 / 图7 表格），每面板含 DOM 结构 + 数据字段 + 渲染函数行号。
- [x] 几何来自契约 §6（图1）/ §7（图2–6）/ §7.1（图7 `.t7wrap`），图标来自 §6.4（lucide 映射）。
- [x] 组件 class 名全部来自 §8 内容组件库（`.kpis/.kpi/.chain/.heat/.lst/.tbl/.shafts/.funnel/.tree/.gauge/.hcards/.t7/.ck*/.cb*/.on-wrap/.donut/.lit-box` 等）。
- [x] 未修改参考页源码（本文件为独立规格文档）。
- [x] 数据占位与真实数据边界已在 §8 明确。

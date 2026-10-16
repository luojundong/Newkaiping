# 大屏 / 后台验收缺陷改造总览（2026-08-18）

围绕用户提出的 5 项需求，完成样式、布局、数据拆分与后台接口扩展，全部通过 `type-check` 与 `build` 验证，并已实测后端接口。

## 1. 管理后台白底文字改黑（#79）
- 文件：`frontend/src/styles/admin.css`
- 表单标签 / 输入框 / 文本域 / 下拉 / 分页 / 弹窗标题与正文 / 勾选/单选/开关标签 文字统一改为 `#1a1a1a`；Tab 保持浅色（后台为深色底，避免与白底表单冲突）。

## 2. 按楼层配置设备 + 按楼层显示（#80）
- 后端：`backend/.../devices/dto/device-query.dto.ts` 增加 `floor` 参数；`devices.service.ts` 在 `list()` 中按 `location.floor` 二次过滤。
- 前端 `DeviceAdmin.vue`：
  - 新增「楼层」筛选下拉（选项随所选楼栋层数动态生成）。
  - 新增「按楼层分组」开关：台账按 `location.floor` 聚合为楼层卡片墙（每层设备数 + 列表 + 编辑/删除）。
  - 支持从楼栋页通过 `?building=&floor=&new=1` 进入并预置筛选 / 自动打开新增。
- 前端 `BuildingAdmin.vue`：新增「楼层配置」标签页，按楼栋层数生成楼层卡片（显示每层设备数），提供「管理设备 / 新增设备」跳转至设备台账。

## 3. 复刻参考大屏 16+1 布局、无滚动（#81）
- `BigScreenLayout.vue`：改为「表头 / 中部(左·中·右) / 底部通栏」三行网格；右列贯穿中、底两行，底部占左+中两列（不伸入右侧面板）。`--kp-bottom-h` 调整为 150px。
- `LeftPanel.vue`（已完成）：1 个监控报警框（lucide 图标替换 font-awesome）。
- `RightPanel.vue`：11 个数据框 = 2×5 网格（空调/供配电/温度趋势/电压稳定度/湿度统计/负载趋势/能耗统计/电梯运行/用电趋势/设备在线量）+ 流量趋势通栏，整体 `overflow:hidden` 无滚动。
- `BottomBar.vue`：5 个数据框（数据来源及更新 / 能耗分项 / 当前状态 / 应急响应 / 科室告警），无滚动。所有框沿用参考工程的「四角装饰 + 斜切发光标题 + 暗蓝指挥舱」视觉（仅借用视觉，未引入其 Cesium/font-awesome/紫主题技术栈）。

## 4. 实时告警内容不重复（#82）
- `frontend/src/stores/bigscreen.ts`：新增 `dedupeAlarms()`，按 `key` 去重并合并计数；API 路径与 fixture 兜底路径均生效，避免同一子系统/设备告警重复出现。

## 5. 能耗趋势与分项拆分 + 预留后端接口（#83）
- 用电趋势（折线）保留在右栏；能耗分项（环形图，按子系统能耗占比）独立为底部「能耗分项」框——二者分离展示。
- 后端 `bigscreen.service.ts` 的 `panels()` 在 `bottom` 中扩展返回 `dataSources`（数据来源及更新）、`statusGauges`（当前状态三仪表）、`responses`（应急响应 6 项）、`deptAlarms`（科室告警柱状），均已随 `/api/v1/bigscreen/panels` 返回。
- 前端 `stores/bigscreen.ts` 同步扩展 `BigscreenPanels.bottom` 接口与 `makeFixture()` 兜底。

## 验证结果（实测）
- 前端：`vue-tsc` 类型检查通过；`vite build` 生产构建通过。
- 后端：`tsc --noEmit` 通过；重新 `nest build` 并重启 `start:prod`（:5168）。
- `/api/v1/bigscreen/panels`（带 token）：`bottom` 含 `energyTrend/bySubsystem/dataSources/statusGauges/responses/deptAlarms`；`left.alarmItems` 唯一无重复。
- 设备楼层筛选：`/devices?building_id=1&floor=1` = 27 台（该院共 139 台），`floor=3` = 29 台，过滤生效。

## 设计约束（P0，全程遵守）
- 暗蓝指挥舱主题（背景 #04101f 系 / 强调 #00E5FF）；`lucide-vue-next` 为唯一图标源（禁用 emoji、禁用 font-awesome）；无紫→粉渐变。
- 参考工程 `d:\wwwroot\all\bigscreen` 仅借其「框体形态 / 四角 / 斜切标题 / 布局密度」，未复用其技术栈（Cesium、font-awesome、紫色主题均被排除）。

## 访问方式
- 大屏：http://localhost:5169/bigscreen/overview
- 后台：http://localhost:5169/admin（楼栋管理 → 楼层配置；设备台账 → 楼层筛选 / 按楼层分组）

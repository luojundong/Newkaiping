# 开平中心医院能源管理平台 —— 七子系统功能排期路线图（GK-25）

> 作者：general-purpose-10（PM/架构 agent）
> 状态时间：2026-09-05
> 性质：**纯盘点 + 排期**，不写业务代码、不改任何 `src` 文件。
> 数据可行性判定依据：实际通读 `backend/src/` 各 controller/service + `common/connector` + `synthetic.aggregate.ts`，并核对 `docs/architecture/game-engine-refactor-status.md`。

---

## §0 结论摘要

| 项 | 数值 |
|---|---|
| 7 个子系统功能条款总数 | 23 条可交付 Story（SS-01 ~ SS-23） |
| 已实现（生产可用、真数据） | **0** |
| 部分实现（后端骨架/合成数据/基础 UI 存在，但缺真数据或完整功能） | **15** |
| 未实现（无端点 / 无引擎 / 无 UI） | **8** |
| 总工作量估算 | **≈168 人日** |
| 建议分期 | 3 期（见 §3） |

**诚实说明**：当前平台上 7 个子系统的"监控/控制"在**演示态**下可跑通（后端有完整端点骨架 + 合成数据，前端有 17 框 HUD 大屏 + 场景切换 + 空调遥控器基础版）。但**没有任何一条功能接入真实院区设备数据**——`RealConnector`（`backend/src/common/connector/real/real.connector.ts`）默认仍走 Mock，且 `DATA_SOURCE_MODE` 未设为 `real`、HTTP/MQTT/Modbus 环境变量均未配置（`real.connector.ts:26-36`）。因此所有能耗/碳排/设备指标均为**合成值（示范电价 0.8 元/kWh、碳因子 0.581 kg/kWh，`synthetic.aggregate.ts:9-10`）**，不能用于真实结算、审计或客户验收。

**建议分 3 期**：
- **Phase 1（P0，~70 人日）**：真实数据源接入打底 + 综合概述大屏 + 空调子系统（最成熟，已有遥控器）+ 设备档案基础。
- **Phase 2（P1，~55 人日）**：照明/电力/热水/电梯/设备生命 五个子系统功能闭环 + 计费/报表基础。
- **Phase 3（P2，~43 人日）**：策略组、智能感应、能源自审报告自动生成、单耗分析、年/月能耗性质统计、电表级明细等高级项。

---

## §1 后端真实接口清单（通读代码所得）

> 所有读数经 `Connector` 抽象；合成集合（`device_metrics / subsystem_status / energy_summary / energy_trend / regulation_overview / lifecycle_equipment / lifecycle_maintenance` 等）**永远走 Mock 回退**（`real.connector.ts:30-43` `SYNTHETIC_COLLECTIONS`）。真实适配器仅在 `DATA_SOURCE_MODE=real` + 配置 `HTTP_BASE_URL/MQTT_BROKER_URL/MODBUS_HOST` 后生效，且任意失败即回退 Mock。

| 模块 | 路径/端点 | 方法 | 是否有真实数据支撑 | 说明 / 代码位置 |
|---|---|---|---|---|
| scene | `/api/v1/scene/schema` `GET`；`/scene/schema` `PUT`（If-Match） | GK-01/03 | 是（物化器） | 11 段单一数据源，1983 节点 |
| energy | `/energy/summary`、`/energy/trend` | GET | **否（合成）** | `energy.controller.ts:11-24` → `energy_summary/energy_trend` 合成 |
| devices | `/devices` `GET/POST/PUT/DELETE`；`/devices/:id`；`/devices/:id/metrics/latest`、`/metrics`；`/devices/:id/control` | CRUD+指标+控制 | 部分（设备台账真实 CRUD，指标合成） | `devices.controller.ts:18-92`；指标读 `device_metrics` 合成（`devices.service.ts:66-88`） |
| control-groups | `/control-groups` `GET/POST/PUT/DELETE`；`/control-groups/:id/control` | 群组控制 | 否（合成下发回执） | `control-groups.controller.ts`；通用群组，**无策略/定时引擎** |
| billing | `/billing/prices`、`/billing/quotas`、`/billing/accounts`、`/billing/recharges` | 计费 | 部分（台账 CRUD，无真结算） | `billing.controller.ts` |
| history | `/history` `GET`（按楼/设备/子系统/时间）；`/history/export` CSV | 历史查询 | 否（合成指标） | `history.controller.ts:12-62` |
| alarms | `/alarms` `GET`；`/alarms/:id/ack`、`/clear`；`/alarms/rules` `GET/POST` | 告警 | 部分（规则 CRUD，数据为合成） | `alarms.controller.ts` |
| work-orders | `/work-orders` CRUD；`/work-orders/stats` | 工单 | 部分（台账 CRUD，无真维保流） | `work-orders.controller.ts` |
| gis | `/gis/config`、`/gis/tile-proxy` | 地图底图 | 是（瓦片代理，合规） | `gis.controller.ts`；**非电力监测数据** |
| reports | `/reports/export?type=history` CSV | 报表导出 | 否（仅历史 CSV） | `reports.controller.ts:15-40`；**无能源自审报告** |
| bigscreen | `/bigscreen/panels`、`/bigscreen/layout(s)`、`/bigscreen/config(s)` | 大屏 | 合成聚合 | `bigscreen.controller.ts`；`bigscreen.service.ts` 聚合 17 框数据 |
| regulation | `/regulation/overview`、`/regulation/control` | 综合调控 | 否（合成） | `regulation.controller.ts` → `regulation_overview` 合成 |
| hvac | `/hvac/status`、`/hvac/control` | 空调 | 否（合成） | `hvac.controller.ts` → `subsystem_status(hvac)` |
| lighting | `/lighting/status`、`/lighting/control` | 照明 | 否（合成） | `lighting.controller.ts`；**无定时/联动引擎** |
| power | `/power/status`、`/power/control` | 电力 | 否（合成，无电表台账） | `power.controller.ts` → `subsystem_status(power)` |
| hotwater | `/hotwater/status`、`/hotwater/control` | 热水 | 否（合成，无真设备对接） | `hotwater.controller.ts` |
| elevator | `/elevator/status`、`/elevator/control` | 电梯 | 否（合成，无真设备对接；CATEGORY_DEFS 无电梯类别） | `elevator.controller.ts` |
| lifecycle | `/lifecycle/equipment`、`/lifecycle/maintenance`、`/lifecycle/control` | 设备生命 | 否（合成） | `lifecycle.controller.ts` → `lifecycle_equipment/maintenance` 合成 |
| device-types / device-brands | `/device-types`、`/device-brands` CRUD | 设备类型/品牌 | 是（台账） | `device-types.controller.ts` |
| audit | `/audit_logs` 等 | 审计追溯 | 是（GMP/21CFR 方向） | 留痕体系已建，用于合规 |

**结论**：后端"接口面"已覆盖 7 子系统基本 status + control + 档案 CRUD，但**数据层 100% 合成**。真正的可交付前提是先把真实数据源打通（见 §4 阻塞项 1）。

---

## §2 功能点逐项拆解表

> 现状取值：已实现 / 部分 / 未实现（相对"用户描述的、含真实数据的可用功能"）。
> 编号规则：SS-01 … SS-23（SubSystem Story）。现状依据写具体文件:行或 API；确实无依据写"无"。

| 编号 | 子系统 | 需求条款 | 功能点 | 现状 | 现状依据（文件:行 / API） | 工作量(人日) | 依赖 | 优先级 | 风险/阻塞 |
|---|---|---|---|---|---|---|---|---|---|
| SS-01 | 综合概述 | 1.1 | 定制化采集用能信息（UPS/操作台/远程控制等）数据接入 | 未实现 | 无真实源；`real.connector.ts` 默认 Mock，适配器未配置 | 10 | 硬件/第三方接口 | P0 | 外部依赖，阻塞全平台真数据 |
| SS-02 | 综合概述 | 1.2 | "一个屏幕"监控全景/设备/用能/能源/碳排/趋势 | 部分 | 大屏 17 框 + 场景切换已落地（`game-engine-refactor-status.md` GK-06/07/18）；数据为合成 | 5 | SS-01 | P0 | 内容多为合成，需接真数据 |
| SS-03 | 综合概述 | 1.3 | 电耗/空调/热水/电梯/照明/配电间全面统计分析 | 部分 | `regulation_overview.by_subsystem` + `bigscreen` 聚合（`synthetic.aggregate.ts:207-230`、`bigscreen.service.ts:150-174`）合成，无分类深挖 UI | 8 | SS-01 | P0 | 合成值不可作结算依据 |
| SS-04 | 综合概述 | 1.4 | 空调/热水/电梯/电力/照明 监管控一体化集中控制统一展示 | 部分 | 各 `/x/control` 端点 + 通用 `control-groups` 存在；真实下发未接 | 10 | SS-01, GK-23 | P0 | 控制回执为 Mock，无真设备动作 |
| SS-05 | 综合概述 | 1.5 单耗分析 | 单耗分析（如 kWh/床、kWh/㎡） | 未实现 | 无端点；`energy_summary` 仅总量 | 6 | SS-01 | P1 | 需基准（床位/面积）主数据 |
| SS-06 | 综合概述 | 1.5 自审报告 | 能源自审报告自动生成 | 未实现 | 仅 `/reports/export?type=history` CSV（`reports.controller.ts:15`） | 12 | SS-03, SS-05 | P1 | 报告模板 + 合规口径复杂 |
| SS-07 | 综合概述 | 1.5 碳排分析 | 碳排分析 | 部分 | 碳因子已算 `carbon_kg`（`synthetic.aggregate.ts:10,219,276`）；缺真实因子配置与 UI | 4 | SS-01 | P0 | 碳因子为示范值 |
| SS-08 | 设备生命 | 2.1 | 设备档案管理（技术参数/生产/启用时间/数量/场地/厂家） | 部分 | `/devices` CRUD + `device-types/brands` + `lifecycle_equipment`（`synthetic.aggregate.ts:232`）；字段待补 | 5 | SS-01 | P0 | 档案字段不完整 |
| SS-09 | 设备生命 | 2.2 | 设备运行数据（工作时间/故障次数/维修记录） | 部分 | 设备 `metrics` 合成；无 per-device 工作时间/故障累计模型 | 8 | SS-01 | P1 | 运行台账模型缺失 |
| SS-10 | 设备生命 | 2.3 | 设备维护保养（维修记录/保养计划/维护费用） | 部分 | `/work-orders` CRUD + `lifecycle_maintenance` 合成（`synthetic.aggregate.ts:252`）；费用项缺失 | 6 | SS-01 | P1 | 维保费用/计划引擎弱 |
| SS-11 | 空调 | 3.1 | 按建筑/部门·楼栋/楼层/房间 批量远程操作（开关/温度/模式/节能/遥控） | 部分 | `RemoteControlDialog.vue` 基础版（开关/模式/温度/风速 + 控制组批量）；楼层/房间维度批量 + 节能命令待深化（GK-23 进行中） | 8 | SS-01, GK-23 | P0 | 真实批量下发未接 |
| SS-12 | 空调 | 3.2 | 每台空调电流/运行功率/运行时间/电量统计 | 部分 | `device_metrics` 合成（`devices.service.ts:66`）；缺电流/累计电量字段与 UI | 4 | SS-01 | P1 | 指标合成 |
| SS-13 | 空调 | 3.3 | 每层空调总体状况/运转汇总/能耗 | 部分 | 后端 `hvacStatus.perFloor` 已算（`synthetic.aggregate.ts:67-80`）；前端汇总 UI 未确认 | 3 | SS-11 | P1 | 依赖真实楼层设备 |
| SS-14 | 空调 | 3.4 | 内机基本信息（类型/品牌/类别）+ 当前运行参数（开关/模式/温度/累计用电量） | 部分 | `devices`+`metrics` 合成；品牌来自 `CATEGORY_DEFS`（`catalog.ts:43`） | 5 | SS-01 | P1 | 指标合成 |
| SS-15 | 空调 | 3.5 | 策略组：制冷下限/制热上限/开关机时间，多策略组成组绑定内机 | 未实现 | 仅通用 `control-groups`；无策略/定时/限值引擎 | 12 | SS-11 | P2 | 策略引擎为新建模块 |
| SS-16 | 照明 | 4.1 | 建筑/部门 集中控制 + 联动/定时/远程 | 未实现 | `/lighting/control` 仅通用单动作下发；无联动/定时引擎；`CATEGORY_DEFS` 无照明类别 | 10 | SS-01, GK-23 | P1 | 联动/定时引擎新建 |
| SS-17 | 照明 | 4.2 | 照明灯具楼栋能耗统计 | 部分 | `lightingStatus.energy_today_kwh` 合成（`synthetic.aggregate.ts:104-124`）；UI 未确认 | 3 | SS-01 | P1 | 合成 |
| SS-18 | 照明 | 4.3 | 特定场地智能感应 | 未实现 | 无传感器数据接口/逻辑 | 8 | SS-01, 硬件 | P2 | 需感应硬件+逻辑 |
| SS-19 | 电力 | 5.1 | 单个电表每日用电量统计 | 未实现 | `/power/status` 仅进线/相电压合成（`synthetic.aggregate.ts:126-154`）；无电表台账与日用量时序 | 8 | SS-01, 电表硬件 | P1 | 缺电表主数据+采集 |
| SS-20 | 电力 | 5.2 | 某时段某区域/组织用电明细查询 | 部分 | `/history` 可按设备/子系统/时间查（合成）；非"按组织/区域"口径 | 5 | SS-01 | P1 | 需组织/科室主数据 |
| SS-21 | 电力 | 5.3 | 区域按能耗性质年/月统计 | 未实现 | `energy_trend` 仅日粒度（`synthetic.aggregate.ts:279`）；无年/月/按性质聚合 | 6 | SS-01 | P2 | 聚合维度新建 |
| SS-22 | 热水 | 6.1 | 热水设备数据接口对接 + 集中控制调度 + 数据呈现 | 部分（合成） | `/hotwater/status|control` 合成（`synthetic.aggregate.ts:156`）；真实设备未对接 | 10 | SS-01, 热水设备 | P1 | 真实设备接口外部依赖 |
| SS-23 | 电梯 | 7.1 | 电梯储能回馈装置数据接口对接 + 统一管理 + 数据呈现 | 部分（合成） | `/elevator/status|control` 合成（`synthetic.aggregate.ts:179`）；`CATEGORY_DEFS` 无电梯类别，真实装置未对接 | 12 | SS-01, 电梯装置 | P1 | 真实装置外部依赖 |

---

## §3 分期排期建议

### Phase 1（P0，≈70 人日）—— 打底 + 概述 + 空调 + 设备档案
**目标**：打通真实数据接入样板，综合概述大屏可用（真数据），空调子系统监控/控制闭环（最成熟），设备档案基础。
- 包含：SS-01（数据接入样板）、SS-02、SS-03、SS-04、SS-07、SS-08、SS-11、SS-13、SS-14。
- 工期：约 70 人日（含联调与真数据验证）。
- 验收口径：至少 1 个真实数据源（如空调/电表）经 `RealConnector` 跑通并替代 Mock；综合概述大屏显示真值；空调可按楼栋批量下发且回执对应真设备。

### Phase 2（P1，≈55 人日）—— 五子系统功能闭环 + 计费报表
**目标**：照明/电力/热水/电梯/设备生命 各自 status+control+基础分析可用；工单/计费/报表基础成型。
- 包含：SS-05、SS-09、SS-10、SS-12、SS-15（策略组归入本期待空调成熟后）、SS-16、SS-17、SS-19、SS-20、SS-22、SS-23。
- 工期：约 55 人日。
- 验收口径：各子系统均接真数据并具备监控+控制+至少一项统计分析；电表有日用量时序；工单与维保有费用字段。

### Phase 3（P2，≈43 人日）—— 高级分析与智能化
**目标**：策略组引擎、智能感应、能源自审报告自动生成、单耗分析、年/月能耗性质统计。
- 包含：SS-06、SS-15（策略组深化）、SS-18、SS-21。
- 工期：约 43 人日。
- 验收口径：可配置策略组并绑定内机自动执行；自审报告一键生成可下载；单耗/年-月统计有图表与导出。

---

## §4 依赖与阻塞清单

1. **真实数据源接入（最致命阻塞）**：当前 `DATA_SOURCE_MODE` 未设 `real`，HTTP/MQTT/Modbus 环境变量均未配置（`real.connector.ts:26-43`）。所有 7 子系统、SS-01~SS-23 全部依赖此项；无真数据则"已实现"全为 0。
2. **硬件/第三方接口（外部）**：热水设备（SS-22）、电梯储能回馈装置（SS-23）、电表（SS-19）、智能感应传感器（SS-18）均需厂商提供采集接口/协议，属外部依赖，需商务/实施推动。
3. **设备主数据**：电梯/照明在 `CATEGORY_DEFS`（`catalog.ts:43`）无类别定义，需先补设备类型与主数据，否则台账/指标无法挂载（影响 SS-16/SS-19/SS-23）。
4. **组织/科室/床位/面积主数据**：单耗分析（SS-05）、按组织用电查询（SS-20）需先建科室/床位/建筑面积基准。
5. **前端大屏子系统深化（GK-21~GK-24 进行中）**：左侧楼栋导航、楼层平面图、空调/照明控制深化、七系统数据与综合概述——与 SS-02/SS-03/SS-04/SS-11 强耦合，须等这些并行任务收口。
6. **策略/定时/联动引擎（新建）**：SS-15/SS-16 需新建调度引擎，非现有 `control-groups` 通用组能覆盖。

---

## §5 风险登记

| 风险 | 等级 | 说明 | 缓解 |
|---|---|---|---|
| 数据缺失（全合成） | 高 | 所有指标为示范值，不能结算/审计/验收 | Phase 1 优先打通 ≥1 真实源并设 `DATA_SOURCE_MODE=real` |
| 硬件接入 | 高 | 热水/电梯/电表/感应依赖外部厂商，周期不可控 | 商务尽早锁定接口协议与时间表，先做 Mock 联调 |
| 性能（1842 设备点实时刷新） | 中 | 1842 点位 + WebSocket 实时订阅（`connector.subscribe`）；真实高频数据下需压测 | 分批订阅、聚合推送、前端节流；上线前压测 |
| 合规（审计追溯 GMP/21CFR Part11） | 中 | 控制/配置已留痕（`logs`/`audit_logs`），但自审报告（SS-06）需合规口径 | 报告模板与审计模块对齐，保留不可篡改记录 |
| 口径一致性 | 中 | 合成电价/碳因子为示范值，真数据接入后口径需重置 | 配置化电价/碳因子，避免硬编码（现 `synthetic.aggregate.ts:9-10`） |
| 范围蔓延 | 低 | 7 子系统条款细，易在 UI 层膨胀 | 严守 Story 边界，每 Story 独立验收 |

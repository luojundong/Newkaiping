# Spec - 开平市中心医院能源管理软件平台 v1.0

> 生成日期：2026-08-17
> 基于：PRD v1.1 + 架构设计文档 v1.0 + UIUX 设计系统 v1.1
> 状态：已确认（用户 2026-08-17 确认三文档 + 重申楼栋子系统可配置）
> 监理单位：大湾区靓仔（项目总监）

---

## 1. 产品定义

- **一句话描述**：以 1:1 三维数字孪生为底、覆盖全院 10 栋楼 7 大能源子系统的"监、管、控"一体化医院能源中台——模型驱动、混合数据（模拟→真实可切换）、100% 控制闭环、私有化买断交付。
- **目标用户**：医院后勤/能源管理值班人员、运维工程师、院领导、系统管理员。
- **核心问题**：医院能源数据孤岛、只监不控、计量失真、分析粗放、误报警疲劳；需统一"楼栋×子系统"联动的可视化管控平台。

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | RICE |
|--------|------|-------------|------|
| P0 | 顶部双联动导航（楼栋×子系统） | 顶部楼栋选择器(10+全院) + 子系统页签(7+综合概览) 切换，3D/左/右面板/WS 实时联动 | 15.0 |
| P0 | 混合数据层（Mock/真实热切换） | Connector 抽象 + 配置热切换，前端零改零感知 | 10.0 |
| P0 | 智慧能源一体化调控总览 | 总能耗/成本/碳排/负荷曲线 + 全院聚合 | high |
| P0 | 设备生命周期基础台账 | 设备档案（参数/厂家/启用时间/位置）+ 运行数据 + 维保计划 | high |
| P0 | 3D 数字孪生大屏骨架 | hospital.glb 占位，楼栋锚点 + 设备点位 + 点击联动 | high |
| P1 | 空调集中控制调度 | 楼内每层汇总、单台运行参数、策略组绑定内机 | 6.1 |
| P1 | 智慧照明管理 | 区域状态/能耗、联动/定时/远程控制 | - |
| P1 | 医院电力监控 | 电压/电流/功率/功率因数/谐波、日统计 | 7.2 |
| P1 | 热水集中控制调度 | 水温/流量/压缩机功率/COP/水箱温度 | - |
| P1 | 电梯节能管理 | 运行次数/能耗/储能回馈/待机 | - |
| P1 | 智能预警 | 阈值自定义、异常告警、告警跟踪处理 | 6.7 |
| P1 | 数据统计分析 | 日/月/年统计、趋势、报表导出 | - |
| P1 | 权限与系统管理 | 用户/角色/权限/操作日志/参数配置 | - |
| **P0** | **楼栋-子系统可配置** | **管理后台可为每栋楼勾选启用/停用子系统（2/3/5/7 个不定），进入某楼后仅展示启用项** | - |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 真实硬件采购与现场部署 | 合同 2.4.8 硬件由甲方自行完成，乙方仅免费配合适配 | 甲方到货后 |
| 真实设备协议对接（Modbus 寄存器表/MQTT 主题） | 待甲方网关/BMS 文档，R4 | 设备到货后 |
| 浅色后台管理主题完整 Token | 当前默认深色指挥舱主题，后台若需浅色后续补 | v1.1 |
| 能耗预存聚合表 | 采用 TimescaleDB 连续聚合实时算，少一处写入不一致 | 后续 |
| 多院区/集团级聚合 | MVP 聚焦单院 10 栋楼 | v2.0 |
| 移动端原生 App | 大屏 + PC 后台为主，移动端仅精简响应式 | 后续 |

## 4. 技术架构（锁定 — 含版本锚定）

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 前端框架 | Vue | ^3.5.27 | 与参考项目一致、团队熟悉 |
| 构建工具 | Vite | ^7.3.1 | 快、ESM |
| 语言 | TypeScript | ~5.9.3 | 前后端贯通 |
| 3D 引擎 | three + @tresjs/core | ^0.171.0 / ^4.3.0 | 院区封闭孪生无需地理球，替换参考 Cesium |
| 状态管理 | pinia | ^3.0.4 | 全局导航/实时状态 |
| UI 组件库 | element-plus | ^2.13.2 | 后台/表单/表格 |
| **SVG 图标库（锁定）** | **lucide-vue-next** | **^0.468.0** | **P0-1 全项目唯一图标源（ADR-002）** |
| 后端框架 | @nestjs/core + platform-fastify | ^11.0.0 | 模块化对应 7 子系统 |
| ORM | @nestjs/typeorm + typeorm | ^0.3.20 | TimescaleDB 超表支持 |
| 实时 WS | @nestjs/platform-socket.io + socket.io | ^11.0.0 / ^4.7.5 | 实时指标推送 |
| 鉴权 | @nestjs/jwt + passport-jwt | ^11.0.0 | JWT + RBAC |
| MQTT | mqtt | ^5.10.0 | 设备遥测 |
| Modbus | modbus-serial | ^8.0.0 | 寄存器轮询 |
| HTTP 客户端 | axios | ^1.13.0 | BMS 拉取 |
| 缓存/WS 扇出 | redis | ^7.4.0 | 实时缓存、限流（C1 可先进程内缓存顶替） |
| 关系+时序库 | postgres:16 + timescaledb:2.16.0-pg16 | 镜像锚定 | 单实例双引擎 |
| 反向代理 | nginx:1.27 | alpine | 大屏静态 + API 反代 |
| 容器编排 | docker-compose | v2.29 | 私有化部署 |

## 5. API 端点清单（锁定——前后端联调以 openapi.yaml 为唯一依据）

统一响应 `{ code:0, data:{}, message:"" }`；鉴权 `Authorization: Bearer <jwt>`。

### 5.1 系统/鉴权/场景
- `POST /api/v1/auth/login` 登录
- `POST /api/v1/auth/logout` 登出
- `GET  /api/v1/auth/me` 当前用户
- `GET  /api/v1/auth/menus` 顶部动态菜单（楼栋 + 子系统）
- `GET  /api/v1/features` 当前用户灰度开关
- `GET  /api/v1/scene/config` 3D 场景配置（model_url/building_anchors/camera_presets）
- `GET  /api/v1/scene/points?building_id=&subsystem=` 设备 3D 点位

### 5.2 楼栋 / 设备 / 指标 / 配置
- `GET  /api/v1/buildings`
- `GET  /api/v1/buildings/:id`
- `GET  /api/v1/buildings/:id/subsystems` 查该楼启用子系统清单（**楼栋子系统可配置**）
- `PUT  /api/v1/buildings/:id/subsystems` 后台配置启用/停用（body: [{subsystem_code, enabled, config_json}]）
- `GET  /api/v1/devices?building_id=&subsystem=&category=&status=`
- `GET  /api/v1/devices/:id`
- `GET  /api/v1/devices/:id/metrics/latest`
- `GET  /api/v1/devices/:id/metrics?from=&to=&keys=`
- `POST /api/v1/devices/:id/control` 下发控制

### 5.3 七子系统（每系统按 `?building_id=` 出该楼数据）
- `GET /api/v1/regulation/overview` 智慧能源一体化调控
- `GET /api/v1/lifecycle/equipment` 设备生命周期资产/健康分/维保
- `GET /api/v1/lifecycle/maintenance` 维保计划与记录
- `GET /api/v1/hvac/status` 空调；`POST /api/v1/hvac/control` 空调策略/开关/设定温度
- `GET /api/v1/lighting/status` 照明；`POST /api/v1/lighting/control` 照明联动/定时/远程
- `GET /api/v1/power/status` 电力
- `GET /api/v1/hotwater/status` 热水
- `GET /api/v1/elevator/status` 电梯

### 5.4 能耗与告警（跨子系统）
- `GET /api/v1/energy/summary?building_id=&period=`
- `GET /api/v1/energy/trend?building_id=&subsystem=&from=&to=`
- `GET /api/v1/alarms?building_id=&subsystem=&level=&status=`
- `POST /api/v1/alarms/:id/ack`；`POST /api/v1/alarms/:id/clear`
- `GET/POST /api/v1/alarms/rules`（后台阈值配置）

### 5.5 实时通道
- `WS /api/v1/ws/live`：客户端发送 `{building_id, subsystem, device_ids}`，服务端推送指标增量 + 告警事件。

## 6. 数据库表清单（锁定）

关系表（PostgreSQL）：`buildings`、`subsystems`、`device_categories`、`devices`、`device_points`、`users`、`roles`、`permissions`、`role_permissions`、`alarm_rules`、`alarms`、`energy_aggregations`、`connector_configs`、`scene_configs`、`feature_flags`、`operation_logs`、`menus`、**`building_subsystem_config`(id, building_id, subsystem_code, enabled, config_json, sort_order)**。

时序超表（TimescaleDB）：`device_metrics(time, device_id, metric_key, value, unit, quality, source)`、`energy_readings`(可选)。

设备台账初始数据约 1840 台（1–10 号楼；1 号楼 120 急救中心共用 2 号楼门诊大楼设备台账，约 139 台）。

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| 综合态势大屏 | /bigscreen/overview | ThreeViewer / BuildingMarker / AlarmScroller / SubsystemCard / TrendChart | scene/* + regulation/overview + alarms | dark-navy |
| 楼栋子系统切换视图 | /bigscreen/building/:id/:subsystem? | BuildingList / FloorSelector / SubsystemTabs / DevicePoint | buildings/:id + {subsystem}/status | dark-navy |
| 设备详情弹窗 | 弹层 | DeviceMeta / ParamGrid / RealtimeChart / ControlActions | devices/:id/metrics + control | dark-navy |
| 后台管理列表页 | /admin/{device\|alarm\|energy\|user\|role\|log\|building-subsystem} | AdminTable / FilterBar / ActionToolbar | 对应 CRUD | dark-navy |

## 8. 设计 Token（锁定）

> 完整值见 `docs/phase1/design-tokens.css` 与 `design-tokens.json`，前端通过 import 引用。

- **主色/背景**：`--kp-bg #04101f`、`--kp-surface #0B1424`、`--kp-accent #00E5FF`、`--kp-accent-secondary #1BE5AD`
- **语义色**：`--kp-success #2EE6A6`、`--kp-warn #FFC043`、`--kp-danger #FF4D5E`、`--kp-info #3B82F6`（DCI-P3 高饱和）
- **7 大子系统色**：energy `#00E5FF` / lifecycle `#94A3B8` / hvac `#1BE5AD` / lighting `#F59E0B` / power `#3B82F6` / water `#FB923C` / elevator `#F43F5E`
- **字体**：Inter + Noto Sans SC（显示/正文）、JetBrains Mono（数字/等宽）
- **图标库**：lucide-vue-next（16/20/24px）
- **主题**：默认 dark-navy；保留 green/amber 备选；**明令不内置紫→粉渐变**
- **大屏布局**：Header 108px + 左右面板 384px + 底部 176px；中央 3D 视口；4K/1080P 自适应
- **对标品牌**：Advantech WISE-IoT iEMS / 智碳 EMS / 腾讯智慧园区 / Sovit3D（禁用其紫粉渐变）

## 9. 验收标准（锁定——QA 测试以 EARS 格式为唯一依据）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 双联动导航 | While 用户切换楼栋选择器，系统**必须**刷新 3D 视角、左面板、右面板与 WS 订阅 | P0 |
| AC-02 | 楼栋子系统可配置 | If 某楼 `building_subsystem_config.enabled=false`，系统**必须**在顶部页签隐藏该子系统入口 | P0 |
| AC-03 | 混合数据切换 | While `DATA_SOURCE_MODE` 由 mock 切 real，前端**必须**无代码改动且数据来源经 API 透明切换 | P0 |
| AC-04 | 3D 点位联动 | When 用户点击设备点位，系统**必须**弹出该设备实时指标并订阅其 WS | P0 |
| AC-05 | 实时刷新 | While 实时模式开启，关键指标**应该**每 ≤3s 刷新 | P1 |
| AC-06 | 告警 | If 指标越过阈值，系统**必须**生成告警并推送 WS + 持久化 | P1 |
| AC-07 | 权限分级 | While 低权限账号访问高危控制，系统**必须**禁用对应按钮 | P1 |
| AC-08 | 数据加密 | While 数据传输，系统**必须**经 HTTPS/WSS + 密码 bcrypt | P0 |
| AC-09 | 控制同步延迟 | While 用户下发控制 / 模型同步，系统**必须**在 100–500 毫秒内完成并回写状态 | P1 |

## 10. 边界与约束

- 不支持 IE；兼容主流 Chromium 内核浏览器。
- 响应式断点：≥3840×2160 标准；1920×1080 面板收窄；<1440px 大屏视图提示使用大屏设备。
- 性能目标：大屏实体 ≤200（LOD 三级：楼栋/子系统/关键设备，海量分体机下钻面板）；首屏加载流畅。
- 部署：甲方单机（Xeon 8C/64G/RTX/1TB+4TB），内网隔离，Docker Compose 私有化。
- 模拟数据 MVP 默认；真实接口灰度切换。
- **控制/模型同步延迟目标（R2 已补）**：100–500 毫秒（甲方 2026-08-17 确认），验收以此为据（见 AC-09）。

## 11. 内嵌已知坑（从项目记忆拉取）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| Three.js 替换 Cesium 需重写参考项目 3D 部分 | three/@tresjs | 参考项目用 Cesium 经纬度，本院区用局部坐标 | 重写 CesiumViewer 为 ThreeViewer，点位用 {x,y,z} 局部坐标 |
| 图标库混用风险 | lucide-vue-next/element-plus | 双库并存导致样式不一致 | 全项目仅 lucide-vue-next，element-plus 图标仅组件内部（ADR-002） |
| 时序写入不一致 | timescaledb | 预存聚合表与超表双写 | 用连续聚合实时算，不预存 |
| 1 号楼设备台账缺失 | devices | 合同无设备数量 | 架构预留 building_id=1，台账到位即解锁 |

## 12. 端到端验证步骤（Spec 锁定）

```bash
# 1. 构建前端
cd frontend && npm install && npm run build
# 2. 启动后端（默认 mock 模式）
cd backend && npm install && npm run start:dev
# 等待 "Nest application successfully started"
# 3. 核心成功流：登录取 token
curl -X POST http://localhost:5168/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
# 断言：返回 200 + token
# 4. 双联动：查某楼启用子系统
curl -X GET http://localhost:5168/api/v1/buildings/2/subsystems -H "Authorization: Bearer <token>"
# 断言：返回该楼 enabled=true 的子系统清单
# 5. 配置某楼子系统（后台可配置）
curl -X PUT http://localhost:5168/api/v1/buildings/2/subsystems -H "Authorization: Bearer <token>" -d '[{"subsystem_code":"hvac","enabled":true}]'
# 断言：返回 200，配置生效
# 6. 大屏加载：浏览器打开 /bigscreen/overview，确认 3D 模型 + 双联动菜单渲染
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-08-17 | 初版 Spec 生成 | 用户确认三文档 + 重申楼栋子系统可配置 | 全局锁定 |
| 2026-08-17 | R1 解决 | 1 号楼 120 急救中心共用 2 号楼门诊大楼设备台账（约 139 台），building_subsystem_config 启用同 2 号楼 | §6 / buildings·devices 种子 |
| 2026-08-17 | R2 解决 | 控制/模型同步延迟目标补全为 100–500 毫秒（AC-09） | §9 / §10 |
| 2026-08-17 | 3D 真实点位坐标 | 楼栋锚点按院区网格布局；设备点位坐标由后端 scene 种子提供，替换前端按楼栋生成的局部坐标 | §5 / scene |
| 2026-08-17 | RealConnector | 实现 Modbus/MQTT/HTTP 真实数据源适配器，灰度切换，不可达回退 mock | ADR-003 |

---

## 附：ADR 索引（详见 docs/decisions/）

| 编号 | 标题 | 结论 |
|------|------|------|
| ADR-001 | 3D 渲染引擎选型 | Three.js（TresJS）替代 Cesium |
| ADR-002 | 图标库锁定 | lucide-vue-next（SVG，唯一图标源） |
| ADR-003 | 数据源混合模式 | Connector 抽象 + 工厂 + 配置热切换 |
| ADR-004 | 数据库选型 | PostgreSQL 16 + TimescaleDB 2.16 单实例 |
| ADR-005 | 后端框架选型 | NestJS（Fastify）+ TypeScript |
| ADR-006 | 顶部导航联动模型 | 楼栋选择器 + 子系统页签双维联动 |

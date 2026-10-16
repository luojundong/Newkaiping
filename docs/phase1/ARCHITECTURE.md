# 开平市中心医院能源管理软件平台 — 架构设计文档（Phase 1）

- 文档版本：v1.0（Phase 1 选型与架构基线）
- 作者：高见远（首席架构师）
- 日期：2026-08-17
- 适用范围：MVP 阶段技术选型、架构基线、数据模型、API 契约、部署基线
- 关联文档：
  - `docs/decisions/ADR-001.md` ~ `ADR-006.md`（架构决策记录）
  - `docs/phase1/openapi.yaml`（机器可读 API 契约，前后端联调唯一依据）
  - `docs/spec/`（PRD，由 PM 维护）

> P0 合规声明：本文档及 API 文档全程不使用 emoji；图标方案已锁定为 SVG 图标库 `lucide-vue-next`（与 UIUX 设计系统对齐，全项目唯一图标源，见 ADR-002）。

---

## 1. 项目背景与范围

### 1.1 建设目标
为开平市中心医院建设覆盖全院 10 栋楼、每栋楼具备 7 个子系统的能源管理软件平台，完成物理场景 1:1 数字化建模、实时数据联动、态势可视化、智能预警与数据分析，实现"监、管、控"一体化。

### 1.2 十栋楼与设备台账（已确认）

| 楼栋 | 名称 | 关键设备（来自台账） |
|------|------|----------------------|
| 1号楼 | 120急救中心（急诊科） | 急诊科业务场景（设备台账待现场调研补充） |
| 2号楼 | 门诊大楼 | 螺杆机制冷机组×2、水泵×2、冷却塔×2、多联机×4、分体机×128、空气能热泵热水机组×1 |
| 3号楼 | 住院大楼 | 风冷模块机组×2、分体机×690、空气能热泵热水机组×6 |
| 4号楼 | 妇产儿科大楼 | 风冷模块机组×4、水泵×3、多联机×23、分体机×236、空气能热泵热水机组×4 |
| 5号楼 | 张襯大楼 | 多联机×8、分体机×126 |
| 6号楼 | 后勤楼 | 分体机×62 |
| 7号楼 | 药剂楼 | 风冷模块机组×2、水泵×3、分体机×75 |
| 8号楼 | 余锦炯大楼/放疗楼 | 分体机×73、空气能热泵热水机组×2 |
| 9号楼 | 综合大楼 | 分体机×200、空气能热泵热水机组×4 |
| 10号楼 | 宿舍楼 | 分体机×36、空气能热泵热水机组×3 |

设备总量约 1600+ 台空调类设备 + 制冷主机/热泵/水泵/冷却塔等关键设备。

### 1.3 七子系统（合同 2.4 节）
1. 智慧能源一体化调控平台（regulating / overview）
2. 设备生命周期管理系统（lifecycle）
3. 空调集中控制调度系统（hvac）
4. 智慧照明管理系统（lighting）
5. 医院电力监控系统（power）
6. 热水集中控制调度系统（hotwater）
7. 电梯节能管理系统（elevator）

### 1.4 合同硬性约束（摘要）
- 四层架构：设备感知层 + 数据中台层 + 后端服务层 + 前端可视化渲染层。
- 数据库：高性能「关系型 + 时序」组合。
- 协议：HTTP / MQTT / Modbus / TCP/IP 主流物联网协议。
- 部署：本地服务器 / 私有化部署（医院内网，非公网云）。
- 安全：传输与存储加密、分级角色权限、操作日志全程留存、防篡改防泄露。
- 实时：常规数据实时同步，关键设备毫秒级；控制指令工业级时延。
- 可扩展性：预留功能/设备接入接口，支持后续扩容迭代。

### 1.5 参考项目（D:\wwwroot\all\bigscreen）借鉴点
- UI 风格：3D 模型 + 左右数据面板 + 顶部菜单联动（保留）。
- 状态管理：`sceneStore`（Pinia）承载 `selectedBuilding / activeSubsystem / realtimeMode / weatherType / themeType`。
- 轮询封装：`useLive(fn, interval)` 周期刷新（保留思路，改为对接本平台 API）。
- 场景配置：`haibing.json`（models/annotations）-> 本平台改为后端 `scene_configs` 表 + `/api/v1/scene/*` 接口，支持后台热替换模型。
- 3D 引擎：参考用 Cesium（地理球 + 经纬度）。按需求「技术栈另选、扩展性强」，**改为 Three.js**（见 ADR-001）。

---

## 2. 技术选型对比矩阵

评分维度（权重）：学习成本(高)、生态成熟度(高)、部署成本(高)、团队熟悉度(高)、扩展性(低，MVP 不计远期)。每项 1–5 分，加权求和。

### 2.1 前端框架与 3D 渲染方案

| 方案 | 技术组成 | 学习成本 | 生态成熟度 | 部署成本 | 团队熟悉度 | 扩展性 | 加权分 | 结论 |
|------|----------|----------|------------|----------|------------|--------|--------|------|
| A（推荐） | Vue3 + Vite + TS + **Three.js**（TresJS 声明式封装） + Pinia + Element Plus | 4 | 5 | 5 | 4 | 5 | **23** | 采用 |
| B（参考栈） | Vue3 + Vite + TS + Cesium + Pinia + Element Plus | 3 | 4 | 3 | 5 | 3 | 21 | 备选（保留） |
| C | React + Three.js + Zustand + Ant Design | 3 | 5 | 5 | 2 | 5 | 20 | 不采用 |

- 选 A 理由：医院园区是封闭数字孪生场景，无需 Cesium 的地理球/在线底图；Three.js 以「模型局部坐标」放置设备点位，定位更精确、包体更轻、后期可扩展热力图/标注/后处理；TresJS 提供 Vue3 声明式场景图，可维护性高；保留团队 Vue3 熟悉度。
- 不采用 C：团队以 Vue 技术栈为主，切换 React 学习成本与风险偏高，MVP 阶段不划算。

### 2.2 后端框架

| 方案 | 技术组成 | 学习成本 | 生态成熟度 | 部署成本 | 团队熟悉度 | 扩展性 | 加权分 | 结论 |
|------|----------|----------|------------|----------|------------|--------|--------|------|
| A（推荐） | Node.js + **NestJS（Fastify 平台）+ TypeScript** | 4 | 5 | 5 | 4 | 5 | **23** | 采用 |
| B | Node.js + Fastify + TypeScript（轻量手写分层） | 5 | 4 | 5 | 4 | 4 | 22 | 备选 |
| C | Python + FastAPI | 4 | 5 | 5 | 2 | 5 | 21 | 不采用 |
| D | Go + Gin | 3 | 4 | 5 | 1 | 5 | 18 | 不采用 |

- 选 A 理由：TS 前后端贯通（共享类型）；NestJS 模块化架构与「7 子系统 = 7 模块」天然契合；`mqtt.js` / `modbus-serial` / `axios` 生态成熟；Fastify 平台性能好。
- 不采用 C/D：与团队前端主语言不一致，MVP 开发效率与协作成本不优。

### 2.3 数据库（关系型 + 时序组合）

| 方案 | 技术组成 | 学习成本 | 生态成熟度 | 部署成本 | 团队熟悉度 | 扩展性 | 加权分 | 结论 |
|------|----------|----------|------------|----------|------------|--------|--------|------|
| A（推荐） | **PostgreSQL 16 + TimescaleDB 2.16**（单实例双引擎） | 4 | 5 | 5 | 4 | 5 | **23** | 采用 |
| B | PostgreSQL + InfluxDB（双库） | 3 | 5 | 3 | 3 | 5 | 21 | 备选 |
| C | MySQL + InfluxDB | 4 | 5 | 3 | 3 | 4 | 20 | 不采用 |

- 选 A 理由：单实例同时承载关系表（楼栋/设备/用户）与时序超表（指标），`time_bucket` 聚合、压缩、连续聚合（continuous aggregate）开箱即用；运维只需管一个库，契合医院内网单机部署。
- 不采用 B/C：双库带来双份运维、跨库关联复杂，MVP 阶段不必要。

### 2.4 实时数据协议适配层（MQTT / Modbus / TCP / HTTP）

| 协议 | 适配库（Node） | 用途 | 模式 |
|------|----------------|------|------|
| MQTT | `mqtt`（mqtt.js v5） | 设备/网关遥测上报、平台下发控制 | 订阅/发布 |
| Modbus TCP/RTU | `modbus-serial` v8 | 电表、PLC、制冷主机寄存器轮询 | 周期轮询 |
| HTTP | `axios` v1 | 既有 BMS / 第三方系统拉取 | 周期轮询 |
| TCP（裸协议） | `net` | 自定义二进制/私有协议网关 | 长连接 |

统一抽象为 `Connector` 接口：`connect()` / `subscribe(deviceId)` / `read(point)` / `normalize(raw): Metric`，由 `ConnectorFactory` 按 `connector_configs` 实例化（见 ADR-003、第 6 节）。

### 2.5 部署方式

| 方案 | 组成 | 结论 |
|------|------|------|
| A（推荐） | **Docker Compose 单机私有化**：Nginx(前端大屏) + NestJS + PostgreSQL/TimescaleDB + Redis + (可选) EMQX(MQTT Broker) | 采用 |
| B | Kubernetes 集群 | MVP 过重，预留 |
| C | 公网云（CloudBase/Vercel） | 不合合同「私有化部署」约束，不采用 |

- 选 A 理由：合同要求本地/私有化部署，且甲方服务器为单机（Xeon 8C/64G/RTX）。Docker Compose 一键拉起，内网隔离，满足安全与运维要求；后续可平滑迁移 K8s。

---

## 3. 技术栈选型结论与版本锚定

| 分层 | 技术 | 版本锚定 | 说明 |
|------|------|----------|------|
| 前端框架 | Vue | ^3.5.27 | 与参考项目一致 |
| 构建工具 | Vite | ^7.3.1 | |
| 语言 | TypeScript | ~5.9.3 | |
| 3D 引擎 | three | ^0.171.0 | 数字孪生渲染 |
| 3D 声明式封装 | @tresjs/core / @tresjs/cientos | ^4.3.0 | Vue3 场景图 |
| 状态管理 | pinia | ^3.0.4 | |
| UI 组件库 | element-plus | ^2.13.2 | 后台/表单/表格 |
| **SVG 图标库（锁定）** | **lucide-vue-next** | **^0.468.0** | **与 UIUX 设计系统对齐（P0-1 全项目唯一图标源，见 ADR-002）** |
| 后端框架 | @nestjs/core + @nestjs/platform-fastify | ^11.0.0 | |
| ORM | @nestjs/typeorm + typeorm | ^0.3.20 | 支持 TimescaleDB 超表自定义迁移 |
| 实时 WS | @nestjs/platform-socket.io + socket.io | ^11.0.0 / ^4.7.5 | 实时指标推送 |
| 鉴权 | @nestjs/jwt + @nestjs/passport + passport-jwt | ^11.0.0 | JWT + RBAC |
| MQTT | mqtt | ^5.10.0 | 设备遥测 |
| Modbus | modbus-serial | ^8.0.0 | 寄存器轮询 |
| HTTP 客户端 | axios | ^1.13.0 | BMS 拉取 |
| 缓存/WS 扇出 | redis | ^7.4.0 | 实时缓存、限流 |
| 关系+时序库 | postgres:16 + timescale/timescaledb:2.16.0-pg16 | 镜像锚定 | 单实例 |
| 反向代理 | nginx:1.27 | alpine | 大屏静态 + API 反代 |
| 容器编排 | docker-compose | v2.29 | 私有化部署 |

---

## 4. 系统架构（四层对齐合同）

```
+---------------- 前端可视化渲染层 (Vue3 + Three.js 大屏) ----------------+
|  顶部菜单(楼栋选择器 + 子系统页签)   左数据面板      中央3D场景      右数据面板 |
|  sceneStore(selectedBuilding, activeSubsystem, realtimeMode)            |
|  API Client(axios) + WS Client(socket.io)  ->  统一 /api/v1 + /ws/live  |
+-------------------------------------------------------------------------+
                 |  HTTPS / WSS                         (内网)
+---------------- 后端服务层 (NestJS + Fastify) --------------------------+
|  Gateway(Auth/JWT/RBAC, 限流) | 7 子系统 Module | 告警引擎 | 控制指令服务 |
|  ConnectorFactory: 按 connector_configs 实例化 Mock / MQTT / Modbus / HTTP|
+-------------------------------------------------------------------------+
                 |  归一化 Metric / 控制回执
+---------------- 数据中台层 ( ingestion + storage ) ---------------------+
|  Connectors(适配层) -> normalize() -> Redis(热缓存) -> TimescaleDB       |
|  device_metrics(超表) | energy 连续聚合 | 关系表(楼栋/设备/用户)          |
+-------------------------------------------------------------------------+
                 |  MQTT/Modbus/TCP/HTTP（协议适配）
+---------------- 设备感知层 (甲方既有，乙方不采购) -----------------------+
|  传感器/智能表/PLC/制冷主机/热泵/空调/照明/电梯  ->  网关/BMS  ->  Broker |
+-------------------------------------------------------------------------+
```

说明：
- 数据中台层是「模拟/真实混合切换」的核心——前端只认 API，切换发生在 Connector 层，前端零改动（见第 6 节）。
- 前端大屏与后台管理共用同一套 NestJS API；大屏走只读聚合接口，后台走读写/配置接口。

---

## 5. 数据流图（混合模式）

### 5.1 实时模式（真实接口）
```
设备/网关 --MQTT/Modbus/HTTP--> Connector(适配+normalize) --Metric--> Redis(热) --> TimescaleDB(device_metrics)
                                                                         |
                                                              WS Gateway --push--> 大屏(sceneStore + 面板)
控制指令: 大屏/后台 --> POST /api/v1/{subsystem}/control --> 控制服务 --> Connector.send() --> 设备/网关
```

### 5.2 模拟模式（MVP 默认）
```
MockConnector(按设备类别生成合成时序: 随机游走+昼夜曲线) --Metric--> Redis(热) --> TimescaleDB(可选, 亦可只进缓存)
                                                                         |
                                                              WS Gateway --push--> 大屏
```
- 切换开关：`DATA_SOURCE_MODE=mock|real`（全局），并支持 `connector_configs.source_mode` 按设备/楼栋/子系统粒度覆盖（灰度切换真实设备）。
- 前端完全无感知：两种模式走同一条 `getDeviceMetrics` / WS 推送路径。

### 5.3 3D 模型点位与设备数据联动
```
scene_configs(model_url, building_anchors, camera_presets)
        +  device_points(device_id, position{x,y,z}, marker_type, level_of_detail)
                    |
                    v
大屏加载 /api/v1/scene/config + /api/v1/scene/points?building_id=&subsystem=
                    |
                    v
Three.js 在模型局部坐标放置点位标记(楼栋级/子系统级/关键设备级)
   - 点击标记 -> 取 device_id -> GET /devices/:id/metrics/latest + 订阅 WS(device_id)
   - 选中楼栋 -> 相机飞向 building_anchor + 高亮该楼 + 过滤 subsystem 点位
   - 切换子系统页签 -> 过滤对应 subsystem 点位 + 右面板渲染该子系统视图
```
- `hospital.glb` 作为占位模型：后端 `scene_configs.model_url` 默认指向 `/resources/models/hospital.glb`；替换模型 = 后台改配置 + 投放新 `.glb`，前端无需改代码（满足「后台可直接替换」）。
- 点位精度：以模型局部坐标 `{x,y,z}` 存储，避免 Cesium 经纬度偏差；关键设备（制冷主机/热泵/水泵/冷却塔/多联机）放置独立点位，分体机/照明等海量设备以「楼栋级/子系统级聚合点位」呈现，下钻在面板查看明细（LOD 策略，见第 8 节）。

---

## 6. 模拟数据与真实接口的切换机制（核心可行性）

设计要点：
1. **统一 Metric 模型**：`Metric { time, device_id, metric_key, value, unit, quality, source }`，真实与模拟数据格式一致。
2. **Connector 抽象**（代码契约）：
   ```ts
   interface Connector {
     connect(): Promise<void>;
     read(deviceId: string, keys: string[]): Promise<Metric[]>;
     subscribe(deviceId: string, cb: (m: Metric) => void): void;
     send(deviceId: string, cmd: ControlCommand): Promise<Ack>;
   }
   ```
3. **MockConnector**：依据 `device_categories.default_metrics` 自动生成合成数据（含昼夜负荷曲线、设备启停、偶发故障用于演示告警）。
4. **RealConnectors**：`MqttConnector` / `ModbusConnector` / `HttpConnector` 各自实现 `normalize(raw)` 映射到统一 Metric。
5. **ConnectorFactory + connector_configs 表**：每行配置 `source_mode / endpoint / topic / register_map / poll_interval`，支持：
   - 全局默认 `mock`；
   - 单设备/单楼栋/单子系统覆盖为 `real`（灰度接入真实设备，无需停服）；
   - 切换即时生效（配置热加载，无需重启）。
6. **前端隔离**：前端仅消费 `/api/v1/*` 与 WS，不感知来源；`source` 字段仅用于后台展示数据可信度。

结论：该机制满足「先用模拟数据开发，架构随时切换真实接口」的硬性要求，且切换对人体前端、对运行无感知。

---

## 7. 核心数据模型（10 栋楼 × 7 子系统）

### 7.1 ER 关系（ASCII）
```
buildings 1──* devices *──1 subsystems
buildings 1──* building_subsystem_config *──1 subsystems
   |                |
   |                *──1 device_categories
   |                |
   +──* device_points (device_id)        users *──1 roles *──* permissions
   |                                       |
   |                                       +──* operation_logs
   +──* energy_aggregations (building,subsystem)
   |
   +──* alarms (device_id, building_id, subsystem_id) *──1 alarm_rules
   |
   +──* connector_configs (device_id 可空, 按楼栋/子系统覆盖)

device_metrics (TimescaleDB 超表): time, device_id(FK), metric_key, value, unit, quality, source
```

### 7.2 关系表清单（PostgreSQL）

| 表 | 关键字段 | 说明 |
|----|----------|------|
| `buildings` | id(uuid), code, name, floors, gross_area, local_origin(jsonb), geo_position(jsonb), status | 10 栋楼 |
| `subsystems` | id, code, name, icon, sort_order | 7 子系统（icon 存储 lucide-vue-next 图标名） |
| `building_subsystem_config` | id, building_id(FK), subsystem_code(varchar), enabled(bool), config_json(jsonb), sort_order(int) | 每栋楼启用子系统可配置（2/5/7 个不固定），后台启停；关联 buildings 1──* building_subsystem_config *──1 subsystems |
| `device_categories` | id, subsystem_id(FK), code, name, manufacturer, default_metrics(jsonb), control_capable(bool) | 设备类别目录（螺杆机/多联机/分体机/热泵/水泵/冷却塔/照明/电表/电梯…） |
| `devices` | id, building_id(FK), subsystem_id(FK), category_id(FK), code, name, model, manufacturer, install_date, location(jsonb:{x,y,z,floor,room}), specs(jsonb), status(enum), protocol, controller_type | 设备台账（约 1600+ 行） |
| `device_points` | id, device_id(FK), building_id(FK), position(jsonb:{x,y,z}), marker_type, label, camera_view(jsonb), level_of_detail(enum:building/subsystem/equipment), visible | 3D 点位联动 |
| `users` | id, username, password_hash(bcrypt), nickname, role_id(FK), status, last_login | 用户 |
| `roles` | id, code, name, description | 角色（超级管理员/运维/查看/楼栋管理员…） |
| `permissions` | id, code, name, resource, action | 权限点 |
| `role_permissions` | role_id, permission_id | 角色-权限 |
| `alarm_rules` | id, subsystem_id(FK), metric_key, operator, threshold, level(enum), enabled, description | 告警阈值规则 |
| `alarms` | id, device_id(FK), building_id(FK), subsystem_id(FK), rule_id(FK), level(enum:info/warning/critical), title, message, metric_snapshot(jsonb), status(enum:active/acknowledged/cleared/suppressed), first_at, last_at, acked_by, acked_at, cleared_at | 告警 |
| `energy_aggregations` | id, building_id(FK), subsystem_id(FK), period(enum:hour/day/month/year), bucket_start, kwh, cost, carbon_kg, peak_kw | 能耗聚合（或由连续聚合实时算） |
| `connector_configs` | id, device_id(FK,可空), source_mode(enum:mock/mqtt/modbus/http), endpoint, topic, register_map(jsonb), poll_interval, enabled | 模拟/真实切换配置 |
| `scene_configs` | id, name, model_url, is_active, config_json(jsonb: camera_presets, building_anchors, environment), version | 3D 场景配置（模型可后台替换） |
| `feature_flags` | id, key, enabled, rollout(jsonb:{user_ids,percentage}), description | 灰度发布 |
| `operation_logs` | id, user_id(FK), action, resource, detail(jsonb), ip, created_at | 审计日志 |
| `menus` | id, parent_id, name, path, icon, sort_order, subsystem_code | 顶部动态菜单（楼栋+子系统） |

### 7.3 时序超表（TimescaleDB）

| 超表 | 分区 | 索引 | 说明 |
|------|------|------|------|
| `device_metrics` | time（按周/chunk） | (device_id, metric_key, time) | 设备时序指标 |
| `energy_readings`（可选） | time | (building_id, subsystem_id, time) | 原始能耗读数，配连续聚合出 hour/day/month |

- 压缩策略：`device_metrics` 开启 TimescaleDB 压缩（segment by device_id, order by time），降低历史存储成本（契合甲方 4TB HDD 历史存储）。
- 所有表含 `created_at/updated_at`；业务表含 `deleted_at`（软删除）。

---

## 8. 3D 点位 LOD（层级细节）策略

设备总量上千，3D 场景不可逐台打点。采用三级 LOD：

| 级别 | 对象 | 数量级 | 交互 |
|------|------|--------|------|
| building | 每栋楼 1 个锚点 | 10 | 飞向 + 高亮整楼 |
| subsystem | 每楼每子系统 1 个聚合点（如「2号楼-空调」） | ≤70 | 展开该子系统右面板 |
| equipment | 关键设备独立点（制冷主机/热泵/水泵/冷却塔/多联机/电表） | 数十~百余 | 点击看单体实时指标 |
| （下钻） | 分体机/照明等海量设备 | 上千 | 仅在右面板列表/筛选，不在 3D 打点 |

该策略保证大屏流畅（≤200 个实体），同时保留关键设备与子系统的空间联动能力。

---

## 9. API 端点清单（按 7 子系统组织，全部 /api/v1）

统一响应：`{ code:0, data:{}, message:"" }`；鉴权：`Authorization: Bearer <jwt>`；错误码：0 成功，非 0 见 openapi.yaml `components.errors`。

### 9.1 系统/鉴权/场景
- `POST /api/v1/auth/login` 登录
- `POST /api/v1/auth/logout` 登出
- `GET  /api/v1/auth/me` 当前用户
- `GET  /api/v1/auth/menus` 顶部动态菜单（楼栋 + 子系统）
- `GET  /api/v1/features` 当前用户灰度开关
- `GET  /api/v1/scene/config` 3D 场景配置（model_url/building_anchors/camera_presets）
- `GET  /api/v1/scene/points?building_id=&subsystem=` 设备 3D 点位

### 9.2 楼栋 / 设备 / 指标
- `GET  /api/v1/buildings`
- `GET  /api/v1/buildings/:id`
- `GET  /api/v1/buildings/:id/subsystems` 查该楼启用子系统清单（按 building_subsystem_config.enabled）
- `PUT  /api/v1/buildings/:id/subsystems` 后台配置启用/停用（body: [{subsystem_code, enabled, config_json}]）
- `GET  /api/v1/devices?building_id=&subsystem=&category=&status=`
- `GET  /api/v1/devices/:id`
- `GET  /api/v1/devices/:id/metrics/latest`
- `GET  /api/v1/devices/:id/metrics?from=&to=&keys=`
- `POST /api/v1/devices/:id/control` 下发控制（开关/设定温度/模式/节能命令）

### 9.3 七子系统（每系统按 `?building_id=` 出该楼数据）
- `GET  /api/v1/regulation/overview` 智慧能源一体化调控（总能耗/成本/碳排/负荷曲线）
- `GET  /api/v1/lifecycle/equipment` 设备生命周期（资产/健康分/维保到期）
- `GET  /api/v1/lifecycle/maintenance` 维保计划与记录
- `GET  /api/v1/hvac/status` 空调（楼内每层汇总、单台运行参数）
- `POST /api/v1/hvac/control` 空调策略/开关/设定温度（策略组绑定内机）
- `GET  /api/v1/lighting/status` 照明（区域状态/能耗）
- `POST /api/v1/lighting/control` 照明联动/定时/远程
- `GET  /api/v1/power/status` 电力（电压/电流/功率/功率因数/谐波）
- `GET  /api/v1/hotwater/status` 热水（水温/流量/压缩机功率/COP/水箱温度）
- `GET  /api/v1/elevator/status` 电梯（运行次数/能耗/储能回馈/待机）

### 9.4 能耗与告警（跨子系统）
- `GET  /api/v1/energy/summary?building_id=&period=`
- `GET  /api/v1/energy/trend?building_id=&subsystem=&from=&to=`
- `GET  /api/v1/alarms?building_id=&subsystem=&level=&status=`
- `POST /api/v1/alarms/:id/ack`
- `POST /api/v1/alarms/:id/clear`
- `GET  /api/v1/alarms/rules`（后台）
- `POST /api/v1/alarms/rules`（后台，阈值配置）

### 9.5 实时通道
- `WS /api/v1/ws/live`：客户端发送 `{building_id, subsystem, device_ids}`，服务端推送指标增量 + 告警事件。
- 客户端 `/api/v1/devices/:id/metrics/latest` 取初值，`WS` 取增量，避免轮询风暴。

完整字段定义见 `docs/phase1/openapi.yaml`（前后端联调唯一契约）。

---

## 10. 顶部菜单联动楼栋与子系统

- **菜单结构**：`menus` 表驱动。第一级为「楼栋选择器」（10 栋 + 「全院」），第二级为「子系统页签」（7 子系统 + 「综合概览」）。
- **楼栋级子系统可配置**：进入某栋楼后，子系统页签只展示该楼 `building_subsystem_config.enabled=true` 的子系统（数量不固定，2/5/7 个均可，由后台配置）；「全院」视图展示全部 7 子系统。
- **状态契约**：`sceneStore` 持有 `selectedBuilding`、`activeSubsystem`；任意一端变化：
  - 3D 场景：飞向 `building_anchors[selectedBuilding]`，高亮该楼，按 `activeSubsystem` 过滤 `device_points`；
  - 左面板：渲染该楼该子系统 KPI + 设备列表；
  - 右面板：调用对应 `/api/v1/{subsystem}/status?building_id=` 渲染子系统专属视图；
  - 实时：WS 订阅参数随 `selectedBuilding/activeSubsystem` 重订阅。
- **综合概览**：`selectedBuilding=全院 & activeSubsystem=overview` -> 调用 `/regulation/overview` + 全楼聚合。
- 满足合同「顶部菜单需同时联动楼栋与子系统」与全量控制要求（视角切换/点位选中/数据刷新开关）。

---

## 11. 部署架构（私有化，Docker Compose）

```
[医院内网]
    |
    | 大屏终端(4K) / 运维PC / 领导查看端
    v
[nginx:1.27]  -- 静态托管前端大屏 + 反向代理 /api /ws
    |
    +-- [nestjs:11]  (API + WS + Connectors + 告警引擎 + 控制服务)
    |        |
    |        +-- [redis:7]      (热缓存 / WS 扇出 / 限流)
    |        |
    |        +-- [postgres:16 + timescaledb:2.16]  (关系表 + 超表)
    |
    +-- [emqx:5] (可选, MQTT Broker, 接入设备/网关)  <-- 设备感知层
```

- 全部容器部署于甲方单机（Xeon 8C/64G/RTX/1TB+4TB），内网隔离。
- Nginx 启用 HTTPS（自签或院内 CA）+ HSTS；DB 启用 TLS 与静态加密（满足合同加密要求）。
- 资源约束：compose 中按单机配置内存/CPU limits；TimescaleDB 压缩 + 4TB HDD 存历史。
- 运维：docker compose up；备份 `pg_dump` 定时；日志落 `operation_logs` + 容器 stdout。

---

## 12. 安全与权限（合同 3.2/3.4/附件四）

- 传输加密：Nginx HTTPS/WSS；MQTT 走 TLS。
- 存储加密：PostgreSQL `pgcrypto`/表空间加密；密码 bcrypt 哈希。
- RBAC：角色（超级管理员/运维/楼栋管理员/只读）-> 权限点（resource:action）-> 接口/按钮级控制；低权限禁用高危控制（满足分级操作控制）。
- 审计：`operation_logs` 全量记录登录/控制/配置变更/导出，不可篡改（仅追加）。
- 权限移交：超级管理员账号与后台配置权限验收时完整移交甲方（不留后门，见附件四）。

---

## 13. 可行性验证结论（需求三项重点）

1. **10 栋楼 × 7 子系统数据模型**：可行。`buildings × subsystems` 为两个维度，`devices` 以 `(building_id, subsystem_id, category_id)` 三维归属，`device_metrics` 时序超表按 `device_id` 关联。台账已可落成 `devices` 初始数据（约 1600+ 台），1 号楼设备台账待现场调研补充（不影响架构）。
2. **模拟/真实切换机制**：可行。Connector 抽象 + ConnectorFactory + `connector_configs` 实现全局/粒度切换，前端零改。MVP 默认 mock，灰度切 real。
3. **3D 模型点位与设备数据联动**：可行。`scene_configs`(model_url 可替换) + `device_points`(局部坐标) 解耦模型与数据；点击点位 -> `device_id` -> 实时指标 + WS 订阅；楼栋/子系统联动由 `sceneStore` 状态契约驱动。LOD 策略保证大屏性能。

---

## 14. ADR 索引

| 编号 | 标题 | 结论 |
|------|------|------|
| ADR-001 | 3D 渲染引擎选型 | Three.js（TresJS）替代 Cesium |
| ADR-002 | 图标库锁定 | lucide-vue-next（SVG，与 UIUX 设计系统对齐，唯一图标源） |
| ADR-003 | 数据源混合模式 | Connector 抽象 + 工厂 + 配置热切换 |
| ADR-004 | 数据库选型 | PostgreSQL 16 + TimescaleDB 2.16 单实例 |
| ADR-005 | 后端框架选型 | NestJS（Fastify）+ TypeScript |
| ADR-006 | 顶部导航联动模型 | 楼栋选择器 + 子系统页签双维联动 |

---

## 15. 风险与待确认事项

- R1：1 号楼设备台账缺失 -> 需现场调研补充；架构已预留。
- R2：Cesium->Three.js 引擎替换需重写参考项目 3D 部分（约 1 个模块工作量），已评估可行。
- R3：真实设备协议细节（寄存器地址/话题/报文）需甲方网关/BMS 文档 -> 决定 RealConnector 具体实现；MVP 先 mock。
- R4：甲方内网是否已有 MQTT Broker / 网络隔离策略 -> 影响部署是否自带 EMQX。
- C1：确认是否引入 Redis（实时缓存/WS 扇出）；若单机资源紧，可先以 NestJS 进程内缓存替代，后续加 Redis。
- C2：确认能耗聚合用「预存 `energy_aggregations`」还是「TimescaleDB 连续聚合实时算」，建议后者（少一处写入不一致）。
```

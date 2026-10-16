# 开平市中心医院能源管理软件平台 — 后端服务

技术栈：**NestJS (Fastify) + TypeScript**，按 `docs/spec/SPEC.md` 与 `docs/phase1/openapi.yaml` 实现全部 API。
数据源采用 **混合 Connector 模式（ADR-003）**：默认 `mock` 内存数据，切换到真实源（MQTT/Modbus/HTTP）只需改配置、前端零改动。

## 快速开始

```bash
cd backend
npm install
cp .env.example .env   # 按需修改（默认即可运行）
npm run start:dev      # 或 npm run build && npm run start:prod
```

启动后日志出现 `Nest application successfully started on port 3000` 即就绪。
API 前缀为 `/api/v1`；WebSocket 命名空间为 `/api/v1/ws/live`。

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 服务端口（演示端口 `5168`；代码兜底默认值 `3000`） | `3000` |
| `DATA_SOURCE_MODE` | 数据源模式：`mock`（默认）｜`real`（RealConnector，含 HTTP/MQTT/Modbus 适配器，真实源不可达时自动回退 Mock） | `mock` |
| `JWT_SECRET` | JWT 签名密钥（生产必须替换为强随机值） | 开发默认值 |
| `JWT_EXPIRES_IN` | token 有效期（秒） | `86400` |
| `WS_PUSH_INTERVAL_MS` | WS 实时推送间隔（毫秒） | `2000` |
| `CORS_ORIGIN` | 允许的跨域源（逗号分隔，留空=允许全部，仅开发） | 空 |
| `LOG_LEVEL` | 日志级别 | `info` |
| `HTTP_BASE_URL` | 真实 HTTP(BMS/REST) 数据源 base URL；留空则 HTTP 适配器不可用、回退 Mock | 空 |
| `MQTT_BROKER_URL` | 真实 MQTT Broker 地址（如 `mqtt://host:1883`）；留空则 MQTT 适配器不可用、回退 Mock | 空 |
| `MODBUS_HOST` | 真实 Modbus/TCP 主机；留空则 Modbus 适配器不可用、回退 Mock | 空 |
| `MODBUS_PORT` | Modbus/TCP 端口 | `502` |
| `MODBUS_UNIT_ID` | Modbus 从站单元号 | `1` |

> 说明：`.npmrc` 已设置 `legacy-peer-deps=true`，用于绕过 `@nestjs/config` 尚未更新 Nest 11 peer 范围导致的 ERESOLVE（运行时兼容）。

## 默认账号

- 用户名 `admin` / 密码 `admin123`（密码以 bcrypt 哈希存储于内存种子）

## 目录结构

```
backend/
├── package.json / tsconfig.json / tsconfig.build.json / nest-cli.json / .env / .npmrc
├── src/
│   ├── main.ts                      # 启动（Fastify + 全局前缀/校验/异常过滤/CORS）
│   ├── app.module.ts                # 根模块装配
│   ├── common/
│   │   ├── types.ts                 # 领域模型类型（与 openapi 对齐）
│   │   ├── constants/catalog.ts     # 子系统目录 + 设备类别 + 指标模板 + 楼栋/设备计划(院区网格锚点)
│   │   ├── constants/performance.ts # 控制同步延迟目标 LATENCY_TARGET_MS='100-500' (R2/AC-09)
│   │   ├── response.util.ts         # 统一响应 {code,data,message} + BizError
│   │   ├── dto/control-command.dto.ts
│   │   ├── decorators/current-user.decorator.ts
│   │   ├── guards/jwt-auth.guard.ts
│   │   ├── filters/global-exception.filter.ts
│   │   └── connector/               # 混合数据层（ADR-003）
│   │       ├── connector.interface.ts   # Connector 契约 + CONNECTOR_TOKEN
│   │       ├── connector.factory.ts      # 按 DATA_SOURCE_MODE 选择
│   │       ├── connector.module.ts       # 全局提供 + 启动 connect()
│   │       ├── mock/                    # Mock 数据源（实现契约）
│   │       │   ├── seed.ts              # 10 栋楼 + 约 1840 设备(含 1 号楼共用 2 号楼台账) + 配置 + 告警 + 场景 + 用户
│   │       │   ├── synthetic.metrics.ts # 合成时序指标 + WS live_batch
│   │       │   ├── synthetic.aggregate.ts # 子系统状态/调控/生命周期/能耗/3D点位
│   │       │   └── mock.connector.ts    # 内存 Connector 实现
│   │       └── real/                    # 真实数据源（同 Connector 契约 + 优雅回退 Mock）
│   │           ├── real.connector.ts    # RealConnector 编排：集合路由 + 不可达回退
│   │           └── adapters/            # 可插拔协议适配器
│   │               ├── types.ts         # SourceAdapter 契约 + errMsg
│   │               ├── http.adapter.ts  # axios REST 拉取
│   │               ├── mqtt.adapter.ts  # mqtt 遥测订阅 / 控制下发
│   │               └── modbus.adapter.ts# net 套接字最小 Modbus/TCP(避免原生编译)
│   ├── auth/                        # 登录/登出/me/menus/features + JWT 策略
│   ├── buildings/                   # 楼栋列表/详情 + 楼栋子系统可配置(GET/PUT)
│   ├── devices/                     # 设备列表/详情/指标(latest/history)/控制
│   ├── subsystems/                  # 7 子系统（每系统按 ?building_id 出数据）
│   │   ├── shared/                  # SubsystemService（状态/控制经 Connector）
│   │   ├── regulation/ lifecycle/ hvac/ lighting/ power/ hotwater/ elevator/
│   ├── energy/                      # 能耗汇总 / 趋势
│   ├── alarms/                      # 告警列表 / ack / clear / rules
│   ├── scene/                       # 3D 场景配置 / 设备点位
│   └── websocket/                   # LiveGateway（WS 实时推送）
```

## 架构要点

- **响应封装**：所有 REST 返回 `{ code: 0, data: {}, message: "" }`；错误返回非零 `code` + `message`。
- **混合数据层（ADR-003）**：所有 controller / service 仅通过 `CONNECTOR_TOKEN`（Connector 接口）访问数据，
  controller 内无硬编码数据。切换 `DATA_SOURCE_MODE=real` 时只需实现 `RealConnector` 各协议适配器，
  前端与业务代码零改动（AC-03）。
- **楼栋子系统可配置**：`GET/PUT /buildings/:id/subsystems` 读写内存 `building_subsystem_config`，
  `GET /auth/menus` 返回楼栋与子系统目录，前端依各楼 `enabled` 隐藏未启用子系统（AC-02）。
- **安全**：JWT Bearer 鉴权；密码 bcrypt 哈希；全局校验管道 + 统一异常过滤器。
- **实时**：`WS /api/v1/ws/live`，客户端 `emit('subscribe', {building_id, subsystem, device_ids})`，
  服务端每 ~2s `emit('metrics')` 与 `emit('alarms')`。

## 控制同步延迟目标（R2 / AC-09）

- 控制指令下发 / 模型状态同步的端到端延迟目标为 **100–500 毫秒**，由甲方（开平市中心医院）于 2026-08-17 确认，
  见 `src/common/constants/performance.ts` 的 `LATENCY_TARGET_MS = '100-500'`（验收基准 SPEC §9 AC-09 / §10）。
- MVP Mock 连接器实际控制路径远低于此区间，故无需改动控制逻辑；真实连接器接入后应保证在此窗口内回写状态。

## 真实数据源接入（任务4 / ADR-003）

后端已实现 `RealConnector`，与 `MockConnector` 共用同一 `Connector` 接口（connect/read/findOne/create/update/remove/send/subscribe/normalize）。
内置三种可插拔适配器：

| 适配器 | 依赖 | 用途 | 配置 env |
|--------|------|------|----------|
| HTTP | `axios` | 拉取 BMS / 第三方 REST 数据源 | `HTTP_BASE_URL` |
| MQTT | `mqtt` | 订阅设备遥测主题 / 下发控制 | `MQTT_BROKER_URL` |
| Modbus | Node 内置 `net` 套接字（最小 Modbus/TCP，避免原生编译） | 寄存器轮询 | `MODBUS_HOST` / `MODBUS_PORT` / `MODBUS_UNIT_ID` |

> Modbus 采用 Node 内置 `net` 实现最小 Modbus/TCP（FC0x03 读保持寄存器），未引入 `modbus-serial` 以避免
> 原生编译（serialport）在本环境失败阻塞构建；生产可平滑替换为 `modbus-serial`。

灰度切换方式：

```bash
# 1. 默认 mock（演示零配置）
npm run start:dev

# 2. 灰度切真实：配置连接器参数后切换模式
HTTP_BASE_URL=http://10.0.0.10:8080 \
MQTT_BROKER_URL=mqtt://10.0.0.11:1883 \
MODBUS_HOST=10.0.0.12 MODBUS_PORT=502 MODBUS_UNIT_ID=1 \
DATA_SOURCE_MODE=real npm run start:dev
```

- **优雅回退**：某集合在真实源不可达 / 无数据时，RealConnector 自动回退到注入的 `MockConnector` 同类数据，
  `connect()` 阶段任意适配器连接失败仅记 `warn` 日志、不阻断启动，保证演示不中断（前端零改动，满足 AC-03）。
- **合成集合**（device_metrics / subsystem_status / 各 overview / energy / scene / live_batch 等）真实源无法生成，
  统一走 Mock 回退；基础集合（buildings / devices / subsystems / alarm 等）优先尝试真实适配器。
- 寄存器映射、MQTT 主题、HTTP 端点路径待甲方网关/BMS 文档到位后补充（见 `docs/decisions/OPEN-DECISIONS.md` 未决项）。

## 验证命令（Phase 1 端到端）

```bash
# 1. 构建
npm run build

# 2. 启动（另开终端）
npm run start:dev

# 3. 登录取 token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'

# 4. 查某楼启用子系统
curl http://localhost:3000/api/v1/buildings/2/subsystems -H "Authorization: Bearer <token>"

# 5. 配置某楼子系统（裸数组）
curl -X PUT http://localhost:3000/api/v1/buildings/2/subsystems \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '[{"subsystem_code":"hvac","enabled":true}]'

# 6. 调控总览
curl "http://localhost:3000/api/v1/regulation/overview?building_id=2" -H "Authorization: Bearer <token>"
```

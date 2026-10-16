# NewKaiPing 游戏引擎化改造方案 v1.0

> 适用版本：NewKaiPing 当前 main（NestJS 后端 + Vue3 前端 + Three.js 渲染 + Pinia + lowdb JSON）
> 方案基线：与 D:\NewPrSz 已冻结的 `spec/scene-schema.v1.schema.json` 同构（顶层段与字段命名一致），保证未来 Unity 6 runtime 对接零成本
> 改造深度：B 重改造（正典迁移）—— 数据层 + 渲染层 + 交互层全面重构，但旧 `scene_config` / `scene_markers` / `scene_points` 表**保留作为派生源**
> 决策日：2026-09-04 ｜ 主理人拍板

---

## 1. 为什么改

NewKaiPing 当前是「3D 网页」，不是「3D 场景引擎」。每一帧画面、每一次交互的源头**散落在 Vue 组件 + Pinia store + NestJS controllers 三层**，没有「单一场景文档」。具体痛点：

| 痛点 | 表现 |
|---|---|
| 视觉调整成本高 | 改一个数据框位置要改 `bigscreen.ts` + 重打包 |
| 跨标签同步脆弱 | BroadcastChannel 手工同步 7 个字段（model_url / building_display / anchors / subsystem_meta…），字段一加就漏 |
| 楼层钻取不灵活 | 走 Vue 路由 `/bigscreen/building/:id/:subsystem?`，想加一个新视角就要改路由表 |
| 子系统切换是"开关"而非"场景" | `selectedBuilding + activeSubsystem` 两个独立 ref，没有「场景剧本」概念 |
| 设备弹窗硬编码 | `DeviceDetailDrawer.vue` 307 行写死空调/电梯/照明等模板，加新设备类型要改组件 |
| Unity runtime 对接成本 | Unity 6 runtime 消费 scene-schema.v1.schema.json；当前 NewKaiPing 输出不匹配 |

## 2. 改造目标（验收线）

**单一真相源 = Scene Schema v1.0（一份 JSON）**。任何渲染、交互、数据驱动的源头都是这一份文档。

| Schema 顶层段 | 含义 | 来自 NewKaiPing 现存数据源（派生源） |
|---|---|---|
| `pointTable` | 点位定义（Modbus / 内部点位 ID 标准化） | devices + scene_points 派生 |
| `assets` | GLB / 纹理 / HDR 引用 | scene_config.model_url + scene_config.model_type |
| `sceneGraph` | 树状节点（root/building/floor/room/device/group/decor） | buildings + scene_markers + scene_points 派生 |
| `bindings` | deviceId ↔ pointId | devices.metrics + scene_points 派生 |
| `rules` | 告警/联动规则 | alarm_rules + alarms_rules |
| `hudLayout` | 17 个数据框的 (x/y/w/h + 模板 + 数据源) | bigscreen.ts 硬编 layout 段 |
| `cameraPresets` | 每个楼层 + 每个子系统 + 每个场景序列 | 当前散落在 ThreeViewer.vue 的 `flyTo()` 调用 |
| `scenarios` | 一组预设的（相机+面板+规则）联合激活 | 当前无；替代 `selectedBuilding/activeSubsystem` store 字段 |
| `controls`（**本期留空**） | deviceId → 可下发指令集 | 现有 POST `/api/v1/devices/:id/control` 保持不变；未来 v1.1 加 |

## 3. 架构三层分离

```
┌─────────────────────────────────────────────────────────┐
│  视图层 (Vue 组件)                                       │
│    - 17 个 widget 由 hudLayout 驱动                      │
│    - 弹窗由 device_type → widget_template 选择模板渲染     │
│    - 左/右/底栏由 hudLayout 布局，不再硬编位置              │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ reads
┌─────────────────────────────────────────────────────────┐
│  场景层 (Pinia + Three.js)                               │
│    - SceneRenderer.vue     ← 纯渲染（按 sceneGraph）     │
│    - InteractionController ← hover/click/focus 视觉反馈   │
│    - ScenarioRunner        ← 当前激活哪个 scenario       │
│    - CameraPresetController← preset → flyTo              │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ fetches
┌─────────────────────────────────────────────────────────┐
│  数据层 (NestJS)                                         │
│    - SchemaMaterializer    ← 旧表 → scene schema 物化    │
│    - SchemaRepo            ← scene_schema 表（持久化）   │
│    - SchemaController      ← GET / PUT /scene/schema     │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ reads/writes (派生源，仍是单一编辑入口)
┌─────────────────────────────────────────────────────────┐
│  旧表（保留）                                            │
│    scene_config / scene_markers / scene_points           │
│    buildings / devices / alarm_rules / subsystem_meta    │
└─────────────────────────────────────────────────────────┘
```

## 4. 与 D:\NewPrSz 冻结合约的关系

`scene-schema.v1.schema.json`（D:\NewPrSz，已 P0 冻结）是 Unity 6 runtime 的合约。NewKaiPing 输出的 scene schema **必须与这个 v1.0 同构**（同字段名、同 enum 值、同约束），保证未来 Unity runtime 切换数据源零成本。

具体对齐：

| D:\NewPrSz 段 | NewKaiPing 对应 | 备注 |
|---|---|---|
| `sceneGraph.nodes[]` | 同 | root/building/floor/room/device/group/decor |
| `sceneGraph.nodes[].semantic.deviceType` | 复用现有 enum：AC/CHILLER/PUMP/HP/CT/ELEVATOR/LIGHT/METER/ARCH | 9 码 |
| `bindings[]` | 同 deviceId ↔ pointId | 当前 devices.metrics 派生 |
| `cameraPresets[]` | 同 | id / name / position / target / fov |
| `scenarios[]` | 同 | preset_id / activeWidgets / activeRules |
| `hudLayout[]` | 同 | type / x/y/w/h / dataBinding / template |

差异点：NewKaiPing 现有业务字段（如 `subsystem_meta.visible` 后台开关、`building_display.box_opacity` 后台 DIY）作为 `sceneConfig` 元数据叠加在 schema 顶部，不进入 `sceneGraph` 内部。

## 5. Story 表（12 个，Phase 1+2）

| Story | 标题 | 优先级 | 主要文件 | 验收 |
|---|---|---|---|---|
| **GK-01** | Scene Schema 物化器（后端） | P0 | `backend/src/scene/schema.service.ts` (新) | GET `/scene/schema` 返回符合 `scene-schema.v1.schema.json` 的 JSON；旧表保持派生源 |
| **GK-02** | Schema 物化器回归测试 | P0 | `backend/test/schema.e2e-spec.ts` (新) | 物化器对 buildings/devices/scene_markers/scene_points 全量场景过单测 |
| **GK-03** | PUT `/scene/schema` 编辑接口 + version 守卫 | P0 | `backend/src/scene/schema.controller.ts` | 乐观锁 + diff 写回源表（marker/anchor/building_display/subsystem_meta 双向同步） |
| **GK-04** | SceneRenderer.vue 拆分与 sceneGraph 接入 | P0 | `frontend/src/components/three/SceneRenderer.vue` (新) | ThreeViewer.vue 拆为 SceneRenderer.vue + InteractionController.vue；渲染源改为 sceneGraph 遍历 |
| **GK-05** | InteractionController.vue 接管点击/hover | P0 | `frontend/src/components/three/InteractionController.vue` (新) | raycast 命中 sceneGraph 节点 → 触发事件（device/floor/area） |
| **GK-06** | hudLayout 驱动 17 个数据框 | P0 | `frontend/src/stores/hudLayout.ts` (新) + `panels/*.vue` 改写 | 移除 bigscreen.ts store 硬编 layout；widgets 来自 hudLayout；位置回写 |
| **GK-08** | cameraPresets 接入（每个楼层 + 每个子系统） | P0 | `frontend/src/components/three/presetController.ts` (新) | ≥ 25 个 preset（10 栋楼 × 楼层 + 7 子系统 + overview）；flyTo 走 preset |
| **GK-12** | 文档与回归测试 | P0 | `docs/architecture` + `tests/e2e` | 更新 master-architecture §X；新增 Playwright 覆盖 7 子系统切换 |
| **GK-07** | scenarios 取代路由 / store 字段 | P1 | `frontend/src/stores/scenarioRunner.ts` (新) | `selectedBuilding/activeSubsystem` 改为 derived from activeScenario |
| **GK-09** | Schema Editor 管理后台 | P1 | `frontend/src/views/admin/SceneSchemaEditor.vue` (新) | 新增 admin 路由 `/admin/scene-schema`；sceneGraph 树编辑 + cameraPresets 列表 + hudLayout 拖拽 + scenarios 序列 |
| **GK-10** | 设备弹窗改为 hudLayout widget 模板 | P1 | `frontend/src/components/device/DeviceRemoteWidget.vue` (新) | DeviceDetailDrawer.vue 改为 schema 模板 + 动态字段；空调远程遥控器走空调模板 |
| **GK-11** | 跨标签同步迁移到 schema diff 推送 | P2 | `frontend/src/lib/schemaSync.ts` (新) | BroadcastChannel 只推 schema version + diff；不再手工同步 7 字段 |

**Phase 划分：**
- **Phase 1（本期必交付 P0）**：GK-01 / GK-02 / GK-03 / GK-04 / GK-05 / GK-06 / GK-08 / GK-12（8 个）
- **Phase 2（下期可后置）**：GK-07 / GK-09 / GK-10 / GK-11（4 个）

## 6. 关键技术决策（已与主理人拍板）

1. **旧表保留作为派生源**：`scene_config` / `scene_markers` / `scene_points` / `buildings` / `devices` 表持续写入；schema 物化器每次全量计算（10 栋楼规模毫秒级）。admin 编辑的 schema 增量通过 PUT `/scene/schema` 反向写回源表（marker / anchor / building_display / subsystem_meta）。
2. **ThreeViewer.vue 必拆**：B 重改造下，1172 行单文件无法既被 SceneRenderer 又被 SchemaEditor 复用。拆分是 B 改造的前提。
3. **`controls` 段本期留空**：保持现有 REST 控制 API（`POST /api/v1/devices/:id/control`、`POST /api/v1/hvac/control` 等）不变；`controls` schema 段待 Phase 2 加进 v1.1。
4. **17 个数据框先平移后 DIY**：本期先按当前位置平移到 hudLayout，保留视觉零回归；下版本才允许后台 DIY 拖拽。
5. **现有 24 个 admin 页面保留不变**：新增 Schema Editor 是叠加（`/admin/scene-schema`），不替换。

## 7. 不在范围（本期）

- Unity 6 runtime 对接（依赖 Scene Schema v1.0 已对齐，未来单独立项）
- 替换渲染引擎（保持 Three.js，不引入 Cesium / TresJS）
- 数据库迁移（保持 lowdb JSON）
- 移动端 / 触屏适配
- 性能优化（≥ 25 个 preset 飞行时 GPU 占用，现状已可接受）

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 物化器性能 | 10 栋楼规模毫秒级，30+ 栋楼可能 1s+ | Phase 1 全量计算足够；下版本加增量缓存 |
| sceneGraph 节点命名冲突 | 设备 ID 与 marker ID 同名可能撞 | GK-01 物化器统一前缀（`device_` / `marker_` / `floor_` / `building_`） |
| ThreeViewer 拆分回归 | 拆完视觉/交互回归 | GK-12 写 Playwright e2e 截图比对基线 |
| Admin Schema Editor 误编辑 | 误改坏全局场景 | GK-03 乐观锁 + 改动预览 + 一键回滚到上一 version |
| 跨标签 schema 推送丢包 | 一端改了另一端没收到 | GK-11 用 version 号 + 定期全量对账兜底（本期可暂用 BroadcastChannel 推 version 字符串） |

## 9. 验收

- **Phase 1 DoD**：8 个 P0 Story 全交付；Playwright e2e 通过 7 子系统切换 + 楼层钻取 + 设备弹窗；后端 `GET /scene/schema` 返回 JSON 通过 `scene-schema.v1.schema.json` 校验（轻量版校验器，至少类型/enum 检查）；旧 admin 页面零回归。
- **Phase 2 DoD**：4 个 P1/P2 Story 交付；schema 编辑器后台可用；空调远程遥控器走 schema 模板。
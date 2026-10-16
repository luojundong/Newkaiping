# NewKaiPing 游戏引擎化改造 — Phase 1 交付状态总账（GK-12 文档）

> 本文是 `docs/architecture/game-engine-refactor.md`（改造方案 v1.0）与 `docs/architecture/refactor-stories.md`（Story 表）的**状态补记**，三者口径一致、互为索引。
> 目的：让下一个接手者 / QA / 主理人打开一个文件就能知道 **哪些已落地、当前数据契约是什么、还有哪些坑、怎么验收**。
>
> 状态统计时间：2026-09-04（Phase 1 全部 P0 故事已验收，GK-06-reset 重启后、GK-01-semantic 已生效）
> 本文作者：程基岩（工程实现 / GK-12 文档部分）。未 git commit。

---

## 1. 状态总表（GK-01 ~ GK-12）

状态图例：**Done** = 已实现 + 有 evidence 实跑证据 + 已验收；**Pending** = 未开工（Phase 2）；**In Progress** = 本 Story 部分交付（GK-12 拆文档/e2e 两个交付物，本文档为其中一个）。

| Story | 标题 | 状态 | 关键产物路径 | 验收要点（实测） |
|---|---|---|---|---|
| **GK-01** | Scene Schema 物化器（后端） | **Done** | `backend/src/scene/schema.service.ts`（物化核心）＋ `backend/src/scene/dto/scene-schema.dto.ts`；evidence：`evidence/GK-01/` | GET `/api/v1/scene/schema` 返回 11 顶层段；sceneGraph **1983** 节点（root1+building10+floor110+device1842+decor20）；hudLayout **17** 框；cameraPresets **120**；scenarios 8；bindings=pointTable=1842；assets 1；旧端点零回归；物化 p95=55ms < 500ms |
| **GK-01-semantic** | 物化器语义缺口修复（集成到 Three 消费契约） | **Done** | `backend/src/scene/schema.service.ts`（additive，唯一改动）；evidence：`evidence/GK-01-semantic/` | building 节点补 `semantic.deviceId`＋`meta.code/floors/gross_area`；device 补 `meta.building_id/marker_type`；area 标记补 `semantic.shape='area'`＋顶层 `areaPoints`；build exit 0，离线 materialize ALL PASS |
| **GK-02** | Schema 物化器回归测试 | **Done** | `backend/scripts/schema-regression.js`（单文件、零依赖、幂等）；evidence：`evidence/GK-02/` | **26/26 PASS**，exit 0；断言覆盖 11 顶层段齐全无多余、sceneGraph 数量不变量、hudLayout.widgets≥17、cameraPresets≥100、deviceType ∈ 冻结 23 枚举、bindings 引用完整、preset id 唯一 |
| **GK-03** | PUT `/scene/schema` 编辑接口 + version 守卫 | **Done** | `backend/src/scene/schema.controller.ts`、`schema.module.ts`、`data/scene_schema_versions.json`；evidence：`evidence/GK-03/` | 无 If-Match→400；If-Match 错→412；PUT If-Match:1→200 version 2；**stale PUT 412 且源表不被污染**（守卫先于反向写回）；hudLayout patch 反向写回 `scene_config.hud_layout_widgets` |
| **GK-04** | SceneRenderer.vue 拆分 + sceneGraph 接入 | **Done** | `frontend/src/components/three/SceneRenderer.vue`（纯渲染）、`ThreeViewer.vue`（facade）；evidence：`evidence/GK-04/` | ThreeViewer ≤100 行（GK-04 后 84，GK-08 增 DEV 句柄后现约 123）；vue-tsc 0 error；vite build 全绿；截图渲染无回归；sceneStore 数据源兜底保留 |
| **GK-05** | InteractionController.vue 接管点击/hover | **Done**（与 GK-04 同批落地） | `frontend/src/components/three/InteractionController.vue`（事件层）；evidence：`evidence/GK-04/`（loc.txt 行数 165 + 渲染截图） | raycast 命中 sceneGraph 节点按 userData 分支 device/floor/area；hover 高亮；emit 签名 `device-click`/`floor-click`/`area-click` 不变；BigScreenLayout 消费方式零改动 |
| **GK-06** | hudLayout 驱动大屏 17 个数据框 | **Done** | `frontend/src/stores/scene.ts`（`loadSchema()` 切真实后端）、`lib/schema-hud.ts`、`components/layout/BigScreenLayout.vue`、`PanelCard.vue`、`LeftPanel.vue`；evidence：`evidence/GK-06/` | 运行时 DOM 实测 **17 个 `[data-hud-id]` 框**由 schema hudLayout.widgets 驱动（几何/标题/皮肤/subsystem）；无 schema 回退 `bigscreen.layout → defaultLayout()` 逐像素一致 |
| **GK-06-reset** | hud_layout_widgets 测试残留清理（数据修复） | **Done** | `backend/scripts/reset-hud-layout.js`＋停服备份 `backend/data/runtime.json.bak-20260904-hudreset`（922,440B）；evidence：`evidence/GK-06-reset/` | 删 GK-03 测试 widget（「GK-03 测试框/右1/右2」）；重启后恢复默认 17 框标题/rect（如 left-alarm=「监控报警」rect[10,120,300,790]）；schema version 保持 **2**（未走 PUT，避免 2→3 噪音） |
| **GK-08** | cameraPresets 接入 Three 相机 flyTo | **Done** | `frontend/src/lib/cameraPreset.ts`、`lib/presetFlight.ts`、`SceneRenderer.vue`（flyToPreset/flyToBuilding/flyToFloor 唯一入口）、`ThreeViewer.vue` facade；evidence：`evidence/GK-08/` | schema cameraPresets **120**（bldg 10 + floor 110）；楼栋点击/selectBuilding→飞 `preset_bldg_<id>_overview`，楼层/钻取→飞 `preset_floor_<id>_<floor>`，position/lookAt/fov 全量 tol 0；vue-tsc exit 0 |
| **GK-12** | 文档与回归测试 | **In Progress**（本文档完成；Playwright e2e `frontend/tests/e2e/specs/subsystems.spec.ts` 未开工，归 team-lead task #52） | `docs/architecture/game-engine-refactor-status.md`（本文） | 文档段：状态总账/数据契约/缺口/验收链路（本文交付）；e2e 段：跨 7 子系统切换 + 楼层钻取 + 设备弹窗 全绿（未做） |
| **GK-07** | scenarios 取代路由 / store 字段 | **Done** | `frontend/src/lib/scenario.ts`、`stores/scene.ts`（activeScenarioId/selectScenario/scenarioForSubsystem/pendingCameraPreset + seq 去重）、`types/api.ts`（SceneSchemaScenario 强类型）、`components/layout/BigScreenLayout.vue`（watch pendingCameraPreset→facade flyToPreset，所有权已追认）；evidence：`evidence/GK-07/` | CDP 实测点 hvac tab→activeScenarioId=sys_hvac_focus、panels 带 ?subsystem=hvac、相机飞 preset_bldg_1_overview（poseTol 0）；schema 置 null 走旧路径零回归；AppHeader/router 零改动；vue-tsc 0 error。tracks.atSec>0 时序演出与「场景聚焦隐藏无关框」留后续 |
| **GK-09** | Schema Editor 管理后台 | **Done** | `frontend/src/views/admin/SchemaEditorView.vue`（第 25 个 admin 页）、`api/index.ts`（schemaEditorApi）、`router/index.ts`、`AdminLayout.vue`；evidence：`evidence/GK-09/` | hudLayout 17 widget 卡片编辑（title/rect 钳位/z/locked）+ PUT If-Match（412 冲突提示+一键重取）；只读 version 徽标/8 计数卡/sceneGraph 树/cameraPresets+scenarios 表；路由离开+beforeunload 双脏数据守卫。画布拖拽留后续 |
| **GK-10** | 设备弹窗改为 hudLayout widget 模板 | **Done** | `frontend/src/lib/schema-device-template.ts`、`components/device/DeviceWidgetBoard.vue`（新）、`DeviceDetailDrawer.vue`（接线）；evidence：`evidence/GK-10/` | deviceType→模板映射（AC=空调遥控面板 温度±/开关/模式/风速；CHILLER/CT/HP/PUMP=三按钮；SENSOR=status_grid；未知回退旧 drawer）；控制走既有 `POST /devices/{id}/control` 后端零改 |
| **GK-11** | 跨标签同步迁移到 schema diff 推送 | **Done** | `backend/src/websocket/schema-sync.hub.ts`+`schema-sync.channel.ts`（新）、`schema.controller.ts`（PUT 成功后广播）、`frontend/src/lib/schema-sync.ts`（防抖 800ms/防自触发 noteSavedVersion/断线 3s 重连）、`main.ts`（一行 init + DEV 句柄 `__kpSchemaSync`）；evidence：`evidence/GK-11/` | `e2e/gk11-sync.mjs` 双页签 **9/9 PASS**：A 页签 PUT→WS 广播 schema.updated{version}→B 页签 DOM+store 自动重载；恢复 PUT 后 B 页签还原。坑：探针动态 import 会得到另一模块实例（假阴性），须读 `window.__kpSchemaSync` |

> 派生源/版本说明：当前 schema **version = 2**（`updatedAt: 2026-09-04T08:21:29.533Z`，由 GK-03 一次 PUT 从 1 推至 2）。GK-06-reset 采用「停服清键重启」而非 PUT 重置，故未产生 v3。

---

## 2. 当前真实数据契约速查（2026-09-04 实测，勿臆测）

### 2.1 端点与响应包络

| 端点 | 鉴权 | 说明 |
|---|---|---|
| `GET /api/v1/scene/schema` | Bearer（401 无 token） | 实时物化完整 Scene Schema 文档 |
| `GET /api/v1/scene/schema/version` | Bearer | `{code:0, data:{version,updatedAt}, message:""}`（当前 version=2） |
| `PUT /api/v1/scene/schema` | Bearer + `If-Match` | 段级 patch；无 If-Match→400、版本不符→412、成功→200 且 version+1 |

**包络**（`backend/src/common/response.util.ts` 统一）：`{ code:0, data:<文档>, message:"" }`。业务错误由 GlobalExceptionFilter 统一返回非零 code。

**`data` 内 11 段（物化器实测数量）** —— 与冻结 `D:\NewPrSz\spec\scene-schema.v1.schema.json` 同构：

| 段 | 实测值 | 备注 |
|---|---|---|
| `schemaVersion` | `"1.0.0"` | 顶层第 1 段 |
| `meta` | 项目元信息 | projectId=`kaiping-hospital` |
| `dataSources` | 派生源声明 | 空/声明旧表 |
| `pointTable` | **1842** | 1 设备 → 1 虚拟点位派生 |
| `assets` | **1** | 主模型（当前指向 panorama png，见 §3.1） |
| `sceneGraph` | **1983** = root 1 / building 10 / floor 110 / device 1842 / decor 20 | 见 2.3 命名规则 |
| `bindings` | **1842**（恒 `=== pointTable.length`） | 派生不变量 |
| `rules` | **8** | — |
| `hudLayout` | `{canvas, widgets:[17]}` | 见 2.2 |
| `cameraPresets` | **120**（bldg 10 + floor 110） | id 约定见 2.4 |
| `scenarios` | **8**（overview + 7 子系统 focus） | — |

> 另：控制器在 `data` 内注入 `_meta: { materializeMs: <ms> }`（实测 ≈4ms），供观测用；回归脚本 A2 允许该额外键，不视作顶层段污染。

### 2.2 hudLayout 段形状

```jsonc
"hudLayout": {
  "canvas": { "width": 1920, "height": 1080, "theme": "tech_blue" },
  "widgets": [
    {
      "id": "left-alarm",          // 与前端 BOX_KEYS 一致（left-alarm / right-*10 / bottom-*6）
      "type": "alert_list",        // 冻结 enum（stat_card/gauge/line_chart/device_board/alert_list/…）
      "title": "监控报警",          // 默认=BOX_LABELS 文案；自定义标题才抢跑旧标题链
      "rect": [10, 120, 300, 790], // ★ 权威坐标字段是 rect:[x,y,w,h]，不是散列 x/y/w/h（冻结 schema required）
      "z": 1,
      "locked": false,
      "frame": "tech",             // 附加字段（schema additionalProperties 允许）
      // "subsystem" 仅 4 个代表框存在（right-hvac/power/elevator 等），其余无
    }
    // …共 17 个
  ]
}
```

- 前端适配层：`frontend/src/lib/schema-hud.ts` `hudWidgetToBox()`（rect→BigscreenBox，1920×1080 设计空间）；widget.type→面板种类映射用 `widgetPanelKind()`（未知类型回退 id 白名单→stat_card）。
- 回退链：`sceneSchema.hudLayout.widgets(id===boxKey)` → `bigscreen.layout` → `lib/bigscreen-layout.ts defaultLayout()`。

### 2.3 sceneGraph 节点命名 / type / deviceType

- id 前缀规则（GK-01 物化器，回归 A/C 校验）：`root`；building→`bldg_<id>`；floor→`floor_<id>_<floor>`；device→`device_<id>`；marker→`marker_<id>`。
- 节点 `type` 冻结枚举：`root/building/floor/room/device/group/decor`（本数据实际出现 root/building/floor/device/decor）。
- `node.semantic.deviceType` **必须** ∈ 冻结 23 值枚举：`ARCH/CAB/AC/PDU/UPS/BAT/PIPE/SENSOR/CAM/FIRE/LIGHT/DECO/FURN/AHU/LEAK/RACK/PUMP/CHILLER/HP/CT/ELEVATOR/METER/BOILER`（`D:\NewPrSz\spec\scene-schema.v1.schema.json` deviceType enum）。本数据实际取值仅含 `AC(1794)/CHILLER(12)/PUMP(10)/HP(21)/CT(4)/SENSOR(1)`，全部在枚举内。
- building 节点 `semantic`：`{ tags:['building'], deviceId:<原始楼栋id'1'..'10'>, meta:{code:'B1'.., floors:<数值层数>, gross_area:<数值>} }`（GK-01-semantic 补齐，数值 floors 供 SceneRenderer 算盒体高度）。
- device 节点 `semantic`：`{ deviceId, deviceType, meta:{code, room, building_id:<原始楼栋id>, marker_type:<category_id 近义>} }`。
- area 标记（decor 型）：`semantic.shape='area'`＋顶层 `semantic.areaPoints[]`＋`meta.{areaPoints,building_id,floor,color}`。

### 2.4 cameraPresets id 约定（GK-08 前端单一入口）

```
preset_bldg_<楼栋原始id>_overview   // 10 项，楼栋原始 id = '1'..'10'
preset_floor_<楼栋原始id>_<层号>      // 110 项，层号 1 基
结构: { id, name, mode, pose:{ position:[x,y,z], lookAt:[x,y,z], fov }, transitionMs }
```

**关键**：id 内嵌的 `<id>` 是**楼栋原始 DB id**（= sceneGraph building `semantic.deviceId`，`'1'..'10'`）——**不是** `bldg_1`、**不是** code `B1`。前端 `lib/cameraPreset.ts` 用 `presetIdForBuilding(buildingId)` / `presetIdForFloor(buildingId, floor)` 构造查找。Three 相机/controls 唯一属主为 `SceneRenderer.vue`（`flyToPreset/flyToBuilding/flyToFloor`）；schema 为 null 时回退旧 `scene_config.camera_presets` → 默认全院视角 `DEFAULT_CAMERA_POSE` `{[74,56,102],[30,20,0],fov45}`。

---

## 3. 已知缺口与后续（诚实记录）

### 3.1 demo 后端 model_type='panorama' → 默认无 3D 楼栋盒体可点
当前 `scene_config.data.model_type='panorama'`（`model_url=/uploads/models/scene_1787820639232_8yf3ix.png`），SceneRenderer 走媒体场景分支：无楼栋盒体、无 floor 命中，且 `loadPanoramaBackground` 把 OrbitControls 距离钳到 [0,1]。**GK-08 的「点楼栋/选楼层→相机飞 preset」语义面向 `model_type='3d'`**。GK-08 验收通过 CDP＋DEV 句柄把当前标签内存态临时切成 `3d + /models/hospital.glb` 完成，未改后端持久化。若希望 demo 默认呈现 3D preset 行为，需后端把 model_type 改回 `'3d'`（另行决策）。
**GK-13 已补全 3D 全链验收**（见 §7）：页面态切 3d 后，设备/楼层标签/楼栋三类 raycast 点击 + preset 飞行全部实测通过；panorama 默认态仍是媒体场景（行为正确，非缺陷）。

### 3.2 area 标记 building_id 大小写与 sceneGraph 不匹配
2 条 area 标记（`marker_mk-1787712926344-kv9pai` / `marker_mk-1787712928018-gusbc6`）源表 `building_id='b1'/'b2'`（**小写**），其 `parent=bldg_b1/bldg_b2` 在图中**无对应 building 节点**（图内为 `bldg_1..10`）。materializer 忠实保留源值 → area 点击事件携带的 building_id 无法匹配现有楼栋 → 「点区域跳楼」不准。根治需在 MarkerAdmin/后端 create 时把 area 的 building_id 对齐为 `'1'/'2'`，**另立 Story**（本文件只记录）。

### 3.3 GK-10 未开工：widget.type → 面板完整模板化渲染未做
现前端为按 **id 白名单映射**面板种类（`schema-hud.ts` `ID_KIND_FALLBACK`）＋ DOM `data-panel-kind` 留档；冻结 type enum 到真实面板组件的完整模板化动态渲染归 GK-10（Phase 2）。`DeviceDetailDrawer.vue` 弹窗模板化同理未做。

### 3.4 DEV-only 全局句柄
`window.__kpPinia`（`frontend/src/main.ts`）与 `window.__kpSceneCamera`（`ThreeViewer.vue`）均以 `import.meta.env.DEV` 守卫（`installCameraDebugHook()` 首行 `if (!import.meta.env.DEV) return`），生产 build 不含。若团队认为任何全局调试句柄不可接受，可移除；移除后 CDP 只读断言需另议。

### 3.5 管理后台 Schema Editor（GK-09）未开工
目前改布局只有两条路：① `PUT /api/v1/scene/schema`（If-Match 乐观锁，version+1，注意 snapshot 单调增长）；② 改源表（`scene_config.data.*` 或直接 runtime.json，**但运行中后端是 mock 内存态**，需重启才生效，见 3.6）。

### 3.6 后端存储模型：mock 内存态，非每次读盘
`MockConnector.connect()` 仅启动时把 `runtime.json` 叠入内存；之后写路径会把整个内存 scene_config 回写 runtime.json，**覆盖**运行期间对文件的直接修改。因此文件级脚本修改对运行中进程不生效、且会被内存回写覆盖——必须「停服→改文件→重启」或走运行中 API（PUT）才能落地。备份见 `backend/data/runtime.json.bak-20260904-hudreset`。

### 3.7 版本快照单调增长（风险）
`scene_schema_versions.json` 每次 PUT 追加一份完整文档快照（当前 1.29MB/份，随 device 数变化）。约 1000 版本 ≈ 1.3GB。建议下版本加版本压缩或差异快照（与 GK-11 相关但版本存储策略需单独卡）。

---

## 4. 验收链路指引（给下一个接手者 / QA）

### 4.1 前置
- 数据源：`backend/data/runtime.json`（mock 内存态；改数据走「停服→改→重启」或 API）。
- 登录凭据：`admin / admin123`（`POST /api/v1/auth/login` 取 `data.token`）。
- 本机代理会截断 localhost：curl 用 `--noproxy '*'`；浏览器直连 `127.0.0.1`。

### 4.2 回归：schema-regression.js
```bash
cd backend
node scripts/schema-regression.js http://localhost:5168   # baseUrl 可省，默认 :5168
# 环境变量覆盖：KP_REG_BASE_URL / KP_REG_USER / KP_REG_PASS
# 期望：GK-02 RESULT: PASS (26/26 passed)，exit 0；任一 FAIL → exit 1（可接 CI）
```

### 4.3 起服务
```bash
# 后端 :5168（如需新构建先 npm run build；生产跑 dist）
cd backend && npm run start:prod        # node dist/main
# 前端 :5169（Vite）
cd frontend && npm run dev              # 或 npm run build && vite preview
```

### 4.4 大屏功能验收步骤
1. **schema 结构**：登录后 `curl --noproxy '*' http://127.0.0.1:5168/api/v1/scene/schema -H "Authorization: Bearer $TOKEN"` → 确认 `code=0`，`data.sceneGraph` 总节点=1983、`hudLayout.widgets.length=17`、`cameraPresets.length=120`。
2. **hudLayout 驱动**：浏览器打开 `/bigscreen/overview` → DevTools 搜 `[data-hud-id]`，应出现 **17 个框**；左框应显示默认「监控报警」、rect 映射 left≈2.6%（若仍见「GK-03 测试框」说明残留未清净）。改标题可验证 schema 驱动：PUT 一个 widget 的 title → 页面刷新标题即时变、`/schema/version` version+1。
3. **3D 相机 preset（需 3d 模式）**：当前 demo 是 panorama（见 §3.1）。验证相机语义前先临时把当前标签切 3d：
   ```js
   // DevTools Console（仅 DEV 构建有 __kpPinia/__kpSceneCamera）
   import('/src/stores/scene.ts').then(m => { const s = m.useSceneStore(window.__kpPinia); s.sceneConfig.model_type='3d'; s.sceneConfig.model_url='/models/hospital.glb'; })
   // 然后点楼栋 / 选楼层 → 相机平滑飞到对应 preset；或直接：
   window.__kpSceneCamera && window.__kpSceneCamera.flyToBuilding('1')   // active=preset_bldg_1_overview
   window.__kpSceneCamera && window.__kpSceneCamera.flyToFloor('1', 3)   // active=preset_floor_1_3
   ```
   期望 position/lookAt/fov 落位、≥300ms 补间、无 schema 时回退默认视角不抛错。
4. **点击链路（设备/楼层/区域）**：3d 模式下点击 device marker→设备弹窗打开；点 floor label→楼层钻取抽屉；hover 有高亮；拖拽相机（未命中模型）不触发事件。
5. **e2e（未完成项）**：`cd frontend && npx playwright test subsystems.spec` —— 该 spec 尚未创建（归 GK-12 e2e 段，见状态表）。

### 4.5 已知运维口令
- hud 残留清理：`node backend/scripts/reset-hud-layout.js`（清 `scene_config.data.hud_layout_widgets` 键，幂等）——**仅对下次重启生效**（mock 内存态，见 §3.6）。
- version 推进方式：只能通过 PUT（含 If-Match）；GK-06-reset 之后当前 version=2。

---

## 5. 附：Phase 1 完成 → Phase 2 交接基线

Phase 1（P0）8 个 Story 中 **7 个全量 Done（GK-01/02/03/04/05/06/08）＋ 2 个收尾子项 Done（GK-01-semantic/GK-06-reset）**；GK-12 文档段由本文完成、e2e 段待交付。数据契约与冻结 schema `D:\NewPrSz\spec\scene-schema.v1.schema.json` 已同构，Phase 2（GK-07/09/10/11）可直接在现有物化器/Three/HUD 三层上叠加，无需回改数据层。

---

## 6. Phase 2 交付小结（2026-09-04 晚）

**Phase 2 四个 Story（GK-07/09/10/11）全部 Done**，至此 GK-01~GK-12 全线闭环（GK-12 的 Playwright spec 仍以 `e2e/kaiping-chain.mjs` CDP 全链 34 PASS 替代覆盖）。

**重启后全量回归（team-lead 亲测）**：
- `backend/scripts/schema-regression.js` → **26/26 PASS**
- `e2e/kaiping-chain.mjs` → **34 PASS / 0 FAIL**
- `e2e/gk11-sync.mjs` → **9/9 PASS**（双页签 WS 同步双向验证）
- `vue-tsc --noEmit` → 0 error；后端已用 GK-11 广播代码重启（dist 含 schema-sync.hub/channel）

**GK-11 收尾补丁（team-lead）**：`main.ts` 增 DEV 句柄 `window.__kpSchemaSync`，`e2e/gk11-sync.mjs` 改读该句柄——探针动态 `import('/src/lib/schema-sync.ts')` 在 Vite 下得到**另一个模块实例**，`__debug()` 恒报未连接（假阴性），功能本身一直是通的。

**schema version 现状**：Phase 2 验收过程经多次合法 PUT 推进（当前 version=8，`left-alarm` 标题已还原「监控报警」，内容无残留）。

**遗留（均为低优先，已登记）**：
1. ~~GK-07：tracks.atSec>0 时序演出、「场景聚焦隐藏无关框」~~ → **已关闭，见 §8 GK-14**；
2. ~~GK-09：画布内拖拽改 rect（当前卡片表单编辑已可用）~~ → **已关闭，见 §8 GK-15**；
3. demo `model_type='panorama'` 相机距离钳位（GK-07 探针已用页面态临时切 3d 验证过完整 preset 姿态，持久化未动）——**待产品拍板**；
4. 大屏 header 8 tab 与子系统切换的语义（点 tab=切场景/子系统，非选楼）——**产品语义待拍板**。
5. ~~**GK-16（进行中）**：管理端布局保存 `/bigscreen/layout`（写 `data/bigscreen-layout.json`）与大屏渲染源 `scene.schema.hudLayout` 是两张表，编辑不达大屏，违反「Scene Schema 单一数据源」裁定（GK-15 e2e ④b 断言发现）。~~ → **已关闭，见 §8 GK-16**。

---

## 7. GK-13 · 3D 盒体 raycast 全链验收（2026-09-04 晚，team-lead 亲测）

**目的**：关闭 §3.1 遗留 —— panorama 默认态下无法验证的「3D 模式点设备/楼层标签/楼栋 → raycast → 状态 + 相机 preset」全链。

**方法**：`e2e/gk13-3d-raycast.mjs`（Edge headless + CDP）。页面态切 `model_type='3d' + /models/hospital.glb`（纯 store 内存态，**零 PUT**，验收前后 schema version 均=8）。`__kpSceneCamera` 新增 DEV-only `getScene()`（ThreeViewer.vue 一行）供探针枚举 selectables；「投影→遮挡检测→PointerEvent 派发」在同一 JS tick 原子完成，消除 OrbitControls 相机微动导致的小目标脱靶。

**结果：8/8 PASS**（evidence/GK-13/：report.json + 4 张截图）
- selectables 普查：building 20（盒体+命中球）/ floorLabel 12 / device 1842 / area 2；
- **设备 raycast**：真实设备「住院大楼 分体式空调 #578」→ DeviceDetailDrawer 打开（含实时指标 power_kw/room_temp_c）；
- **楼层标签 raycast**：floorDrill={buildingId:'2',floor:4} + 相机飞 `preset_floor_2_4`（poseTol=0）；
- **楼栋 raycast**：selectedBuilding='2' + 相机飞 `preset_bldg_2_overview`（poseTol=0）；
- 相机解除 panorama 钳位（|position|=64.8）；console error=0；持久化零污染。

**探针过程中发现并修复 2 个真实交互层 bug**（修复后 kaiping-chain 34/0 + vue-tsc 0 error + vite build 全绿，零回归）：
1. `SceneRenderer.vue` `buildBuildingMarkers`/`buildPoints` 共享 `selectables` 数组被全量清空：buildingDisplay 变化重建楼栋时把 buildPoints 先入队的设备条目一起抹掉（watch 顺序敏感）→ 设备在部分时序下不可 raycast；且 toggle 会累积重复条目。修复：新增 `removeSelectablesByTypes()`，各数据层重建只移除自己类型的条目（对齐既有 area splice 模式）。
2. `InteractionController.vue` 点击优先级：楼层标签 sprite 悬挂在楼栋隐形命中球（半径可达 60）内部，按最近命中恒被 hitSphere 抢占 → 3D 下楼层标签永远点不到。修复：优先级改为 设备点 > 楼层标签 > 区域 > 楼栋热点（显式小目标优先于大半径不可见球）。

**验收口径备注**：demo 运行态 `buildingDisplay.mode='plane'`、`markerSwitch.show_device_points=false`、`floors_by_building` 未配 —— 探针均以页面态开启/注入（楼层标签有 `!isBox` 守卫，必须 mode='box'）。生产要让用户看到同样交互，需后端在 scene_config 调这三个配置（另行决策，均可经既有 admin 接口落库）。

---

## 8. GK-14 / GK-15 交付（2026-09-04 深夜，workers + team-lead 独立复核）

### GK-14 · 剧本时序演出 + 聚焦隐藏（关闭遗留 1）
- **实现**：`stores/scene.ts` 时间轴（rAF 驱动 + setInterval 兜底，appliedIdx dirty 检查——无到期条目零 DOM 操作）；`atSec<=0` 立即应用保持旧行为；`scenarioHiddenWidgetIds` 派生 getter（仅真实子系统 focus 场景隐藏非成员，overview 全显零回归）+ `exitScenario()`；`BigScreenLayout.vue` watch 该 getter 对 `[data-hud-id]` 切 `kp-scenario-hidden` 淡出；DEV 句柄 `window.__kpScenario`（getTime/seek/stop/state）。
- **e2e**：`e2e/gk14-scenario-playback.mjs` 13/13（页内注入 atSec 0/2/4 测试剧本，内存态零 PUT）：激活瞬间 0 应用/2、4 未 → t≥2、t≥4 依次应用 → 非成员淡出/成员可见 → seek(0) 重放 → 退出恢复 opacity=1 → version 前后一致 → console error=0。证据 `e2e/evidence/GK-14/`。
- **team-lead 独立复核**：重跑 13/13 PASS；`backend/scripts/schema-regression.js` 26/26；kaiping-chain 34/0。

### GK-15 · 布局画布拖拽/缩放（关闭遗留 2）
- **实现**：`views/admin/BigscreenLayoutAdmin.vue` 新增可视化画布编辑：选中 widget 整体拖拽（改 x,y）+ 右下角手柄缩放（改 w,h）；`snap8()` 8px 吸附（对齐 C2 裁定）+ `clampPx()` 越界钳制；拖拽中实时预览、松手提交；与卡片表单同一状态源双向同步；保存走既有 PUT /bigscreen/layout，未新增后端接口。
- **e2e**：`e2e/gk15-canvas-drag.mjs` 13/13：拖拽 (48,48)→吸附值、手柄缩放 8px 吸附、出界钳制、保存后后端 rect 与画布一致、**恢复原值再保存**（终态 rect=(10,120,300,790) 与初始一致）。证据 `evidence/GK-15/`。
- **team-lead 独立复核**：重跑 13/13 PASS；schema-regression 26/26。
- **GK-15 TODO 收尾（team-lead）**：表单输入（X/Y/宽/高）在 blur/回车提交时补 8px 吸附（`setValCommit`，输入过程不吸附避免逐键跳变），对齐 C2 栅格裁定；复跑 gk15 13/13 + gk16 10/10 无回归。
- **发现架构断点**：见遗留 5 / GK-16。

### GK-16 · 布局保存 → schema.hudLayout 双源打通（关闭遗留 5）
- **问题**：管理端保存写 `/bigscreen/layout`（`data/bigscreen-layout.json`），大屏只读 `scene.schema.hudLayout`，编辑不达大屏。
- **实现**（仅改 `views/admin/BigscreenLayoutAdmin.vue` save()）：既有 `bigscreenApi.saveLayout` 之后，overview 编辑点复用 `schemaEditorApi`（GET version → GET → 段级 PUT 带 If-Match 乐观锁），仅替换 hudLayout 段（按 widget.id 映射 rect，其余字段保留）；内部触发 `schema.updated` 广播驱动大屏重渲染。PUT 失败仅 warn + 非阻塞提示，不回滚布局保存。
- **e2e**：`e2e/gk16-schema-sync.mjs` 10/10：保存后 schema hudLayout rect 同步 8px 吸附值 → 大屏经 `__kpPinia` 读到同一 rect → 恢复后双源均复位（17 框全等）→ version 15→17 合法推进 → console error=0。证据 `evidence/GK-16/`。
- **team-lead 独立复核**：重跑 10/10 PASS；schema-regression 26/26；gk14 13/13。

### 当前基线快照（2026-09-04 深夜）
- kaiping-chain **34/0**；schema-regression **26/26**；gk11-sync 全 PASS；gk13 8/8；gk14 13/13；gk15 13/13；**gk16 10/10**；vue-tsc 0 error。
- schema version：17（gk16 e2e 恢复性 PUT 推进，hudLayout 终态与初始一致，17 框全等）。

## 9. GK-17 / GK-18 交付（2026-09-05，两项产品决策落地 + team-lead 独立复核）

### GK-17 · 默认态切换 panorama → 3D（产品决策 1，team-lead 拍板并落地）
- **决策**：demo 默认场景由全景图切为 3D 楼栋盒体，用户打开大屏即见 3D 可交互场景。
- **落地方式（全部经 API 落库，不改后端源码）**：`POST /api/v1/scene/model?type=3d` 上传 `frontend/public/models/hospital.glb`（69MB，原全景图备份 `backend/data/panorama-backup-20260905.png`）→ `PUT /scene/building-display`（mode='box', show_labels=true, floors_by_building 10 栋按**语义 deviceId 原始 DB id "1".."10"** 作键——SceneRenderer 消费 semantic.deviceId 而非 bldg_N，GK-01 裁定）→ `PUT /scene/marker-switch`（show_device_points=true）。
- **e2e**：`e2e/gk17-default-3d.mjs` **10/10**（零页面态注入，纯加载 `/bigscreen/overview` 验证默认态）：model_type=3d / box+labels+10 栋 / 设备点开 / census building:20 floorLabel:110 device:1842 area:2 / 相机不钳位（|pos|=137.9）/ 设备点击开 Drawer / 楼层标签点击钻取（preset_floor_4_13 poseTol=0）/ 楼栋点击选中+preset（poseTol=0）/ version 23→23 零污染 / console error=0。证据 `evidence/GK-17/`。
- **关键坑（必记）**：① 楼层点击断言必须以 store 实际 `floorDrill` 为准（sprite 相邻重叠射线可能命中更高层，学 gk13 口径），测试后 `closeFloorDrill()` 还原；② **`buildingDisplay.show_labels` 运行时变更不被 SceneRenderer 响应**（标签仅初始化创建，隐藏无效，census 实证 floorLabel 恒 110）→ 楼栋点击改用 `__kpPickAndClickBuilding`：绕开所有 floorLabel 投影 ≥30px 找净空点击位 + 未命中自动换栋/换偏移重试（floorLabel 命中优先级高于 building，正面视角标签糊在盒体上会触发钻取而非选中）。

### GK-18 · Header 8 tab = 切换子系统场景（产品决策 2，worker gk18-header-tabs 实现 + team-lead 独立复核）
- **决策**：header tab 点击语义 = 切换子系统（非选楼）。
- **实现**（仅改 `components/layout/AppHeader.vue`）：显式 `SUBSYSTEM_TAB_CODES` 8 常量映射；`scenarioRefForTab` 按 schema scenario 的 `subsystem` 字段匹配 → 点子系统 tab 调 `scene.selectScenario('sys_<code>_focus')`（GK-14 时序演出）；overview tab 调 `exitScenario()` 回自由态全显；幂等（已激活不重复触发，时间轴不重置）；`activeTabCode` 与 `activeScenario` 双向同步（剧本被他途激活时 tab 也高亮）；schema 未覆盖子系统回退旧 `selectSubsystem` 硬编码路径；tab 加 `:data-tab-code` 便于 e2e。
- **e2e**：`e2e/gk18-header-tabs.mjs` **15/15**：基线 overview 高亮 / hvac 选中+高亮+成员可见+非成员隐藏 / power 切换+hvac 清除 / overview 退出+恢复 widget / 幂等（active 不变+时间轴继续走不重置）/ version 23→23 零污染 / console error=0。证据 `evidence/GK-18/`。
- **team-lead 独立复核**：Grep 核实 AppHeader.vue 逻辑在盘 + 重跑 15/15 PASS + vue-tsc 0 error。

### 当前基线快照（2026-09-05）
- gk13 8/8；gk14 13/13；gk15 13/13；gk16 10/10；**gk17 10/10**；**gk18 15/15**；vue-tsc 0 error；schema version 23（gk17 后端配置落库推进，e2e 零污染）。
- demo 默认态：3D 模型 + 10 栋盒体 + 110 楼层标签 + 1842 设备点，默认场景 panorama→3D 已闭环。

## 10. GK-19 ~ GK-26 交付（2026-09-05，用户「7 子系统大屏链路」需求）

用户原始需求：① 点菜单跳转楼栋焦点 + 显示楼层 ② 点楼层出布局平面图 ③ 点图上名称弹数据（空调→遥控器 / 照明→开关）④ 左右两侧显示 7 系统数据 ⑤ 综合概述显示 7 系统数据 ⑥ 给出 7 子系统（1.1~7.1）完整功能排期。
用户拍板：平面图 = **程序生成示意图**（不等建模方，后续可无缝替换）；楼栋菜单 = **左侧楼栋列表面板**；范围 = 链路 + 空调/照明做深 + 全量排期（三项全要）。

### GK-19 · 设备点分级抽稀（16/16）
- 全景态 1842 → **300**：按楼栋分层均匀采样（最大余额法分配额 + 每栋保底 1 + 组内等距 stride 采样），**确定性、不随机、不闪烁**；选中楼栋后该楼全显（住院大楼 698）;钻取楼层后只显该层。
- 入口：`stores/scene.ts` 的 `devicePointQuota` / `deviceViewMode` / `filterDevicePoints()`，SceneRenderer 消费。DEV 句柄 `window.__kpSetDeviceQuota(n)`。
- ⚠ **配额未落后端**：`PUT /scene/marker-switch` 返回 200，但 `backend/src/scene/scene.service.ts:155` 的 `setMarkerSwitch` 只合并已知字段，新字段被静默丢弃 → 现为前端常量 300。要持久化需改那 3 行 merged。

### GK-21 · 左侧楼栋列表面板（12/12）
- 新 `components/bigscreen/BuildingNavPanel.vue`（左侧 220px，可折叠）：10 栋楼（名/层数/面积）+ 搜索；点楼栋 → `selectBuilding()` + 飞 `preset_bldg_{id}_overview`；再点一次取消回全景；选中后展开该楼楼层列表，点楼层置位 `floorDrill`。
- 挂载于 `BigScreenLayout.vue`（`data-hud-id="building-nav"`）。**pointer-events 约定**：根 `.bldg-nav` 设 `none`，仅交互子元素设 `auto`，保证缝隙点击穿透到 3D 画布（否则 GK-13 射线点击被遮挡）。
- store 新增 `requestCameraPreset(presetId)`（仅置 `pendingCameraPreset`，复用 GK-07 单飞入口）。

### GK-22 · 楼层平面示意图（7/7）+ 单测 14/14
- 新 `lib/floorplan-gen.ts`（纯函数、确定性）+ `components/bigscreen/FloorPlanView.vue`（内联 SVG，无图表库）+ 升级 `components/device/FloorDrillDrawer.vue`（上半平面图、下半设备列表兜底）。
- **房间名是真值**：设备 `location.room` 字段本来就有真实房间号（601–608 / 101–109），非聚类示意名 → 后续无需返工替换。楼层轮廓 = 该层设备点位 (x,z) 包围盒，保留长宽比。
- 点房间 → 该房间设备列表 → 点设备 → 按类型分流控制弹窗。

### GK-23 · 空调/照明控制深化（8/8）
- 空调：批量维度（全院/楼栋/楼层/房间，实测住院大楼 692 台）+ 运行参数；**运行电流/累计用电无点位 → 标「待接入」，不编造**。
- 照明：新 `LightingControlDialog.vue`（22KB），区域集中控制 / 联动 / 定时 / 远程 / 楼栋能耗 / 感应骨架。
- 修复两个真缺陷：① `loadBatchData` 用 limit=2000 触发后端 400（>1000 拒绝）→ 改分页拉全量；② 批量模式无单台设备时执行按钮不渲染 → 按钮移出 `.rc-remote` 单独渲染。
- ⚠ **数据满足未做**：3.4 类型/品牌/累计用电（`deviceBrand` 为空）、3.5 策略组绑定内机（`DeviceControlGroup` 无内机关系）——做成 UI 也是空壳，等数据。

### GK-24 · 七系统数据与综合概述（36/36）
- 新 `SubsystemOverviewGrid.vue`（7 张子系统卡，点击 → `selectScenario('sys_<code>_focus')`）+ `SubsystemFocusCard.vue`；`LeftPanel.vue` 改为渲染后端真实聚合告警（此前写死 14 类目 key 不匹配导致全 0）。
- **数据来源标识（红线落地）**：7 总览卡 + 16 个 PanelCard 框 + left-alarm **共 24 个区块全带角标**（琥珀=模拟 / 灰=待接入 / 青=真实），仅 `/bigscreen/*` 运行态显示，后台 DIY 预览不显示。e2e F1~F4 四重断言 1:1 覆盖。
- ⚠ **当前 24 个区块全部判定为 mock**——因为后台 `DATA_SOURCE_MODE=mock`。前端 `lib/dataSource.ts` 目前是**镜像猜测**，待 GK-26 后端暴露真值后改为读取后端。

### GK-25 · 七子系统排期表（纯文档）
- `docs/planning/seven-subsystems-roadmap.md` + `seven-subsystems-gap-analysis.md`
- 23 条 Story（SS-01~SS-23）覆盖 7 子系统全部条款；**总 ≈168 人日**（P0 70 / P1 55 / P2 43）；生产意义下已实现 0、部分 15、未实现 8。
- 5 大阻塞：① 真实数据源未接入（致命）② 热水/电梯/电表/感应硬件外部依赖 ③ 电梯+照明在 `catalog.ts:43` 无类别定义 ④ 组织/科室/床位/面积主数据缺失 ⑤ 策略/定时/联动引擎需新建。
- 最先做：SS-01 真实数据接入 → SS-02 综合概述真数据化 → SS-11 空调批量控制深化。

### ⚠ 数据真相（2026-09-05 实测修正，勿再臆测）
| 项 | 此前记录（错） | 实测真值 |
|---|---|---|
| `preset_floor_*` 数量 | 110 | **82** |
| 每层设备点位合计 | 1842 | **1568**（原数是接口分页截断所致） |
| 3D 楼层标签数 | 110 | **82**（主理人拍板：楼层以设备数据口径为准） |

### ⚠ 数据事故与防护（2026-09-05）
- **事故**：14:26–14:29 有 8 次 `buildings | update`（自动化脚本跑管理后台页面触发），把 8 栋楼的 `floors`/`gross_area` 覆盖为设备推导值（住院大楼 18→12），与 3D 显示配置打架；`deploy/backup/runtime.json`（14:38）已被污染，无干净前置备份。
- **处置**：主理人拍板「以设备数据为准」，已 PUT `floors_by_building` 同步为 82 层，消除 13–18 层空楼层死链；DB 与 3D 现已一致，`buildings.floors` vs `floors_by_building` 差异告警消失。
- **用户已选「加防护」**：① 铁律入项目记忆（禁 worker 写真实业务数据；e2e 必写时测完即还原并报备）② 后端审计加 `source: human|automation` 标记（GK-26），审计日志排查入口 `backend/data/runtime.json` 的 `auditLogs.data[]`（UTC 时间）。

### 当前基线快照（2026-09-05 晚）
- gk13 8/8；gk14 13/13；gk17 10/10（census `building:20 / floorLabel:82 / device:300 / area:2`）；gk18 15/15；gk21 12/12；**gk22 10/10**；gk23 8/8；**gk24 36/36**；vue-tsc 0 error；schema version 23（gk22 写后还原零污染）。

### 收尾闭环（2026-09-05 深夜，主理人亲自执行）
- **GK-26 验收通过**：`GET /scene/schema` additive 暴露 `dataSource` 真值（mode=mock 取连接器真实实例、3 适配器 configured/available、syntheticCollections 单一真源 `synthetic-collections.ts`）；审计 `source: human|automation` 生效（AsyncLocalStorage + 全局拦截器，source 不参与哈希，`/logs/integrity` ok）。事故复盘：GK-26 重启后端时把服务起崩（后台任务 ~2 分钟机制杀掉 `start:prod`），已用常驻方式 `node dist/main` 恢复，数据完好。
- **GK-22 照明真组件接线闭环（10/10）**：seed 无照明设备（`CATEGORY_DEFS` 无 lighting 类别，GK-23 缺口①），原 XHR 注入方案不可靠已弃用；改为 e2e 临时创建 `category:'照明'` 测试设备（带 `X-KP-Source: automation` 审计标记）→ 点平面图真圆点 → `.lc-dialog` 真组件打开 → **测完立即 DELETE 还原**（坑：DELETE 不能带 `Content-Type: application/json`，无 body 时 Fastify 报 400）。
- **GK-24 最终闭环（36/36）**：`lib/dataSource.ts` 弃用「镜像猜测」升级为**读后端真值**——`setBackendDataSourceInfo()` 由 `store.loadSchema()` 注入 `doc.dataSource`，`classifyDataSource` 优先后端 mode/合成名单，镜像常量仅作 schema 未加载时兜底。
- **GK-20 确认完成**：管理后台 `/admin/building-subsystem?building=3` 深链直达住院大楼，测试关掉的 lighting 已还原 enabled=true。

### 遗留缺口①补齐：照明类别入库（2026-09-05 深夜，主理人亲自执行）
- **改动**：`backend/src/common/constants/catalog.ts` 新增 `lighting_loop`（照明回路，subsystem=lighting，control_capable=true，metrics: power_kw/dim_level）；前端 `types/api.ts` CATEGORY_LABELS 同步。种子按固定 `BUILDING_DEVICE_PLAN` 生成，**存量数据零变化**。
- **效果**：照明设备从此可正常入库——此前 `devices.service.create` 无照明类别可派生，创建照明设备会被错误归到 lifecycle；现在 `category:'lighting_loop'` 创建即得 `subsystem_id='lighting'` + `controller_type='gateway'`（实测验证）。照明子系统的设备档案、平面图设备点、设备级控制链路全部解锁。
- **验证**：临时创建 `lighting_loop` 设备 → subsystem 正确派生 → 立即删除还原（22 台无残留）；回归 gk22 10/10、gk17 10/10、vue-tsc 0 error。重启纪律：备份 `runtime.json.bak-CATG-20260905-160656`，重启后 10 栋 floors 合计 82 一致。
- **坑**：Fastify 对「带 Content-Type: application/json 但无 body」的 DELETE 请求报 400（FST_ERR 空 JSON body）——所有 HTTP 客户端（含脚本）DELETE 时不要带 Content-Type。
- **注意**：当前种子里仍无照明设备记录（BUILDING_DEVICE_PLAN 未配照明）——这是**真实业务数据决策**（照明灯具数量/位置需院方数据），补录走设备管理页或 PUT 台账，不自动生成。

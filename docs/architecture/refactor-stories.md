# NewKaiPing 游戏引擎化改造 — Story 表（执行版）

> 与 `game-engine-refactor.md` §5 一一对应。本文件是并行工程 agent 派工的契约。
> Phase 1 = P0 Story 8 个，本期交付；Phase 2 = P1/P2 Story 4 个，下期。

## Story 卡片模板

每张 Story 卡片字段：
- ID / 标题 / 优先级
- 必读文件（先读，对齐风格）
- 改动文件（具体到路径 + 行号）
- 验收（客观可测）
- 自证要求（QA 实跑证据，落到 `evidence/` 目录）
- **禁止**：擅自改 schema 段名；改其他 Story 的文件；commit 任何东西（主理人统一合 main）

---

## Phase 1 — P0 Story（8 个）

### GK-01 · Scene Schema 物化器（后端）

**优先级**：P0 ｜ **类型**：实现 ｜ **主要文件**：`backend/src/scene/schema.service.ts`（新）

**必读**：
- `D:\NewPrSz\spec\scene-schema.v1.schema.json` — 顶层 8 段定义 + 字段命名（**唯一权威**）
- `D:\wwwroot\NewKaiPing\backend\src\scene\scene.service.ts` — 现有 scene 服务方法（不要重写，保留作为源）
- `D:\wwwroot\NewKaiPing\backend\src\common\types.ts` — Building / Device / SceneMarker / SceneConfig / DevicePoint 类型
- `D:\wwwroot\NewKaiPing\backend\src\common\constants\catalog.ts` — SUBSYSTEMS / BUILDINGS 静态注册表

**改动**：
- 新建 `backend/src/scene/schema.service.ts`，导出 `SceneSchemaService`
- 实现 `async materialize(): Promise<SceneSchemaDocument>`：
  - 调 `connector.read` 拉 buildings / devices / scene_markers / scene_points / scene_config / alarm_rules
  - 输出符合 `scene-schema.v1.schema.json` 的对象：sceneGraph + assets + bindings + rules + cameraPresets + scenarios + hudLayout + pointTable
  - **sceneGraph 节点 ID 命名规则**：building→`bldg_${buildingId}` / floor→`floor_${buildingId}_${floor}` / device→`device_${deviceId}` / marker→`marker_${markerId}`
  - cameraPresets 默认生成：每个 building 一个 overview 视角 + 每个 floor 一个（来自 `building_anchors` + FLOOR_HEIGHT 计算）
  - scenarios 默认 1 个 `overview` + 7 个 `{sys}_focus`（每个子系统一个）
  - hudLayout 默认 17 个 widget（先平移 bigscreen store 当前位置）
  - controls 段输出空数组（保留接口）
- 新建 `backend/src/scene/schema.module.ts`，导出 module；注册到 `app.module.ts`
- 新建 DTO 文件 `backend/src/scene/dto/scene-schema.dto.ts`，复用 D:\NewPrSz 同名字段

**验收**：
- `curl http://localhost:5168/api/v1/scene/schema | jq . | head -20` 返回 8 顶层段
- 输出 JSON 通过 schema 字段名一致性检查（写一个 `node -e` 校验脚本：顶层段集合 = `["pointTable","assets","sceneGraph","bindings","rules","hudLayout","cameraPresets","scenarios"]`）
- 旧 `GET /scene/config` / `GET /scene/markers` / `GET /scene/points` **不变**，照常工作
- 物化器在 10 栋楼 + 100 设备规模下耗时 < 500ms（用 `console.time` 实测）

**自证要求**：
- `evidence/GK-01/schema-sample.json` —— 物化器输出的前 200 行
- `evidence/GK-01/perf.log` —— 物化器 100 次调用耗时分布
- `evidence/GK-01/key-check.txt` —— 顶层段名校验结果

---

### GK-02 · Schema 物化器回归测试

**优先级**：P0 ｜ **类型**：QA + 测试 ｜ **主要文件**：`backend/test/schema.e2e-spec.ts`（新）

**必读**：
- `backend/src/scene/schema.service.ts`（GK-01 产出）
- `backend/src/common/connector/` 看 connector 接口（mock 与 real 两套）

**验收**：
- 测试用例覆盖：
  1. 空场景（无 buildings、无 devices）→ schema 8 段都存在，sceneGraph 只有 root 节点
  2. 单楼单设备 → sceneGraph 树深度 = 4（root → building → floor → device）
  3. 10 楼 100 设备 + 50 markers → 物化器输出无字段缺失
  4. scene_markers 含 area shape → sceneGraph 节点 `semantic.shape = 'area'` + `semantic.areaPoints` 数组
  5. alarm_rules 5 条 → rules 段输出 5 条，字段全
  6. 顶层段顺序固定（pointTable / assets / sceneGraph / bindings / rules / hudLayout / cameraPresets / scenarios）
- 测试运行：`cd backend && npm test -- schema.e2e-spec` 全绿

**自证要求**：
- `evidence/GK-02/test-output.txt` —— `npm test` 完整输出（PASS 6 it）
- `evidence/GK-02/coverage.txt` —— schema.service.ts 行覆盖率 ≥ 80%

---

### GK-03 · PUT `/scene/schema` 编辑接口 + version 守卫

**优先级**：P0 ｜ **类型**：实现 ｜ **主要文件**：`backend/src/scene/schema.controller.ts`（新增 `schema` 端点）

**必读**：
- `backend/src/scene/scene.controller.ts` — 现有 endpoint 风格
- `backend/src/scene/schema.service.ts`（GK-01 产出）—— 反向写回源表的逻辑应放这里
- `backend/src/common/connector/` — `update` API

**改动**：
- `schema.controller.ts` 新增：
  - `GET /scene/schema` → `materialize()`
  - `PUT /scene/schema` → `applyPatch(body, If-Match)` 乐观锁
  - `GET /scene/schema/version` → 返回 `{ version: number, updatedAt: ISO }`
- 新建 `scene_schema_versions` lowdb 表（`schema_versions[]`），每次 PUT 追加一条快照
- 反向写回规则：
  - `cameraPresets[id].meta.buildingId + .floor` 变更 → 不反向（preset 是 schema 派生，不写源）
  - `sceneGraph.nodes[id].position` 变 → 反向到 `scene_markers[marker_xxx]` 或 `building_anchors[bldg_xxx]`
  - `hudLayout[id].x/y/w/h` 变 → 反向到 `bigscreen_layout` 现有字段（如果存在）或暂存
  - `scenarios[id]` 变 → 仅 schema 内存，不反向
  - `rules` 变 → 反向到 `alarm_rules` 表
- version 守卫：If-Match header 携带上一 version，不匹配返回 412 Precondition Failed

**验收**：
- `curl -X GET http://localhost:5168/api/v1/scene/schema/version` 返回 `{version:1}`
- `curl -X PUT -H 'If-Match: 1' -d @patch.json .../scene/schema` 返回 200，新 version=2
- 同一 If-Match 再 PUT 一次 → 412
- 改 `sceneGraph.nodes[bldg_B01].position` 后，调 `GET /scene/markers?building_id=B01` 看到对应锚点更新（如果锚点来自 marker）

**自证要求**：
- `evidence/GK-03/version-flow.txt` —— 完整 version 流（GET v1 → PUT with If-Match:1 → GET v2 → 重复 PUT 412）
- `evidence/GK-03/reverse-trace.json` —— 改 schema 字段后，源表哪些字段被更新

---

### GK-04 · SceneRenderer.vue 拆分与 sceneGraph 接入

**优先级**：P0 ｜ **类型**：实现（前端重） ｜ **主要文件**：
- `frontend/src/components/three/SceneRenderer.vue`（新）
- `frontend/src/components/three/InteractionController.vue`（新）
- `frontend/src/components/three/ThreeViewer.vue`（保留作为 facade，内部转发到 SceneRenderer）

**必读**：
- `frontend/src/components/three/ThreeViewer.vue` — 1172 行，**全部读完后**再动
- `D:\NewPrSz\spec\scene-schema.v1.schema.json` — 顶层段
- `D:\NewPrSz\spec\examples\kaiping-hospital-p1.scene.json` — sceneGraph 范例（看节点结构）
- `frontend/src/stores/scene.ts` — 现有 store 状态

**改动**（**严格两步走，禁止一步到位**）：

**第一步：抽 SceneRenderer.vue**（纯渲染，无交互事件）
- props：`schema: SceneSchemaDocument`
- 内部：
  - 遍历 `schema.sceneGraph.nodes`，按 `semantic.deviceType` 创建 Three.js Group/Mesh
  - 用 `schema.assets` 加载 GLB（`assets[].url`）
  - 按 `schema.cameraPresets[activePreset]` 设置相机
- 不发任何 emit，不处理任何 click 事件
- ThreeViewer.vue 改为 wrapper：调 SceneRenderer，把 schema 从 `useSceneStore` 传进去

**第二步：抽 InteractionController.vue**
- 监听 ThreeViewer 的 canvas pointerdown / pointermove
- raycast 命中 SceneRenderer 的节点 Group
- emit：`area-click` / `floor-click` / `device-click`
- BigScreenLayout.vue 已有的 `@floor-click="onFloorClick"` 保持不变

**关键约束**：
- **视觉零回归**：拆分前后同一相机角度、同一渲染顺序、同一颜色，截图比对一致
- **不要重写渲染**：保留所有现有 `THREE.Group` / `Mesh` / `LineSegments` 逻辑，仅替换**数据源**为 sceneGraph 遍历
- ThreeViewer.vue 1172 行代码可以**整段平移**进 SceneRenderer（先不做样式/性能改动），保证回归

**验收**：
- `ThreeViewer.vue` 文件 ≤ 50 行（只做 facade）
- `SceneRenderer.vue` 编译通过、vue-tsc 无 type
- BigScreenLayout 渲染表现与改造前一致（用 Playwright 截图比对）
- `useSceneStore` 仍然工作；旧的 `sceneConfig.model_url` 行为保留

**自证要求**：
- `evidence/GK-04/loc.txt` —— `wc -l ThreeViewer.vue SceneRenderer.vue InteractionController.vue`
- `evidence/GK-04/screenshot-before.png` 与 `evidence/GK-04/screenshot-after.png` —— 同一相机角度的截图比对（人工/像素 diff）

---

### GK-05 · InteractionController.vue 接管点击/hover

**优先级**：P0 ｜ **类型**：实现 ｜ **主要文件**：`frontend/src/components/three/InteractionController.vue`

**必读**：
- GK-04 拆分后的 SceneRenderer.vue
- `frontend/src/components/three/ThreeViewer.vue`（现有 raycast 实现，**先读再平移**）
- `frontend/src/stores/scene.ts` — `openDevice` / `openFloorDrill` action 签名

**改动**：
- 把现有 ThreeViewer.vue 内的 `raycaster.setFromCamera` / `intersectObjects(selectables, true)` 平移过来
- 命中后按节点 `userData.kind` 分支：
  - `device` → `emit('device-click', { deviceId })`，BigScreenLayout 调 `scene.openDevice(deviceId)` → 打开 DeviceDetailDrawer
  - `floor` → `emit('floor-click', { buildingId, floor })`，BigScreenLayout 调 `scene.openFloorDrill(...)`
  - `area` → `emit('area-click', { markerId })`，打开区域弹窗
- hover 高亮逻辑（已有 AREA_HOVER_COLOR / BUILDING_HOVER_COLOR）原样平移
- 不改 ThreeViewer facade 的 emit 签名

**验收**：
- 大屏上点击任意 device marker → 设备弹窗打开（与改造前一致）
- 点击任意 floor label → 楼层钻取抽屉打开
- hover device/area 有视觉高亮
- raycast 不命中模型时（拖拽相机）不触发任何事件

**自证要求**：
- `evidence/GK-05/click-events.log` —— Playwright 录制 3 种点击事件触发链路

---

### GK-06 · hudLayout 驱动 17 个数据框

**优先级**：P0 ｜ **类型**：实现（前端重） ｜ **主要文件**：
- `frontend/src/stores/hudLayout.ts`（新）
- `frontend/src/components/panels/LeftPanel.vue` / `RightPanel.vue` / `BottomBar.vue`（改写）
- `frontend/src/stores/bigscreen.ts` — 移除硬编 layout

**必读**：
- `frontend/src/stores/bigscreen.ts` — 现有 17 框位置 / 模板 / 数据源
- `frontend/src/components/panels/*.vue` — 每个 widget 怎么接数据
- `D:\wwwroot\NewKaiPing\frontend\src\api\index.ts` — 现有 API 调用

**改动**：
- 新建 `frontend/src/stores/hudLayout.ts`：
  - state: `widgets: HudWidget[]`（每个 widget = { id, type, x, y, w, h, template, dataBinding }）
  - action: `loadLayout()` 调 GET `/scene/schema` 取 `hudLayout` 段
  - action: `updateLayout(patch)` 调 PUT `/scene/schema` 局部更新（仅 `hudLayout` 段）
  - getter: `widgetById(id)` / `widgetsByType(type)`
- `LeftPanel.vue` / `RightPanel.vue` / `BottomBar.vue` 改为：
  - 从 `useHudLayoutStore` 取 widgets
  - 按 widget.type 动态渲染（Switch / EChart / SubsystemCard / KPI / AlarmScroller 等）
  - 位置 x/y/w/h 由 widget 自身控制，不再硬编
- `bigscreen.ts` 中删除 `config.layout` 硬编段，改为 computed 引用 `hudLayout.widgets`

**验收**：
- 17 个 widget 视觉位置与改造前一致（截图比对）
- 调 `hudLayout.updateLayout({ id: 'left-alarm', x: 100 })` → 框位置即时变 + 后端 schema version +1
- 后台 BigscreenLayoutAdmin.vue 仍可编辑 layout（兼容性）

**自证要求**：
- `evidence/GK-06/widgets-count.txt` —— 当前 hudLayout widgets 数量 = 17
- `evidence/GK-06/screenshot-after.png` —— 17 框位置与改造前一致

---

### GK-08 · cameraPresets 接入

**优先级**：P0 ｜ **类型**：实现 ｜ **主要文件**：`frontend/src/components/three/presetController.ts`（新）

**必读**：
- `frontend/src/components/three/ThreeViewer.vue` — 现有 `flyTo()` / 相机设置代码（**先读再平移**）
- GK-01 物化器输出的 cameraPresets 结构

**改动**：
- 新建 `presetController.ts`：
  - `class PresetController(camera, controls)`
  - `flyToPreset(presetId, opts?)` — 根据 `cameraPresets[].position / target / fov` 调相机 `lerp` 动画
  - `activePresetId: ref<string | null>` — 当前激活 preset
- SceneRenderer.vue 接 `cameraPresets` prop，初始化时按 `activePresetId` 设置相机；切 preset 时调 `flyToPreset`
- 大屏顶部「全院」「B01」「F1」按钮 → 改为调 `presetController.activatePreset('preset_overview')` / `'preset_bldg_B01_overview'` / `'preset_floor_B01_1'`

**验收**：
- 物化器输出 ≥ 25 个 preset（10 楼 × overview + 楼层 + 7 子系统 = 至少 25）
- 点击大屏顶部 B01 → 相机平滑飞到 B01 overview preset（≤ 1s 动画）
- 切子系统 hvac → 飞到 `preset_sys_hvac_focus`
- 没有当前"跳一下"的突兀感（动画 lerp 至少 300ms）

**自证要求**：
- `evidence/GK-08/presets.json` —— 物化器输出的 cameraPresets 数组前 30 条
- `evidence/GK-08/preset-flow.log` —— 切 5 个 preset 的相机移动轨迹日志

---

### GK-12 · 文档与回归测试

**优先级**：P0 ｜ **类型**：文档 + QA ｜ **主要文件**：
- `docs/architecture/game-engine-refactor.md` — 已存在（GK-12 不重写，只追加 "Phase 1 交付记录" 段）
- `frontend/tests/e2e/specs/subsystems.spec.ts`（新）—— Playwright e2e

**改动**：
- `game-engine-refactor.md` 末尾追加 "Phase 1 交付记录" 章节：8 个 Story 完成日期、验收人、阻塞点
- 新建 `frontend/tests/e2e/specs/subsystems.spec.ts`：
  - 测试用例：
    1. 启动大屏 → 默认显示 overview 场景
    2. 切到 hvac → S3 面板出现 + 其他子系统隐藏
    3. 点击设备 → DeviceDetailDrawer 打开 + 弹窗内容含设备名/状态
    5. 跨 7 子系统循环切换 → 每次相机动画 + 面板刷新
- 旧 Playwright 用例（如有）保证不回归

**验收**：
- `cd frontend && npx playwright test subsystems.spec` 全绿
- `game-engine-refactor.md` 末尾章节完整

**自证要求**：
- `evidence/GK-12/playwright-report.html` —— 完整测试报告
- `evidence/GK-12/subsystem-flow.png` —— 7 子系统切换截图

---

## Phase 2 — P1/P2 Story（4 个，下期后置，本表仅作 Story 拆分记录）

- **GK-07** · scenarios 取代路由 / store 字段
- **GK-09** · Schema Editor 管理后台
- **GK-10** · 设备弹窗改为 hudLayout widget 模板
- **GK-11** · 跨标签同步迁移到 schema diff 推送

Phase 2 Story 详细卡片待 Phase 1 验收后补全。
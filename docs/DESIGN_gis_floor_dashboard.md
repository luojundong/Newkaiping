# 开平中心医院能源管理平台 — GIS / 楼层标签 / 数据大屏 改造技术方案

> 版本：v1.0（设计稿）
> 日期：2026-08-27
> 范围：在现有 Web 技术栈（NestJS/Fastify + Vue3/Vite + Three.js）上叠加三项能力：
> ① GIS 地图导入与自动建模（Cesium） ② 楼栋每层自定义标签与数据联动 ③ 数据大屏可视化与联动（EasyV/UE 评估）

---

## 1. 目标与原则

| 目标 | 说明 |
|---|---|
| 复用优先 | 不另起炉灶；新能力挂在现有 `scene_config` / `building_display` / `bigscreen-layout` 数据模型与 `runtime.json` 持久化机制上 |
| 合规优先 | 中国地图必须使用合规底图（天地图/腾讯/高德，GCJ-02），底图 key 后端代理，不绘制不完整国界 |
| 实时优先 | 大屏/楼层联动复用现有 WebSocket `live.gateway`（~2s 推送）+ `BroadcastChannel` 跨标签同步 |
| 渐进交付 | 分 4 期，Phase 1 低风险快见效，Phase 2 需先解决底图 key |

---

## 2. 现有架构基线（实测，非推测）

后端 `backend/src`：
- `scene/scene.service.ts`：读写 `scene_config` 集合（`connector.update('scene_config', {}, { building_display, building_anchors, ... })`）；已有 `building_anchors`、`building_display`、`marker_switch`、`geo_origin`。
- `site/site-config.service.ts`：单文档 `data/site-config.json`，`fs.readFileSync/writeFileSync`。
- `bigscreen/bigscreen-layout.service.ts` / `bigscreen-config.service.ts`：单文档 `data/bigscreen-layout.json`、`data/bigscreen-config.json`。
- `websocket/live.gateway.ts`：客户端 `subscribe` 携带 `{building_id, subsystem, device_ids}`，服务端每 ~2s 推送 metrics。
- `common/connector/mock/mock.connector.ts`：`runtime.json` 落盘（`data/runtime.json`），用户实体重启保留。

前端 `frontend/src`：
- `types/api.ts`：`SceneConfig` 含 `geo_origin?{latitude,longitude,address,source}`（**GIS 原点已建模**）、`BuildingDisplay{mode, background_opacity, box_opacity, per_building, show_labels...}`、`building_anchors`。
- `stores/scene.ts`：`scene.init()` 加载 `siteConfig`/`sceneConfig`；`BroadcastChannel('kp-scene-model'/'kp-scene-building-display')` 跨标签同步。
- `components/three/ThreeViewer.vue`：按 `model_type`（3d/panorama/image/video）分支渲染；楼栋体块高度由 `floors × FLOOR_HEIGHT` 推算；已有 `floor` 概念（`api.ts` 设备 `location.floor/room`）。
- `BigScreenLayout.vue`：挂载即 `await scene.init()`；17 框 + 布局 DIY + 主题；已引入 echarts。

---

## 3. 总体架构

（见对话内"目标系统架构"图）

- **渲染层**：Three.js（楼栋/设备/全景，现有） + CesiumJS（地理底图/3D Tiles，新增），双引擎协同。
- **联动层**：`scene store` + `BroadcastChannel` + WebSocket `live.gateway`（现有）。
- **后台层**：现有 Admin + 新增 `FloorLabelAdmin`（新增）。
- **大屏层**：`BigScreenLayout`（现有，扩展框类型/数据源绑定） + 可选 EasyV 演示分支。
- **数据层**：`data/*.json`（现有） + 新增 `floor_labels` / `gis_assets` 集合。

---

## 4. 数据模型设计

### 4.1 楼栋每层标签（扩展 `BuildingDisplay`）

> 现状 `BuildingDisplay` 已到"楼栋级"（`per_building` 透明度、`show_labels`）。新增"每层"维度。

```ts
// frontend/src/types/api.ts
export interface FloorLabel {
  index: number            // 楼层序号，1 = 1F
  label: string            // 自定义标签，如 "门诊大厅" / "住院病区"
  bound_fields?: string[]  // 绑定数据字段 key（来自 runtime / metrics，如 "power.kwh"）
  color?: string           // 该层高亮色（联动告警时覆盖）
  opacity?: number         // 该层楼栋体块透明度覆盖
  visible?: boolean        // 默认 true
}

// 在 BuildingDisplay 增加（推荐按楼栋存放，与 per_building 同级）：
export interface BuildingDisplay {
  // ... 现有字段 ...
  floors_by_building?: Record<string, FloorLabel[]>  // key = building_id
}
```

持久化：随 `scene_config` 一起写入 `runtime.json`（沿用 `connector.update('scene_config', {}, { building_display })`），无需新文件。

### 4.2 GIS 资产（扩展 `geo_origin` + 新增 `gis_assets` 集合）

```ts
// 扩展 SceneConfig.geo_origin（已存在，补充 editable + crs）
geo_origin?: {
  latitude: number
  longitude: number
  address: string
  source: string
  crs: 'GCJ-02' | 'WGS-84'   // 中国区域强制 GCJ-02
  editable?: boolean
}

// 新增集合 gis_assets（落 data/gis-assets.json，沿用单文档 service 模式）
export interface GisAsset {
  id: string
  name: string
  type: 'geojson' | '3dtiles' | 'imagery' | 'glb'
  url: string                // 相对 /uploads/models 或合规底图地址
  crs: 'GCJ-02' | 'WGS-84'
  building_id?: string       // 关联到楼栋
  transform?: { x: number; y: number; z: number; scale: number; heading: number }
  lod_level?: number         // 3D Tiles maximumScreenSpaceError 控制
}
```

底图配置：新增 `data/gis-config.json`（或并入 `site-config`）存 `basemap_provider` + 后端代理路径；**key 不落前端**，由后端 `/api/v1/gis/tile-proxy` 代理。

### 4.3 大屏（复用 `bigscreen-layout.json`，扩展数据源绑定）

```ts
// 在 BigscreenBox 增加可选 data_source（框内图表/数字订阅）
export interface BigscreenBox {
  // ... 现有 x/y/w/h/frame/subsystem/title ...
  data_source?: {
    collection: string       // 如 'floor_labels' | 'devices' | 'metrics'
    building_id?: string
    floor?: number
    subsystem?: string
    metric?: string
  }
  drill?: 'floor' | 'building' | null   // 点击钻取层级
}
```

---

## 5. 后端接口设计

沿用 NestJS 控制器 + 单文档 `fs` 持久化模式（参考 `site-config` / `bigscreen` service）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/PUT | `/api/v1/scene/config` | 现有；`building_display.floors_by_building` 随提交写入 |
| GET/PUT | `/api/v1/floor-labels` | 新增；楼层标签读写（可并入 scene config，独立便于权限隔离） |
| GET/POST/PUT/DELETE | `/api/v1/gis/assets` | 新增；GIS 资产管理 |
| GET | `/api/v1/gis/tile-proxy` | 新增；服务端代理合规底图瓦片（key 在后端，前端不暴露） |
| WS | `live.gateway` | 现有；新增 `floor` 维度订阅，推送楼层级指标 |

权限：复用现有 `PERMISSION_OPTIONS` + 菜单 `permission` 字段；`FloorLabelAdmin` / `GisAdmin` 菜单挂 `user:manage` 或新建 `scene:floor` / `scene:gis`。

---

## 6. 前端模块设计

### 6.1 FloorLabelAdmin（新增）
- 左栏**图层树**（按楼栋→楼层树形，对应"图层控制"）；
- 楼栋**缩略图**（2D 平面示意，对应"缩略图"）；
- 顶部**搜索框**（按楼栋/楼层/标签过滤）；
- 右侧编辑面板：`floors_by_building[building_id]` 增删改 `FloorLabel`（label / bound_fields / color / opacity / visible）；
- 保存 → `scene.saveBuildingDisplay()` → `BroadcastChannel` 实时同步到大屏/3D 视图。

### 6.2 Cesium 集成（双引擎协同）
- 新建 `components/three/GisViewer.vue` 或在 `ThreeViewer` 内初始化 `Cesium.Viewer`：
  - **推荐方案**：Cesium 为主场景（地理底图 + 3D Tiles + GeoJSON 楼栋白模），Three.js 仅叠加精细设备/动画（通过 `Cesium` + `three` 共享相机矩阵）；
  - 缩放/旋转/平移：Cesium `Camera` 原生控制（ScreenSpaceCameraController），零成本；
  - 模型优化：3D Tiles LOD、`maximumScreenSpaceError`、实例化、`KTX2` 纹理压缩；
  - 楼栋对齐：用 `geo_origin` 将现有 `.glb` 经 `transform` 贴到经纬度。
- 合规：底图走 `/api/v1/gis/tile-proxy`；中国区域数据统一 GCJ-02（Cesium 默认 WGS-84 需做坐标反偏或选用支持 GCJ-02 的国内引擎如超图）。

### 6.3 大屏联动
- `PanelCard` 支持 `data_source` 绑定：框内数字/图表订阅 WebSocket metrics + `scene store`；
- 楼层标签点击 → 路由/状态钻取到该层（`drill: 'floor'`）；
- 实时刷新：指标变化 → 标签 `color` 覆盖（如超阈值变红）、数值刷新（沿用现有 2s 推送）。

---

## 7. 实时数据联动方案

```
设备/采集 → backend metrics → WebSocket live.gateway(~2s) → scene store(响应式)
                                                    ↓
                                           BroadcastChannel(跨标签)
                                                    ↓
                          BigScreenLayout 框(PanelCard data_source) / ThreeViewer 楼层标签
```

- 楼层标签 `bound_fields` 绑定指标 → 指标越阈 → 标签高亮 + 大屏对应框刷新；
- 后台改 `floors_by_building` → `BroadcastChannel('kp-scene-building-display')` → 大屏/3D 即时更新（复用现有机制，无需新通道）。

---

## 8. 中国地图合规方案（强制）

| 项 | 要求 |
|---|---|
| 底图来源 | 仅限天地图 / 腾讯 / 高德 / 百度；禁止谷歌、OSM、Mapbox 直连 |
| 坐标系 | 中国区域统一 GCJ-02（火星坐标） |
| key 管理 | 前端不出现明文 key；经后端 `/api/v1/gis/tile-proxy` 代理（Referer 白名单 + 服务端鉴权） |
| 边界绘制 | 国界/台湾/南海诸岛按国家标准，不漏绘、不错标 |
| 敏感坐标 | 不采集/存储/公开个人位置数据；设备坐标仅内部使用 |

> 若使用 Cesium 默认 WGS-84 底图（Cesium ion），**不得**用于中国区域；改用天地图影像（需申请 key）或超图 SuperMap iManager（原生支持 GCJ-02）。

---

## 9. 分阶段实施计划

| 期 | 内容 | 关键交付 | 工作量 | 前置 |
|---|---|---|---|---|
| **Phase 1** | 楼层标签 + 数据联动 | `floors_by_building` schema；`FloorLabelAdmin`（图层树/缩略图/搜索）；标签绑定指标 + 大屏联动变色 | 2–3 周 | 无 |
| **Phase 2** | Cesium 合规底图 + 楼栋对齐 | `GisViewer`；`gis_assets`；`/gis/tile-proxy`；双引擎协同；GeoJSON 拉伸/3D Tiles | 3–4 周 | 底图 key 申请 |
| **Phase 3** | 大屏深化 | `data_source` 框类型；楼层钻取（`drill`）；更多图表（echarts） | 2–3 周 | 无 |
| **Phase 4（可选评估）** | EasyV / UE 分支 | EasyV 演示页（API 对接，数据出境评估）/ UE Pixel Streaming 影视级分支 | 评估+独立预算 | 授权+预算 |

---

## 10. 风险与回滚

- **Phase 2 前置风险**：底图 key 申请周期不可控 → 先用天地图试用 key 跑通，再换生产 key。
- **"自动建模"预期**：GIS 导入为白模/轮廓，非精模；需在需求侧对齐"自动建模 = 轮廓拉伸 + 贴图"，避免误期。
- **双引擎性能**：Cesium + Three 同屏有开销 → 用 3D Tiles LOD + 按需加载，低端机降级为纯 Three 抽象场景。
- **EasyV/UE 数据出境**：内网/涉密场景禁用；仅作外网演示分支。
- 回滚：每期独立 PR + 数据模型向后兼容（`floors_by_building` / `gis_assets` 缺省不报错）；部署用 `kp_redep_keep.mjs` 保留 `data/`。

---

## 11. 验收标准

1. **Phase 1**：后台可为每栋楼每层增删改标签并绑定数据字段；大屏/3D 视图标签随指标实时变色（延迟 ≤ 2s）；刷新后保留。
2. **Phase 2**：合规底图渲染正常，楼栋按 `geo_origin` 对齐；支持缩放/旋转/平移；无黑遮罩/偏移；国界绘制合规。
3. **Phase 3**：大屏新增框可绑定 `data_source`；点击楼层标签可钻取到该层；图表实时刷新。
4. **Phase 4**：（若实施）EasyV/UE 演示页数据联动正常且通过数据出境合规评审。

---

## 12. 待确认决策点（开工前）

- [ ] 底图 provider 选定（天地图 / 腾讯 / 高德）→ 决定 key 申请入口
- [ ] "自动建模"精细度口径（白模 vs 精模）
- [ ] Phase 4 是否启动（授权 + 预算）
- [ ] 楼层标签数据绑定范围（仅展示指标 / 还是可下钻设备列表）

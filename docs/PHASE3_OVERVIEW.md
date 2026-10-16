# 开平市中心医院能源管理软件平台 — Phase 3 交付概览

> 生成：2026-08-17 ｜ 监理单位：大湾区靓仔（项目总监）｜ 状态：Phase 3 开发 + 端到端验证通过

## 1. 整体进度

| 阶段 | 状态 | 产出 |
|------|------|------|
| Phase 0 需求澄清 | 完成 | 7 子系统 / 10 栋楼 / 混合数据 / 双联动导航 已确认 |
| Phase 1 三文档 | 完成 | PRD v1.1 / ARCHITECTURE v1.0+openapi / UIUX v1.1+design-tokens |
| Phase 1.5 Spec | 完成 | `docs/spec/SPEC.md`（13 章锁定契约） |
| Phase 3 并行开发 | 完成 | 前端大屏 + 后端 NestJS，端到端验证通过 |

## 2. 交付物

### 后端 `D:\wwwroot\NewKaiPing\backend`
- NestJS(Fastify) + TypeScript；默认 `mock` 模式，运行不依赖真实 Postgres。
- **混合数据层（ADR-003）**：`Connector` 统一契约 + `ConnectorFactory`（`DATA_SOURCE_MODE=mock|real`）+ `MockConnector`（内存播种 10 栋楼 / 1701 台设备 / 告警规则 / 场景配置 / 管理员 bcrypt 账号）+ `RealConnector` 桩（接缝存在，切换前端零感知）。
- **全部端点（SPEC §5）**：auth/login(admin/admin123→JWT)/menus/features/scene；buildings + `buildings/:id/subsystems`(GET/PUT 可配置)；devices + metrics + control；7 子系统状态/控制；energy summary/trend；alarms(ack/clear/rules)；WS `/api/v1/ws/live`（每 ~2s 推 metrics+alarms）。
- 统一 `{ code, data, message }` 信封；全局 `ValidationPipe` + `GlobalExceptionFilter`（兼容 Fastify `.code().send`）。

### 前端 `D:\wwwroot\NewKaiPing\frontend`
- Vue3 + Vite + TS + Three.js(TresJS) + Pinia + Element Plus；`lucide-vue-next` 唯一图标源（ADR-002）。
- **主交付：3D 数字孪生综合态势大屏** + 顶部双联动导航（楼栋×子系统）。
- `sceneStore` 实现验收标准：**AC-01** 选楼/选系统驱动 3D/左/右面板/WS 重订阅；**AC-02** 按 `building_subsystem_config` 隐藏禁用子系统（全院总览显示全部 7，选中楼仅显示启用项）；**AC-04** 点设备弹详情并订阅该设备 WS。
- API 层覆盖 SPEC §5 全部端点，**零硬编码 mock**（数据来自后端，满足 **AC-03** 混合切换）。
- `hospital.glb` 已复制至 `public/models` 并打进 `dist/models`（后台可替换）。
- 后台骨架含 `/admin/building-subsystem` 配置页（GET+PUT，演示"楼栋子系统可配置"）。

## 3. 端到端验证结果

| 项 | 结果 |
|----|------|
| 后端 `npm run build` | 通过（退出 0） |
| 后端冒烟（19 项 + WS） | 全 OK；设备数 /devices?building_id=2 → 139（与合同台账一致） |
| 楼栋子系统可配置 | GET/PUT `/buildings/:id/subsystems` 生效；1 号楼 enabledCount=0（合同预留正确） |
| 鉴权信封 | 200 登录返 token；401 未认证；400 空 body 返 `{code:400,message:"username should not be empty; ..."}` |
| 前端 `vue-tsc` 类型检查 | 通过（3865 模块，无类型错误） |
| 前端 `vite build` | 通过（`dist` 含 three/echarts/element 分包 + hospital.glb，图标仅 lucide 分包） |

## 4. 验证期间修复

1. **P0 红线**：移除 `main.ts` 中全局注册 `@element-plus/icons-vue`（ADR-002 要求 lucide 唯一图标源）。模板中唯一图标 `<RefreshCw>` 来自 lucide，不受影响。
2. **构建环境**：`vite.config.ts` 设 `emptyOutDir:false`，规避 Windows 下 Vite safe-delete 截断导致 `build` 失败（类型检查本身通过）。

## 5. 如何运行

```bash
# 后端（端口 3000）
cd D:\wwwroot\NewKaiPing\backend
npm install && npm run start:dev
# 默认账号 admin / admin123

# 前端（端口 5173，Vite 代理 /api → localhost:3000）
cd D:\wwwroot\NewKaiPing\frontend
npm install && npm run dev
# 浏览器打开 http://localhost:5173 → /bigscreen/overview
```

## 6. 已知缺口（待用户补全）

- **R1**：1 号楼（120 急救中心）设备台账缺失，`building_subsystem_config` 全 false 预留，待现场调研解锁。
- **R2**：合同控制 / 模型同步延迟【】毫秒空白，需甲方补量化阈值，否则验收无据。
- 真实硬件 / 协议对接（Modbus/MQTT/HTTP）待甲方设备到货后切换 `RealConnector`。

## 7. 下一步建议

1. 补 1 号楼台账 → 全院 10 栋完整数据。
2. 联调 3D 设备点位真实局部坐标（当前按楼栋生成，需真实锚点）。
3. 灰度接入真实数据源（实现 `RealConnector`）。
4. 后台管理剩余页面（用户/角色/权限/日志）细化与联调。

# 阶段四 扩展契约（开平市中心医院能源管理平台）

本文档锁定在 SPEC.md 基础上新增的端点、数据形状与前端要求，作为后端与前端并行的唯一契约。
所有响应沿用 `{ code:0, data, message }` 包络；错误非零 code + message。默认 mock 模式，经 Connector。

> 数据库说明：MVP 仍为内存 Mock（MockConnector），CRUD 写入内存并在 `backend/data/runtime.json` 落盘以便重启保留（演示用）。生产经 ADR-004 的 Postgres+TimescaleDB，由 Connector 切换，前端零感知。

## 1. 大屏面板数据（模拟数据联动）
`GET /api/v1/bigscreen/panels?building_id=&subsystem=`
返回由当前 mock 状态（设备/告警/能耗/子系统状态）实时计算的全量面板数据：
```
{
  left: { alarmItems: [{ name, key, count, level }], alarmTotal },
  right: {
    acStats: [{ label, value, unit, color }],        // 空调系统
    powerStats: [{ label, value, unit, color }],      // 供配电
    energyStats: [{ label, value, unit, color }],     // 能耗统计
    elevatorStats: [{ label, value, unit, color }],   // 电梯运行
    tempTrend: number[], loadTrend: number[], energyTrend: number[], trafficTrend: number[],
    timeLabels: string[],
    voltageStability: number, phaseA/B/C: number,
    humidityRate: number, dryHumidity: number, wetHumidity: number,
    onlineRate: number, onlineCount: number, offlineCount: number
  },
  bottom: { energyTrend: [{ t, value }], bySubsystem: [{ name, value, color }] }
}
```
前端每 15s 轮询刷新。选楼/选子系统时带 building_id/subsystem 过滤。

## 2. 设备 CRUD（需求3、5）
- `POST /api/v1/devices` 创建。Body：`{ code, name, model, manufacturer, category, building_id, location:{floor,room}, status, connection:{type:'MQTT'|'Modbus'|'HTTP', endpoint, gateway?}, subsystem }`
- `PUT /api/v1/devices/:id` 更新（同上可选字段，含改名）
- `DELETE /api/v1/devices/:id` 删除
- 列表 `GET /devices` 已存在，返回含新字段。

## 3. 楼栋 CRUD
- `POST /api/v1/buildings` / `PUT /api/v1/buildings/:id` / `DELETE /api/v1/buildings/:id`
- Body（创建）：`{ code, name, floors, area, description }`；DELETE 级联清子系统配置。

## 4. 用户 / 角色 CRUD（需求3）
- 用户：`GET /api/v1/users?page&limit&keyword` / `POST` / `PUT /api/v1/users/:id` / `DELETE /api/v1/users/:id`
  - Body：`{ username, name, password?, role:'admin'|'operator'|'viewer', permissions:string[], phone?, email? }`
- 角色：`GET /api/v1/roles` / `POST` / `PUT /api/v1/roles/:id` / `DELETE /api/v1/roles/:id`
  - Body：`{ code, name, permissions:string[], description }`（权限如 `device:control`,`device:edit`,`user:manage`,`building:config`,`alarm:config`,`billing:manage`,`report:export`）

## 5. 计费管理（需求6）
- 电价：`GET/POST /api/v1/billing/prices` / `PUT /api/v1/billing/prices/:id` / `DELETE /api/v1/billing/prices/:id`
  - Body：`{ name, type:'peak'|'flat'|'valley', price:number, start:'00:00', end:'24:00', unit:'元/kWh' }`
- 配额：`GET/POST /api/v1/billing/quotas` / `PUT /api/v1/billing/quotas/:id` / `DELETE /api/v1/billing/quotas/:id`
  - Body：`{ scope:'building'|'device', ref_id, period:'month', quota_kwh:number, warning_pct:number }`
- 充值/账户：`GET /api/v1/billing/accounts?scope=&ref_id=` / `POST /api/v1/billing/recharges` `{ scope, ref_id, amount, remark }` → 返回账户余额与流水。

## 6. 历史数据查询 + 下载（需求7）
- `GET /api/v1/history?building_id=&device_id=&subsystem=&from=&to=&keys=&page=&limit=`
  - 返回 `{ items:[{ ts, device_id, device_name, building_id, key, value, unit }], total }`（mock 生成器产出近 30 天、按楼/设备/子系统过滤）
- 下载：`GET /api/v1/history/export?...&format=csv` → `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename=history_*.csv`，UTF-8 BOM 防中文乱码。

## 7. 告警异常配置（需求8）
扩展现有 `/alarms/rules` 为完整 CRUD：
- `GET /api/v1/alarm-rules?subsystem=&enabled=` / `POST` / `PUT /api/v1/alarm-rules/:id` / `DELETE /api/v1/alarm-rules/:id`
- Body：`{ event_code, event_name, description, subsystem, device_category?, notify_enabled:bool, alarm_enabled:bool, level:'info'|'warning'|'critical', threshold:number, recovery_threshold:number, unit?, comparator:'>'|'<'|'>='|'<=' }`
- 种子：预置温度/湿度/电压/电流/水压/设备离线等常见事件规则（与参考 left-panel 告警项对应）。

## 8. 报表导出（需求4）
- `GET /api/v1/reports/export?type=devices|energy|alarms|history&format=csv&building_id=&from=&to=` → CSV 附件。
  - devices：设备台账；energy：能耗汇总/趋势；alarms：告警记录；history：历史指标。

## 9. 场景模型上传（需求3：上传 .glb）
- `POST /api/v1/scene/model`（`multipart/form-data`，字段 `file` .glb）→ 存 `backend/public/uploads/models/<name>`，Nest 静态 serve `/uploads/**`；更新 `scene_config.model_url` 为该路径；返回新 model_url。
- 前端 `vite.config.ts` 已加 proxy `/uploads` → `http://localhost:5168`（由总监配置）。
- 默认 model_url 改为 `/models/hospital.glb`（frontend public 已含），确保开箱即嵌入。

## 10. 前端要求（P0 红线）
- 图标仅 `lucide-vue-next`，禁止 FontAwesome/emoji/紫粉渐变。
- 大屏视觉对齐参考 `D:\wwwroot\all\bigscreen`（四角装饰、卡标题 clip-path、数字翻滚、stat-grid、echarts 趋势/仪表），但用本项目暗蓝指挥舱 token。
- 管理后台各模块提供增删改表单与导出按钮（Element Plus），数据走后端新增端点。
- 不修改 `src/api/index.ts`（总监已补充全部客户端方法）。

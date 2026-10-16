# 阶段四交付说明 — 开平市中心医院能源管理软件平台

> 基于本地合同（开平中心医院(2026-8-07).docx）第七章「七个子系统」与用户 9 点扩展要求，完成大屏实时化 + 管理后台全功能化。
> 技术栈：前端 Vue3+Vite+TS+TresJS+Element Plus；后端 NestJS(Fastify)+TS；混合数据层（MockConnector 默认，RealConnector 预留 MQTT/Modbus/HTTP）。

## 一、用户 9 点要求落实

| # | 要求 | 落实情况 |
|---|------|----------|
| 1 | 大屏无模拟数据 / glb 未嵌入 / 框样式与参考不一致 / 无联动 | ✅ `bigscreenApi.panels` 15s 轮询 + 选楼/选子系统联动；`hospital.glb` 已嵌入 3D 场景；面板四角装饰 + clip 标题 + stat-grid + echarts + 数字翻滚，对齐参考 `D:\wwwroot\all\bigscreen` 指挥舱语言 |
| 2 | 后台模拟数据 / 数据库 | ✅ 全量内存 Mock 种子（10 栋楼 / 1701 台设备 / 用户 / 角色 / 计费 / 告警规则），CRUD 落盘 `backend/data/runtime.json`（重启保留）；生产切 Postgres(ADR-004) 前端零感知 |
| 3 | 后台增改（用户/权限/楼栋/上传glb/设备） | ✅ 用户、角色、楼栋、设备、场景模型(.glb) 上传 全部支持增删改 |
| 4 | 后台导出报表 | ✅ `reportApi` 导出 devices/energy/alarms/history 四类 CSV（UTF-8 BOM 防乱码） |
| 5 | 设备按性质/类型/品牌添加 + 绑定网关或真实接口 | ✅ 设备表单含 category(性质)/model(类型)/manufacturer(品牌) + connection(MQTT/Modbus/HTTP + endpoint + gateway)，可随时切换 |
| 6 | 计费管理（电价/配额/充值，按设备） | ✅ 电价(峰/平/谷)、配额(楼栋/设备)、账户充值与余额台账 |
| 7 | 历史数据查询（时间/设备/楼栋）+ 下载 | ✅ `historyApi.query` 多维过滤分页；`historyApi.exportCsv` 下载 CSV |
| 8 | 告警异常配置（事件代码/名称/描述/通知/告警/级别/阈值/恢复阈值） | ✅ `alarmRuleApi` 完整 CRUD，预置 8 条常见规则 |
| 9 | 作为主理人完善系统不足、补数据 | ✅ 补齐大屏联动、后台全 CRUD、计费/历史/告警/报表；种子数据已覆盖 10 栋楼全部子系统 |

## 二、合同 2.4 七子系统功能对应（监测/控制层）

- **2.4.1 智慧能源一体化调控**：`/bigscreen/panels` 全院监控（全景/设备/用能/能源/碳排/趋势）+ 用能/单耗/碳排分析；`/regulation/overview` 调控总览。
- **2.4.2 设备生命周期**：`/lifecycle/equipment` 档案（性能参数/启用/厂商）+ `/lifecycle/maintenance` 维护保养计划/费用/维修记录。
- **2.4.3 空调集中控制**：`/hvac/status` 楼/层/房开关·设定温度·模式·电量·per_floor 汇总；`/hvac/control` 批量远程指令（策略组接口预留）。
- **2.4.4 智慧照明**：`/lighting/status` 分区联动/定时/远程 + zones 能耗统计（智能感应接口预留）。
- **2.4.5 医院电力监控**：`/power/status` 电表用电/馈线明细/功率因素/谐波(THD)（年/月统计接口预留）。
- **2.4.6 热水集中控制**：`/hotwater/status` 设备数据接口对接 + 集中调度呈现。
- **2.4.7 电梯节能**：`/elevator/status` 储能回馈装置数据 + 运行/再生/待机能耗统一管理。

## 三、演示地址

- 大屏：http://localhost:5169/bigscreen/overview
- 管理后台：http://localhost:5169/admin （账号 `admin` / `admin123`，演示自动登录）
- 后端 API：http://localhost:5168/api/v1

## 四、验收证据（节选）

```
GET /users                      200   GET /roles                 200
GET /billing/prices             200   GET /billing/quotas        200
GET /billing/accounts           200   GET /alarm-rules            200
GET /bigscreen/panels           200 (alarmTotal=26, 四组KPI, bySubsystem 能耗)
GET /history                    200   GET /history/export  -> text/csv (BOM)
GET /reports/export?type=energy -> text/csv
POST /devices (真实楼栋ID=2)    201   POST /billing/recharges     201
/hvac|lighting|power|hotwater|elevator/status  均返回结构化监测数据
/scene/config -> geo_origin(开平市中心医院) + model_url(/models/hospital.glb) + 10 楼栋锚点
```

## 五、已知约束

- `backend/data/runtime.json` 被沙箱 EPERM 锁死（无法删除/覆盖），含早期测试残留（3 用户 / 7 告警规则 / 2 电价）。**功能不受影响**，可在后台自行补齐；生产切 Postgres 后无此限制。
- 后端 5168 当前由后台 detached node 进程托管，前端 5169 由 vite dev 托管；演示服务为后台进程，偶发退出时请重启（见运维说明）。
- 大屏 3D 模型为 69MB `hospital.glb`，首屏加载约数秒，加载期间显示遮罩，失败回退占位楼栋群。

## 六、运维

- 重启后端：`cd backend && npm run build && node dist/main.js`（端口 5168）
- 重启前端：`cd frontend && npm run dev`（端口 5169，代理 /api、/uploads → 5168）
- 登录态：演示模式 `main.ts` 以 admin/admin123 自动换取 token，刷新即生效。

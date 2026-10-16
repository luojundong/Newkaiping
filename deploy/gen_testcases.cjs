// 生成测试用例表格 .xls（Excel 2003 SpreadsheetML 格式，Excel 可直接打开）。
// 用法：node gen_testcases.cjs  ->  输出 D:/wwwroot/NewKaiPing/deploy/测试用例表格.xls
// 数据驱动：TESTCASES 数组；新增用例直接 push。
const fs = require('fs')

const COLS = ['用例编号', '功能模块', '测试点', '前置条件', '测试步骤', '预期结果', '优先级', '类型', '状态', '关联缺陷/备注']
const W = [10, 12, 22, 26, 40, 34, 8, 10, 10, 24]

// 状态图例：通过 / 已修复 / 待修复 / 不适用
// 类型：功能 / 安全 / 边界 / 回归 / UI / 性能
const TESTCASES = [
  // ===== 认证 =====
  ['TC-001', '认证', '管理员登录成功', '服务已启动', 'POST /api/v1/auth/login {username:admin,password:admin123}', '返回 code=0，data 含 token，role=admin', 'P0', '功能', '通过', '基准冒烟'],
  ['TC-002', '认证', '错误密码登录失败', '无', 'POST /api/v1/auth/login 错误密码', '返回 401，未签发 token', 'P0', '安全', '通过', ''],
  ['TC-003', '认证', '缺 token 访问受保护接口', '无', 'GET /api/v1/devices 不带 Authorization', '返回 401「未认证或 token 失效」', 'P0', '安全', '通过', 'JwtAuthGuard'],
  ['TC-004', '认证', '无效/过期 token', '已登录', '携带伪造 token 访问接口', '返回 401，不泄露数据', 'P1', '安全', '通过', 'JwtAuthGuard.handleRequest'],

  // ===== 权限 RBAC（B1 修复）=====
  ['TC-010', '权限', 'viewer 禁止新建用户', '存在 viewer 角色令牌', 'viewer 令牌 POST /api/v1/users {role:admin}', '返回 403「权限不足」', 'P1', '安全', '已修复', 'B1 @Roles(admin)'],
  ['TC-011', '权限', 'viewer 禁止自提权', 'viewer 令牌', 'viewer PUT /api/v1/users/:selfId {role:admin}', '返回 403，角色不被提升', 'P1', '安全', '已修复', 'B1 防垂直越权'],
  ['TC-012', '权限', 'viewer 禁止删除用户', 'viewer 令牌', 'viewer DELETE /api/v1/users/:id', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-013', '权限', 'viewer 禁止新建角色', 'viewer 令牌', 'viewer POST /api/v1/roles', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-014', '权限', 'viewer 禁止保存地图配置', 'viewer 令牌', 'viewer PUT /api/v1/gis/config', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-015', '权限', 'viewer 禁止保存大屏样式', 'viewer 令牌', 'viewer PUT /api/v1/bigscreen/config', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-016', '权限', 'viewer 禁止新增/删除设备', 'viewer 令牌', 'viewer POST/DELETE /api/v1/devices', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-017', '权限', 'viewer 禁止删除楼栋', 'viewer 令牌', 'viewer DELETE /api/v1/buildings/:id', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-018', '权限', 'viewer 禁止场景写接口', 'viewer 令牌', 'viewer PUT /api/v1/scene/subsystem-meta 等', '返回 403', 'P1', '安全', '已修复', 'B1'],
  ['TC-019', '权限', 'admin 可执行全部写接口', 'admin 令牌', 'admin 调用上述所有写接口', '均返回 2xx 成功', 'P1', '安全', '已修复', 'B1'],
  ['TC-020', '权限', 'viewer 可读接口正常开放', 'viewer 令牌', 'viewer GET /api/v1/devices、/buildings、/bigscreen/layout', '返回 2xx 数据', 'P2', '功能', '通过', '未标注@Roles则放行'],

  // ===== 设备管理 =====
  ['TC-030', '设备管理', '设备分页查询', '已登录', 'GET /api/v1/devices?page=1&limit=20', '返回 {items,total,page,limit}，分页正确', 'P1', '功能', '通过', 'limit 上限 1000'],
  ['TC-031', '设备管理', '按楼栋过滤', '已登录', 'GET /api/v1/devices?building_id=1', '仅返回 1 号楼设备', 'P1', '功能', '通过', '前端传 building_id'],
  ['TC-032', '设备管理', '按 code 过滤（B8 修复）', '已登录', 'GET /api/v1/devices?code=B1-SCREW_CHILLER-001', '精确返回该设备；修复前该参数被白名单剥离导致全量返回', 'P1', '功能', '已修复', 'B8 补 code 字段'],
  ['TC-033', '设备管理', '创建设备缺 building_id（B2 修复）', 'admin 令牌', 'POST /api/v1/devices {} 不传 building_id', '返回 400「building_id 必填」；修复前静默在 1 号楼建孤儿设备', 'P1', '安全', '已修复', 'B2 显式校验'],
  ['TC-034', '设备管理', '创建设备到不存在楼栋', 'admin 令牌', 'POST /api/v1/devices {building_id:999}', '返回 400「楼栋不存在」', 'P1', '边界', '已修复', 'B2'],
  ['TC-035', '设备管理', '删除设备', 'admin 令牌', 'DELETE /api/v1/devices/:id', '返回成功，设备从列表消失（重启不回现）', 'P1', '功能', '通过', 'mock deleted 机制'],
  ['TC-036', '设备管理', '设备控制下发', 'admin 令牌', 'POST /api/v1/devices/:id/control', '返回控制回执', 'P2', '功能', '通过', ''],

  // ===== 地图配置（B4 修复）=====
  ['TC-040', '地图配置', 'viewer 不泄露地图 Key（B4 修复）', 'viewer 令牌', 'GET /api/v1/gis/config', '返回不含 tiandituKey/gaodeKey 等字段（仅 provider/baseLayer/showLabel/center）', 'P1', '安全', '已修复', 'B4 角色分支 getPublicConfig'],
  ['TC-041', '地图配置', 'admin 可见完整配置', 'admin 令牌', 'GET /api/v1/gis/config', '返回含全部 Key 字段', 'P1', '安全', '已修复', 'B4'],
  ['TC-042', '地图配置', '瓦片代理不暴露 Key', '无', 'GET /api/v1/gis/tile-proxy?...', '返回瓦片二进制，Key 仅服务端拼接', 'P1', '安全', '通过', '合规：前端绝不接触原始 Key'],
  ['TC-043', '地图配置', '瓦片参数非法校验', '无', 'tile-proxy?z=99', '返回 400 参数非法', 'P2', '边界', '通过', ''],

  // ===== 大屏布局/样式 =====
  ['TC-050', '大屏布局', '布局读取合并默认', '已登录', 'GET /api/v1/bigscreen/layout?system=overview', '返回 17 框 x/y/w/h/frame（含 innerBorderColor 透传）', 'P1', '功能', '通过', 'Fix B 透传'],
  ['TC-051', '大屏布局', '布局保存 round-trip', 'admin 令牌', 'PUT /api/v1/bigscreen/layout 改 innerBorderColor 后 GET 校验', 'GET 持久化该颜色（重启后仍保留）', 'P1', '回归', '已修复', 'Fix B 后端 round-trip'],
  ['TC-052', '大屏样式', '样式读取', '已登录', 'GET /api/v1/bigscreen/config?system=overview', '返回合并默认样式（accent/bg/panelAlpha/radius 等）', 'P1', '功能', '通过', ''],
  ['TC-053', '大屏样式', '圆角滑块生效（Fix D）', 'admin 令牌', '后台改 radius 保存，大屏查看', '圆角随 radius 变化；左/右/底栏宽滑块已移除（参考页无此容器）', 'P2', 'UI', '已修复', 'Fix D 删死控件'],
  ['TC-054', '大屏', '重置样式为默认（B7 修复）', 'admin 令牌', 'DELETE /api/v1/bigscreen/config?system=overview', '返回默认样式，已保存项被清除', 'P2', '功能', '已修复', 'B7 新增 DELETE'],
  ['TC-055', '大屏', '重置布局为默认（B7 修复）', 'admin 令牌', 'DELETE /api/v1/bigscreen/layout?system=overview', '返回默认 17 框布局', 'P2', '功能', '已修复', 'B7 新增 DELETE'],

  // ===== 3D 场景 / DIY =====
  ['TC-060', '3D场景', '场景配置加载', '已登录', 'GET /api/v1/scene/config', '返回模型 URL/楼栋锚点', 'P1', '功能', '通过', ''],
  ['TC-061', '3D场景', '楼栋位置 DIY 优先 anchor（Fix C）', 'admin 令牌', '改 building_anchors 后刷新 3D', '楼栋按 anchor 定位，回退 position', 'P1', '回归', '已修复', 'Fix C anchorOf 优先'],
  ['TC-062', '3D场景', '子系统名自定义生效（Fix A）', 'admin 令牌', 'PUT /api/v1/scene/subsystem-meta 改名，看综合概述面板', '面板显示自定义名（metaOf 用 subsystemName）', 'P1', '回归', '已修复', 'Fix A'],
  ['TC-063', '3D场景', 'HUD 框内描边色透传（Fix E）', 'admin 令牌', 'schema hud 设 innerBorderColor 保存查看', '前端 PanelCard 应用该色', 'P2', '回归', '已修复', 'Fix E hudWidgetToBox'],
  ['TC-064', '3D场景', '楼栋显示 DIY', 'admin 令牌', 'PUT /api/v1/scene/building-display', '楼栋区域/背景透明度更新', 'P2', '功能', '通过', ''],
  ['TC-065', '3D场景', '3D 标记 CRUD', 'admin 令牌', 'POST/PUT/DELETE /api/v1/scene/markers', '标记增删改生效', 'P2', '功能', '通过', 'B1 已加 admin 守卫'],

  // ===== 数据完整性事故恢复 =====
  ['TC-070', '数据完整性', '1号楼种子设备恢复', '线上 runtime.json 误删', '恢复 deleted 中 20 台 HVAC 种子并重启', 'GET /devices 1 号楼=139 台，螺杆机 001+002 均在', 'P0', '回归', '已修复', 'QA误删事故恢复'],
  ['TC-071', '数据完整性', 'junk 测试设备清理', '恢复后', '核查 devices.data', '无 dev-msx*/dev-mtuy* 等测试设备残留', 'P1', '回归', '已修复', '清理2条junk+幽灵deleted'],

  // ===== 全局异常 / 边界 =====
  ['TC-080', '全局', '未知 system 参数', '已登录', 'GET /api/v1/bigscreen/layout?system=xxx', '回落默认或空，不 500', 'P2', '边界', '通过', ''],
  ['TC-081', '全局', '空 body 写接口不再 400（前端 B3/Fix A）', 'admin 令牌', '前端 apiDelete 在无 data 时移除 Content-Type；DELETE /devices/:id 不带 body 头', '后端按空体处理返回 2xx/404（修复前 Fastify 抛 400）；后端严禁注册同名 application/json parser 以免启动崩溃', 'P1', '边界', '已修复', 'Fix A 前端修复+启动避坑'],
  ['TC-082', '全局', '未知路由', '无', 'GET /api/v1/nonexist', '返回 404 统一包装', 'P2', '边界', '通过', ''],

  // ===== 能源/告警/工单（通用功能）=====
  ['TC-090', '能源', '能耗趋势查询', '已登录', 'GET /api/v1/energy/trend', '返回趋势数据', 'P2', '功能', '待回归', '前端QA覆盖'],
  ['TC-091', '告警', '告警列表', '已登录', 'GET /api/v1/alarms', '返回活跃告警', 'P2', '功能', '待回归', ''],
  ['TC-092', '告警', '告警确认/清除', 'admin 令牌', 'POST /api/v1/alarms/:id/ack|clear 空 body', '返回成功（B3 空 body 不再 400）', 'P2', '功能', '已修复', 'B3'],
  ['TC-093', '工单', '工单列表/分页', '已登录', 'GET /api/v1/work-orders', '返回分页工单', 'P2', '功能', '待回归', ''],

  // ===== 前端 QA（本轮回溯，FE 缺陷修复）=====
  ['TC-100', '前端-安全', '403 统一友好提示（FE-001）', '非 admin 令牌', '触发任一 @Roles(admin) 写接口（如 PUT /bigscreen/config）', '拦截器返回「权限不足，请联系管理员或使用 admin 账号操作」，不抛出原始异常、不误登出', 'P1', '安全', '已修复', 'request.ts 响应拦截器增 403 分支'],
  ['TC-101', '前端-权限', 'canControl 移除不存在的 operator 角色（FE-002）', '源码审计', '审查 stores/user.ts canControl()', '不再引用后端角色集（admin/maintainer/duty/leader/viewer）之外的 operator；与后端 @Roles(admin) 对齐', 'P1', '安全', '已修复', '死角色引用导致越权误判'],
  ['TC-102', '前端-UI', '审计页状态色改用令牌（FE-003）', '源码审计', '审查 AuditTrailAdmin.vue is-broken/is-warn/is-overdue', '由 #ff5b5b/#e6a23c 改为 var(--kp-danger)/var(--kp-warn)，无硬编码色', 'P2', 'UI', '已修复', '设计令牌合规 P0 规则'],
  ['TC-103', '前端-架构', 'ThreeViewer facade 合规（Area5）', '源码审计', '审查 components/three/ThreeViewer.vue', '仅做事件路由与 store 接线，渲染交 SceneRenderer、交互交 InteractionController；无内联渲染逻辑', 'P2', '功能', '通过', 'GK-04 拆分后 facade'],
  ['TC-104', '前端-UI', '后台页 admin 外壳一致（Area1）', '源码审计', '审查所有 admin 页根节点', '统一使用 .admin-page/.admin-toolbar/.kp-panel/.kp-corner/.kp-panel-title 三件套', 'P2', 'UI', '通过', ''],
  ['TC-105', '前端-大屏', '大屏 DIY 保存 round-trip（Area3）', 'admin 令牌', '后台改样式/布局（含 title/titleSize/titleColor/borderColor）保存后 GET 校验', 'GET 持久化且字段不丢失；部署后回归', 'P1', '回归', '待回归', '需部署后验证'],
  ['TC-106', '前端-同步', '跨标签实时同步 + 401 跳登录（Area6）', '多标签', '一标签改楼栋显示/子系统，另一标签 BroadcastChannel 收通知刷新', 'store 经 kp-scene-model/kp-scene-building-display 同步；401 清除令牌并引导登录', 'P1', '功能', '通过', 'stores/scene.ts、stores/bigscreen.ts'],
  ['TC-107', '前端-权限', 'RBAC 菜单按权限过滤（Area7）', '非 admin 令牌', '以 viewer/leader 登录进入后台', '仅显示有权限菜单项，写接口按钮不可见；后端兜底 @Roles', 'P1', '安全', '通过', 'AdminLayout 按 permission 过滤'],
  ['TC-108', '前端-认证', '登录 JWT 写入与请求拦截', '未登录', '登录后检查 localStorage kp-auth-token 与请求头 Authorization', 'token 持久化，axios 拦截器附加 Bearer', 'P0', '安全', '通过', 'lib/request.ts'],
  ['TC-109', '前端-UI', '审计页打印白底不影响屏幕主题', '源码审计', '审查 AuditTrailAdmin.vue @media print', '#fff 背景仅作用于 @media print，屏幕态仍为深色主题', 'P2', 'UI', '通过', '非缺陷，确认'],
]

// ===== SpreadsheetML 2003 生成 =====
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function cell(data, type) {
  const t = type || (typeof data === 'number' ? 'Number' : 'String')
  return `<Cell><Data ss:Type="${t}">${esc(data)}</Data></Cell>`
}
const headerRow = `  <Row>${COLS.map((c) => cell(c)).join('')}</Row>`
const dataRows = TESTCASES.map(
  (r) => `  <Row>${r.map((v, i) => cell(v, i === 6 ? 'String' : undefined)).join('')}</Row>`,
).join('\n')
const colDefs = W.map((w) => `<Column ss:Width="${w}"/>`).join('')

const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:x="urn:schemas-microsoft-com:office:excel">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E4E7E" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Wrap"><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>
 </Styles>
 <Worksheet ss:Name="测试用例">
  <Table>${colDefs}
${headerRow}
${dataRows}
  </Table>
 </Worksheet>
</Workbook>`

const out = 'D:/wwwroot/NewKaiPing/deploy/测试用例表格.xls'
fs.writeFileSync(out, xml, 'utf-8')
console.log('已生成', out, '用例数=', TESTCASES.length)

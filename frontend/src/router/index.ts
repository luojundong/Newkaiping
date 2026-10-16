import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/bigscreen/overview' },
  {
    path: '/bigscreen/overview',
    name: 'BigScreenOverview',
    component: () => import('@/views/bigscreen/OverviewView.vue'),
    meta: { layout: 'bigscreen', title: '综合态势大屏' },
  },
  {
    path: '/bigscreen/building/:id/:subsystem?',
    name: 'BigScreenBuilding',
    component: () => import('@/views/bigscreen/BuildingView.vue'),
    meta: { layout: 'bigscreen', title: '楼栋 subsystems 视图' },
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { layout: 'admin' },
    children: [
      { path: '', redirect: '/admin/building-subsystem' },
      {
        path: 'building-subsystem',
        name: 'AdminBuildingSubsystem',
        component: () => import('@/views/admin/BuildingSubsystemConfig.vue'),
        meta: { title: '楼栋子系统配置' },
      },
      {
        path: 'device',
        name: 'AdminDevice',
        component: () => import('@/views/admin/DeviceAdmin.vue'),
        meta: { title: '设备管理' },
      },
      {
        path: 'alarm',
        name: 'AdminAlarm',
        component: () => import('@/views/admin/AlarmAdmin.vue'),
        meta: { title: '告警管理' },
      },
      {
        path: 'energy',
        name: 'AdminEnergy',
        component: () => import('@/views/admin/EnergyAdmin.vue'),
        meta: { title: '能耗报表' },
      },
      {
        path: 'user',
        name: 'AdminUser',
        component: () => import('@/views/admin/UserAdmin.vue'),
        meta: { title: '用户管理', permission: 'user:manage' },
      },
      {
        path: 'role',
        name: 'AdminRole',
        component: () => import('@/views/admin/RoleAdmin.vue'),
        meta: { title: '角色管理', permission: 'user:manage' },
      },
      {
        path: 'log',
        name: 'AdminLog',
        component: () => import('@/views/admin/LogAdmin.vue'),
        meta: { title: '操作日志' },
      },
      {
        path: 'audit-trail',
        name: 'AdminAuditTrail',
        component: () => import('@/views/admin/AuditTrailAdmin.vue'),
        meta: { title: '审查追踪' },
      },
      {
        path: 'device-control',
        name: 'AdminDeviceControl',
        component: () => import('@/views/admin/DeviceControlAdmin.vue'),
        meta: { title: '设备控制' },
      },
      {
        path: 'building',
        name: 'AdminBuilding',
        component: () => import('@/views/admin/BuildingAdmin.vue'),
        meta: { title: '楼栋管理' },
      },
      {
        path: 'billing',
        name: 'AdminBilling',
        component: () => import('@/views/admin/BillingAdmin.vue'),
        meta: { title: '计费管理' },
      },
      {
        path: 'history',
        name: 'AdminHistory',
        component: () => import('@/views/admin/HistoryAdmin.vue'),
        meta: { title: '历史数据' },
      },
      {
        path: 'monitoring',
        name: 'AdminMonitoring',
        component: () => import('@/views/admin/MonitoringView.vue'),
        meta: { title: '监控运维' },
      },
      {
        path: 'scene',
        name: 'AdminScene',
        component: () => import('@/views/admin/SceneAdmin.vue'),
        meta: { title: '场景模型上传' },
      },
      {
        path: 'marker',
        name: 'AdminMarker',
        component: () => import('@/views/admin/MarkerAdmin.vue'),
        meta: { title: '标记管理' },
      },
      {
        path: 'building-display',
        name: 'AdminBuildingDisplay',
        component: () => import('@/views/admin/BuildingDisplayAdmin.vue'),
        meta: { title: '楼栋显示DIY' },
      },
      {
        path: 'floor-label',
        name: 'AdminFloorLabel',
        component: () => import('@/views/admin/FloorLabelAdmin.vue'),
        meta: { title: '楼栋楼层标签' },
      },
      {
        path: 'subsystem-menu',
        name: 'AdminSubsystemMenu',
        component: () => import('@/views/admin/SubsystemMenuAdmin.vue'),
        meta: { title: '子系统菜单' },
      },
      {
        path: 'site-config',
        name: 'AdminSiteConfig',
        component: () => import('@/views/admin/SiteConfigAdmin.vue'),
        meta: { title: '站点配置' },
      },
      {
        path: 'gis-config',
        name: 'AdminGisConfig',
        component: () => import('@/views/admin/GisConfigAdmin.vue'),
        meta: { title: '地图底图配置' },
      },
      {
        path: 'bigscreen-style',
        name: 'AdminBigscreenStyle',
        component: () => import('@/views/admin/BigscreenStyleAdmin.vue'),
        meta: { title: '大屏样式配置' },
      },
      {
        path: 'bigscreen-layout',
        name: 'AdminBigscreenLayout',
        component: () => import('@/views/admin/BigscreenLayoutAdmin.vue'),
        meta: { title: '大屏布局 DIY' },
      },
      {
        path: 'panel-system',
        name: 'AdminPanelSystem',
        component: () => import('@/views/admin/PanelSystemAdmin.vue'),
        meta: { title: '大屏面板系统' },
      },
      {
        path: 'schema-editor',
        name: 'AdminSchemaEditor',
        component: () => import('@/views/admin/SchemaEditorView.vue'),
        // scene:schema 为前端菜单/守卫用权限点（admin 角色默认放行；见 AdminLayout DEFAULT_MENUS），
        // 后端 PUT /scene/schema 仅 JWT 守卫，不校验该权限点（GK-09）。
        meta: { title: 'Schema 编辑器', permission: 'scene:schema' },
      },
      // 已合并到告警管理（异常配置）与能耗报表（报表导出）的遗留路由，重定向回父页
      { path: 'alarm-rules', redirect: '/admin/alarm' },
      { path: 'reports', redirect: '/admin/energy' },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/bigscreen/overview' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

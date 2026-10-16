import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ConnectorModule } from './common/connector/connector.module';
import { SourceInterceptor } from './common/source/source.interceptor';
import { AuthModule } from './auth/auth.module';
import { BuildingsModule } from './buildings/buildings.module';
import { DevicesModule } from './devices/devices.module';
import { RegulationModule } from './subsystems/regulation/regulation.module';
import { LifecycleModule } from './subsystems/lifecycle/lifecycle.module';
import { HvacModule } from './subsystems/hvac/hvac.module';
import { LightingModule } from './subsystems/lighting/lighting.module';
import { PowerModule } from './subsystems/power/power.module';
import { HotwaterModule } from './subsystems/hotwater/hotwater.module';
import { ElevatorModule } from './subsystems/elevator/elevator.module';
import { EnergyModule } from './energy/energy.module';
import { AlarmsModule } from './alarms/alarms.module';
import { SceneModule } from './scene/scene.module';
import { SchemaModule } from './scene/schema.module';
import { WebsocketModule } from './websocket/websocket.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { BillingModule } from './billing/billing.module';
import { HistoryModule } from './history/history.module';
import { AlarmRulesModule } from './alarm-rules/alarm-rules.module';
import { ReportsModule } from './reports/reports.module';
import { BigscreenModule } from './bigscreen/bigscreen.module';
import { DeviceTypesModule } from './device-types/device-types.module';
import { DeviceBrandsModule } from './device-brands/device-brands.module';
import { ControlGroupsModule } from './control-groups/control-groups.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { MenusModule } from './menus/menus.module';
import { LogsModule } from './logs/logs.module';
import { SiteModule } from './site/site.module';
import { GisModule } from './gis/gis.module';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ConnectorModule,
    AuthModule,
    BuildingsModule,
    DevicesModule,
    RegulationModule,
    LifecycleModule,
    HvacModule,
    LightingModule,
    PowerModule,
    HotwaterModule,
    ElevatorModule,
    EnergyModule,
    AlarmsModule,
    SceneModule,
    SchemaModule,
    WebsocketModule,
    UsersModule,
    RolesModule,
    BillingModule,
    HistoryModule,
    AlarmRulesModule,
    ReportsModule,
    BigscreenModule,
    DeviceTypesModule,
    DeviceBrandsModule,
    ControlGroupsModule,
    WorkOrdersModule,
    MenusModule,
    LogsModule,
    SiteModule,
    GisModule,
  ],
  // GK-26：全局拦截器，统一识别审计来源（human / automation）并写入请求上下文
  // RolesGuard 由控制器层 @UseGuards(JwtAuthGuard, RolesGuard) 使用（需注入 Reflector，故在此注册）
  providers: [
    { provide: APP_INTERCEPTOR, useClass: SourceInterceptor },
    RolesGuard,
    PermissionsGuard,
  ],
})
export class AppModule {}

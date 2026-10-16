import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SubsystemService } from '../shared/subsystem.service';
import { ControlCommandDto } from '../../common/dto/control-command.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../../common/decorators/current-user.decorator';
import { LogsService } from '../../logs/logs.service';
import { ok } from '../../common/response.util';

@Controller('lighting')
@UseGuards(JwtAuthGuard)
export class LightingController {
  constructor(
    private readonly svc: SubsystemService,
    private readonly logs: LogsService,
  ) {}

  @Get('status')
  async status(@Query('building_id') buildingId?: string) {
    return ok(await this.svc.status(buildingId, 'lighting'));
  }

  @Post('control')
  async control(
    @Req() req: any,
    @Query('building_id') qBuildingId: string,
    @Body() dto: ControlCommandDto,
    @CurrentUser() user: AuthedUser,
  ) {
    const buildingId = dto.building_id || qBuildingId;
    const detail = `动作=${dto.action}; 设备=${dto.device_id || '楼栋级'}; 载荷=${JSON.stringify(dto.payload || {})}`;
    try {
      const result = await this.svc.control(buildingId, 'lighting', dto);
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'lighting',
        action: 'control',
        target: `楼栋 ${buildingId || '全部'} 照明控制`,
        detail,
        reason: dto.reason,
        ip: req.ip,
      });
      return ok(result);
    } catch (e: any) {
      await this.logs.record({
        user_id: user.userId,
        username: user.username,
        module: 'lighting',
        action: 'control',
        target: `楼栋 ${buildingId || '全部'} 照明控制`,
        detail: `${detail}; 错误=${String((e && e.message) || e)}`,
        reason: dto.reason,
        result: 'fail',
        ip: req.ip,
      });
      throw e;
    }
  }
}

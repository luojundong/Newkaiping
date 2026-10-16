import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EnergyService } from './energy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ok } from '../common/response.util';

@Controller('energy')
@UseGuards(JwtAuthGuard)
export class EnergyController {
  constructor(private readonly svc: EnergyService) {}

  @Get('summary')
  async summary(@Query('building_id') buildingId: string, @Query('period') period: string) {
    return ok(await this.svc.summary(buildingId, period));
  }

  @Get('trend')
  async trend(
    @Query('building_id') buildingId: string,
    @Query('subsystem') subsystem: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return ok(await this.svc.trend(buildingId, subsystem, from, to));
  }
}

import { Module } from '@nestjs/common';
import { GisController } from './gis.controller';
import { GisConfigService } from './gis-config.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  controllers: [GisController],
  providers: [GisConfigService],
  imports: [LogsModule],
  exports: [GisConfigService],
})
export class GisModule {}

import { Module } from '@nestjs/common';
import { BigscreenController } from './bigscreen.controller';
import { BigscreenService } from './bigscreen.service';
import { BigscreenConfigService } from './bigscreen-config.service';
import { BigscreenLayoutService } from './bigscreen-layout.service';

@Module({
  controllers: [BigscreenController],
  providers: [BigscreenService, BigscreenConfigService, BigscreenLayoutService],
})
export class BigscreenModule {}

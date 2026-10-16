import { Module } from '@nestjs/common';
import { LightingController } from './lighting.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [LightingController],
})
export class LightingModule {}

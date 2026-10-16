import { Module } from '@nestjs/common';
import { PowerController } from './power.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [PowerController],
})
export class PowerModule {}

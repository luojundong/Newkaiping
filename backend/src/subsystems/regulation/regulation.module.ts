import { Module } from '@nestjs/common';
import { RegulationController } from './regulation.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [RegulationController],
})
export class RegulationModule {}

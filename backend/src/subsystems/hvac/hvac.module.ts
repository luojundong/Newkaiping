import { Module } from '@nestjs/common';
import { HvacController } from './hvac.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [HvacController],
})
export class HvacModule {}

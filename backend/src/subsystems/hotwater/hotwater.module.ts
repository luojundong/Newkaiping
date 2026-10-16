import { Module } from '@nestjs/common';
import { HotwaterController } from './hotwater.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [HotwaterController],
})
export class HotwaterModule {}

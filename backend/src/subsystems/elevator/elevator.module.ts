import { Module } from '@nestjs/common';
import { ElevatorController } from './elevator.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [ElevatorController],
})
export class ElevatorModule {}

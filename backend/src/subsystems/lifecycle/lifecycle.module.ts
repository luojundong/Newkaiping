import { Module } from '@nestjs/common';
import { LifecycleController } from './lifecycle.controller';
import { SubsystemSharedModule } from '../shared/subsystem.module';

@Module({
  imports: [SubsystemSharedModule],
  controllers: [LifecycleController],
})
export class LifecycleModule {}

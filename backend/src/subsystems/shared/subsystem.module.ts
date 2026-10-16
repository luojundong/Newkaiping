import { Module } from '@nestjs/common';
import { SubsystemService } from './subsystem.service';

@Module({
  providers: [SubsystemService],
  exports: [SubsystemService],
})
export class SubsystemSharedModule {}

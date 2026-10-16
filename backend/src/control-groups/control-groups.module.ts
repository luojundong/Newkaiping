import { Module } from '@nestjs/common';
import { ControlGroupsController } from './control-groups.controller';
import { ControlGroupsService } from './control-groups.service';

@Module({
  controllers: [ControlGroupsController],
  providers: [ControlGroupsService],
})
export class ControlGroupsModule {}

import { Module } from '@nestjs/common';
import { DeviceTypesController } from './device-types.controller';
import { DeviceTypesService } from './device-types.service';

@Module({
  controllers: [DeviceTypesController],
  providers: [DeviceTypesService],
})
export class DeviceTypesModule {}

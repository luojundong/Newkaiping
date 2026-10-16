import { Module } from '@nestjs/common';
import { DeviceBrandsController } from './device-brands.controller';
import { DeviceBrandsService } from './device-brands.service';

@Module({
  controllers: [DeviceBrandsController],
  providers: [DeviceBrandsService],
})
export class DeviceBrandsModule {}

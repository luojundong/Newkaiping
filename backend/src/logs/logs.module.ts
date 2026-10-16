import { Global, Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

// 全局模块：LogsService 可注入任意 controller，用于在各写操作处记录审计日志。
@Global()
@Module({
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}

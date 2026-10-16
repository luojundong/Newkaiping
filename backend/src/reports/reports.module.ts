import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { HistoryService } from '../history/history.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, HistoryService],
})
export class ReportsModule {}

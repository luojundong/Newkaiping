import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { Alarm } from '../common/types';
import { AlarmRuleDto } from './dto/alarm-rule.dto';

@Injectable()
export class AlarmsService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(filter: Record<string, any>): Promise<Alarm[]> {
    return this.connector.read<Alarm>('alarms', filter);
  }

  private async setState(id: string, patch: Record<string, any>): Promise<Alarm> {
    try {
      return await this.connector.update('alarms', { id }, patch);
    } catch (e) {
      throw new BizError(40400, `告警不存在: ${id}`, 404);
    }
  }

  async ack(id: string, userId: string): Promise<Alarm> {
    return this.setState(id, { status: 'acknowledged', acked_by: userId, acked_at: new Date().toISOString() });
  }

  async clear(id: string, userId: string): Promise<Alarm> {
    return this.setState(id, { status: 'cleared', cleared_at: new Date().toISOString(), acked_by: userId });
  }

  async getRules(): Promise<any[]> {
    return this.connector.read('alarm_rules');
  }

  async upsertRule(dto: AlarmRuleDto): Promise<any> {
    const record = {
      id: `rule-${Date.now()}`,
      subsystem: dto.subsystem,
      metric_key: dto.metric_key,
      operator: dto.operator,
      threshold: dto.threshold,
      level: dto.level,
      enabled: true,
      description: dto.description,
    };
    return this.connector.create('alarm_rules', record);
  }
}

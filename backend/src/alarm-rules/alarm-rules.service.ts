import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { AlarmRuleConfig } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class AlarmRulesService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async list(subsystem?: string, enabled?: boolean): Promise<AlarmRuleConfig[]> {
    let rules = await this.connector.read<AlarmRuleConfig>('alarm_rule_configs');
    if (subsystem) rules = rules.filter((r) => r.subsystem === subsystem);
    if (enabled !== undefined) rules = rules.filter((r) => r.alarm_enabled === enabled);
    return rules;
  }

  async create(body: Record<string, any>): Promise<AlarmRuleConfig> {
    if (!body.event_code || !body.subsystem) throw new BizError(40001, 'event_code 与 subsystem 必填', 400);
    if (!body.event_name) throw new BizError(40002, 'event_name 必填', 400);
    const record: AlarmRuleConfig = {
      id: genId('arc'),
      event_code: body.event_code,
      event_name: body.event_name,
      description: body.description,
      subsystem: body.subsystem,
      device_category: body.device_category,
      notify_enabled: body.notify_enabled !== undefined ? Boolean(body.notify_enabled) : true,
      alarm_enabled: body.alarm_enabled !== undefined ? Boolean(body.alarm_enabled) : true,
      level: body.level || 'warning',
      threshold: Number(body.threshold) || 0,
      recovery_threshold: Number(body.recovery_threshold) || 0,
      unit: body.unit,
      comparator: body.comparator || '>',
    };
    return this.connector.create('alarm_rule_configs', record);
  }

  async update(id: string, body: Record<string, any>): Promise<AlarmRuleConfig> {
    const exist = await this.connector.findOne<AlarmRuleConfig>('alarm_rule_configs', { id });
    if (!exist) throw new BizError(40400, `告警规则不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    const fields = [
      'event_code',
      'event_name',
      'description',
      'subsystem',
      'device_category',
      'level',
      'unit',
      'comparator',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) patch[f] = body[f];
    }
    if (body.threshold !== undefined) patch.threshold = Number(body.threshold);
    if (body.recovery_threshold !== undefined) patch.recovery_threshold = Number(body.recovery_threshold);
    if (body.notify_enabled !== undefined) patch.notify_enabled = Boolean(body.notify_enabled);
    if (body.alarm_enabled !== undefined) patch.alarm_enabled = Boolean(body.alarm_enabled);
    return this.connector.update('alarm_rule_configs', { id }, patch);
  }

  async remove(id: string): Promise<void> {
    const exist = await this.connector.findOne<AlarmRuleConfig>('alarm_rule_configs', { id });
    if (!exist) throw new BizError(40400, `告警规则不存在: ${id}`, 404);
    await this.connector.remove('alarm_rule_configs', { id });
  }
}

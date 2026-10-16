import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

// 控制指令 DTO（空调/照明/设备通用）。具体 payload 字段随子系统扩展。
export class ControlCommandDto {
  @IsEnum(['power_on', 'power_off', 'set_temperature', 'set_mode', 'set_strategy', 'dimming', 'reboot', 'remote'])
  action: 'power_on' | 'power_off' | 'set_temperature' | 'set_mode' | 'set_strategy' | 'dimming' | 'reboot' | 'remote';

  @IsObject()
  payload: Record<string, any>;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  building_id?: string;

  @IsOptional()
  @IsString()
  subsystem?: string;

  @IsOptional()
  @IsString()
  reason?: string; // 变更理由(Why)：设备控制为关键动作，建议必填
}

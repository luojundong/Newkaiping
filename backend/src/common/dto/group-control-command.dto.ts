import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

// 群组控制指令 DTO。动作集合与单设备控制不同（含 reboot/remote），独立定义以匹配前端分组控制。
export class GroupControlCommandDto {
  @IsEnum(['power_on', 'power_off', 'reboot', 'remote', 'dimming'])
  action: 'power_on' | 'power_off' | 'reboot' | 'remote' | 'dimming';

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

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
  reason?: string; // 变更理由(Why)：群组控制为关键动作，建议必填
}

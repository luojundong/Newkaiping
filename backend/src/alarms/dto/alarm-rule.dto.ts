import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AlarmRuleDto {
  @IsString()
  subsystem: string;

  @IsString()
  metric_key: string;

  @IsEnum(['>', '>=', '<', '<=', '=='])
  operator: '>' | '>=' | '<' | '<=' | '==';

  @IsNumber()
  @Min(0)
  threshold: number;

  @IsEnum(['info', 'warning', 'critical'])
  level: 'info' | 'warning' | 'critical';

  @IsOptional()
  @IsString()
  description?: string;
}

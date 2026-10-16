import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { SUBSYSTEMS } from '../../common/constants/catalog';

const SUBSYSTEM_CODES = SUBSYSTEMS.map((s) => s.code);

// PUT /buildings/:id/subsystems 的单项（请求体为裸数组，逐个校验）
export class BuildingSubsystemItemDto {
  @IsIn(SUBSYSTEM_CODES)
  subsystem_code: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsObject()
  config_json?: Record<string, any> | null;
}

/**
 * Scene Schema v1.0 DTO（GK-03 / GK-01 共用）
 *
 * 字段名严格对齐 `D:\NewPrSz\spec\scene-schema.v1.schema.json`（P0 冻结）。
 * 任何字段名修改须走 ADR + 主理人批准。
 *
 * 与 DTO 形状（DTO shape）解耦：上层 patch 接受所有顶层段 optional，
 * 内部物化 / 持久化继续按段处理。
 */

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ---------- meta ----------

export class MetaDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  projectId: string;

  @IsString()
  name: string;

  @IsString()
  @IsEnum(['hospital', 'factory', 'park', 'campus', 'energy'])
  industry: 'hospital' | 'factory' | 'park' | 'campus' | 'energy';

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  createdAt?: string;

  @IsOptional()
  @IsString()
  updatedAt?: string;

  @IsOptional()
  @IsString()
  contentHash?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ---------- dataSources ----------

export class DataSourcesConnDto {
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsInt() port?: number;
  @IsOptional() @IsString() comPort?: string;
  @IsOptional() @IsInt() baudRate?: number;
  @IsOptional() @IsInt() dataBits?: number;
  @IsOptional() @IsString() parity?: string;
  @IsOptional() @IsNumber() stopBits?: number;
  @IsOptional() @IsInt() seed?: number;
  @IsOptional() @IsString() scenarioId?: string;
  @IsOptional() @IsNumber() speed?: number;
}

export class DataSourcesPollDto {
  @IsOptional() @IsInt() intervalMs?: number;
  @IsOptional() @IsInt() timeoutMs?: number;
  @IsOptional() @IsInt() staleAfterMs?: number;
}

export class DataSourceDto {
  @IsString() @MinLength(1) id: string;
  @IsString()
  @IsEnum(['modbusTcp', 'modbusRtu', 'mock', 'mqtt'])
  kind: 'modbusTcp' | 'modbusRtu' | 'mock' | 'mqtt';

  @IsBoolean() enabled: boolean;

  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsObject() conn?: DataSourcesConnDto;
  @IsOptional() @IsObject() poll?: DataSourcesPollDto;
  @IsOptional() @IsInt() healthCheckMs?: number;
}

// ---------- pointTable ----------

export class PointTableEntryDto {
  @IsString() @Matches(/^[A-Z0-9_.]+$/) pointId: string;
  @IsString() @MinLength(1) sourceId: string;
  @IsString() @MinLength(1) deviceId: string;
  @IsString() @MinLength(1) name: string;

  @IsOptional() @IsString() displayName?: string;
  @IsString() unit: string;
  @IsInt() @Min(1) unitId: number;

  @IsString()
  @IsEnum(['coil', 'discreteInput', 'inputRegister', 'holdingRegister'])
  registerType: 'coil' | 'discreteInput' | 'inputRegister' | 'holdingRegister';

  @IsInt() @Min(0) address: number;

  @IsString()
  @IsEnum(['bool', 'int16', 'uint16', 'int32', 'uint32', 'float32', 'float64', 'ascii'])
  dataType: 'bool' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'float32' | 'float64' | 'ascii';

  @IsInt() @Min(1) length: number;

  @IsString() @IsEnum(['ABCD', 'BADC', 'CDAB', 'DCBA']) byteOrder: string;

  @IsOptional() @IsNumber() scale?: number;
  @IsOptional() @IsNumber() offset?: number;
  @IsString() @IsEnum(['read', 'readWrite']) access: 'read' | 'readWrite';

  @IsOptional() @IsObject() enumMap?: Record<string, string>;
  @IsOptional() @IsInt() pollMs?: number;
  @IsOptional() @IsNumber() deadband?: number;
  @IsOptional() @IsString() @IsEnum(['stale', 'holdLast', 'zero']) qualityPolicy?: string;

  @IsOptional() @IsObject() range?: Record<string, number>;
  @IsOptional() @IsObject() mock?: Record<string, any>;
  @IsOptional() @IsArray() tags?: string[];
}

// ---------- assets ----------

export class AssetLodDto {
  @IsString() key: string;
  @IsNumber() minDistance: number;
  @IsInt() tris: number;
}

export class AssetBoundsDto {
  @IsOptional() @IsArray() center?: number[];
  @IsOptional() @IsArray() size?: number[];
}

export class AssetDto {
  @IsString() @MinLength(1) key: string;
  @IsString() displayName: string;
  @IsString() @MinLength(1) category: string;

  @IsObject()
  source: {
    jobId: string;
    pipelineVersion: string;
    srcFile: string;
  };

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetLodDto)
  lods: AssetLodDto[];

  @IsOptional() @IsObject() bounds?: AssetBoundsDto;
  @IsOptional() @IsString() pivot?: string;
  @IsOptional() @IsBoolean() handednessConverted?: boolean;
  @IsOptional() @IsString() @IsEnum(['device', 'structure', 'decor', 'none']) semantic?: string;
  @IsOptional() @IsString() hash?: string;
}

// ---------- sceneGraph ----------

export class SceneGraphTransformDto {
  @IsArray() position: number[];
  @IsOptional() @IsArray() rotationEuler?: number[];
  @IsOptional() @IsArray() scale?: number[];
}

export class SceneGraphSemanticDto {
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() deviceType?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() meta?: Record<string, any>;
}

export class SceneGraphRenderDto {
  @IsOptional() @IsString() layer?: string;
  @IsOptional() @IsBoolean() castShadow?: boolean;
  @IsOptional() @IsBoolean() receiveShadow?: boolean;
}

export class SceneGraphNodeDto {
  @IsString() @MinLength(1) id: string;
  @IsString() type: string;
  @IsObject() @ValidateNested() @Type(() => SceneGraphTransformDto) transform: SceneGraphTransformDto;

  @IsOptional() @IsString() name?: string;
  @IsOptional() parent?: string | null;
  @IsOptional() @IsString() assetKey?: string | null;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsBoolean() pickable?: boolean;
  @IsOptional() @IsObject() semantic?: SceneGraphSemanticDto;
  @IsOptional() @IsObject() render?: SceneGraphRenderDto;
  @IsOptional() @IsNumber() lodBias?: number;
  @IsOptional() @IsArray() children?: string[];
}

// ---------- bindings ----------

export class BindingDto {
  @IsString() @MinLength(1) id: string;
  @IsString() @MinLength(1) nodeId: string;
  @IsString() @MinLength(1) pointId: string;
  @IsString() target: string;
  @IsString() @IsEnum(['palette', 'map', 'linear', 'direct', 'threshold']) mode: string;

  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() palette?: string;
  @IsOptional() @IsArray() range?: number[];
  @IsOptional() @IsObject() map?: Record<string, string>;
  @IsOptional() @IsObject() params?: Record<string, any>;
  @IsOptional() @IsNumber() deadband?: number;
  @IsOptional() @IsInt() priority?: number;
}

// ---------- rules ----------

export class ConditionDto {
  @IsString()
  @IsEnum(['and', 'or', 'not', '>', '<', '>=', '<=', '==', '!='])
  op: string;

  @IsOptional() @IsArray() args?: ConditionDto[];
  @IsOptional() @IsString() pointId?: string;
  @IsOptional() value?: number | string | null;
  @IsOptional() @IsInt() durationMs?: number;
}

export class RuleActionDto {
  @IsString()
  @IsEnum(['model.highlight', 'camera.focus', 'hud.alert.push', 'hud.alert.resolve', 'ai.request'])
  type: string;

  @IsOptional() @IsString() nodeId?: string;
  @IsOptional() @IsString() presetId?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() blinkHz?: number;
  @IsOptional() @IsInt() durationMs?: number;
  @IsOptional() @IsBoolean() clear?: boolean;
  @IsOptional() @IsString() panel?: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsBoolean() interruptible?: boolean;
  @IsOptional() @IsString() task?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsArray() payloadPoints?: string[];
}

export class RuleRecoveryDto {
  @IsObject() @ValidateNested() @Type(() => ConditionDto) condition: ConditionDto;
  @IsArray() actions: RuleActionDto[];
}

export class RuleDto {
  @IsString() @MinLength(1) id: string;
  @IsString() name: string;
  @IsBoolean() enabled: boolean;
  @IsString() @IsEnum(['info', 'warning', 'critical']) level: 'info' | 'warning' | 'critical';
  @IsObject() @ValidateNested() @Type(() => ConditionDto) condition: ConditionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions: RuleActionDto[];

  @IsObject() @ValidateNested() @Type(() => RuleRecoveryDto) recovery: RuleRecoveryDto;

  @IsOptional() @IsInt() debounceMs?: number;
}

// ---------- hudLayout ----------

export class DataSourceRefDto {
  @IsOptional() @IsString() @IsEnum(['expr', 'timeseries', 'devices', 'alerts', 'ai']) kind?: string;
  @IsOptional() @IsString() expr?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsInt() precision?: number;
  @IsOptional() @IsArray() pointIds?: string[];
  @IsOptional() @IsInt() windowSec?: number;
  @IsOptional() @IsString() downsample?: string;
  @IsOptional() @IsInt() maxPoints?: number;
  @IsOptional() @IsObject() filter?: Record<string, any>;
  @IsOptional() @IsArray() columns?: string[];
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() task?: string;
  @IsOptional() @IsInt() max?: number;
}

export class HudWidgetDto {
  @IsString() @MinLength(1) id: string;
  @IsString()
  type:
    | 'stat_card'
    | 'gauge'
    | 'line_chart'
    | 'device_board'
    | 'alert_list'
    | 'ai_panel'
    | 'title_bar'
    | 'bar_chart'
    | 'status_grid'
    | 'kpi_ring'
    | 'status_light'
    | 'carousel';

  @IsOptional() @IsString() title?: string;
  @IsArray() rect: number[]; // [x, y, w, h]
  @IsOptional() @IsInt() z?: number;
  @IsOptional() @IsBoolean() locked?: boolean;
  // GK-27：面板开关（管理后台可关闭/开启单个样式面板；缺省视为 true）
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() dataSource?: DataSourceRefDto;
  @IsOptional() @IsInt() refreshMs?: number;
  @IsOptional() @IsObject() style?: Record<string, any>;
  @IsOptional() @IsObject() fallback?: Record<string, any>;
}

export class HudCanvasDisplayDto {
  @IsInt() index: number;
  @IsString() @IsEnum(['main', 'extend', 'clone']) mode: 'main' | 'extend' | 'clone';
}

export class HudCanvasDto {
  @IsInt() width: number;
  @IsInt() height: number;
  @IsString() @IsEnum(['tech_blue', 'dark_cyan', 'light']) theme: 'tech_blue' | 'dark_cyan' | 'light';

  @IsOptional() @IsArray() safeArea?: number[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => HudCanvasDisplayDto) displays?: HudCanvasDisplayDto[];
}

export class HudLayoutDto {
  @IsObject() @ValidateNested() @Type(() => HudCanvasDto) canvas: HudCanvasDto;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HudWidgetDto)
  widgets: HudWidgetDto[];
}

// ---------- cameraPresets ----------

export class CameraPresetPoseDto {
  @IsArray() position: number[];
  @IsArray() lookAt: number[];
  @IsNumber() fov: number;
}

export class CameraPresetTargetDto {
  @IsOptional() @IsString() nodeId?: string;
  @IsOptional() @IsArray() offset?: number[];
}

export class CameraPresetDto {
  @IsString() @MinLength(1) id: string;
  @IsString() name: string;
  @IsString() @IsEnum(['orbit', 'free', 'fixed', 'path']) mode: string;
  @IsObject() @ValidateNested() @Type(() => CameraPresetPoseDto) pose: CameraPresetPoseDto;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => CameraPresetTargetDto) target?: CameraPresetTargetDto;
  @IsOptional() @IsInt() transitionMs?: number;
  @IsOptional() @IsString() easing?: string;
  @IsOptional() @IsObject() bindings?: Record<string, any>;
  @IsOptional() @IsString() hotkey?: string;
}

// ---------- scenarios ----------

export class ScenarioTrackDto {
  @IsInt() @Min(0) atSec: number;
  @IsString() @IsEnum(['camera.apply', 'ai.request', 'mock.inject'])
  action: 'camera.apply' | 'ai.request' | 'mock.inject';

  @IsOptional() @IsString() presetId?: string;
  @IsOptional() @IsString() task?: string;
  @IsOptional() @IsString() pointId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsNumber() to?: number;
  @IsOptional() @IsNumber() overSec?: number;
}

export class ScenarioDto {
  @IsString() @MinLength(1) id: string;
  @IsString() name: string;

  @IsOptional() @IsInt() seed?: number;
  @IsOptional() @IsBoolean() loop?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioTrackDto)
  tracks: ScenarioTrackDto[];
}

// ---------- controls (本期留空) ----------

export class ControlDto {
  @IsString() nodeId?: string;
  @IsString() command?: string;
  @IsOptional() @IsObject() payload?: Record<string, any>;
}

// ---------- 顶层：完整文档 / Patch ----------

export class SceneSchemaDocument {
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/)
  schemaVersion: string;

  @IsObject() @ValidateNested() @Type(() => MetaDto) meta: MetaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DataSourceDto)
  dataSources: DataSourceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PointTableEntryDto)
  pointTable: PointTableEntryDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetDto)
  assets: AssetDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneGraphNodeDto)
  sceneGraph: SceneGraphNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BindingDto)
  bindings: BindingDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules: RuleDto[];

  @IsObject() @ValidateNested() @Type(() => HudLayoutDto) hudLayout: HudLayoutDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CameraPresetDto)
  cameraPresets: CameraPresetDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScenarioDto)
  scenarios: ScenarioDto[];

  @IsOptional() @IsArray() controls?: ControlDto[];
}

/**
 * 部分 PUT（PATCH 风格）：所有顶层段 optional。
 * 仅提交存在的段；缺失段保留当前物化结果。
 */
export class SceneSchemaPatchDto {
  @IsOptional() @Matches(/^\d+\.\d+\.\d+$/) schemaVersion?: string;
  @IsOptional() @IsObject() meta?: MetaDto;
  @IsOptional() @IsArray() dataSources?: DataSourceDto[];
  @IsOptional() @IsArray() pointTable?: PointTableEntryDto[];
  @IsOptional() @IsArray() assets?: AssetDto[];
  @IsOptional() @IsArray() sceneGraph?: SceneGraphNodeDto[];
  @IsOptional() @IsArray() bindings?: BindingDto[];
  @IsOptional() @IsArray() rules?: RuleDto[];
  @IsOptional() @IsObject() hudLayout?: HudLayoutDto;
  @IsOptional() @IsArray() cameraPresets?: CameraPresetDto[];
  @IsOptional() @IsArray() scenarios?: ScenarioDto[];
  @IsOptional() @IsArray() controls?: ControlDto[];
}

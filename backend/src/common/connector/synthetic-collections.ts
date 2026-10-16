// 合成/派生集合名单（单一真源，GK-26）。
//
// 这些集合无法由真实数据源（HTTP/MQTT/Modbus）生成，即使 DATA_SOURCE_MODE=real，
// RealConnector 也仍走 Mock 回退。名单只在此处定义一次：
//   - real.connector.ts 用于判断「该集合是否跳过真实读取」
//   - 数据源探查 getDataSourceInfo() 用于把同一份名单暴露给前端
// 禁止在别处复制该常量，避免两处维护。

import { Collection } from './connector.interface';

export const SYNTHETIC_COLLECTIONS: ReadonlyArray<Collection> = [
  'device_metrics',
  'subsystem_status',
  'regulation_overview',
  'lifecycle_equipment',
  'lifecycle_maintenance',
  'energy_summary',
  'energy_trend',
  'scene_points',
  'scene_config',
  'menus',
  'features',
  'live_batch',
];

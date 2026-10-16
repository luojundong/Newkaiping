// ConnectorFactory：依据 DATA_SOURCE_MODE 选择数据源（mock | real）。
// 支持按设备/楼栋/子系统粒度覆盖（灰度切真实），MVP 仅全局开关。
// real 模式下注入 MockConnector 作为回退，保证真实源不可达时演示不中断（任务4 / AC-03）。

import { Connector } from './connector.interface';
import { MockConnector } from './mock/mock.connector';
import { RealConnector } from './real/real.connector';

export class ConnectorFactory {
  static create(mode: string | undefined): Connector {
    const m = (mode || 'mock').toLowerCase();
    if (m === 'real') {
      const fallback = new MockConnector();
      return new RealConnector(fallback);
    }
    return new MockConnector();
  }
}

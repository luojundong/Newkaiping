// 全局 Connector 模块：提供 CONNECTOR_TOKEN，启动时建立连接。
// 所有业务模块经 @Inject(CONNECTOR_TOKEN) 获取数据源，切换真实源无需改动业务代码。

import { ConfigModule, ConfigService } from '@nestjs/config';
import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from './connector.interface';
import { ConnectorFactory } from './connector.factory';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CONNECTOR_TOKEN,
      useFactory: (config: ConfigService) =>
        ConnectorFactory.create(config.get<string>('DATA_SOURCE_MODE', 'mock')),
      inject: [ConfigService],
    },
  ],
  exports: [CONNECTOR_TOKEN],
})
export class ConnectorModule implements OnModuleInit {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  async onModuleInit(): Promise<void> {
    await this.connector.connect();
  }
}

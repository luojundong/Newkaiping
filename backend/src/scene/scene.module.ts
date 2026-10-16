import { Module } from '@nestjs/common';
import { SceneController } from './scene.controller';
import { SceneService } from './scene.service';

@Module({
  controllers: [SceneController],
  providers: [SceneService],
  // GK-03：导出 SceneService，供 SchemaService（schema.module）注入做反向写回。
  exports: [SceneService],
})
export class SceneModule {}

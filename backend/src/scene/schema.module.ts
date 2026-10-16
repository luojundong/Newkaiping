import { Module } from '@nestjs/common';
import { SceneModule } from './scene.module';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';

/**
 * GK-03 · Scene Schema 编辑 + Version 守卫 模块。
 *
 * 依赖关系：SchemaService 需注入 SceneService 做反向写回，
 * 因此 imports SceneModule（要求 SceneModule 将 SceneService 导出）。
 */
@Module({
  imports: [SceneModule],
  controllers: [SchemaController],
  providers: [SchemaService],
})
export class SchemaModule {}

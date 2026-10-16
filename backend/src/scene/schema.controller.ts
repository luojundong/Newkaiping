/**
 * GK-03 · Scene Schema 物化端点（兼容 GK-01 GET） + PUT 编辑 + Version 守卫
 *
 * 路由：
 *   GET  /api/v1/scene/schema         → materialize()（GK-01 主交付）
 *   GET  /api/v1/scene/schema/version → getVersion()
 *   PUT  /api/v1/scene/schema         → applyPatch(body, If-Match, currentUser)
 *
 * 守卫：
 *   - If-Match header 必填（缺失 → 400 If-Match header required）
 *   - expectedVersion 与当前 version 不一致 → 412 Precondition Failed
 *
 * 风格与 SceneController 保持一致：JwtAuthGuard、ResponseUtil.ok()、LogsService 审计。
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SchemaService } from './schema.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';
import { SceneSchemaPatchDto } from './dto/scene-schema.dto';
import { emitSchemaUpdated } from '../websocket/schema-sync.hub';

@Controller('scene/schema')
@UseGuards(JwtAuthGuard)
export class SchemaController {
  constructor(
    private readonly schema: SchemaService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async materialize() {
    const t0 = Date.now();
    const [document, dataSource] = await Promise.all([
      this.schema.materialize(),
      this.schema.getDataSourceInfo(),
    ]);
    // dataSource 为 GK-26 新增 additive 字段：暴露真实数据源状态（模式/适配器可用性/合成集合），
    // 不改动既有字段语义；GET /scene/schema 响应不受 schema 约束（无 scene-schema.v1.schema.json 管辖）。
    return ok({ ...document, dataSource, _meta: { materializeMs: Date.now() - t0 } });
  }

  @Get('version')
  async getVersion() {
    const v = await this.schema.getVersion();
    return ok(v);
  }

  @Put()
  @HttpCode(200)
  async putSchema(
    @Body() patch: SceneSchemaPatchDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() user: AuthedUser,
    @Req() req: any,
  ) {
    if (!ifMatch || !String(ifMatch).trim()) {
      throw new BadRequestException({
        code: 400,
        message: 'If-Match header required',
        error: 'Bad Request',
      });
    }
    const expectedVersion = parseIfMatch(ifMatch);
    if (!Number.isFinite(expectedVersion) || expectedVersion < 0) {
      throw new BadRequestException({
        code: 400,
        message: `Invalid If-Match header: ${ifMatch}`,
        error: 'Bad Request',
      });
    }

    const beforeVersion = await this.schema.getVersion();
    const data = await this.schema.applyPatch(patch, expectedVersion, user?.userId || 'system');

    await this.logs.record({
      user_id: user?.userId,
      username: user?.username || 'system',
      module: 'scene',
      action: 'update',
      target: 'scene-schema',
      detail: `PATCH /scene/schema: v${beforeVersion.version} → v${data.version}; segments=${Object.keys(patch || {}).join(',')}`,
      before: { version: beforeVersion.version },
      after: { version: data.version },
      result: 'success',
      ip: req?.ip,
    });

    // GK-11：版本落盘 + 反向写回 + 审计全部成功后，广播 schema.updated
    // （socket.io 命名空间 + 裸 WS 半通道两路投递；失败不影响本响应）。
    emitSchemaUpdated({ version: data.version, updatedAt: data.updatedAt });

    return ok(data, 'Schema updated');
  }
}

// 解析 If-Match 头：支持 `123` 或 `"123"` 或 `W/"123"`（HTTP RFC 弱校验）
function parseIfMatch(header: string): number {
  const v = String(header).trim().replace(/^W\//, '').replace(/^"+|"+$/g, '');
  const n = Number(v);
  return n;
}

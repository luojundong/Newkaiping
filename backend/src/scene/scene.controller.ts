import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SceneService } from './scene.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';
import { LogsService } from '../logs/logs.service';
import { ok } from '../common/response.util';
import * as fs from 'fs';
import * as path from 'path';

@Controller('scene')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SceneController {
  constructor(
    private readonly svc: SceneService,
    private readonly logs: LogsService,
  ) {}

  @Get('config')
  async config() {
    return ok(await this.svc.config());
  }

  // ---- 子系统菜单 DIY（自定义名称 + 开关） ----

  @Get('subsystem-meta')
  async getSubsystemMeta() {
    return ok(await this.svc.getSubsystemMeta());
  }

  @Put('subsystem-meta')
  @Roles('admin')
  async setSubsystemMeta(@Body() body: any, @CurrentUser() user: AuthedUser) {
    const before = await this.svc.getSubsystemMeta();
    const data = await this.svc.setSubsystemMeta(body);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'update',
      target: '子系统菜单',
      detail: `更新子系统菜单元信息：${JSON.stringify(body)}`,
      before,
      after: data,
      reason: body?.reason,
      result: 'success',
    });
    return ok(data);
  }

  @Get('points')
  async points(@Query('building_id') buildingId: string, @Query('subsystem') subsystem: string) {
    return ok({ points: await this.svc.points(buildingId, subsystem) });
  }

  // ---- 3D 标记 CRUD ----

  @Get('markers')
  async listMarkers(@Query('building_id') buildingId: string) {
    return ok(await this.svc.listMarkers(buildingId));
  }

  @Post('markers')
  @Roles('admin')
  async createMarker(@Body() body: any, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.createMarker(body);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'create',
      target: `标记: ${body.label}`,
      detail: `新增 3D 标记 ${body.label}（楼栋 ${body.building_id}，${body.floor} 层）`,
      result: 'success',
    });
    return ok(data, '标记已创建');
  }

  @Put('markers/:id')
  @Roles('admin')
  async updateMarker(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.updateMarker(id, body);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'update',
      target: `标记: ${body.label || id}`,
      detail: `更新 3D 标记 ${body.label || id}`,
      result: 'success',
    });
    return ok(data, '标记已更新');
  }

  @Delete('markers/:id')
  @Roles('admin')
  async deleteMarker(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    await this.svc.deleteMarker(id);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'delete',
      target: `标记: ${id}`,
      detail: `删除 3D 标记 ${id}`,
      result: 'success',
    });
    return ok(null, '标记已删除');
  }

  // ---- 标注显隐开关 ----

  @Get('marker-switch')
  async getMarkerSwitch() {
    return ok(await this.svc.getMarkerSwitch());
  }

  @Put('marker-switch')
  @Roles('admin')
  async setMarkerSwitch(@Body() body: any, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.setMarkerSwitch(body);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'switch',
      target: '标注显隐开关',
      detail: `更新标注开关：${JSON.stringify(body)}`,
      result: 'success',
    });
    return ok(data, '标注开关已更新');
  }

  // ---- 楼栋显示 DIY（框框区域 + 背景透明度）----

  @Get('building-display')
  async getBuildingDisplay() {
    return ok(await this.svc.getBuildingDisplay());
  }

  @Put('building-display')
  @Roles('admin')
  async setBuildingDisplay(@Body() body: any, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.setBuildingDisplay(body);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'config',
      target: '楼栋显示DIY',
      detail: `更新楼栋显示：${JSON.stringify(body)}`,
      result: 'success',
    });
    return ok(data, '楼栋显示已更新');
  }

  // ---- 楼栋锚点批量写入（立柱 DIY）----

  @Put('anchors')
  @Roles('admin')
  async setAnchors(@Body() body: any, @CurrentUser() user: AuthedUser) {
    const anchors = Array.isArray(body) ? body : body.anchors;
    const data = await this.svc.setAnchors(anchors);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'anchors',
      target: '楼栋锚点',
      detail: `批量更新楼栋锚点（${Array.isArray(anchors) ? anchors.length : 0} 条）`,
      result: 'success',
    });
    return ok(data, '楼栋锚点已更新');
  }

  // 子系统显示名（自定义修改，需求：楼栋子系统配置）
  // ---- 模型加载提示文案（自定义）----
  @Get('model-loading-hint')
  async getModelLoadingHint() {
    return ok({ hint: await this.svc.getModelLoadingHint() });
  }

  @Put('model-loading-hint')
  @Roles('admin')
  async setModelLoadingHint(@Body() body: { hint?: string; reason?: string }, @CurrentUser() user: AuthedUser, @Req() req: any) {
    const before = await this.svc.getModelLoadingHint();
    const hint = (body && typeof body.hint === 'string') ? body.hint : '';
    const data = await this.svc.setModelLoadingHint(hint);
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'scene',
      action: 'config',
      target: '大屏模型加载提示',
      detail: `更新加载提示文案（${before} → ${data}）`,
      before: { hint: before },
      after: { hint: data },
      reason: body?.reason,
      result: 'success',
      ip: req?.ip,
    });
    return ok({ hint: data }, '模型加载提示已更新');
  }

  @Get('subsystem-labels')
  async subsystemLabels() {
    return ok(await this.svc.subsystemLabels());
  }

  @Put('subsystem-labels')
  @Roles('admin')
  async updateSubsystemLabels(@Body() body: Record<string, string>, @CurrentUser() user: AuthedUser) {
    const data = await this.svc.updateSubsystemLabels(body);
    await this.logs.record({
      username: user.username,
      module: 'scene',
      action: 'config',
      target: '子系统显示名',
      detail: `更新子系统显示名（${Object.keys(body || {}).length} 项）`,
      result: 'success',
    });
    return ok(data, '子系统显示名已更新');
  }

  // 上传 3D 场景模型（.glb）。multipart 解析由 main.ts 注册的 content-type parser 完成，
  // 解析结果挂在 req.body._upload.files，本接口取出首个文件保存到 public/uploads/models 并持久化 model_url。
  @Post('model')
  @Roles('admin')
  async uploadModel(@Req() req: any, @Res() res: any) {
    const upload = (req.body && req.body._upload) || {};
    const file = (upload.files && upload.files[0]) || null;
    if (!file || !file.buffer || !file.buffer.length) {
      return res.status(400).send({ code: 400, message: '未接收到上传文件' });
    }
    const originalName = file.filename || 'model';
    const lower = originalName.toLowerCase()
    const EXT_TYPE: Record<string, '3d' | 'video' | 'image' | 'panorama'> = {
      '.glb': '3d',
      '.gltf': '3d',
      '.mp4': 'video',
      '.webm': 'video',
      '.png': 'image',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.webp': 'image',
    }
    const ext = path.extname(lower)
    const inferred = EXT_TYPE[ext]
    if (!inferred) {
      return res.status(400).send({
        code: 400,
        message: '不支持的文件格式，仅支持 .glb/.gltf/.mp4/.webm/.png/.jpg/.jpeg/.webp',
      })
    }
    const TYPE_SET = ['3d', 'video', 'image', 'panorama']
    const typeParam = (req.query && req.query.type) || ''
    let modelType: '3d' | 'video' | 'image' | 'panorama' = TYPE_SET.includes(typeParam)
      ? (typeParam as any)
      : inferred
    if (modelType === 'panorama' && inferred !== 'image') {
      return res.status(400).send({ code: 400, message: '全景图需使用图片格式（.png/.jpg/.jpeg/.webp）' })
    }
    // 服务端生成唯一 ASCII 文件名（保留原始扩展名，避免同名覆盖/缓存）。
    // 旧逻辑用正则把非 ASCII 字符替换为下划线，中文文件名会变成 __.glb 并互相覆盖，
    // 且浏览器对该固定路径可能命中缓存。改为时间戳+随机后缀，彻底规避文件名丢失/覆盖/缓存。
    const safeName = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dir = path.join(process.cwd(), 'public', 'uploads', 'models');
    fs.mkdirSync(dir, { recursive: true });
    // 记录上一次上传的自定义模型（写入成功后再删除，避免 writeFile 异步竞态误删新文件）
    let prevPath: string | null = null;
    try {
      const prev = (await this.svc.config())?.model_url;
      if (prev && prev.startsWith('/uploads/models/')) {
        const p = path.join(dir, path.basename(prev));
        if (p.startsWith(dir) && fs.existsSync(p)) prevPath = p;
      }
    } catch {
      /* 读取旧路径失败不影响本次上传 */
    }
    const filePath = path.join(dir, safeName);
    fs.writeFile(filePath, file.buffer, (err) => {
      if (err) {
        return res.status(500).send({ code: 500, message: '文件写入失败' });
      }
      // 写入成功后再清理上一次上传的模型，避免 uploads/models 无限膨胀
      if (prevPath && prevPath !== filePath && fs.existsSync(prevPath)) {
        try { fs.unlinkSync(prevPath); } catch { /* 清理失败不影响本次 */ }
      }
      const modelUrl = `/uploads/models/${safeName}`;
      this.svc
        .setModelUrl(modelUrl, modelType)
        .then(async () => {
          const u: AuthedUser | undefined = req.user;
          await this.logs.record({
            username: u?.username || 'system',
            module: 'scene',
            action: 'upload',
            target: '场景模型',
            detail: `上传${modelTypeLabel(modelType)} ${originalName} → ${safeName}`,
            result: 'success',
          });
          res.send({ code: 0, data: { model_url: modelUrl, model_type: modelType }, message: '模型已上传' });
        })
        .catch((e: any) => res.status(500).send({ code: 500, message: String((e && e.message) || e) }));
    });
  }
}

function modelTypeLabel(t: string): string {
  return { '3d': '3D 模型', video: '视频', image: '图片', panorama: '360 全景图' }[t] || '场景模型'
}

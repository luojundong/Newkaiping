import { Body, Controller, Get, Put, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ok } from '../common/response.util';
import { GisConfigService, GisConfig, GisProvider } from './gis-config.service';
import { LogsService } from '../logs/logs.service';
import { CurrentUser, AuthedUser } from '../common/decorators/current-user.decorator';

// 地图底图配置接口：
//   GET  /api/v1/gis/config        —— 拉取完整配置（含 key，仅后台鉴权可见）
//   PUT  /api/v1/gis/config        —— 保存配置（含 key，鉴权 + 留痕）
//   GET  /api/v1/gis/tile-proxy    —— 瓦片代理（公开，key 仅服务端拼接，前端绝不接触）
// 合规要求：中国区域底图仅限天地图/腾讯/高德/百度；key 必须后端代理，前端不得暴露原始 key。
@Controller('gis')
export class GisController {
  constructor(
    private readonly svc: GisConfigService,
    private readonly logs: LogsService,
  ) {}

  @Get('config')
  @UseGuards(JwtAuthGuard)
  // B4 修复：地图 Key 属敏感配置，仅 admin 返回含 key 的完整配置；
  // 其余角色（viewer 等）仅返回不含 key 的公开配置（provider/baseLayer/showLabel/center），
  // 足以渲染底图，且杜绝 Key 泄露路径。
  async config(@CurrentUser() user: AuthedUser) {
    return ok(user.role === 'admin' ? this.svc.getConfig() : this.svc.getPublicConfig());
  }

  @Put('config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async saveConfig(@Body() body: Partial<GisConfig>, @CurrentUser() user: AuthedUser) {
    const before = this.svc.getConfig();
    const data = this.svc.saveConfig(body || {});
    await this.logs.record({
      user_id: user.userId,
      username: user.username,
      module: 'gis',
      action: 'config',
      target: '地图底图配置',
      detail: `更新底图配置：provider=${data.provider || '-'} baseLayer=${data.baseLayer} showLabel=${data.showLabel} 中心点=(${data.center.lng},${data.center.lat},z${data.center.zoom})`,
      before,
      after: data,
      reason: (body as any).reason,
      result: 'success',
    });
    return ok(data);
  }

  // 公开瓦片代理：前端大屏 / 后台预览经此拉取瓦片，key 仅服务端拼接。
  // 参数：provider(可选，默认配置项) / layer(天地图子层 vec|cva|img|cia|ter|cta) / z / x / y
  @Get('tile-proxy')
  async tileProxy(
    @Query('provider') provider: string,
    @Query('layer') layer: string,
    @Query('z') z: string,
    @Query('x') x: string,
    @Query('y') y: string,
    @Res() reply: any,
  ) {
    const zi = parseInt(z, 10);
    const xi = parseInt(x, 10);
    const yi = parseInt(y, 10);
    if (!Number.isInteger(zi) || !Number.isInteger(xi) || !Number.isInteger(yi) || zi < 0 || zi > 22) {
      reply.code(400).send({ code: 400, message: '瓦片参数非法（z 需为 0-22 整数，x/y 为非负整数）' });
      return;
    }
    const prov = (provider || '') as GisProvider;
    const url = this.svc.buildTileUrl({ provider: prov || undefined, layer: layer || 'vec', z: zi, x: xi, y: yi });
    if (!url) {
      reply
        .code(400)
        .send({ code: 400, message: '底图未配置或所选服务商暂不支持（请先在「地图底图配置」填写对应 Key）' });
      return;
    }
    try {
      // 各服务商瓦片服务器对 Referer 有校验，按 provider 设置合规 Referer
      const refererMap: Record<string, string> = {
        tianditu: 'https://tianditu.gov.cn',
        gaode: 'https://www.amap.com',
        tencent: 'https://map.qq.com',
        baidu: 'https://map.baidu.com',
      };
      const referer = refererMap[prov] || 'https://tianditu.gov.cn';
      const upstream = await fetch(url, { headers: { Referer: referer } });
      if (!upstream.ok || !upstream.body) {
        reply.code(upstream.status || 502).send({ code: upstream.status || 502, message: '上游瓦片服务异常' });
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct = upstream.headers.get('content-type') || 'image/png';
      reply
        .header('Content-Type', ct)
        .header('Cache-Control', 'public, max-age=86400')
        .header('Access-Control-Allow-Origin', '*')
        .send(buf);
    } catch (e: any) {
      reply.code(502).send({ code: 502, message: '瓦片代理失败：' + (e?.message || '未知错误') });
    }
  }
}

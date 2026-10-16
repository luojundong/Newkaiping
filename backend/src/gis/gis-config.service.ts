import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// 地图底图配置（Phase 2：合规底图 Key 由后端代理，前端不暴露）。
// 存储为单文档 data/gis-config.json：
//   { provider, tiandituKey, tencentKey, gaodeKey, baiduKey, baseLayer, showLabel, center }
// 中国区域合规底图仅允许：天地图 / 腾讯 / 高德 / 百度（均为 GCJ-02 国测局加密坐标系）。
// Key 一律保存在后端，前端经 GET /api/v1/gis/tile-proxy 拉取瓦片，绝不接触原始 key。

export type GisProvider = 'tianditu' | 'tencent' | 'gaode' | 'baidu';
export type GisBaseLayer = 'vec' | 'img' | 'ter';

export interface GisConfig {
  provider: GisProvider | '';
  tiandituKey: string;
  tencentKey: string;
  gaodeKey: string;
  baiduKey: string;
  // 底图类型：矢量 / 影像 / 地形
  baseLayer: GisBaseLayer;
  // 是否叠加注记层（路名 / 地名）
  showLabel: boolean;
  // 默认视角（GCJ-02），开平市中心医院大致坐标
  center: { lng: number; lat: number; zoom: number };
}

export const DEFAULT_GIS_CONFIG: GisConfig = {
  provider: '',
  tiandituKey: '',
  tencentKey: '',
  gaodeKey: '',
  baiduKey: '',
  baseLayer: 'vec',
  showLabel: true,
  center: { lng: 112.698, lat: 22.368, zoom: 16 },
};

// 天地图各底图子层（WMTS LAYER 名）。瓦片代理按 layer 参数返回单张瓦片，前端自行叠加。
export const TIANDITU_LAYERS: Record<string, string> = {
  vec: 'vec', // 矢量底图
  cva: 'cva', // 矢量注记
  img: 'img', // 影像底图
  cia: 'cia', // 影像注记
  ter: 'ter', // 地形底图
  cta: 'cta', // 地形注记
};

const CONFIG_PATH = path.resolve(process.cwd(), 'data', 'gis-config.json');

@Injectable()
export class GisConfigService {
  private readDoc(): GisConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          const c = parsed as Partial<GisConfig>;
          const center = c.center && typeof c.center === 'object' ? c.center : DEFAULT_GIS_CONFIG.center;
          return {
            provider: (c.provider as GisProvider) || DEFAULT_GIS_CONFIG.provider,
            tiandituKey: typeof c.tiandituKey === 'string' ? c.tiandituKey : '',
            tencentKey: typeof c.tencentKey === 'string' ? c.tencentKey : '',
            gaodeKey: typeof c.gaodeKey === 'string' ? c.gaodeKey : '',
            baiduKey: typeof c.baiduKey === 'string' ? c.baiduKey : '',
            baseLayer: (c.baseLayer as GisBaseLayer) || DEFAULT_GIS_CONFIG.baseLayer,
            showLabel: typeof c.showLabel === 'boolean' ? c.showLabel : DEFAULT_GIS_CONFIG.showLabel,
            center: {
              lng: Number(center.lng) || DEFAULT_GIS_CONFIG.center.lng,
              lat: Number(center.lat) || DEFAULT_GIS_CONFIG.center.lat,
              zoom: Number(center.zoom) || DEFAULT_GIS_CONFIG.center.zoom,
            },
          };
        }
      }
    } catch {
      // 文件损坏则回退默认
    }
    return JSON.parse(JSON.stringify(DEFAULT_GIS_CONFIG));
  }

  private writeDoc(doc: GisConfig): void {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(doc, null, 2), 'utf-8');
    } catch {
      // 落盘失败不影响内存读写
    }
  }

  getConfig(): GisConfig {
    return this.readDoc();
  }

  // 返回给前端的精简配置（不含 key，避免任何泄露路径）
  getPublicConfig(): { provider: GisProvider | ''; baseLayer: GisBaseLayer; showLabel: boolean; center: GisConfig['center'] } {
    const c = this.readDoc();
    return {
      provider: c.provider,
      baseLayer: c.baseLayer,
      showLabel: c.showLabel,
      center: c.center,
    };
  }

  // 是否已配置可用的底图（选定 provider 且对应 key 非空）
  hasValidProvider(): boolean {
    const c = this.readDoc();
    if (!c.provider) return false;
    const key = this.providerKey(c.provider);
    return !!key;
  }

  private providerKey(provider: GisProvider): string {
    const c = this.readDoc();
    switch (provider) {
      case 'tianditu':
        return c.tiandituKey;
      case 'tencent':
        return c.tencentKey;
      case 'gaode':
        return c.gaodeKey;
      case 'baidu':
        return c.baiduKey;
      default:
        return '';
    }
  }

  // 保存（前端传完整字段；空字符串表示使用默认值 / 清空 key）
  saveConfig(body: Partial<GisConfig>): GisConfig {
    const current = this.readDoc();
    const next: GisConfig = {
      provider: (body.provider as GisProvider) || current.provider,
      tiandituKey: typeof body.tiandituKey === 'string' ? body.tiandituKey.trim() : current.tiandituKey,
      tencentKey: typeof body.tencentKey === 'string' ? body.tencentKey.trim() : current.tencentKey,
      gaodeKey: typeof body.gaodeKey === 'string' ? body.gaodeKey.trim() : current.gaodeKey,
      baiduKey: typeof body.baiduKey === 'string' ? body.baiduKey.trim() : current.baiduKey,
      baseLayer: (body.baseLayer as GisBaseLayer) || current.baseLayer,
      showLabel: typeof body.showLabel === 'boolean' ? body.showLabel : current.showLabel,
      center: current.center,
    };
    if (body.center && typeof body.center === 'object') {
      next.center = {
        lng: Number(body.center.lng) || current.center.lng,
        lat: Number(body.center.lat) || current.center.lat,
        zoom: Number(body.center.zoom) || current.center.zoom,
      };
    }
    this.writeDoc(next);
    return this.readDoc();
  }

  // ===== 瓦片代理 URL 拼装（key 仅在此处拼接，绝不外传前端） =====
  // 返回 null 表示不支持 / 参数非法；返回的 URL 由 controller 经服务端 fetch 后透传二进制。
  buildTileUrl(opts: {
    provider?: GisProvider;
    layer: string;
    z: number;
    x: number;
    y: number;
  }): string | null {
    const c = this.readDoc();
    const provider = opts.provider || c.provider;
    if (!provider) return null;
    const key = this.providerKey(provider);
    if (!key) return null;
    const { z, x, y, layer } = opts;
    const sub = (x + y) % 8; // 天地图子域 t0-t7
    switch (provider) {
      case 'tianditu': {
        // WMTS：TILEMATRIX=z, TILEROW=y, TILECOL=x
        const L = TIANDITU_LAYERS[layer] || TIANDITU_LAYERS.vec;
        return `https://t${sub}.tianditu.gov.cn/${L}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${L}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=${encodeURIComponent(key)}`;
      }
      case 'gaode': {
        // 高德 XYZ：style=8 矢量路网 / style=6 影像；key 服务端注入，前端绝不接触
        const style = c.baseLayer === 'img' ? 6 : 8;
        const s = (x + y) % 4;
        return `https://webrd0${s + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x=${x}&y=${y}&z=${z}&key=${encodeURIComponent(key)}`;
      }
      case 'tencent': {
        // 腾讯瓦片（best-effort）：styleid=1 矢量 / styleid=2 影像
        const styleid = c.baseLayer === 'img' ? 2 : 1;
        const s = (x + y) % 4;
        return `https://rt${s}.map.gtimg.com/tile?z=${z}&x=${x}&y=${y}&styleid=${styleid}`;
      }
      case 'baidu':
        // 百度使用 BD-09 坐标系，需经经纬度→BD-09 偏移转换，暂未实现瓦片代理
        return null;
      default:
        return null;
    }
  }
}

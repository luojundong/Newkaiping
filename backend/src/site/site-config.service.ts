import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// 站点全局配置（站点标题/描述/关键字，用于浏览器 tab 标题、meta description/keywords、后台页头）。
// 存储为单文档 data/site-config.json：{ title, description, keywords, showChinese, showEnglish }。
// 前端 App.vue 监听 siteConfig 自动同步 document.title 与 meta 标签。
// showChinese/showEnglish：大屏面板标题与页眉标题的中英文独立显示开关（全局统一，默认都开）。

export interface SiteConfig {
  title: string;
  description: string;
  keywords: string;
  showChinese: boolean;
  showEnglish: boolean;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  title: '开平市中心医院能源管理平台',
  description: '开平市中心医院能源管理平台 — 园区综合态势监控、设备联动、能耗调控一站式管理',
  keywords: '医院能源,能耗管理,智慧医院,设备监控,大屏可视化',
  showChinese: true,
  showEnglish: true,
};

const CONFIG_PATH = path.resolve(process.cwd(), 'data', 'site-config.json');

@Injectable()
export class SiteConfigService {
  private readDoc(): SiteConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          return {
            title: typeof parsed.title === 'string' ? parsed.title : DEFAULT_SITE_CONFIG.title,
            description: typeof parsed.description === 'string' ? parsed.description : DEFAULT_SITE_CONFIG.description,
            keywords: typeof parsed.keywords === 'string' ? parsed.keywords : DEFAULT_SITE_CONFIG.keywords,
            showChinese: typeof parsed.showChinese === 'boolean' ? parsed.showChinese : DEFAULT_SITE_CONFIG.showChinese,
            showEnglish: typeof parsed.showEnglish === 'boolean' ? parsed.showEnglish : DEFAULT_SITE_CONFIG.showEnglish,
          };
        }
      }
    } catch {
      // 文件损坏则回退默认
    }
    return { ...DEFAULT_SITE_CONFIG };
  }

  private writeDoc(doc: SiteConfig): void {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(doc, null, 2), 'utf-8');
    } catch {
      // 落盘失败不影响内存读写
    }
  }

  // 读取完整站点配置（合并默认值，前端可直接套用）
  getConfig(): SiteConfig {
    return this.readDoc();
  }

  // 保存（前端传完整字段；空字符串表示使用默认值）
  saveConfig(body: Partial<SiteConfig>): SiteConfig {
    const current = this.readDoc();
    const next: SiteConfig = {
      title: typeof body.title === 'string' ? body.title.trim() : current.title,
      description: typeof body.description === 'string' ? body.description.trim() : current.description,
      keywords: typeof body.keywords === 'string' ? body.keywords.trim() : current.keywords,
      showChinese: typeof body.showChinese === 'boolean' ? body.showChinese : current.showChinese,
      showEnglish: typeof body.showEnglish === 'boolean' ? body.showEnglish : current.showEnglish,
    };
    this.writeDoc(next);
    return this.readDoc();
  }
}
import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { RequestContext } from '../common/request-context';
import { AuditLog, AuditReview, AuditSetting } from '../common/types';

export interface AuditRecordInput {
  user_id?: string;
  username: string;
  module: string; // auth / users / roles / devices / buildings / billing / scene / work-orders / control-groups / system / power / hotwater / elevator / regulation / lifecycle
  action: string; // create / update / delete / control / login / logout / config / switch / anchors / upload / export / review ...
  target: string; // 操作对象描述
  detail?: string;
  result?: 'success' | 'fail';
  ip?: string;
  // ---- 审查追踪增强 ----
  before?: Record<string, any> | null; // 修改前原值
  after?: Record<string, any> | null; // 修改后新值
  reason?: string; // 变更理由(Why)
  // ---- GK-26 审计来源 ----
  // 服务端可显式指定（如系统内部任务）；缺省时由请求上下文透传（X-KP-Source / JWT claim），
  // 再缺省回退 'human'。详见 SourceInterceptor。
  source?: 'human' | 'automation';
}

export interface AuditListParams {
  page?: number;
  limit?: number;
  username?: string;
  module?: string;
  action?: string;
  keyword?: string; // 模糊搜索 target/detail/reason/username
  from?: string;
  to?: string;
}

export interface AuditIntegrityResult {
  ok: boolean; // 哈希链是否完整、未被篡改
  count: number; // 总记录数
  checked: number; // 已纳入哈希链校验的记录数
  legacyCount: number; // 本功能上线前的历史记录数（无哈希，视为可信基线）
  brokenAt?: string; // 首个被篡改/断裂的记录 id
  tailHash?: string; // 链尾哈希
}

const GENESIS = 'GENESIS';

// 周期性复核默认间隔（天）。
// 优先级：审计追踪页配置（audit_settings.review-interval）> 环境变量 AUDIT_REVIEW_INTERVAL_DAYS > 默认 30。
// 调整入口：管理后台>审查追踪>工具栏「复核间隔」配置。
const DEFAULT_REVIEW_INTERVAL_DAYS = 30;
const REVIEW_INTERVAL_SETTING_ID = 'review-interval';
function envFallbackInterval(): number {
  const v = Number(process.env.AUDIT_REVIEW_INTERVAL_DAYS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_REVIEW_INTERVAL_DAYS;
}

@Injectable()
export class LogsService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  // 哈希链核心：对一条记录生成规范化摘要。prevHash 来自上一条记录，
  // 任何字段（含时间戳、操作者、前后值）被改动都会导致 hash 不匹配，从而暴露篡改。
  private computeHash(entry: Partial<AuditLog>, prevHash: string): string {
    const canonical = JSON.stringify({
      id: entry.id ?? '',
      user_id: entry.user_id ?? null,
      username: entry.username ?? '',
      module: entry.module ?? '',
      action: entry.action ?? '',
      target: entry.target ?? '',
      detail: entry.detail ?? null,
      result: entry.result ?? 'success',
      ip: entry.ip ?? null,
      created_at: entry.created_at ?? '',
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
      prev_hash: prevHash,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  // 写入一条审计日志（append-only，不可修改/删除）
  async record(input: AuditRecordInput): Promise<AuditLog> {
    const all = await this.connector.read<AuditLog>('audit_logs');
    const last = all.length ? all[all.length - 1] : null;
    const prevHash = last?.hash || GENESIS;
    const entry: AuditLog = {
      id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: input.user_id,
      username: input.username || 'system',
      module: input.module,
      action: input.action,
      target: input.target,
      detail: input.detail,
      result: input.result || 'success',
      ip: input.ip,
      created_at: new Date().toISOString(),
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason,
      // GK-26：来源标记。优先级 显式指定 > 请求上下文(SourceInterceptor) > 'human'(缺省)。
      source: input.source ?? RequestContext.getSource() ?? 'human',
      prev_hash: prevHash,
      hash: '',
    };
    entry.hash = this.computeHash(entry, prevHash);
    await this.connector.create('audit_logs', entry);
    return entry;
  }

  // 按查询条件筛选 + 时间倒序（list 与 export 共用，保证导出与列表筛选一致）
  private filterAuditLogs(logs: AuditLog[], params: AuditListParams): AuditLog[] {
    let out = logs;
    if (params.username) out = out.filter((l) => l.username.includes(params.username!));
    if (params.module) out = out.filter((l) => l.module === params.module);
    if (params.action) out = out.filter((l) => l.action === params.action);
    if (params.keyword) {
      const k = params.keyword.toLowerCase();
      out = out.filter(
        (l) =>
          (l.target || '').toLowerCase().includes(k) ||
          (l.detail || '').toLowerCase().includes(k) ||
          (l.reason || '').toLowerCase().includes(k) ||
          (l.username || '').toLowerCase().includes(k),
      );
    }
    if (params.from) out = out.filter((l) => l.created_at >= params.from!);
    if (params.to) out = out.filter((l) => l.created_at <= params.to!);
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return out;
  }

  // 分页查询（按用户/模块/操作类型/关键字/时间范围筛选，时间倒序）
  async list(params: AuditListParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 20));
    const logs = await this.connector.read<AuditLog>('audit_logs');
    const filtered = this.filterAuditLogs(logs, params);
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  }

  // GMP-P1：审计轨迹导出（CSV / JSON），含哈希链字段；导出动作本身写入审计链（不可篡改、可追溯）。
  async exportAudit(
    params: AuditListParams,
    format: 'csv' | 'json',
    actor: { user_id?: string; username: string },
    ip?: string,
  ): Promise<{ format: string; content: string; filename: string; count: number }> {
    const logs = await this.connector.read<AuditLog>('audit_logs');
    const filtered = this.filterAuditLogs(logs, params);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const count = filtered.length;
    const fmt = format === 'json' ? 'json' : 'csv';
    let content: string;
    if (fmt === 'csv') {
      const headers = ['id', 'created_at', 'username', 'module', 'action', 'target', 'detail', 'reason', 'before', 'after', 'result', 'ip', 'prev_hash', 'hash'];
      const esc = (v: unknown): string => {
        const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(',')];
      for (const r of filtered) {
        lines.push(
          [
            r.id,
            r.created_at,
            r.username,
            r.module,
            r.action,
            r.target || '',
            r.detail || '',
            r.reason || '',
            r.before,
            r.after,
            r.result || 'success',
            r.ip || '',
            r.prev_hash || '',
            r.hash || '',
          ]
            .map(esc)
            .join(','),
        );
      }
      content = '﻿' + lines.join('\r\n'); // UTF-8 BOM，Excel 友好
    } else {
      content = JSON.stringify(filtered, null, 2);
    }
    const filterDesc = [
      params.username && `操作人=${params.username}`,
      params.module && `模块=${params.module}`,
      params.action && `动作=${params.action}`,
      params.keyword && `关键字=${params.keyword}`,
      params.from && `起=${params.from}`,
      params.to && `止=${params.to}`,
    ]
      .filter(Boolean)
      .join('; ') || '全部';
    // 导出动作留痕（GMP：记录谁、何时、导出何种范围）
    await this.record({
      user_id: actor.user_id,
      username: actor.username,
      module: 'audit',
      action: 'export',
      target: `审计追踪导出(${fmt.toUpperCase()})`,
      detail: `导出审计记录 ${count} 条；筛选：${filterDesc}`,
      result: 'success',
      ip,
    });
    return { format: fmt, content, filename: `audit-trail-${ts}.${fmt}`, count };
  }

  // 校验审计哈希链完整性。历史记录（无 hash）视为可信基线，不参与密码学校验。
  async verifyIntegrity(): Promise<AuditIntegrityResult> {
    const all = await this.connector.read<AuditLog>('audit_logs');
    const sorted = [...all].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    const firstHashedIdx = sorted.findIndex((r) => !!r.hash);
    if (firstHashedIdx === -1) {
      return { ok: true, count: sorted.length, checked: 0, legacyCount: sorted.length, brokenAt: null, tailHash: undefined };
    }
    let prevHash = sorted[firstHashedIdx].prev_hash || GENESIS;
    let brokenAt: string | null = null;
    let checked = 0;
    for (let i = firstHashedIdx; i < sorted.length; i++) {
      const rec = sorted[i];
      const expected = this.computeHash({ ...rec, hash: '' }, prevHash);
      if (rec.hash !== expected) {
        brokenAt = rec.id;
        break;
      }
      prevHash = rec.hash || expected;
      checked++;
    }
    return {
      ok: brokenAt === null,
      count: sorted.length,
      checked,
      legacyCount: firstHashedIdx,
      brokenAt: brokenAt || undefined,
      tailHash: prevHash,
    };
  }

  // ===== GMP / 等保增强：时间源可信（NTP 同步）+ 周期性复核 =====

  // 服务器可信时间与 NTP 同步状态。审计时间戳由本服务在写入时以服务器时钟生成，
  // 不可由客户端篡改；GMP 要求时间源与 NTP 同步，此处探测系统 NTP 同步状态。
  getTimeSource(): { serverTime: string; ntpSynced: boolean | null; source: string; timezone: string } {
    const serverTime = new Date().toISOString();
    let ntpSynced: boolean | null = null;
    let source = 'unknown';
    try {
      const out = execSync('timedatectl show -p NTPSynchronized --value', { timeout: 2000 })
        .toString()
        .trim()
        .toLowerCase();
      if (out === 'yes') {
        ntpSynced = true;
        source = 'ntp';
      } else if (out === 'no') {
        ntpSynced = false;
        source = 'system';
      }
    } catch {
      // 非 systemd / 无 timedatectl（如本地 Windows 开发）时视为未知，时间戳仍由服务器时钟提供
      ntpSynced = null;
      source = 'unknown';
    }
    return { serverTime, ntpSynced, source, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }

  // 周期性复核状态：上次复核时间、距今天数、是否逾期（超过间隔视为逾期，需提醒）。
  async reviewStatus(): Promise<{
    lastReview: AuditReview | null;
    intervalDays: number;
    daysSince: number | null;
    dueInDays: number | null;
    overdue: boolean;
  }> {
    const intervalDays = await this.getReviewInterval();
    const reviews = await this.connector.read<AuditReview>('audit_reviews');
    reviews.sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1));
    const lastReview = reviews[0] || null;
    let daysSince: number | null = null;
    let dueInDays: number | null = null;
    let overdue = false;
    if (lastReview) {
      const elapsed = (Date.now() - new Date(lastReview.reviewed_at).getTime()) / 86400000;
      daysSince = Math.floor(elapsed);
      dueInDays = intervalDays - Math.floor(elapsed);
      overdue = elapsed > intervalDays;
    }
    return { lastReview, intervalDays, daysSince, dueInDays, overdue };
  }

  // 读取后台配置的复核间隔（天数）。优先级：audit_settings > 环境变量 > 默认 30。
  async getReviewInterval(): Promise<number> {
    try {
      const list = await this.connector.read<AuditSetting>('audit_settings');
      const row = list.find((s) => s.id === REVIEW_INTERVAL_SETTING_ID || s.key === REVIEW_INTERVAL_SETTING_ID);
      const days = Number(row?.reviewIntervalDays);
      if (Number.isFinite(days) && days > 0 && days <= 3650) return Math.floor(days);
    } catch {
      /* 读取失败走兜底 */
    }
    return envFallbackInterval();
  }

  // 后台更新复核间隔：写入 audit_settings 并写入一条 config 审计（before/after/reason 留痕）。
  async setReviewInterval(
    days: number,
    actor: { user_id?: string; username: string },
    reason?: string,
    ip?: string,
  ): Promise<{ intervalDays: number; before: number; after: number; audit: AuditLog }> {
    const d = Math.floor(Number(days));
    if (!Number.isFinite(d) || d <= 0 || d > 3650) {
      throw new Error('复核间隔天数必须为 1~3650 之间的正整数');
    }
    const before = await this.getReviewInterval();
    const now = new Date().toISOString();
    const list = await this.connector.read<AuditSetting>('audit_settings');
    const existing = list.find((s) => s.id === REVIEW_INTERVAL_SETTING_ID || s.key === REVIEW_INTERVAL_SETTING_ID);
    const next: AuditSetting = {
      id: REVIEW_INTERVAL_SETTING_ID,
      key: REVIEW_INTERVAL_SETTING_ID,
      reviewIntervalDays: d,
      updated_at: now,
      updated_by: actor.username,
    };
    if (existing) {
      await this.connector.update('audit_settings', { id: existing.id }, next);
    } else {
      await this.connector.create('audit_settings', next);
    }
    const audit = await this.record({
      user_id: actor.user_id,
      username: actor.username,
      module: 'audit',
      action: 'config',
      target: '审计追踪-复核间隔',
      detail: `更新复核间隔：${before} 天 → ${d} 天`,
      before: { reviewIntervalDays: before },
      after: { reviewIntervalDays: d },
      reason: reason || '复核间隔调整',
      result: 'success',
      ip,
    });
    return { intervalDays: d, before, after: d, audit };
  }

  private async firstAuditTime(): Promise<string> {
    const all = await this.connector.read<AuditLog>('audit_logs');
    if (!all.length) return new Date().toISOString();
    return all.reduce((min, r) => (r.created_at < min ? r.created_at : min), all[0].created_at);
  }

  private async countInWindow(from: string, to: string): Promise<number> {
    const all = await this.connector.read<AuditLog>('audit_logs');
    return all.filter((r) => r.created_at >= from && r.created_at <= to).length;
  }

  // 执行周期性复核：记录复核结论到 audit_reviews，并写入一条 review 审计（纳入哈希链，不可篡改）。
  async performReview(
    reviewer: { user_id?: string; username: string },
    note?: string,
    ip?: string,
  ): Promise<{ review: AuditReview; audit: AuditLog }> {
    const status = await this.reviewStatus();
    const from = status.lastReview ? status.lastReview.reviewed_at : await this.firstAuditTime();
    const to = new Date().toISOString();
    const recordCount = await this.countInWindow(from, to);
    const review: AuditReview = {
      id: `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reviewer: reviewer.username,
      reviewer_id: reviewer.user_id,
      reviewed_at: to,
      from,
      to,
      record_count: recordCount,
      note: note || undefined,
    };
    await this.connector.create('audit_reviews', review);
    const audit = await this.record({
      user_id: reviewer.user_id,
      username: reviewer.username,
      module: 'audit',
      action: 'review',
      target: '审计追踪周期性复核',
      detail: `复核区间 ${from} ~ ${to}，覆盖审计记录 ${recordCount} 条`,
      reason: note || '周期性复核',
      before: null,
      after: { from, to, record_count: recordCount },
      result: 'success',
      ip,
    });
    return { review, audit };
  }
}

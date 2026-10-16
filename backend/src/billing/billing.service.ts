import { Inject, Injectable } from '@nestjs/common';
import { CONNECTOR_TOKEN, Connector } from '../common/connector/connector.interface';
import { BizError } from '../common/response.util';
import { BillingLedgerEntry, BillingPrice, BillingQuota } from '../common/types';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

@Injectable()
export class BillingService {
  constructor(@Inject(CONNECTOR_TOKEN) private readonly connector: Connector) {}

  // ---------- 电价 ----------
  async listPrices(): Promise<BillingPrice[]> {
    return this.connector.read<BillingPrice>('billing_prices');
  }

  async createPrice(body: Record<string, any>): Promise<BillingPrice> {
    const record: BillingPrice = {
      id: genId('price'),
      name: (body.name as string) || '电价',
      type: body.type || 'flat',
      price: Number(body.price) || 0,
      start: (body.start as string) || '00:00',
      end: (body.end as string) || '24:00',
      unit: (body.unit as string) || '元/kWh',
    };
    return this.connector.create('billing_prices', record);
  }

  async updatePrice(id: string, body: Record<string, any>): Promise<BillingPrice> {
    const exist = await this.connector.findOne<BillingPrice>('billing_prices', { id });
    if (!exist) throw new BizError(40400, `电价不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.type !== undefined) patch.type = body.type;
    if (body.price !== undefined) patch.price = Number(body.price);
    if (body.start !== undefined) patch.start = body.start;
    if (body.end !== undefined) patch.end = body.end;
    if (body.unit !== undefined) patch.unit = body.unit;
    return this.connector.update('billing_prices', { id }, patch);
  }

  async removePrice(id: string): Promise<void> {
    const exist = await this.connector.findOne<BillingPrice>('billing_prices', { id });
    if (!exist) throw new BizError(40400, `电价不存在: ${id}`, 404);
    await this.connector.remove('billing_prices', { id });
  }

  // ---------- 配额 ----------
  async listQuotas(): Promise<BillingQuota[]> {
    return this.connector.read<BillingQuota>('billing_quotas');
  }

  async createQuota(body: Record<string, any>): Promise<BillingQuota> {
    const record: BillingQuota = {
      id: genId('quota'),
      scope: body.scope || 'building',
      ref_id: (body.ref_id as string) || '',
      period: (body.period as BillingQuota['period']) || 'month',
      quota_kwh: Number(body.quota_kwh) || 0,
      warning_pct: Number(body.warning_pct) || 80,
    };
    return this.connector.create('billing_quotas', record);
  }

  async updateQuota(id: string, body: Record<string, any>): Promise<BillingQuota> {
    const exist = await this.connector.findOne<BillingQuota>('billing_quotas', { id });
    if (!exist) throw new BizError(40400, `配额不存在: ${id}`, 404);
    const patch: Record<string, any> = {};
    if (body.scope !== undefined) patch.scope = body.scope;
    if (body.ref_id !== undefined) patch.ref_id = body.ref_id;
    if (body.period !== undefined) patch.period = body.period;
    if (body.quota_kwh !== undefined) patch.quota_kwh = Number(body.quota_kwh);
    if (body.warning_pct !== undefined) patch.warning_pct = Number(body.warning_pct);
    return this.connector.update('billing_quotas', { id }, patch);
  }

  async removeQuota(id: string): Promise<void> {
    const exist = await this.connector.findOne<BillingQuota>('billing_quotas', { id });
    if (!exist) throw new BizError(40400, `配额不存在: ${id}`, 404);
    await this.connector.remove('billing_quotas', { id });
  }

  // ---------- 账户 / 充值 ----------
  private buildAccount(entries: BillingLedgerEntry[], scope: string, refId: string): Record<string, any> {
    const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
    const balance = sorted.reduce((s, e) => s + e.amount, 0);
    return { scope, ref_id: refId, balance: Math.round(balance * 100) / 100, ledger: sorted };
  }

  async listAccounts(scope?: string, refId?: string): Promise<Record<string, any>[]> {
    const entries = await this.connector.read<BillingLedgerEntry>('billing_ledger');
    const groups = new Map<string, BillingLedgerEntry[]>();
    for (const e of entries) {
      const key = `${e.scope}|${e.ref_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    const accounts: Record<string, any>[] = [];
    for (const [key, list] of groups) {
      const [sc, rid] = key.split('|');
      if (scope && sc !== scope) continue;
      if (refId && rid !== refId) continue;
      accounts.push(this.buildAccount(list, sc, rid));
    }
    // 显式指定 scope+ref_id 但未找到账户时，返回零余额账户
    if (scope && refId && !accounts.find((a) => a.scope === scope && a.ref_id === refId)) {
      accounts.push(this.buildAccount([], scope, refId));
    }
    return accounts;
  }

  async recharge(body: Record<string, any>): Promise<Record<string, any>> {
    const scope = (body.scope as BillingLedgerEntry['scope']) || 'building';
    const refId = body.ref_id as string;
    if (!scope || !refId) throw new BizError(40001, 'scope 与 ref_id 必填', 400);
    const amount = Number(body.amount);
    if (!amount || amount <= 0) throw new BizError(40002, '充值金额必须为正数', 400);

    const entries = await this.connector.read<BillingLedgerEntry>('billing_ledger', { scope, ref_id: refId });
    const prevBalance = entries.reduce((s, e) => s + e.amount, 0);
    const balanceAfter = prevBalance + amount;

    const entry: BillingLedgerEntry = {
      id: genId('led'),
      scope,
      ref_id: refId,
      type: 'recharge',
      amount,
      balance_after: Math.round(balanceAfter * 100) / 100,
      remark: body.remark,
      ts: new Date().toISOString(),
    };
    await this.connector.create('billing_ledger', entry);
    return { account: this.buildAccount([...entries, entry], scope, refId) };
  }
}

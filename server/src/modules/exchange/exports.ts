import { and, desc, eq, gte, lte, notInArray, type SQL } from 'drizzle-orm';
import { ledgerEntries, orders, trades } from '../../db/schema.ts';
import type { Db } from '../../db/client.ts';
import { serializeLedger, serializeOrder, serializeTrade } from './serializers.ts';

export const MAX_EXPORT_ROWS = 10_000;

interface RangeFilter {
  symbol?: string;
  from?: string;
  to?: string;
}

function csv(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    if (v === null) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens UTF-8 correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/** "2026-10-09 10:00:00" in GMT+7 (display only; data stays UTC). */
export const gmt7 = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);

function timeFilters(col: typeof orders.createdAt | typeof trades.createdAt | typeof ledgerEntries.createdAt, f: RangeFilter): SQL[] {
  const w: SQL[] = [];
  if (f.from) w.push(gte(col, new Date(f.from)));
  if (f.to) w.push(lte(col, new Date(f.to)));
  return w;
}

export async function exportOrdersCsv(db: Db, userId: string, f: RangeFilter): Promise<string> {
  const where: SQL[] = [eq(orders.userId, userId), ...timeFilters(orders.createdAt, f)];
  if (f.symbol) where.push(eq(orders.symbol, f.symbol));
  const rows = await db
    .select()
    .from(orders)
    .where(and(...where))
    .orderBy(desc(orders.id))
    .limit(MAX_EXPORT_ROWS);
  return csv(
    ['orderId', 'time_utc', 'time_gmt7', 'symbol', 'side', 'type', 'status', 'price', 'stopPrice', 'quantity', 'quoteOrderQty', 'executedQty', 'cumulativeQuoteQty', 'avgPrice', 'orderListId', 'parentOrderId', 'closeReason'],
    rows.map(serializeOrder).map((o) => [
      o.id,
      o.createdAt,
      gmt7(o.createdAt),
      o.symbol,
      o.side,
      o.type,
      o.status,
      o.price,
      o.stopPrice,
      o.quantity,
      o.quoteOrderQty,
      o.executedQty,
      o.cumulativeQuoteQty,
      o.avgPrice,
      o.orderListId,
      o.parentOrderId,
      o.closeReason,
    ]),
  );
}

export async function exportTradesCsv(db: Db, userId: string, f: RangeFilter): Promise<string> {
  const where: SQL[] = [eq(trades.userId, userId), ...timeFilters(trades.createdAt, f)];
  if (f.symbol) where.push(eq(trades.symbol, f.symbol));
  const rows = await db
    .select()
    .from(trades)
    .where(and(...where))
    .orderBy(desc(trades.id))
    .limit(MAX_EXPORT_ROWS);
  return csv(
    ['tradeId', 'orderId', 'time_utc', 'time_gmt7', 'symbol', 'side', 'price', 'quantity', 'quoteQty', 'fee', 'feeAsset', 'liquidity', 'realizedPnl'],
    rows.map(serializeTrade).map((t) => [t.id, t.orderId, t.createdAt, gmt7(t.createdAt), t.symbol, t.side, t.price, t.quantity, t.quoteQty, t.fee, t.feeAsset, t.liquidity, t.realizedPnl]),
  );
}

export async function exportLedgerCsv(db: Db, userId: string, f: { asset?: string; hideLocks: 'true' | 'false'; from?: string; to?: string }): Promise<string> {
  const where: SQL[] = [eq(ledgerEntries.userId, userId), eq(ledgerEntries.account, 'SPOT'), ...timeFilters(ledgerEntries.createdAt, f)];
  if (f.asset) where.push(eq(ledgerEntries.asset, f.asset));
  if (f.hideLocks === 'true') where.push(notInArray(ledgerEntries.type, ['ORDER_LOCK', 'ORDER_UNLOCK']));
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(...where))
    .orderBy(desc(ledgerEntries.id))
    .limit(MAX_EXPORT_ROWS);
  return csv(
    ['entryId', 'time_utc', 'time_gmt7', 'asset', 'type', 'deltaAvailable', 'deltaLocked', 'availableAfter', 'lockedAfter', 'refType', 'refId'],
    rows.map(serializeLedger).map((e) => [e.id, e.createdAt, gmt7(e.createdAt), e.asset, e.type, e.deltaAvailable, e.deltaLocked, e.availableAfter, e.lockedAfter, e.refType, e.refId]),
  );
}

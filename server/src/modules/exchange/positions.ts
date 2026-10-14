import { and, eq, sql } from 'drizzle-orm';
import { dec, toFixedStr, ZERO, type Dec } from '@cex/core';
import { positions } from '../../db/schema.ts';
import type { Tx } from '../../db/client.ts';

export interface PositionFill {
  qty: Dec;
  /** USDT value of the fill (qty × price). */
  quote: Dec;
  /** Fee: in base on BUY, in USDT on SELL. */
  fee: Dec;
  /** Vietnam tax withheld (SELL only, USDT); absent or 0 otherwise. */
  tax?: Dec;
}

const AVG_SCALE = 18;

/**
 * Average-cost accounting for one (user, base asset), inside the fill's transaction.
 *   BUY : avg = (held × avg + USDT paid) / (held + qty − fee)
 *   SELL: realized = (USDT received − fee − tax) − qty × avg ; avg unchanged (reset when flat)
 * Returns the realized PnL of each fill (null for BUY, or SELL without a cost basis).
 */
export async function applyFillsToPosition(tx: Tx, userId: string, asset: string, side: 'BUY' | 'SELL', fills: PositionFill[]): Promise<(Dec | null)[]> {
  await tx.insert(positions).values({ userId, asset }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), eq(positions.asset, asset)))
    .for('update');
  let qty = dec(row!.quantity);
  let avg: Dec | null = row!.avgCost === null ? null : dec(row!.avgCost);
  let realizedTotal = dec(row!.realizedPnl);
  const realized: (Dec | null)[] = [];

  for (const f of fills) {
    if (side === 'BUY') {
      const net = f.qty.sub(f.fee);
      const newQty = qty.add(net);
      const cost = (avg ?? ZERO).mul(qty).add(f.quote);
      avg = newQty.gt(0) ? cost.div(newQty).toDecimalPlaces(AVG_SCALE) : null;
      qty = newQty;
      realized.push(null);
    } else {
      const proceeds = f.quote.sub(f.fee).sub(f.tax ?? ZERO);
      const r = avg === null ? null : proceeds.sub(f.qty.mul(avg)).toDecimalPlaces(8);
      if (r !== null) realizedTotal = realizedTotal.add(r);
      realized.push(r);
      qty = qty.sub(f.qty);
      if (qty.lte(0)) {
        qty = ZERO;
        avg = null;
      }
    }
  }

  await tx
    .update(positions)
    .set({
      quantity: qty.toFixed(AVG_SCALE),
      avgCost: avg === null ? null : avg.toFixed(AVG_SCALE),
      realizedPnl: toFixedStr(realizedTotal),
      updatedAt: sql`now()`,
    })
    .where(and(eq(positions.userId, userId), eq(positions.asset, asset)));
  return realized;
}

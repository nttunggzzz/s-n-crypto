import { z } from 'zod';
import { DecimalString, IsoDateTime, PositiveDecimalString, SymbolCode } from './common.ts';

/** Fires once when the last traded price reaches the target, then becomes TRIGGERED. */
export const PriceAlertCondition = z.enum(['ABOVE', 'BELOW']);

export const PriceAlert = z.object({
  id: z.string(),
  symbol: SymbolCode,
  /** ABOVE: last price >= target · BELOW: last price <= target */
  condition: PriceAlertCondition,
  targetPrice: DecimalString,
  note: z.string().nullable(),
  status: z.enum(['ACTIVE', 'TRIGGERED', 'CANCELED']),
  triggeredPrice: DecimalString.nullable(),
  triggeredAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type PriceAlert = z.infer<typeof PriceAlert>;

/** Max 50 ACTIVE alerts per user (LIMIT_EXCEEDED). Target already reached → INVALID_PRICE. */
export const CreatePriceAlertRequest = z.object({
  symbol: SymbolCode,
  condition: PriceAlertCondition,
  targetPrice: PositiveDecimalString,
  note: z.string().trim().max(140).optional(),
});
export type CreatePriceAlertRequest = z.input<typeof CreatePriceAlertRequest>;

export const AlertListQuery = z.object({
  status: z.enum(['ACTIVE', 'TRIGGERED', 'CANCELED']).optional(),
});

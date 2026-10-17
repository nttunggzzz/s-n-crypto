/**
 * Tax periods in Vietnam time (UTC+7, no daylight saving) - module T section 3.2.
 * Everything is stored in UTC; these helpers only decide where a month or quarter starts and ends.
 */
const VN_OFFSET_MS = 7 * 3_600_000;

/** 00:00 UTC+7 on the 1st of the month (month 1..12) as a UTC instant. Month 13 = January of the next year. */
export function vnMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - VN_OFFSET_MS);
}

/**
 * "2026-10" or "2026-Q4" -> [from, to]; `to` is the last millisecond of the period (INCLUDED, like every `to` of the API).
 * The input must already be validated (TaxPeriod of the contract).
 */
export function periodRange(period: string): { from: Date; to: Date } {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if ((!q && !m) || (m && (Number(m[2]) < 1 || Number(m[2]) > 12))) throw new Error(`invalid tax period: ${period}`);
  const [y, first, count] = q ? [Number(q[1]), (Number(q[2]) - 1) * 3 + 1, 3] : [Number(m![1]), Number(m![2]), 1];
  return { from: vnMonthStart(y!, first!), to: new Date(vnMonthStart(y!, first! + count!).getTime() - 1) };
}

/**
 * 00:00 UTC+7 of the Vietnam calendar day that contains `at`, as a UTC instant. Same rule as the PnL analysis
 * (`gmt7Day` in pnlService.ts: the day label of `at + 7 h`), written as arithmetic - UTC+7 has no daylight saving.
 */
export function vnDayStart(at: Date): Date {
  return new Date(Math.floor((at.getTime() + VN_OFFSET_MS) / 86_400_000) * 86_400_000 - VN_OFFSET_MS);
}

/** The Vietnam calendar month (1..12) `at` falls in. */
export function vnMonthOf(at: Date): { year: number; month: number } {
  const d = new Date(at.getTime() + VN_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** "YYYY-MM" of the Vietnam month `month` (1..12) of `year`. */
export const vnMonthLabel = (year: number, month: number): string => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

/** The year it is now in Vietnam. */
export const vnYearNow = (now = new Date()): number => new Date(now.getTime() + VN_OFFSET_MS).getUTCFullYear();

/** First instant of `year` and the last millisecond of it, Vietnam time. */
export function yearRange(year: number): { from: Date; to: Date } {
  return { from: vnMonthStart(year, 1), to: new Date(vnMonthStart(year, 13).getTime() - 1) };
}

/**
 * ⚠️ MOCK trading-journal data (0.13.0) — UI development and tests only. Every number was computed by hand with the
 * rules of docs/plans/module-A-nhat-ky-giao-dich.md §2.5 and quy-uoc-R-va-nguon-du-lieu.md (spot fee 0.1 %,
 * futures taker 0.05 %, liquidation fee 0.5 %) — the arithmetic is in the comment above each entry — and checked
 * against @cex/core (`computeEntryResult`, `futuresEntryResult`, `computeJournalStats`) by mocks-journal.test.ts.
 *
 * Entries (11 — the flip is two entries):
 *  J1 win · J2 loss (FOMO, moved stop) · J3 breakeven (futures) · J4 open (built from the mock trades 500 + 501) ·
 *  J5 no initial stop (MANUAL) · J6 futures liquidated · J7 + J8 futures flip (CLOSE leg in J7, OPEN leg in J8) ·
 *  J9 sell with an unattributed part · J10 VOID after an account reset · J11 needsReview.
 */
import type { JournalAttachment, JournalEntryDetail, JournalFill, JournalResult, JournalSetupList, JournalStats } from '../index.ts';

/** Entry ids (valid UUIDs, like the server's). */
export const J = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
/** Attachment ids. */
export const JA = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, '0')}`;

/** A real 1×1 PNG (70 bytes) — the mock serves it for the fixture image. */
export const FIXTURE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** A real 1×1 WebP (34 bytes). */
export const FIXTURE_WEBP_BASE64 = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

const Z = '0.00000000';
const NO_PLAN = { entry: null, stop: null, target: null };

type FillInput = Omit<JournalFill, 'unattributedQty'> & { unattributedQty?: string };
const fill = (f: FillInput): JournalFill => ({ ...f, unattributedQty: f.unattributedQty ?? Z });

type ResultInput = Omit<JournalResult, 'rMetricsVersion' | 'dustQty' | 'liquidated' | 'legsConsistent'>;
/** Spot result as computeEntryResult returns it (dust 0 in every fixture). */
const spotResult = (r: Omit<ResultInput, 'market' | 'direction' | 'funding'>): JournalResult => ({
  rMetricsVersion: 1,
  market: 'SPOT',
  direction: 'LONG',
  ...r,
  funding: null,
  dustQty: Z,
  liquidated: null,
  legsConsistent: null,
});
/** Futures result as futuresEntryResult returns it. */
const futuresResult = (r: Omit<ResultInput, 'market'>, liquidated = false): JournalResult => ({
  rMetricsVersion: 1,
  market: 'FUTURES',
  ...r,
  dustQty: null,
  liquidated,
  legsConsistent: true,
});

type EntryInput = Omit<JournalEntryDetail, 'fillCount' | 'attachmentCount' | 'needsReview' | 'adjustedAt' | 'adjustmentReason' | 'futuresPositionId' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<JournalEntryDetail, 'needsReview' | 'adjustedAt' | 'adjustmentReason' | 'futuresPositionId' | 'updatedAt'>>;
const entry = (e: EntryInput): JournalEntryDetail => ({
  needsReview: false,
  adjustedAt: null,
  adjustmentReason: null,
  futuresPositionId: null,
  ...e,
  fillCount: e.fills.length,
  attachmentCount: e.attachments.length,
  createdAt: e.openedAt,
  updatedAt: e.updatedAt ?? e.closedAt ?? e.openedAt,
});

const pngOfJ1: JournalAttachment = {
  id: JA(1),
  entryId: J(1),
  contentType: 'image/png',
  bytes: 70,
  sha256: '497790947d4666760ce38f3c00e852c71fdb66cae849bae8e9ede352719e1581',
  createdAt: '2026-10-03T10:00:00.000Z',
};

export const fixtureJournalEntries: JournalEntryDetail[] = [
  // J1 ETHUSDT spot, WIN. Buy 0.4 @ 2400 = 960 USDT, fee 0.0004 ETH → net 0.3996 ETH. Sell 0.3996 @ 2520 = 1006.992, fee 1.006992.
  // netPnl = 1006.992 − 1.006992 − 960 = 45.985008 · fees = 0.0004 × 2400 + 1.006992 = 1.966992
  // risk = |2400 − 2340| × 0.4 = 24 · R = 45.985008 / 24 = 1.916042 · held 2026-10-02 03:00 → 10-03 09:30 = 109 800 000 ms
  entry({
    id: J(1),
    market: 'SPOT',
    symbol: 'ETHUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    origin: 'AUTO',
    setup: 'Breakout',
    tags: ['trend'],
    plan: { entry: '2400.00', stop: '2340.00', target: '2550.00' },
    initialStop: '2340.00',
    initialStopLocked: true,
    notes: 'Phá đỉnh 2.380 với khối lượng lớn, vào lại sau khi giá test lại vùng phá.',
    mistakes: [],
    executionScore: 4,
    openQty: Z,
    exitQty: '0.39960000',
    result: spotResult({ status: 'CLOSED', entryQty: '0.40000000', avgEntryPrice: '2400', avgExitPrice: '2520', realizedPnl: '45.98500800', netPnl: '45.98500800', fees: '1.96699200', riskUsdt: '24.00000000', rMultiple: '1.91604200', outcome: 'WIN', holdingMs: 109_800_000 }),
    fills: [
      fill({ id: '7101', tradeId: '411', orderId: '8101', leg: 'SPOT', side: 'BUY', price: '2400.00000000', quantity: '0.40000000', fee: '0.00040000', feeAsset: 'ETH', allocatedQty: '0.40000000', allocatedQuote: '960.00000000', allocatedFee: '0.00040000', executedAt: '2026-10-02T03:00:00.000Z' }),
      fill({ id: '7102', tradeId: '412', orderId: '8102', leg: 'SPOT', side: 'SELL', price: '2520.00000000', quantity: '0.39960000', fee: '1.00699200', feeAsset: 'USDT', allocatedQty: '0.39960000', allocatedQuote: '1006.99200000', allocatedFee: '1.00699200', executedAt: '2026-10-03T09:30:00.000Z' }),
    ],
    attachments: [pngOfJ1],
    openedAt: '2026-10-02T03:00:00.000Z',
    closedAt: '2026-10-03T09:30:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
  }),
  // J2 SOLUSDT spot, LOSS. Buy 5 @ 120 = 600, fee 0.005 SOL → net 4.995. Sell 4.995 @ 114 = 569.43, fee 0.56943.
  // netPnl = 569.43 − 0.56943 − 600 = −31.13943 · fees = 0.005 × 120 + 0.56943 = 1.16943 · risk = 5 × 5 = 25 · R = −1.2455772
  entry({
    id: J(2),
    market: 'SPOT',
    symbol: 'SOLUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    origin: 'AUTO',
    setup: 'Breakout',
    tags: ['trend'],
    plan: { entry: '119.50', stop: '115.00', target: '130.00' },
    initialStop: '115.00',
    initialStopLocked: true,
    notes: 'Mua đuổi khi nến 15m tăng mạnh; dời dừng lỗ xuống thay vì cắt.',
    mistakes: ['FOMO', 'MOVED_STOP'],
    executionScore: 2,
    openQty: Z,
    exitQty: '4.99500000',
    result: spotResult({ status: 'CLOSED', entryQty: '5.00000000', avgEntryPrice: '120', avgExitPrice: '114', realizedPnl: '-31.13943000', netPnl: '-31.13943000', fees: '1.16943000', riskUsdt: '25.00000000', rMultiple: '-1.24557720', outcome: 'LOSS', holdingMs: 50_400_000 }),
    fills: [
      fill({ id: '7201', tradeId: '421', orderId: '8201', leg: 'SPOT', side: 'BUY', price: '120.00000000', quantity: '5.00000000', fee: '0.00500000', feeAsset: 'SOL', allocatedQty: '5.00000000', allocatedQuote: '600.00000000', allocatedFee: '0.00500000', executedAt: '2026-10-03T12:00:00.000Z' }),
      fill({ id: '7202', tradeId: '422', orderId: '8202', leg: 'SPOT', side: 'SELL', price: '114.00000000', quantity: '4.99500000', fee: '0.56943000', feeAsset: 'USDT', allocatedQty: '4.99500000', allocatedQuote: '569.43000000', allocatedFee: '0.56943000', executedAt: '2026-10-04T02:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-03T12:00:00.000Z',
    closedAt: '2026-10-04T02:00:00.000Z',
  }),
  // J3 BTCUSDT futures LONG, BREAKEVEN. Open 0.01 @ 80000 (fee 0.4), close 0.01 @ 80080 (fee 0.4004), funding +0.0004.
  // realized 0.8 → netPnl = 0.8 − 0.8004 + 0.0004 = 0 · risk = 1000 × 0.01 = 10 · R = 0
  entry({
    id: J(3),
    market: 'FUTURES',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    origin: 'AUTO',
    futuresPositionId: '480',
    setup: 'Pullback',
    tags: ['scalp'],
    plan: { entry: '80000.0', stop: '79000.0', target: '81500.0' },
    initialStop: '79000.0',
    initialStopLocked: true,
    notes: 'Chốt sớm vì sắp có tin CPI.',
    mistakes: ['EARLY_EXIT'],
    executionScore: 3,
    openQty: Z,
    exitQty: '0.01000000',
    result: futuresResult({ direction: 'LONG', status: 'CLOSED', entryQty: '0.01000000', avgEntryPrice: '80000', avgExitPrice: '80080', realizedPnl: Z, netPnl: Z, fees: '0.80040000', funding: '0.00040000', riskUsdt: '10.00000000', rMultiple: Z, outcome: 'BREAKEVEN', holdingMs: 7_200_000 }),
    fills: [
      fill({ id: '7301', tradeId: '431', orderId: '8301', leg: 'OPEN', side: 'BUY', price: '80000.00000000', quantity: '0.01000000', fee: '0.40000000', feeAsset: 'USDT', allocatedQty: '0.01000000', allocatedQuote: '800.00000000', allocatedFee: '0.40000000', executedAt: '2026-10-07T08:00:00.000Z' }),
      fill({ id: '7302', tradeId: '432', orderId: '8302', leg: 'CLOSE', side: 'SELL', price: '80080.00000000', quantity: '0.01000000', fee: '0.40040000', feeAsset: 'USDT', allocatedQty: '0.01000000', allocatedQuote: '800.80000000', allocatedFee: '0.40040000', executedAt: '2026-10-07T10:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-07T08:00:00.000Z',
    closedAt: '2026-10-07T10:00:00.000Z',
  }),
  // J4 BTCUSDT spot, OPEN — the mock trades 500 (order 100, SL 76000 attached) and 501 (order 101).
  // entryQty = 0.0125 + 0.00359 = 0.01609 · avg = (999.9875 + 280.02) / 0.01609 = 79552.983219390926 (12 dp)
  // open = 0.01609 − 0.00001609 (fees in BTC) = 0.01607391 · risk = 1280.0075 − 76000 × 0.01609 = 57.1675
  // fees = 0.0000125 × 79999 + 0.00000359 × 78000 = 1.2800075
  entry({
    id: J(4),
    market: 'SPOT',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    status: 'OPEN',
    closeReason: null,
    origin: 'AUTO',
    setup: null,
    tags: [],
    plan: NO_PLAN,
    initialStop: '76000.00000000',
    initialStopLocked: false,
    notes: '',
    mistakes: [],
    executionScore: null,
    openQty: '0.01607391',
    exitQty: Z,
    result: spotResult({ status: 'OPEN', entryQty: '0.01609000', avgEntryPrice: '79552.983219390926', avgExitPrice: null, realizedPnl: null, netPnl: null, fees: '1.28000750', riskUsdt: '57.16750000', rMultiple: null, outcome: null, holdingMs: null }),
    fills: [
      fill({ id: '7401', tradeId: '500', orderId: '100', leg: 'SPOT', side: 'BUY', price: '79999.00000000', quantity: '0.01250000', fee: '0.00001250', feeAsset: 'BTC', allocatedQty: '0.01250000', allocatedQuote: '999.98750000', allocatedFee: '0.00001250', executedAt: '2026-10-09T02:00:00.000Z' }),
      fill({ id: '7402', tradeId: '501', orderId: '101', leg: 'SPOT', side: 'BUY', price: '78000.00000000', quantity: '0.00359000', fee: '0.00000359', feeAsset: 'BTC', allocatedQty: '0.00359000', allocatedQuote: '280.02000000', allocatedFee: '0.00000359', executedAt: '2026-10-09T02:35:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-09T02:00:00.000Z',
    closedAt: null,
    updatedAt: '2026-10-09T02:35:00.000Z',
  }),
  // J5 XRPUSDT spot, MANUAL, no initial stop → R null, outcome by PnL. Buy 500 @ 1.3 = 650, fee 0.5 XRP → 499.5.
  // Sell 499.5 @ 1.35 = 674.325, fee 0.674325 → netPnl = 23.650675 · fees = 0.5 × 1.3 + 0.674325 = 1.324325
  entry({
    id: J(5),
    market: 'SPOT',
    symbol: 'XRPUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    origin: 'MANUAL',
    setup: null,
    tags: [],
    plan: NO_PLAN,
    initialStop: null,
    initialStopLocked: true,
    notes: 'Lệnh cũ trước khi bật nhật ký — tự ghi lại để xem.',
    mistakes: ['NO_STOP'],
    executionScore: null,
    openQty: Z,
    exitQty: '499.50000000',
    result: spotResult({ status: 'CLOSED', entryQty: '500.00000000', avgEntryPrice: '1.3', avgExitPrice: '1.35', realizedPnl: '23.65067500', netPnl: '23.65067500', fees: '1.32432500', riskUsdt: null, rMultiple: null, outcome: 'WIN', holdingMs: 180_000_000 }),
    fills: [
      fill({ id: '7501', tradeId: '451', orderId: '8501', leg: 'SPOT', side: 'BUY', price: '1.30000000', quantity: '500.00000000', fee: '0.50000000', feeAsset: 'XRP', allocatedQty: '500.00000000', allocatedQuote: '650.00000000', allocatedFee: '0.50000000', executedAt: '2026-09-28T08:00:00.000Z' }),
      fill({ id: '7502', tradeId: '452', orderId: '8502', leg: 'SPOT', side: 'SELL', price: '1.35000000', quantity: '499.50000000', fee: '0.67432500', feeAsset: 'USDT', allocatedQty: '499.50000000', allocatedQuote: '674.32500000', allocatedFee: '0.67432500', executedAt: '2026-09-30T10:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-09-28T08:00:00.000Z',
    closedAt: '2026-09-30T10:00:00.000Z',
  }),
  // J6 ETHUSDT futures SHORT 20×, LIQUIDATED. Open 0.2 @ 2500 (fee 0.25, margin 25); liquidated at mark 2610:
  // realized = (2500 − 2610) × 0.2 = −22, liquidation fee = min(25 − 22, 2610 × 0.2 × 0.5 %) = 2.61, funding −0.10
  // netPnl = −22 − (0.25 + 2.61) − 0.10 = −24.96 · risk = |2500 − 2620| × 0.2 = 24 · R = −1.04
  entry({
    id: J(6),
    market: 'FUTURES',
    symbol: 'ETHUSDT',
    direction: 'SHORT',
    status: 'CLOSED',
    closeReason: 'LIQUIDATED',
    origin: 'AUTO',
    futuresPositionId: '481',
    setup: 'Tin tức',
    tags: ['news'],
    plan: { entry: '2500.00', stop: '2620.00', target: '2300.00' },
    initialStop: '2620.00',
    initialStopLocked: true,
    notes: 'Đòn bẩy 20× nên bị thanh lý trước khi chạm dừng lỗ.',
    mistakes: ['OVERSIZE'],
    executionScore: 1,
    openQty: Z,
    exitQty: '0.20000000',
    result: futuresResult({ direction: 'SHORT', status: 'CLOSED', entryQty: '0.20000000', avgEntryPrice: '2500', avgExitPrice: '2610', realizedPnl: '-24.96000000', netPnl: '-24.96000000', fees: '2.86000000', funding: '-0.10000000', riskUsdt: '24.00000000', rMultiple: '-1.04000000', outcome: 'LOSS', holdingMs: 21_600_000 }, true),
    fills: [
      fill({ id: '7601', tradeId: '461', orderId: '8601', leg: 'OPEN', side: 'SELL', price: '2500.00000000', quantity: '0.20000000', fee: '0.25000000', feeAsset: 'USDT', allocatedQty: '0.20000000', allocatedQuote: '500.00000000', allocatedFee: '0.25000000', executedAt: '2026-10-05T01:00:00.000Z' }),
      fill({ id: '7602', tradeId: '462', orderId: '8602', leg: 'CLOSE', side: 'BUY', price: '2610.00000000', quantity: '0.20000000', fee: '2.61000000', feeAsset: 'USDT', allocatedQty: '0.20000000', allocatedQuote: '522.00000000', allocatedFee: '2.61000000', executedAt: '2026-10-05T07:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-05T01:00:00.000Z',
    closedAt: '2026-10-05T07:00:00.000Z',
  }),
  // J7 SOLUSDT futures LONG closed by a FLIP. Open 10 @ 110 (fee 0.55). One SELL 15 @ 114 (fee 0.855): CLOSE leg 10 here
  // (fee share roundUp(0.855 × 10/15) = 0.57), OPEN leg 5 in J8 (the rest, 0.285). realized = 4 × 10 = 40, funding −0.12
  // netPnl = 40 − (0.55 + 0.57) − 0.12 = 38.76 · risk = 3 × 10 = 30 · R = 1.292
  entry({
    id: J(7),
    market: 'FUTURES',
    symbol: 'SOLUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    origin: 'AUTO',
    futuresPositionId: '482',
    setup: 'Pullback',
    tags: ['trend'],
    plan: { entry: '110.00', stop: '107.00', target: '118.00' },
    initialStop: '107.00',
    initialStopLocked: true,
    notes: 'Đảo chiều sang Short khi chạm kháng cự.',
    mistakes: [],
    executionScore: 4,
    openQty: Z,
    exitQty: '10.00000000',
    result: futuresResult({ direction: 'LONG', status: 'CLOSED', entryQty: '10.00000000', avgEntryPrice: '110', avgExitPrice: '114', realizedPnl: '38.76000000', netPnl: '38.76000000', fees: '1.12000000', funding: '-0.12000000', riskUsdt: '30.00000000', rMultiple: '1.29200000', outcome: 'WIN', holdingMs: 28_800_000 }),
    fills: [
      fill({ id: '7701', tradeId: '471', orderId: '8701', leg: 'OPEN', side: 'BUY', price: '110.00000000', quantity: '10.00000000', fee: '0.55000000', feeAsset: 'USDT', allocatedQty: '10.00000000', allocatedQuote: '1100.00000000', allocatedFee: '0.55000000', executedAt: '2026-10-07T22:00:00.000Z' }),
      fill({ id: '7702', tradeId: '472', orderId: '8702', leg: 'CLOSE', side: 'SELL', price: '114.00000000', quantity: '15.00000000', fee: '0.85500000', feeAsset: 'USDT', allocatedQty: '10.00000000', allocatedQuote: '1140.00000000', allocatedFee: '0.57000000', executedAt: '2026-10-08T06:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-07T22:00:00.000Z',
    closedAt: '2026-10-08T06:00:00.000Z',
  }),
  // J8 SOLUSDT futures SHORT, OPEN — the OPEN leg (5 of 15) of the flip fill 472. No stop on the flip order → R null.
  entry({
    id: J(8),
    market: 'FUTURES',
    symbol: 'SOLUSDT',
    direction: 'SHORT',
    status: 'OPEN',
    closeReason: null,
    origin: 'AUTO',
    futuresPositionId: '483',
    setup: null,
    tags: [],
    plan: NO_PLAN,
    initialStop: null,
    initialStopLocked: false,
    notes: '',
    mistakes: [],
    executionScore: null,
    openQty: '5.00000000',
    exitQty: Z,
    result: futuresResult({ direction: 'SHORT', status: 'OPEN', entryQty: '5.00000000', avgEntryPrice: '114', avgExitPrice: null, realizedPnl: null, netPnl: null, fees: '0.28500000', funding: Z, riskUsdt: null, rMultiple: null, outcome: null, holdingMs: null }),
    fills: [
      fill({ id: '7801', tradeId: '472', orderId: '8702', leg: 'OPEN', side: 'SELL', price: '114.00000000', quantity: '15.00000000', fee: '0.85500000', feeAsset: 'USDT', allocatedQty: '5.00000000', allocatedQuote: '570.00000000', allocatedFee: '0.28500000', executedAt: '2026-10-08T06:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-08T06:00:00.000Z',
    closedAt: null,
  }),
  // J9 DOGEUSDT spot with an UNATTRIBUTED part. Buy 1000 @ 0.08 = 80, fee 1 DOGE → 999. Sell 1500 @ 0.085 = 127.5, fee 0.1275:
  // 999 allocated (proceeds roundDown(127.5 × 999/1500) = 84.915, fee roundUp(0.1275 × 999/1500) = 0.084915), 501 unattributed.
  // netPnl = 84.915 − 0.084915 − 80 = 4.830085 · fees = 1 × 0.08 + 0.084915 = 0.164915 · risk = 0.004 × 1000 = 4 · R = 1.20752125
  entry({
    id: J(9),
    market: 'SPOT',
    symbol: 'DOGEUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    origin: 'AUTO',
    setup: 'Pullback',
    tags: ['range'],
    plan: { entry: '0.08000', stop: '0.07600', target: '0.08800' },
    initialStop: '0.07600',
    initialStopLocked: true,
    notes: 'Bán cả 501 DOGE có từ trước — phần đó không tính vào mục này.',
    mistakes: [],
    executionScore: 3,
    openQty: Z,
    exitQty: '999.00000000',
    result: spotResult({ status: 'CLOSED', entryQty: '1000.00000000', avgEntryPrice: '0.08', avgExitPrice: '0.085', realizedPnl: '4.83008500', netPnl: '4.83008500', fees: '0.16491500', riskUsdt: '4.00000000', rMultiple: '1.20752125', outcome: 'WIN', holdingMs: 43_200_000 }),
    fills: [
      fill({ id: '7901', tradeId: '491', orderId: '8901', leg: 'SPOT', side: 'BUY', price: '0.08000000', quantity: '1000.00000000', fee: '1.00000000', feeAsset: 'DOGE', allocatedQty: '1000.00000000', allocatedQuote: '80.00000000', allocatedFee: '1.00000000', executedAt: '2026-10-06T00:00:00.000Z' }),
      fill({ id: '7902', tradeId: '492', orderId: '8902', leg: 'SPOT', side: 'SELL', price: '0.08500000', quantity: '1500.00000000', fee: '0.12750000', feeAsset: 'USDT', allocatedQty: '999.00000000', unattributedQty: '501.00000000', allocatedQuote: '84.91500000', allocatedFee: '0.08491500', executedAt: '2026-10-06T12:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-06T00:00:00.000Z',
    closedAt: '2026-10-06T12:00:00.000Z',
  }),
  // J10 ADAUSDT spot, VOID: the account was reset while it was open (reconciliation ACCOUNT_RESET). Notes kept, never counted.
  // Buy 2000 @ 0.25 = 500, fee 2 ADA → 1998 open · risk = 0.015 × 2000 = 30 (the last result, computed while OPEN)
  entry({
    id: J(10),
    market: 'SPOT',
    symbol: 'ADAUSDT',
    direction: 'LONG',
    status: 'VOID',
    closeReason: 'ACCOUNT_RESET',
    adjustedAt: '2026-10-07T05:00:00.000Z',
    adjustmentReason: 'ACCOUNT_RESET',
    origin: 'AUTO',
    setup: 'Breakout',
    tags: [],
    plan: { entry: null, stop: '0.2350', target: null },
    initialStop: '0.2350',
    initialStopLocked: false,
    notes: 'Ghi chú này vẫn còn sau khi tài khoản bị đặt lại.',
    mistakes: [],
    executionScore: null,
    openQty: '1998.00000000',
    exitQty: Z,
    result: spotResult({ status: 'OPEN', entryQty: '2000.00000000', avgEntryPrice: '0.25', avgExitPrice: null, realizedPnl: null, netPnl: null, fees: '0.50000000', riskUsdt: '30.00000000', rMultiple: null, outcome: null, holdingMs: null }),
    fills: [
      fill({ id: '7951', tradeId: '495', orderId: '8951', leg: 'SPOT', side: 'BUY', price: '0.25000000', quantity: '2000.00000000', fee: '2.00000000', feeAsset: 'ADA', allocatedQty: '2000.00000000', allocatedQuote: '500.00000000', allocatedFee: '2.00000000', executedAt: '2026-10-06T09:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-06T09:00:00.000Z',
    closedAt: '2026-10-07T05:00:00.000Z',
  }),
  // J11 AVAXUSDT spot, needsReview (the wallet held less AVAX than the entry): CLOSED but left out of the statistics.
  // Buy 30 @ 10 = 300, fee 0.03 AVAX → 29.97. Sell 29.97 @ 10.5 = 314.685, fee 0.314685 → netPnl = 14.370315
  // fees = 0.03 × 10 + 0.314685 = 0.614685 · risk = 0.3 × 30 = 9 · R = 1.59670167
  entry({
    id: J(11),
    market: 'SPOT',
    symbol: 'AVAXUSDT',
    direction: 'LONG',
    status: 'CLOSED',
    closeReason: 'FILLS',
    needsReview: true,
    origin: 'AUTO',
    setup: 'Pullback',
    tags: ['range'],
    plan: NO_PLAN,
    initialStop: '9.700',
    initialStopLocked: true,
    notes: '',
    mistakes: [],
    executionScore: null,
    openQty: Z,
    exitQty: '29.97000000',
    result: spotResult({ status: 'CLOSED', entryQty: '30.00000000', avgEntryPrice: '10', avgExitPrice: '10.5', realizedPnl: '14.37031500', netPnl: '14.37031500', fees: '0.61468500', riskUsdt: '9.00000000', rMultiple: '1.59670167', outcome: 'WIN', holdingMs: 50_400_000 }),
    fills: [
      fill({ id: '7961', tradeId: '497', orderId: '8961', leg: 'SPOT', side: 'BUY', price: '10.00000000', quantity: '30.00000000', fee: '0.03000000', feeAsset: 'AVAX', allocatedQty: '30.00000000', allocatedQuote: '300.00000000', allocatedFee: '0.03000000', executedAt: '2026-10-08T01:00:00.000Z' }),
      fill({ id: '7962', tradeId: '498', orderId: '8962', leg: 'SPOT', side: 'SELL', price: '10.50000000', quantity: '29.97000000', fee: '0.31468500', feeAsset: 'USDT', allocatedQty: '29.97000000', allocatedQuote: '314.68500000', allocatedFee: '0.31468500', executedAt: '2026-10-08T15:00:00.000Z' }),
    ],
    attachments: [],
    openedAt: '2026-10-08T01:00:00.000Z',
    closedAt: '2026-10-08T15:00:00.000Z',
  }),
];

/**
 * The futures positions behind the fixture futures entries (not in the mock futures wallet): what futuresEntryResult
 * reads — realized PnL before fees, fees, signed funding.
 */
export const fixtureJournalPositions: Record<string, { side: 'LONG' | 'SHORT'; status: 'OPEN' | 'CLOSED'; quantity: string; realizedPnl: string; fees: string; funding: string; openedAt: string; closedAt: string | null; closeReason: string | null }> = {
  '480': { side: 'LONG', status: 'CLOSED', quantity: Z, realizedPnl: '0.80000000', fees: '0.80040000', funding: '0.00040000', openedAt: '2026-10-07T08:00:00.000Z', closedAt: '2026-10-07T10:00:00.000Z', closeReason: 'USER' },
  '481': { side: 'SHORT', status: 'CLOSED', quantity: Z, realizedPnl: '-22.00000000', fees: '2.86000000', funding: '-0.10000000', openedAt: '2026-10-05T01:00:00.000Z', closedAt: '2026-10-05T07:00:00.000Z', closeReason: 'LIQUIDATION' },
  '482': { side: 'LONG', status: 'CLOSED', quantity: Z, realizedPnl: '40.00000000', fees: '1.12000000', funding: '-0.12000000', openedAt: '2026-10-07T22:00:00.000Z', closedAt: '2026-10-08T06:00:00.000Z', closeReason: 'USER' },
  '483': { side: 'SHORT', status: 'OPEN', quantity: '5.00000000', realizedPnl: Z, fees: '0.28500000', funding: Z, openedAt: '2026-10-08T06:00:00.000Z', closedAt: null, closeReason: null },
};

/** Bytes of the fixture images (attachment id → base64). */
export const fixtureJournalImages: Record<string, string> = { [JA(1)]: FIXTURE_PNG_BASE64 };

export const fixtureJournalSetups: JournalSetupList = {
  setups: [
    { name: 'Pullback', count: 4 },
    { name: 'Breakout', count: 3 },
    { name: 'Tin tức', count: 1 },
  ],
  tags: [
    { name: 'trend', count: 3 },
    { name: 'range', count: 2 },
    { name: 'news', count: 1 },
    { name: 'scalp', count: 1 },
  ],
};

type Group = JournalStats['bySetup'][number];
const g = <K>(key: K, count: number, wins: number, losses: number, breakevens: number, winRate: string, countWithR: number, totalR: string | null, expectancyR: string | null, profitFactorR: string | null, totalNetPnl: string): Omit<Group, 'key'> & { key: K } => ({
  key,
  count,
  wins,
  losses,
  breakevens,
  winRate,
  countWithR,
  totalR,
  expectancyR,
  profitFactorR,
  totalNetPnl,
});

/**
 * Statistics of the fixture entries for range 'all' (computed by hand; equal to computeJournalStats — see the test).
 * Counted: J1 J2 J3 J5 J6 J7 J9 (CLOSED, in order of closedAt: J5 J1 J2 J6 J9 J3 J7). Excluded: J10 (VOID), J11 (needsReview).
 *   Σ R (6 with R) = 1.916042 − 1.2455772 − 1.04 + 1.20752125 + 0 + 1.292 = 2.12998605 → expectancy 0.35499768
 *   PF R = 4.41556325 / 2.2855772 = 1.93192479 · PF USDT = 113.225768 / 56.09943 = 2.01830514
 *   cumulative R from 0: 1.916042 (peak), 0.6704648, −0.3695352 (trough) … → max drawdown 2.2855772
 *   cumulative USDT: 23.650675, 69.635683 (peak), 38.496253, 13.536253 (trough) … → max drawdown 56.09943
 *   outcomes W W L L W BE W → longest win streak 2, loss streak 2 (a breakeven ends a streak)
 */
export const fixtureJournalStats: JournalStats = {
  basis: 'ACTUAL_FILLS',
  rMetricsVersion: 1,
  range: 'all',
  from: null,
  to: '2026-10-09T03:00:00.000Z',
  weekdayUtcOffsetMinutes: 420,
  excluded: { void: 1, needsReview: 1 },
  summary: {
    rMetricsVersion: 1,
    count: 7,
    countWithR: 6,
    countWithNetPnl: 7,
    wins: 4,
    losses: 2,
    breakevens: 1,
    winRate: '0.57142857',
    totalR: '2.12998605',
    expectancyR: '0.35499768',
    avgWinR: '1.47185442',
    avgLossR: '-1.14278860',
    profitFactorR: '1.93192479',
    maxDrawdownR: '2.28557720',
    totalNetPnl: '57.12633800',
    avgNetPnl: '8.16090543',
    profitFactorUsdt: '2.01830514',
    maxDrawdownUsdt: '56.09943000',
    longestWinStreak: 2,
    longestLossStreak: 2,
    rCurve: [
      { id: J(1), closedAt: '2026-10-03T09:30:00.000Z', r: '1.91604200', cumR: '1.91604200' },
      { id: J(2), closedAt: '2026-10-04T02:00:00.000Z', r: '-1.24557720', cumR: '0.67046480' },
      { id: J(6), closedAt: '2026-10-05T07:00:00.000Z', r: '-1.04000000', cumR: '-0.36953520' },
      { id: J(9), closedAt: '2026-10-06T12:00:00.000Z', r: '1.20752125', cumR: '0.83798605' },
      { id: J(3), closedAt: '2026-10-07T10:00:00.000Z', r: Z, cumR: '0.83798605' },
      { id: J(7), closedAt: '2026-10-08T06:00:00.000Z', r: '1.29200000', cumR: '2.12998605' },
    ],
    pnlCurve: [
      { id: J(5), closedAt: '2026-09-30T10:00:00.000Z', netPnl: '23.65067500', cumNetPnl: '23.65067500' },
      { id: J(1), closedAt: '2026-10-03T09:30:00.000Z', netPnl: '45.98500800', cumNetPnl: '69.63568300' },
      { id: J(2), closedAt: '2026-10-04T02:00:00.000Z', netPnl: '-31.13943000', cumNetPnl: '38.49625300' },
      { id: J(6), closedAt: '2026-10-05T07:00:00.000Z', netPnl: '-24.96000000', cumNetPnl: '13.53625300' },
      { id: J(9), closedAt: '2026-10-06T12:00:00.000Z', netPnl: '4.83008500', cumNetPnl: '18.36633800' },
      { id: J(3), closedAt: '2026-10-07T10:00:00.000Z', netPnl: Z, cumNetPnl: '18.36633800' },
      { id: J(7), closedAt: '2026-10-08T06:00:00.000Z', netPnl: '38.76000000', cumNetPnl: '57.12633800' },
    ],
  },
  // groups sorted by key (null last)
  bySetup: [
    g('Breakout', 2, 1, 1, 0, '0.50000000', 2, '0.67046480', '0.33523240', '1.53827639', '14.84557800'),
    g('Pullback', 3, 2, 0, 1, '0.66666667', 3, '2.49952125', '0.83317375', null, '43.59008500'),
    g('Tin tức', 1, 0, 1, 0, Z, 1, '-1.04000000', '-1.04000000', Z, '-24.96000000'),
    g(null, 1, 1, 0, 0, '1.00000000', 0, null, null, null, '23.65067500'),
  ],
  bySymbol: [
    g('BTCUSDT', 1, 0, 0, 1, Z, 1, Z, Z, null, Z),
    g('DOGEUSDT', 1, 1, 0, 0, '1.00000000', 1, '1.20752125', '1.20752125', null, '4.83008500'),
    g('ETHUSDT', 2, 1, 1, 0, '0.50000000', 2, '0.87604200', '0.43802100', '1.84234808', '21.02500800'),
    g('SOLUSDT', 2, 1, 1, 0, '0.50000000', 2, '0.04642280', '0.02321140', '1.03727011', '7.62057000'),
    g('XRPUSDT', 1, 1, 0, 0, '1.00000000', 0, null, null, null, '23.65067500'),
  ],
  byMarket: [
    g('FUTURES' as const, 3, 1, 1, 1, '0.33333333', 3, '0.25200000', '0.08400000', '1.24230769', '13.80000000'),
    g('SPOT' as const, 4, 3, 1, 0, '0.75000000', 3, '1.87798605', '0.62599535', '2.50772353', '43.32633800'),
  ],
  byDirection: [
    g('LONG' as const, 6, 4, 1, 1, '0.66666667', 5, '3.16998605', '0.63399721', '3.54499364', '82.08633800'),
    g('SHORT' as const, 1, 0, 1, 0, Z, 1, '-1.04000000', '-1.04000000', Z, '-24.96000000'),
  ],
  // closedAt in GMT+7: J6 Mon 10-05 · J9 Tue 10-06 · J5 Wed 09-30 + J3 Wed 10-07 · J7 Thu 10-08 · J1 Sat 10-03 · J2 Sun 10-04
  byWeekday: [
    g(1, 1, 0, 1, 0, Z, 1, '-1.04000000', '-1.04000000', Z, '-24.96000000'),
    g(2, 1, 1, 0, 0, '1.00000000', 1, '1.20752125', '1.20752125', null, '4.83008500'),
    g(3, 2, 1, 0, 1, '0.50000000', 1, Z, Z, null, '23.65067500'),
    g(4, 1, 1, 0, 0, '1.00000000', 1, '1.29200000', '1.29200000', null, '38.76000000'),
    g(6, 1, 1, 0, 0, '1.00000000', 1, '1.91604200', '1.91604200', null, '45.98500800'),
    g(7, 1, 0, 1, 0, Z, 1, '-1.24557720', '-1.24557720', Z, '-31.13943000'),
  ],
  byMistake: [
    g('EARLY_EXIT' as const, 1, 0, 0, 1, Z, 1, Z, Z, null, Z),
    g('FOMO' as const, 1, 0, 1, 0, Z, 1, '-1.24557720', '-1.24557720', Z, '-31.13943000'),
    g('MOVED_STOP' as const, 1, 0, 1, 0, Z, 1, '-1.24557720', '-1.24557720', Z, '-31.13943000'),
    g('NO_STOP' as const, 1, 1, 0, 0, '1.00000000', 0, null, null, null, '23.65067500'),
    g('OVERSIZE' as const, 1, 0, 1, 0, Z, 1, '-1.04000000', '-1.04000000', Z, '-24.96000000'),
  ],
};

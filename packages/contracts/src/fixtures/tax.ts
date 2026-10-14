/**
 * Vietnam tax fixtures (0.15.0) — UI development only. Every amount is computed by hand with the server rule
 * (tax = roundUp8(grossQuote × taxRate), grossVnd = floor, taxVnd = ceil) and checked in mocks-tax.test.ts.
 */
import type { AdminTaxWithholding, TaxSettings, Trade } from '../index.ts';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * The mock starts WITHHOLDING (the real server starts OFF) so every tax screen has something to show;
 * `adminUpdateTaxSettings` or `setMockTax({ taxMode: 'OFF' })` switches it off.
 */
export const fixtureTaxSettings: TaxSettings = {
  taxMode: 'WITHHOLD',
  taxRate: '0.001',
  taxVndRate: '26350',
  taxVndRateUpdatedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

/**
 * Two older SELL fills of the demo user (before the journal started on 2026-10-01, so the journal leaves them free).
 *  - 381 BTC: 0.004 × 61000 = 244; fee = tax = 0.244; cost 58250 → PnL 244 − 0.244 − 0.244 − 233 = 10.512
 *  - 382 ETH: 0.25 × 2450 = 612.5; fee = tax = 0.6125; cost 2380.5 → PnL 612.5 − 0.6125 − 0.6125 − 595.125 = 16.15
 */
export const fixtureTaxedTrades: Trade[] = [
  {
    id: '382',
    orderId: '82',
    symbol: 'ETHUSDT',
    side: 'SELL',
    price: '2450.00000000',
    quantity: '0.25000000',
    quoteQty: '612.50000000',
    fee: '0.61250000',
    feeAsset: 'USDT',
    tax: '0.61250000',
    liquidity: 'TAKER',
    realizedPnl: '16.15000000',
    createdAt: '2026-09-20T03:15:00.000Z',
  },
  {
    id: '381',
    orderId: '81',
    symbol: 'BTCUSDT',
    side: 'SELL',
    price: '61000.00000000',
    quantity: '0.00400000',
    quoteQty: '244.00000000',
    fee: '0.24400000',
    feeAsset: 'USDT',
    tax: '0.24400000',
    liquidity: 'MAKER',
    realizedPnl: '10.51200000',
    createdAt: '2026-08-14T09:00:00.000Z',
  },
];

/**
 * Withholding records of every user, newest first (the demo user is U(1)).
 *  - '2' (382): VND rate 26300 → grossVnd floor(612.5 × 26300 = 16108750), taxVnd ceil(0.6125 × 26300 = 16108.75) = 16109
 *  - '1' (381): no VND rate yet in August → VND null
 *  - '4' U(2) BTC 0.01 × 80000 = 800 → tax 0.8; 26350 → 21080000 / 21080
 *  - '3' U(3) FOREIGN_ORG SOL 2.5 × 150.37 = 375.925 → tax 0.375925; 26350 → floor 9905623.75 = 9905623 / ceil 9905.62375 = 9906
 */
export const fixtureTaxWithholdings: AdminTaxWithholding[] = [
  {
    id: '4',
    userId: U(2),
    tradeId: '9101',
    orderId: '9001',
    symbol: 'BTCUSDT',
    asset: 'USDT',
    quantity: '0.01000000',
    price: '80000.00000000',
    grossQuote: '800.00000000',
    taxRate: '0.001',
    taxAmount: '0.80000000',
    category: 'INDIVIDUAL',
    vndRate: '26350',
    grossVnd: '21080000',
    taxVnd: '21080',
    createdAt: '2026-10-08T10:00:00.000Z',
  },
  {
    id: '3',
    userId: U(3),
    tradeId: '9102',
    orderId: '9002',
    symbol: 'SOLUSDT',
    asset: 'USDT',
    quantity: '2.50000000',
    price: '150.37000000',
    grossQuote: '375.92500000',
    taxRate: '0.001',
    taxAmount: '0.37592500',
    category: 'FOREIGN_ORG',
    vndRate: '26350',
    grossVnd: '9905623',
    taxVnd: '9906',
    createdAt: '2026-10-07T04:30:00.000Z',
  },
  {
    id: '2',
    userId: U(1),
    tradeId: '382',
    orderId: '82',
    symbol: 'ETHUSDT',
    asset: 'USDT',
    quantity: '0.25000000',
    price: '2450.00000000',
    grossQuote: '612.50000000',
    taxRate: '0.001',
    taxAmount: '0.61250000',
    category: 'INDIVIDUAL',
    vndRate: '26300',
    grossVnd: '16108750',
    taxVnd: '16109',
    createdAt: '2026-09-20T03:15:00.000Z',
  },
  {
    id: '1',
    userId: U(1),
    tradeId: '381',
    orderId: '81',
    symbol: 'BTCUSDT',
    asset: 'USDT',
    quantity: '0.00400000',
    price: '61000.00000000',
    grossQuote: '244.00000000',
    taxRate: '0.001',
    taxAmount: '0.24400000',
    category: 'INDIVIDUAL',
    vndRate: null,
    grossVnd: null,
    taxVnd: null,
    createdAt: '2026-08-14T09:00:00.000Z',
  },
];

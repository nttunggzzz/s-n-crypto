import { z } from 'zod';
import { Empty, IsoDateTime, PaginationQuery, SymbolCode, paginated } from './common.ts';
import { Me, Preferences, UpdatePreferencesRequest } from './account.ts';
import {
  AuthUserResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  OkResponse,
  RegisterRequest,
  ResetPasswordRequest,
  SessionList,
  VerifyEmailRequest,
} from './auth.ts';
import { Candles, CandlesQuery, Depth, ExchangeInfo, LimitQuery, MarketConnection, MarketStatus, MarketTrades, Ticker } from './market.ts';
import { Balances, FaucetClaimResult, FaucetStatus, LedgerEntry, LedgerQuery } from './wallet.ts';
import { CancelAllResponse, HistoryQuery, Order, OrderList, PlaceOcoRequest, PlaceOrderRequest, PlaceOrderResponse, SymbolFilterQuery, Trade } from './orders.ts';
import { Portfolio, PortfolioHistory, PortfolioRange } from './portfolio.ts';
import { AlertListQuery, CreatePriceAlertRequest, PriceAlert } from './alerts.ts';
import { MarkReadRequest, Notification, NotificationListQuery, UnreadCount } from './notifications.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** public: anyone · user: signed-in · verified: signed-in with verified email · admin: see phase 3 */
export type AuthLevel = 'public' | 'user' | 'verified' | 'admin';

export interface EndpointDef {
  method: HttpMethod;
  path: string;
  auth: AuthLevel;
  params?: z.ZodObject;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  /** HTTP status on success (default 200). */
  status?: number;
  /** 'csv': the body is a CSV file (UTF-8 with BOM) and the client returns it as a string. */
  format?: 'json' | 'csv';
}

const ep = <const T extends EndpointDef>(d: T): T => d;

const SymbolParam = z.object({ symbol: SymbolCode });
const OrderIdParam = z.object({ orderId: z.string().min(1) });
const ListIdParam = z.object({ listId: z.string().min(1) });
const AlertIdParam = z.object({ alertId: z.string().min(1) });
const Csv = z.string();

export const HealthResponse = z.object({
  status: z.literal('ok'),
  time: IsoDateTime,
  version: z.string(),
  market: MarketConnection,
});

export const endpoints = {
  // ---- system
  health: ep({ method: 'GET', path: '/api/v1/health', auth: 'public', response: HealthResponse }),

  // ---- auth (P03)
  register: ep({ method: 'POST', path: '/api/v1/auth/register', auth: 'public', body: RegisterRequest, response: AuthUserResponse, status: 201 }),
  login: ep({ method: 'POST', path: '/api/v1/auth/login', auth: 'public', body: LoginRequest, response: AuthUserResponse }),
  logout: ep({ method: 'POST', path: '/api/v1/auth/logout', auth: 'user', body: Empty, response: OkResponse }),
  verifyEmail: ep({ method: 'POST', path: '/api/v1/auth/verify-email', auth: 'public', body: VerifyEmailRequest, response: OkResponse }),
  resendVerification: ep({ method: 'POST', path: '/api/v1/auth/resend-verification', auth: 'user', body: Empty, response: OkResponse }),
  forgotPassword: ep({ method: 'POST', path: '/api/v1/auth/forgot-password', auth: 'public', body: ForgotPasswordRequest, response: OkResponse }),
  resetPassword: ep({ method: 'POST', path: '/api/v1/auth/reset-password', auth: 'public', body: ResetPasswordRequest, response: OkResponse }),
  changePassword: ep({ method: 'POST', path: '/api/v1/auth/change-password', auth: 'user', body: ChangePasswordRequest, response: OkResponse }),
  listSessions: ep({ method: 'GET', path: '/api/v1/auth/sessions', auth: 'user', response: SessionList }),
  revokeSession: ep({ method: 'DELETE', path: '/api/v1/auth/sessions/:sessionId', auth: 'user', params: z.object({ sessionId: z.string() }), response: OkResponse }),
  me: ep({ method: 'GET', path: '/api/v1/me', auth: 'user', response: Me }),
  getPreferences: ep({ method: 'GET', path: '/api/v1/me/preferences', auth: 'user', response: Preferences }),
  updatePreferences: ep({ method: 'PATCH', path: '/api/v1/me/preferences', auth: 'user', body: UpdatePreferencesRequest, response: Preferences }),

  // ---- market data (P04)
  exchangeInfo: ep({ method: 'GET', path: '/api/v1/market/exchange-info', auth: 'public', response: ExchangeInfo }),
  tickers: ep({ method: 'GET', path: '/api/v1/market/tickers', auth: 'public', response: z.object({ items: z.array(Ticker) }) }),
  depth: ep({ method: 'GET', path: '/api/v1/market/depth/:symbol', auth: 'public', params: SymbolParam, query: LimitQuery, response: Depth }),
  marketTrades: ep({ method: 'GET', path: '/api/v1/market/trades/:symbol', auth: 'public', params: SymbolParam, query: LimitQuery, response: MarketTrades }),
  candles: ep({ method: 'GET', path: '/api/v1/market/candles/:symbol', auth: 'public', params: SymbolParam, query: CandlesQuery, response: Candles }),
  marketStatus: ep({ method: 'GET', path: '/api/v1/market/status', auth: 'public', response: MarketStatus }),

  // ---- wallet (P05)
  balances: ep({ method: 'GET', path: '/api/v1/wallet/balances', auth: 'user', response: Balances }),
  ledger: ep({ method: 'GET', path: '/api/v1/wallet/ledger', auth: 'user', query: LedgerQuery.extend(PaginationQuery.shape), response: paginated(LedgerEntry) }),
  faucetStatus: ep({ method: 'GET', path: '/api/v1/wallet/faucet', auth: 'user', response: FaucetStatus }),
  faucetClaim: ep({ method: 'POST', path: '/api/v1/wallet/faucet', auth: 'verified', body: Empty, response: FaucetClaimResult }),

  // ---- orders (P05)
  placeOrder: ep({ method: 'POST', path: '/api/v1/orders', auth: 'verified', body: PlaceOrderRequest, response: PlaceOrderResponse, status: 201 }),
  openOrders: ep({ method: 'GET', path: '/api/v1/orders/open', auth: 'user', query: SymbolFilterQuery, response: z.object({ items: z.array(Order) }) }),
  orderHistory: ep({ method: 'GET', path: '/api/v1/orders/history', auth: 'user', query: HistoryQuery.extend(PaginationQuery.shape), response: paginated(Order) }),
  getOrder: ep({ method: 'GET', path: '/api/v1/orders/:orderId', auth: 'user', params: OrderIdParam, response: Order }),
  cancelOrder: ep({ method: 'DELETE', path: '/api/v1/orders/:orderId', auth: 'user', params: OrderIdParam, response: Order }),
  cancelAllOrders: ep({ method: 'DELETE', path: '/api/v1/orders', auth: 'user', query: SymbolFilterQuery, response: CancelAllResponse }),
  myTrades: ep({ method: 'GET', path: '/api/v1/trades', auth: 'user', query: HistoryQuery.extend(PaginationQuery.shape), response: paginated(Trade) }),

  // ---- OCO order lists (P05, phase 2)
  placeOco: ep({ method: 'POST', path: '/api/v1/order-lists/oco', auth: 'verified', body: PlaceOcoRequest, response: OrderList, status: 201 }),
  openOrderLists: ep({ method: 'GET', path: '/api/v1/order-lists/open', auth: 'user', query: SymbolFilterQuery, response: z.object({ items: z.array(OrderList) }) }),
  getOrderList: ep({ method: 'GET', path: '/api/v1/order-lists/:listId', auth: 'user', params: ListIdParam, response: OrderList }),
  /** Cancels both legs. Canceling one leg with cancelOrder also cancels the whole list. */
  cancelOrderList: ep({ method: 'DELETE', path: '/api/v1/order-lists/:listId', auth: 'user', params: ListIdParam, response: OrderList }),

  // ---- portfolio (P05, phase 2)
  portfolio: ep({ method: 'GET', path: '/api/v1/portfolio', auth: 'user', response: Portfolio }),
  portfolioHistory: ep({ method: 'GET', path: '/api/v1/portfolio/history', auth: 'user', query: z.object({ range: PortfolioRange.default('7d') }), response: PortfolioHistory }),

  // ---- CSV exports (max 10,000 rows, newest first; times in UTC and GMT+7)
  exportOrders: ep({ method: 'GET', path: '/api/v1/export/orders.csv', auth: 'user', query: HistoryQuery, response: Csv, format: 'csv' }),
  exportTrades: ep({ method: 'GET', path: '/api/v1/export/trades.csv', auth: 'user', query: HistoryQuery, response: Csv, format: 'csv' }),
  exportLedger: ep({ method: 'GET', path: '/api/v1/export/ledger.csv', auth: 'user', query: LedgerQuery, response: Csv, format: 'csv' }),

  // ---- price alerts
  listAlerts: ep({ method: 'GET', path: '/api/v1/alerts', auth: 'user', query: AlertListQuery, response: z.object({ items: z.array(PriceAlert) }) }),
  createAlert: ep({ method: 'POST', path: '/api/v1/alerts', auth: 'user', body: CreatePriceAlertRequest, response: PriceAlert, status: 201 }),
  deleteAlert: ep({ method: 'DELETE', path: '/api/v1/alerts/:alertId', auth: 'user', params: AlertIdParam, response: PriceAlert }),

  // ---- in-app notifications
  listNotifications: ep({ method: 'GET', path: '/api/v1/notifications', auth: 'user', query: NotificationListQuery.extend(PaginationQuery.shape), response: paginated(Notification) }),
  unreadNotifications: ep({ method: 'GET', path: '/api/v1/notifications/unread-count', auth: 'user', response: UnreadCount }),
  markNotificationsRead: ep({ method: 'POST', path: '/api/v1/notifications/read', auth: 'user', body: MarkReadRequest, response: UnreadCount }),
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type Infer<T> = T extends z.ZodType ? z.input<T> : never;
type OptionalIfEmpty<K extends string, T> = [T] extends [never] ? {} : {} extends T ? { [P in K]?: T } : { [P in K]: T };

/** Input accepted by the client for an endpoint: { params?, query?, body? }. */
export type EndpointInput<N extends EndpointName> = OptionalIfEmpty<'params', Infer<Endpoints[N] extends { params: infer P } ? P : never>> &
  OptionalIfEmpty<'query', Infer<Endpoints[N] extends { query: infer Q } ? Q : never>> &
  OptionalIfEmpty<'body', Infer<Endpoints[N] extends { body: infer B } ? B : never>>;

export type EndpointOutput<N extends EndpointName> = z.output<Endpoints[N]['response']>;

/** Fills `/orders/:orderId` with params. */
export function buildPath(path: string, params?: Record<string, string>): string {
  return path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params?.[k];
    if (v === undefined) throw new Error(`missing path param ${k}`);
    return encodeURIComponent(v);
  });
}

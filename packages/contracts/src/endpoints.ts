import { z } from 'zod';
import { AdminInviteListQuery, CreatedInvite, CreateInviteRequest, Invite, InviteIdParam, PublicConfig } from './invites.ts';
import { Empty, IsoDateTime, PaginationQuery, SymbolCode, paginated } from './common.ts';
import { Me, Preferences, UpdatePreferencesRequest } from './account.ts';
import { AccountTradingStats } from './accountStats.ts';
import { LoginEvent, SecurityOverview, SetAntiPhishingRequest, UpdateProfileRequest } from './security.ts';
import { PnlAnalysis, PnlQuery } from './analytics.ts';
import { CreateDcaPlanRequest, DcaPlan, DcaPlanIdParam, DcaRun, GridBot, GridBotIdParam, GridBotParams, GridPreview, StopGridBotRequest, UpdateDcaPlanRequest } from './bots.ts';
import {
  AuthUserResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  LoginTwoFactorRequest,
  OkResponse,
  RecoveryCodes,
  RegenerateRecoveryCodesRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SessionList,
  TwoFactorDisableRequest,
  TwoFactorEnableRequest,
  TwoFactorSetup,
  TwoFactorSetupRequest,
  VerifyEmailRequest,
} from './auth.ts';
import {
  AdminAnnouncement,
  AdminAnnouncementListQuery,
  Announcement,
  AnnouncementIdParam,
  AnnouncementListQuery,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
} from './announcements.ts';
import {
  AdminCancelOrderRequest,
  AdminCancelOrderResult,
  AdminCancelOrdersRequest,
  AdminCancelOrdersResult,
  AdminOverview,
  AdminRevokeSessionsResult,
  AdminStopGridBotRequest,
  AdminSymbol,
  AdminUserBots,
  AdminUserDetail,
  AdminUserListQuery,
  AdminUserOrdersQuery,
  AdminUserPositionsQuery,
  AdminUserSummary,
  AssetParam,
  AuditLogEntry,
  AuditLogQuery,
  BalanceAdjustmentRequest,
  BalanceAdjustmentResult,
  ExchangeSettings,
  HaltRequest,
  ReasonBody,
  ReconciliationRun,
  ResetAccountRequest,
  ResumeRequest,
  SetRoleRequest,
  SignalsAccessRequest,
  SymbolParam as AdminSymbolParam,
  UpdateAssetRequest,
  UpdateSettingsRequest,
  UpdateSymbolRequest,
  UserBotParam,
  UserDcaParam,
  UserIdParam,
  UserOrderParam,
  UserSessionParam,
} from './admin.ts';
import type { Permission } from './permissions.ts';
import { AssetInfo, Candles, CandlesQuery, Depth, DepthQuery, ExchangeInfo, LimitQuery, MarketConnection, MarketStatus, MarketTrades, Sparklines, SparklinesQuery, Ticker } from './market.ts';
import { Balances, FaucetClaimResult, FaucetStatus, LedgerEntry, LedgerQuery } from './wallet.ts';
import { CancelAllResponse, HistoryQuery, Order, OrderList, PlaceOcoRequest, PlaceOrderRequest, PlaceOrderResponse, SymbolFilterQuery, Trade } from './orders.ts';
import { Portfolio, PortfolioHistory, PortfolioRange } from './portfolio.ts';
import { AlertListQuery, CreatePriceAlertRequest, PriceAlert } from './alerts.ts';
import { MarkReadRequest, Notification, NotificationListQuery, UnreadCount } from './notifications.ts';
import {
  AdjustMarginRequest,
  AdminFuturesSymbol,
  ClosePositionRequest,
  FundingEvent,
  FundingHistoryQuery,
  FuturesAccount,
  FuturesCancelAllResponse,
  FuturesCandlesQuery,
  FuturesExchangeInfo,
  FuturesHistoryQuery,
  FuturesLedgerQuery,
  FuturesOrder,
  FuturesPlaceOrderRequest,
  FuturesPosition,
  FuturesSymbolFilterQuery,
  FuturesSymbolSettings,
  FuturesTicker,
  FuturesTrade,
  FuturesTransferRequest,
  FuturesTransferResult,
  MarkPrice,
  PositionSymbolParam,
  SetLeverageRequest,
  SetPositionTpSlRequest,
  UpdateFuturesSymbolRequest,
} from './futures.ts';
import {
  JournalAttachment,
  JournalAttachmentFile,
  JournalAttachmentIdParam,
  JournalAttachmentUpload,
  JournalCreateRequest,
  JournalEntry,
  JournalEntryDetail,
  JournalEntryIdParam,
  JournalListQuery,
  JournalSettings,
  JournalSetupList,
  JournalStats,
  JournalStatsQuery,
  JournalUpdateRequest,
  JournalUpdateSettingsRequest,
} from './journal.ts';
import {
  AdminTaxSummary,
  AdminTaxSummaryQuery,
  AdminTaxWithholding,
  AdminTaxWithholdingListQuery,
  AdminTaxWithholdingQuery,
  TaxProfile,
  TaxSettings,
  TaxSummary,
  TaxSummaryQuery,
  TaxWithholding,
  TaxWithholdingListQuery,
  TaxWithholdingQuery,
  UpdateTaxProfileRequest,
  UpdateTaxSettingsRequest,
} from './tax.ts';
import { AdminNewsItemsQuery, AdminNewsMacroEvents, AdminNewsMacroEventsQuery, AdminNewsSources, NewsItemAdmin } from './news.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/**
 * public: anyone · user: signed-in · verified: signed-in with verified email ·
 * staff: support/admin/owner with 2FA, signed in with 2FA, holding `permission`.
 */
export type AuthLevel = 'public' | 'user' | 'verified' | 'staff';

export interface EndpointDef {
  method: HttpMethod;
  path: string;
  auth: AuthLevel;
  /** Required for auth 'staff'. */
  permission?: Permission;
  params?: z.ZodObject;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  /** HTTP status on success (default 200). */
  status?: number;
  /**
   * 'csv': the body is a CSV file (UTF-8 with BOM) and the client returns it as a string.
   * 'binary' (0.14.0): raw bytes with their own Content-Type (`BinaryFile`), not validated against a schema;
   * the typed client has no method for it — load it by URL (e.g. `journalAttachmentUrl`).
   */
  format?: 'json' | 'csv' | 'binary';
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
  /** Server settings the apps need before sign-in: registration mode (invite code field), captcha site key, simulated prices. */
  publicConfig: ep({ method: 'GET', path: '/api/v1/config', auth: 'public', response: PublicConfig }),

  // ---- auth (P03)
  register: ep({ method: 'POST', path: '/api/v1/auth/register', auth: 'public', body: RegisterRequest, response: AuthUserResponse, status: 201 }),
  login: ep({ method: 'POST', path: '/api/v1/auth/login', auth: 'public', body: LoginRequest, response: LoginResponse }),
  /** Second login step for accounts with 2FA; sets the session cookie. */
  loginTwoFactor: ep({ method: 'POST', path: '/api/v1/auth/login/2fa', auth: 'public', body: LoginTwoFactorRequest, response: AuthUserResponse }),
  logout: ep({ method: 'POST', path: '/api/v1/auth/logout', auth: 'user', body: Empty, response: OkResponse }),
  verifyEmail: ep({ method: 'POST', path: '/api/v1/auth/verify-email', auth: 'public', body: VerifyEmailRequest, response: OkResponse }),
  resendVerification: ep({ method: 'POST', path: '/api/v1/auth/resend-verification', auth: 'user', body: Empty, response: OkResponse }),
  forgotPassword: ep({ method: 'POST', path: '/api/v1/auth/forgot-password', auth: 'public', body: ForgotPasswordRequest, response: OkResponse }),
  resetPassword: ep({ method: 'POST', path: '/api/v1/auth/reset-password', auth: 'public', body: ResetPasswordRequest, response: OkResponse }),
  changePassword: ep({ method: 'POST', path: '/api/v1/auth/change-password', auth: 'user', body: ChangePasswordRequest, response: OkResponse }),
  listSessions: ep({ method: 'GET', path: '/api/v1/auth/sessions', auth: 'user', response: SessionList }),
  revokeSession: ep({ method: 'DELETE', path: '/api/v1/auth/sessions/:sessionId', auth: 'user', params: z.object({ sessionId: z.string() }), response: OkResponse }),
  me: ep({ method: 'GET', path: '/api/v1/me', auth: 'user', response: Me }),
  setupTwoFactor: ep({ method: 'POST', path: '/api/v1/auth/2fa/setup', auth: 'user', body: TwoFactorSetupRequest, response: TwoFactorSetup }),
  enableTwoFactor: ep({ method: 'POST', path: '/api/v1/auth/2fa/enable', auth: 'user', body: TwoFactorEnableRequest, response: RecoveryCodes }),
  disableTwoFactor: ep({ method: 'POST', path: '/api/v1/auth/2fa/disable', auth: 'user', body: TwoFactorDisableRequest, response: OkResponse }),
  regenerateRecoveryCodes: ep({ method: 'POST', path: '/api/v1/auth/2fa/recovery-codes', auth: 'user', body: RegenerateRecoveryCodesRequest, response: RecoveryCodes }),
  getPreferences: ep({ method: 'GET', path: '/api/v1/me/preferences', auth: 'user', response: Preferences }),
  updatePreferences: ep({ method: 'PATCH', path: '/api/v1/me/preferences', auth: 'user', body: UpdatePreferencesRequest, response: Preferences }),
  // phase 2.6: profile + security
  updateProfile: ep({ method: 'PATCH', path: '/api/v1/me/profile', auth: 'user', body: UpdateProfileRequest, response: Me }),
  securityOverview: ep({ method: 'GET', path: '/api/v1/me/security', auth: 'user', response: SecurityOverview }),
  setAntiPhishingCode: ep({ method: 'PUT', path: '/api/v1/me/security/anti-phishing', auth: 'user', body: SetAntiPhishingRequest, response: SecurityOverview }),
  loginHistory: ep({ method: 'GET', path: '/api/v1/me/security/login-history', auth: 'user', query: PaginationQuery, response: paginated(LoginEvent) }),

  // ---- market data (P04)
  exchangeInfo: ep({ method: 'GET', path: '/api/v1/market/exchange-info', auth: 'public', response: ExchangeInfo }),
  tickers: ep({ method: 'GET', path: '/api/v1/market/tickers', auth: 'public', response: z.object({ items: z.array(Ticker) }) }),
  /** limit 1–500; > 20 adds snapshot levels below the live top 20 (see Depth). */
  depth: ep({ method: 'GET', path: '/api/v1/market/depth/:symbol', auth: 'public', params: SymbolParam, query: DepthQuery, response: Depth }),
  marketTrades: ep({ method: 'GET', path: '/api/v1/market/trades/:symbol', auth: 'public', params: SymbolParam, query: LimitQuery, response: MarketTrades }),
  candles: ep({ method: 'GET', path: '/api/v1/market/candles/:symbol', auth: 'public', params: SymbolParam, query: CandlesQuery, response: Candles }),
  marketStatus: ep({ method: 'GET', path: '/api/v1/market/status', auth: 'public', response: MarketStatus }),
  /** Every symbol's mini chart (cached ~60 s on the server). */
  sparklines: ep({ method: 'GET', path: '/api/v1/market/sparklines', auth: 'public', query: SparklinesQuery, response: Sparklines }),

  // ---- exchange announcements (phase 2.5)
  announcements: ep({ method: 'GET', path: '/api/v1/announcements', auth: 'public', query: AnnouncementListQuery, response: z.object({ items: z.array(Announcement) }) }),

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
  /** Realized PnL analysis: spot + futures, daily calendar, win rate, by symbol (phase 2.6). */
  pnlAnalysis: ep({ method: 'GET', path: '/api/v1/portfolio/pnl', auth: 'user', query: PnlQuery, response: PnlAnalysis }),

  // ---- bots (phase 2.6) — spot wallet
  dcaPlans: ep({ method: 'GET', path: '/api/v1/bots/dca', auth: 'user', response: z.object({ items: z.array(DcaPlan) }) }),
  createDcaPlan: ep({ method: 'POST', path: '/api/v1/bots/dca', auth: 'verified', body: CreateDcaPlanRequest, response: DcaPlan, status: 201 }),
  updateDcaPlan: ep({ method: 'PATCH', path: '/api/v1/bots/dca/:planId', auth: 'verified', params: DcaPlanIdParam, body: UpdateDcaPlanRequest, response: DcaPlan }),
  cancelDcaPlan: ep({ method: 'DELETE', path: '/api/v1/bots/dca/:planId', auth: 'user', params: DcaPlanIdParam, response: DcaPlan }),
  dcaRuns: ep({ method: 'GET', path: '/api/v1/bots/dca/:planId/runs', auth: 'user', params: DcaPlanIdParam, query: PaginationQuery, response: paginated(DcaRun) }),
  gridBotPreview: ep({ method: 'POST', path: '/api/v1/bots/grid/preview', auth: 'user', body: GridBotParams, response: GridPreview }),
  gridBots: ep({ method: 'GET', path: '/api/v1/bots/grid', auth: 'user', response: z.object({ items: z.array(GridBot) }) }),
  createGridBot: ep({ method: 'POST', path: '/api/v1/bots/grid', auth: 'verified', body: GridBotParams, response: GridBot, status: 201 }),
  getGridBot: ep({ method: 'GET', path: '/api/v1/bots/grid/:botId', auth: 'user', params: GridBotIdParam, response: GridBot }),
  stopGridBot: ep({ method: 'POST', path: '/api/v1/bots/grid/:botId/stop', auth: 'user', params: GridBotIdParam, body: StopGridBotRequest, response: GridBot }),
  /** The bot's open orders and its most recent finished ones (newest first, ≤ 100). */
  gridBotOrders: ep({ method: 'GET', path: '/api/v1/bots/grid/:botId/orders', auth: 'user', params: GridBotIdParam, response: z.object({ items: z.array(Order) }) }),

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

  // ---- profile numbers (0.20.0) — the user's own data only; see accountStats.ts
  /** Own trading volume (today / 7d / 30d / this month / previous month, GMT+7, USDT) + tax already withheld this and last month. */
  accountTradingStats: ep({ method: 'GET', path: '/api/v1/account/stats', auth: 'user', response: AccountTradingStats }),

  // ---- Vietnam tax (0.15.0, test exchange) — the user's own data only; see tax.ts
  /** Self-declared category (default INDIVIDUAL). No identity document. */
  taxProfile: ep({ method: 'GET', path: '/api/v1/account/tax/profile', auth: 'user', response: TaxProfile }),
  /** Only { category }; applies to fills from now on. */
  taxUpdateProfile: ep({ method: 'PUT', path: '/api/v1/account/tax/profile', auth: 'user', body: UpdateTaxProfileRequest, response: TaxProfile }),
  /** Year totals + 12 months (UTC+7): sales, withholdings, VND (null without a rate). */
  taxSummary: ep({ method: 'GET', path: '/api/v1/account/tax/summary', auth: 'user', query: TaxSummaryQuery, response: TaxSummary }),
  /** The user's withholding records, newest first. */
  taxWithholdings: ep({ method: 'GET', path: '/api/v1/account/tax/withholdings', auth: 'user', query: TaxWithholdingListQuery, response: paginated(TaxWithholding) }),
  /** "Bảng tổng hợp thuế đã khấu trừ (thử nghiệm)" CSV (TAX_EXPORT_COLUMNS), ≤ 10,000 rows newest first. Not a tax document. */
  taxExport: ep({ method: 'GET', path: '/api/v1/account/tax/export.csv', auth: 'user', query: TaxWithholdingQuery, response: Csv, format: 'csv' }),

  // ---- admin (P03/P05, phase 3) — staff + 2FA + permission; every change writes the audit log
  adminOverview: ep({ method: 'GET', path: '/api/v1/admin/overview', auth: 'staff', permission: 'exchange.read', response: AdminOverview }),
  adminListUsers: ep({ method: 'GET', path: '/api/v1/admin/users', auth: 'staff', permission: 'users.read', query: AdminUserListQuery.extend(PaginationQuery.shape), response: paginated(AdminUserSummary) }),
  adminGetUser: ep({ method: 'GET', path: '/api/v1/admin/users/:userId', auth: 'staff', permission: 'users.read', params: UserIdParam, response: AdminUserDetail }),
  adminUserOrders: ep({ method: 'GET', path: '/api/v1/admin/users/:userId/orders', auth: 'staff', permission: 'users.read', params: UserIdParam, query: AdminUserOrdersQuery.extend(PaginationQuery.shape), response: paginated(Order) }),
  adminUserLedger: ep({ method: 'GET', path: '/api/v1/admin/users/:userId/ledger', auth: 'staff', permission: 'users.read', params: UserIdParam, query: LedgerQuery.extend(PaginationQuery.shape), response: paginated(LedgerEntry) }),
  /** Locking signs the user out everywhere; their open orders stay. */
  adminLockUser: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/lock', auth: 'staff', permission: 'users.lock', params: UserIdParam, body: ReasonBody, response: AdminUserSummary }),
  adminUnlockUser: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/unlock', auth: 'staff', permission: 'users.lock', params: UserIdParam, body: ReasonBody, response: AdminUserSummary }),
  adminSetSignalsAccess: ep({ method: 'PUT', path: '/api/v1/admin/users/:userId/signals-access', auth: 'staff', permission: 'users.signals', params: UserIdParam, body: SignalsAccessRequest, response: AdminUserSummary }),
  adminSetRole: ep({ method: 'PUT', path: '/api/v1/admin/users/:userId/role', auth: 'staff', permission: 'users.roles', params: UserIdParam, body: SetRoleRequest, response: AdminUserSummary }),
  adminAdjustBalance: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/balance-adjustments', auth: 'staff', permission: 'balances.adjust', params: UserIdParam, body: BalanceAdjustmentRequest, response: BalanceAdjustmentResult, status: 201 }),
  // AD3: admin actions on orders and sessions (audited in the same transaction; no action on an equal/higher role, none on the bot account)
  /** Cancels one open order (Spot: its whole OCO list; a grid bot's order also stops that bot). closeReason ADMIN. Already closed → ORDER_NOT_CANCELABLE; not the user's → NOT_FOUND. */
  adminCancelUserOrder: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/orders/:orderId/cancel', auth: 'staff', permission: 'orders.manage', params: UserOrderParam, body: AdminCancelOrderRequest, response: AdminCancelOrderResult }),
  /** Cancels every open order of the user in scope (market / symbol); one audit row per book. Nothing open → zero counts. */
  adminCancelUserOrders: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/orders/cancel-all', auth: 'staff', permission: 'orders.manage', params: UserIdParam, body: AdminCancelOrdersRequest, response: AdminCancelOrdersResult }),
  /** Signs out one session of the user (not theirs → NOT_FOUND) and closes its /ws connection with code 4401. */
  adminRevokeSession: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/sessions/:sessionId/revoke', auth: 'staff', permission: 'users.lock', params: UserSessionParam, body: ReasonBody, response: AdminRevokeSessionsResult }),
  /** Signs out every session of the user. Not allowed on your own account. */
  adminRevokeAllSessions: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/sessions/revoke-all', auth: 'staff', permission: 'users.lock', params: UserIdParam, body: ReasonBody, response: AdminRevokeSessionsResult }),
  adminResetAccount: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/reset', auth: 'staff', permission: 'accounts.reset', params: UserIdParam, body: ResetAccountRequest, response: AdminUserDetail }),
  adminGetSettings: ep({ method: 'GET', path: '/api/v1/admin/exchange/settings', auth: 'staff', permission: 'exchange.read', response: ExchangeSettings }),
  adminUpdateSettings: ep({ method: 'PATCH', path: '/api/v1/admin/exchange/settings', auth: 'staff', permission: 'exchange.configure', body: UpdateSettingsRequest, response: ExchangeSettings }),
  adminHaltTrading: ep({ method: 'POST', path: '/api/v1/admin/exchange/halt', auth: 'staff', permission: 'exchange.halt', body: HaltRequest, response: ExchangeSettings }),
  adminResumeTrading: ep({ method: 'POST', path: '/api/v1/admin/exchange/resume', auth: 'staff', permission: 'exchange.halt', body: ResumeRequest, response: ExchangeSettings }),
  adminListSymbols: ep({ method: 'GET', path: '/api/v1/admin/symbols', auth: 'staff', permission: 'exchange.read', response: z.object({ items: z.array(AdminSymbol) }) }),
  adminUpdateSymbol: ep({ method: 'PATCH', path: '/api/v1/admin/symbols/:symbol', auth: 'staff', permission: 'exchange.configure', params: AdminSymbolParam, body: UpdateSymbolRequest, response: AdminSymbol }),
  adminAuditLogs: ep({ method: 'GET', path: '/api/v1/admin/audit-logs', auth: 'staff', permission: 'audit.read', query: AuditLogQuery.extend(PaginationQuery.shape), response: paginated(AuditLogEntry) }),
  adminReconciliationRuns: ep({ method: 'GET', path: '/api/v1/admin/reconciliation', auth: 'staff', permission: 'reconciliation.read', query: PaginationQuery, response: paginated(ReconciliationRun) }),
  adminRunReconciliation: ep({ method: 'POST', path: '/api/v1/admin/reconciliation/run', auth: 'staff', permission: 'reconciliation.run', body: Empty, response: ReconciliationRun }),
  // phase 2.5: coin info + announcements
  adminUpdateAsset: ep({ method: 'PATCH', path: '/api/v1/admin/assets/:asset', auth: 'staff', permission: 'exchange.configure', params: AssetParam, body: UpdateAssetRequest, response: AssetInfo }),
  adminListAnnouncements: ep({ method: 'GET', path: '/api/v1/admin/announcements', auth: 'staff', permission: 'exchange.read', query: AdminAnnouncementListQuery.extend(PaginationQuery.shape), response: paginated(AdminAnnouncement) }),
  adminCreateAnnouncement: ep({ method: 'POST', path: '/api/v1/admin/announcements', auth: 'staff', permission: 'content.manage', body: CreateAnnouncementRequest, response: AdminAnnouncement, status: 201 }),
  adminUpdateAnnouncement: ep({ method: 'PATCH', path: '/api/v1/admin/announcements/:announcementId', auth: 'staff', permission: 'content.manage', params: AnnouncementIdParam, body: UpdateAnnouncementRequest, response: AdminAnnouncement }),
  // closed staging (0.10.0): sign-up invite codes
  adminListInvites: ep({ method: 'GET', path: '/api/v1/admin/invites', auth: 'staff', permission: 'users.invite', query: AdminInviteListQuery.extend(PaginationQuery.shape), response: paginated(Invite) }),
  /** The code is in this response only (the server keeps a hash). */
  adminCreateInvite: ep({ method: 'POST', path: '/api/v1/admin/invites', auth: 'staff', permission: 'users.invite', body: CreateInviteRequest, response: CreatedInvite, status: 201 }),
  adminRevokeInvite: ep({ method: 'POST', path: '/api/v1/admin/invites/:inviteId/revoke', auth: 'staff', permission: 'users.invite', params: InviteIdParam, body: ReasonBody, response: Invite }),
  // phase F: futures contracts
  adminFuturesSymbols: ep({ method: 'GET', path: '/api/v1/admin/futures/symbols', auth: 'staff', permission: 'exchange.read', response: z.object({ items: z.array(AdminFuturesSymbol) }) }),
  adminUpdateFuturesSymbol: ep({ method: 'PATCH', path: '/api/v1/admin/futures/symbols/:symbol', auth: 'staff', permission: 'exchange.configure', params: SymbolParam, body: UpdateFuturesSymbolRequest, response: AdminFuturesSymbol }),
  // phase 2.6 for support: a user's futures positions, bots and sign-ins; stop a bot (audited)
  adminUserFuturesPositions: ep({ method: 'GET', path: '/api/v1/admin/users/:userId/futures/positions', auth: 'staff', permission: 'users.read', params: UserIdParam, query: AdminUserPositionsQuery.extend(PaginationQuery.shape), response: paginated(FuturesPosition) }),
  adminUserBots: ep({ method: 'GET', path: '/api/v1/admin/users/:userId/bots', auth: 'staff', permission: 'users.read', params: UserIdParam, response: AdminUserBots }),
  adminStopGridBot: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/bots/grid/:botId/stop', auth: 'staff', permission: 'bots.manage', params: UserBotParam, body: AdminStopGridBotRequest, response: GridBot }),
  adminCancelDcaPlan: ep({ method: 'POST', path: '/api/v1/admin/users/:userId/bots/dca/:planId/cancel', auth: 'staff', permission: 'bots.manage', params: UserDcaParam, body: ReasonBody, response: DcaPlan }),
  adminUserLoginHistory: ep({ method: 'GET', path: '/api/v1/admin/users/:userId/login-history', auth: 'staff', permission: 'users.read', params: UserIdParam, query: PaginationQuery, response: paginated(LoginEvent) }),
  // Vietnam tax (0.15.0, test exchange) — see tax.ts
  adminTaxSettings: ep({ method: 'GET', path: '/api/v1/admin/tax/settings', auth: 'staff', permission: 'tax.read', response: TaxSettings }),
  /** taxMode / taxRate (0 < r ≤ 0.01) / taxVndRate (> 0, null clears); audited TAX_SETTINGS_UPDATE in the same transaction. */
  adminUpdateTaxSettings: ep({ method: 'PATCH', path: '/api/v1/admin/tax/settings', auth: 'staff', permission: 'tax.manage', body: UpdateTaxSettingsRequest, response: TaxSettings }),
  /** Totals of a month (YYYY-MM) or quarter (YYYY-Qn), UTC+7: overall, by category, by pair. */
  adminTaxSummary: ep({ method: 'GET', path: '/api/v1/admin/tax/summary', auth: 'staff', permission: 'tax.read', query: AdminTaxSummaryQuery, response: AdminTaxSummary }),
  /** Every user's withholding records, newest first; filter userId / symbol / from / to. */
  adminTaxWithholdings: ep({ method: 'GET', path: '/api/v1/admin/tax/withholdings', auth: 'staff', permission: 'tax.read', query: AdminTaxWithholdingListQuery, response: paginated(AdminTaxWithholding) }),
  /** Statement CSV (ADMIN_TAX_EXPORT_COLUMNS), same filters, ≤ 10,000 rows newest first. */
  adminTaxExport: ep({ method: 'GET', path: '/api/v1/admin/tax/export.csv', auth: 'staff', permission: 'tax.read', query: AdminTaxWithholdingQuery, response: Csv, format: 'csv' }),

  // Module N (0.17.0) — news layer of the analysis system, admin only (C-D1); see news.ts
  /** Stored news items, newest firstSeenAt first; filter symbol / eventType / sourceId / from / to (on firstSeenAt); order (firstSeenAt, id) DESC, opaque cursor. */
  adminNewsItems: ep({ method: 'GET', path: '/api/v1/admin/news/items', auth: 'staff', permission: 'news.view', query: AdminNewsItemsQuery, response: paginated(NewsItemAdmin) }),
  /** Health of every ingestion source (LIVE / STALE / UNAVAILABLE, lag, failures). */
  adminNewsSources: ep({ method: 'GET', path: '/api/v1/admin/news/sources', auth: 'staff', permission: 'news.view', response: AdminNewsSources }),
  /** Scheduled macro events, scheduledAt ascending; filter code / importance / from / to (window <= 400 days). For "upcoming events" screens. */
  adminNewsMacroEvents: ep({ method: 'GET', path: '/api/v1/admin/news/macro-events', auth: 'staff', permission: 'news.view', query: AdminNewsMacroEventsQuery, response: AdminNewsMacroEvents }),

  // ---- futures (phase F) — simulated USDT-M perpetuals, isolated margin, ≤ 20×
  futuresExchangeInfo: ep({ method: 'GET', path: '/api/v1/futures/exchange-info', auth: 'public', response: FuturesExchangeInfo }),
  futuresTickers: ep({ method: 'GET', path: '/api/v1/futures/market/tickers', auth: 'public', response: z.object({ items: z.array(FuturesTicker) }) }),
  futuresMarkPrice: ep({ method: 'GET', path: '/api/v1/futures/market/mark/:symbol', auth: 'public', params: SymbolParam, response: MarkPrice }),
  futuresDepth: ep({ method: 'GET', path: '/api/v1/futures/market/depth/:symbol', auth: 'public', params: SymbolParam, query: LimitQuery, response: Depth }),
  futuresMarketTrades: ep({ method: 'GET', path: '/api/v1/futures/market/trades/:symbol', auth: 'public', params: SymbolParam, query: LimitQuery, response: MarketTrades }),
  futuresCandles: ep({ method: 'GET', path: '/api/v1/futures/market/candles/:symbol', auth: 'public', params: SymbolParam, query: FuturesCandlesQuery, response: Candles }),
  /** Funding settlements recorded by this exchange (newest first). */
  futuresFundingHistory: ep({ method: 'GET', path: '/api/v1/futures/market/funding/:symbol', auth: 'public', params: SymbolParam, query: FundingHistoryQuery, response: z.object({ items: z.array(FundingEvent) }) }),
  futuresMarketStatus: ep({ method: 'GET', path: '/api/v1/futures/market/status', auth: 'public', response: MarketStatus }),

  futuresAccount: ep({ method: 'GET', path: '/api/v1/futures/account', auth: 'user', response: FuturesAccount }),
  futuresTransfer: ep({ method: 'POST', path: '/api/v1/futures/transfer', auth: 'verified', body: FuturesTransferRequest, response: FuturesTransferResult }),
  futuresLedger: ep({ method: 'GET', path: '/api/v1/futures/ledger', auth: 'user', query: FuturesLedgerQuery.extend(PaginationQuery.shape), response: paginated(LedgerEntry) }),
  /** Every futures symbol with the user's leverage (default 10×) and margin mode. */
  futuresSymbolSettings: ep({ method: 'GET', path: '/api/v1/futures/settings', auth: 'user', response: z.object({ items: z.array(FuturesSymbolSettings) }) }),
  futuresSetLeverage: ep({ method: 'PUT', path: '/api/v1/futures/settings/:symbol/leverage', auth: 'verified', params: SymbolParam, body: SetLeverageRequest, response: FuturesSymbolSettings }),

  futuresPlaceOrder: ep({ method: 'POST', path: '/api/v1/futures/orders', auth: 'verified', body: FuturesPlaceOrderRequest, response: FuturesOrder, status: 201 }),
  futuresOpenOrders: ep({ method: 'GET', path: '/api/v1/futures/orders/open', auth: 'user', query: FuturesSymbolFilterQuery, response: z.object({ items: z.array(FuturesOrder) }) }),
  futuresOrderHistory: ep({ method: 'GET', path: '/api/v1/futures/orders/history', auth: 'user', query: FuturesHistoryQuery.extend(PaginationQuery.shape), response: paginated(FuturesOrder) }),
  futuresCancelOrder: ep({ method: 'DELETE', path: '/api/v1/futures/orders/:orderId', auth: 'user', params: OrderIdParam, response: FuturesOrder }),
  futuresCancelAll: ep({ method: 'DELETE', path: '/api/v1/futures/orders', auth: 'user', query: FuturesSymbolFilterQuery, response: FuturesCancelAllResponse }),
  futuresMyTrades: ep({ method: 'GET', path: '/api/v1/futures/trades', auth: 'user', query: FuturesHistoryQuery.extend(PaginationQuery.shape), response: paginated(FuturesTrade) }),

  futuresPositions: ep({ method: 'GET', path: '/api/v1/futures/positions', auth: 'user', response: z.object({ items: z.array(FuturesPosition) }) }),
  futuresPositionHistory: ep({ method: 'GET', path: '/api/v1/futures/positions/history', auth: 'user', query: FuturesHistoryQuery.extend(PaginationQuery.shape), response: paginated(FuturesPosition) }),
  /** Market close (all, or `quantity`). Returns the closing order. */
  // Market close; when the visible book is thinner than the position it fills what it holds and returns status EXPIRED (executedQty < quantity)
  futuresClosePosition: ep({ method: 'POST', path: '/api/v1/futures/positions/:symbol/close', auth: 'verified', params: PositionSymbolParam, body: ClosePositionRequest, response: FuturesOrder }),
  futuresAdjustMargin: ep({ method: 'POST', path: '/api/v1/futures/positions/:symbol/margin', auth: 'verified', params: PositionSymbolParam, body: AdjustMarginRequest, response: FuturesPosition }),
  futuresSetTpSl: ep({ method: 'PUT', path: '/api/v1/futures/positions/:symbol/tpsl', auth: 'verified', params: PositionSymbolParam, body: SetPositionTpSlRequest, response: FuturesPosition }),

  // ---- trading journal (phase 5, 0.14.0) — the user's own entries only (anyone else's → 404).
  // Fixed paths (setups, stats, settings, attachments) are declared — and must be registered — before `/journal/:entryId`.
  journalList: ep({ method: 'GET', path: '/api/v1/journal', auth: 'user', query: JournalListQuery, response: paginated(JournalEntry) }),
  /** Setups and tags already used, with counts (autocomplete). */
  journalSetups: ep({ method: 'GET', path: '/api/v1/journal/setups', auth: 'user', response: JournalSetupList }),
  /** basis ACTUAL_FILLS; CLOSED entries by closedAt; `excluded` = VOID / needsReview entries left out. */
  journalStats: ep({ method: 'GET', path: '/api/v1/journal/stats', auth: 'user', query: JournalStatsQuery, response: JournalStats }),
  /** { autoJournal, autoSince } — read-only window start. */
  journalSettings: ep({ method: 'GET', path: '/api/v1/journal/settings', auth: 'user', response: JournalSettings }),
  /** Only { autoJournal }: on opens a new window from now (no back-fill), off closes the current one. */
  journalUpdateSettings: ep({ method: 'PATCH', path: '/api/v1/journal/settings', auth: 'user', body: JournalUpdateSettingsRequest, response: JournalSettings }),
  /** The image bytes (owner only). Use `<img src={journalAttachmentUrl(id)}>`; the client has no method for it. */
  journalAttachment: ep({ method: 'GET', path: '/api/v1/journal/attachments/:attachmentId', auth: 'user', params: JournalAttachmentIdParam, response: JournalAttachmentFile, format: 'binary' }),
  journalDeleteAttachment: ep({ method: 'DELETE', path: '/api/v1/journal/attachments/:attachmentId', auth: 'user', params: JournalAttachmentIdParam, response: OkResponse }),
  /** MANUAL entry from free fills: `orderIds` (spot) or `futuresPositionId`. */
  journalCreate: ep({ method: 'POST', path: '/api/v1/journal', auth: 'user', body: JournalCreateRequest, response: JournalEntryDetail, status: 201 }),
  /** Entry + its fill legs + image metadata. */
  journalGet: ep({ method: 'GET', path: '/api/v1/journal/:entryId', auth: 'user', params: JournalEntryIdParam, response: JournalEntryDetail }),
  journalUpdate: ep({ method: 'PATCH', path: '/api/v1/journal/:entryId', auth: 'user', params: JournalEntryIdParam, body: JournalUpdateRequest, response: JournalEntryDetail }),
  /** MANUAL only (AUTO → 409 AUTO_ENTRY_NOT_DELETABLE); its fills become free again, its images are deleted. */
  journalDelete: ep({ method: 'DELETE', path: '/api/v1/journal/:entryId', auth: 'user', params: JournalEntryIdParam, response: OkResponse }),
  /** JSON { contentType, dataBase64 }; 413 / 415 / 409 TOO_MANY_ATTACHMENTS. */
  journalUploadAttachment: ep({ method: 'POST', path: '/api/v1/journal/:entryId/attachments', auth: 'user', params: JournalEntryIdParam, body: JournalAttachmentUpload, response: JournalAttachment, status: 201 }),
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
/** Endpoints served as raw bytes (`format: 'binary'`): no typed-client method, loaded by URL. */
export type BinaryEndpointName = { [N in EndpointName]: Endpoints[N] extends { format: 'binary' } ? N : never }[EndpointName];
/** Endpoints the typed client can call (JSON and CSV). */
export type ClientEndpointName = Exclude<EndpointName, BinaryEndpointName>;

type Infer<T> = T extends z.ZodType ? z.input<T> : never;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` = no key / "all fields optional" test
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

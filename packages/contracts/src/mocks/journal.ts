/**
 * ⚠️ Mock resolvers for the trading journal (0.13.0) — UI development only. Same rules, same error codes and the same
 * order of checks as the server (docs/plans/module-A-nhat-ky-giao-dich.md §2, `JournalConflictReason`); every number
 * comes from @cex/core through journalEngine.ts.
 *
 * Like the server, the source of truth is the fill tables: before answering, the mock records every fill of the mock
 * wallet (spot trades, futures fills) made inside an auto-journal window and not recorded yet, in fill id order.
 * Fills made while auto-journal is off stay free for journalCreate (MANUAL).
 */
import type { FuturesTrade, JournalAttachment, JournalEntryDetail, JournalFill, Order, Trade } from '../index.ts';
import {
  JOURNAL_LIMITS,
  JournalAttachmentUpload,
  JournalCreateRequest,
  JournalImageType,
  JournalListQuery,
  JournalStatsQuery,
  JournalUpdateRequest,
  JournalUpdateSettingsRequest,
  type JournalConflictReason,
} from '../journal.ts';
import { fixtureJournalPositions, J, JA } from '../fixtures/journal.ts';
import { fmtFuturesPrice, fmtFuturesQty, MOCK_FUTURES } from '../fixtures/futures.ts';
import { MockError, now, ok, requireUser, type Resolver } from './common.ts';
import { mockStore } from './store.ts';
import type { MockPosition } from './futuresState.ts';
import { fromBase64, mockLotRules, type MockJournalEntry } from './journalState.ts';
import {
  allocateSpot,
  futuresLegsOf,
  futuresResult,
  journalStats,
  positionInput,
  replayManualSpot,
  spotFillOfTrade,
  spotResult,
  stopOnWrongSide,
  sumDecimals,
  type FuturesLeg,
  type JournalStatsEntryInput,
  type SpotFillInput,
} from './journalEngine.ts';

const Z = '0.00000000';
const DAY = 86_400_000;
const js = () => mockStore.journal;
const conflict = (reason: JournalConflictReason, message: string, details: Record<string, unknown> = {}) => new MockError('CONFLICT', message, { reason, ...details });
const notFound = (what: string) => new MockError('NOT_FOUND', `${what} not found`);
const spotKey = (tradeId: string) => `S:${tradeId}`;
const legKey = (tradeId: string, leg: 'OPEN' | 'CLOSE') => `F:${tradeId}:${leg}`;
const byId = (a: { id: string }, b: { id: string }) => Number(a.id) - Number(b.id);
const qtyDecimals = (symbol: string) => {
  const step = MOCK_FUTURES[symbol]?.step ?? '0.001';
  return step.includes('.') ? step.split('.')[1]!.length : 0;
};

// ───────────────────────────── lookups

const mine = () => js().entries.filter((e) => e.owner === 'me');
function myEntry(entryId: string): MockJournalEntry {
  const e = js().entries.find((x) => x.detail.id === entryId && x.owner === 'me');
  if (!e) throw notFound('Journal entry');
  return e;
}
const futuresEntryOf = (positionId: string) => mine().find((e) => e.detail.market === 'FUTURES' && e.detail.futuresPositionId === positionId);
const openAutoSpotEntry = (symbol: string) => mine().find((e) => e.detail.market === 'SPOT' && e.detail.symbol === symbol && e.detail.origin === 'AUTO' && e.detail.status === 'OPEN');
const ordersOfWallet = (): Order[] => [...mockStore.openOrders, ...mockStore.history];
const tradesOfOrder = (orderId: string) => mockStore.trades.filter((t) => t.orderId === orderId);
const mockPositions = (): MockPosition[] => [...mockStore.futures.positions, ...mockStore.futures.closed];

function inAutoWindow(at: string): boolean {
  const t = Date.parse(at);
  const s = js();
  if (s.windows.length === 0) return t >= Date.parse(s.featureStartedAt);
  return s.windows.some((w) => t >= Date.parse(w.startedAt) && (w.endedAt === null || t < Date.parse(w.endedAt)));
}

// ───────────────────────────── building entries

function newEntry(p: Pick<JournalEntryDetail, 'market' | 'symbol' | 'direction' | 'origin' | 'futuresPositionId' | 'initialStop' | 'openedAt'>, result: JournalEntryDetail['result']): MockJournalEntry {
  const t = now();
  const detail: JournalEntryDetail = {
    id: J(js().nextEntry++),
    ...p,
    status: 'OPEN',
    closeReason: null,
    needsReview: false,
    adjustedAt: null,
    adjustmentReason: null,
    setup: null,
    tags: [],
    plan: { entry: null, stop: null, target: null },
    initialStopLocked: false,
    notes: '',
    mistakes: [],
    executionScore: null,
    openQty: Z,
    exitQty: Z,
    result,
    fillCount: 0,
    attachmentCount: 0,
    closedAt: null,
    createdAt: t,
    updatedAt: t,
    fills: [],
    attachments: [],
  };
  return { owner: 'me', detail, lot: null, spotState: null, spotFills: [] };
}

function spotJournalFill(t: Trade, a: { allocatedQty: string; unattributedQty: string; allocatedQuote: string; allocatedFee: string }): JournalFill {
  return {
    id: String(js().nextFill++),
    tradeId: t.id,
    orderId: t.orderId,
    leg: 'SPOT',
    side: t.side,
    price: t.price,
    quantity: t.quantity,
    fee: t.fee,
    feeAsset: t.feeAsset,
    allocatedQty: a.allocatedQty,
    unattributedQty: a.unattributedQty,
    allocatedQuote: a.allocatedQuote,
    allocatedFee: a.allocatedFee,
    executedAt: t.createdAt,
  };
}

function futuresJournalFill(t: FuturesTrade, l: FuturesLeg): JournalFill {
  return {
    id: String(js().nextFill++),
    tradeId: t.id,
    orderId: t.orderId,
    leg: l.leg,
    side: t.side,
    price: t.price,
    quantity: t.quantity,
    fee: t.fee,
    feeAsset: 'USDT',
    allocatedQty: l.qty,
    unattributedQty: Z,
    allocatedQuote: l.quote,
    allocatedFee: l.fee,
    executedAt: t.createdAt,
  };
}

/** Counts, quantities, status and result of a spot entry from its core state. */
function refreshSpot(e: MockJournalEntry): void {
  const s = e.spotState!;
  const d = e.detail;
  if (d.status !== 'VOID') {
    d.status = s.status;
    d.closedAt = s.closedAt;
    d.closeReason = s.status === 'CLOSED' ? 'FILLS' : null;
  }
  d.initialStopLocked = s.firstReduceAt !== null;
  d.openQty = s.openQty;
  d.exitQty = s.soldQty;
  d.result = spotResult(s, d.initialStop);
}

/** The position behind a futures entry: the mock wallet's, or the fixture snapshot. */
function positionOf(e: MockJournalEntry) {
  const id = e.detail.futuresPositionId!;
  const p = mockPositions().find((x) => x.id === id);
  if (p) {
    return {
      side: p.side,
      status: p.status,
      quantity: fmtFuturesQty(p.symbol, p.qty),
      realized: p.realized,
      fees: p.fees,
      funding: p.funding,
      openedAt: p.openedAt,
      closedAt: p.closedAt,
      closeReason: p.closeReason,
    };
  }
  const f = fixtureJournalPositions[id];
  return f ? { ...f, realized: f.realizedPnl } : null;
}

/** Status, quantities and result of a futures entry from its position + legs. */
function refreshFutures(e: MockJournalEntry): void {
  const d = e.detail;
  const p = positionOf(e);
  if (!p) return;
  d.exitQty = sumDecimals(d.fills.filter((f) => f.leg === 'CLOSE').map((f) => f.allocatedQty));
  d.openQty = sumDecimals([p.quantity]);
  if (d.status !== 'VOID' && p.status === 'CLOSED') {
    if (p.closeReason === 'ADMIN') {
      d.status = 'VOID';
      d.closeReason = 'ADMIN_CLOSE';
      d.adjustedAt = now();
      d.adjustmentReason = 'ACCOUNT_RESET';
    } else {
      d.status = 'CLOSED';
      d.closeReason = p.closeReason === 'LIQUIDATION' ? 'LIQUIDATED' : 'FILLS';
    }
    d.closedAt = p.closedAt;
  }
  d.initialStopLocked = d.fills.some((f) => f.leg === 'CLOSE');
  d.result = futuresResult(positionInput(p, d.fills), d.initialStop);
}

function touch(e: MockJournalEntry): void {
  e.detail.fillCount = e.detail.fills.length;
  e.detail.attachmentCount = e.detail.attachments.length;
  e.detail.updatedAt = now();
}

// ───────────────────────────── auto-journal (module A §2.2): record fills inside a window, in fill id order

function autoJournal(): void {
  const s = js();
  // spot
  for (const t of [...mockStore.trades].sort(byId)) {
    if (s.claimed[spotKey(t.id)] !== undefined || !inAutoWindow(t.createdAt)) continue;
    const order = ordersOfWallet().find((o) => o.id === t.orderId);
    if (order && order.source !== 'USER') {
      s.claimed[spotKey(t.id)] = null; // NOT_USER_SOURCE: never journaled
      continue;
    }
    const open = openAutoSpotEntry(t.symbol);
    const res = allocateSpot(open?.spotState ?? null, spotFillOfTrade(t), mockLotRules(t.symbol));
    if (res.action === 'UNATTRIBUTED') {
      s.claimed[spotKey(t.id)] = null; // a sell with no open entry (coins from before / the faucet / a bot)
      continue;
    }
    let e = open;
    if (!e) {
      e = newEntry(
        { market: 'SPOT', symbol: t.symbol, direction: 'LONG', origin: 'AUTO', futuresPositionId: null, initialStop: order?.tpsl?.stopLossPrice ?? null, openedAt: t.createdAt },
        spotResult(res.newState!, order?.tpsl?.stopLossPrice ?? null),
      );
      e.lot = mockLotRules(t.symbol);
      s.entries.push(e);
    }
    e.spotState = res.newState;
    e.spotFills.push(spotFillOfTrade(t));
    e.detail.fills.push(spotJournalFill(t, res));
    s.claimed[spotKey(t.id)] = e.detail.id;
    refreshSpot(e);
    touch(e);
  }
  // futures
  const f = mockStore.futures;
  for (const t of [...f.trades].sort(byId)) {
    if (!inAutoWindow(t.createdAt)) continue;
    let legs: FuturesLeg[] | null;
    try {
      legs = futuresLegsOf(t, f.legs[t.id], qtyDecimals(t.symbol));
    } catch {
      continue; // legs the core refuses (inconsistent mock fill): never journaled
    }
    if (!legs) continue; // no leg columns: never journaled automatically
    for (const l of legs) {
      const key = legKey(t.id, l.leg);
      if (s.claimed[key] !== undefined) continue;
      let e = futuresEntryOf(l.positionId);
      if (e && e.detail.origin === 'MANUAL') continue; // the auto-journal never adds to a MANUAL entry
      if (!e) {
        if (l.leg === 'CLOSE') {
          s.claimed[key] = null; // closes a position opened outside an auto-journal window
          continue;
        }
        const pos = mockPositions().find((p) => p.id === l.positionId);
        const side = pos?.side ?? (t.side === 'BUY' ? 'LONG' : 'SHORT');
        e = newEntry(
          { market: 'FUTURES', symbol: t.symbol, direction: side, origin: 'AUTO', futuresPositionId: l.positionId, initialStop: pos?.sl ? fmtFuturesPrice(t.symbol, pos.sl) : null, openedAt: t.createdAt },
          futuresResult(positionInput({ side, status: 'OPEN', quantity: l.qty, realized: 0, fees: l.fee, funding: 0, openedAt: t.createdAt, closedAt: null, closeReason: null }, []), null),
        );
        s.entries.push(e);
      }
      e.detail.fills.push(futuresJournalFill(t, l));
      s.claimed[key] = e.detail.id;
      touch(e);
    }
  }
  // futures entries follow their positions (closes, liquidations, funding)
  for (const e of mine()) if (e.detail.market === 'FUTURES' && e.detail.status !== 'VOID' && mockPositions().some((p) => p.id === e.detail.futuresPositionId)) refreshFutures(e);
}

// ───────────────────────────── MANUAL from spot orders (journalCreate / addOrderIds)

/** Per-order checks in the documented order; returns the orders' fills (core inputs + trades). */
function checkOrders(orderIds: string[], symbol: string | null): { symbol: string; trades: Trade[] } {
  const trades: Trade[] = [];
  let sym = symbol;
  for (const orderId of orderIds) {
    const order = ordersOfWallet().find((o) => o.id === orderId);
    if (!order) throw new MockError('NOT_FOUND', 'Order not found', { orderId });
    if (order.source !== 'USER') throw conflict('BOT_ORDER', 'Bot orders never enter the journal', { orderId, skipReason: 'NOT_USER_SOURCE' });
    const own = tradesOfOrder(orderId);
    if (own.length === 0) throw conflict('ORDER_NOT_FILLED', 'The order has no fill yet', { orderId });
    sym ??= order.symbol;
    if (order.symbol !== sym) throw conflict('SYMBOL_MISMATCH', `The order is ${order.symbol}, not ${sym}`, { orderId });
    const taken = own.find((t) => js().claimed[spotKey(t.id)] !== undefined);
    if (taken) throw conflict('FILL_ALREADY_JOURNALED', 'A fill of this order is already in the journal', { orderId, tradeId: taken.id });
    trades.push(...own);
  }
  return { symbol: sym!, trades };
}

function rebuildSpot(e: MockJournalEntry, fills: SpotFillInput[], trades: Trade[]): void {
  const replay = replayManualSpot(fills, e.lot!);
  if (!replay.ok) throw conflict(replay.reason, replay.reason === 'NO_OPENING_FILL' ? 'The earliest fill of these orders is a sell: nothing opens the entry' : 'These orders make more than one round trip');
  const old = new Map(e.detail.fills.map((f) => [f.tradeId, f]));
  e.spotState = replay.state;
  e.spotFills = [...fills].sort((a, b) => Number(a.id) - Number(b.id));
  e.detail.fills = e.spotFills.map((fi) => {
    const a = replay.allocations.get(String(fi.id))!;
    const prev = old.get(String(fi.id));
    const t = trades.find((x) => x.id === String(fi.id));
    if (prev) return { ...prev, allocatedQty: a.allocatedQty, unattributedQty: a.unattributedQty, allocatedQuote: a.allocatedQuote, allocatedFee: a.allocatedFee };
    return spotJournalFill(t!, a);
  });
  for (const f of e.detail.fills) js().claimed[spotKey(f.tradeId)] = e.detail.id;
  refreshSpot(e);
  touch(e);
}

function createFromOrders(orderIds: string[]): MockJournalEntry {
  const { symbol, trades } = checkOrders(orderIds, null);
  const fills = trades.map(spotFillOfTrade);
  const lot = mockLotRules(symbol);
  const replay = replayManualSpot(fills, lot); // checks before anything is created
  if (!replay.ok) throw conflict(replay.reason, replay.reason === 'NO_OPENING_FILL' ? 'The earliest fill of these orders is a sell: nothing opens the entry' : 'These orders make more than one round trip');
  const first = [...trades].sort(byId)[0]!;
  const stop = ordersOfWallet().find((o) => o.id === first.orderId)?.tpsl?.stopLossPrice ?? null;
  const e = newEntry({ market: 'SPOT', symbol, direction: 'LONG', origin: 'MANUAL', futuresPositionId: null, initialStop: stop, openedAt: replay.state.openedAt }, spotResult(replay.state, stop));
  e.lot = lot;
  rebuildSpot(e, fills, trades);
  js().entries.push(e);
  return e;
}

function createFromPosition(positionId: string): MockJournalEntry {
  const pos = mockPositions().find((p) => p.id === positionId);
  if (!pos) throw new MockError('NOT_FOUND', 'Position not found', { positionId });
  if (futuresEntryOf(positionId)) throw conflict('FILL_ALREADY_JOURNALED', 'This position is already in the journal', { positionId });
  const f = mockStore.futures;
  const found: { t: FuturesTrade; l: FuturesLeg }[] = [];
  for (const t of [...f.trades].filter((x) => x.symbol === pos.symbol).sort(byId)) {
    let legs: FuturesLeg[] | null = null;
    try {
      legs = futuresLegsOf(t, f.legs[t.id], qtyDecimals(t.symbol));
    } catch {
      legs = null;
    }
    for (const l of legs ?? []) if (l.positionId === positionId) found.push({ t, l });
  }
  const taken = found.find(({ t, l }) => js().claimed[legKey(t.id, l.leg)] !== undefined);
  if (taken) throw conflict('FILL_ALREADY_JOURNALED', 'A fill of this position is already in the journal', { positionId, tradeId: taken.t.id });
  // the mock wallet's demo positions have no recorded fills at all — like positions traded before the leg columns existed
  if (!found.some(({ l }) => l.leg === 'OPEN')) throw conflict('LEGACY_FUTURES_FILL', 'This position has fills from before futures legs were recorded', { positionId });
  const stop = pos.sl === null ? null : fmtFuturesPrice(pos.symbol, pos.sl);
  const first = found.find(({ l }) => l.leg === 'OPEN')!;
  const e = newEntry(
    { market: 'FUTURES', symbol: pos.symbol, direction: pos.side, origin: 'MANUAL', futuresPositionId: positionId, initialStop: stop, openedAt: first.t.createdAt },
    futuresResult(positionInput({ side: pos.side, status: 'OPEN', quantity: first.l.qty, realized: 0, fees: first.l.fee, funding: 0, openedAt: first.t.createdAt, closedAt: null, closeReason: null }, []), null),
  );
  for (const { t, l } of found) {
    e.detail.fills.push(futuresJournalFill(t, l));
    js().claimed[legKey(t.id, l.leg)] = e.detail.id;
  }
  js().entries.push(e);
  refreshFutures(e);
  touch(e);
  return e;
}

// ───────────────────────────── images

const SIGNATURES: Record<JournalImageType, (b: Uint8Array) => boolean> = {
  'image/png': (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
};

async function sha256Hex(b: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(b));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function myAttachment(attachmentId: string): { e: MockJournalEntry; a: JournalAttachment } {
  for (const e of mine()) {
    const a = e.detail.attachments.find((x) => x.id === attachmentId);
    if (a) return { e, a };
  }
  throw notFound('Attachment');
}

const usedImageBytes = () => mine().reduce((s, e) => s + e.detail.attachments.reduce((t, a) => t + a.bytes, 0), 0) + js().otherImageBytes;

// ───────────────────────────── views

const view = (e: MockJournalEntry): JournalEntryDetail => structuredClone(e.detail);
const listItem = (e: MockJournalEntry) => {
  const { fills: _f, attachments: _a, ...entry } = view(e);
  return entry;
};

function settingsView() {
  const s = js();
  if (s.windows.length === 0) return { autoJournal: true, autoSince: s.featureStartedAt };
  const last = s.windows[s.windows.length - 1]!;
  return last.endedAt === null ? { autoJournal: true, autoSince: last.startedAt } : { autoJournal: false, autoSince: null };
}

const sync = () => {
  requireUser();
  autoJournal();
};

export const journalResolvers: { [N in 'journalList' | 'journalSetups' | 'journalStats' | 'journalSettings' | 'journalUpdateSettings' | 'journalAttachment' | 'journalDeleteAttachment' | 'journalCreate' | 'journalGet' | 'journalUpdate' | 'journalDelete' | 'journalUploadAttachment']: Resolver<N> } = {
  journalList: ({ query }) => {
    sync();
    const q = JournalListQuery.parse(Object.fromEntries(query));
    const from = q.from ? Date.parse(q.from) : -Infinity;
    const to = q.to ? Date.parse(q.to) : Infinity;
    const rows = mine()
      .map((e) => e.detail)
      .filter(
        (d) =>
          (!q.status || d.status === q.status) &&
          (!q.market || d.market === q.market) &&
          (!q.symbol || d.symbol === q.symbol) &&
          (!q.setup || d.setup === q.setup) &&
          (!q.tag || d.tags.includes(q.tag)) &&
          (!q.origin || d.origin === q.origin) &&
          (!q.excluded || (d.status === 'VOID' || d.needsReview) === (q.excluded === 'true')) &&
          Date.parse(d.openedAt) >= from &&
          Date.parse(d.openedAt) <= to,
      )
      .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt) || (a.id < b.id ? 1 : -1));
    const offset = q.cursor ? Number(q.cursor) || 0 : 0;
    const page = rows.slice(offset, offset + q.limit);
    return { items: page.map((d) => listItem(js().entries.find((e) => e.detail.id === d.id)!)), nextCursor: offset + q.limit < rows.length ? String(offset + q.limit) : null };
  },

  journalSetups: () => {
    sync();
    const count = (names: (string | null)[]) => {
      const m = new Map<string, number>();
      for (const n of names) if (n !== null) m.set(n, (m.get(n) ?? 0) + 1);
      return [...m.entries()].map(([name, c]) => ({ name, count: c })).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
    };
    return { setups: count(mine().map((e) => e.detail.setup)), tags: count(mine().flatMap((e) => e.detail.tags)) };
  },

  journalStats: ({ query }) => {
    sync();
    const q = JournalStatsQuery.parse(Object.fromEntries(query));
    const to = now();
    const days = q.range === '7d' ? 7 : q.range === '30d' ? 30 : q.range === '90d' ? 90 : null;
    const from = days === null ? null : new Date(Date.parse(to) - days * DAY).toISOString();
    const input: JournalStatsEntryInput[] = mine()
      .map((e) => e.detail)
      .filter(
        (d) =>
          (d.status === 'CLOSED' || d.status === 'VOID') &&
          d.closedAt !== null &&
          (from === null || d.closedAt >= from) &&
          d.closedAt <= to &&
          (!q.market || d.market === q.market) &&
          (!q.symbol || d.symbol === q.symbol) &&
          (!q.setup || d.setup === q.setup) &&
          (!q.tag || d.tags.includes(q.tag)) &&
          (!q.direction || d.direction === q.direction),
      )
      .map((d) => ({
        id: d.id,
        status: d.status as 'CLOSED' | 'VOID',
        needsReview: d.needsReview,
        closedAt: d.closedAt,
        market: d.market,
        symbol: d.symbol,
        direction: d.direction,
        setup: d.setup,
        mistakes: d.mistakes,
        netPnl: d.status === 'VOID' ? null : d.result.netPnl,
        rMultiple: d.status === 'VOID' ? null : d.result.rMultiple,
      }));
    return journalStats(input, q.range, from, to);
  },

  journalSettings: () => (sync(), settingsView()),

  journalUpdateSettings: ({ body }) => {
    sync();
    const { autoJournal: on } = JournalUpdateSettingsRequest.parse(body);
    const s = js();
    const current = settingsView();
    if (current.autoJournal && !on) {
      if (s.windows.length === 0) s.windows.push({ startedAt: s.featureStartedAt, endedAt: now() });
      else s.windows[s.windows.length - 1]!.endedAt = now();
    } else if (!current.autoJournal && on) {
      s.windows.push({ startedAt: now(), endedAt: null }); // a new window: what happened while off is never back-filled
    }
    return settingsView();
  },

  journalAttachment: ({ params }) => {
    requireUser();
    const { a } = myAttachment(params.attachmentId!);
    const data = js().images[a.id];
    if (!data) throw notFound('Attachment');
    return { contentType: a.contentType, data };
  },

  journalDeleteAttachment: ({ params }) => {
    requireUser();
    const { e, a } = myAttachment(params.attachmentId!);
    e.detail.attachments = e.detail.attachments.filter((x) => x.id !== a.id);
    delete js().images[a.id];
    touch(e);
    return ok;
  },

  journalCreate: ({ body }) => {
    sync();
    const req = JournalCreateRequest.parse(body);
    const e = req.orderIds ? createFromOrders(req.orderIds) : createFromPosition(req.futuresPositionId!);
    return view(e);
  },

  journalGet: ({ params }) => {
    sync();
    return view(myEntry(params.entryId!));
  },

  journalUpdate: ({ params, body }) => {
    sync();
    const e = myEntry(params.entryId!);
    const req = JournalUpdateRequest.parse(body);
    // all checks on a copy first: nothing changes when one fails
    const work: MockJournalEntry = structuredClone(e);
    const claimedBefore = { ...js().claimed };
    try {
      if (req.addOrderIds) {
        if (work.detail.market === 'FUTURES') throw conflict('MARKET_MISMATCH', 'Orders can only be added to a spot entry (a futures entry follows its position)');
        if (work.detail.origin !== 'MANUAL' || work.detail.status !== 'OPEN') throw conflict('ENTRY_NOT_EXTENDABLE', 'Orders can only be added to an open MANUAL entry');
        const { trades } = checkOrders(req.addOrderIds, work.detail.symbol);
        const known = mockStore.trades.filter((t) => work.spotFills.some((f) => String(f.id) === t.id));
        rebuildSpot(work, [...work.spotFills, ...trades.map(spotFillOfTrade)], [...known, ...trades]);
      }
      if (req.initialStop !== undefined) {
        if (work.detail.initialStopLocked) throw conflict('STOP_LOCKED', 'The initial stop is locked after the first reducing fill; change plan.stop instead');
        if (req.initialStop !== null && stopOnWrongSide(work.detail.direction, req.initialStop, work.detail.result.avgEntryPrice)) {
          throw conflict('STOP_WRONG_SIDE', work.detail.direction === 'LONG' ? 'A LONG stop must be below the average entry' : 'A SHORT stop must be above the average entry');
        }
      }
    } catch (err) {
      js().claimed = claimedBefore;
      throw err;
    }
    const d = work.detail;
    if (req.setup !== undefined) d.setup = req.setup;
    if (req.tags !== undefined) d.tags = req.tags;
    if (req.plan) d.plan = { ...d.plan, ...Object.fromEntries(Object.entries(req.plan).filter(([, v]) => v !== undefined)) };
    if (req.notes !== undefined) d.notes = req.notes;
    if (req.mistakes !== undefined) d.mistakes = req.mistakes;
    if (req.executionScore !== undefined) d.executionScore = req.executionScore;
    if (req.initialStop !== undefined) {
      d.initialStop = req.initialStop;
      if (work.detail.market === 'SPOT' && work.spotState) refreshSpot(work);
      else refreshFutures(work);
    }
    touch(work);
    Object.assign(e, work);
    return view(e);
  },

  journalDelete: ({ params }) => {
    sync();
    const e = myEntry(params.entryId!);
    if (e.detail.origin === 'AUTO') throw conflict('AUTO_ENTRY_NOT_DELETABLE', 'Auto-journal entries cannot be deleted, only annotated');
    const s = js();
    for (const f of e.detail.fills) delete s.claimed[f.leg === 'SPOT' ? spotKey(f.tradeId) : legKey(f.tradeId, f.leg)];
    for (const a of e.detail.attachments) delete s.images[a.id];
    s.entries = s.entries.filter((x) => x !== e);
    return ok;
  },

  journalUploadAttachment: async ({ params, body }) => {
    sync();
    const e = myEntry(params.entryId!);
    const req = JournalAttachmentUpload.parse(body);
    const type = JournalImageType.safeParse(req.contentType.toLowerCase());
    if (!type.success) throw new MockError('UNSUPPORTED_MEDIA_TYPE', 'Only PNG, JPEG or WebP images', { contentType: req.contentType, accepted: JournalImageType.options });
    const bytes = fromBase64(req.dataBase64);
    if (!SIGNATURES[type.data](bytes)) throw new MockError('UNSUPPORTED_MEDIA_TYPE', `The file is not a real ${type.data}`, { contentType: req.contentType, accepted: JournalImageType.options });
    if (bytes.length > JOURNAL_LIMITS.attachmentBytes) throw new MockError('PAYLOAD_TOO_LARGE', 'Image above 1 MB', { reason: 'ATTACHMENT_TOO_LARGE', limitBytes: JOURNAL_LIMITS.attachmentBytes });
    if (e.detail.attachments.length >= JOURNAL_LIMITS.attachmentsPerEntry) throw conflict('TOO_MANY_ATTACHMENTS', `At most ${JOURNAL_LIMITS.attachmentsPerEntry} images per entry`, { limit: JOURNAL_LIMITS.attachmentsPerEntry });
    if (usedImageBytes() + bytes.length > JOURNAL_LIMITS.userQuotaBytes) throw new MockError('PAYLOAD_TOO_LARGE', 'Journal image storage is full (50 MB)', { reason: 'ATTACHMENT_QUOTA', limitBytes: JOURNAL_LIMITS.userQuotaBytes });
    const a: JournalAttachment = { id: JA(js().nextAttachment++), entryId: e.detail.id, contentType: type.data, bytes: bytes.length, sha256: await sha256Hex(bytes), createdAt: now() };
    js().images[a.id] = bytes;
    e.detail.attachments.push(a);
    touch(e);
    return a;
  },
};

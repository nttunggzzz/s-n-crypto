/** ⚠️ MOCK trading-journal state (0.13.0) — UI development only. Own file so the store imports it without a cycle. */
import type { JournalEntryDetail } from '../index.ts';
import { MOCK_PAIRS } from '../fixtures/index.ts';
import { FIXTURE_PNG_BASE64, fixtureJournalEntries, fixtureJournalImages, J, JA } from '../fixtures/journal.ts';

export interface MockLotRules {
  stepSize: string;
  minNotional: string;
}

export interface MockJournalEntry {
  /** 'other' = another user's entry: every journal endpoint answers 404 for it (like the server). */
  owner: 'me' | 'other';
  detail: JournalEntryDetail;
  /** Spot lot rules copied when the entry opened (null for futures) — module A §2.1. */
  lot: MockLotRules | null;
  /** true while `detail.result` is the hand-computed fixture; false once the mock changed the entry (result pending @cex/core). */
  fixtureResult: boolean;
}

export interface MockJournalState {
  /** journal_feature.started_at: the release of the journal in the mock. */
  featureStartedAt: string;
  /** journal_auto_windows of the mock user; empty = on since featureStartedAt (the server creates the row lazily too). */
  windows: { startedAt: string; endedAt: string | null }[];
  entries: MockJournalEntry[];
  /**
   * Fills that have a journal_fills row — 'S:<spot trade id>' or 'F:<futures trade id>:<OPEN|CLOSE>' → entry id,
   * or null (bot fill skipped for good / sell with no open entry / closing leg of a position opened outside a window).
   */
  claimed: Record<string, string | null>;
  /** Image bytes by attachment id. */
  images: Record<string, Uint8Array>;
  /** Bytes of the user's images that are not in this store — set it to try the 50 MB quota without uploading 50 MB. */
  otherImageBytes: number;
  nextEntry: number;
  nextFill: number;
  nextAttachment: number;
}

export const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** stepSize / minNotional of a spot pair (copied into the entry when it opens). */
export const mockLotRules = (symbol: string): MockLotRules | null => {
  const p = MOCK_PAIRS[symbol];
  return p ? { stepSize: p.step, minNotional: p.minNotional } : null;
};

export function initialJournalState(empty = false): MockJournalState {
  const state: MockJournalState = {
    featureStartedAt: '2026-10-01T00:00:00.000Z',
    windows: [],
    entries: [],
    claimed: {},
    images: {},
    otherImageBytes: 0,
    nextEntry: 100,
    nextFill: 70_000,
    nextAttachment: 100,
  };
  if (empty) return state;
  for (const d of clone(fixtureJournalEntries)) {
    state.entries.push({ owner: 'me', detail: d, lot: d.market === 'SPOT' ? mockLotRules(d.symbol) : null, fixtureResult: true });
    for (const f of d.fills) state.claimed[f.leg === 'SPOT' ? `S:${f.tradeId}` : `F:${f.tradeId}:${f.leg}`] = d.id;
  }
  for (const [id, b64] of Object.entries(fixtureJournalImages)) state.images[id] = fromBase64(b64);
  // someone else's entry (with an image): only its owner sees it → 404 for the mock user
  const other = clone(fixtureJournalEntries[0]!);
  other.id = J(99);
  other.fills = other.fills.map((f) => ({ ...f, id: `9${f.id}`, tradeId: `9${f.tradeId}`, orderId: `9${f.orderId}` }));
  other.attachments = other.attachments.map((a) => ({ ...a, id: JA(99), entryId: J(99) }));
  state.entries.push({ owner: 'other', detail: other, lot: mockLotRules(other.symbol), fixtureResult: true });
  state.images[JA(99)] = fromBase64(FIXTURE_PNG_BASE64);
  return state;
}

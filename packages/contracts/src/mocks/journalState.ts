/** ⚠️ MOCK trading-journal state (0.14.0) — UI development only. Own file so the store imports it without a cycle. */
import type { JournalEntryDetail, JournalFillSkipReason } from '../index.ts';
import { MOCK_PAIRS } from '../fixtures/index.ts';
import { FIXTURE_PNG_BASE64, fixtureJournalEntries, fixtureJournalImages, J, JA } from '../fixtures/journal.ts';
import { replayManualSpot, spotFillOfJournalFill, type SpotEntryState, type SpotFillInput } from './journalEngine.ts';

export interface MockLotRules {
  stepSize: string;
  minNotional: string;
}

export interface MockJournalEntry {
  /** 'other' = another user's entry: every journal endpoint answers 404 for it (like the server). */
  owner: 'me' | 'other';
  detail: JournalEntryDetail;
  /** SPOT: lot rules copied when the entry opened (module A §2.1). FUTURES: null. */
  lot: MockLotRules | null;
  /** SPOT: the @cex/core entry state (rebuilt from `spotFills` in id order). FUTURES: null. */
  spotState: SpotEntryState | null;
  /** SPOT: the fills of the entry as core inputs (for addOrderIds rebuilds). */
  spotFills: SpotFillInput[];
}

export interface MockJournalState {
  /** journal_feature.started_at: the release of the journal in the mock. */
  featureStartedAt: string;
  /** journal_auto_windows of the mock user; empty = on since featureStartedAt (the server creates the row lazily too). */
  windows: { startedAt: string; endedAt: string | null }[];
  entries: MockJournalEntry[];
  /**
   * Fills that have a journal_fills row, by 'S:<spot trade id>' or 'F:<futures trade id>:<OPEN|CLOSE>':
   *  - entryId set: allocated to that entry;
   *  - entryId null + skipReason: never journaled (bot fill);
   *  - entryId null + skipReason null: UNATTRIBUTED (a sell with no open entry, a later leg of a position without entry) —
   *    a MANUAL entry may still take it (module A §2.4).
   * A fill without a row is free (outside every auto-journal window, or freed by deleting a MANUAL entry).
   */
  claimed: Record<string, { entryId: string | null; skipReason: JournalFillSkipReason | null }>;
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
export const mockLotRules = (symbol: string): MockLotRules => {
  const p = MOCK_PAIRS[symbol];
  if (!p) throw new Error(`mock: unknown spot pair ${symbol}`);
  return { stepSize: p.step, minNotional: p.minNotional };
};

/** A fixture entry with its core state (spot: replayed from its fills, so the mock continues it exactly like the server). */
function fromFixture(d: JournalEntryDetail, owner: 'me' | 'other'): MockJournalEntry {
  if (d.market !== 'SPOT') return { owner, detail: d, lot: null, spotState: null, spotFills: [] };
  const lot = mockLotRules(d.symbol);
  const spotFills = d.fills.map(spotFillOfJournalFill);
  const replay = replayManualSpot(spotFills, lot);
  if (!replay.ok) throw new Error(`fixture ${d.id}: ${replay.reason}`);
  return { owner, detail: d, lot, spotState: replay.state, spotFills };
}

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
    state.entries.push(fromFixture(d, 'me'));
    for (const f of d.fills) state.claimed[f.leg === 'SPOT' ? `S:${f.tradeId}` : `F:${f.tradeId}:${f.leg}`] = { entryId: d.id, skipReason: null };
  }
  for (const [id, b64] of Object.entries(fixtureJournalImages)) state.images[id] = fromBase64(b64);
  // someone else's entry (with an image): only its owner sees it → 404 for the mock user
  const other = clone(fixtureJournalEntries[0]!);
  other.id = J(99);
  other.fills = other.fills.map((f) => ({ ...f, id: `9${f.id}`, tradeId: `9${f.tradeId}`, orderId: `9${f.orderId}` }));
  other.attachments = other.attachments.map((a) => ({ ...a, id: JA(99), entryId: J(99) }));
  state.entries.push(fromFixture(other, 'other'));
  state.images[JA(99)] = fromBase64(FIXTURE_PNG_BASE64);
  return state;
}

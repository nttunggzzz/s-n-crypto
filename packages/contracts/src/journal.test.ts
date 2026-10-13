import { describe, expect, it } from 'vitest';
import { compareCloseKey, computeEntryResult, computeJournalStats, futuresEntryResult, replayAllocations } from '@cex/core';
import {
  createApiClient,
  endpoints,
  ERROR_HTTP_STATUS,
  JOURNAL_LIMITS,
  JournalAttachmentUpload,
  JournalCreateRequest,
  JournalEntryDetail,
  JournalStats,
  JournalUpdateRequest,
  JournalUpdateSettingsRequest,
  journalAttachmentUrl,
  type BinaryEndpointName,
} from './index.ts';
import { fixtureJournalEntries, fixtureJournalPositions, fixtureJournalStats, J } from './fixtures/journal.ts';
import { MOCK_PAIRS } from './fixtures/index.ts';
import { spotFillOfJournalFill } from './mocks/journalEngine.ts';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('journal contract (0.13.0)', () => {
  it('12 journal endpoints; the image is the only binary endpoint and has no client method', () => {
    const names = Object.keys(endpoints).filter((n) => n.startsWith('journal'));
    expect(names).toHaveLength(12);
    const binary: BinaryEndpointName[] = ['journalAttachment'];
    expect(Object.entries(endpoints).filter(([, d]) => (d as { format?: string }).format === 'binary').map(([n]) => n)).toEqual(binary);
    const api = createApiClient() as unknown as Record<string, unknown>;
    expect(api.journalAttachment).toBeUndefined();
    expect(typeof api.journalGet).toBe('function');
    expect(journalAttachmentUrl(J(1))).toBe(`/api/v1/journal/attachments/${J(1)}`);
    expect(journalAttachmentUrl('a/b', 'http://x')).toBe('http://x/api/v1/journal/attachments/a%2Fb');
    // fixed paths are declared before /journal/:entryId (MSW and Express match in order)
    const order = Object.keys(endpoints);
    for (const n of ['journalSetups', 'journalStats', 'journalSettings', 'journalUpdateSettings']) expect(order.indexOf(n)).toBeLessThan(order.indexOf('journalGet'));
  });

  it('new error codes: 413 PAYLOAD_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE', () => {
    expect(ERROR_HTTP_STATUS.PAYLOAD_TOO_LARGE).toBe(413);
    expect(ERROR_HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE).toBe(415);
  });

  it('auto-journal settings take only { autoJournal } — a window time is refused', () => {
    expect(ok(JournalUpdateSettingsRequest, { autoJournal: false })).toBe(true);
    expect(ok(JournalUpdateSettingsRequest, { autoJournal: true, autoSince: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(ok(JournalUpdateSettingsRequest, {})).toBe(false);
  });

  it('create: exactly one of orderIds / futuresPositionId, numeric ids, no duplicates, strict', () => {
    expect(ok(JournalCreateRequest, { orderIds: ['100'] })).toBe(true);
    expect(ok(JournalCreateRequest, { futuresPositionId: '500' })).toBe(true);
    expect(ok(JournalCreateRequest, {})).toBe(false);
    expect(ok(JournalCreateRequest, { orderIds: ['100'], futuresPositionId: '500' })).toBe(false);
    expect(ok(JournalCreateRequest, { orderIds: [] })).toBe(false);
    expect(ok(JournalCreateRequest, { orderIds: ['100', '100'] })).toBe(false);
    expect(ok(JournalCreateRequest, { orderIds: ['abc'] })).toBe(false);
    expect(ok(JournalCreateRequest, { orderIds: Array.from({ length: JOURNAL_LIMITS.ordersPerRequest + 1 }, (_, i) => String(i + 1)) })).toBe(false);
    expect(ok(JournalCreateRequest, { orderIds: ['100'], origin: 'AUTO' })).toBe(false);
  });

  it('update: limits of A-D6 and the setup/tag rules; server-computed fields cannot be written', () => {
    expect(ok(JournalUpdateRequest, { notes: 'x'.repeat(JOURNAL_LIMITS.notes) })).toBe(true);
    expect(ok(JournalUpdateRequest, { notes: 'x'.repeat(JOURNAL_LIMITS.notes + 1) })).toBe(false);
    expect(ok(JournalUpdateRequest, { notes: 'a\u0000b' })).toBe(false);
    expect(ok(JournalUpdateRequest, { notes: 'dòng 1\ndòng 2' })).toBe(true);
    expect(ok(JournalUpdateRequest, { setup: 'x'.repeat(41) })).toBe(false);
    expect(ok(JournalUpdateRequest, { setup: null })).toBe(true);
    expect(ok(JournalUpdateRequest, { setup: 'a\tb' })).toBe(false);
    expect(ok(JournalUpdateRequest, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toBe(false);
    expect(ok(JournalUpdateRequest, { tags: ['x'.repeat(25)] })).toBe(false);
    expect(ok(JournalUpdateRequest, { tags: ['a', 'a'] })).toBe(false);
    expect(ok(JournalUpdateRequest, { mistakes: ['FOMO', 'FOMO'] })).toBe(false);
    expect(ok(JournalUpdateRequest, { mistakes: ['LAZY'] })).toBe(false);
    expect(ok(JournalUpdateRequest, { executionScore: 6 })).toBe(false);
    expect(ok(JournalUpdateRequest, { executionScore: 0 })).toBe(false);
    expect(ok(JournalUpdateRequest, { initialStop: '0' })).toBe(false);
    expect(ok(JournalUpdateRequest, { initialStop: '1.1234567890123456789' })).toBe(false); // > 18 decimals: numeric(38,18)
    expect(ok(JournalUpdateRequest, { initialStop: '123456789012345678901' })).toBe(false); // > 20 integer digits
    expect(ok(JournalUpdateRequest, { plan: {} })).toBe(false);
    expect(ok(JournalUpdateRequest, { plan: { stop: '75000.5' } })).toBe(true);
    expect(ok(JournalUpdateRequest, {})).toBe(false);
    for (const field of ['netPnl', 'status', 'origin', 'closeReason', 'adjustedAt', 'needsReview', 'result']) {
      expect(ok(JournalUpdateRequest, { notes: 'x', [field]: null }), field).toBe(false);
    }
  });

  it('image upload: plain base64, ≤ 1.4M characters (the decoded 1 MB limit is checked by the server: 413)', () => {
    expect(ok(JournalAttachmentUpload, { contentType: 'image/png', dataBase64: 'iVBORw0KGgo=' })).toBe(true);
    expect(ok(JournalAttachmentUpload, { contentType: 'image/svg+xml', dataBase64: 'PHN2Zz4=' })).toBe(true); // → 415 from the server, not 400
    expect(ok(JournalAttachmentUpload, { contentType: 'image/png', dataBase64: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(false);
    expect(ok(JournalAttachmentUpload, { contentType: 'image/png', dataBase64: 'abc' })).toBe(false);
    expect(ok(JournalAttachmentUpload, { contentType: 'image/png', dataBase64: 'A'.repeat(JOURNAL_LIMITS.attachmentBase64Chars + 4) })).toBe(false);
    // 1 MB + 1 byte still passes the schema so the server can answer 413
    expect(Math.ceil((JOURNAL_LIMITS.attachmentBytes + 1) / 3) * 4).toBeLessThanOrEqual(JOURNAL_LIMITS.attachmentBase64Chars);
  });

  it('fixtures match the schemas', () => {
    for (const e of fixtureJournalEntries) expect(JournalEntryDetail.parse(e)).toEqual(e);
    expect(JournalStats.parse(fixtureJournalStats)).toEqual(fixtureJournalStats);
    expect(fixtureJournalEntries.length).toBeGreaterThanOrEqual(10);
  });
});

describe('fixtures computed by hand = @cex/core (golden cross-check)', () => {
  it('every entry result equals computeEntryResult / futuresEntryResult', () => {
    for (const e of fixtureJournalEntries) {
      if (e.market === 'SPOT') {
        const p = MOCK_PAIRS[e.symbol]!;
        const replay = replayAllocations(e.fills.map(spotFillOfJournalFill), { stepSize: p.step, minNotional: p.minNotional });
        expect(replay.entries, e.id).toHaveLength(1);
        // allocations of the stored fills = a replay in id order
        for (const f of e.fills) {
          const a = replay.allocations.find((x) => x.fillId === f.tradeId)!;
          expect({ q: f.allocatedQty, u: f.unattributedQty, quote: f.allocatedQuote, fee: f.allocatedFee }, `${e.id} ${f.tradeId}`).toEqual({ q: a.allocatedQty, u: a.unattributedQty, quote: a.allocatedQuote, fee: a.allocatedFee });
        }
        const state = replay.entries[0]!.state;
        expect({ open: state.openQty, exit: state.soldQty, locked: state.firstReduceAt !== null }, e.id).toEqual({ open: e.openQty, exit: e.exitQty, locked: e.initialStopLocked });
        expect(e.result, e.id).toEqual({ ...computeEntryResult(state, { initialStop: e.initialStop }), liquidated: null, legsConsistent: null });
      } else {
        const pos = fixtureJournalPositions[e.futuresPositionId!]!;
        const legs = e.fills.map((f) => ({ leg: f.leg as 'OPEN' | 'CLOSE', price: f.price, qty: f.allocatedQty }));
        expect(e.result, e.id).toEqual({ ...futuresEntryResult({ ...pos, legs }, { initialStop: e.initialStop }), dustQty: null });
      }
    }
  });

  it('statistics equal computeJournalStats over the fixture entries', () => {
    const input = fixtureJournalEntries
      .filter((e) => e.status !== 'OPEN')
      .map((e) => ({
        id: e.id,
        status: e.status as 'CLOSED' | 'VOID',
        needsReview: e.needsReview,
        closedAt: e.closedAt,
        market: e.market,
        symbol: e.symbol,
        direction: e.direction,
        setup: e.setup,
        mistakes: e.mistakes,
        netPnl: e.status === 'VOID' ? null : e.result.netPnl,
        rMultiple: e.status === 'VOID' ? null : e.result.rMultiple,
      }))
      .sort((a, b) => compareCloseKey({ closedAt: a.closedAt!, id: a.id }, { closedAt: b.closedAt!, id: b.id }));
    const { range: _r, from: _f, to: _t, ...expected } = fixtureJournalStats;
    expect(computeJournalStats(input)).toEqual(expected);
  });
});

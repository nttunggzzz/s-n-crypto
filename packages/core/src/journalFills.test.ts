import { describe, expect, it } from 'vitest';
import {
  allocateFuturesLegs,
  allocateSpotFill,
  computeEntryResult,
  futuresEntryResult,
  replayAllocations,
  type FuturesFillInput,
  type FuturesPositionInput,
  type SpotEntryState,
  type SpotFillInput,
} from './journalFills.ts';

const T0 = Date.parse('2026-10-13T01:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const buy = (id: number, qty: string, price: string, quote: string, fee: string, min = id): SpotFillInput => ({ id, side: 'BUY', price, quantity: qty, quoteQty: quote, fee, createdAt: at(min) });
const sell = (id: number, qty: string, price: string, quote: string, fee: string, min = id): SpotFillInput => ({ id, side: 'SELL', price, quantity: qty, quoteQty: quote, fee, createdAt: at(min) });
const RULES = { stepSize: '0.0001', minNotional: '5' };

/** applies fills one by one, as the server's allocator would */
function run(fills: SpotFillInput[], rules = RULES) {
  let state: SpotEntryState | null = null;
  return fills.map((f) => {
    const res = allocateSpotFill(state, f, rules);
    if (res.newState) state = res.newState.status === 'OPEN' ? res.newState : null;
    return res;
  });
}

describe('allocateSpotFill — spot round trip (Module A §2.1)', () => {
  it('buy once, sell once: OPEN then CLOSE, golden result', () => {
    // BUY 0.5 @ 100 = 50 USDT, fee 0.0005 BTC (base) → net 0.4995 open
    // SELL 0.4995 @ 110 = 54.945 USDT, fee 0.054945 USDT → open 0 < step → CLOSE, dust 0
    const [o, c] = run([buy(1, '0.5', '100', '50', '0.0005', 0), sell(2, '0.4995', '110', '54.945', '0.054945', 270)]);
    expect(o).toMatchObject({ action: 'OPEN', allocatedQty: '0.50000000', allocatedQuote: '50.00000000', allocatedFee: '0.00050000', unattributedQty: '0.00000000' });
    expect(o!.newState!.openQty).toBe('0.49950000'); // buy fee in base reduces the net quantity
    expect(c).toMatchObject({ action: 'CLOSE', allocatedQty: '0.49950000', unattributedQty: '0.00000000', allocatedQuote: '54.94500000', allocatedFee: '0.05494500' });
    const st = c!.newState!;
    expect(st).toMatchObject({ status: 'CLOSED', openQty: '0.00000000', dustQty: '0.00000000', closedAt: at(270), firstReduceAt: at(270) });

    // unit cost = 50 / 0.4995 ; net = 54.945 − 0.054945 − 50 × 0.4995/0.4995 = 4.890055
    // risk = |100 − 95| × 0.5 = 2.5 ; R = 4.890055 / 2.5 = 1.956022
    // fees = 0.0005 × 100 + 0.054945 = 0.104945 ; holding 270 min = 16 200 000 ms
    expect(computeEntryResult(st, { initialStop: '95' })).toEqual({
      rMetricsVersion: 1,
      market: 'SPOT',
      direction: 'LONG',
      status: 'CLOSED',
      entryQty: '0.50000000',
      avgEntryPrice: '100',
      avgExitPrice: '110',
      realizedPnl: '4.89005500',
      netPnl: '4.89005500',
      fees: '0.10494500',
      funding: null,
      riskUsdt: '2.50000000',
      rMultiple: '1.95602200',
      outcome: 'WIN',
      holdingMs: 16_200_000,
      dustQty: '0.00000000',
    });
  });

  it('no initial stop → risk and R null, outcome from net PnL (A-D4)', () => {
    const [, c] = run([buy(1, '0.5', '100', '50', '0.0005'), sell(2, '0.4995', '90', '44.955', '0.044955')]);
    // net = 44.955 − 0.044955 − 50 = −5.089955
    expect(computeEntryResult(c!.newState!, { initialStop: null })).toMatchObject({ netPnl: '-5.08995500', riskUsdt: null, rMultiple: null, outcome: 'LOSS' });
  });

  it('buy twice, sell half → still OPEN, partial realized only', () => {
    // BUY 1 @ 100 (fee 0.001) + BUY 1 @ 120 (fee 0.001): buyQty 2, quote 220, net 1.998
    // SELL 0.999 @ 130 = 129.87, fee 0.12987 → left 0.999 (≥ step, × 130 = 129.87 ≥ 5) → REDUCE
    const res = run([buy(1, '1', '100', '100', '0.001'), buy(2, '1', '120', '120', '0.001'), sell(3, '0.999', '130', '129.87', '0.12987')]);
    expect(res.map((r) => r.action)).toEqual(['OPEN', 'ADD', 'REDUCE']);
    const st = res[2]!.newState!;
    expect(st).toMatchObject({ status: 'OPEN', buyQty: '2.00000000', buyQuote: '220.00000000', openQty: '0.99900000', soldQty: '0.99900000', firstReduceAt: at(3), closedAt: null });
    // realized = 129.87 − 0.12987 − 220 × 0.999 / 1.998 = 129.74013 − 110 = 19.74013
    // avg entry 220 / 2 = 110 ; risk = |110 − 100| × 2 = 20 ; fees = 0.1 + 0.12 + 0.12987 = 0.34987
    expect(computeEntryResult(st, { initialStop: '100' })).toMatchObject({
      status: 'OPEN',
      avgEntryPrice: '110',
      avgExitPrice: '130',
      realizedPnl: '19.74013000',
      netPnl: null,
      rMultiple: null,
      outcome: null,
      holdingMs: null,
      riskUsdt: '20.00000000',
      fees: '0.34987000',
    });
  });

  it('selling more than the open quantity: the rest is unattributed, proceeds/fee split pro rata', () => {
    // step 0.000001, tick 0.01 (6 + 2 ≤ 8 dp)
    // BUY 0.003 @ 100 = 0.3, fee 0.000003 → net 0.002997
    // SELL 0.007 @ 101.37 = 0.70959, fee 0.00070959
    //   entry part 0.002997: proceeds 0.70959 × 0.002997 / 0.007 = 0.30380589 (exact; rounds down)
    //                        fee 0.00070959 × 0.002997 / 0.007 = 0.00030380589 → rounds UP → 0.00030381
    //   unattributed 0.004003: proceeds 0.40578411, fee 0.00040578 (exact remainders)
    const rules = { stepSize: '0.000001', minNotional: '1' };
    const [, c] = run([buy(1, '0.003', '100', '0.3', '0.000003'), sell(2, '0.007', '101.37', '0.70959', '0.00070959')], rules);
    expect(c).toMatchObject({ action: 'CLOSE', allocatedQty: '0.00299700', unattributedQty: '0.00400300', allocatedQuote: '0.30380589', allocatedFee: '0.00030381' });
    // realized = 0.30380589 − 0.00030381 − 0.3 = 0.00350208
    expect(computeEntryResult(c!.newState!, { initialStop: null }).netPnl).toBe('0.00350208');
  });

  it('sell with no open entry (coins from faucet or before) → UNATTRIBUTED, no entry opened', () => {
    const r = allocateSpotFill(null, sell(1, '0.2', '100', '20', '0.02'), RULES);
    expect(r).toEqual({ action: 'UNATTRIBUTED', allocatedQty: '0.00000000', unattributedQty: '0.20000000', allocatedQuote: '0.00000000', allocatedFee: '0.00000000', newState: null, outOfOrder: false });
    // a CLOSED entry counts as "no open entry"
    const [, closed] = run([buy(1, '1', '100', '100', '0'), sell(2, '1', '100', '100', '0')]);
    expect(allocateSpotFill(closed!.newState!, sell(3, '0.1', '100', '10', '0'), RULES).action).toBe('UNATTRIBUTED');
  });

  it('left-over below stepSize → CLOSE with dust, no PnL on the dust', () => {
    // step 0.001. BUY 1 @ 100, fee 0.0015 BTC → net 0.9985 ; SELL 0.998 @ 110 = 109.78, fee 0.10978 → left 0.0005 < 0.001
    // realized = 109.78 − 0.10978 − 100 × 0.998 / 0.9985 = 109.67022 − 99.949924887330996… = 9.720295112669… → floor → 9.72029511
    // risk = |100 − 90| × 1 = 10 → R = 0.972029511 → 0.97202951 ; fees = 0.0015 × 100 + 0.10978 = 0.25978
    const rules = { stepSize: '0.001', minNotional: '5' };
    const [, c] = run([buy(1, '1', '100', '100', '0.0015'), sell(2, '0.998', '110', '109.78', '0.10978')], rules);
    expect(c!.action).toBe('CLOSE');
    expect(c!.newState).toMatchObject({ status: 'CLOSED', dustQty: '0.00050000', openQty: '0.00000000', soldQty: '0.99800000' });
    expect(computeEntryResult(c!.newState!, { initialStop: '90' })).toMatchObject({ netPnl: '9.72029511', rMultiple: '0.97202951', fees: '0.25978000', dustQty: '0.00050000' });
  });

  it('left-over × the price of THIS sell fill < minNotional → CLOSE (no market price involved)', () => {
    // BUY 1 @ 100 (no fee). minNotional 5.
    // SELL 0.96 @ 120 → left 0.04 × 120 = 4.8 < 5 → CLOSE, dust 0.04, realized = 115.2 − 96 = 19.2
    const [, c] = run([buy(1, '1', '100', '100', '0'), sell(2, '0.96', '120', '115.2', '0')]);
    expect(c!.action).toBe('CLOSE');
    expect(c!.newState!.dustQty).toBe('0.04000000');
    expect(computeEntryResult(c!.newState!, { initialStop: null }).netPnl).toBe('19.20000000');
    // same left-over sold at 130: 0.04 × 130 = 5.2 ≥ 5 → stays open
    expect(run([buy(1, '1', '100', '100', '0'), sell(2, '0.96', '130', '124.8', '0')])[1]!.action).toBe('REDUCE');
    // SELL 0.95 @ 120 → left 0.05 × 120 = 6 ≥ 5 → REDUCE
    expect(run([buy(1, '1', '100', '100', '0'), sell(2, '0.95', '120', '114', '0')])[1]!.action).toBe('REDUCE');
  });

  it('buy after the entry closed opens a NEW entry with the current lot rules; an open entry keeps its own copy', () => {
    const [, c] = run([buy(1, '1', '100', '100', '0'), sell(2, '1', '100', '100', '0')]);
    const newRules = { stepSize: '0.001', minNotional: '10' };
    const n = allocateSpotFill(c!.newState!, buy(3, '2', '101', '202', '0.002'), newRules);
    expect(n.action).toBe('OPEN');
    expect(n.newState).toMatchObject({ openFillId: '3', status: 'OPEN', lotRules: { stepSize: '0.001', minNotional: '10' }, buyQty: '2.00000000', soldQty: '0.00000000' });
    // ADD with other rules passed: the copied snapshot stays
    const add = allocateSpotFill(n.newState, buy(4, '1', '102', '102', '0.001'), { stepSize: '1', minNotional: '1000' });
    expect(add.action).toBe('ADD');
    expect(add.newState!.lotRules).toEqual({ stepSize: '0.001', minNotional: '10' });
  });

  it('flags a fill older than the entry’s last fill (out of id order → rebuild)', () => {
    const [o] = run([buy(5, '1', '100', '100', '0')]);
    expect(allocateSpotFill(o!.newState, buy(4, '1', '100', '100', '0'), RULES).outOfOrder).toBe(true);
    const add = allocateSpotFill(o!.newState, buy(10, '1', '100', '100', '0'), RULES); // 10 > 5 numerically
    expect(add.outOfOrder).toBe(false);
    expect(add.newState!.lastFillId).toBe('10');
  });

  it('rejects malformed fills', () => {
    expect(() => allocateSpotFill(null, buy(1, '0.123456789', '100', '12.3456789', '0'), RULES)).toThrow(/decimals/);
    expect(() => allocateSpotFill(null, buy(1, '1', '100', '100', '1'), RULES)).toThrow(/fee/);
    expect(() => allocateSpotFill(null, buy(1, '0', '100', '0', '0'), RULES)).toThrow();
    expect(() => allocateSpotFill(null, { ...buy(1, '1', '100', '100', '0'), createdAt: 'yesterday' }, RULES)).toThrow();
  });
});

// ───────────────────────────── futures

const ffill = (o: Partial<FuturesFillInput> & Pick<FuturesFillInput, 'id' | 'price' | 'quantity'>): FuturesFillInput => ({
  side: 'BUY',
  fee: '0',
  realizedPnl: '0',
  createdAt: at(0),
  positionId: null,
  closedPositionId: null,
  closeQty: null,
  openQty: null,
  ...o,
});

describe('allocateFuturesLegs (Module A §2.1)', () => {
  it('opening fill → one OPEN leg of position_id', () => {
    const legs = allocateFuturesLegs(ffill({ id: 11, price: '100', quantity: '2', fee: '0.08', positionId: 7, closeQty: '0', openQty: '2' }));
    expect(legs).toEqual([{ fillId: '11', leg: 'OPEN', positionId: '7', side: 'BUY', price: '100', qty: '2.00000000', quote: '200.00000000', fee: '0.08000000', realizedPnl: '0.00000000', createdAt: at(0) }]);
  });

  it('partial close → one CLOSE leg of the same position', () => {
    const legs = allocateFuturesLegs(ffill({ id: 12, side: 'SELL', price: '110', quantity: '1', fee: '0.044', realizedPnl: '10', positionId: 7, closedPositionId: 7, closeQty: '1', openQty: '0' }));
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ leg: 'CLOSE', positionId: '7', qty: '1.00000000', fee: '0.04400000', realizedPnl: '10.00000000' });
  });

  it('full close (position_id NULL) → CLOSE leg of closed_position_id', () => {
    const legs = allocateFuturesLegs(ffill({ id: 13, side: 'SELL', price: '105', quantity: '1', fee: '0.042', realizedPnl: '5', positionId: null, closedPositionId: 7, closeQty: '1', openQty: null }));
    expect(legs).toEqual([expect.objectContaining({ leg: 'CLOSE', positionId: '7', qty: '1.00000000', realizedPnl: '5.00000000' })]);
  });

  it('flip: one fill → CLOSE leg into the old entry + OPEN leg into the new one; fee split pro rata, exact sum', () => {
    // SELL 3 @ 100 closes LONG #7 (1) and opens SHORT #8 (2). Fill fee 0.10000001:
    // CLOSE fee = roundUp(0.10000001 × 1/3 = 0.0333333366…) = 0.03333334 ; OPEN fee = 0.10000001 − 0.03333334 = 0.06666667
    const legs = allocateFuturesLegs(ffill({ id: 20, side: 'SELL', price: '100', quantity: '3', fee: '0.10000001', realizedPnl: '-5', positionId: 8, closedPositionId: 7, closeQty: '1', openQty: '2' }));
    expect(legs).toEqual([
      { fillId: '20', leg: 'CLOSE', positionId: '7', side: 'SELL', price: '100', qty: '1.00000000', quote: '100.00000000', fee: '0.03333334', realizedPnl: '-5.00000000', createdAt: at(0) },
      { fillId: '20', leg: 'OPEN', positionId: '8', side: 'SELL', price: '100', qty: '2.00000000', quote: '200.00000000', fee: '0.06666667', realizedPnl: '0.00000000', createdAt: at(0) },
    ]);
  });

  it('refuses fills without the A2 leg columns and inconsistent columns', () => {
    expect(() => allocateFuturesLegs(ffill({ id: 1, price: '100', quantity: '1', positionId: 7 }))).toThrow(/before A2/);
    expect(() => allocateFuturesLegs(ffill({ id: 1, price: '100', quantity: '2', positionId: 7, closeQty: '0', openQty: '1' }))).toThrow(/equal quantity/);
    expect(() => allocateFuturesLegs(ffill({ id: 1, price: '100', quantity: '1', closeQty: '1', openQty: '0' }))).toThrow(/closed_position_id/);
    expect(() => allocateFuturesLegs(ffill({ id: 1, price: '100', quantity: '1', positionId: 7, closeQty: '0', openQty: '1', realizedPnl: '3' }))).toThrow(/realized/);
  });
});

const pos = (o: Partial<FuturesPositionInput>): FuturesPositionInput => ({
  side: 'LONG',
  status: 'CLOSED',
  quantity: '0',
  realizedPnl: '0',
  fees: '0',
  funding: '0',
  openedAt: at(0),
  closedAt: at(60),
  closeReason: 'USER',
  legs: [],
  ...o,
});

describe('futuresEntryResult (Module A §2.5)', () => {
  it('normal LONG with negative funding', () => {
    // OPEN 2 @ 100, CLOSE 2 @ 110 ; realized 20, fees 0.08 + 0.088 = 0.168, funding −0.05
    // net = 20 − 0.168 − 0.05 = 19.782 ; risk = |100 − 95| × 2 = 10 ; R = 1.9782 ; 60 min
    const r = futuresEntryResult(pos({ realizedPnl: '20', fees: '0.168', funding: '-0.05', legs: [{ leg: 'OPEN', price: '100', qty: '2' }, { leg: 'CLOSE', price: '110', qty: '2' }] }), { initialStop: '95' });
    expect(r).toEqual({
      rMetricsVersion: 1,
      market: 'FUTURES',
      direction: 'LONG',
      status: 'CLOSED',
      entryQty: '2.00000000',
      avgEntryPrice: '100',
      avgExitPrice: '110',
      realizedPnl: '19.78200000',
      netPnl: '19.78200000',
      fees: '0.16800000',
      funding: '-0.05000000',
      riskUsdt: '10.00000000',
      rMultiple: '1.97820000',
      outcome: 'WIN',
      holdingMs: 3_600_000,
      liquidated: false,
      legsConsistent: true,
    });
  });

  it('SHORT with positive funding received', () => {
    // OPEN 1 @ 100, CLOSE 1 @ 90 ; realized 10, fees 0.076, funding +0.12 → net 10.044 ; risk |100 − 104| × 1 = 4 → R 2.511
    const r = futuresEntryResult(pos({ side: 'SHORT', realizedPnl: '10', fees: '0.076', funding: '0.12', legs: [{ leg: 'OPEN', price: '100', qty: '1' }, { leg: 'CLOSE', price: '90', qty: '1' }] }), { initialStop: '104' });
    expect(r).toMatchObject({ direction: 'SHORT', netPnl: '10.04400000', funding: '0.12000000', rMultiple: '2.51100000', outcome: 'WIN' });
  });

  it('liquidated position', () => {
    // LONG 1 @ 100 liquidated at 91: realized −9, fees 0.04 + 0.0364, funding −0.01 → net −9.0864 ; risk 5 → R −1.81728
    const r = futuresEntryResult(pos({ realizedPnl: '-9', fees: '0.0764', funding: '-0.01', closeReason: 'LIQUIDATION', legs: [{ leg: 'OPEN', price: '100', qty: '1' }, { leg: 'CLOSE', price: '91', qty: '1' }] }), { initialStop: '95' });
    expect(r).toMatchObject({ liquidated: true, netPnl: '-9.08640000', rMultiple: '-1.81728000', outcome: 'LOSS' });
  });

  it('adding again after a partial close: entry qty = Σ OPEN legs (not max_quantity), entry price = VWAP of OPEN legs', () => {
    // OPEN 2 @ 100 → CLOSE 1 @ 110 → OPEN 1 @ 120 → CLOSE 2 @ 115 ; max_quantity would be 2, Σ open = 3
    // avg entry = (200 + 120) / 3 = 106.666… → 106.666666666667 ; avg exit = (110 + 230) / 3 = 113.333333333333
    // realized (position) = 10 + (115 − 110) × 2 = 20 ; fees 0.264 → net 19.736
    // risk = |106.666… − 90| × 3 = 320 − 270 = 50 (exact) → R = 19.736 / 50 = 0.39472
    const r = futuresEntryResult(
      pos({
        realizedPnl: '20',
        fees: '0.264',
        legs: [
          { leg: 'OPEN', price: '100', qty: '2' },
          { leg: 'CLOSE', price: '110', qty: '1' },
          { leg: 'OPEN', price: '120', qty: '1' },
          { leg: 'CLOSE', price: '115', qty: '2' },
        ],
      }),
      { initialStop: '90' },
    );
    expect(r).toMatchObject({ entryQty: '3.00000000', avgEntryPrice: '106.666666666667', avgExitPrice: '113.333333333333', riskUsdt: '50.00000000', netPnl: '19.73600000', rMultiple: '0.39472000', legsConsistent: true });
  });

  it('flip end to end: the CLOSE leg closes the old entry, the OPEN leg starts the new one', () => {
    const legs = allocateFuturesLegs(ffill({ id: 20, side: 'SELL', price: '100', quantity: '3', fee: '0.12', realizedPnl: '-5', positionId: 8, closedPositionId: 7, closeQty: '1', openQty: '2', createdAt: at(30) }));
    const forOld = legs.filter((l) => l.positionId === '7');
    const forNew = legs.filter((l) => l.positionId === '8');
    // old LONG #7: opened 1 @ 105 (fee 0.042), closed by the flip at 100: realized −5, fees 0.042 + 0.04 → net −5.082 ; stop 103 → risk 2 → R −2.541
    const old = futuresEntryResult(pos({ realizedPnl: '-5', fees: '0.082', closedAt: at(30), legs: [{ leg: 'OPEN', price: '105', qty: '1' }, ...forOld] }), { initialStop: '103' });
    expect(old).toMatchObject({ status: 'CLOSED', entryQty: '1.00000000', avgExitPrice: '100', netPnl: '-5.08200000', rMultiple: '-2.54100000', legsConsistent: true });
    // new SHORT #8: open 2 @ 100, nothing closed yet
    const neu = futuresEntryResult(pos({ side: 'SHORT', status: 'OPEN', quantity: '2', fees: '0.08', openedAt: at(30), closedAt: null, closeReason: null, legs: forNew }), { initialStop: '104' });
    expect(neu).toMatchObject({ status: 'OPEN', entryQty: '2.00000000', avgEntryPrice: '100', realizedPnl: null, netPnl: null, rMultiple: null, riskUsdt: '8.00000000', legsConsistent: true });
    expect(forOld[0]!.fillId).toBe(forNew[0]!.fillId);
  });

  it('open position partly closed: realized so far; missing legs are reported', () => {
    // OPEN 2 @ 100, CLOSE 1 @ 110: realized 10, fees 0.124 → 9.876 so far ; 2 − 1 = 1 open
    const legs = [{ leg: 'OPEN' as const, price: '100', qty: '2' }, { leg: 'CLOSE' as const, price: '110', qty: '1' }];
    const r = futuresEntryResult(pos({ status: 'OPEN', quantity: '1', realizedPnl: '10', fees: '0.124', closedAt: null, closeReason: null, legs }), { initialStop: null });
    expect(r).toMatchObject({ realizedPnl: '9.87600000', netPnl: null, outcome: null, holdingMs: null, legsConsistent: true });
    expect(futuresEntryResult(pos({ status: 'OPEN', quantity: '2', realizedPnl: '10', closedAt: null, legs }), { initialStop: null }).legsConsistent).toBe(false);
  });
});

// ───────────────────────────── replay

const CHAIN: SpotFillInput[] = [
  buy(1, '1', '100', '100', '0.001'), // OPEN  net 0.999
  buy(2, '0.5', '110', '55', '0.0005'), // ADD   net 1.4985
  sell(3, '0.7', '120', '84', '0.084'), // REDUCE left 0.7985
  sell(4, '1', '125', '125', '0.125'), // CLOSE  0.7985 allocated, 0.2015 unattributed
  sell(5, '0.2', '126', '25.2', '0.0252'), // UNATTRIBUTED
  buy(6, '2', '130', '260', '0.002'), // OPEN #2
  sell(7, '0.5', '131', '65.5', '0.0655'), // REDUCE
];

describe('replayAllocations (Module A §2.2 point 5, §2.3 (d)/(e))', () => {
  it('replay of the whole chain = allocateSpotFill fill by fill', () => {
    const seq = run(CHAIN);
    const rep = replayAllocations(CHAIN, RULES);
    expect(rep.allocations.map((a) => a.action)).toEqual(['OPEN', 'ADD', 'REDUCE', 'CLOSE', 'UNATTRIBUTED', 'OPEN', 'REDUCE']);
    rep.allocations.forEach((a, i) => {
      const s = seq[i]!;
      expect(a).toEqual({ fillId: String(CHAIN[i]!.id), action: s.action, entryOpenFillId: s.newState?.openFillId ?? null, allocatedQty: s.allocatedQty, unattributedQty: s.unattributedQty, allocatedQuote: s.allocatedQuote, allocatedFee: s.allocatedFee });
    });
    expect(rep.entries.map((e) => e.openFillId)).toEqual(['1', '6']);
    expect(rep.entries[0]!.state).toEqual(seq[3]!.newState);
    expect(rep.entries[1]!.state).toEqual(seq[6]!.newState);
    expect(rep.finalState).toEqual(seq[6]!.newState);
    // golden: fill 4 = SELL 1 @ 125, open 0.7985 → 99.8125 USDT and fee 0.125 × 0.7985 = 0.0998125 to the entry
    expect(rep.allocations[3]).toMatchObject({ allocatedQty: '0.79850000', unattributedQty: '0.20150000', allocatedQuote: '99.81250000', allocatedFee: '0.09981250' });
    expect(rep.lostEntryOpenFillIds).toEqual([]);
  });

  it('sorts by id itself (numeric ids) and refuses a repeated id', () => {
    const shuffled = [CHAIN[6]!, CHAIN[0]!, CHAIN[3]!, CHAIN[5]!, CHAIN[1]!, CHAIN[4]!, CHAIN[2]!];
    expect(replayAllocations(shuffled, RULES)).toEqual(replayAllocations(CHAIN, RULES));
    expect(() => replayAllocations([...CHAIN, CHAIN[2]!], RULES)).toThrow(/repeated/);
  });

  it('a fill missing in the middle: deterministic rebuild, the entry that lost its opening fill is reported', () => {
    const without6 = CHAIN.filter((f) => f.id !== 6);
    const a = replayAllocations(without6, RULES, { knownEntryOpenFillIds: [1, 6] });
    const b = replayAllocations(without6, RULES, { knownEntryOpenFillIds: [1, 6] });
    expect(a).toEqual(b);
    expect(a.lostEntryOpenFillIds).toEqual(['6']);
    expect(a.allocations.find((x) => x.fillId === '7')!.action).toBe('UNATTRIBUTED'); // nothing open any more
    expect(a.finalState).toBeNull();

    // losing the middle BUY (#2) keeps entry #1 but changes its allocation: open 0.999 − 0.7 = 0.299 at fill 4
    const without2 = replayAllocations(CHAIN.filter((f) => f.id !== 2), RULES, { knownEntryOpenFillIds: [1, 6] });
    expect(without2.lostEntryOpenFillIds).toEqual([]);
    expect(without2.allocations.find((x) => x.fillId === '4')).toMatchObject({ action: 'CLOSE', allocatedQty: '0.29900000', unattributedQty: '0.70100000' });
  });

  it('replays from the earliest affected fill given the entry state just before it', () => {
    const full = replayAllocations(CHAIN, RULES);
    const before = run(CHAIN.slice(0, 2))[1]!.newState!;
    const tail = replayAllocations(CHAIN.slice(2), RULES, { initialState: before });
    expect(tail.allocations).toEqual(full.allocations.slice(2));
    expect(() => replayAllocations(CHAIN.slice(1), RULES, { initialState: before })).toThrow(/after initialState/);
  });

  it('each rebuilt entry keeps the lot rules it was opened with', () => {
    const rules = (f: SpotFillInput) => (Number(f.id) < 6 ? RULES : { stepSize: '0.01', minNotional: '10' });
    const rep = replayAllocations(CHAIN, rules);
    expect(rep.entries.map((e) => e.state.lotRules)).toEqual([
      { stepSize: '0.0001', minNotional: '5' },
      { stepSize: '0.01', minNotional: '10' },
    ]);
  });
});

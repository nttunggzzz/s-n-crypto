import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GDELT_THEMES_USED,
  NEWS_CLASSIFIER_VERSION,
  NEWS_EVENT_TYPES,
  TONE_THRESHOLD,
  buildSymbolAliases,
  canonicalUrl,
  classifyEventTypes,
  gdeltTone,
  tagSymbols,
  titleFingerprint,
  toneBucket,
  type NewsEventTypeCode,
} from './newsClassify.ts';

// ---------------------------------------------------------------------------------------------------------------
// Fixtures: real samples taken in N0 (no network). The asset catalog is READ as text from contracts (core must not
// import contracts), so the alias table is built from the same list the server will use.
// ---------------------------------------------------------------------------------------------------------------

const here = (rel: string) => new URL(rel, import.meta.url);
const TESTDATA = '../../../server/src/modules/news/testdata/';

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function rssTitles(feed: string): string[] {
  const xml = readFileSync(here(`${TESTDATA}rss/${feed}.xml`), 'utf8');
  const out: string[] = [];
  for (const item of xml.split('<item>').slice(1)) {
    const m = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(item);
    if (m?.[1] !== undefined) out.push(decode(m[1]).trim());
  }
  return out;
}

const GKG = readFileSync(here(`${TESTDATA}gdelt/20261014160000.sample.gkg.csv`), 'latin1')
  .split('\n')
  .filter((l) => l.length > 0)
  .map((l) => {
    const c = l.split('\t');
    const title = /<PAGE_TITLE>(.*?)<\/PAGE_TITLE>/.exec(l)?.[1];
    return { v2tone: c[15] ?? '', themes: (c[7] ?? '').split(';').filter(Boolean), title: title === undefined ? null : decode(title) };
  });

const catalogText = readFileSync(here('../../contracts/src/assetCatalog.ts'), 'utf8');
const CATALOG = [...catalogText.matchAll(/\{ asset: '([A-Z0-9]+)', name: '([^']+)'/g)].map((m) => ({ asset: m[1]!, name: m[2]! }));
const ALIASES = buildSymbolAliases(CATALOG.filter((a) => a.asset !== 'USDT'));

// ---------------------------------------------------------------------------------------------------------------
// Hand-labelled gold set. Labels were written from the title alone, BEFORE the rules were run. Real titles are
// looked up in the sample files by a unique prefix (so the exact text comes from the file). `synthetic` cases are
// ours, only where the real samples have no case of that type. `known` = what the classifier does today where it is
// (knowingly) wrong; the test pins that so a rule change shows up as a diff, and the miss stays visible.
// ---------------------------------------------------------------------------------------------------------------

interface Gold {
  title: string;
  labels: NewsEventTypeCode[];
  symbols: string[];
  synthetic: boolean;
  source: string;
  known?: { labels?: NewsEventTypeCode[]; symbols?: string[] };
}

const MAC = 'MACRO_DATA';
const CB = 'CENTRAL_BANK';
const REG = 'REGULATORY_ACTION';
const ETF = 'ETF';
const HACK = 'HACK_EXPLOIT';
const LIST = 'LISTING';
const DELIST = 'DELISTING';
const INC = 'EXCHANGE_INCIDENT';
const ADOPT = 'ADOPTION';
const OTHER = 'OTHER';
type L = NewsEventTypeCode;

const BTC = 'BTCUSDT';
const ETH = 'ETHUSDT';

const gold: Gold[] = [];
const feedTitles: Record<string, string[]> = {};
function real(feed: string, prefix: string, labels: L[], symbols: string[] = [], known?: Gold['known']): void {
  const titles = (feedTitles[feed] ??= rssTitles(feed));
  const hits = titles.filter((t) => t.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`gold prefix "${prefix}" in ${feed}: ${hits.length} matches`);
  gold.push({ title: hits[0]!, labels, symbols, synthetic: false, source: feed, known });
}
function gk(prefix: string, labels: L[], symbols: string[] = [], known?: Gold['known']): void {
  const titles = [...new Set(GKG.map((r) => r.title).filter((t): t is string => t !== null && !t.startsWith('Tag:')))];
  const hits = titles.filter((t) => t.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`gold prefix "${prefix}" in gdelt: ${hits.length} matches`);
  gold.push({ title: hits[0]!, labels, symbols, synthetic: false, source: 'gdelt', known });
}
function syn(title: string, labels: L[], symbols: string[] = [], known?: Gold['known']): void {
  gold.push({ title, labels, symbols, synthetic: true, source: 'synthetic', known });
}

// --- cointelegraph (12 real titles)
real('cointelegraph', 'Bitcoin price dips below $82K', [MAC], [BTC]);
real('cointelegraph', 'Here’s what happened in crypto today', [OTHER]);
real('cointelegraph', '‘Bunker mode’ won’t protect', [OTHER]);
real('cointelegraph', 'Canada crypto remittances', [ADOPT]);
real('cointelegraph', 'Qivalis wins Dutch e-money license', [REG]);
real('cointelegraph', 'Kraken parent to buy Lithuanian Saldo Bank', [OTHER]);
real('cointelegraph', 'Can crypto users trust the supply chain', [OTHER]);
real('cointelegraph', 'Coins.ph says Philippine central bank license intact', [REG]);
real('cointelegraph', 'CryptoQuant’s 3 charts', [OTHER], [BTC]);
real('cointelegraph', 'Sam Bankman-Fried’s lawyer', [REG]);
real('cointelegraph', 'Bitcoin will become ‘less volatile’', [OTHER], [BTC]);
real('cointelegraph', 'Standard Chartered expands Bitcoin and Ether trading', [ADOPT], [BTC, ETH]);
// --- coindesk (12)
real('coindesk', 'AI agents make 138 million crypto payments', [ADOPT]);
real('coindesk', 'Crypto Long & Short', [OTHER], [BTC]);
real('coindesk', 'EasyA hits $1.1 billion valuation', [ADOPT]);
real('coindesk', 'BlackRock', [ETF]);
real('coindesk', 'Former FTX Europe chief', [REG, ADOPT]);
real('coindesk', 'America', [OTHER]);
real('coindesk', 'Kraken parent Payward to become first crypto firm', [OTHER]);
real('coindesk', 'U.S. September CPI comes in hot', [MAC], [BTC]);
real('coindesk', 'Here', [MAC], [BTC]);
real('coindesk', 'Dutch central bank grants Qivalis', [REG]);
real('coindesk', 'Bitcoin holds above $83,000', [MAC], [BTC]);
real('coindesk', 'S&P 500 options', [OTHER]);
// --- decrypt (12)
real('decrypt', "'It Can Take Years", [OTHER], [BTC]);
real('decrypt', 'Bitcoin Falls as Hot Inflation', [MAC, CB], [BTC]);
real('decrypt', 'Hex Founder Richard Heart Detained', [REG]);
real('decrypt', 'Ledger Asks Resellers', [HACK]);
real('decrypt', 'Notorious Crypto Celeb', [OTHER]);
real('decrypt', 'Morning Minute', [OTHER]);
real('decrypt', 'Kraken Owner Payward to Buy', [OTHER]);
real('decrypt', 'BitMEX Sued in UK', [REG], [BTC]);
real('decrypt', 'OpenAI Engineer Arrested', [OTHER]);
real('decrypt', 'Character.AI Files for Bankruptcy', [OTHER]);
real('decrypt', 'Binance Is Shutting Down Its Bitcoin Mining Pool', [OTHER], [BTC]);
real('decrypt', 'Bitcoin Whale That Sat', [OTHER], [BTC]);
// --- fed (12)
real('fed', 'Minutes of the Board', [CB]);
real('fed', 'Federal Reserve Board releases results of the 2025 Survey', [OTHER]);
real('fed', 'Federal Reserve Board announces enforcement action against American Express', [REG]);
real('fed', 'Minutes of the Federal Open Market Committee', [CB]);
real('fed', 'Federal Reserve Board announces approval of application by Isabella', [OTHER]);
real('fed', 'Federal Reserve Board announces approval of application by Fleur', [OTHER]);
real('fed', 'Federal Reserve Board announces it will extend', [REG]);
real('fed', 'Federal Reserve Board issues enforcement action', [REG]);
real('fed', 'Federal Reserve Board finalizes changes', [REG]);
real('fed', 'Agencies publish resolution plan', [OTHER]);
real('fed', 'Federal Reserve Board announces approval of application by Peoples', [OTHER]);
real('fed', 'Federal Reserve Board requests public comment', [REG]);
// --- sec (12)
real('sec', 'SEC Small Business Advisory Committee', [OTHER]);
real('sec', 'SEC Proposes Expanding Securities', [REG]);
real('sec', 'SEC Seeks Final Judgment', [REG]);
real('sec', 'SEC to Host Virtual', [OTHER]);
real('sec', 'SEC Coordinates with Global Financial Regulators', [OTHER]);
real('sec', 'SEC Proposal Would Address', [REG]);
real('sec', 'SEC’s Division of Examinations', [OTHER]);
real('sec', 'SEC Charges Meyer Global', [REG]);
real('sec', 'SEC Charges Two Individuals', [REG]);
real('sec', 'SEC Proposes Amendments to Expand', [REG]);
real('sec', 'SEC Charges Multiple Entities', [REG]);
real('sec', 'SEC Charges Registered Investment Adviser', [REG]);
// --- theblock (12)
real('theblock', 'Hex and PulseChain founder', [REG]);
real('theblock', 'Standard Chartered pushes $2 trillion', [OTHER]);
real('theblock', 'StarkWare launches OffMarket', [OTHER]);
real('theblock', 'Strive buys $235 million', [ADOPT], [BTC]);
real('theblock', 'BNY, Citadel Securities', [ADOPT]);
real('theblock', 'Strategy’s preferred stock', [OTHER], [BTC]);
real('theblock', 'DriveWealth to use Ripple', [ADOPT]);
real('theblock', 'Polygon Labs completes Coinme', [OTHER], ['POLUSDT']);
real('theblock', 'Evernorth taps Ripple', [ADOPT], ['XRPUSDT']);
real('theblock', 'How Bitcoin Works', [OTHER], [BTC]);
real('theblock', 'Coinbase lays out flexible designs', [OTHER], [BTC]);
real('theblock', 'Ripple, Stripe-owned Privy', [ADOPT], ['XRPUSDT']);
// --- GDELT GKG sample (unique titles of the 15:45-16:00 file; the 'Tag: ...' rows are skipped)
gk('Bishop Duffy announces', [OTHER]);
gk('Can You Use Isopropyl', [OTHER]);
gk('808895.pdf', [OTHER]);
gk('Bitcoin Just Posted Its Best Q3', [OTHER], [BTC]);
gk('Inflation sizzled in September', [MAC]);
gk("'Community' coffee shop", [OTHER]);
gk('India Wholesale Price Index', [MAC]);
gk('Millions of people', [OTHER]);
gk('US stocks fall further', [MAC]);
gk('Neshannock teacher', [OTHER]);
gk('Inflation accelerated last month', [MAC]);
gk('Everything Meghan Markle', [OTHER]);
gk('September Inflation Jumps', [MAC]);
gk('NuScale Power Falls', [OTHER]);
gk('Grand Junction Seniors', [OTHER]);
gk('Rolls-Royce Spectre', [OTHER]);
gk('US inflation heats up in September; Fed rate hike', [MAC, CB]);
gk('Inflation Rises Again as Voters', [MAC]);
gk('Ofsted Says', [OTHER]);
gk('Better Buy Right Now', [OTHER], ['ARBUSDT', BTC, ETH]);
gk('Markle bridge', [OTHER]);
gk('U.S. inflation accelerates to 3.7 pct', [MAC]);
gk('US inflation rises before midterm elections', [MAC, CB]);
gk('Cardoso: Inflation must fall', [MAC]);
gk('U.S. inflation rises to 3.7% in September report', [MAC]);
gk("'No!' Fox Business", [OTHER]);
gk('Citi turns hawkish on Fed', [MAC, CB]);
gk('UK economy predicted', [OTHER]);
gk('PYMNTS | Ledger Suspends', [HACK]);
gk('Trump gets an ugly October surprise', [OTHER]);

// --- synthetic (written by us: the samples have no real LISTING, DELISTING or EXCHANGE_INCIDENT title, and only one
//     real ETF and two real HACK titles)
syn('Spot Ethereum ETF sees record $500M inflows', [ETF], [ETH]);
syn('SEC approves first spot Solana ETF', [REG, ETF], ['SOLUSDT']);
syn('Grayscale files for XRP exchange-traded fund', [ETF], ['XRPUSDT']);
syn("BlackRock's IBIT ETF logs fifth straight day of outflows", [ETF]);
syn('ETFs now hold 6% of all bitcoin supply', [ETF], [BTC]);
syn('DeFi protocol exploited for $40M after oracle manipulation', [HACK]);
syn('Exchange hacked, hot wallet drained of $120M in ETH', [HACK], [ETH]);
syn('North Korean hackers stole $300M from cross-chain bridge', [HACK]);
syn('Rug pull on new Solana memecoin wipes out $9M', [HACK], ['SOLUSDT']);
syn('Critical vulnerability found in wallet software, users urged to move funds', [HACK]);
syn('Binance will list dogwifhat (WIF) with USDT pair', [LIST], ['WIFUSDT']);
syn('Coinbase lists Pepe on its spot market', [LIST], ['PEPEUSDT']);
syn('Upbit announces new listing for Aptos', [LIST], ['APTUSDT']);
syn('Robinhood to list Solana and Cardano in the EU', [LIST], ['ADAUSDT', 'SOLUSDT']);
syn('Kraken lists Official Trump token for spot trading', [LIST], ['TRUMPUSDT']);
syn('Binance will delist three tokens on October 31', [DELIST]);
syn('Coinbase removes Terra trading pairs', [DELIST]);
syn('Kraken delists privacy coins in the EU', [DELIST]);
syn('Binance applies monitoring tag to eight tokens', [DELIST]);
syn('Exchange discontinues support for LTC deposits', [DELIST], ['LTCUSDT']);
syn('Exchange halts withdrawals after liquidity crunch', [INC]);
syn('Binance futures suffers outage during volatility spike', [INC]);
syn('Bybit pauses deposits for scheduled maintenance', [INC]);
syn('Crypto lender files for bankruptcy', [INC]);
syn('Kraken trading halted for 30 minutes due to glitch', [INC]);

// --- Out-of-sample probe. The rules above were written after reading the 102 real titles, so the gold-set numbers
// are in-sample and optimistic. These 33 headlines were written afterwards, labelled first, and run ONCE; whatever
// missed stayed missed (pinned in `known`), no rule was changed after seeing them.
interface Probe {
  title: string;
  labels: L[];
  symbols: string[];
  known?: { labels?: L[]; symbols?: string[] };
}
const PROBE: Probe[] = [
  { title: 'Bitcoin ETF flows turn negative as Fed signals higher for longer', labels: [CB, ETF], symbols: [BTC] },
  { title: 'Binance lists new AI token, price jumps 40% in minutes', labels: [LIST], symbols: [] },
  { title: 'Bybit confirms $1.4 billion theft in largest crypto hack ever', labels: [HACK], symbols: [] },
  { title: 'US jobs report beats expectations, Bitcoin slips', labels: [MAC], symbols: [BTC] },
  { title: 'ECB holds rates steady, euro rallies', labels: [CB], symbols: [] },
  { title: 'Coinbase down for thousands of users as outage hits app', labels: [INC], symbols: [] },
  { title: 'SEC delays decision on Grayscale Solana trust', labels: [REG], symbols: ['SOLUSDT'] },
  { title: 'Texas becomes first state to buy Bitcoin for strategic reserve', labels: [ADOPT], symbols: [BTC] },
  { title: 'Ethereum developers set date for Pectra upgrade', labels: [OTHER], symbols: [ETH] },
  { title: 'Robinhood adds XRP and DOGE trading in the UK', labels: [LIST], symbols: ['DOGEUSDT', 'XRPUSDT'], known: { labels: [OTHER] } },
  { title: 'Kraken to delist USDT for EU users', labels: [DELIST], symbols: [] },
  { title: 'CPI cools to 2.9%, boosting rate cut bets', labels: [MAC, CB], symbols: [] },
  { title: 'Mt. Gox moves 10,000 BTC to new wallet', labels: [OTHER], symbols: [BTC] },
  { title: 'Tether freezes $27 million in USDT linked to scam', labels: [OTHER], symbols: [] },
  { title: 'Hyperliquid whale opens $200M ETH long ahead of FOMC', labels: [CB], symbols: [ETH] },
  { title: 'Court rules Coinbase must face class action over staking', labels: [REG], symbols: [] },
  { title: 'Dogecoin jumps after Tesla accepts DOGE for merchandise', labels: [ADOPT], symbols: ['DOGEUSDT'], known: { labels: [OTHER] } },
  { title: "Justin Sun's TRON network suffers outage for two hours", labels: [INC], symbols: ['TRXUSDT'] },
  { title: 'Solana memecoin launchpad hit by exploit, $5M drained', labels: [HACK], symbols: ['SOLUSDT'] },
  { title: 'Bitcoin price today: BTC holds $90K', labels: [OTHER], symbols: [BTC] },
  { title: 'Circle files for Nasdaq listing', labels: [OTHER], symbols: [] },
  { title: "Fed's Powell says no rush to cut rates", labels: [CB], symbols: [] },
  { title: 'UK FCA bans crypto ads from unauthorised firms', labels: [REG], symbols: [] },
  { title: 'Polygon (POL) price analysis: bulls eye $0.60', labels: [OTHER], symbols: ['POLUSDT'] },
  { title: 'MicroStrategy buys another 5,000 BTC', labels: [ADOPT], symbols: [BTC] },
  { title: 'Link between inflation and gold weakens', labels: [MAC], symbols: [] },
  { title: 'ADA surges as Cardano upgrade nears', labels: [OTHER], symbols: ['ADAUSDT'] },
  { title: 'Ripple wins appeal against SEC', labels: [REG], symbols: [], known: { labels: [OTHER] } },
  { title: 'GENIUS Act stablecoin rules take effect, issuers scramble', labels: [REG], symbols: [] },
  { title: 'Bitcoin mining difficulty hits record high', labels: [OTHER], symbols: [BTC] },
  { title: 'Binance suspends withdrawals on Solana network', labels: [INC], symbols: ['SOLUSDT'] },
  { title: 'Gold hits record as inflation fears mount', labels: [MAC], symbols: [] },
  { title: 'Ethereum ETF approval odds rise, says analyst', labels: [ETF], symbols: [ETH] },
  { title: 'OP price rallies 12% on Superchain news', labels: [OTHER], symbols: ['OPUSDT'] },
  { title: 'Weekly crypto market wrap: Bitcoin, Ether and Solana drift lower', labels: [OTHER], symbols: [BTC, ETH, 'SOLUSDT'] },
];

// ---------------------------------------------------------------------------------------------------------------

describe('out-of-sample probe (written after the rules; run once, misses pinned)', () => {
  it('prints and pins the result', () => {
    const rows: string[] = [];
    let labelOk = 0;
    let symOk = 0;
    const diffs: string[] = [];
    for (const p of PROBE) {
      const gl = classifyEventTypes(p.title);
      const gs = tagSymbols(p.title, ALIASES);
      const labelsMatch = JSON.stringify(gl) === JSON.stringify(p.labels);
      const symMatch = JSON.stringify(gs) === JSON.stringify([...p.symbols].sort());
      if (labelsMatch) labelOk++;
      if (symMatch) symOk++;
      if (!labelsMatch) rows.push(`MISS labels: ${p.title} -> ${gl.join(',')} (hand label ${p.labels.join(',')})`);
      if (!symMatch) rows.push(`MISS symbols: ${p.title} -> ${gs.join(',')} (hand label ${p.symbols.join(',')})`);
      const wantL = p.known?.labels ?? p.labels;
      const wantS = p.known?.symbols ?? [...p.symbols].sort();
      if (JSON.stringify(gl) !== JSON.stringify(wantL)) diffs.push(`L ${p.title} -> ${gl.join(',')}`);
      if (JSON.stringify(gs) !== JSON.stringify(wantS)) diffs.push(`S ${p.title} -> ${gs.join(',')}`);
    }
    console.log(`\n[probe] exact label-set ${labelOk}/${PROBE.length}, exact symbol-set ${symOk}/${PROBE.length}\n${rows.join('\n')}`);
    expect(diffs).toEqual([]);
  });
});

describe('constants', () => {
  it('versions and event types', () => {
    expect(NEWS_CLASSIFIER_VERSION).toBe('news-rules-v1');
    expect(NEWS_EVENT_TYPES).toEqual([
      'MACRO_DATA', 'CENTRAL_BANK', 'REGULATORY_ACTION', 'ETF', 'HACK_EXPLOIT', 'LISTING', 'DELISTING',
      'EXCHANGE_INCIDENT', 'ADOPTION', 'OTHER',
    ]);
    expect(TONE_THRESHOLD).toBe('1.5');
    expect(GDELT_THEMES_USED).toEqual(['ECON_CENTRALBANK', 'CYBER_ATTACK', 'ECON_BITCOIN']);
  });

  it('parses the real catalog (50 coins incl. USDT) and the fixtures', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(50);
    expect(ALIASES.find((a) => a.symbol === 'BTCUSDT')).toEqual({ symbol: 'BTCUSDT', ticker: 'BTC', names: ['Bitcoin'] });
    expect(ALIASES.find((a) => a.symbol === 'ETHUSDT')?.names).toEqual(['Ethereum', 'Ether']);
    expect(ALIASES.some((a) => a.symbol === 'USDTUSDT')).toBe(false);
    // name equal to the ticker is dropped
    expect(ALIASES.find((a) => a.symbol === 'BNBUSDT')?.names).toEqual(['BNB Chain']);
    expect(['coindesk', 'cointelegraph', 'decrypt', 'fed', 'sec', 'theblock'].map((f) => rssTitles(f).length)).toEqual([12, 12, 12, 12, 12, 12]);
    expect(GKG.length).toBe(48);
  });
});

describe('gold set (hand-labelled, real titles + marked synthetic)', () => {
  it('covers every RSS title of the samples and has >= 60 real titles', () => {
    const real = gold.filter((g) => !g.synthetic);
    expect(real.length).toBeGreaterThanOrEqual(60);
    for (const feed of ['coindesk', 'cointelegraph', 'decrypt', 'fed', 'sec', 'theblock']) {
      expect(real.filter((g) => g.source === feed).length).toBe(12);
    }
  });

  it('each event type has >= 5 cases (real + synthetic, synthetic marked)', () => {
    for (const type of NEWS_EVENT_TYPES) {
      const n = gold.filter((g) => g.labels.includes(type)).length;
      expect(n, type).toBeGreaterThanOrEqual(5);
    }
  });

  it('classifier output equals the hand label, or the pinned known miss', () => {
    const diffs: string[] = [];
    for (const g of gold) {
      const gotLabels = classifyEventTypes(g.title);
      const gotSymbols = tagSymbols(g.title, ALIASES);
      const wantLabels = g.known?.labels ?? g.labels;
      const wantSymbols = g.known?.symbols ?? [...g.symbols].sort();
      if (JSON.stringify(gotLabels) !== JSON.stringify(wantLabels)) diffs.push(`LABELS ${g.title} -> ${gotLabels.join(',')} (want ${wantLabels.join(',')})`);
      if (JSON.stringify(gotSymbols) !== JSON.stringify(wantSymbols)) diffs.push(`SYMBOLS ${g.title} -> ${gotSymbols.join(',')} (want ${wantSymbols.join(',')})`);
    }
    expect(diffs).toEqual([]);
  });

  it('prints precision/recall per event type and symbol accuracy (report numbers)', () => {
    const rows: string[] = [];
    const calc = (subset: Gold[]) => {
      for (const type of NEWS_EVENT_TYPES) {
        let tp = 0;
        let fp = 0;
        let fn = 0;
        for (const g of subset) {
          const want = g.labels.includes(type);
          const got = classifyEventTypes(g.title).includes(type);
          if (want && got) tp++;
          else if (!want && got) fp++;
          else if (want && !got) fn++;
        }
        const p = tp + fp === 0 ? 'n/a' : (tp / (tp + fp)).toFixed(2);
        const r = tp + fn === 0 ? 'n/a' : (tp / (tp + fn)).toFixed(2);
        rows.push(`${type.padEnd(18)} support=${String(tp + fn).padStart(2)} TP=${tp} FP=${fp} FN=${fn} precision=${p} recall=${r}`);
      }
      const exact = subset.filter((g) => JSON.stringify(classifyEventTypes(g.title)) === JSON.stringify(g.labels)).length;
      const symExact = subset.filter((g) => JSON.stringify(tagSymbols(g.title, ALIASES)) === JSON.stringify([...g.symbols].sort())).length;
      rows.push(`exact label-set match ${exact}/${subset.length}; exact symbol-set match ${symExact}/${subset.length}`);
    };
    rows.push(`--- REAL titles only (n=${gold.filter((g) => !g.synthetic).length})`);
    calc(gold.filter((g) => !g.synthetic));
    rows.push(`--- ALL incl. synthetic (n=${gold.length})`);
    calc(gold);
    console.log(`\n[news-rules-v1 gold set]\n${rows.join('\n')}`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('never returns an empty list', () => {
    for (const g of gold) expect(classifyEventTypes(g.title).length).toBeGreaterThanOrEqual(1);
    expect(classifyEventTypes('')).toEqual(['OTHER']);
    expect(classifyEventTypes('   ')).toEqual(['OTHER']);
    expect(classifyEventTypes('asdf qwer zxcv')).toEqual(['OTHER']);
  });

  it('returns several types in NEWS_EVENT_TYPES order', () => {
    expect(classifyEventTypes('SEC approves first spot Solana ETF')).toEqual(['REGULATORY_ACTION', 'ETF']);
    expect(classifyEventTypes('Citi turns hawkish on Fed after inflation surprise, expects December rate hike')).toEqual(['MACRO_DATA', 'CENTRAL_BANK']);
  });
});

describe('classifyEventTypes edge cases', () => {
  it('"sec" and "fed" the ordinary words are not agencies; word boundaries hold', () => {
    expect(classifyEventTypes('The sec ond half was fed up with delays')).toEqual(['OTHER']);
    expect(classifyEventTypes('Delisting rumours hit the token')).toEqual(['DELISTING']);
    expect(classifyEventTypes('Cpi-based index')).toEqual(['MACRO_DATA']);
    expect(classifyEventTypes('Occupied territories')).toEqual(['OTHER']); // "cpi" inside "occupied" must not match
    expect(classifyEventTypes('Brain drain worries Europe')).toEqual(['OTHER']);
  });

  it('own-company stock listing is not an exchange LISTING; delisting is not LISTING', () => {
    expect(classifyEventTypes('Circle targets Nasdaq listing next year')).toEqual(['OTHER']);
    expect(classifyEventTypes('Binance delists three tokens')).toEqual(['DELISTING']);
  });

  it('curly quotes are normalised', () => {
    expect(classifyEventTypes('People’s Bank of China holds policy rate')).toContain('CENTRAL_BANK');
  });

  it('GDELT themes: only the documented ones change the result', () => {
    expect(classifyEventTypes('Cardoso: Inflation must fall to single digits', ['AGRICULTURE', 'ECON_CENTRALBANK'])).toEqual(['MACRO_DATA', 'CENTRAL_BANK']);
    expect(classifyEventTypes('Wallet maker pulls devices from stores', ['CYBER_ATTACK', 'ECON_BITCOIN'])).toEqual(['HACK_EXPLOIT']);
    expect(classifyEventTypes('Wallet maker pulls devices from stores', ['CYBER_ATTACK'])).toEqual(['OTHER']);
    expect(classifyEventTypes('Wallet maker pulls devices from stores', ['ECON_BITCOIN'])).toEqual(['OTHER']);
    // inflation / monetary-policy / Fed-policy themes are NOT used (fire on any mention)
    expect(classifyEventTypes('Weekly market wrap', ['ECON_INFLATION', 'EPU_CATS_MONETARY_POLICY', 'EPU_POLICY_FEDERAL_RESERVE'])).toEqual(['OTHER']);
    expect(classifyEventTypes('Weekly market wrap', [])).toEqual(['OTHER']);
  });

  it('themes of the real GKG sample rows', () => {
    const cardoso = GKG.find((r) => r.title?.startsWith('Cardoso'))!;
    expect(classifyEventTypes(cardoso.title!, cardoso.themes)).toEqual(['MACRO_DATA', 'CENTRAL_BANK']);
    const ledger = GKG.find((r) => r.title?.startsWith('PYMNTS | Ledger'))!;
    expect(classifyEventTypes(ledger.title!, ledger.themes)).toEqual(['HACK_EXPLOIT']);
    // rows that carry ECON_CENTRALBANK (their text discusses a central bank) get CENTRAL_BANK on top of the title
    // result; the inflation / Fed-policy themes of the same rows add nothing. 7 of the 11 sample rows with
    // ECON_CENTRALBANK have a title that does not name a central bank, so title-only labelling would miss them.
    const jumps = GKG.find((r) => r.title?.startsWith('September Inflation Jumps'))!;
    expect(classifyEventTypes(jumps.title!)).toEqual(['MACRO_DATA']);
    expect(classifyEventTypes(jumps.title!, jumps.themes)).toEqual(['MACRO_DATA', 'CENTRAL_BANK']);
    // ECON_BITCOIN alone (7 rows) never creates a type
    const q3 = GKG.find((r) => r.title?.startsWith('Bitcoin Just Posted'))!;
    expect(classifyEventTypes(q3.title!, q3.themes)).toEqual(['OTHER']);
  });
});

describe('tagSymbols', () => {
  const tag = (t: string) => tagSymbols(t, ALIASES);

  it('trap: TRUMP the person vs the memecoin', () => {
    expect(tag('Trump says tariffs on China will rise')).toEqual([]);
    expect(tag('TRUMP says tariffs on China will rise')).toEqual([]); // upper-case but no crypto word nearby
    expect(tag('Official Trump memecoin jumps 20% after dinner announcement')).toEqual(['TRUMPUSDT']);
    expect(tag('TRUMP token jumps 20%')).toEqual(['TRUMPUSDT']);
    expect(tag('$TRUMP rallies')).toEqual(['TRUMPUSDT']);
    expect(tag('Trump gets an ugly October surprise at the worst possible time')).toEqual([]);
  });

  it('trap: OP / Optimism', () => {
    expect(tag('OP token jumps as Optimism rolls out upgrade')).toEqual(['OPUSDT']);
    expect(tag('Optimism about the economy is fading')).toEqual([]);
    expect(tag('Op-ed: why markets fell this week')).toEqual([]);
    expect(tag('Optimism price jumps')).toEqual(['OPUSDT']);
    expect(tag('Why OP is up')).toEqual([]); // no crypto word within 2 tokens: documented miss
  });

  it('trap: LINK', () => {
    expect(tag('Chainlink price surges')).toEqual(['LINKUSDT']);
    expect(tag('LINK price surges')).toEqual(['LINKUSDT']);
    expect(tag('$LINK soars')).toEqual(['LINKUSDT']);
    expect(tag('Click this link to read the story')).toEqual([]);
    expect(tag('The LINK between the two cases')).toEqual([]);
  });

  it('trap: NEAR', () => {
    expect(tag('NEAR Protocol hits all-time high')).toEqual(['NEARUSDT']);
    expect(tag('Near-term outlook for stocks is cloudy')).toEqual([]);
    expect(tag('Elections are NEAR the end of the year')).toEqual([]);
  });

  it('trap: ETH in ETHICS, SOL in SOLUTION, ADA the law, Sui generis', () => {
    expect(tag('ETHICS panel debates new rules')).toEqual([]);
    expect(tag('A SOLUTION for payments launched')).toEqual([]);
    expect(tag('ETHEREUM and ETHER differ')).toEqual(['ETHUSDT']); // names, case-insensitive
    expect(tag('Ethereum (ETH) tops $4,000')).toEqual(['ETHUSDT']);
    expect(tag('SOL jumps 10%')).toEqual(['SOLUSDT']);
    expect(tag('The ADA requires accessible websites')).toEqual([]);
    expect(tag('ADA price rises')).toEqual(['ADAUSDT']);
    expect(tag('Sui generis ruling')).toEqual([]);
    expect(tag('$SUI breaks out')).toEqual(['SUIUSDT']);
    expect(tag('Sui price jumps')).toEqual(['SUIUSDT']);
    expect(tag('Jupiter probe finds new moon')).toEqual([]);
    expect(tag('Jupiter DEX aggregator volume')).toEqual(['JUPUSDT']);
  });

  it('longest name wins: Bitcoin Cash / Ethereum Classic', () => {
    expect(tag('Bitcoin Cash rallies')).toEqual(['BCHUSDT']);
    expect(tag('Bitcoin and Bitcoin Cash diverge')).toEqual(['BCHUSDT', 'BTCUSDT']);
    expect(tag('Ethereum Classic upgrade ships')).toEqual(['ETCUSDT']);
  });

  it('is deduplicated, sorted, case-insensitive for names, and handles possessives and all-caps', () => {
    expect(tag('Bitcoin, bitcoin and BTC; then Ethereum')).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(tag("Bitcoin's dip")).toEqual(['BTCUSDT']);
    expect(tag('BTC AND ETH SLIDE')).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(tag('')).toEqual([]);
    expect(tag('Fetch.ai joins the alliance')).toEqual(['FETUSDT']);
  });

  it('no aliases -> no tags', () => {
    expect(tagSymbols('Bitcoin', [])).toEqual([]);
  });
});

describe('gdeltTone', () => {
  it('the 5 zero rows of the real sample -> null (not "0")', () => {
    const zero = GKG.filter((r) => r.v2tone.startsWith('0,0,0,0,'));
    expect(zero.length).toBe(5);
    for (const r of zero) expect(gdeltTone(r.v2tone)).toBeNull();
  });

  it('scored rows of the real sample -> exact 4-digit strings (arithmetic in comments)', () => {
    const by = (prefix: string) => GKG.find((r) => r.title?.startsWith(prefix))!.v2tone;
    // 0.4739336492891 -> 0.4739|336 -> 0.4739
    expect(gdeltTone(by('Bishop Duffy'))).toBe('0.4739');
    // -1.15321252059308 -> -1.1532|125 -> -1.1532
    expect(gdeltTone(by('Inflation sizzled'))).toBe('-1.1532');
    // -3.79746835443038 -> -3.7974|68 -> rounds half up (away from zero for Dec ROUND_HALF_UP) -> -3.7975
    expect(gdeltTone(by('Inflation Rises Again'))).toBe('-3.7975');
    // 1.49911816578483 -> 1.4991|18 -> 1.4991
    expect(gdeltTone(by('Everything Meghan'))).toBe('1.4991');
    // 5.17241379310345 -> 5.1724|1379 -> 5.1724
    expect(gdeltTone(by('Markle bridge'))).toBe('5.1724');
    // tone exactly "0" but pos/neg non-zero: a real score of zero, not unscored -> "0.0000"
    expect(gdeltTone(by('Bitcoin Just Posted'))).not.toBeNull();
  });

  it('inline cases: zero tone with scores is "0.0000", never null; "-0.0000" is normalised', () => {
    expect(gdeltTone('0,1.5,1.5,3,0,0,10')).toBe('0.0000');
    expect(gdeltTone('-0.00001,1,1.00001,2,0,0,10')).toBe('0.0000');
    expect(gdeltTone('1.5,3,1.5,4.5,0,0,10')).toBe('1.5000');
    expect(gdeltTone('2.5,3,0,3,0,0,10')).toBe('2.5000');
    expect(gdeltTone('-2,0,2,2,0,0,10')).toBe('-2.0000');
  });

  it('unscored (pos = 0 and neg = 0) is null even if the tone field is not 0', () => {
    expect(gdeltTone('1.2,0,0,0,0,0,10')).toBeNull();
    expect(gdeltTone('0,0.0,0.0,0,0,0,10')).toBeNull();
  });

  it('malformed strings -> null', () => {
    for (const bad of ['', 'abc', '1,2', '1,2,x', '1e-5,1,1,2,0,0,1', ',,,', 'NaN,1,1', '1,1,Infinity,0,0,0,1', ' ']) expect(gdeltTone(bad), bad).toBeNull();
  });
});

describe('toneBucket', () => {
  it('threshold is inclusive at +-1.5 on the stored value', () => {
    expect(toneBucket('1.5000')).toBe('POSITIVE');
    expect(toneBucket('1.5')).toBe('POSITIVE');
    expect(toneBucket('1.4999')).toBe('NEUTRAL');
    expect(toneBucket('-1.5000')).toBe('NEGATIVE');
    expect(toneBucket('-1.4999')).toBe('NEUTRAL');
    expect(toneBucket('0.0000')).toBe('NEUTRAL');
    expect(toneBucket('-3.7975')).toBe('NEGATIVE');
    expect(toneBucket('5.1724')).toBe('POSITIVE');
  });

  it('null and malformed are UNSCORED, never NEUTRAL', () => {
    expect(toneBucket(null)).toBe('UNSCORED');
    expect(toneBucket('x')).toBe('UNSCORED');
    expect(toneBucket('')).toBe('UNSCORED');
  });

  it('real sample rows end to end', () => {
    const buckets = GKG.map((r) => toneBucket(gdeltTone(r.v2tone)));
    expect(buckets.filter((b) => b === 'UNSCORED').length).toBe(5);
    expect(buckets[0]).toBe('NEUTRAL'); // Bishop Duffy 0.4739
  });
});

describe('canonicalUrl', () => {
  const base = 'https://www.coindesk.com/markets/2026/10/14/story';

  it('variants of the same article give the same key', () => {
    const variants = [
      base,
      `${base}/`,
      `${base}?utm_source=twitter&utm_medium=social&utm_campaign=x`,
      `${base}/?fbclid=abc123#comments`,
      'HTTPS://WWW.COINDESK.COM/markets/2026/10/14/story',
      `${base}?gclid=1&mc_cid=2&mc_eid=3&ref=home&cmpid=9`,
      'https://www.coindesk.com:443/markets/2026/10/14/story',
      'https://user:pw@www.coindesk.com/markets/2026/10/14/story',
      `  ${base}  `,
    ];
    for (const v of variants) expect(canonicalUrl(v), v).toBe(base);
  });

  it('keeps and sorts the remaining parameters', () => {
    expect(canonicalUrl('https://x.com/a?b=2&a=1&utm_term=t')).toBe('https://x.com/a?a=1&b=2');
    expect(canonicalUrl('https://x.com/a?a=1&b=2')).toBe('https://x.com/a?a=1&b=2');
    expect(canonicalUrl('https://x.com/p?id=7&utm_campaign=z')).toBe('https://x.com/p?id=7');
    expect(canonicalUrl('https://x.com/p?id=7&id=3')).toBe('https://x.com/p?id=3&id=7');
  });

  it('root keeps its slash; other trailing slashes go; case of the path is preserved', () => {
    expect(canonicalUrl('https://x.com')).toBe('https://x.com/');
    expect(canonicalUrl('https://x.com/')).toBe('https://x.com/');
    expect(canonicalUrl('https://x.com/A/B//')).toBe('https://x.com/A/B');
  });

  it('only http/https; anything else, empty, garbage or over 2048 characters -> null', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.com/a', 'file:///etc/passwd', '', 'not a url', 'https://']) {
      expect(canonicalUrl(bad), bad).toBeNull();
    }
    expect(canonicalUrl(`https://x.com/${'a'.repeat(2048)}`)).toBeNull();
    expect(canonicalUrl(`https://x.com/${'a'.repeat(2000)}`)).not.toBeNull();
  });

  it('real sample links are accepted and stable (idempotent)', () => {
    const xml = readFileSync(here(`${TESTDATA}rss/coindesk.xml`), 'utf8');
    const links = [...xml.matchAll(/<link>([^<]+)<\/link>/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThanOrEqual(12);
    for (const l of links) {
      const c = canonicalUrl(l);
      expect(c, l).not.toBeNull();
      expect(canonicalUrl(c!)).toBe(c);
    }
  });
});

describe('titleFingerprint', () => {
  it('same story republished with an outlet suffix/prefix gets the same fingerprint', () => {
    const t = "Bitcoin Just Posted Its Best Q3 Since 2017. If History Is Any Guide, Here's What Comes Next for Bitcoin.";
    const f = titleFingerprint(t);
    expect(f).toBe('bitcoin just posted its best q3 since 2017 if history is any guide here s what comes next for bitcoin');
    expect(titleFingerprint(`${t} - The Motley Fool`)).toBe(f);
    expect(titleFingerprint(`${t} | AOL.com`)).toBe(f);
    expect(titleFingerprint(`${t} – Yahoo Finance`)).toBe(f);
    expect(titleFingerprint(t.toUpperCase())).toBe(f);
  });

  it('the two GKG copies of the same title match (aol/fool style reposts)', () => {
    const rows = GKG.filter((r) => r.title?.startsWith('Bitcoin Just Posted'));
    expect(rows.length).toBe(2);
    expect(titleFingerprint(rows[0]!.title!)).toBe(titleFingerprint(rows[1]!.title!));
  });

  it('quote style, HTML entities and dashes do not matter', () => {
    expect(titleFingerprint("Don’t Panic: Bitcoin's Dip")).toBe(titleFingerprint('Don&#39;t Panic: Bitcoin&#x27;s Dip'));
    expect(titleFingerprint('Inflation sizzled in September &#x2014; and Social Security benefits will get a boost')).toBe(
      titleFingerprint('Inflation sizzled in September — and Social Security benefits will get a boost'),
    );
    expect(titleFingerprint('Fed   holds\trates')).toBe('fed holds rates');
  });

  it('outlet in front: "PYMNTS | Headline" equals "Headline - PYMNTS.com"', () => {
    expect(titleFingerprint('PYMNTS | Ledger Suspends Southeast Asian Resellers During Hack Probe')).toBe(
      titleFingerprint('Ledger Suspends Southeast Asian Resellers During Hack Probe - PYMNTS.com'),
    );
    expect(titleFingerprint('Cardoso: Inflation must fall to single digits, woos investors – The Sun Nigeria')).toBe(
      titleFingerprint('Cardoso: Inflation must fall to single digits, woos investors'),
    );
  });

  it('different stories stay different, a long subtitle is not stripped, accents fold', () => {
    expect(titleFingerprint('SEC Charges Meyer Global Management and Its CEO')).not.toBe(titleFingerprint('SEC Charges Two Individuals With Orchestrating Fraud'));
    expect(titleFingerprint('Bitcoin falls - and analysts say the worst is not over yet')).toContain('analysts say the worst is not over yet');
    expect(titleFingerprint('Café Crypto Résumé')).toBe(titleFingerprint('Cafe Crypto Resume'));
  });

  it('real titles: all 72 RSS titles are pairwise distinct', () => {
    const all = ['coindesk', 'cointelegraph', 'decrypt', 'fed', 'sec', 'theblock'].flatMap(rssTitles);
    expect(all.length).toBe(72);
    expect(new Set(all.map(titleFingerprint)).size).toBe(72);
  });
});

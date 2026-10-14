/**
 * Module N, batch N2a: pure, deterministic news labelling (no I/O, no network, no clock, no contracts import).
 *
 * Everything here is a RULE, not a model: the same title always gives the same labels. The rules are frozen per
 * `NEWS_CLASSIFIER_VERSION`; changing any keyword table, threshold or alias below means a NEW version string
 * (stored on every news item as `classifierVersion`), never a silent edit, because point-in-time backtests
 * replay stored labels and must know which rules produced them.
 *
 * Titles only (never article text). English keyword tables. Matching is word-bounded; case rules are stated per
 * table. Nothing here decides a trade direction; it only labels.
 */
import { Dec, isDecimalString } from './decimal.ts';

/** Version of every rule in this file (event keyword tables, GDELT theme list, ambiguity list, tone threshold). */
export const NEWS_CLASSIFIER_VERSION = 'news-rules-v1';

/**
 * Same ten values, same order as `NewsEventType` in `packages/contracts/src/analysis.ts` (core must not import
 * contracts; the server asserts equality in a test on its side).
 */
export const NEWS_EVENT_TYPES = [
  'MACRO_DATA',
  'CENTRAL_BANK',
  'REGULATORY_ACTION',
  'ETF',
  'HACK_EXPLOIT',
  'LISTING',
  'DELISTING',
  'EXCHANGE_INCIDENT',
  'ADOPTION',
  'OTHER',
] as const;
export type NewsEventTypeCode = (typeof NEWS_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------------------------------------------
// URL canonicalisation and title fingerprint (de-duplication keys)
// ---------------------------------------------------------------------------------------------------------------

const MAX_URL_LENGTH = 2048;
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'cmpid']);

/**
 * Canonical form of an article URL, used as the unique key `url_canonical`.
 * http/https only (anything else, including `javascript:`/`data:`, -> null). Lower-case host (the URL parser also
 * drops default ports), no fragment, no credentials, tracking parameters removed (`utm_*`, fbclid, gclid, mc_cid,
 * mc_eid, ref, cmpid), remaining parameters sorted by (key, value), trailing `/` removed except for the bare root.
 * The scheme is kept as given (http and https are NOT merged: the stored link must stay a link that works).
 * More than 2048 characters or an unparsable URL -> null.
 */
export function canonicalUrl(url: string): string | null {
  const raw = url.trim();
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.hostname.length === 0) return null;
  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    const key = k.toLowerCase();
    if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) continue;
    kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');
  if (path.length === 0) path = '/';
  const query = kept.length > 0 ? `?${new URLSearchParams(kept).toString()}` : '';
  const out = `${u.protocol}//${u.host}${path}${query}`;
  return out.length > MAX_URL_LENGTH ? null : out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** " - CoinDesk", " | PYMNTS", " – The Sun Nigeria": a short outlet name after the last separator. */
const OUTLET_SUFFIX = /\s+[-–—|]\s+([^-–—|:]{1,40})$/;
/** "PYMNTS | Headline": a short outlet name before the first pipe. */
const OUTLET_PREFIX = /^([^|]{1,30})\s+\|\s+/;

/**
 * Dedup key for the same story republished by several outlets: decode HTML entities, drop a trailing outlet name
 * (` - X` / ` | X` / en and em dash, at most 4 words and 40 characters, headline left with at least 15 characters)
 * and a leading `Outlet | `, then NFKD, strip combining marks, lower-case, replace every non letter/digit with a
 * space and collapse spaces. Quote style, entity encoding and punctuation do not change the result.
 */
export function titleFingerprint(title: string): string {
  let t = decodeEntities(title).trim();
  const suffix = OUTLET_SUFFIX.exec(t);
  if (suffix && suffix[1] !== undefined && suffix[1].trim().split(/\s+/).length <= 4 && t.length - suffix[0].length >= 15) {
    t = t.slice(0, t.length - suffix[0].length);
  }
  const prefix = OUTLET_PREFIX.exec(t);
  if (prefix && t.length - prefix[0].length >= 15) t = t.slice(prefix[0].length);
  return t
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Symbol tagging
// ---------------------------------------------------------------------------------------------------------------

export interface SymbolAlias {
  /** Pair symbol, e.g. `BTCUSDT`. */
  symbol: string;
  /** Ticker, e.g. `BTC`. */
  ticker: string;
  /** Names matched case-insensitively on word boundaries, e.g. `Bitcoin`. */
  names: string[];
}

/** Extra names per ticker on top of the catalog name (facts: how the press actually writes the coin). */
const EXTRA_NAMES: Record<string, string[]> = {
  ETH: ['Ether'],
  BNB: ['BNB Chain'],
  ATOM: ['Cosmos'],
  CRV: ['Curve'],
  LDO: ['Lido'],
  FET: ['Fetch.ai'],
};

/**
 * Tickers whose letters are also ordinary words or other things (TRUMP the person, OP, NEAR, LINK, DOT, ADA the
 * law, ...). They match only as `$TICKER`, or as an UPPER-CASE token / name that has a crypto word within two
 * tokens (see CRYPTO_CONTEXT). This is the required list of the plan plus ADA, ETC, APT, VIRTUAL.
 */
const AMBIGUOUS_TICKERS: ReadonlySet<string> = new Set([
  'TRUMP', 'OP', 'NEAR', 'LINK', 'SUI', 'SEI', 'DOT', 'RENDER', 'UNI', 'ONDO', 'WIF', 'PENGU', 'BONK', 'FET', 'TIA',
  'ICP', 'JUP', 'STX', 'ENA', 'POL', 'ALGO', 'ATOM', 'FIL', 'LDO', 'CRV', 'ADA', 'ETC', 'APT', 'VIRTUAL',
]);

/** Coin names that are also common words: matched only next to a crypto word (case-insensitive). */
const COMMON_WORD_NAMES: ReadonlySet<string> = new Set([
  'optimism', 'sui', 'sei', 'render', 'jupiter', 'stacks', 'curve', 'cosmos', 'near', 'bonk', 'ondo', 'lido',
]);

/** A crypto word within two tokens (before or after) of an ambiguous match makes it a coin mention. */
const CRYPTO_CONTEXT: ReadonlySet<string> = new Set([
  'token', 'tokens', 'coin', 'coins', 'crypto', 'cryptocurrency', 'cryptocurrencies', 'blockchain', 'memecoin',
  'memecoins', 'meme', 'price', 'protocol', 'defi', 'airdrop', 'staking', 'layer', 'l2', 'rollup', 'altcoin',
  'altcoins', 'mainnet', 'onchain', 'wallet', 'dex', 'nft', 'usdt', 'foundation', 'network',
]);

/**
 * Build the alias table from the asset catalog (`{ asset, name }`; pass the catalog without the quote asset, it is
 * skipped anyway). `symbol = asset + quote`. A name equal to the ticker (BNB, FLOKI) is dropped: the ticker rule
 * (upper-case token) already covers it and a case-insensitive name match would be looser than intended.
 */
export function buildSymbolAliases(assets: { asset: string; name: string }[], quote = 'USDT'): SymbolAlias[] {
  const out: SymbolAlias[] = [];
  for (const a of assets) {
    if (a.asset === quote) continue;
    const names: string[] = [];
    for (const n of [a.name, ...(EXTRA_NAMES[a.asset] ?? [])]) {
      const name = n.trim();
      if (name.length > 0 && name !== a.asset && !names.includes(name)) names.push(name);
    }
    out.push({ symbol: `${a.asset}${quote}`, ticker: a.asset, names });
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface NameMatcher {
  symbol: string;
  ticker: string;
  re: RegExp;
  name: string;
}

const matcherCache = new WeakMap<readonly SymbolAlias[], NameMatcher[]>();

function nameMatchers(aliases: readonly SymbolAlias[]): NameMatcher[] {
  let m = matcherCache.get(aliases);
  if (m) return m;
  m = [];
  for (const a of aliases) {
    for (const name of a.names) {
      m.push({
        symbol: a.symbol,
        ticker: a.ticker,
        name,
        re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'),
      });
    }
  }
  matcherCache.set(aliases, m);
  return m;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

/**
 * Extra context words accepted ONLY for an upper-case ambiguous ticker (not for common-word names): market and venue
 * words, so "Binance to delist TRUMP perpetual contracts" is TRUMPUSDT.
 */
const MARKET_CONTEXT: ReadonlySet<string> = new Set([
  'delist', 'delists', 'delisting', 'list', 'lists', 'listing', 'listed', 'perpetual', 'perpetuals', 'perp', 'perps',
  'futures', 'spot', 'pair', 'pairs', 'trading', 'binance', 'coinbase', 'okx', 'bybit', 'kraken', 'upbit', 'robinhood',
]);

function hasCryptoContext(tokens: Token[], start: number, end: number, market = false): boolean {
  let first = -1;
  let last = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.end > start && t.start < end) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return false;
  for (let i = Math.max(0, first - 2); i <= Math.min(tokens.length - 1, last + 2); i++) {
    if (i >= first && i <= last) continue;
    const w = tokens[i]!.text.toLowerCase();
    if (CRYPTO_CONTEXT.has(w) || (market && MARKET_CONTEXT.has(w))) return true;
  }
  return false;
}

/**
 * Pair symbols mentioned in a title, de-duplicated and sorted alphabetically.
 *  - ticker: `$TICKER` (any case), or an UPPER-CASE token exactly equal to the ticker ("ETH", never "ETHICS" or
 *    "SOLUTION"); for the ambiguous tickers (AMBIGUOUS_TICKERS) the upper-case token also needs crypto context;
 *  - name: case-insensitive on word boundaries; names that are common words (COMMON_WORD_NAMES) need crypto
 *    context; the longest name wins inside its span, so "Bitcoin Cash" is BCH only, not BTC.
 * "Trump says tariffs ..." is not TRUMP; "Official Trump memecoin jumps" is.
 */
export function tagSymbols(title: string, aliases: SymbolAlias[]): string[] {
  const tokens: Token[] = [];
  for (const m of title.matchAll(/[A-Za-z0-9]+/g)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  const found = new Set<string>();

  // Names first, longest span first, so a short name inside a longer accepted name is ignored.
  const spans: { start: number; end: number; symbol: string; common: boolean }[] = [];
  for (const nm of nameMatchers(aliases)) {
    nm.re.lastIndex = 0;
    for (const m of title.matchAll(nm.re)) {
      spans.push({ start: m.index, end: m.index + m[0].length, symbol: nm.symbol, common: COMMON_WORD_NAMES.has(nm.name.toLowerCase()) });
    }
  }
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const accepted: { start: number; end: number }[] = [];
  for (const s of spans) {
    if (accepted.some((x) => s.start >= x.start && s.end <= x.end)) continue;
    if (s.common && !hasCryptoContext(tokens, s.start, s.end)) continue;
    accepted.push(s);
    found.add(s.symbol);
  }

  const byTicker = new Map<string, SymbolAlias>();
  for (const a of aliases) byTicker.set(a.ticker, a);
  let eventTypes: NewsEventTypeCode[] | undefined;
  for (const t of tokens) {
    const dollar = t.start > 0 && title[t.start - 1] === '$';
    const upper = t.text.toUpperCase();
    const alias = byTicker.get(upper);
    if (!alias) continue;
    if (dollar) {
      found.add(alias.symbol);
      continue;
    }
    if (t.text !== upper || !/[A-Z]/.test(t.text)) continue;
    if (AMBIGUOUS_TICKERS.has(alias.ticker) && !hasCryptoContext(tokens, t.start, t.end, true)) {
      // A delisting / listing / hack headline that carries the upper-case ticker is about that coin: the
      // risk gate needs the pair, so a missed tag here is worse than a rare false one.
      eventTypes ??= classifyEventTypes(title);
      if (!eventTypes.some((e) => e === 'LISTING' || e === 'DELISTING' || e === 'HACK_EXPLOIT')) continue;
    }
    found.add(alias.symbol);
  }
  return [...found].sort();
}

// ---------------------------------------------------------------------------------------------------------------
// Event type classification
// ---------------------------------------------------------------------------------------------------------------

/** A keyword entry is a regex, or a pair `[a, b]` that needs BOTH to match somewhere in the title. */
type Keyword = RegExp | readonly [RegExp, RegExp];

interface EventRule {
  type: Exclude<NewsEventTypeCode, 'OTHER'>;
  include: readonly Keyword[];
  /** Any match here vetoes the type. */
  exclude?: readonly RegExp[];
}

const SEC_VERBS =
  /\b(?:charges?|charged|sues?|sued|proposes?|proposals?|approves?|approved|rejects?|rejected|settles?|orders?|fines?|fined|bars?|barred|seeks|exempt\w*|probe|investigat\w*|subpoena\w*|lawsuit|delays?|dismiss\w*|sanctions?|warns?|bans?)\b/i;

/**
 * Keyword tables of `news-rules-v1`. A title gets every type whose table matches; no match -> OTHER.
 * All tables are case-insensitive unless a regex says otherwise (the agency/bank acronyms SEC, Fed are matched
 * case-sensitively because "sec" and "fed" are ordinary words).
 */
const EVENT_RULES: readonly EventRule[] = [
  {
    // Scheduled macro data releases and inflation/labour/growth prints.
    type: 'MACRO_DATA',
    include: [
      /\b(?:cpi|ppi|pce|gdp|pmi|nfp)\b/i,
      /\bnon-?farm payrolls?\b/i,
      /\b(?:jobs|labor|labour|employment|jobless|payrolls?)\s+(?:report|data|claims|numbers|figures)\b/i,
      /\bunemployment\b/i,
      /\binflation\b/i,
      /\bconsumer (?:price|prices|confidence|sentiment)\b/i,
      /\bproducer prices?\b/i,
      /\bwholesale price\b/i,
      /\bretail sales\b/i,
    ],
    exclude: [/\binflation[- ]hedge\b/i, /\bhedge against inflation\b/i],
  },
  {
    // Monetary policy and central banks acting as monetary authorities (a central bank acting as a licensing
    // regulator is REGULATORY_ACTION, not this).
    type: 'CENTRAL_BANK',
    include: [
      /\b(?:fomc|federal open market committee)\b/i,
      /\bdiscount rate\b/i,
      /\b(?:Fed|FED)\b/,
      /\bfederal reserve\b.{0,40}\b(?:rates?|policy|chair|minutes|meeting|governor|cuts?|hikes?|balance sheet)\b/i,
      /\b(?:rates?|policy|chair|minutes|governor)\b.{0,40}\bfederal reserve\b/i,
      /\b(?:ecb|boj|boe|pboc|snb)\b/i,
      /\b(?:european central bank|bank of japan|bank of england|people'?s bank of china|swiss national bank|bank of canada|reserve bank of (?:australia|india|new zealand))\b/i,
      /\bcentral bank\b(?! digital).{0,40}\b(?:rates?|policy|governor|chair|cuts?|hikes?|decision|meeting|minutes|hawkish|dovish|holds?|raises?|lowers?)\b/i,
      /\b(?:rates?|policy|governor|chair)\b.{0,30}\bcentral bank\b/i,
      /\b(?:rate (?:hikes?|cuts?|decisions?|rises?)|interest rates?|monetary policy|quantitative (?:tightening|easing))\b/i,
      /\b(?:hawkish|dovish)\b/i,
      /\bpowell\b/i,
    ],
  },
  {
    // Regulators, courts, licences and rulemaking.
    type: 'REGULATORY_ACTION',
    include: [
      [/\bSEC\b/, SEC_VERBS],
      [/\b(?:CFTC|DOJ|FTC|OFAC|FinCEN|IRS|FCA|ESMA)\b/, SEC_VERBS],
      /\b(?:lawsuits?|sued|sues|suing|indict\w*|interpol|red notice|detained|subpoena\w*|enforcement action|supreme court|court|judge|trial|sentenc\w+|convict\w+|plead\w*)\b/i,
      /\b(?:licen[sc]e[sd]?|licen[sc]ing|unlicensed|revocation|revoked|revokes?)\b/i,
      /\b(?:MiCA|GENIUS Act|CLARITY Act)\b/i,
      /\bregulatory\b/i,
      /\bregulation [A-Z]{1,2}\b/,
      /\b(?:comment period|public comment|money laundering|cease[- ]and[- ]desist)\b/i,
      /\bregulators?\b.{0,30}\b(?:approve\w*|ban\w*|crack\w*|warn\w*|sue\w*|fine\w*|probe\w*|investigat\w*|order\w*|halt\w*|block\w*|reject\w*)\b/i,
      /\b(?:fined|fines)\b/i,
      /\bfinalizes? (?:changes|rules?|amendments)\b/i,
    ],
  },
  {
    type: 'ETF',
    include: [/\betfs?\b/i, /\bexchange[- ]traded (?:funds?|products?)\b/i],
  },
  {
    type: 'HACK_EXPLOIT',
    include: [
      /\b(?:hack(?:s|ed|er|ers|ing)?|exploit(?:s|ed)?|drain(?:s|ed)?|stole|stolen|steals|theft|heist|breach(?:ed|es)?|rug[- ]?pulls?|rug[- ]?pulled|phishing|vulnerabilit(?:y|ies)|compromised)\b/i,
    ],
    exclude: [/\bbrain drain\b/i],
  },
  {
    // The venue announces a NEW listing. A company's own stock listing/IPO is not this.
    type: 'LISTING',
    include: [
      /\b(?:will list|to list|lists|listing (?:on|of)|(?:new|spot|futures|perpetual) listings?|now (?:live|trading|available) on|adds? support for)\b/i,
    ],
    exclude: [
      /\blist\w*\b.{0,20}\b(?:nasdaq|nyse|stock exchange|ipo)\b/i,
      /\b(?:ipo|nasdaq|nyse|public)\b.{0,20}\blist\w*\b/i,
      /\bdelist/i,
    ],
  },
  {
    type: 'DELISTING',
    include: [
      /\bdelist(?:s|ed|ing|ings)?\b/i,
      /\b(?:removes?|removing|will remove)\b.{0,40}\btrading pairs?\b/i,
      /\bmonitoring tag\b/i,
      /\b(?:discontinues?|ends?|terminates?) support for\b/i,
    ],
  },
  {
    // The venue itself failing: outage, frozen withdrawals, insolvency. A hack of the venue is HACK_EXPLOIT.
    type: 'EXCHANGE_INCIDENT',
    include: [
      /\b(?:outage|downtime|glitch|maintenance|insolvency|insolvent)\b/i,
      /\b(?:halts?|halted|suspends?|suspended|pauses?|paused|freezes?|froze|frozen)\s+(?:all\s+|crypto\s+|user\s+)?(?:trading|withdrawals?|deposits?|transfers?)\b/i,
      /\b(?:trading|withdrawals?|deposits?)\s+(?:halted|suspended|paused|frozen|delayed)\b/i,
      /\b(?:exchange|lender|platform|custodian|binance|coinbase|kraken|bybit|okx|bitget|ftx)\b.{0,60}\b(?:bankrupt\w*|files? for (?:chapter 11|bankruptcy))\b/i,
    ],
  },
  {
    // Real-world uptake: institutions, treasuries, payments, tokenisation.
    type: 'ADOPTION',
    include: [
      /\badopt(?:s|ed|ing|ion)\b/i,
      /\btokeni[sz](?:e|es|ed|ing|ation)\b/i,
      /\bstablecoin (?:settlement|payments?|adoption)\b/i,
      /\b(?:crypto|bitcoin|btc|stablecoin) (?:payments?|remittances?)\b/i,
      /\b(?:buys|bought|purchases|purchased|acquires|acquired)\b.{0,40}\b(?:bitcoin|btc|ether|eth|xrp|solana)\b/i,
      /\b(?:bitcoin|btc|ether|eth|xrp|sol|solana|crypto|token) treasur(?:y|ies)\b/i,
      /\b(?:strategic (?:bitcoin |crypto )?reserve|bitcoin reserve)\b/i,
      /\bpartner(?:s|ship|ships|ing)?\b.{0,50}\b(?:wallets?|stablecoins?|crypto|bitcoin|xrp|blockchain)\b/i,
      /\b(?:institutional|professional investors|embedded wallets?)\b/i,
    ],
  },
];

function keywordMatches(k: Keyword, title: string): boolean {
  return Array.isArray(k) ? k[0].test(title) && k[1].test(title) : (k as RegExp).test(title);
}

/**
 * GDELT GKG themes used by `classifyEventTypes`, and nothing else (themes are tagged from full article text, so
 * only subject-level themes are trusted):
 *  - `CYBER_ATTACK` together with `ECON_BITCOIN` -> HACK_EXPLOIT
 * Central-bank, inflation, monetary-policy and Fed-policy themes are deliberately NOT used: they fire whenever an
 * article merely mentions the topic (7 of 11 sample rows with ECON_CENTRALBANK are not about a central bank), so
 * CENTRAL_BANK comes from the title only.
 */
export const GDELT_THEMES_USED: readonly string[] = ['CYBER_ATTACK', 'ECON_BITCOIN'];

/**
 * Event types of a news title (plus, optionally, its GDELT themes). Can return several types, in
 * `NEWS_EVENT_TYPES` order; NEVER empty: when nothing is sure the answer is `['OTHER']`.
 */
export function classifyEventTypes(title: string, gdeltThemes?: readonly string[]): NewsEventTypeCode[] {
  const t = title.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const hit = new Set<NewsEventTypeCode>();
  for (const rule of EVENT_RULES) {
    if (rule.exclude?.some((re) => re.test(t))) continue;
    if (rule.include.some((k) => keywordMatches(k, t))) hit.add(rule.type);
  }
  if (gdeltThemes && gdeltThemes.length > 0) {
    const themes = new Set(gdeltThemes.map((x) => x.trim()));
    if (themes.has('CYBER_ATTACK') && themes.has('ECON_BITCOIN')) hit.add('HACK_EXPLOIT');
  }
  const out = NEWS_EVENT_TYPES.filter((x) => x !== 'OTHER' && hit.has(x));
  return out.length > 0 ? out : ['OTHER'];
}

// ---------------------------------------------------------------------------------------------------------------
// GDELT tone
// ---------------------------------------------------------------------------------------------------------------

/**
 * GKG V2Tone: `tone,positive,negative,polarity,activityDensity,selfGroupDensity,wordCount`.
 * Returns the tone (positive minus negative score) as a decimal string with 4 digits ("-1.1532"), computed with
 * `Dec`, never floats. Returns `null` when the article is unscored (positive = 0 AND negative = 0; the N0 sample
 * had 4.8% of those) or when the string is malformed (fewer than 3 fields, not plain decimals). null is NOT "0".
 */
export function gdeltTone(v2Tone: string): string | null {
  const parts = v2Tone.split(',').map((p) => p.trim());
  if (parts.length < 3) return null;
  const [toneS, posS, negS] = parts as [string, string, string];
  if (!isDecimalString(toneS) || !isDecimalString(posS) || !isDecimalString(negS)) return null;
  const pos = new Dec(posS);
  const neg = new Dec(negS);
  if (pos.isZero() && neg.isZero()) return null;
  const out = new Dec(toneS).toFixed(4);
  return /^-0\.0+$/.test(out) ? out.slice(1) : out;
}

/**
 * Bucket threshold of `news-rules-v1`: a stored tone (4-digit string) of at least +1.5 is POSITIVE, at most -1.5 is
 * NEGATIVE, anything between is NEUTRAL. Fixed before any measurement; changing it is a new classifier version.
 */
export const TONE_THRESHOLD = '1.5';

export type ToneBucket = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNSCORED';

/** null (or a malformed string) is UNSCORED, never NEUTRAL. The comparison uses the stored 4-digit value. */
export function toneBucket(tone: string | null): ToneBucket {
  if (tone === null || !isDecimalString(tone)) return 'UNSCORED';
  const d = new Dec(tone);
  const th = new Dec(TONE_THRESHOLD);
  if (d.gte(th)) return 'POSITIVE';
  if (d.lte(th.neg())) return 'NEGATIVE';
  return 'NEUTRAL';
}

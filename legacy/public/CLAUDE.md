# Claude Code Guidelines - Crypto Intelligence & Autonomous Trading System

## Project Overview
This project is a production-grade Crypto Market Intelligence, Quantitative Signal Detection, Risk Management, and AI Investment Committee application. It combines real-time and historical multi-asset data feeds (Binance Spot & Futures, DeFiLlama), an in-process SQLite/LibSQL database with Drizzle ORM, a deterministic Confluence Setup Engine (Price Action, SMC, Relative Strength, Derivatives, Whales), and an interactive React frontend.

## Tech Stack
- **Backend / Server**: Node.js, Express, TypeScript (`tsx server.ts`)
- **Frontend**: React 19, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts
- **Database & ORM**: LibSQL / SQLite (`crypto_intelligence.db`), Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Data Providers**:
  - Binance Spot API (public REST klines, tickers)
  - Binance Futures API (open interest, funding rates, long/short ratio)
  - DeFiLlama API (chain TVL, stablecoins)
- **AI Engine**: Gemini 2.5 (`@google/genai`) server-side for AI Investment Committee syntheses

## Core Project Rules & Invariants (CRITICAL)
1. **NULL / UNAVAILABLE != 0**:
   - Never replace missing or unavailable provider data with `0`.
   - Never use `|| 0` or `?? 0` on real market data (e.g. quoteVolume, fundingRate, liquidations, TVL).
   - If a provider does not provide a metric, store `NULL` or set status to `DATA_UNAVAILABLE`.
2. **Zero Fabrication & Anti-Hallucination**:
   - No mock prices, mock volumes, or mock funding rates in the database or production feeds.
   - Never extrapolate metrics with arbitrary multipliers (e.g. never calculate basis as `fundingRate * 250`, never calculate 24h OI change by multiplying 4h OI change).
   - Real zero (e.g. genuine 0 volume or 0 change) must be distinguishable from NULL (unavailable).
3. **Point-in-Time & Look-Ahead Protection**:
   - Historical candle timestamps (`bucketTimestamp`) must strictly represent the opening boundary in UTC.
   - `observedAt` must represent when the candle closed or when the event was observed, preventing future leakage into backtests and signal models.
4. **Idempotent Ingestion**:
   - Ingestion scripts must use `onConflictDoNothing()` or idempotent updates. Running ingestion twice must insert 0 duplicates.

---

## Current Project Status & Progress

### Phase 1: Architecture & UI Prototype (COMPLETED)
- Full interactive UI with Scanner, Candle Chart, Derivatives Hub, Rotation View, Whale Radar, Provider Health, Backtest, and AI Committee.
- Real-time frontend components connected to Express API endpoints.

### Phase 2: Production Data Ingestion & Adversarial Audit (COMPLETED & VERIFIED)
- **Database Schema**: `server/db/schema.ts` with 20 Universe Assets (`asset_universe_registry`), 54,000 OHLCV candles (`market_ohlcv_candles`), derivatives snapshots, ecosystem snapshots, whale events, and health metrics.
- **Backfill Ingestion**: `server/ingestion/BackfillService.ts` with 90 days of 1h and 4h contiguous candles for 20 active pairs.
- **Integrity Audit**:
  - 54,000 candles total (2160 x 1h + 540 x 4h per asset across 90 days)
  - Interval gaps = 0
  - Duplicate candles = 0
  - Out of range records = 0
  - Zero fabricated values = 0
  - Schema constraints and indexes verified
  - Replay, deduplication, restart persistence, look-ahead tests all PASSED.
- **Pass Status**: `PHASE_2_DATA_FOUNDATION_READY_FOR_PHASE_3`

---

## Next Phase: Phase 3 Roadmap & Requirements

When continuing development into Phase 3, implement:
1. **Feature Engineering & Technical Analysis Core**:
   - Multi-timeframe indicators (EMA 20/50/200, ATR, RSI, Bollinger Bands, Volume Profile).
   - Deterministic calculations on the verified 54,000 candles in `crypto_intelligence.db`.
2. **Smart Money Concepts (SMC) Engine**:
   - Order Blocks (OB), Fair Value Gaps (FVG), Liquidity Sweeps (BSL/SSL), Break of Structure (BOS), Change of Character (CHoCH).
3. **Confluence & Setup Detector**:
   - Multi-factor scoring (Price Action, SMC, Relative Strength vs BTC/ETH, Derivatives OI/Funding, Regime).
   - Output high-conviction LONG/SHORT/NEUTRAL trade setups.
4. **Historical Backtesting Engine**:
   - Strict point-in-time simulation over the 90-day 1h and 4h historical dataset.
   - Walk-forward or event-driven execution with slippage and fee models.
   - PnL metrics, win rate, profit factor, drawdown, Sharpe ratio.

---

## Common Development Commands

```bash
# Install dependencies
npm install

# Start dev server (Express backend + Vite frontend on port 3000)
npm run dev

# Run TypeScript type check (must have 0 errors)
npm run lint

# Build production bundle
npm run build

# Run database audit / integrity verification
npx tsx server/tests/comprehensive_audit.ts
npx tsx server/tests/phase2_strict_audit.ts

# Run backfill ingestion
npx tsx server/tests/run_full_phase2.ts
```

## Key Directory Structure
```
/
├── CLAUDE.md                           # Claude Code configuration & guidelines
├── PROJECT_HANDOVER_REPORT.md          # Comprehensive progress & handover report
├── crypto_intelligence.db              # SQLite database (54k candles, universe, snapshots)
├── drizzle.config.ts                   # Drizzle configuration
├── package.json
├── server.ts                           # Express server & API routes
├── server/
│   ├── db/
│   │   ├── schema.ts                   # Database schema definitions & tables
│   │   └── client.ts                   # LibSQL / SQLite client & Drizzle connection
│   ├── ingestion/
│   │   └── BackfillService.ts          # Historical OHLCV & snapshot ingestion service
│   ├── universe/
│   │   └── UniverseManager.ts          # 20 active universe assets + inactive tracking
│   ├── providers/
│   │   ├── BinanceSpotProvider.ts      # Binance Spot REST provider (klines, tickers)
│   │   ├── BinanceFuturesProvider.ts   # Binance Futures provider (OI, funding, LS ratio)
│   │   ├── DeFiLlamaProvider.ts        # DeFiLlama TVL & Stablecoins provider
│   │   ├── MarketRegimeEngine.ts       # Deterministic market breadth & regime engine
│   │   ├── ProviderHealthService.ts    # Telemetry and latency tracking
│   │   └── types.ts                    # Normalized provider interfaces
│   └── tests/
│       ├── comprehensive_audit.ts      # Database metric inspection script
│       └── phase2_strict_audit.ts      # Adversarial data integrity gate tests
└── src/
    ├── App.tsx                         # Main React application
    ├── components/                     # Dashboard tabs & UI views
    ├── engine/                         # Confluence, backtest, and scoring engines
    └── types/crypto.ts                 # Frontend shared types
```

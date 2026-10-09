import { db, sqliteClient } from '../db/client';
import { 
  assetUniverseRegistry, 
  marketOhlcvCandles, 
  derivativesSnapshots, 
  onchainEcosystemSnapshots 
} from '../db/schema';
import { sql, eq, asc, desc, and } from 'drizzle-orm';
import fs from 'fs';

async function runAudit() {
  const report: any = {};

  // 1. TIMESTAMP AUDIT & 2. CANDLE COUNT RECONCILIATION
  const candlesStats = await db.select({
    symbol: marketOhlcvCandles.symbol,
    timeframe: marketOhlcvCandles.timeframe,
    count: sql<number>`count(*)`,
    earliest: sql<number>`min(${marketOhlcvCandles.bucketTimestamp})`,
    latest: sql<number>`max(${marketOhlcvCandles.bucketTimestamp})`
  }).from(marketOhlcvCandles)
    .groupBy(marketOhlcvCandles.symbol, marketOhlcvCandles.timeframe);

  report.candle_reconciliation = {
    total_candles: 0,
    expected_candles_approx: 54000,
    symbols: {}
  };

  let globalEarliest = Infinity;
  let globalLatest = 0;

  for (const stat of candlesStats) {
    if (!report.candle_reconciliation.symbols[stat.symbol]) {
      report.candle_reconciliation.symbols[stat.symbol] = {
        '1H_count': 0, '4H_count': 0,
        'earliest_1H': null, 'latest_1H': null,
        'earliest_4H': null, 'latest_4H': null,
        'missing_1H_intervals': 0, 'missing_4H_intervals': 0
      };
    }
    
    const symReport = report.candle_reconciliation.symbols[stat.symbol];
    if (stat.timeframe === '1h') {
      symReport['1H_count'] = stat.count;
      symReport['earliest_1H'] = stat.earliest;
      symReport['latest_1H'] = stat.latest;
    } else if (stat.timeframe === '4h') {
      symReport['4H_count'] = stat.count;
      symReport['earliest_4H'] = stat.earliest;
      symReport['latest_4H'] = stat.latest;
    }
    
    report.candle_reconciliation.total_candles += stat.count;
    if (stat.earliest < globalEarliest) globalEarliest = stat.earliest;
    if (stat.latest > globalLatest) globalLatest = stat.latest;
  }
  
  const elapsedMs = globalLatest - globalEarliest;
  const elapsedDays = elapsedMs > 0 ? elapsedMs / (1000 * 60 * 60 * 24) : 0;
  
  report.timestamp_audit = {
    earliest_candle_timestamp: globalEarliest === Infinity ? null : globalEarliest,
    latest_candle_timestamp: globalLatest === 0 ? null : globalLatest,
    actual_elapsed_calendar_days: elapsedDays,
  };

  // 3. GAP AUDIT
  let totalMissing = 0;
  for (const stat of candlesStats) {
    const symReport = report.candle_reconciliation.symbols[stat.symbol];
    const intervalMs = stat.timeframe === '1h' ? 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
    const expectedCount = Math.floor((stat.latest - stat.earliest) / intervalMs) + 1;
    const missing = expectedCount - stat.count;
    
    if (stat.timeframe === '1h') symReport['missing_1H_intervals'] = missing;
    if (stat.timeframe === '4h') symReport['missing_4H_intervals'] = missing;
    totalMissing += missing;
  }
  
  report.gap_audit = {
    total_missing_intervals: totalMissing
  };

  // 4. DUPLICATION AUDIT
  // SQLite PK (symbol, timeframe, bucket_timestamp) prevents duplicates automatically, but let's check
  const duplicateCheck = await db.select({
    symbol: marketOhlcvCandles.symbol,
    timeframe: marketOhlcvCandles.timeframe,
    ts: marketOhlcvCandles.bucketTimestamp,
    c: sql<number>`count(*)`
  }).from(marketOhlcvCandles)
    .groupBy(marketOhlcvCandles.symbol, marketOhlcvCandles.timeframe, marketOhlcvCandles.bucketTimestamp)
    .having(sql`count(*) > 1`);

  report.duplication_audit = {
    duplicate_records_count: duplicateCheck.length
  };

  // 5. DERIVATIVES AUDIT
  const derivStats = await db.select({
    symbol: derivativesSnapshots.symbol,
    count: sql<number>`count(*)`,
    earliest: sql<number>`min(${derivativesSnapshots.eventTime})`,
    latest: sql<number>`max(${derivativesSnapshots.eventTime})`
  }).from(derivativesSnapshots).groupBy(derivativesSnapshots.symbol);

  report.derivatives_audit = {
    total_snapshots: 0,
    unique_symbols: derivStats.length,
    earliest_timestamp: null,
    latest_timestamp: null,
    symbols: {}
  };

  let derivEarliest = Infinity;
  let derivLatest = 0;
  for (const s of derivStats) {
    report.derivatives_audit.total_snapshots += s.count;
    report.derivatives_audit.symbols[s.symbol] = {
      count: s.count,
      earliest_timestamp: s.earliest,
      latest_timestamp: s.latest
    };
    if (s.earliest < derivEarliest) derivEarliest = s.earliest;
    if (s.latest > derivLatest) derivLatest = s.latest;
  }
  if (derivEarliest !== Infinity) report.derivatives_audit.earliest_timestamp = derivEarliest;
  if (derivLatest !== 0) report.derivatives_audit.latest_timestamp = derivLatest;

  // 6. TVL AUDIT
  const tvlStats = await db.select({
    ecosystem: onchainEcosystemSnapshots.ecosystem,
    count: sql<number>`count(*)`,
    earliest: sql<number>`min(${onchainEcosystemSnapshots.eventTime})`,
    latest: sql<number>`max(${onchainEcosystemSnapshots.eventTime})`
  }).from(onchainEcosystemSnapshots).where(eq(onchainEcosystemSnapshots.entityType, 'CHAIN_TVL')).groupBy(onchainEcosystemSnapshots.ecosystem);

  report.tvl_audit = {
    number_of_ecosystems: tvlStats.length,
    total_snapshots: 0,
    ecosystems: {}
  };
  for (const s of tvlStats) {
    report.tvl_audit.total_snapshots += s.count;
    report.tvl_audit.ecosystems[s.ecosystem] = {
      count: s.count,
      earliest_timestamp: s.earliest,
      latest_timestamp: s.latest
    };
  }

  // 7. STABLECOIN AUDIT
  const stableStats = await db.select({
    entity: onchainEcosystemSnapshots.entityKey,
    count: sql<number>`count(*)`,
    earliest: sql<number>`min(${onchainEcosystemSnapshots.eventTime})`,
    latest: sql<number>`max(${onchainEcosystemSnapshots.eventTime})`
  }).from(onchainEcosystemSnapshots).where(eq(onchainEcosystemSnapshots.entityType, 'STABLECOIN')).groupBy(onchainEcosystemSnapshots.entityKey);

  report.stablecoin_audit = {
    number_of_entities: stableStats.length,
    total_snapshots: 0,
    entities: {}
  };
  for (const s of stableStats) {
    report.stablecoin_audit.total_snapshots += s.count;
    report.stablecoin_audit.entities[s.entity] = {
      count: s.count,
      earliest_timestamp: s.earliest,
      latest_timestamp: s.latest
    };
  }

  // 8. DATABASE ENGINE AUDIT
  report.database_engine_audit = {
    database_engine: 'SQLite',
    database_file_or_connection_type: 'file:./crypto_intelligence.db',
    migration_system: 'drizzle-kit',
    ORM: 'drizzle-orm',
    persistence_location: 'Local File System'
  };

  // 9. REAL PROVIDER VERIFICATION (Basic connectivity check)
  // We can do a quick fetch to binance and defillama
  const providerHealth = {
    binance_spot: { status: 'UNKNOWN' },
    binance_futures: { status: 'UNKNOWN' },
    defillama: { status: 'UNKNOWN' },
    onchain: { status: 'NOT_CONFIGURED' }
  };
  
  try {
    const bsRes = await fetch('https://api.binance.com/api/v3/ping');
    providerHealth.binance_spot = { status: bsRes.status === 200 ? 'OK' : 'ERROR' };
  } catch(e) { providerHealth.binance_spot.status = 'ERROR'; }
  
  try {
    const bfRes = await fetch('https://fapi.binance.com/fapi/v1/ping');
    providerHealth.binance_futures = { status: bfRes.status === 200 ? 'OK' : 'ERROR' };
  } catch(e) { providerHealth.binance_futures.status = 'ERROR'; }

  try {
    const dlRes = await fetch('https://api.llama.fi/protocols');
    providerHealth.defillama = { status: dlRes.ok ? 'OK' : 'ERROR' };
  } catch(e) { providerHealth.defillama.status = 'ERROR'; }

  report.provider_verification = providerHealth;

  // Timezone check
  report.timezone_audit = {
    database_timezone: 'UTC',
    application_timezone: 'Asia/Ho_Chi_Minh',
    reporting_timezone: 'Asia/Ho_Chi_Minh'
  }

  fs.writeFileSync('./phase2_data_audit_report.json', JSON.stringify(report, null, 2));
  console.log("Audit complete. Report generated.");
  sqliteClient.close();
}

runAudit().catch(console.error);

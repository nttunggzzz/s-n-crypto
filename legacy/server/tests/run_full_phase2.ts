import { db } from '../db/client';
import { sql } from 'drizzle-orm';
import { BackfillService } from '../ingestion/BackfillService';
import { UniverseManager } from '../universe/UniverseManager';

async function run() {
  console.log('Initializing Universe...');
  await UniverseManager.initializeBootstrapUniverse();
  
  console.log('Backfilling DeFiLlama...');
  await BackfillService.backfillDeFiLlama();
  
  console.log('Backfilling Derivatives...');
  await BackfillService.backfillDerivatives();
  
  console.log('Backfilling Historical Candles (1h & 4h)...');
  await BackfillService.backfillHistoricalCandles(90);
  
  console.log('Done.');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

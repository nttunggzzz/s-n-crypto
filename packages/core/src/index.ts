export * from './decimal.ts';
export * from './rules.ts';
export * from './book.ts';
export * from './risk.ts';
export * from './futures.ts';
export * from './quant.ts';
// R convention (docs/plans/quy-uoc-R-va-nguon-du-lieu.md): the only R / R-statistics code. The small parsing helpers
// of rMetrics.ts (toDec, fmt8, timeKey, isoTime, recordIdText) stay internal to the package.
export {
  R_METRICS_VERSION,
  R_SCALE,
  RATIO_SCALE,
  compareCloseKey,
  compareRecordIds,
  rMultiple,
  rOutcome,
  riskAmount,
  summarizeR,
  type DecLike,
  type PnlCurvePoint,
  type RCurvePoint,
  type ROutcome,
  type RSeriesItem,
  type RSummary,
  type RecordId,
  type TimeLike,
} from './rMetrics.ts';
export * from './journalFills.ts';
export * from './journalStats.ts';

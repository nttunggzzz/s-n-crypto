/**
 * String-based numeric formatters for CEX Spot UI.
 * RULE: Money/price/amount must NEVER use JS `Number()` or float arithmetic.
 * RULE: null or undefined values must ALWAYS format as "—", NEVER as "0".
 */

export interface FormatOptions {
  decimals?: number;
  locale?: 'vi' | 'en';
  trimTrailingZeros?: boolean;
}

/**
 * Format a decimal string without floating point conversion.
 * Supports Vietnamese (12.345,67) and English (12,345.67) formatting.
 */
export function formatDecimal(
  value: string | null | undefined,
  options: FormatOptions = {}
): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const s = String(value).trim();
  if (s === '' || s === 'null' || s === 'undefined' || s === 'NaN') {
    return '—';
  }

  // Parse optional sign
  const isNegative = s.startsWith('-');
  const unsigned = isNegative ? s.slice(1) : s;

  const parts = unsigned.split('.');
  let intPart = parts[0] || '0';
  let fracPart = parts[1] || '';

  // Limit or pad fractional digits if decimals option is specified
  if (options.decimals !== undefined) {
    if (options.decimals === 0) {
      fracPart = '';
    } else if (fracPart.length > options.decimals) {
      fracPart = fracPart.slice(0, options.decimals);
    } else {
      fracPart = fracPart.padEnd(options.decimals, '0');
    }
  }

  if (options.trimTrailingZeros && fracPart) {
    fracPart = fracPart.replace(/0+$/, '');
  }

  // Add thousand separators to integer part
  // Format regex: add separator every 3 digits from right
  const thousandSep = options.locale === 'en' ? ',' : '.';
  const decimalSep = options.locale === 'en' ? '.' : ',';

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);

  let result = (isNegative ? '-' : '') + formattedInt;
  if (fracPart.length > 0) {
    result += decimalSep + fracPart;
  }

  return result;
}

/**
 * Format price according to symbol's tickSize precision.
 */
export function formatPrice(
  price: string | null | undefined,
  tickSize?: string,
  locale: 'vi' | 'en' = 'vi'
): string {
  if (price === null || price === undefined) return '—';
  const decimals = tickSize && tickSize.includes('.') ? tickSize.split('.')[1]!.length : undefined;
  return formatDecimal(price, { decimals, locale });
}

/**
 * Format quantity according to symbol's stepSize precision.
 */
export function formatAmount(
  amount: string | null | undefined,
  stepSize?: string,
  locale: 'vi' | 'en' = 'vi'
): string {
  if (amount === null || amount === undefined) return '—';
  const decimals = stepSize && stepSize.includes('.') ? stepSize.split('.')[1]!.length : undefined;
  return formatDecimal(amount, { decimals, locale });
}

/**
 * Format percent change e.g. "+2.45%" or "-1.20%".
 */
export function formatPercent(
  percent: string | null | undefined,
  locale: 'vi' | 'en' = 'vi'
): string {
  if (percent === null || percent === undefined) return '—';
  const p = String(percent).trim();
  if (p === '') return '—';

  const isNeg = p.startsWith('-');
  const isPos = !isNeg && p !== '0' && p !== '0.0' && p !== '0.00' && p !== '0.000';
  const unsigned = isNeg ? p.slice(1) : p;

  const formatted = formatDecimal(unsigned, { decimals: 2, locale });
  if (formatted === '—') return '—';

  if (isNeg) return `-${formatted}%`;
  if (isPos) return `+${formatted}%`;
  return `${formatted}%`;
}

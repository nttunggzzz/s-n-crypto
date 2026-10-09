import React from 'react';
import { formatAmount, formatPercent } from './format.ts';

export interface AmountTextProps {
  amount: string | null | undefined;
  stepSize?: string;
  unit?: string;
  locale?: 'vi' | 'en';
  className?: string;
}

export const AmountText: React.FC<AmountTextProps> = ({
  amount,
  stepSize,
  unit,
  locale = 'vi',
  className = '',
}) => {
  if (amount === null || amount === undefined) {
    return (
      <span className={`tabular-nums text-[var(--color-text-muted,#6b7280)] ${className}`}>
        —{unit && <span className="ml-1 text-xs text-[var(--color-text-muted,#6b7280)]">{unit}</span>}
      </span>
    );
  }

  const formatted = formatAmount(amount, stepSize, locale);

  return (
    <span className={`tabular-nums font-mono text-[var(--color-text-primary,#f3f4f6)] ${className}`}>
      {formatted}
      {unit && <span className="ml-1 text-xs text-[var(--color-text-secondary,#9ca3af)] font-normal">{unit}</span>}
    </span>
  );
};

export interface PercentChangeProps {
  percent: string | null | undefined;
  asBadge?: boolean;
  locale?: 'vi' | 'en';
  className?: string;
}

export const PercentChange: React.FC<PercentChangeProps> = ({
  percent,
  asBadge = false,
  locale = 'vi',
  className = '',
}) => {
  if (percent === null || percent === undefined) {
    return <span className={`tabular-nums text-[var(--color-text-muted,#6b7280)] ${className}`}>—</span>;
  }

  const formatted = formatPercent(percent, locale);
  if (formatted === '—') {
    return <span className={`tabular-nums text-[var(--color-text-muted,#6b7280)] ${className}`}>—</span>;
  }

  const isNeg = formatted.startsWith('-');
  const isPos = formatted.startsWith('+');

  const textColor = isPos
    ? 'text-[var(--color-buy,#22c55e)]'
    : isNeg
    ? 'text-[var(--color-sell,#f87171)]'
    : 'text-[var(--color-text-secondary,#9ca3af)]';

  if (asBadge) {
    const bgColor = isPos
      ? 'bg-[var(--color-buy-bg,rgba(34,197,94,0.12))] border-[var(--color-buy,#22c55e)]/20'
      : isNeg
      ? 'bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] border-[var(--color-sell,#f87171)]/20'
      : 'bg-[var(--color-bg-elevated,#1b1e27)] border-[var(--color-border-subtle,#1e212b)]';

    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm,4px)] text-xs font-semibold tabular-nums border ${bgColor} ${textColor} ${className}`}
      >
        {formatted}
      </span>
    );
  }

  return (
    <span className={`tabular-nums font-medium ${textColor} ${className}`}>
      {formatted}
    </span>
  );
};

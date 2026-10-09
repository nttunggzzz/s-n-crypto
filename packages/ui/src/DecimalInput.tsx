import React from 'react';

export interface DecimalInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (val: string) => void;
  maxDecimals?: number;
  label?: string;
  error?: string;
  unit?: string;
  helperText?: string;
}

/**
 * Dedicated input for decimal strings (price, quantity, amounts).
 * Strictly forbids scientific notation, letters, or exceeding maxDecimals.
 * Preserves decimal strings precisely without JS number casting.
 */
export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  (
    {
      value,
      onValueChange,
      maxDecimals,
      label,
      error,
      unit,
      helperText,
      className = '',
      placeholder = '0.00',
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value.replace(/,/g, '.'); // allow comma as decimal separator

      // If empty string, allow it
      if (raw === '') {
        onValueChange('');
        return;
      }

      // Check if matches a valid partial decimal pattern: optional digits, optional dot, optional digits
      if (!/^\d*\.?\d*$/.test(raw)) {
        return;
      }

      // If user typed just '.', convert to '0.'
      if (raw === '.') {
        raw = '0.';
      }

      // If leading zeros like '012', strip the extra zero unless it's '0.'
      if (/^0\d/.test(raw)) {
        raw = raw.replace(/^0+/, '');
        if (raw === '') raw = '0';
      }

      // Check fractional digits limit if maxDecimals specified
      if (maxDecimals !== undefined && raw.includes('.')) {
        const parts = raw.split('.');
        const frac = parts[1] || '';
        if (frac.length > maxDecimals) {
          raw = `${parts[0]}.${frac.slice(0, maxDecimals)}`;
        }
      }

      onValueChange(raw);
    };

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label className="text-xs font-medium text-[var(--color-text-secondary,#9ca3af)]">
            {label}
          </label>
        )}
        <div
          className={`flex items-center w-full bg-[var(--color-bg-surface,#111319)] border rounded-[var(--radius-md,8px)] transition-colors focus-within:ring-2 focus-within:ring-[var(--color-border-focus,#818cf8)] focus-within:border-transparent ${
            error
              ? 'border-[#ef4444] focus-within:ring-[#ef4444]'
              : 'border-[var(--color-border-default,#272a33)] hover:border-[#383d4a]'
          }`}
        >
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck="false"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            className={`w-full bg-transparent px-3 py-2 text-sm tabular-nums text-[var(--color-text-primary,#f3f4f6)] placeholder-[var(--color-text-muted,#6b7280)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {unit && (
            <div className="pr-3 pl-2 text-xs text-[var(--color-text-secondary,#9ca3af)] font-medium select-none shrink-0">
              {unit}
            </div>
          )}
        </div>
        {error ? (
          <span className="text-xs text-[#ef4444]">{error}</span>
        ) : helperText ? (
          <span className="text-xs text-[var(--color-text-muted,#6b7280)]">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

DecimalInput.displayName = 'DecimalInput';

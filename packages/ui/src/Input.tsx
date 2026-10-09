import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftAddon, rightAddon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-text-secondary,#9ca3af)]"
          >
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
          {leftAddon && (
            <div className="pl-3 pr-2 text-xs text-[var(--color-text-muted,#6b7280)] select-none shrink-0">
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-transparent px-3 py-2 text-sm text-[var(--color-text-primary,#f3f4f6)] placeholder-[var(--color-text-muted,#6b7280)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightAddon && (
            <div className="pr-3 pl-2 text-xs text-[var(--color-text-secondary,#9ca3af)] font-medium select-none shrink-0">
              {rightAddon}
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

Input.displayName = 'Input';

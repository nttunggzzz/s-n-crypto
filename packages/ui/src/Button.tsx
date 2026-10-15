import React from 'react';
import { OrbitalLoader } from './OrbitalLoader.tsx';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'buy'
  | 'sell';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    // Base styles
    const base =
      'inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[var(--color-bg-base,#08090c)] active:scale-[0.99]';

    // Sizes
    const sizeMap: Record<ButtonSize, string> = {
      sm: 'text-xs px-2.5 py-1.5 rounded-[var(--radius-sm,4px)] gap-1.5',
      md: 'text-sm px-4 py-2 rounded-[var(--radius-md,8px)] gap-2',
      lg: 'text-base px-5 py-2.5 rounded-[var(--radius-md,8px)] gap-2.5 font-semibold',
    };

    // Variants
    const variantMap: Record<ButtonVariant, string> = {
      primary:
        'bg-[var(--color-accent-primary,#818cf8)] text-white hover:bg-[#6366f1] active:bg-[#4f46e5] focus:ring-[var(--color-accent-primary,#818cf8)] shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
      secondary:
        'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)] border border-[var(--color-border-default,#272a33)] hover:bg-[#252a36] hover:border-[#383d4a] focus:ring-[var(--color-border-focus,#818cf8)]',
      outline:
        'bg-transparent text-[var(--color-text-primary,#f3f4f6)] border border-[var(--color-border-default,#272a33)] hover:bg-[var(--color-bg-surface,#111319)] focus:ring-[var(--color-border-focus,#818cf8)]',
      ghost:
        'bg-transparent text-[var(--color-text-secondary,#9ca3af)] hover:text-[var(--color-text-primary,#f3f4f6)] hover:bg-[var(--color-bg-elevated,#1b1e27)] focus:ring-[var(--color-border-focus,#818cf8)]',
      danger:
        'bg-[#ef4444] text-white hover:bg-[#dc2626] active:bg-[#b91c1c] focus:ring-[#ef4444]',
      buy:
        'bg-[var(--color-buy,#22c55e)] text-white hover:brightness-110 active:brightness-95 focus:ring-[var(--color-buy,#22c55e)] font-bold shadow-[0_2px_8px_rgba(34,197,94,0.25)]',
      sell:
        'bg-[var(--color-sell,#f87171)] text-white hover:brightness-110 active:brightness-95 focus:ring-[var(--color-sell,#f87171)] font-bold shadow-[0_2px_8px_rgba(248,113,113,0.25)]',
    };

    const widthClass = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${sizeMap[size]} ${variantMap[variant]} ${widthClass} ${className}`}
        {...props}
      >
        {loading ? (
          <OrbitalLoader size="sm" className="mr-1" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

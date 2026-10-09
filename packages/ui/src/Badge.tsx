import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const sizeMap = {
    sm: 'text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm,4px)] font-medium',
    md: 'text-xs px-2 py-0.5 rounded-[var(--radius-sm,4px)] font-medium',
  };

  const variantMap: Record<BadgeVariant, string> = {
    default:
      'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-secondary,#9ca3af)] border border-[var(--color-border-subtle,#1e212b)]',
    secondary:
      'bg-[var(--color-accent-primary,#818cf8)]/10 text-[var(--color-accent-primary,#818cf8)] border border-[var(--color-accent-primary,#818cf8)]/20',
    success:
      'bg-[var(--color-buy-bg,rgba(34,197,94,0.12))] text-[var(--color-buy,#22c55e)] border border-[var(--color-buy,#22c55e)]/20',
    warning:
      'bg-[var(--color-warning-bg,rgba(251,191,36,0.12))] text-[var(--color-warning,#fbbf24)] border border-[var(--color-warning,#fbbf24)]/20',
    error:
      'bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] text-[var(--color-sell,#f87171)] border border-[var(--color-sell,#f87171)]/20',
    info:
      'bg-[var(--color-info-bg,rgba(96,165,250,0.12))] text-[var(--color-info,#60a5fa)] border border-[var(--color-info,#60a5fa)]/20',
    outline:
      'bg-transparent text-[var(--color-text-secondary,#9ca3af)] border border-[var(--color-border-default,#272a33)]',
  };

  return (
    <span
      className={`inline-flex items-center justify-center gap-1 leading-none select-none ${sizeMap[size]} ${variantMap[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

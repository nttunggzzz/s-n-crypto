import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'elevated' | 'glass';
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'surface',
  header,
  footer,
  children,
  className = '',
  ...props
}) => {
  const bgClass =
    variant === 'elevated'
      ? 'bg-[var(--color-bg-elevated,#1b1e27)]'
      : variant === 'glass'
      ? 'bg-[rgba(17,19,25,0.7)] backdrop-blur-md'
      : 'bg-[var(--color-bg-surface,#111319)]';

  return (
    <div
      className={`${bgClass} border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-lg,12px)] overflow-hidden flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.25)] ${className}`}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle,#1e212b)] flex items-center justify-between">
          {header}
        </div>
      )}
      <div className="p-4 flex-1">{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-[var(--color-border-subtle,#1e212b)] bg-[var(--color-bg-base,#08090c)]/30">
          {footer}
        </div>
      )}
    </div>
  );
};

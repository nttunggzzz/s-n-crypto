import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  rounded = 'md',
  className = '',
  style,
  ...props
}) => {
  const roundedClass =
    rounded === 'none'
      ? 'rounded-none'
      : rounded === 'sm'
      ? 'rounded-[var(--radius-sm,4px)]'
      : rounded === 'lg'
      ? 'rounded-[var(--radius-lg,12px)]'
      : rounded === 'full'
      ? 'rounded-full'
      : 'rounded-[var(--radius-md,8px)]';

  return (
    <div
      className={`animate-shimmer bg-[var(--color-bg-elevated,#1b1e27)] ${roundedClass} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
};

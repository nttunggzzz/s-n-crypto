import React from 'react';
import { AlertCircleIcon, SearchIcon } from './icons.tsx';
import { Button } from './Button.tsx';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Không có dữ liệu',
  description = 'Hiện tại chưa có dữ liệu nào để hiển thị.',
  icon,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-[var(--radius-lg,12px)] border border-dashed border-[var(--color-border-subtle,#1e212b)] bg-[var(--color-bg-surface,#111319)]/40 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[var(--color-bg-elevated,#1b1e27)] flex items-center justify-center text-[var(--color-text-muted,#6b7280)] mb-3">
        {icon || <SearchIcon size={22} />}
      </div>
      <h4 className="text-sm font-semibold text-[var(--color-text-primary,#f3f4f6)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] max-w-xs mb-4">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Đã xảy ra lỗi',
  message = 'Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng và thử lại.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-[var(--radius-lg,12px)] border border-[var(--color-sell,#f87171)]/20 bg-[var(--color-sell-bg,rgba(248,113,113,0.12))]/30 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] flex items-center justify-center text-[var(--color-sell,#f87171)] mb-3">
        <AlertCircleIcon size={24} />
      </div>
      <h4 className="text-sm font-semibold text-[var(--color-text-primary,#f3f4f6)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] max-w-sm mb-4">
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
};

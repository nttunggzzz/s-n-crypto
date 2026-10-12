import React from 'react';
import { Badge } from './Badge.tsx';
import { AlertTriangleIcon, WifiOffIcon, ShieldAlertIcon } from './icons.tsx';

export interface SymbolBadgeProps {
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  className?: string;
}

export const SymbolBadge: React.FC<SymbolBadgeProps> = ({
  symbol,
  baseAsset,
  quoteAsset,
  className = '',
}) => {
  const base = baseAsset || (symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol);
  const quote = quoteAsset || (symbol.endsWith('USDT') ? 'USDT' : '');

  return (
    <div className={`inline-flex items-center gap-1.5 font-bold ${className}`}>
      <span className="text-[var(--color-text-primary,#f3f4f6)]">{base}</span>
      {quote && (
        <span className="text-xs text-[var(--color-text-muted,#6b7280)] font-normal">
          /{quote}
        </span>
      )}
    </div>
  );
};

export interface StaleBadgeProps {
  status: 'LIVE' | 'STALE' | 'UNAVAILABLE' | string | null | undefined;
  className?: string;
}

export const StaleBadge: React.FC<StaleBadgeProps> = ({ status, className = '' }) => {
  if (!status || status === 'LIVE') return null;

  if (status === 'STALE') {
    return (
      <Badge
        variant="warning"
        size="sm"
        className={`gap-1 ${className}`}
        title="Dữ liệu giá bị chậm so với thị trường thực"
      >
        <AlertTriangleIcon size={12} />
        <span>GIÁ CŨ</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="error"
      size="sm"
      className={`gap-1 ${className}`}
      title="Dữ liệu giá hiện không khả dụng"
    >
      <WifiOffIcon size={12} />
      <span>MẤT NGUỒN GIÁ</span>
    </Badge>
  );
};

export type OrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED';

export interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  className?: string;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, className = '' }) => {
  const statusConfig: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'default' | 'error' }> = {
    NEW: { label: 'Đang chờ', variant: 'info' },
    PARTIALLY_FILLED: { label: 'Khớp một phần', variant: 'warning' },
    FILLED: { label: 'Đã khớp', variant: 'success' },
    CANCELED: { label: 'Đã hủy', variant: 'default' },
    REJECTED: { label: 'Bị từ chối', variant: 'error' },
    EXPIRED: { label: 'Hết hạn', variant: 'default' },
  };

  const conf = statusConfig[status] || { label: status, variant: 'default' };

  return (
    <Badge variant={conf.variant} size="sm" className={className}>
      {conf.label}
    </Badge>
  );
};

export interface SideTagProps {
  side: 'BUY' | 'SELL' | string;
  className?: string;
}

export const SideTag: React.FC<SideTagProps> = ({ side, className = '' }) => {
  const isBuy = side === 'BUY';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm,4px)] text-xs font-bold leading-none ${
        isBuy
          ? 'bg-[var(--color-buy-bg,rgba(34,197,94,0.12))] text-[var(--color-buy,#22c55e)]'
          : 'bg-[var(--color-sell-bg,rgba(248,113,113,0.12))] text-[var(--color-sell,#f87171)]'
      } ${className}`}
    >
      {isBuy ? 'MUA' : 'BÁN'}
    </span>
  );
};

export interface SimulatedBannerProps {
  tradingHalted?: boolean;
  className?: string;
}

export const SimulatedBanner: React.FC<SimulatedBannerProps> = ({
  tradingHalted = false,
  className = '',
}) => {
  return (
    <div
      className={`w-full py-1.5 px-3 flex items-center justify-between text-xs font-medium select-none ${
        tradingHalted
          ? 'bg-[#dc2626] text-white'
          : 'bg-[var(--panel-2)] text-[var(--text-2)] border-b border-[var(--line)]'
      } ${className}`}
    >
      <div className="flex items-center gap-2 mx-auto">
        {tradingHalted ? (
          <>
            <ShieldAlertIcon size={14} className="text-white shrink-0 animate-pulse" />
            <span className="font-bold tracking-wide uppercase">
              HỆ THỐNG ĐANG TẠM DỪNG GIAO DỊCH KHẨN CẤP
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent-primary,#818cf8)] animate-pulse" />
            <span>
              SÀN MÔ PHỎNG SPOT — TIỀN ẢO, DỮ LIỆU GIÁ THẬT BINANCE — KHÔNG CÓ GIÁ TRỊ TIỀN THẬT
            </span>
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Button,
  Input,
  DecimalInput,
  Card,
  Badge,
  Tabs,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  BottomSheet,
  Skeleton,
  OrbitalLoader,
  EmptyState,
  ErrorState,
  PriceText,
  AmountText,
  PercentChange,
  SymbolBadge,
  StaleBadge,
  OrderStatusBadge,
  SideTag,
  SimulatedBanner,
  useToast,
} from '@cex/ui';

export const UiShowcasePage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [decimalVal, setDecimalVal] = useState('1234.5678');
  const [activeTab, setActiveTab] = useState('1');
  const { success, error, warning, info } = useToast();

  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');

  const toggleTheme = () => {
    const next = previewTheme === 'dark' ? 'light' : 'dark';
    setPreviewTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20 space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border-subtle,#1e212b)]">
        <div>
          <h1 className="text-2xl font-black text-[var(--color-text-primary,#f3f4f6)]">
            CEX Design System Showcase (`/__ui`)
          </h1>
          <p className="text-xs text-[var(--color-text-secondary,#9ca3af)] mt-1">
            Trưng bày đầy đủ bộ component `@cex/ui`, token màu sắc và trạng thái giao diện.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleTheme}>
          Chế độ hiện tại: {previewTheme.toUpperCase()}
        </Button>
      </div>

      {/* Simulated Banner Demo */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          1. Simulated & Trading Banners
        </h2>
        <div className="space-y-2">
          <SimulatedBanner tradingHalted={false} />
          <SimulatedBanner tradingHalted={true} />
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          2. Buttons & Variants
        </h2>
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="primary">Primary CTA</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="buy">MUA SPOT</Button>
          <Button variant="sell">BÁN SPOT</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </section>

      {/* Financial Number Formatting & Tabular figures */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          3. Precision Trading Numbers (Strings only, no float math)
        </h2>
        <Card variant="surface" className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-[var(--color-text-muted,#6b7280)]">PriceText (Live / Tick Flash)</div>
            <div className="text-lg font-bold font-mono mt-1">
              <PriceText price="84250.50" tickSize="0.01" colored />
            </div>
            <div className="text-xs text-[var(--color-text-muted,#6b7280)] mt-2">Null Price (hiển thị —)</div>
            <div className="text-sm font-mono mt-0.5">
              <PriceText price={null} />
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--color-text-muted,#6b7280)]">PercentChange (+ / - / badge)</div>
            <div className="flex items-center gap-2 mt-1">
              <PercentChange percent="5.42" asBadge />
              <PercentChange percent="-2.18" asBadge />
              <PercentChange percent="0.00" asBadge />
              <PercentChange percent={null} asBadge />
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--color-text-muted,#6b7280)]">AmountText (Formatted strings)</div>
            <div className="text-lg font-bold font-mono mt-1">
              <AmountText amount="123456.78900000" unit="USDT" />
            </div>
            <div className="text-xs text-[var(--color-text-muted,#6b7280)] mt-2">Null Amount (hiển thị —)</div>
            <div className="text-sm font-mono mt-0.5">
              <AmountText amount={null} unit="BTC" />
            </div>
          </div>
        </Card>
      </section>

      {/* Badges & Tags */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          4. Trading Badges & Status Tags
        </h2>
        <div className="flex flex-wrap gap-2 items-center">
          <SymbolBadge symbol="BTCUSDT" />
          <SymbolBadge symbol="ETHUSDT" />
          <SideTag side="BUY" />
          <SideTag side="SELL" />
          <StaleBadge status="STALE" />
          <StaleBadge status="UNAVAILABLE" />
          <OrderStatusBadge status="NEW" />
          <OrderStatusBadge status="PARTIALLY_FILLED" />
          <OrderStatusBadge status="FILLED" />
          <OrderStatusBadge status="CANCELED" />
          <OrderStatusBadge status="REJECTED" />
        </div>
      </section>

      {/* Inputs & DecimalInput */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          5. Inputs & Strict Decimal Validation
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <Input label="Email Input" placeholder="trader@example.com" />
          <Input label="Input với Error" error="Địa chỉ email không hợp lệ" value="invalid-email" readOnly />
          <DecimalInput
            label="DecimalInput (chỉ nhận số thực, max 4 số lẻ)"
            value={decimalVal}
            onValueChange={setDecimalVal}
            maxDecimals={4}
            unit="USDT"
          />
          <DecimalInput
            label="DecimalInput có lỗi"
            value="10.5"
            onValueChange={() => {}}
            error="Vượt quá số dư khả dụng"
            unit="BTC"
          />
        </div>
      </section>

      {/* Loaders & Skeletons */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          6. Orbital Loader & Shimmer Skeletons
        </h2>
        <div className="flex items-center gap-6">
          <OrbitalLoader size="sm" label="Small" />
          <OrbitalLoader size="md" label="Medium" />
          <OrbitalLoader size="lg" label="Large" />
          <div className="space-y-2 flex-1 max-w-sm">
            <Skeleton height={20} className="w-3/4" />
            <Skeleton height={32} className="w-full" />
            <Skeleton height={16} className="w-1/2" />
          </div>
        </div>
      </section>

      {/* Toast triggers */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          7. Toast Notification System
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => success('Khớp lệnh thành công 0.5 BTC!')}>
            Toast Thành công
          </Button>
          <Button variant="secondary" size="sm" onClick={() => error('Số dư khả dụng không đủ!')}>
            Toast Lỗi
          </Button>
          <Button variant="secondary" size="sm" onClick={() => warning('Cảnh báo giá cũ STALE!')}>
            Toast Cảnh báo
          </Button>
          <Button variant="secondary" size="sm" onClick={() => info('Đã kết nối lại WebSocket.')}>
            Toast Thông tin
          </Button>
        </div>
      </section>

      {/* Modals & Sheets */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          8. Modal & Mobile BottomSheet
        </h2>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            Mở Modal Dialog
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
            Mở BottomSheet (Mobile Drawer)
          </Button>
        </div>

        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Tiêu đề Modal">
          <p className="text-sm text-[var(--color-text-secondary,#9ca3af)] leading-relaxed">
            Đây là nội dung modal tiêu chuẩn với backdrop mờ, hỗ trợ phím Escape và thiết kế Obsidian Black.
          </p>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setModalOpen(false)}>
              Đồng ý
            </Button>
          </div>
        </Modal>

        <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Tiêu đề BottomSheet">
          <p className="text-sm text-[var(--color-text-secondary,#9ca3af)] leading-relaxed">
            BottomSheet trượt từ dưới lên, phù hợp với thao tác đặt lệnh trên điện thoại di động (360px).
          </p>
          <div className="mt-4">
            <Button variant="primary" fullWidth onClick={() => setSheetOpen(false)}>
              Đóng BottomSheet
            </Button>
          </div>
        </BottomSheet>
      </section>

      {/* Mandatory Screen States: Empty & Error */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-text-muted,#6b7280)] uppercase tracking-wider">
          9. Trạng thái Trống (Empty) & Trạng thái Lỗi (Error)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EmptyState
            title="Danh sách trống"
            description="Chưa có dữ liệu nào trong bảng này."
          />
          <ErrorState
            title="Máy chủ lỗi 500"
            message="Không thể kết nối đến máy chủ. Vui lòng thử lại."
            onRetry={() => alert('Thử lại')}
          />
        </div>
      </section>
    </div>
  );
};

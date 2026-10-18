import React from 'react';
import { appLinks } from '@cex/contracts';
import { ShieldAlert } from 'lucide-react';

export const NoAccessPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center text-[var(--text,#f4f4f5)]" data-testid="admin-no-access">
      <div className="text-center p-8 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl max-w-md mx-4 shadow-xl">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--down,#f6465d)]/10 flex items-center justify-center text-[var(--down,#f6465d)]">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-xl font-bold mb-2">Tài khoản không có quyền truy cập</h1>
        <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6">
          Bạn không có quyền thực hiện thao tác hoặc truy cập vào khu vực này. Vui lòng liên hệ quản trị viên để được cấp quyền.
        </p>
        <a
          href={appLinks.exchange.home(import.meta.env.VITE_EXCHANGE_ORIGIN)}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
        >
          Quay lại sàn
        </a>
      </div>
    </div>
  );
};

export default NoAccessPage;

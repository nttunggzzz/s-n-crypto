import React from 'react';
import { FileQuestion } from 'lucide-react';

export interface NotFoundPageProps {
  onNavigate?: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center text-[var(--text,#f4f4f5)]" data-testid="admin-not-found">
      <div className="text-center p-8 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl max-w-md mx-4 shadow-xl">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--line,#1d1e21)] flex items-center justify-center text-[var(--text-3,#63636b)]">
          <FileQuestion size={24} />
        </div>
        <h1 className="text-xl font-bold mb-2">404 — Không tìm thấy trang</h1>
        <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6">
          Đường dẫn không tồn tại trên hệ thống quản trị. Vui lòng kiểm tra lại địa chỉ hoặc quay về Tổng quan.
        </p>
        <button
          type="button"
          onClick={() => (onNavigate ? onNavigate('/admin') : (window.location.href = '/admin'))}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all cursor-pointer"
        >
          Về trang Tổng quan
        </button>
      </div>
    </div>
  );
};

export default NotFoundPage;

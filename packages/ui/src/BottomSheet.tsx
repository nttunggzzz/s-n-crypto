import React, { useEffect } from 'react';
import { XIcon } from './icons.tsx';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full bg-[var(--color-bg-surface,#111319)] border-t border-[var(--color-border-default,#272a33)] rounded-t-[20px] shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-10 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200 ${className}`}
      >
        {/* Drag handle */}
        <div className="w-full flex justify-center pt-3 pb-1" onClick={onClose}>
          <div className="w-10 h-1 bg-[var(--color-border-default,#272a33)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--color-border-subtle,#1e212b)] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--color-text-primary,#f3f4f6)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm,4px)] text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#f3f4f6)] cursor-pointer"
            aria-label="Đóng"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

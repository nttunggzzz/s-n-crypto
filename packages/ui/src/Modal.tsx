import React, { useEffect } from 'react';
import { XIcon } from './icons.tsx';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog Window */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${widthMap[maxWidth]} bg-[var(--color-bg-surface,#111319)] border border-[var(--color-border-default,#272a33)] rounded-[var(--radius-lg,12px)] shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden z-10 flex flex-col max-h-[90vh] ${className}`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border-subtle,#1e212b)] flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--color-text-primary,#f3f4f6)]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm,4px)] text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#f3f4f6)] hover:bg-[var(--color-bg-elevated,#1b1e27)] transition-colors cursor-pointer"
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

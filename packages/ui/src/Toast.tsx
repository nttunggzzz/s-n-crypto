import React, { useState, useEffect, createContext, useContext } from 'react';
import { CheckIcon, AlertCircleIcon, AlertTriangleIcon, XIcon } from './icons.tsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: React.ReactNode;
  duration?: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: React.ReactNode, duration?: number) => void;
  success: (message: React.ReactNode, duration?: number) => void;
  error: (message: React.ReactNode, duration?: number) => void;
  warning: (message: React.ReactNode, duration?: number) => void;
  info: (message: React.ReactNode, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let globalToastHandler: ((type: ToastType, message: React.ReactNode, duration?: number) => void) | null = null;

export const showToast = (type: ToastType, message: React.ReactNode, duration?: number) => {
  if (globalToastHandler) {
    globalToastHandler(type, message, duration);
  }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (type: ToastType, message: React.ReactNode, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  };

  useEffect(() => {
    globalToastHandler = addToast;
    return () => {
      globalToastHandler = null;
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const contextValue: ToastContextType = {
    toast: addToast,
    success: (msg, d) => addToast('success', msg, d),
    error: (msg, d) => addToast('error', msg, d),
    warning: (msg, d) => addToast('warning', msg, d),
    info: (msg, d) => addToast('info', msg, d),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: showToast,
      success: (m, d) => showToast('success', m, d),
      error: (m, d) => showToast('error', m, d),
      warning: (m, d) => showToast('warning', m, d),
      info: (m, d) => showToast('info', m, d),
    };
  }
  return ctx;
};

const ToastCard: React.FC<{ item: ToastItem; onDismiss: () => void }> = ({ item, onDismiss }) => {
  useEffect(() => {
    if (!item.duration) return;
    const timer = setTimeout(onDismiss, item.duration);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  const typeConfig = {
    success: {
      icon: <CheckIcon size={16} className="text-[var(--color-buy,#22c55e)]" />,
      border: 'border-[var(--color-buy,#22c55e)]/30',
      bg: 'bg-[var(--color-bg-surface,#111319)]',
    },
    error: {
      icon: <AlertCircleIcon size={16} className="text-[var(--color-sell,#f87171)]" />,
      border: 'border-[var(--color-sell,#f87171)]/30',
      bg: 'bg-[var(--color-bg-surface,#111319)]',
    },
    warning: {
      icon: <AlertTriangleIcon size={16} className="text-[var(--color-warning,#fbbf24)]" />,
      border: 'border-[var(--color-warning,#fbbf24)]/30',
      bg: 'bg-[var(--color-bg-surface,#111319)]',
    },
    info: {
      icon: <AlertCircleIcon size={16} className="text-[var(--color-info,#60a5fa)]" />,
      border: 'border-[var(--color-info,#60a5fa)]/30',
      bg: 'bg-[var(--color-bg-surface,#111319)]',
    },
  }[item.type];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-[var(--radius-md,8px)] border ${typeConfig.border} ${typeConfig.bg} shadow-lg shadow-black/40 text-sm text-[var(--color-text-primary,#f3f4f6)] animate-in fade-in slide-in-from-bottom-2 duration-150`}
    >
      <div className="shrink-0 mt-0.5">{typeConfig.icon}</div>
      <div className="flex-1 text-xs sm:text-sm leading-relaxed">{item.message}</div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-[var(--color-text-muted,#6b7280)] hover:text-[var(--color-text-primary,#f3f4f6)] p-0.5 cursor-pointer"
        aria-label="Đóng thông báo"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
};

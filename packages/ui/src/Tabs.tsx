import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill' | 'segmented';
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  variant = 'underline',
  size = 'md',
  className = '',
}) => {
  const sizeMap = {
    sm: 'text-xs py-1.5 px-3',
    md: 'text-sm py-2 px-4',
  };

  if (variant === 'segmented') {
    return (
      <div
        role="tablist"
        className={`inline-flex p-1 bg-[var(--color-bg-base,#08090c)] border border-[var(--color-border-subtle,#1e212b)] rounded-[var(--radius-md,8px)] ${className}`}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const tabLabel = typeof tab.label === 'string' ? tab.label : undefined;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tabLabel}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-1.5 rounded-[var(--radius-sm,4px)] font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sizeMap[size]} ${
                isActive
                  ? 'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-primary,#f3f4f6)] shadow-sm'
                  : 'text-[var(--color-text-secondary,#9ca3af)] hover:text-[var(--color-text-primary,#f3f4f6)]'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div role="tablist" className={`flex items-center gap-1.5 overflow-x-auto ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const tabLabel = typeof tab.label === 'string' ? tab.label : undefined;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tabLabel}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-1.5 rounded-full font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sizeMap[size]} ${
                isActive
                  ? 'bg-[var(--color-accent-primary,#818cf8)] text-white'
                  : 'bg-[var(--color-bg-elevated,#1b1e27)] text-[var(--color-text-secondary,#9ca3af)] hover:text-[var(--color-text-primary,#f3f4f6)]'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    );
  }

  // Underline (default)
  return (
    <div
      role="tablist"
      className={`flex items-center border-b border-[var(--color-border-subtle,#1e212b)] overflow-x-auto ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const tabLabel = typeof tab.label === 'string' ? tab.label : undefined;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={tabLabel}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-1.5 font-medium transition-colors cursor-pointer select-none border-b-2 disabled:opacity-40 disabled:cursor-not-allowed ${sizeMap[size]} ${
              isActive
                ? 'border-[var(--color-accent-primary,#818cf8)] text-[var(--color-text-primary,#f3f4f6)]'
                : 'border-transparent text-[var(--color-text-secondary,#9ca3af)] hover:text-[var(--color-text-primary,#f3f4f6)]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
};

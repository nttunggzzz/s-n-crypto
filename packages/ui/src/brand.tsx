import React from 'react';

export const BRAND_CONFIG = {
  name: 'CEX.SPOT',
  displayName: 'CEX Spot Exchange',
  tagline: 'Sàn giao dịch Spot mô phỏng',
  simulationTag: 'Mô phỏng',
  simulationNotice: 'Sàn mô phỏng — không có tiền thật',
  version: '2.0.0-okx',
};

export const BrandLogo: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 28,
}) => {
  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <div
        style={{ width: size, height: size }}
        className="rounded-lg bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 flex items-center justify-center shadow-sm text-white font-black tracking-tighter shrink-0"
      >
        <svg
          width={Math.round(size * 0.65)}
          height={Math.round(size * 0.65)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5 font-bold tracking-tight text-[var(--text,#f4f4f5)] text-base">
        <span>{BRAND_CONFIG.name}</span>
        <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-[var(--panel-2,#141416)] text-[var(--accent,#818cf8)] border border-[var(--line,#1d1e21)]">
          {BRAND_CONFIG.simulationTag}
        </span>
      </div>
    </div>
  );
};

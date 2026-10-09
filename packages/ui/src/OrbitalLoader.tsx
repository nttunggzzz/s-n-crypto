import React from 'react';

export interface OrbitalLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export const OrbitalLoader: React.FC<OrbitalLoaderProps> = ({
  size = 'md',
  className = '',
  label,
}) => {
  const sizePx = size === 'sm' ? 18 : size === 'md' ? 28 : 44;
  const strokeWidth = size === 'sm' ? 2 : size === 'md' ? 3 : 4;
  const dotRadius = size === 'sm' ? 1.5 : size === 'md' ? 2.5 : 3.5;
  const center = sizePx / 2;
  const radius = center - strokeWidth;

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-2 ${className}`}>
      <div className="relative" style={{ width: sizePx, height: sizePx }}>
        <svg
          width={sizePx}
          height={sizePx}
          viewBox={`0 0 ${sizePx} ${sizePx}`}
          className="animate-spin-orbital"
        >
          {/* Subtle background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.15"
            strokeWidth={strokeWidth}
          />
          {/* Indigo arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#818cf8"
            strokeWidth={strokeWidth}
            strokeDasharray={`${radius * 1.8} ${radius * 4.5}`}
            strokeLinecap="round"
          />
          {/* Cyan glowing orb at leading edge */}
          <circle
            cx={center + radius * Math.cos(-Math.PI / 6)}
            cy={center + radius * Math.sin(-Math.PI / 6)}
            r={dotRadius}
            fill="#67e8f9"
            className="drop-shadow-[0_0_4px_#67e8f9]"
          />
        </svg>
      </div>
      {label && <span className="text-xs text-[var(--color-text-secondary,#9ca3af)]">{label}</span>}
    </div>
  );
};

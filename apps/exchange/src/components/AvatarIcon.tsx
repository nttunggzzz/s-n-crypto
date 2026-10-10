import React from 'react';
import type { AvatarId } from '@cex/contracts';

export interface AvatarIconProps {
  avatarId?: AvatarId | null;
  size?: number;
  className?: string;
  fallbackText?: string;
}

export const AVATAR_LIST: { id: AvatarId; name: string; color: string }[] = [
  { id: 'fox', name: 'Cáo thông thái', color: '#f97316' },
  { id: 'owl', name: 'Cú đêm', color: '#6366f1' },
  { id: 'bull', name: 'Bò tót (Bull)', color: '#10b981' },
  { id: 'bear', name: 'Gấu xám (Bear)', color: '#f43f5e' },
  { id: 'whale', name: 'Cá voi (Whale)', color: '#06b6d4' },
  { id: 'shark', name: 'Cá mập (Shark)', color: '#0284c7' },
  { id: 'rocket', name: 'Tên lửa (To the moon)', color: '#a855f7' },
  { id: 'diamond', name: 'Bàn tay kim cương', color: '#14b8a6' },
  { id: 'moon', name: 'Mặt trăng', color: '#fbbf24' },
  { id: 'star', name: 'Ngôi sao', color: '#eab308' },
  { id: 'bolt', name: 'Tia chớp', color: '#facc15' },
  { id: 'leaf', name: 'Mầm xanh', color: '#22c55e' },
];

export const AvatarIcon: React.FC<AvatarIconProps> = ({
  avatarId,
  size = 40,
  className = '',
  fallbackText = 'U',
}) => {
  if (!avatarId) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] flex items-center justify-center font-bold text-white uppercase select-none ${className}`}
      >
        <span style={{ fontSize: size * 0.45 }}>{fallbackText.charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  const renderSvg = () => {
    switch (avatarId) {
      case 'fox':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M12 21L4 13L6 5L10 9L12 7L14 9L18 5L20 13L12 21Z" fill="#f97316" />
            <path d="M12 21L8 15L10 11L12 13L14 11L16 15L12 21Z" fill="#ffffff" />
            <circle cx="8" cy="11" r="1" fill="#18181b" />
            <circle cx="16" cy="11" r="1" fill="#18181b" />
            <polygon points="12,17 11,15.5 13,15.5" fill="#18181b" />
          </svg>
        );
      case 'owl':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <ellipse cx="12" cy="13" rx="8" ry="9" fill="#6366f1" />
            <polygon points="12,1 7,6 17,6" fill="#4f46e5" />
            <circle cx="8.5" cy="12" r="3.5" fill="#ffffff" />
            <circle cx="15.5" cy="12" r="3.5" fill="#ffffff" />
            <circle cx="8.5" cy="12" r="1.5" fill="#18181b" />
            <circle cx="15.5" cy="12" r="1.5" fill="#18181b" />
            <polygon points="12,13 10.5,15.5 13.5,15.5" fill="#fbbf24" />
          </svg>
        );
      case 'bull':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M4 4C6 8 8 9 9 10C9 14 10 18 12 20C14 18 15 14 15 10C16 9 18 8 20 4C17 5 15 7 14 8C13 7.5 11 7.5 10 8C9 7 7 5 4 4Z" fill="#10b981" />
            <circle cx="9" cy="13" r="1.2" fill="#ffffff" />
            <circle cx="15" cy="13" r="1.2" fill="#ffffff" />
            <ellipse cx="12" cy="17" rx="2.5" ry="1.5" fill="#047857" />
          </svg>
        );
      case 'bear':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <circle cx="6" cy="7" r="3" fill="#f43f5e" />
            <circle cx="18" cy="7" r="3" fill="#f43f5e" />
            <circle cx="12" cy="14" rx="7" ry="6.5" fill="#e11d48" />
            <ellipse cx="12" cy="15.5" rx="3.5" ry="2.5" fill="#ffffff" />
            <circle cx="9" cy="12" r="1" fill="#ffffff" />
            <circle cx="15" cy="12" r="1" fill="#ffffff" />
            <ellipse cx="12" cy="15" rx="1.5" ry="1" fill="#18181b" />
          </svg>
        );
      case 'whale':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M2 13C2 8 7 6 13 6C18 6 22 10 22 13C22 16 19 18 14 18C8 18 5 19 2 21C2 18 2 15 2 13Z" fill="#06b6d4" />
            <path d="M19 13C21 11 23 9 23 7C21 8 19 9 17 9" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" />
            <circle cx="6" cy="12" r="1" fill="#ffffff" />
          </svg>
        );
      case 'shark':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M3 14C7 11 12 11 16 13C19 11 21 7 21 7C21 12 19 16 14 17C9 18 5 17 3 14Z" fill="#0284c7" />
            <polygon points="12,5 9,12 14,11" fill="#0369a1" />
            <circle cx="18" cy="12" r="1" fill="#ffffff" />
          </svg>
        );
      case 'rocket':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M12 2C16 5 18 10 18 15L15 17L12 15L9 17L6 15C6 10 8 5 12 2Z" fill="#a855f7" />
            <circle cx="12" cy="9" r="2.5" fill="#ffffff" />
            <path d="M6 15L3 17L5 12" fill="#7c3aed" />
            <path d="M18 15L21 17L19 12" fill="#7c3aed" />
            <polygon points="12,18 10,22 14,22" fill="#f97316" />
          </svg>
        );
      case 'diamond':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <polygon points="6,4 18,4 22,10 12,22 2,10" fill="#14b8a6" />
            <polygon points="8,4 16,4 18,10 12,22 6,10" fill="#2dd4bf" />
            <polygon points="8,4 16,4 12,10" fill="#99f6e4" />
          </svg>
        );
      case 'moon':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M21 12.8A9 9 0 1 1 11.2 3A7 7 0 0 0 21 12.8Z" fill="#fbbf24" />
            <circle cx="9" cy="9" r="1.5" fill="#f59e0b" />
            <circle cx="13" cy="15" r="1.2" fill="#f59e0b" />
          </svg>
        );
      case 'star':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <polygon points="12,2 15,9 22,9.5 17,14.5 18.5,21.5 12,17.5 5.5,21.5 7,14.5 2,9.5 9,9" fill="#eab308" />
          </svg>
        );
      case 'bolt':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" fill="#facc15" />
          </svg>
        );
      case 'leaf':
        return (
          <svg viewBox="0 0 24 24" width={size * 0.65} height={size * 0.65} fill="none">
            <path d="M12 2C6 2 2 8 2 14C2 19 6 22 12 22C18 22 22 16 22 10C22 4 18 2 12 2Z" fill="#22c55e" />
            <path d="M12 22C12 15 15 10 20 6" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-[var(--panel-2,#141416)] border border-[var(--line,#1d1e21)] flex items-center justify-center shadow-inner shrink-0 ${className}`}
    >
      {renderSvg()}
    </div>
  );
};

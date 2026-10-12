import React, { useState, useEffect } from 'react';
import { Button } from '@cex/ui';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  consequenceText: string;
  requirePhrase?: 'HALT' | 'RESUME' | 'RESET';
  quickReasons?: string[];
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  consequenceText,
  requirePhrase,
  quickReasons,
  onConfirm,
  onCancel,
  isSubmitting,
}) => {
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setPhrase('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = reason.trim().length >= 5 && (!requirePhrase || phrase.trim() === requirePhrase);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-lg w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl"
      >
        <div>
          <h2 id="confirm-dialog-title" className="text-lg font-bold text-[var(--text,#f4f4f5)]">{title}</h2>
          <p className="text-[var(--text-2,#a1a1aa)] text-sm mt-1">{consequenceText}</p>
        </div>

        {quickReasons && quickReasons.length > 0 && (
          <div>
            <div className="text-xs text-[var(--text-3,#63636b)] mb-1.5 font-medium">Gợi ý lý do nhanh:</div>
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => setReason(qr)}
                  className="px-2 py-1 rounded bg-[var(--line,#1d1e21)]/60 hover:bg-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)] transition-colors border border-[var(--line,#1d1e21)]"
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-2,#a1a1aa)]">
            Lý do thao tác <span className="text-[var(--down,#f2475f)]">*</span> (tối thiểu 5 ký tự)
          </label>
          <textarea
            data-testid="confirm-reason"
            className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none h-24 focus:border-[var(--accent,#818cf8)] outline-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do thực hiện thao tác..."
          />
        </div>

        {requirePhrase && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-2,#a1a1aa)]">
              Nhập <span className="font-bold text-[var(--down,#f2475f)]">{requirePhrase}</span> để xác nhận
            </label>
            <input
              data-testid="confirm-phrase"
              className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded p-2.5 text-sm text-[var(--text,#f4f4f5)] focus:border-[var(--accent,#818cf8)] outline-none font-mono"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={requirePhrase}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-[var(--line,#1d1e21)]">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting} aria-label="Hủy bỏ">
            Hủy
          </Button>
          <Button
            data-testid="confirm-submit"
            variant="primary"
            onClick={() => onConfirm(reason)}
            disabled={!isValid || isSubmitting}
            aria-label="Xác nhận thao tác"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </div>
      </div>
    </div>
  );
};

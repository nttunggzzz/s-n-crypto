import React, { useState } from 'react';
import { Button } from '@cex/ui';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  consequenceText: string;
  requirePhrase?: 'HALT' | 'RESUME' | 'RESET';
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  consequenceText,
  requirePhrase,
  onConfirm,
  onCancel,
  isSubmitting
}) => {
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');

  if (!isOpen) return null;

  const isValid = reason.length >= 5 && (!requirePhrase || phrase === requirePhrase);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-panel border border-line rounded-lg w-full max-w-md p-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-text">{title}</h2>
        <p className="text-text-2 text-sm">{consequenceText}</p>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-2">Lý do (bắt buộc, tối thiểu 5 ký tự)</label>
          <textarea
            data-testid="confirm-reason"
            className="w-full bg-bg border border-line rounded p-2 text-text resize-none h-24 focus:border-accent outline-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do thực hiện thao tác..."
          />
        </div>

        {requirePhrase && (
          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-medium text-text-2">
              Nhập <span className="font-bold text-text">{requirePhrase}</span> để xác nhận
            </label>
            <input
              data-testid="confirm-phrase"
              className="w-full bg-bg border border-line rounded p-2 text-text focus:border-accent outline-none"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={requirePhrase}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            data-testid="confirm-submit"
            variant="primary"
            onClick={() => onConfirm(reason)}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </div>
      </div>
    </div>
  );
};

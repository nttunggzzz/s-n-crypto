import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { ReconciliationRun } from '@cex/contracts';
import { CheckCircle2, AlertTriangle, Play, RefreshCw } from 'lucide-react';

export const ReconciliationPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const api = getApiClient();
  const canRun = hasPerm('reconciliation.run');

  const loadRuns = () => {
    setIsLoading(true);
    api.adminReconciliationRuns({ query: { limit: 20 } })
      .then((res) => setRuns(res.items))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleRunRecon = async () => {
    setIsRunning(true);
    setResultMsg(null);
    try {
      const res = await api.adminRunReconciliation();
      if (res.ok) {
        setResultMsg(`Đối soát hoàn tất: Tất cả ${res.checkedBalances} số dư đều khớp chính xác!`);
      } else {
        setResultMsg(`Phát hiện ${res.mismatches.length} điểm lệch sổ cái! Vui lòng kiểm tra chi tiết.`);
      }
      loadRuns();
    } catch (e: any) {
      setResultMsg(e?.message || 'Có lỗi khi chạy đối soát.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Đối soát sổ cái & số dư</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Kiểm tra tính toàn vẹn giữa nhật ký giao dịch sổ cái (Ledger) và số dư ví thực tế của toàn bộ người dùng
          </p>
        </div>

        {canRun && (
          <button
            onClick={handleRunRecon}
            disabled={isRunning}
            className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 flex items-center gap-2 transition-all shadow disabled:opacity-50"
          >
            {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>{isRunning ? 'Đang chạy đối soát...' : 'Chạy đối soát ngay'}</span>
          </button>
        )}
      </div>

      {resultMsg && (
        <div className="p-4 rounded-xl bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] text-sm flex items-center justify-between">
          <span className="text-[var(--text,#f4f4f5)]">{resultMsg}</span>
          <button onClick={() => setResultMsg(null)} className="text-[var(--text-3,#63636b)] hover:text-white">×</button>
        </div>
      )}

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Mã phiên</th>
              <th className="px-5 py-3">Thời gian bắt đầu</th>
              <th className="px-5 py-3">Thời gian kết thúc</th>
              <th className="px-5 py-3">Số dư đã duyệt</th>
              <th className="px-5 py-3">Số điểm lệch</th>
              <th className="px-5 py-3">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 text-[var(--text-3,#63636b)]">{r.id.slice(0, 8)}...</td>
                <td className="px-5 py-3 text-[var(--text-2,#a1a1aa)]">{new Date(r.startedAt).toLocaleString('vi-VN')}</td>
                <td className="px-5 py-3 text-[var(--text-2,#a1a1aa)]">{new Date(r.finishedAt).toLocaleTimeString('vi-VN')}</td>
                <td className="px-5 py-3 font-semibold text-[var(--text,#f4f4f5)]">{r.checkedBalances}</td>
                <td className="px-5 py-3">
                  {r.mismatches.length > 0 ? (
                    <span className="text-[var(--down,#f2475f)] font-bold">{r.mismatches.length}</span>
                  ) : (
                    <span className="text-[var(--text-3,#63636b)]">0</span>
                  )}
                </td>
                <td className="px-5 py-3 font-sans">
                  {r.ok ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]">
                      <CheckCircle2 size={12} />
                      Khớp 100%
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)]">
                      <AlertTriangle size={12} />
                      Lệch sổ cái
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[var(--text-3,#63636b)] font-sans">
                  Chưa có phiên đối soát nào được ghi nhận
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

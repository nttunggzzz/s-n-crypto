import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../services/errors';
import { dec } from '@cex/core';
import type { ReconciliationRun } from '@cex/contracts';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

const MISMATCHES_PER_PAGE = 10;

export const ReconciliationPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const { hasPerm } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [mismatchPages, setMismatchPages] = useState<Record<string, number>>({});

  const api = getApiClient();
  const canRun = hasPerm('reconciliation.run');

  const goTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const loadRuns = async (cursor?: string) => {
    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);
    try {
      const res = await api.adminReconciliationRuns({ query: { cursor, limit: 20 } });
      if (cursor) {
        setRuns((prev) => [...prev, ...res.items]);
      } else {
        setRuns(res.items);
      }
      setNextCursor(res.nextCursor);
    } catch (e: any) {
      setLoadError(formatApiError(e, 'Không thể tải danh sách phiên đối soát.'));
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleRunRecon = async () => {
    setIsRunning(true);
    setResultMsg(null);
    try {
      const res = await api.adminRunReconciliation({ body: {} });
      if (res.ok && (res.mismatches?.length ?? 0) === 0) {
        setResultMsg({
          text: `Đối soát hoàn tất: Tất cả ${res.checkedBalances} số dư đều khớp chính xác!`,
          isError: false,
        });
      } else {
        setResultMsg({
          text: `Phát hiện ${res.mismatches.length} điểm lệch sổ cái! Vui lòng kiểm tra chi tiết bên dưới.`,
          isError: true,
        });
      }
      setExpandedRunId(res.id);
      await loadRuns();
    } catch (e: any) {
      setResultMsg({
        text: formatApiError(e, 'Có lỗi khi chạy đối soát.'),
        isError: true,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRunId((prev) => (prev === id ? null : id));
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
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            resultMsg.isError
              ? 'bg-[var(--down,#f2475f)]/15 border-[var(--down,#f2475f)]/30 text-[var(--down,#f2475f)]'
              : 'bg-[var(--up,#1fc27a)]/15 border-[var(--up,#1fc27a)]/30 text-[var(--up,#1fc27a)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {resultMsg.isError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span className="font-semibold">{resultMsg.text}</span>
          </div>
          <button
            onClick={() => setResultMsg(null)}
            className="text-[var(--text-3,#63636b)] hover:text-white font-bold text-base ml-2"
          >
            ×
          </button>
        </div>
      )}

      {loadError && runs.length === 0 && (
        <div
          data-testid="list-error"
          className="p-12 text-center bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-2xl flex flex-col items-center justify-center my-6"
        >
          <div className="w-12 h-12 mb-4 rounded-full bg-[var(--down,#f6465d)]/10 flex items-center justify-center text-[var(--down,#f6465d)]">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text,#f4f4f5)] mb-2">Không thể tải dữ liệu</h2>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mb-6 max-w-md">{loadError}</p>
          <button
            onClick={() => loadRuns()}
            disabled={isLoading}
            className="px-4 py-2 bg-[var(--accent,#818cf8)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent,#818cf8)]/90 disabled:opacity-50 transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
              <tr>
                <th className="w-8 px-2 py-3 text-center"></th>
                <th className="px-4 py-3">Mã phiên</th>
                <th className="px-4 py-3">Thời gian bắt đầu</th>
                <th className="px-4 py-3">Thời gian kết thúc</th>
                <th className="px-4 py-3">Số dư đã duyệt</th>
                <th className="px-4 py-3">Số điểm lệch</th>
                <th className="px-4 py-3">Kết quả</th>
                <th className="px-4 py-3 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
              {runs.map((r) => {
                const isExpanded = expandedRunId === r.id;
                const curMismatchPage = mismatchPages[r.id] ?? 1;
                const totalMismatchPages = Math.ceil(r.mismatches.length / MISMATCHES_PER_PAGE);
                const paginatedMismatches = r.mismatches.slice(
                  (curMismatchPage - 1) * MISMATCHES_PER_PAGE,
                  curMismatchPage * MISMATCHES_PER_PAGE
                );

                return (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => toggleExpand(r.id)}
                      className="hover:bg-[var(--line,#1d1e21)]/25 cursor-pointer transition-colors"
                    >
                      <td className="px-2 py-3 text-center text-[var(--text-3,#63636b)]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--text-3,#63636b)]">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <span title={r.id}>{r.id}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(r.id);
                              setCopiedId(r.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="p-1 hover:text-[var(--text,#f4f4f5)] text-[var(--text-3,#63636b)] transition-colors cursor-pointer"
                            title="Sao chép mã phiên"
                          >
                            {copiedId === r.id ? <Check size={12} className="text-[var(--up,#1fc27a)]" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">
                        {new Date(r.startedAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-2,#a1a1aa)]">
                        {new Date(r.finishedAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text,#f4f4f5)]">
                        {r.checkedBalances}
                      </td>
                      <td className="px-4 py-3">
                        {r.mismatches.length > 0 ? (
                          <span className="text-[var(--down,#f2475f)] font-bold">{r.mismatches.length}</span>
                        ) : (
                          <span className="text-[var(--text-3,#63636b)]">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans">
                        {r.ok && (r.mismatches?.length ?? 0) === 0 ? (
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
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(r.id);
                          }}
                          className="text-xs text-[var(--accent,#818cf8)] hover:underline font-sans"
                        >
                          {isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${r.id}-details`} className="bg-[var(--line,#1d1e21)]/10">
                        <td colSpan={8} className="p-4">
                          <div className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-[var(--line,#1d1e21)] flex items-center justify-between text-xs font-sans">
                              <span className="font-semibold text-[var(--text,#f4f4f5)]">
                                Chi tiết phiên đối soát ({r.id})
                              </span>
                              <span className="text-[var(--text-2,#a1a1aa)]">
                                {r.mismatches.length} điểm lệch phát hiện
                              </span>
                            </div>

                            {r.mismatches.length === 0 ? (
                              <div className="p-6 text-center text-xs text-[var(--up,#1fc27a)] font-sans">
                                ✓ Tất cả số dư và sổ cái đều khớp chính xác 100%, không phát hiện điểm lệch nào.
                              </div>
                            ) : (
                              <div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs font-sans">
                                    <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] uppercase font-semibold text-[11px]">
                                      <tr>
                                        <th className="px-3 py-2">Loại sai lệch (kind)</th>
                                        <th className="px-3 py-2">Ví</th>
                                        <th className="px-3 py-2">Người dùng</th>
                                        <th className="px-3 py-2">Tài sản</th>
                                        <th className="px-3 py-2">Trường</th>
                                        <th className="px-3 py-2 text-right">Kỳ vọng (expected)</th>
                                        <th className="px-3 py-2 text-right">Thực tế (actual)</th>
                                        <th className="px-3 py-2 text-right">Chênh lệch</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {paginatedMismatches.map((m, idx) => (
                                        <tr
                                          key={`${m.userId}-${m.asset}-${m.field}-${m.kind}-${idx}`}
                                          data-testid="recon-mismatch-row"
                                          className="border-b border-[var(--line,#1d1e21)]/40 hover:bg-[var(--line,#1d1e21)]/20"
                                        >
                                          <td className="px-3 py-2 font-mono">
                                            <span className="px-1.5 py-0.5 rounded bg-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] text-[11px]">
                                              {m.kind}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 font-semibold font-mono">
                                            <span className={m.account === 'FUTURES' ? 'text-amber-400' : 'text-blue-400'}>
                                              {m.account}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                goTo(`/admin/users/${m.userId}`);
                                              }}
                                              className="inline-flex items-center gap-1 text-[var(--accent,#818cf8)] hover:underline font-mono text-xs"
                                              title={`Xem chi tiết người dùng ${m.userId}`}
                                            >
                                              <span>{m.userId}</span>
                                              <ExternalLink size={10} />
                                            </button>
                                          </td>
                                          <td className="px-3 py-2 font-bold text-[var(--text,#f4f4f5)]">{m.asset}</td>
                                          <td className="px-3 py-2 font-mono text-[var(--text-2,#a1a1aa)]">{m.field}</td>
                                          <td className="px-3 py-2 font-mono text-right text-[var(--text-2,#a1a1aa)]">
                                            {m.expected}
                                          </td>
                                          <td className="px-3 py-2 font-mono text-right text-[var(--text,#f4f4f5)]">
                                            {m.actual}
                                          </td>
                                          <td className="px-3 py-2 font-mono text-right font-bold text-[var(--down,#f2475f)]">
                                            {(() => {
                                              try {
                                                const diff = dec(m.actual).sub(dec(m.expected));
                                                return (diff.gt(0) ? '+' : '') + diff.toString();
                                              } catch {
                                                return '—';
                                              }
                                            })()}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {totalMismatchPages > 1 && (
                                  <div className="flex items-center justify-between px-4 py-2 bg-[var(--panel,#0a0a0b)] border-t border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)]">
                                    <span>
                                      Hiển thị {(curMismatchPage - 1) * MISMATCHES_PER_PAGE + 1}–
                                      {Math.min(curMismatchPage * MISMATCHES_PER_PAGE, r.mismatches.length)} trên tổng {r.mismatches.length} sai lệch
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMismatchPages((prev) => ({
                                            ...prev,
                                            [r.id]: Math.max(1, curMismatchPage - 1),
                                          }));
                                        }}
                                        disabled={curMismatchPage <= 1}
                                        className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-[var(--text,#f4f4f5)] disabled:opacity-40 transition-colors"
                                      >
                                        Trước
                                      </button>
                                      <span className="font-mono text-[var(--text,#f4f4f5)]">
                                        {curMismatchPage} / {totalMismatchPages}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMismatchPages((prev) => ({
                                            ...prev,
                                            [r.id]: Math.min(totalMismatchPages, curMismatchPage + 1),
                                          }));
                                        }}
                                        disabled={curMismatchPage >= totalMismatchPages}
                                        className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-[var(--text,#f4f4f5)] disabled:opacity-40 transition-colors"
                                      >
                                        Sau
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!isLoading && runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-[var(--text-3,#63636b)] font-sans">
                    Chưa có phiên đối soát nào được ghi nhận
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && (
          <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
            <button
              onClick={() => loadRuns(nextCursor)}
              disabled={isLoadingMore}
              data-testid="list-more"
              className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Đang tải...' : 'Xem thêm'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

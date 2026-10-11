import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import type { AuditLogEntry, AuditAction, AuditTargetType } from '@cex/contracts';
import { FileText, Filter, Eye, ChevronRight, X } from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<AuditTargetType | ''>('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const api = getApiClient();

  const loadLogs = () => {
    setIsLoading(true);
    api.adminAuditLogs({
      query: {
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
        limit: 100,
      },
    })
      .then((res) => setLogs(res.items))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, targetTypeFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Nhật ký quản trị (Audit Logs)</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Ghi nhận bất biến mọi thay đổi dữ liệu của nhân viên vận hành sàn và hệ thống
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as AuditAction | '')}
            className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-2,#a1a1aa)] outline-none"
          >
            <option value="">Tất cả hành động</option>
            <option value="BALANCE_ADJUST">BALANCE_ADJUST</option>
            <option value="USER_LOCK">USER_LOCK</option>
            <option value="USER_UNLOCK">USER_UNLOCK</option>
            <option value="TRADING_HALT">TRADING_HALT</option>
            <option value="TRADING_RESUME">TRADING_RESUME</option>
            <option value="SETTINGS_UPDATE">SETTINGS_UPDATE</option>
            <option value="USER_ROLE">USER_ROLE</option>
            <option value="ACCOUNT_RESET">ACCOUNT_RESET</option>
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value as AuditTargetType | '')}
            className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-2,#a1a1aa)] outline-none"
          >
            <option value="">Tất cả đối tượng</option>
            <option value="USER">USER</option>
            <option value="EXCHANGE">EXCHANGE</option>
            <option value="SYMBOL">SYMBOL</option>
            <option value="ASSET">ASSET</option>
            <option value="ANNOUNCEMENT">ANNOUNCEMENT</option>
            <option value="INVITE">INVITE</option>
          </select>
        </div>
      </div>

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Thời gian</th>
              <th className="px-5 py-3">Người thực hiện</th>
              <th className="px-5 py-3">Hành động</th>
              <th className="px-5 py-3">Đối tượng</th>
              <th className="px-5 py-3">Lý do</th>
              <th className="px-5 py-3 text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {logs.map((l) => (
              <tr key={l.id} data-testid="audit-row" className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 text-xs text-[var(--text-3,#63636b)] font-mono whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString('vi-VN')}
                </td>
                <td className="px-5 py-3 font-medium text-xs text-[var(--text,#f4f4f5)]">
                  {l.actor?.email ?? '(Hệ thống)'}
                </td>
                <td className="px-5 py-3">
                  <span className="px-2 py-0.5 bg-[var(--line,#1d1e21)] rounded text-xs font-mono font-semibold text-[var(--accent,#818cf8)]">
                    {l.action}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-[var(--text-2,#a1a1aa)]">
                  {l.targetType ? `${l.targetType} (${l.targetId?.slice(0, 8) || '—'})` : '—'}
                </td>
                <td className="px-5 py-3 text-xs text-[var(--text-2,#a1a1aa)] max-w-xs truncate" title={l.reason || ''}>
                  {l.reason || '—'}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setSelectedEntry(l)}
                    className="p-1 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-white"
                    title="Xem thay đổi Before / After"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy nhật ký thao tác nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Compare Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text,#f4f4f5)]">Chi tiết thao tác nhật ký</h2>
                <div className="text-xs text-[var(--text-3,#63636b)] mt-0.5">Mã ID: {selectedEntry.id}</div>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="text-[var(--text-3,#63636b)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg,#000000)] p-3 rounded-lg border border-[var(--line,#1d1e21)]">
              <div><strong className="text-[var(--text-3,#63636b)]">Hành động:</strong> {selectedEntry.action}</div>
              <div><strong className="text-[var(--text-3,#63636b)]">Thời gian:</strong> {new Date(selectedEntry.createdAt).toLocaleString('vi-VN')}</div>
              <div><strong className="text-[var(--text-3,#63636b)]">Thực hiện bởi:</strong> {selectedEntry.actor?.email || 'Hệ thống'}</div>
              <div><strong className="text-[var(--text-3,#63636b)]">Địa chỉ IP:</strong> {selectedEntry.ip || '—'}</div>
              <div className="col-span-2"><strong className="text-[var(--text-3,#63636b)]">Lý do:</strong> {selectedEntry.reason || '—'}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1 uppercase">Dữ liệu trước (Before)</div>
                <pre className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs font-mono text-amber-300/80 overflow-auto max-h-60">
                  {selectedEntry.before ? JSON.stringify(selectedEntry.before, null, 2) : 'null'}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-2,#a1a1aa)] mb-1 uppercase">Dữ liệu sau (After)</div>
                <pre className="p-3 bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg text-xs font-mono text-[var(--up,#1fc27a)]/80 overflow-auto max-h-60">
                  {selectedEntry.after ? JSON.stringify(selectedEntry.after, null, 2) : 'null'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] text-xs font-semibold text-white hover:bg-[var(--line,#1d1e21)]/80"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

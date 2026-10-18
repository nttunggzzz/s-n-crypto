import React, { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '../services/api';
import { formatApiError } from '../services/errors';
import type { AuditLogEntry, AuditAction, AuditTargetType } from '@cex/contracts';
import { FileText, Filter, Eye, ChevronRight, X, User } from 'lucide-react';

const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_LOCK: 'Khóa tài khoản',
  USER_UNLOCK: 'Mở khóa tài khoản',
  USER_SIGNALS_ACCESS: 'Quyền tín hiệu',
  USER_ROLE: 'Đổi vai trò',
  BALANCE_ADJUST: 'Điều chỉnh số dư',
  ACCOUNT_RESET: 'Đặt lại tài khoản',
  SETTINGS_UPDATE: 'Cấu hình sàn',
  TRADING_HALT: 'Dừng sàn khẩn cấp',
  TRADING_RESUME: 'Mở lại giao dịch',
  SYMBOL_UPDATE: 'Cấu hình cặp Spot',
  RECONCILIATION_RUN: 'Chạy đối soát',
  TWO_FACTOR_ENABLE: 'Bật 2FA',
  TWO_FACTOR_DISABLE: 'Tắt 2FA',
  ROLE_BOOTSTRAP: 'Khởi tạo vai trò',
  ASSET_UPDATE: 'Cấu hình tài sản/coin',
  ANNOUNCEMENT_CREATE: 'Tạo thông báo',
  ANNOUNCEMENT_UPDATE: 'Sửa thông báo',
  FUTURES_SYMBOL_UPDATE: 'Cấu hình Futures',
  GRID_BOT_STOP: 'Dừng Grid Bot',
  DCA_PLAN_CANCEL: 'Hủy kế hoạch DCA',
  INVITE_CREATE: 'Tạo mã mời',
  INVITE_REVOKE: 'Thu hồi mã mời',
  TAX_SETTINGS_UPDATE: 'Cấu hình thuế',
};

const ALL_AUDIT_ACTIONS: AuditAction[] = [
  'USER_LOCK',
  'USER_UNLOCK',
  'USER_SIGNALS_ACCESS',
  'USER_ROLE',
  'BALANCE_ADJUST',
  'ACCOUNT_RESET',
  'SETTINGS_UPDATE',
  'TRADING_HALT',
  'TRADING_RESUME',
  'SYMBOL_UPDATE',
  'RECONCILIATION_RUN',
  'TWO_FACTOR_ENABLE',
  'TWO_FACTOR_DISABLE',
  'ROLE_BOOTSTRAP',
  'ASSET_UPDATE',
  'ANNOUNCEMENT_CREATE',
  'ANNOUNCEMENT_UPDATE',
  'FUTURES_SYMBOL_UPDATE',
  'GRID_BOT_STOP',
  'DCA_PLAN_CANCEL',
  'INVITE_CREATE',
  'INVITE_REVOKE',
  'TAX_SETTINGS_UPDATE',
];

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<AuditTargetType | ''>('');
  const [actorQuery, setActorQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  // Applied filters state
  const [appliedFilters, setAppliedFilters] = useState<{
    action: AuditAction | '';
    targetType: AuditTargetType | '';
    actor: string;
    target: string;
    from: string;
    to: string;
  }>({
    action: '',
    targetType: '',
    actor: '',
    target: '',
    from: '',
    to: '',
  });

  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const api = getApiClient();

  const loadLogs = useCallback(
    async (isLoadMore = false, cursor?: string | null) => {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        let resolvedActorId: string | undefined = undefined;
        let resolvedTargetId: string | undefined = undefined;

        // Resolve actor query if provided
        if (appliedFilters.actor.trim()) {
          const cleanActor = appliedFilters.actor.trim();
          if (/^\d+$/.test(cleanActor)) {
            const list = await api.adminListUsers({ query: { q: cleanActor, limit: 1 } });
            const matched = list.items.find((u) => u.uid === cleanActor || u.id === cleanActor);
            if (matched) {
              resolvedActorId = matched.id;
            } else {
              if (!isLoadMore) setLogs([]);
              setNextCursor(null);
              return;
            }
          } else {
            resolvedActorId = cleanActor;
          }
        }

        // Resolve target query if provided
        if (appliedFilters.target.trim()) {
          const cleanTarget = appliedFilters.target.trim();
          if (/^\d+$/.test(cleanTarget)) {
            const list = await api.adminListUsers({ query: { q: cleanTarget, limit: 1 } });
            const matched = list.items.find((u) => u.uid === cleanTarget || u.id === cleanTarget);
            if (matched) {
              resolvedTargetId = matched.id;
            } else {
              if (!isLoadMore) setLogs([]);
              setNextCursor(null);
              return;
            }
          } else {
            resolvedTargetId = cleanTarget;
          }
        }

        const query: Record<string, any> = {
          limit: 50,
        };
        if (appliedFilters.action) query.action = appliedFilters.action;
        if (appliedFilters.targetType) query.targetType = appliedFilters.targetType;
        if (resolvedActorId) query.actorId = resolvedActorId;
        if (resolvedTargetId) query.targetId = resolvedTargetId;
        if (appliedFilters.from) query.from = new Date(appliedFilters.from).toISOString();
        if (appliedFilters.to) query.to = new Date(appliedFilters.to).toISOString();
        if (cursor) query.cursor = cursor;

        const res = await api.adminAuditLogs({ query });
        if (isLoadMore) {
          setLogs((prev) => [...prev, ...res.items]);
        } else {
          setLogs(res.items);
        }
        setNextCursor(res.nextCursor);
      } catch (e: any) {
        if (!isLoadMore) setLogs([]);
        setLoadError(formatApiError(e, 'Không thể tải nhật ký quản trị.'));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [api, appliedFilters]
  );

  useEffect(() => {
    loadLogs(false);
  }, [loadLogs]);

  const handleApplyFilter = () => {
    setAppliedFilters({
      action: actionFilter,
      targetType: targetTypeFilter,
      actor: actorQuery,
      target: targetQuery,
      from: fromFilter,
      to: toFilter,
    });
  };

  const handleResetFilter = () => {
    setActionFilter('');
    setTargetTypeFilter('');
    setActorQuery('');
    setTargetQuery('');
    setFromFilter('');
    setToFilter('');
    setAppliedFilters({
      action: '',
      targetType: '',
      actor: '',
      target: '',
      from: '',
      to: '',
    });
  };

  const hasFilterActive =
    actionFilter || targetTypeFilter || actorQuery || targetQuery || fromFilter || toFilter;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Nhật ký quản trị (Audit Logs)</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Ghi nhận bất biến mọi thay đổi dữ liệu của nhân viên vận hành sàn và hệ thống (đã tải {logs.length} bản ghi)
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Action Filter with all 23 actions */}
          <div className="flex flex-col gap-1 min-w-[200px] flex-1">
            <label className="text-[11px] font-semibold text-[var(--text-3,#63636b)] uppercase">Hành động ({ALL_AUDIT_ACTIONS.length})</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as AuditAction | '')}
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
            >
              <option value="">Tất cả 23 hành động</option>
              {ALL_AUDIT_ACTIONS.map((act) => (
                <option key={act} value={act}>
                  {act} — {AUDIT_ACTION_LABELS[act]}
                </option>
              ))}
            </select>
          </div>

          {/* Target Type Filter */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-[11px] font-semibold text-[var(--text-3,#63636b)] uppercase">Loại đối tượng</label>
            <select
              value={targetTypeFilter}
              onChange={(e) => setTargetTypeFilter(e.target.value as AuditTargetType | '')}
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
            >
              <option value="">Tất cả đối tượng</option>
              <option value="USER">USER - Người dùng</option>
              <option value="EXCHANGE">EXCHANGE - Toàn sàn</option>
              <option value="SYMBOL">SYMBOL - Cặp giao dịch</option>
              <option value="ASSET">ASSET - Tài sản/Coin</option>
              <option value="ANNOUNCEMENT">ANNOUNCEMENT - Thông báo</option>
              <option value="INVITE">INVITE - Mã mời</option>
            </select>
          </div>

          {/* Actor Query (UID or UUID) */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-[11px] font-semibold text-[var(--text-3,#63636b)] uppercase">Người làm (UID / ID)</label>
            <input
              type="text"
              value={actorQuery}
              onChange={(e) => setActorQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
              placeholder="UID 8 số hoặc ID..."
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text,#f4f4f5)] font-mono outline-none focus:border-[var(--accent,#818cf8)]"
            />
          </div>

          {/* Target Query (UID or ID) */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-[11px] font-semibold text-[var(--text-3,#63636b)] uppercase">ID đối tượng (UID / ID)</label>
            <input
              type="text"
              value={targetQuery}
              onChange={(e) => setTargetQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
              placeholder="UID 8 số hoặc ID..."
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text,#f4f4f5)] font-mono outline-none focus:border-[var(--accent,#818cf8)]"
            />
          </div>

          {/* From Date */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-[11px] font-semibold text-[var(--text-3,#63636b)] uppercase">Từ ngày</label>
            <input
              type="datetime-local"
              value={fromFilter}
              onChange={(e) => setFromFilter(e.target.value)}
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2 py-1 text-xs text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
            />
          </div>

          {/* To Date */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-[11px] font-semibold text-[var(--text-3,#63636b)] uppercase">Đến ngày</label>
            <input
              type="datetime-local"
              value={toFilter}
              onChange={(e) => setToFilter(e.target.value)}
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-2 py-1 text-xs text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 self-end pb-0.5">
            <button
              type="button"
              onClick={handleApplyFilter}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] hover:bg-[var(--accent,#818cf8)]/80 text-white font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <Filter size={12} />
              Lọc
            </button>
            {hasFilterActive && (
              <button
                type="button"
                onClick={handleResetFilter}
                className="px-3 py-1.5 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-[var(--text-2,#a1a1aa)] text-xs transition-colors"
              >
                Đặt lại
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
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
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-xs text-[var(--text-3,#63636b)]">
                    Đang tải nhật ký kiểm toán...
                  </td>
                </tr>
              )}
              {!isLoading && loadError && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <div data-testid="list-error" className="flex flex-col items-center justify-center gap-3">
                      <p className="text-sm text-[var(--down,#f2475f)]">{loadError}</p>
                      <button
                        type="button"
                        onClick={() => loadLogs(false)}
                        className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
                      >
                        Thử lại
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !loadError && logs.map((l) => (
                <tr key={l.id} data-testid="audit-row" className="hover:bg-[var(--line,#1d1e21)]/15">
                  <td className="px-5 py-3 text-xs text-[var(--text-3,#63636b)] font-mono whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {l.actor ? (
                      <a
                        href={`/admin/users/${l.actor.id}`}
                        className="text-[var(--accent,#818cf8)] hover:underline font-medium"
                      >
                        {l.actor.email}
                      </a>
                    ) : (
                      <span className="text-[var(--text-3,#63636b)] font-sans">(Hệ thống)</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col">
                      <span className="font-mono font-semibold text-xs text-[var(--accent,#818cf8)]">
                        {l.action}
                      </span>
                      <span className="text-[11px] text-[var(--text-3,#63636b)]">
                        {AUDIT_ACTION_LABELS[l.action] || l.action}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {l.targetType ? (
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)]">
                          {l.targetType}
                        </span>
                        {l.targetType === 'USER' && l.targetId ? (
                          <a
                            href={`/admin/users/${l.targetId}`}
                            className="text-[var(--accent,#818cf8)] hover:underline font-mono"
                          >
                            {l.targetId.slice(0, 8)}...
                          </a>
                        ) : l.targetId ? (
                          <span className="text-[var(--text-3,#63636b)] font-mono" title={l.targetId}>
                            {l.targetId.slice(0, 8)}...
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[var(--text-3,#63636b)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-[var(--text-2,#a1a1aa)] max-w-xs truncate" title={l.reason || ''}>
                    {l.reason || '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setSelectedEntry(l)}
                      className="p-1.5 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)] hover:text-white transition-colors"
                      title="Xem thay đổi Before / After"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && !loadError && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                    Không tìm thấy nhật ký thao tác nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && !isLoading && !loadError && (
          <div className="p-4 border-t border-[var(--line,#1d1e21)] flex justify-center">
            <button
              onClick={() => loadLogs(true, nextCursor)}
              disabled={isLoadingMore}
              data-testid="list-more"
              className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-semibold text-[var(--text,#f4f4f5)] transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Đang tải...' : 'Xem thêm'}
            </button>
          </div>
        )}
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
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Hành động:</strong>{' '}
                <span className="font-semibold text-[var(--accent,#818cf8)]">{selectedEntry.action}</span> (
                {AUDIT_ACTION_LABELS[selectedEntry.action] || selectedEntry.action})
              </div>
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Thời gian:</strong>{' '}
                {new Date(selectedEntry.createdAt).toLocaleString('vi-VN')}
              </div>
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Thực hiện bởi:</strong>{' '}
                {selectedEntry.actor ? selectedEntry.actor.email : 'Hệ thống'}
              </div>
              <div>
                <strong className="text-[var(--text-3,#63636b)]">Địa chỉ IP:</strong> {selectedEntry.ip || '—'}
              </div>
              <div className="col-span-2">
                <strong className="text-[var(--text-3,#63636b)]">Lý do:</strong> {selectedEntry.reason || '—'}
              </div>
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

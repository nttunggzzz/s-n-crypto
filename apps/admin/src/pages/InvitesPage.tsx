import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatApiError } from '../services/errors';
import type { Invite, InviteStatus, CreatedInvite } from '@cex/contracts';
import { KeyRound, Plus, Copy, Check, Ban } from 'lucide-react';

export const InvitesPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [statusFilter, setStatusFilter] = useState<InviteStatus | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create invite modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [createdResult, setCreatedResult] = useState<CreatedInvite | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Revoke modal
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const api = getApiClient();
  const canInvite = hasPerm('users.invite');

  const loadInvites = () => {
    setIsLoading(true);
    setLoadError(null);
    api.adminListInvites({ query: { status: statusFilter || undefined } })
      .then((res) => setInvites(res.items))
      .catch((e: any) => setLoadError(formatApiError(e, 'Không thể tải danh sách mã mời.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadInvites();
  }, [statusFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note) return;
    setIsSubmitting(true);
    setCreateError(null);
    try {
      const res = await api.adminCreateInvite({
        body: { note, maxUses, expiresInDays },
      });
      setCreatedResult(res);
      setCreateError(null);
      loadInvites();
    } catch (e) {
      setCreateError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenRevoke = (inv: Invite) => {
    setSelectedInvite(inv);
    setRevokeError(null);
    setRevokeOpen(true);
  };

  const handleConfirmRevoke = async (reason: string) => {
    if (!selectedInvite) return;
    setIsSubmitting(true);
    setRevokeError(null);
    try {
      await api.adminRevokeInvite({
        params: { inviteId: selectedInvite.id },
        body: { reason },
      });
      setRevokeOpen(false);
      setRevokeError(null);
      loadInvites();
    } catch (e) {
      setRevokeError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Mã mời đăng ký (Invites)</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Quản lý và cấp mã mời tham gia sàn dành cho giai đoạn thử nghiệm đóng
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InviteStatus | '')}
            className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-2,#a1a1aa)] outline-none"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="USED_UP">Hết lượt dùng</option>
            <option value="EXPIRED">Đã hết hạn</option>
            <option value="REVOKED">Đã thu hồi</option>
          </select>

          {canInvite && (
            <button
              onClick={() => { setCreatedResult(null); setNote(''); setIsCreateOpen(true); }}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 flex items-center gap-1.5 transition-all shadow"
            >
              <Plus size={14} />
              <span>Tạo mã mời</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Mã (Prefix)</th>
              <th className="px-5 py-3">Ghi chú đối tượng</th>
              <th className="px-5 py-3">Lượt dùng</th>
              <th className="px-5 py-3">Hạn dùng</th>
              <th className="px-5 py-3">Trạng thái</th>
              <th className="px-5 py-3">Người tạo</th>
              {canInvite && <th className="px-5 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {invites.map((inv) => (
              <tr key={inv.id} className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 font-mono font-bold text-[var(--accent,#818cf8)]">{inv.codePrefix}••••</td>
                <td className="px-5 py-3 font-medium text-[var(--text,#f4f4f5)]">{inv.note}</td>
                <td className="px-5 py-3 font-mono text-xs">{inv.uses} / {inv.maxUses}</td>
                <td className="px-5 py-3 text-xs text-[var(--text-3,#63636b)]">{new Date(inv.expiresAt).toLocaleDateString('vi-VN')}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                    inv.status === 'ACTIVE' ? 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)]' :
                    inv.status === 'REVOKED' ? 'bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)]' :
                    'bg-[var(--line,#1d1e21)] text-[var(--text-3,#63636b)]'
                  }`}>
                    {inv.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-[var(--text-2,#a1a1aa)]">{inv.createdBy?.email || 'Hệ thống'}</td>
                {canInvite && (
                  <td className="px-5 py-3 text-right">
                    {inv.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleOpenRevoke(inv)}
                        className="px-2.5 py-1 rounded bg-[var(--down,#f2475f)]/10 hover:bg-[var(--down,#f2475f)]/20 text-[var(--down,#f2475f)] text-xs border border-[var(--down,#f2475f)]/30"
                      >
                        Thu hồi
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {loadError && invites.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center">
                  <div data-testid="list-error" className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-[var(--down,#f2475f)]">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadInvites()}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
                    >
                      Thử lại
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !loadError && invites.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Chưa có mã mời nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            {createdResult ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-[var(--up,#1fc27a)]">Đã tạo mã mời thành công!</h2>
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg text-xs text-amber-300">
                  ⚠️ Lưu ý: Mã này chỉ hiển thị duy nhất một lần tại đây. Vui lòng sao chép và gửi cho người nhận ngay.
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-[var(--text-3,#63636b)] font-sans block mb-1">Mã mời:</span>
                    <div className="flex items-center gap-2 bg-[var(--bg,#000000)] p-2.5 rounded border border-[var(--line,#1d1e21)]">
                      <span className="font-bold text-base text-[var(--accent,#818cf8)] flex-1">{createdResult.code}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(createdResult.code); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }}
                        className="p-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-white"
                      >
                        {copiedCode ? <Check size={14} className="text-[var(--up,#1fc27a)]" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[var(--text-3,#63636b)] font-sans block mb-1">Đường link đăng ký trực tiếp:</span>
                    <div className="flex items-center gap-2 bg-[var(--bg,#000000)] p-2 rounded border border-[var(--line,#1d1e21)]">
                      <span className="text-xs truncate flex-1 text-[var(--text-2,#a1a1aa)]">{createdResult.link}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(createdResult.link); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
                        className="p-1 rounded bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-white"
                      >
                        {copiedLink ? <Check size={14} className="text-[var(--up,#1fc27a)]" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 rounded-lg bg-[var(--line,#1d1e21)] text-sm text-[var(--text,#f4f4f5)] font-semibold hover:bg-[var(--line,#1d1e21)]/80"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">Tạo mã mời mới</h2>

                {createError && (
                  <div
                    data-testid="confirm-error"
                    className="p-3 rounded-lg bg-[var(--down,#f2475f)]/15 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)] leading-relaxed"
                  >
                    {createError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Ghi chú đối tượng</label>
                  <input
                    type="text"
                    required
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: Anh Nam - thử nghiệm Bot"
                    className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Số lượt dùng tối đa</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={maxUses}
                      onChange={(e) => setMaxUses(parseInt(e.target.value, 10))}
                      className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Thời hạn (ngày)</label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10))}
                      className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
                  <button
                    type="button"
                    onClick={() => { setIsCreateOpen(false); setCreateError(null); }}
                    className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/40"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-40"
                  >
                    {isSubmitting ? 'Đang tạo...' : 'Tạo mã'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirm */}
      {selectedInvite && (
        <ConfirmDialog
          isOpen={revokeOpen}
          title={`Thu hồi mã mời ${selectedInvite.codePrefix}••••`}
          consequenceText="Mã mời này sẽ bị vô hiệu hóa ngay lập tức. Người giữ mã sẽ không thể đăng ký tài khoản được nữa."
          onConfirm={handleConfirmRevoke}
          onCancel={() => { setRevokeOpen(false); setSelectedInvite(null); setRevokeError(null); }}
          isSubmitting={isSubmitting}
          error={revokeError}
        />
      )}
    </div>
  );
};

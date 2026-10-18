import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../services/errors';
import type { AdminAnnouncement, AnnouncementLevel } from '@cex/contracts';
import { Plus, Eye, EyeOff, Pin, Edit3, Send, X, Calendar } from 'lucide-react';

export const AnnouncementsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Create/Edit state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminAnnouncement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState<AnnouncementLevel>('INFO');
  const [pinned, setPinned] = useState(false);
  const [publish, setPublish] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const canManage = hasPerm('content.manage');

  const loadAnnouncements = () => {
    setIsLoading(true);
    api.adminListAnnouncements({ query: { includeHidden: includeHidden ? 'true' : 'false' } })
      .then((res) => setItems(res.items))
      .catch((err) => setActionError(formatApiError(err)))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadAnnouncements();
  }, [includeHidden]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setTitle('');
    setBody('');
    setLevel('INFO');
    setPinned(false);
    setPublish(true);
    setExpiresAt('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (a: AdminAnnouncement) => {
    setEditingItem(a);
    setTitle(a.title);
    setBody(a.body);
    setLevel(a.level);
    setPinned(a.pinned);
    setPublish(Boolean(a.publishedAt));
    setExpiresAt(a.expiresAt ? new Date(a.expiresAt).toISOString().slice(0, 16) : '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setModalError(null);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const parsedExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : null;

      if (editingItem) {
        const payload: any = {};
        if (title.trim() !== editingItem.title) payload.title = title.trim();
        if (body.trim() !== editingItem.body) payload.body = body.trim();
        if (level !== editingItem.level) payload.level = level;
        if (pinned !== editingItem.pinned) payload.pinned = pinned;
        const wasPublished = Boolean(editingItem.publishedAt);
        if (publish !== wasPublished) payload.published = publish;
        const origExpires = editingItem.expiresAt ? new Date(editingItem.expiresAt).toISOString() : null;
        if (origExpires !== parsedExpiresAt) payload.expiresAt = parsedExpiresAt;

        if (Object.keys(payload).length > 0) {
          await api.adminUpdateAnnouncement({
            params: { announcementId: editingItem.id },
            body: payload,
          });
        }
      } else {
        await api.adminCreateAnnouncement({
          body: {
            title: title.trim(),
            body: body.trim(),
            level,
            pinned,
            publish,
            expiresAt: parsedExpiresAt,
          },
        });
      }
      handleCloseModal();
      loadAnnouncements();
    } catch (e) {
      setModalError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishDraft = async (a: AdminAnnouncement) => {
    setActionError(null);
    try {
      await api.adminUpdateAnnouncement({
        params: { announcementId: a.id },
        body: { published: true },
      });
      loadAnnouncements();
    } catch (e) {
      setActionError(formatApiError(e));
    }
  };

  const handleToggleHide = async (a: AdminAnnouncement) => {
    setActionError(null);
    try {
      await api.adminUpdateAnnouncement({
        params: { announcementId: a.id },
        body: { hidden: !a.hidden },
      });
      loadAnnouncements();
    } catch (e) {
      setActionError(formatApiError(e));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Thông báo sàn</h1>
          <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
            Đăng tin tức, cảnh báo bảo trì và các thông báo quan trọng đến người dùng sàn
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-2,#a1a1aa)] cursor-pointer">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
              className="rounded"
            />
            <span>Hiện thông báo đã ẩn</span>
          </label>

          {canManage && (
            <button
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 flex items-center gap-1.5 transition-all shadow"
            >
              <Plus size={14} />
              <span>Tạo thông báo</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div
          data-testid="confirm-error"
          className="p-3 rounded-lg bg-[var(--down,#f2475f)]/15 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)] flex items-center justify-between"
        >
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-[var(--down,#f2475f)] hover:opacity-80">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Tiêu đề</th>
              <th className="px-5 py-3">Cấp độ</th>
              <th className="px-5 py-3">Ghim</th>
              <th className="px-5 py-3">Trạng thái</th>
              <th className="px-5 py-3">Hết hạn</th>
              <th className="px-5 py-3">Người tạo</th>
              <th className="px-5 py-3">Ngày tạo</th>
              {canManage && <th className="px-5 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 font-semibold text-[var(--text,#f4f4f5)]">
                  <div className="flex items-center gap-2">
                    {a.pinned && <Pin size={12} className="text-[var(--accent,#818cf8)] fill-current" />}
                    <span>{a.title}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                    a.level === 'MAINTENANCE' ? 'bg-[var(--down,#f2475f)]/15 text-[var(--down,#f2475f)]' :
                    a.level === 'IMPORTANT' ? 'bg-amber-950/40 text-amber-400' :
                    'bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)]'
                  }`}>
                    {a.level}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs">{a.pinned ? 'Có' : '—'}</td>
                <td className="px-5 py-3">
                  {a.hidden ? (
                    <span className="text-xs text-[var(--text-3,#63636b)]">Đã ẩn</span>
                  ) : a.publishedAt ? (
                    <span className="text-xs text-[var(--up,#1fc27a)] font-medium">Đã xuất bản</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400">Bản nháp</span>
                      {canManage && (
                        <button
                          data-testid="announcement-publish"
                          onClick={() => handlePublishDraft(a)}
                          className="px-2 py-0.5 rounded bg-[var(--up,#1fc27a)]/15 hover:bg-[var(--up,#1fc27a)]/30 text-[var(--up,#1fc27a)] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          title="Xuất bản ngay thông báo này"
                        >
                          <Send size={10} />
                          <span>Xuất bản</span>
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-[var(--text-3,#63636b)]">
                  {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString('vi-VN') : '—'}
                </td>
                <td className="px-5 py-3 text-xs text-[var(--text-2,#a1a1aa)]">{a.createdBy?.email || 'Hệ thống'}</td>
                <td className="px-5 py-3 text-xs text-[var(--text-3,#63636b)]">{new Date(a.createdAt).toLocaleDateString('vi-VN')}</td>
                {canManage && (
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(a)}
                        className="px-2.5 py-1 rounded bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-medium border border-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] inline-flex items-center gap-1"
                        title="Chỉnh sửa thông báo"
                      >
                        <Edit3 size={12} />
                        <span>Sửa</span>
                      </button>
                      <button
                        onClick={() => handleToggleHide(a)}
                        className="p-1 rounded hover:bg-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]"
                        title={a.hidden ? 'Hiện lại' : 'Ẩn đi'}
                      >
                        {a.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Chưa có thông báo nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveAnnouncement} className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl w-full max-w-lg p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <h2 className="text-lg font-bold text-[var(--text,#f4f4f5)]">
                {editingItem ? 'Chỉnh sửa thông báo' : 'Tạo thông báo mới'}
              </h2>
              <button type="button" onClick={handleCloseModal} className="text-[var(--text-3,#63636b)] hover:text-white">
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div
                data-testid="confirm-error"
                className="p-3 rounded-lg bg-[var(--down,#f2475f)]/15 border border-[var(--down,#f2475f)]/30 text-xs text-[var(--down,#f2475f)] leading-relaxed"
              >
                {modalError}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Tiêu đề</label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                placeholder="Tiêu đề thông báo..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Mức độ</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}
                  className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none"
                >
                  <option value="INFO">Tin tức (INFO)</option>
                  <option value="IMPORTANT">Quan trọng (IMPORTANT)</option>
                  <option value="MAINTENANCE">Bảo trì (MAINTENANCE)</option>
                </select>
              </div>

              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 text-sm text-[var(--text-2,#a1a1aa)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="rounded"
                  />
                  <span>Ghim lên đầu</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-2,#a1a1aa)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publish}
                    onChange={(e) => setPublish(e.target.checked)}
                    className="rounded"
                  />
                  <span>{editingItem ? 'Đang xuất bản' : 'Xuất bản ngay'}</span>
                </label>
              </div>
            </div>

            {/* Expires at */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)] flex items-center gap-1.5">
                <Calendar size={13} className="text-[var(--accent,#818cf8)]" />
                <span>Thời gian hết hạn (Tùy chọn)</span>
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
              />
              <span className="text-[11px] text-[var(--text-3,#63636b)]">
                Sau thời gian này, thông báo sẽ tự động hết hạn và không hiển thị cho người dùng
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">Nội dung</label>
              <textarea
                required
                rows={5}
                maxLength={5000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] resize-none outline-none focus:border-[var(--accent,#818cf8)]"
                placeholder="Nhập nội dung chi tiết của thông báo..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-2 pt-2 border-t border-[var(--line,#1d1e21)]">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-sm text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)]/40"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-40"
              >
                {isSubmitting ? 'Đang lưu...' : editingItem ? 'Lưu thay đổi' : 'Tạo thông báo'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

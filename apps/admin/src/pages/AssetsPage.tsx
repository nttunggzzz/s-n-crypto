import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatApiError } from '../services/errors';
import { type AssetInfo, AssetTag, ASSET_TAG_LABELS } from '@cex/contracts';
import { Edit2, X, Tag } from 'lucide-react';

const AVAILABLE_TAGS: AssetTag[] = [
  'LAYER1',
  'LAYER2',
  'MEME',
  'AI',
  'DEFI',
  'RWA',
  'PAYMENTS',
  'INFRA',
  'STORAGE',
  'EXCHANGE',
  'STABLECOIN',
];

export const AssetsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit modal
  const [selectedAsset, setSelectedAsset] = useState<AssetInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState<AssetTag[]>([]);
  const [reason, setReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const canConfigure = hasPerm('exchange.configure');

  const loadAssets = () => {
    setIsLoading(true);
    setLoadError(null);
    api.exchangeInfo()
      .then((info) => setAssets(info.assets))
      .catch((e: any) => setLoadError(formatApiError(e, 'Không thể tải danh sách coin.')))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleOpenEdit = (a: AssetInfo) => {
    setSelectedAsset(a);
    setEditName(a.name || '');
    setEditDesc(a.description || '');
    setEditTags(a.tags ? [...a.tags] : []);
    setReason('');
    setModalError(null);
  };

  const handleCloseEdit = () => {
    setSelectedAsset(null);
    setModalError(null);
    setReason('');
  };

  const toggleTag = (tag: AssetTag) => {
    if (editTags.includes(tag)) {
      setEditTags(editTags.filter((t) => t !== tag));
    } else {
      if (editTags.length < 5) {
        setEditTags([...editTags, tag]);
      }
    }
  };

  const originalName = selectedAsset?.name || '';
  const originalDesc = selectedAsset?.description || '';
  const originalTags = (selectedAsset?.tags || []).slice().sort();
  const currentTags = editTags.slice().sort();

  const nameChanged = editName.trim() !== originalName.trim();
  const descChanged = editDesc.trim() !== originalDesc.trim();
  const tagsChanged = JSON.stringify(originalTags) !== JSON.stringify(currentTags);

  const hasChanged = nameChanged || descChanged || tagsChanged;
  const canSubmit = hasChanged && reason.trim().length >= 5 && !isSubmitting;

  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !canSubmit) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      const body: any = { reason: reason.trim() };
      if (nameChanged) {
        body.name = editName.trim() ? editName.trim() : null;
      }
      if (descChanged) {
        body.description = editDesc.trim() ? editDesc.trim() : null;
      }
      if (tagsChanged) {
        body.tags = editTags;
      }

      await api.adminUpdateAsset({
        params: { asset: selectedAsset.asset },
        body,
      });
      handleCloseEdit();
      loadAssets();
    } catch (e) {
      setModalError(formatApiError(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = assets.filter(
    (a) =>
      a.asset.toLowerCase().includes(query.toLowerCase()) ||
      (a.name && a.name.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">Thông tin tài sản & Coin</h1>
        <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
          Cập nhật tên hiển thị, nhóm ngành (tags) và mô tả thông tin cơ bản của các coin niêm yết
        </p>
      </div>

      <div className="max-w-md">
        <input
          type="text"
          placeholder="Tìm kiếm coin (BTC, Ethereum, Solana)..."
          className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3.5 py-2 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text-2,#a1a1aa)] uppercase">
            <tr>
              <th className="px-5 py-3">Mã coin</th>
              <th className="px-5 py-3">Tên hiển thị</th>
              <th className="px-5 py-3">Nhóm ngành (Tags)</th>
              <th className="px-5 py-3">Mô tả</th>
              {canConfigure && <th className="px-5 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#1d1e21)]">
            {filtered.map((a) => (
              <tr key={a.asset} className="hover:bg-[var(--line,#1d1e21)]/15">
                <td className="px-5 py-3 font-bold font-mono text-[var(--text,#f4f4f5)]">{a.asset}</td>
                <td className="px-5 py-3 font-medium">{a.name || '—'}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.tags && a.tags.length > 0 ? (
                      a.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded text-[11px] bg-[var(--line,#1d1e21)] text-[var(--accent,#818cf8)]">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--text-3,#63636b)] text-xs">—</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-[var(--text-2,#a1a1aa)] max-w-sm truncate" title={a.description || ''}>
                  {a.description || '—'}
                </td>
                {canConfigure && (
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleOpenEdit(a)}
                      className="px-3 py-1 rounded bg-[var(--line,#1d1e21)] hover:bg-[var(--line,#1d1e21)]/80 text-xs font-medium border border-[var(--line,#1d1e21)] text-[var(--text,#f4f4f5)] inline-flex items-center gap-1"
                    >
                      <Edit2 size={12} />
                      <span>Sửa</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {loadError && assets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center">
                  <div data-testid="list-error" className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-[var(--down,#f2475f)]">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => loadAssets()}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent,#818cf8)] text-white text-xs font-semibold hover:brightness-110 transition-all"
                    >
                      Thử lại
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy coin nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit asset modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line,#1d1e21)] pb-3">
              <h3 className="text-lg font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
                <Tag size={18} className="text-[var(--accent,#818cf8)]" />
                <span>Cập nhật thông tin coin {selectedAsset.asset}</span>
              </h3>
              <button onClick={handleCloseEdit} className="text-[var(--text-3,#63636b)] hover:text-white">
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

            <form onSubmit={handleConfirmEdit} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ví dụ: Dogecoin, Bitcoin..."
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)]"
                />
              </div>

              {/* Tags chip selector */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                    Nhóm ngành (Tags)
                  </label>
                  <span className="text-[11px] text-[var(--text-3,#63636b)]">
                    {editTags.length}/5 tag đã chọn
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {AVAILABLE_TAGS.map((tag) => {
                    const isSelected = editTags.includes(tag);
                    const tagLabel = ASSET_TAG_LABELS[tag]?.vi || tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                          isSelected
                            ? 'bg-[var(--accent,#818cf8)]/20 border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)] font-semibold'
                            : 'bg-[var(--bg,#000000)] border-[var(--line,#1d1e21)] text-[var(--text-2,#a1a1aa)] hover:border-[var(--text-3,#63636b)]'
                        }`}
                      >
                        {tag} {tagLabel !== tag && <span className="opacity-75 text-[10px]">({tagLabel})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                  Mô tả cơ bản
                </label>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Nhập thông tin cơ bản về dự án và đồng coin..."
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] resize-none"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                  Lý do thay đổi (bắt buộc audit, tối thiểu 5 ký tự)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do cập nhật thông tin coin..."
                  rows={2}
                  className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] outline-none focus:border-[var(--accent,#818cf8)] resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-[var(--line,#1d1e21)]">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="px-4 py-2 rounded-lg border border-[var(--line,#1d1e21)] text-xs text-[var(--text-2,#a1a1aa)] hover:bg-[var(--line,#1d1e21)] transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-4 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

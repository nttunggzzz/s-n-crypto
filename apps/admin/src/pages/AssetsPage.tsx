import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { type AssetInfo, AssetTag, ASSET_TAG_LABELS } from '@cex/contracts';
import { Edit2, Coins, Tag } from 'lucide-react';

const AVAILABLE_TAGS: AssetTag[] = ['LAYER1', 'LAYER2', 'MEME', 'AI', 'DEFI', 'RWA', 'PAYMENTS', 'INFRA', 'STORAGE', 'EXCHANGE', 'STABLECOIN'];

export const AssetsPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Edit modal
  const [selectedAsset, setSelectedAsset] = useState<AssetInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState<AssetTag[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const api = getApiClient();
  const canConfigure = hasPerm('exchange.configure');

  const loadAssets = () => {
    setIsLoading(true);
    api.exchangeInfo()
      .then((info) => setAssets(info.assets))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleOpenEdit = (a: AssetInfo) => {
    setSelectedAsset(a);
    setEditName(a.name || '');
    setEditDesc(a.description || '');
    setEditTags(a.tags || []);
    setConfirmOpen(true);
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

  const handleConfirmEdit = async (reason: string) => {
    if (!selectedAsset) return;
    setIsSubmitting(true);
    try {
      await api.adminUpdateAsset({
        params: { asset: selectedAsset.asset },
        body: {
          name: editName || null,
          description: editDesc || null,
          tags: editTags,
          reason,
        },
      });
      setConfirmOpen(false);
      loadAssets();
    } catch (e) {
      console.error(e);
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
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[var(--text-3,#63636b)]">
                  Không tìm thấy coin nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedAsset && (
        <ConfirmDialog
          isOpen={confirmOpen}
          title={`Cập nhật thông tin coin ${selectedAsset.asset}`}
          consequenceText="Thông tin cập nhật sẽ được hiển thị trên giao diện khám phá thị trường của người dùng."
          onConfirm={handleConfirmEdit}
          onCancel={() => setConfirmOpen(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
};

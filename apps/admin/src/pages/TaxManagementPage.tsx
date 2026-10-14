import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  Building,
  User,
  ShieldCheck,
  FileCheck,
  Calendar,
  CreditCard,
  Percent,
  RefreshCw,
} from 'lucide-react';
import { getApiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';

export interface TaxWithholdingItem {
  id: string;
  tradeId: string;
  userUid: string;
  userEmail: string;
  taxIdNumber: string;
  symbol: string;
  side: 'SELL';
  fillQty: string;
  fillPriceVnd: string;
  grossProceedsVnd: string;
  taxRate: string;
  taxWithheldVnd: string;
  netProceedsVnd: string;
  status: 'WITHHELD' | 'REMITTED_TO_STATE';
  createdAt: string;
  certificateCode?: string;
}

export interface UserTaxProfileItem {
  uid: string;
  email: string;
  fullName: string;
  taxIdNumber: string;
  taxIdType: 'CCCD' | 'MST_CAN_NHAN' | 'MST_DOANH_NGHIEP';
  residencyStatus: 'RESIDENT' | 'NON_RESIDENT' | 'DOMESTIC_CORP';
  isExempt: boolean;
  vneidVerified: boolean;
  totalProceedsVnd: string;
  totalTaxPaidVnd: string;
}

export const TaxManagementPage: React.FC = () => {
  const { hasPerm } = useAuth();
  const api = getApiClient();

  const [activeTab, setActiveTab] = useState<'cashflow' | 'records' | 'profiles' | 'certificates' | 'settings'>('cashflow');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>('2026-10');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // State for tax summary metrics
  const [taxMetrics, setTaxMetrics] = useState({
    totalWithheldVnd: '185,420,000',
    totalWithheldUsdt: '7,416.80',
    withheld24hVnd: '12,850,000',
    withheld24hUsdt: '514.00',
    remittedVnd: '125,000,000',
    pendingRemittanceVnd: '60,420,000',
    totalGrossProceedsVnd: '185,420,000,000',
    totalSellOrdersTaxed: 1428,
    complianceRate: '94.2%',
  });

  // Sample Tax Withholding Records following Vietnam Crypto Tax Standard (TT 32/2026 & TT 41/2026)
  const [records] = useState<TaxWithholdingItem[]>([
    {
      id: 'tax-rec-001',
      tradeId: 'tr-984124',
      userUid: '10048291',
      userEmail: 'trader.nguyen@gmail.com',
      taxIdNumber: '079201004829',
      symbol: 'BTC/USDT',
      side: 'SELL',
      fillQty: '0.15000000',
      fillPriceVnd: '1,650,000,000',
      grossProceedsVnd: '247,500,000',
      taxRate: '0.1%',
      taxWithheldVnd: '247,500',
      netProceedsVnd: '247,252,500',
      status: 'WITHHELD',
      createdAt: '2026-10-14 11:24:18',
      certificateCode: 'CT-2026-10-001428',
    },
    {
      id: 'tax-rec-002',
      tradeId: 'tr-984119',
      userUid: '10082736',
      userEmail: 'le.hoang@invest.vn',
      taxIdNumber: '001095008273',
      symbol: 'ETH/USDT',
      side: 'SELL',
      fillQty: '2.50000000',
      fillPriceVnd: '68,500,000',
      grossProceedsVnd: '171,250,000',
      taxRate: '0.1%',
      taxWithheldVnd: '171,250',
      netProceedsVnd: '171,078,750',
      status: 'WITHHELD',
      createdAt: '2026-10-14 10:45:02',
      certificateCode: 'CT-2026-10-001427',
    },
    {
      id: 'tax-rec-003',
      tradeId: 'tr-983905',
      userUid: '10019284',
      userEmail: 'corp.vina@fintech.vn',
      taxIdNumber: '0316829104',
      symbol: 'SOL/USDT',
      side: 'SELL',
      fillQty: '100.000000',
      fillPriceVnd: '3,850,000',
      grossProceedsVnd: '385,000,000',
      taxRate: '0.0% (Miễn trừ DN)',
      taxWithheldVnd: '0',
      netProceedsVnd: '385,000,000',
      status: 'WITHHELD',
      createdAt: '2026-10-14 09:12:44',
      certificateCode: 'EX-2026-10-000041',
    },
    {
      id: 'tax-rec-004',
      tradeId: 'tr-982441',
      userUid: '10055419',
      userEmail: 'pham.minh@outlook.com',
      taxIdNumber: '038202005541',
      symbol: 'BTC/USDT',
      side: 'SELL',
      fillQty: '0.05000000',
      fillPriceVnd: '1,648,000,000',
      grossProceedsVnd: '82,400,000',
      taxRate: '0.1%',
      taxWithheldVnd: '82,400',
      netProceedsVnd: '82,317,600',
      status: 'REMITTED_TO_STATE',
      createdAt: '2026-10-13 16:30:11',
      certificateCode: 'CT-2026-10-001425',
    },
  ]);

  // Tax Profiles
  const [profiles] = useState<UserTaxProfileItem[]>([
    {
      uid: '10048291',
      email: 'trader.nguyen@gmail.com',
      fullName: 'Nguyễn Văn Tuấn',
      taxIdNumber: '079201004829',
      taxIdType: 'CCCD',
      residencyStatus: 'RESIDENT',
      isExempt: false,
      vneidVerified: true,
      totalProceedsVnd: '1,240,000,000',
      totalTaxPaidVnd: '1,240,000',
    },
    {
      uid: '10082736',
      email: 'le.hoang@invest.vn',
      fullName: 'Lê Huy Hoàng',
      taxIdNumber: '001095008273',
      taxIdType: 'CCCD',
      residencyStatus: 'RESIDENT',
      isExempt: false,
      vneidVerified: true,
      totalProceedsVnd: '850,000,000',
      totalTaxPaidVnd: '850,000',
    },
    {
      uid: '10019284',
      email: 'corp.vina@fintech.vn',
      fullName: 'Công ty Cổ phần Fintech Vina',
      taxIdNumber: '0316829104',
      taxIdType: 'MST_DOANH_NGHIEP',
      residencyStatus: 'DOMESTIC_CORP',
      isExempt: true,
      vneidVerified: true,
      totalProceedsVnd: '5,600,000,000',
      totalTaxPaidVnd: '0 (Tự kê khai TNDN)',
    },
  ]);

  const handleExportEtaxXml = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExportNotice('Đã xuất thành công tờ khai thuế điện tử định dạng XML e-Tax (Mẫu 01/CNKD - TT 41/2026/TT-BTC) kỳ ' + periodFilter);
      setTimeout(() => setExportNotice(null), 5000);
    }, 1200);
  };

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'ID,TradeId,UserUID,TaxIDNumber,Symbol,Side,FillQty,FillPriceVND,GrossProceedsVND,TaxRate,TaxWithheldVND,NetProceedsVND,Status,CreatedAt,CertificateCode\n' +
      records
        .map(
          (r) =>
            `${r.id},${r.tradeId},${r.userUid},${r.taxIdNumber},${r.symbol},${r.side},${r.fillQty},"${r.fillPriceVnd}","${r.grossProceedsVnd}",${r.taxRate},"${r.taxWithheldVnd}","${r.netProceedsVnd}",${r.status},"${r.createdAt}",${r.certificateCode}`
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bang_Ke_Khau_Tru_Thue_TT41_${periodFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = records.filter((r) => {
    const matchQuery =
      searchQuery === '' ||
      r.userUid.includes(searchQuery) ||
      r.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.taxIdNumber.includes(searchQuery) ||
      (r.certificateCode && r.certificateCode.includes(searchQuery));
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchQuery && matchStatus;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 border-b border-[var(--line,#1d1e21)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] border border-[var(--accent,#818cf8)]/20">
              <Receipt size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text,#f4f4f5)]">
                Quản lý Thuế & Dòng tiền Khấu trừ
              </h1>
              <p className="text-sm text-[var(--text-2,#a1a1aa)] mt-1">
                Tuân thủ quy định khấu trừ thuế TNCN 0.1% tại nguồn theo Thông tư 32/2026/TT-BTC & Thông tư 41/2026/TT-BTC
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] px-3 py-1.5 rounded-lg text-xs text-[var(--text-2,#a1a1aa)]">
            <Calendar size={14} className="text-[var(--accent,#818cf8)]" />
            <span>Kỳ báo cáo:</span>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-transparent text-[var(--text,#f4f4f5)] font-semibold outline-none cursor-pointer"
            >
              <option value="2026-10">Tháng 10/2026</option>
              <option value="2026-09">Tháng 09/2026</option>
              <option value="2026-Q3">Quý 3/2026</option>
              <option value="2026">Năm 2026</option>
            </select>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[var(--panel,#0a0a0b)] hover:bg-[var(--line,#1d1e21)] text-xs font-semibold text-[var(--text,#f4f4f5)] border border-[var(--line,#1d1e21)] transition-colors"
          >
            <Download size={14} />
            <span>Xuất Bảng Kê (CSV)</span>
          </button>

          <button
            onClick={handleExportEtaxXml}
            disabled={isExporting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[var(--accent,#818cf8)] hover:brightness-110 text-xs font-bold text-white shadow-md transition-all disabled:opacity-50"
          >
            {isExporting ? <RefreshCw size={14} className="animate-spin" /> : <FileCheck size={14} />}
            <span>{isExporting ? 'Đang tạo XML...' : 'Xuất Tờ Khai e-Tax (XML)'}</span>
          </button>
        </div>
      </div>

      {/* Export notification */}
      {exportNotice && (
        <div className="p-4 rounded-xl bg-[var(--up,#1fc27a)]/10 border border-[var(--up,#1fc27a)]/30 text-sm text-[var(--up,#1fc27a)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} />
            <span>{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="font-bold text-xs opacity-70 hover:opacity-100">Đóng</button>
        </div>
      )}

      {/* Primary KPI Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Withheld liability */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span>Quỹ Thuế Đang Giữ Hộ</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40 text-[10px] font-bold">
              LIABILITY
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] tracking-tight font-mono">
            {taxMetrics.pendingRemittanceVnd} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">VND</span>
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2 flex items-center gap-1.5 font-mono">
            <span>≈ ${(parseFloat(taxMetrics.pendingRemittanceVnd.replace(/,/g, '')) / 25000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
            <span className="text-[10px] text-[var(--text-3,#63636b)] font-sans">(Chờ nộp Kho bạc)</span>
          </div>
        </div>

        {/* 24h Withholding */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span>Thuế Khấu Trừ 24h</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)] text-[10px] font-bold">
              TỰ ĐỘNG 0.1%
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--up,#1fc27a)] tracking-tight font-mono">
            {taxMetrics.withheld24hVnd} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">VND</span>
          </div>
          <div className="text-xs text-[var(--text-2,#a1a1aa)] mt-2 flex items-center gap-1.5 font-mono">
            <span>≈ ${taxMetrics.withheld24hUsdt} USDT</span>
            <span className="text-[10px] text-[var(--text-3,#63636b)] font-sans">({taxMetrics.totalSellOrdersTaxed} lệnh bán)</span>
          </div>
        </div>

        {/* Total remitted */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span>Đã Nộp Kho Bạc Kỳ Này</span>
            <span className="px-1.5 py-0.5 rounded bg-[var(--accent,#818cf8)]/10 text-[var(--accent,#818cf8)] text-[10px] font-bold">
              KHO BẠC NHÀ NƯỚC
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text,#f4f4f5)] tracking-tight font-mono">
            {taxMetrics.remittedVnd} <span className="text-xs font-sans text-[var(--text-3,#63636b)] font-normal">VND</span>
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2">
            Biên lai KBNN số: <span className="text-[var(--text-2,#a1a1aa)] font-mono">KB-2026-09-8812</span>
          </div>
        </div>

        {/* Compliance Rate */}
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[var(--text-2,#a1a1aa)] mb-2 font-medium">
            <span>Tỷ Lệ Định Danh Thuế</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-800/40 text-[10px] font-bold">
              VNeID / CCCD
            </span>
          </div>
          <div className="text-2xl font-black text-blue-400 tracking-tight font-mono">
            {taxMetrics.complianceRate}
          </div>
          <div className="text-xs text-[var(--text-3,#63636b)] mt-2">
            Đã liên kết MST / CCCD 12 số hợp lệ
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-[var(--line,#1d1e21)] gap-6">
        <button
          onClick={() => setActiveTab('cashflow')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'cashflow'
              ? 'border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]'
              : 'border-transparent text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
          }`}
        >
          <CreditCard size={15} />
          <span>Dòng tiền Sổ cái Thuế</span>
        </button>

        <button
          onClick={() => setActiveTab('records')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'records'
              ? 'border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]'
              : 'border-transparent text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
          }`}
        >
          <Receipt size={15} />
          <span>Nhật ký Khấu trừ ({records.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('profiles')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'profiles'
              ? 'border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]'
              : 'border-transparent text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
          }`}
        >
          <User size={15} />
          <span>Hồ sơ Thuế Người dùng ({profiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'settings'
              ? 'border-[var(--accent,#818cf8)] text-[var(--accent,#818cf8)]'
              : 'border-transparent text-[var(--text-2,#a1a1aa)] hover:text-[var(--text,#f4f4f5)]'
          }`}
        >
          <Percent size={15} />
          <span>Quy tắc & Cấu hình Thuế</span>
        </button>
      </div>

      {/* Tab 1: Cashflow Overview */}
      {activeTab === 'cashflow' && (
        <div className="space-y-6">
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-[var(--text,#f4f4f5)] flex items-center gap-2">
              <Building size={18} className="text-[var(--accent,#818cf8)]" />
              <span>Cơ Chế Sổ Cái Kép Khấu Trừ Thuế Giữ Hộ (Double-entry Ledger Architecture)</span>
            </h3>
            <p className="text-sm text-[var(--text-2,#a1a1aa)] leading-relaxed">
              Theo quy định kế toán sàn tài chính, số tiền thuế TNCN 0.1% khấu trừ từ người bán <strong className="text-[var(--text,#f4f4f5)]">tuyệt đối không được tính vào doanh thu hoạt động của sàn</strong>. Số tiền này được hạch toán ngay vào tài khoản nghĩa vụ treo nợ <code className="text-amber-400 font-mono bg-amber-950/30 px-1.5 py-0.5 rounded">LIABILITY:VN_TAX_WITHHELD</code> và được đối soát số dư hàng ngày với tài khoản ngân hàng chuyên chi nộp ngân sách.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Tài khoản Có (Credit)</div>
                <div className="font-mono text-sm text-amber-400 font-bold">LIABILITY:VN_TAX_WITHHELD</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)] mt-1.5">Số dư hiện tại: <span className="font-bold text-[var(--text,#f4f4f5)]">{taxMetrics.pendingRemittanceVnd} VND</span></div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Tài khoản Nợ (Debit)</div>
                <div className="font-mono text-sm text-[var(--up,#1fc27a)] font-bold">CLEARING:MATCH_VND</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)] mt-1.5">Bù trừ tiền người mua trả cho giao dịch khớp</div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)]">
                <div className="text-xs text-[var(--text-3,#63636b)] mb-1">Doanh thu phí Sàn (Riêng biệt)</div>
                <div className="font-mono text-sm text-[var(--accent,#818cf8)] font-bold">REVENUE:TRADING_FEE</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)] mt-1.5">Phí giao dịch sàn (Taker / Maker 0.1%)</div>
              </div>
            </div>
          </div>

          {/* Quy trình nộp thuế định kỳ */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-[var(--text,#f4f4f5)]">Quy Trình Kê Khai & Chuyển Nộp Kho Bạc Nhà Nước</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-2">
                <div className="w-6 h-6 rounded-full bg-[var(--accent,#818cf8)]/20 text-[var(--accent,#818cf8)] flex items-center justify-center font-bold text-xs">1</div>
                <div className="text-sm font-semibold text-[var(--text,#f4f4f5)]">Khấu trừ tự động</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)]">Hệ thống matcher tự động trừ 0.1% giá trị lệnh bán khi khớp thành công.</div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-2">
                <div className="w-6 h-6 rounded-full bg-[var(--accent,#818cf8)]/20 text-[var(--accent,#818cf8)] flex items-center justify-center font-bold text-xs">2</div>
                <div className="text-sm font-semibold text-[var(--text,#f4f4f5)]">Cấp chứng từ điện tử</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)]">Ký số chứng từ khấu trừ thuế điện tử và đẩy về hòm thư người dùng.</div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-2">
                <div className="w-6 h-6 rounded-full bg-[var(--accent,#818cf8)]/20 text-[var(--accent,#818cf8)] flex items-center justify-center font-bold text-xs">3</div>
                <div className="text-sm font-semibold text-[var(--text,#f4f4f5)]">Tạo tờ khai e-Tax</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)]">Kết xuất bảng kê XML Mẫu 01/CNKD nộp qua Cổng thông tin Tổng cục Thuế trước ngày 20 hàng tháng.</div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] space-y-2">
                <div className="w-6 h-6 rounded-full bg-[var(--accent,#818cf8)]/20 text-[var(--accent,#818cf8)] flex items-center justify-center font-bold text-xs">4</div>
                <div className="text-sm font-semibold text-[var(--text,#f4f4f5)]">Nộp tiền vào KBNN</div>
                <div className="text-xs text-[var(--text-2,#a1a1aa)]">Ủy nhiệm chi chuyển số tiền thuế giữ hộ sang tài khoản thu Ngân sách Nhà nước.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Withholding Records */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px] max-w-md relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3,#63636b)]" />
              <input
                type="text"
                placeholder="Tìm theo UID, email, CCCD/MST hoặc mã chứng từ..."
                className="w-full bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg pl-9 pr-3.5 py-2 text-sm text-[var(--text,#f4f4f5)] placeholder-[var(--text-3,#63636b)] outline-none focus:border-[var(--accent,#818cf8)]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg px-3 py-2 text-sm text-[var(--text-2,#a1a1aa)] outline-none focus:border-[var(--accent,#818cf8)]"
            >
              <option value="ALL">Tất cả trạng thái nộp</option>
              <option value="WITHHELD">Đang giữ hộ (WITHHELD)</option>
              <option value="REMITTED_TO_STATE">Đã nộp Kho Bạc (REMITTED)</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Người nộp thuế</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Cặp / Lệnh</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Doanh thu bán</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Thuế TNCN (0.1%)</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Thực nhận</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-center">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Chứng từ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,#1d1e21)] font-mono text-xs">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--line,#1d1e21)]/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[var(--text,#f4f4f5)] font-sans">{r.userEmail}</div>
                      <div className="text-[var(--text-3,#63636b)] text-[11px]">
                        UID: <span className="text-[var(--accent,#818cf8)]">{r.userUid}</span> • MST: {r.taxIdNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[var(--text,#f4f4f5)]">{r.symbol}</div>
                      <div className="text-[var(--text-3,#63636b)] text-[11px] font-sans">
                        Bán: {r.fillQty} @ {r.fillPriceVnd}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text,#f4f4f5)]">
                      {r.grossProceedsVnd} <span className="text-[10px] text-[var(--text-3,#63636b)] font-sans">VND</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--down,#f2475f)]">
                      {r.taxWithheldVnd} <span className="text-[10px] text-[var(--text-3,#63636b)] font-sans">VND</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--up,#1fc27a)]">
                      {r.netProceedsVnd} <span className="text-[10px] text-[var(--text-3,#63636b)] font-sans">VND</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-sans ${
                          r.status === 'REMITTED_TO_STATE'
                            ? 'bg-[var(--up,#1fc27a)]/15 text-[var(--up,#1fc27a)] border border-[var(--up,#1fc27a)]/30'
                            : 'bg-amber-950/40 text-amber-400 border border-amber-800/40'
                        }`}
                      >
                        {r.status === 'REMITTED_TO_STATE' ? 'Đã Nộp KBNN' : 'Đang Giữ Hộ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      <span className="text-[11px] text-[var(--accent,#818cf8)] font-mono">{r.certificateCode}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: User Tax Profiles */}
      {activeTab === 'profiles' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl overflow-hidden shadow-lg">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--line,#1d1e21)]/30 border-b border-[var(--line,#1d1e21)]">
              <tr>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Thành viên</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Định danh thuế</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Diện áp dụng</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase">Xác thực VNeID</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Lũy kế bán</th>
                <th className="px-4 py-3 font-semibold text-xs text-[var(--text-2,#a1a1aa)] uppercase text-right">Thuế đã khấu trừ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line,#1d1e21)] text-xs">
              {profiles.map((p) => (
                <tr key={p.uid} className="hover:bg-[var(--line,#1d1e21)]/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-[var(--text,#f4f4f5)]">{p.fullName}</div>
                    <div className="text-[var(--text-3,#63636b)] font-mono text-[11px]">{p.email} • UID: {p.uid}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <span className="font-bold text-[var(--text,#f4f4f5)]">{p.taxIdNumber}</span>
                    <span className="text-[10px] text-[var(--text-3,#63636b)] ml-1.5 font-sans">({p.taxIdType})</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.isExempt
                        ? 'bg-blue-950/40 text-blue-400 border border-blue-800/40'
                        : 'bg-[var(--up,#1fc27a)]/10 text-[var(--up,#1fc27a)]'
                    }`}>
                      {p.isExempt ? 'Doanh nghiệp (Tự khai 20%)' : 'Cá nhân (Khấu trừ 0.1%)'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.vneidVerified ? (
                      <span className="flex items-center gap-1 text-[var(--up,#1fc27a)] font-semibold text-[11px]">
                        <CheckCircle2 size={13} />
                        <span>Đã xác thực mức 2</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 text-[11px]">
                        <AlertCircle size={13} />
                        <span>Chưa đối soát</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--text,#f4f4f5)]">
                    {p.totalProceedsVnd} VND
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[var(--down,#f2475f)]">
                    {p.totalTaxPaidVnd} {p.isExempt ? '' : 'VND'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Tax Rules & Settings */}
      {activeTab === 'settings' && (
        <div className="bg-[var(--panel,#0a0a0b)] border border-[var(--line,#1d1e21)] rounded-xl p-6 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-[var(--text,#f4f4f5)]">Thông số Tính & Khấu trừ Thuế Việt Nam</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Tỷ lệ thuế TNCN đối với giao dịch bán (SELL)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled
                  value="0.10 % (Cố định theo TT 32/2026/TT-BTC)"
                  className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] flex-1 cursor-not-allowed opacity-80"
                />
              </div>
              <p className="text-[11px] text-[var(--text-3,#63636b)]">
                Áp dụng tính trên tổng doanh thu bán tiền ảo quy đổi ra VNĐ tại thời điểm khớp lệnh.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Quy tắc làm tròn số tiền thuế nộp ngân sách
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled
                  value="Dec.ROUND_UP (Làm tròn lên số nguyên đồng VND)"
                  className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] flex-1 cursor-not-allowed opacity-80"
                />
              </div>
              <p className="text-[11px] text-[var(--text-3,#63636b)]">
                Đảm bảo không bao giờ nộp thiếu thuế cho Kho Bạc Nhà nước theo kỹ năng Decimal Money Safety.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Tài khoản ngân hàng chuyên dụng nộp Ngân sách Nhà nước
              </label>
              <input
                type="text"
                disabled
                value="711A-TAX-STATE-TREASURY (Kho Bạc Nhà Nước TP.HCM)"
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] w-full cursor-not-allowed opacity-80"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-[var(--text-2,#a1a1aa)]">
                Chu kỳ chuyển nộp thuế định kỳ
              </label>
              <input
                type="text"
                disabled
                value="Hàng tháng (Trước ngày 20 của tháng kế tiếp)"
                className="bg-[var(--bg,#000000)] border border-[var(--line,#1d1e21)] rounded-lg p-2.5 text-sm text-[var(--text,#f4f4f5)] w-full cursor-not-allowed opacity-80"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

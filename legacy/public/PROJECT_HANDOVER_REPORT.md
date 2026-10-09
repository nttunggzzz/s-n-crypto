# 📊 BÁO CÁO BÀN GIAO TIẾN ĐỘ DỰ ÁN & HƯỚNG DẪN CHO CLAUDE CODE
**Project Name:** Crypto Intelligence & Autonomous Trading Signal System  
**Repository State:** Phase 2 Completed & Verified — Ready for Phase 3  
**Date:** 2026-10-09  

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)
Dự án là một hệ thống **Phân tích dữ liệu thị trường Crypto, Phát hiện tín hiệu giao dịch theo phương pháp Hợp lưu (Confluence Setup Detector), Quản trị rủi ro định lượng, và Hội đồng Đầu tư AI (AI Investment Committee)**.

### Tech Stack:
- **Backend / Server:** Node.js, Express, TypeScript (`tsx server.ts`), chạy trên port 3000.
- **Database & ORM:** SQLite / LibSQL (`crypto_intelligence.db`), Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Data Providers:**
  - **Binance Spot:** Lấy Klines/Candles chuẩn UTC, Tickers 24h.
  - **Binance Futures:** Open Interest (OI), Funding Rates, Long/Short Accounts Ratio.
  - **DeFiLlama:** On-chain TVL theo chain, nguồn cung Stablecoins.
- **AI Intelligence:** Gemini 2.5 (`@google/genai`) chạy server-side tạo báo cáo phân tích đa chiều (Fact vs Inference, Counter-thesis, Invalidation Plan).
- **Frontend:** React 19, Vite 6, Tailwind CSS v4, Lucide React, Motion, Recharts.

---

## 2. BÁO CÁO TIẾN ĐỘ CHI TIẾT (CURRENT PROGRESS)

### ✅ Phase 1: Kiến trúc hệ thống & Giao diện Dashboard (ĐÃ HOÀN THÀNH)
- Toàn bộ giao diện chuyên nghiệp cho Trader/Quants gồm 8 Tabs chính:
  1. **Scanner View:** Bảng quét 20 Universe Assets, lọc theo Regime, xếp hạng Confluence Score.
  2. **Candle Chart & Setup Detail:** Biểu đồ nến tương tác kèm phân tích SMC, Price Action, Risk/Reward (R:R), điểm vô hiệu hóa (Invalidation).
  3. **Derivatives View:** Open Interest, Funding Rate heatmap, Long/Short ratio.
  4. **Sector Rotation:** Dòng tiền luân chuyển giữa các hệ sinh thái (L1, L2, AI/DePIN, DeFi, Meme).
  5. **Whale Radar View:** Cảnh báo các giao dịch lớn on-chain.
  6. **AI Committee View:** Đánh giá đa chiều từ hội đồng đầu tư AI (Executive thesis, catalyst, key risks).
  7. **Backtest View:** Giả lập kiểm thử chiến lược định lượng, đường cong vốn (Equity curve), Win Rate, Sharpe Ratio.
  8. **Provider Health View:** Telemetry, độ trễ và tỷ lệ lỗi của các data provider.

---

### ✅ Phase 2: Ingestion Pipeline & Kiểm định Dữ liệu Độc lập (ĐÃ HOÀN THÀNH & PASS TẤT CẢ GATES)
Dữ liệu đã được backfill và audit nghiêm ngặt:
- **20 Universe Assets được theo dõi tích cực:** BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, DOT, LINK, POL, SUI, APT, ARB, OP, RENDER, INJ, TAO, TIA, WLD (cùng 2 token cũ MATIC, RNDR được lưu lịch sử nhưng không poll).
- **54,000 Nến OHLCV chuẩn xác:**
  - 2,160 nến khung `1h` (90 ngày liên tục, chuẩn UTC) cho mỗi asset.
  - 540 nến khung `4h` (90 ngày liên tục, chuẩn UTC) cho mỗi asset.
  - **0 khoảng trống (gaps = 0).**
  - **0 nến trùng lặp (duplicates = 0).**
  - **0 nến sai lệch biên thời gian.**
- **Nguyên tắc Invariant bảo vệ dữ liệu:**
  - `NULL / UNAVAILABLE != 0`: Tuyệt đối không thay thế dữ liệu thiếu bằng số 0.
  - Không có công thức bịa đặt số liệu (ví dụ không tính basis bằng funding * 250, không nội suy OI 24h từ OI 4h).
  - Snapshot phái sinh được đánh dấu chính xác là `LIVE_SNAPSHOT`.
  - Toàn bộ kiểm thử Idempotency, Timezone alignment, Look-ahead bias, và Replay đều **PASSED**.

---

## 3. CẤU TRÚC THƯ MỤC & CÁC FILE QUAN TRỌNG

```
├── CLAUDE.md                           # File hướng dẫn cấu hình cho Claude Code
├── PROJECT_HANDOVER_REPORT.md          # File báo cáo tổng quan bàn giao
├── crypto_intelligence.db              # Database SQLite (chứa 54k nến và universe)
├── crypto_intelligence_codebase.tar.gz # File nén toàn bộ mã nguồn (không chứa node_modules)
├── drizzle.config.ts                   # Cấu hình Drizzle ORM
├── package.json                        # Khai báo dependency và scripts
├── server.ts                           # Express app entry point & REST APIs
├── server/
│   ├── db/
│   │   ├── schema.ts                   # Drizzle schema (bảng candle, snapshots, universe)
│   │   └── client.ts                   # Kết nối LibSQL/SQLite
│   ├── ingestion/
│   │   └── BackfillService.ts          # Pipeline backfill nến và snapshots
│   ├── universe/
│   │   └── UniverseManager.ts          # Quản lý danh mục 20 tài sản Universe
│   ├── providers/
│   │   ├── BinanceSpotProvider.ts      # REST API Binance Spot (klines, ticker)
│   │   ├── BinanceFuturesProvider.ts   # REST API Binance Futures (OI, funding)
│   │   ├── DeFiLlamaProvider.ts        # API DeFiLlama (TVL, stablecoins)
│   │   ├── MarketRegimeEngine.ts       # Động cơ tính toán chế độ thị trường
│   │   └── ProviderHealthService.ts    # Đo lường độ trễ và trạng thái API
│   └── tests/
│       ├── comprehensive_audit.ts      # Kiểm tra số lượng và tính toàn vẹn DB
│       └── phase2_strict_audit.ts      # Bộ test adversarial integrity gate
└── src/
    ├── App.tsx                         # Ứng dụng React chính với điều hướng Tab
    ├── components/                     # Các components giao diện (Charts, Scanner, v.v.)
    ├── engine/                         # Confluence setup engine, backtest engine, SMC engine
    └── types/crypto.ts                 # Type definitions dùng chung
```

---

## 4. LỆNH ĐIỀU HÀNH THƯỜNG DÙNG

```bash
# Cài đặt thư viện:
npm install

# Khởi chạy server phát triển (Port 3000):
npm run dev

# Kiểm tra lỗi TypeScript (hiện tại đạt 0 lỗi):
npm run lint

# Build production:
npm run build

# Kiểm tra cơ sở dữ liệu thực tế:
npx tsx server/tests/comprehensive_audit.ts

# Chạy test kiểm định tính toàn vẹn dữ liệu Phase 2:
npx tsx server/tests/phase2_strict_audit.ts
```

---

## 5. KẾ HOẠCH BƯỚC TIẾP THEO: PHASE 3 (ROADMAP CHO CLAUDE CODE)

Khi bạn mở dự án bằng Claude Code, bạn có thể yêu cầu Claude Code bắt đầu triển khai **Phase 3: Trading Infrastructure & Feature Engineering**:

1. **Feature Engineering & Technical Analysis:**
   - Tính toán Multi-timeframe Indicators (EMA 20/50/200, ATR, RSI 14, Bollinger Bands, Volume Profile) dựa trên 54,000 nến đã có trong `crypto_intelligence.db`.
   - Đảm bảo không bị lookahead bias (nến đang chạy không được dùng để tính chỉ báo lịch sử).
2. **Smart Money Concepts (SMC) Engine hoàn thiện:**
   - Thuật toán nhận diện Order Blocks (OB), Fair Value Gaps (FVG), Liquidity Sweeps (Buy-side/Sell-side Liquidity), Break of Structure (BOS), Change of Character (CHoCH).
3. **Confluence & Setup Detector:**
   - Chấm điểm đa yếu tố (Price Action + SMC + Relative Strength + Phái sinh OI/Funding + Chế độ thị trường).
   - Xác định rõ Setup LONG/SHORT, Entry Zone, Invalidation Price (Stop Loss), Take Profit 1/2/3 với tỷ lệ R:R >= 2.0.
4. **Historical Backtesting Simulation:**
   - Chạy mô phỏng chiến lược trên 90 ngày dữ liệu lịch sử của 20 Universe Assets.
   - Thống kê tỷ lệ thắng (Win Rate), Profit Factor, Max Drawdown, Expectancy R, và Equity Curve.

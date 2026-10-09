# Changelog — @cex/contracts

## 0.5.0 — 2026-10-09 (Giai đoạn F: Futures mô phỏng)
Hợp đồng vĩnh cửu USDT-M mô phỏng: giá Binance USDⓈ-M, ký quỹ **cô lập**, **một chiều**, đòn bẩy **1–20×**.

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `LedgerEntry` thêm `account: 'SPOT' | 'FUTURES'`. Các endpoint sổ cái cũ (`ledger`, export CSV) vẫn chỉ trả ví Spot.
- `LedgerEntryType` thêm `TRANSFER`, `REALIZED_PNL`, `FUNDING_FEE`, `LIQUIDATION`, `MARGIN_ADJUST`; `refType` thêm `TRANSFER`, `FUTURES_ORDER`, `FUTURES_POSITION`. Bảng dịch loại sổ cái của UI cần thêm các mục này.
- `ExchangeSettings` thêm `futures: { makerFee, takerFee, liquidationFee }`; `UpdateSettingsRequest` thêm `futuresMakerFee`, `futuresTakerFee`, `futuresLiquidationFee`.
- `ReconciliationMismatch` thêm `account` và loại `LOCKED_VS_FUTURES`.
- `Notification` thêm 3 loại: `FUTURES_ORDER_FILLED`, `POSITION_TPSL`, `POSITION_LIQUIDATED`.

**Thêm (26 endpoint, tổng 103)**
- **Thị trường** (công khai):
  - `futuresExchangeInfo`: 50 hợp đồng; `multiplier` = 1000 với 1000PEPE/SHIB/BONK/FLOKI; phí; `maxLeverage` 20.
  - `futuresTickers` (kèm mark/index/funding), `futuresMarkPrice`, `futuresDepth`, `futuresMarketTrades`, `futuresCandles`, `futuresFundingHistory`, `futuresMarketStatus`.
- **Ví:**
  - `futuresAccount`: walletBalance, available, positionMargin, orderMargin, unrealizedPnl, equity;
  - `futuresTransfer`: Spot ↔ Futures;
  - `futuresLedger`.
- **Đòn bẩy:** `futuresSymbolSettings`, `futuresSetLeverage` (`LEVERAGE_LOCKED` khi còn vị thế hoặc lệnh mở).
- **Lệnh:**
  - `futuresPlaceOrder` (MARKET, LIMIT GTC/IOC, `reduceOnly`, `tpsl` gắn vào vị thế);
  - `futuresOpenOrders`, `futuresOrderHistory`, `futuresCancelOrder`, `futuresCancelAll`, `futuresMyTrades`.
- **Vị thế:** `futuresPositions`, `futuresPositionHistory`, `futuresClosePosition` (đóng hết hoặc một phần), `futuresAdjustMargin` (+/−), `futuresSetTpSl`.
- **Admin:** `adminFuturesSymbols`, `adminUpdateFuturesSymbol` (bật/tắt, đòn bẩy tối đa, tỷ lệ ký quỹ duy trì; ghi nhật ký `FUTURES_SYMBOL_UPDATE`).
- **Realtime:**
  - kênh `futures:ticker|mark|depth|trades:<SYMBOL>`, `futures:candles:<SYMBOL>:<i>`, `futures:status`;
  - kênh `user` thêm `futuresOrder`, `futuresTrade`, `futuresPosition`, `futuresAccount`.
- **Mã lỗi:** `LEVERAGE_LOCKED`, `INVALID_LEVERAGE`, `REDUCE_ONLY_REJECTED`, `MARGIN_TOO_LOW`.
- **`@cex/core`:** `initialMargin`, `pnl`, `liquidationPrice`, `isLiquidatable`, `fundingPayment`, `averageEntry`, `returnOnMargin` — UI dùng để **hiển thị** lãi lỗ realtime theo kênh `futures:mark`.
- **Mock:** đủ 26 endpoint và realtime Futures. `setMockFuturesPrice('BTCUSDT', 70000)` để thử khớp Limit, TP/SL, thanh lý; `mockSettleFunding()` để thử thanh toán funding.

## 0.4.0 — 2026-10-09 (Giai đoạn 2.5: dữ liệu cho giao diện v2)
Chỉ **thêm**, không phá code đang chạy. Riêng mock: giờ **từ chối request sai hợp đồng** (`VALIDATION_ERROR`, 400) giống server — trước đây mock nhận mọi thứ.

**Thêm**
- **50 cặp USDT** (trước 10). Danh sách ở `server/src/config.ts` (`SYMBOLS`).
- `ExchangeInfo.assets`: thông tin coin — `name` (tên đầy đủ), `tags` (nhóm ngành), `description` (mô tả ngắn, văn bản thuần).
  - Nhóm ngành: `AssetTag` + nhãn vi/en `ASSET_TAG_LABELS`.
  - Dữ liệu mặc định: `ASSET_CATALOG`.
- `sparklines({ query: { range: '24h' | '7d' } })`: biểu đồ mini cho mọi cặp.
  - 24h = 25 điểm giá đóng nến 1h; 7d = 43 điểm nến 4h.
  - Server cache 60 giây. Cặp không có dữ liệu → `points: []` + `UNAVAILABLE`.
- `depth` nhận `limit` tới **500** (trước 100).
  - 20 mức đầu là realtime.
  - Phần sâu hơn lấy từ snapshot Binance, làm mới mỗi 1–3 giây, dùng để gom giá và vẽ biểu đồ độ sâu.
- Kênh realtime **`exchange:status`** → `ExchangeStatus { tradingHalted, disabledSymbols, updatedAt }`. Gửi ảnh chụp khi subscribe, sau đó gửi mỗi khi admin dừng/mở giao dịch hoặc bật/tắt cặp. **Thay cho việc gọi lại `exchangeInfo` mỗi 30 giây.**
- Thông báo của sàn: `announcements()` (công khai: đã đăng, chưa ẩn, chưa hết hạn; ghim lên đầu).
- Admin:
  - `adminUpdateAsset` (sửa tên/nhóm/mô tả coin, cần `reason`);
  - `adminListAnnouncements`, `adminCreateAnnouncement`, `adminUpdateAnnouncement` — bản nháp, đăng, ghim, ẩn, hết hạn.
  - Quyền mới: `content.manage` (admin, owner).
  - Nhật ký: `ASSET_UPDATE`, `ANNOUNCEMENT_CREATE`, `ANNOUNCEMENT_UPDATE`; `targetType` thêm `ASSET`, `ANNOUNCEMENT` (`AuditTargetType`).
- Mock: 50 cặp, sparkline giả, 5 thông báo mẫu (1 bản nháp, 1 đã hết hạn), `exchange:status` trong realtime mock.

## 0.3.0 — 2026-10-09 (Giai đoạn 3: Admin + 2FA)
**Một thay đổi cần sửa UI:** `login` giờ trả về **một trong hai** dạng: `{ user }` (đăng nhập xong) **hoặc** `{ twoFactorRequired: true, challengeToken, expiresAt }` → hiện ô nhập mã 6 số rồi gọi `loginTwoFactor({ body: { challengeToken, code } })`. Kiểm tra bằng `'user' in res`.

**Thêm**
- `Me` có `twoFactorEnabled` và `permissions` (danh sách quyền — chỉ để ẩn/hiện nút, server luôn tự kiểm tra).
- 2FA (TOTP, ứng dụng Google Authenticator/Authy…): `setupTwoFactor` → `enableTwoFactor` (trả 10 mã khôi phục, chỉ hiện 1 lần) → `disableTwoFactor`, `regenerateRecoveryCodes`, `loginTwoFactor`.
- Quyền: `Permission`, `ROLE_PERMISSIONS`, `STAFF_ROLES`, `hasPermission()` (`permissions.ts`).
- Admin API (`auth: 'staff'` + `permission`), 20 endpoint `admin*`: tổng quan, người dùng (tìm, xem, lệnh, sổ cái, khóa/mở, quyền tín hiệu, vai trò, cộng/trừ số dư, reset), cấu hình sàn, dừng/mở giao dịch, cặp giao dịch, nhật ký quản trị, đối soát.
- Mã lỗi: `TWO_FACTOR_REQUIRED`, `INVALID_TWO_FACTOR_CODE`, `BOT_ACCOUNT_PROTECTED`.
- Mock: `setMockRole('admin' | 'support' | 'owner' | 'user', twoFactorEnabled?)`; mã 2FA mock: mọi 6 chữ số trừ `000000`.

## 0.2.0 — 2026-10-09 (Giai đoạn 2)
Chỉ **thêm** — không phá vỡ code UI viết theo 0.1.0, trừ khi UI tự dựng object `Order`/`Trade` (mock riêng): khi đó cần thêm các trường mới.

**Lệnh**
- `OrderType` thêm `TRAILING_STOP_MARKET`. `placeOrder` nhận thêm `STOP_MARKET`, `STOP_LIMIT`, `TRAILING_STOP_MARKET`.
- `MARKET`/`LIMIT` **BUY** nhận `tpsl` (take-profit / stop-loss gắn kèm).
- `Order` thêm: `triggerState`, `triggerDirection`, `triggeredAt`, `trailingDeltaBips`, `activationPrice`, `trailingReferencePrice`, `orderListId`, `parentOrderId`, `tpsl`, `closeReason`.
- `Trade` thêm `realizedPnl` (lệnh SELL).
- OCO: `placeOco`, `openOrderLists`, `getOrderList`, `cancelOrderList` + kiểu `OrderList`.
- `orderHistory`, `myTrades`, `ledger` nhận thêm `from` / `to` (ISO).

**Mới**
- Danh mục: `portfolio`, `portfolioHistory` (`range`: 24h/7d/30d/90d/all).
- Xuất CSV: `exportOrders`, `exportTrades`, `exportLedger` + helper `exportUrl()`.
- Cảnh báo giá: `listAlerts`, `createAlert`, `deleteAlert`.
- Thông báo: `listNotifications`, `unreadNotifications`, `markNotificationsRead`.
- Cài đặt: `getPreferences`, `updatePreferences` (yêu thích, xác nhận lệnh, màu tăng/giảm, giao diện, ngôn ngữ, khung nến mặc định).
- Realtime kênh `user` thêm `kind`: `orderList`, `notification`, `alert`.
- Mã lỗi mới: `INVALID_STOP_PRICE`, `INVALID_OCO_PRICES`, `INVALID_TPSL`, `INVALID_TRAILING_DELTA`, `LIMIT_EXCEEDED`.
- `@cex/core`: `positionSizeForRisk()` cho máy tính khối lượng theo % rủi ro.
- Mock: `setMockPrice(symbol, price)` để kích hoạt stop/OCO/TP-SL/cảnh báo theo ý muốn.

## 0.1.0 — 2026-10-09 (Giai đoạn 0–1)
Auth, thị trường, ví, lệnh Market/Limit, realtime, mock MSW.

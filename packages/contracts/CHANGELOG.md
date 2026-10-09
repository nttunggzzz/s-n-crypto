# Changelog — @cex/contracts

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

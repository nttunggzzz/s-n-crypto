# Changelog — @cex/contracts

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

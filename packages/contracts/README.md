# @cex/contracts — hợp đồng API (dành cho giao diện)

Nguồn sự thật duy nhất giữa backend và UI. **UI chỉ import, không sửa** — cần đổi thì ghi vào
[`docs/parts/contract-requests.md`](../../docs/parts/contract-requests.md).

## 1. Gọi API

```ts
import { createApiClient, ApiError } from '@cex/contracts';

const api = createApiClient({ validateResponses: import.meta.env.DEV });

const info = await api.exchangeInfo();                       // GET  /api/v1/market/exchange-info
const r = await api.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quoteOrderQty: '100' } });
await api.cancelOrder({ params: { orderId: r.order.id } });
const page = await api.orderHistory({ query: { limit: 50, cursor } });  // { items, nextCursor }

try { await api.faucetClaim(); }
catch (e) { if (e instanceof ApiError) showError(t(`errors.${e.code}`)); }  // e.code: ErrorCode
```

- Cookie phiên (`cex_session`, httpOnly) do server đặt — UI **không** đọc/lưu token.
- Dev: chạy Vite với proxy `/api` và `/ws` → `http://localhost:8080` để cùng origin.
- Danh sách đầy đủ endpoint: [`src/endpoints.ts`](src/endpoints.ts). Mã lỗi: [`src/errors.ts`](src/errors.ts).

## 2. Realtime

```ts
import { createRealtimeClient } from '@cex/contracts';
const rt = createRealtimeClient();                 // tự kết nối lại, tự đăng ký lại kênh
const off = rt.subscribe('ticker:BTCUSDT', (t) => setTicker(t));   // kiểu dữ liệu tự suy ra
rt.subscribe('depth:BTCUSDT', setDepth);           // top 20, tối đa 2 lần/giây
rt.subscribe('trades:BTCUSDT', pushTrade);
rt.subscribe('candles:BTCUSDT:1m', upsertCandle);  // closed=false là nến đang chạy
rt.subscribe('market:status', setMarketStatus);
rt.subscribe('user', (e) => { /* e.kind: 'order' | 'trade' | 'balance' */ });   // cần đăng nhập
rt.onStatus((s) => setConnection(s));              // 'connecting' | 'open' | 'closed' → banner mất kết nối
```

## 3. Chạy UI không cần backend (mock)

```ts
// main.tsx — CHỈ khi dev + bật cờ
if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
  const { setupWorker } = await import('msw/browser');
  const { createMockHandlers } = await import('@cex/contracts/mocks');
  await setupWorker(...createMockHandlers()).start({ onUnhandledRequest: 'bypass' });
}
// realtime: dùng createMockRealtimeClient() thay cho createRealtimeClient() khi bật mock
```

Cần chạy một lần trong app: `npx msw init public/`.

Xem đủ mọi trạng thái màn hình bằng `setMockScenario(...)` từ `@cex/contracts/mocks`:

| Kịch bản | Thấy gì |
|---|---|
| `normal` | Dữ liệu demo; **AVAXUSDT = STALE**, **LINKUSDT = UNAVAILABLE** (giá `null`), **SUIUSDT bị tắt** |
| `empty` | Không có lệnh / lịch sử |
| `error` | Mọi API trả 500 |
| `halted` | Sàn dừng khẩn cấp, đặt lệnh → `TRADING_HALTED` |
| `signedOut` | Chưa đăng nhập → 401 |
| `unverified` | Chưa xác minh email → nạp tiền/đặt lệnh bị chặn `EMAIL_NOT_VERIFIED` |

`createMockRealtimeClient({ dropEveryMs: 15000 })` giả lập mất kết nối định kỳ.

## 4. Quy tắc hiển thị (bắt buộc)

- Tiền/giá/khối lượng là **chuỗi** (`"64250.12000000"`). Chỉ định dạng để hiển thị; không `Number()` để tính.
- `null` = **không có dữ liệu** → hiển thị "—"/"Không có dữ liệu", **không** hiển thị 0.
- `status` của ticker/depth: `LIVE` · `STALE` (hiện cảnh báo giá cũ, nút đặt lệnh sẽ bị server từ chối) · `UNAVAILABLE`.
- Số chữ số lẻ khi hiển thị: `pricePrecision` / `quantityPrecision` trong `exchangeInfo.symbols`.
- Ô nhập giá/khối lượng: kiểm tra bội số `tickSize` / `stepSize`, `minNotional` để báo lỗi sớm — server vẫn kiểm tra lại.
- Phí ước tính trong form = `feeRate` × giá trị, ghi rõ "ước tính". Số thật lấy từ `fills[].fee`.
- Tổng tài sản: dùng `totalValueUsdt`; nếu `unpricedAssets` không rỗng → ghi chú "chưa tính X (không có giá)".
- Lỗi theo `code` (ví dụ `INSUFFICIENT_BALANCE`, `NOTIONAL_TOO_SMALL`, `FAUCET_COOLDOWN` có `details.nextAvailableAt`, `RATE_LIMITED` có `details.retryAfterSeconds`).

## 5. Giai đoạn 2 — lệnh nâng cao, danh mục, cảnh báo, thông báo (v0.2.0)

Xem [CHANGELOG.md](CHANGELOG.md). Tóm tắt cách dùng:

| Tính năng | Gửi gì | Ghi chú hiển thị |
|---|---|---|
| Stop-Market | `type: 'STOP_MARKET', stopPrice` + SELL `quantity` / BUY `quoteOrderQty` | Đang chờ: `triggerState = 'WAITING'`, hướng `triggerDirection` (UP/DOWN). Stop nằm sai phía giá hiện tại → `INVALID_STOP_PRICE` |
| Stop-Limit | `type: 'STOP_LIMIT', stopPrice, price, quantity` | Sau kích hoạt (`TRIGGERED`) thành lệnh Limit đang chờ |
| Trailing stop | `type: 'TRAILING_STOP_MARKET', trailingDeltaBips` (10–2000; 100 = 1%), `activationPrice?` | `stopPrice` & `trailingReferencePrice` thay đổi theo giá (nhận qua sự kiện `order`) |
| OCO | `placeOco({ body: { side, quantity, price, stopPrice, stopLimitPrice? } })` | SELL: `price > giá hiện tại > stopPrice`; BUY: ngược lại và bắt buộc `stopLimitPrice`. Hai lệnh có cùng `orderListId` — gom thành 1 dòng. Hủy 1 chân = hủy cả cặp |
| TP/SL khi mua | thêm `tpsl: { takeProfitPrice?, stopLossPrice?, stopLossLimitPrice? }` vào MARKET/LIMIT **BUY** | `order.tpsl.state`: PENDING → PLACED (xem `childOrderListId`/`childOrderIds`) hoặc SKIPPED (`skippedReason`) |
| Danh mục | `portfolio()` | Giá vốn, lãi/lỗ chưa chốt (null khi không có giá), đã chốt, phân bổ %. **Không tự tính** |
| Biểu đồ tài sản | `portfolioHistory({ query: { range } })` | Điểm `null` = thời điểm thiếu giá → vẽ đứt đoạn, không nối bằng 0. Lịch sử bắt đầu từ khi server bắt đầu chụp số liệu |
| Xuất CSV | `<a href={exportUrl('exportTrades', { symbol, from, to })} download>` | Tối đa 10.000 dòng |
| Cảnh báo giá | `createAlert`, `listAlerts`, `deleteAlert` | Tối đa 50 cảnh báo ACTIVE (`LIMIT_EXCEEDED`). Đã chạm sẵn → `INVALID_PRICE` |
| Thông báo | `listNotifications`, `unreadNotifications`, `markNotificationsRead` + sự kiện `user` `kind: 'notification'` | Dựng câu chữ từ `type` + các trường (i18n), không có text sẵn từ server |
| Cài đặt | `getPreferences`, `updatePreferences` (PATCH) | Yêu thích, hộp xác nhận lệnh, màu tăng/giảm, giao diện, ngôn ngữ, khung nến mặc định |
| Máy tính khối lượng | `positionSizeForRisk({ equity, riskPercent, entryPrice, stopPrice, stepSize, feeRate })` từ `@cex/core` | Gợi ý cho ô nhập; giới hạn theo số dư khả dụng |
| Đường entry/TP/SL trên biểu đồ | Lấy từ `openOrders` (price/stopPrice) và `order.tpsl` | Chỉ vẽ, không tính |

Mock: `setMockPrice('BTCUSDT', 75000)` đẩy giá để xem stop kích hoạt, OCO hủy chéo, TP/SL tạo lệnh con, cảnh báo nổ — kèm thông báo realtime.

## 6. Giai đoạn 3 — Admin + 2FA (v0.3.0)

- **Đăng nhập 2 bước**: `login` có thể trả `{ twoFactorRequired: true, challengeToken }` → màn hình nhập mã (6 số từ ứng dụng xác thực, hoặc mã khôi phục dạng `abcd-1234`) → `loginTwoFactor`. Mã sai → `INVALID_TWO_FACTOR_CODE`.
- **Bật 2FA** (Cài đặt → Bảo mật): `setupTwoFactor({ currentPassword })` → hiện QR từ `otpauthUrl` + `secret` để nhập tay → `enableTwoFactor({ code })` → hiện 10 mã khôi phục **một lần duy nhất** (nút tải/sao chép). Tắt: `disableTwoFactor` (tài khoản quản trị không tắt được → `FORBIDDEN`).
- **App Admin** (`apps/admin`): mọi endpoint `admin*` cần vai trò support/admin/owner **đã bật 2FA và đăng nhập bằng 2FA**; thiếu → `TWO_FACTOR_REQUIRED` (hiện hướng dẫn bật 2FA). Ẩn/hiện nút theo `me.permissions`, nhưng vẫn xử lý `FORBIDDEN` từ server.
- Mọi thao tác thay đổi dữ liệu cần `reason` (≥ 5 ký tự) → ghi vào nhật ký quản trị. Dừng/mở giao dịch cần `confirm: 'HALT'` / `'RESUME'`, reset tài khoản cần `confirm: 'RESET'` — UI bắt người dùng **gõ lại** chữ đó.
- Cộng/trừ số dư: `amount` có dấu (`"-250.5"` = trừ). Hộp xác nhận hiển thị số dư trước/sau lấy từ `adminGetUser` (chỉ để xem trước — số thật là `result.balance`).
- Tài khoản bot (`isBot`) → không hiện nút chỉnh; server trả `BOT_ACCOUNT_PROTECTED`.
- Mock: `setMockRole('admin')` để vào app admin; `setMockRole('admin', false)` để xem màn hình "chưa bật 2FA"; `setMockRole('support')` để xem giới hạn quyền.

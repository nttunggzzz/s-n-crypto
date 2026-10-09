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

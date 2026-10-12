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
rt.subscribe('tickers', ({ items }) => mergeTickers(items)); // MỌI cặp: lần đầu đủ cả, sau đó ≤ 1 lần/giây các cặp vừa đổi
const off = rt.subscribe('ticker:BTCUSDT', (t) => setTicker(t));   // một cặp; kiểu dữ liệu tự suy ra
rt.subscribe('depth:BTCUSDT', setDepth);           // top 20, tối đa 2 lần/giây
rt.subscribe('trades:BTCUSDT', pushTrade);
rt.subscribe('candles:BTCUSDT:1m', upsertCandle);  // closed=false là nến đang chạy
rt.subscribe('market:status', setMarketStatus);
rt.subscribe('user', (e) => { /* e.kind: 'order' | 'trade' | 'balance' */ });   // cần đăng nhập
rt.onStatus((s) => setConnection(s));              // 'connecting' | 'open' | 'closed' → banner mất kết nối
rt.onClose(({ code }) => { if (code === WS_SESSION_ENDED) checkSession(); }); // 4401 = phiên đã hết → gọi me, 401 thì hiện đã đăng xuất
rt.onError((e) => console.error('realtime', e));   // vd. RATE_LIMITED khi vượt REALTIME_MAX_CHANNELS (100) kênh
rt.reconnect();                                    // BẮT BUỘC ngay sau đăng nhập / 2FA / đăng xuất (server đọc cookie lúc mở kết nối)
```
Giá nhiều cặp: dùng **một** kênh `tickers` (Futures: `futures:tickers`), không đăng ký từng `ticker:<SYMBOL>` cho cả danh sách.
Gộp `items` vào một kho (store) và cho mỗi component chỉ đọc cặp nó cần, để một lần cập nhật không vẽ lại cả ứng dụng.

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

## 7. Giai đoạn 2.5 — dữ liệu cho giao diện v2 (v0.4.0)

- **Tên và nhóm coin:**
  - `exchangeInfo().assets` — nối theo `symbol.baseAsset`.
  - Chip nhóm ngành: `ASSET_TAG_LABELS[tag][locale]`.
  - `name: null` → hiện mã coin. `description: null` → ẩn khối mô tả.
- **Sparkline:** gọi `sparklines()` khi mở trang Thị trường, làm mới mỗi 60 giây; vẽ bằng SVG polyline.
  - `points` là chuỗi số, chỉ chuyển sang số thực để **vẽ**.
  - `UNAVAILABLE` → ô trống, không vẽ đường phẳng.
  - `STALE` → vẽ mờ.
- **Sổ lệnh sâu:** gọi `depth({ query: { limit: 200 } })` mỗi 2–3 giây khi người dùng chọn gom giá thô (×100, ×1000). 20 mức đầu vẫn lấy từ kênh `depth:<SYMBOL>` realtime.
- **Trạng thái sàn:** subscribe `exchange:status` một lần ở cấp app.
  - `tradingHalted` → banner đỏ + khóa form lệnh.
  - `disabledSymbols` → nhãn "Tạm ngưng" + khóa cặp.
- **Thông báo:** trang chủ hiện `announcements({ query: { limit: 5 } })`.
  - `body` là văn bản thuần: hiển thị bằng text, giữ xuống dòng (`white-space: pre-line`), **không** dùng `dangerouslySetInnerHTML`.
  - `MAINTENANCE` → màu cảnh báo; `pinned` → ghim đầu.
- **Admin** (app `apps/admin`):
  - màn **Thông báo**: danh sách gồm cả bản nháp; nút Đăng, Ghim, Ẩn; ngày hết hạn;
  - màn **Thông tin coin**: sửa tên, nhóm (tối đa 5), mô tả, có lý do;
  - cần quyền `content.manage` / `exchange.configure`.

## 8. Futures mô phỏng (v0.5.0)

**Luật sản phẩm (v1)**
- Hợp đồng vĩnh cửu USDT-M; **ký quỹ cô lập** (mỗi vị thế có ký quỹ riêng); **một chiều** (mỗi cặp một vị thế Long *hoặc* Short); đòn bẩy 1–20×, mặc định 10×.
- Ví Futures riêng: phải **chuyển tiền** từ Spot sang (`futuresTransfer`) trước khi giao dịch.
- BUY mở/tăng Long hoặc giảm Short; SELL ngược lại. Lệnh ngược chiều lớn hơn vị thế sẽ đóng vị thế rồi mở chiều kia.
- `reduceOnly`: chỉ giảm vị thế. Nút "Đóng vị thế" dùng `futuresClosePosition`.
- TP/SL theo **mark price**, khi chạm sẽ đóng bằng lệnh Market. Thanh lý cũng theo mark price, và mất **tối đa** phần ký quỹ của vị thế (số dư không bao giờ âm).
- Funding theo đúng mốc của Binance (thường 8 giờ): `rate > 0` thì Long trả, Short nhận; trừ hoặc cộng vào ký quỹ vị thế.
- Phí: maker 0,02%, taker 0,05%, thanh lý 0,5%. Lấy từ `futuresExchangeInfo().fees`, không viết cứng trong UI.
- Đổi đòn bẩy chỉ khi cặp đó không còn vị thế và lệnh mở (`LEVERAGE_LOCKED`).

**Cách hiển thị**
- **Lãi lỗ realtime:** subscribe `futures:mark:<SYMBOL>`, rồi tính bằng `pnl(side, dec(entryPrice), dec(markPrice), dec(quantity))` và `returnOnMargin` của `@cex/core`. Không tính bằng `number`. Khi `markPrice` là `null` hoặc trạng thái STALE thì hiện `—`.
- **Giá thanh lý:** dùng `position.liquidationPrice` của server (đã làm tròn về phía cảnh báo sớm). Form đặt lệnh có thể ước tính bằng `liquidationPrice()` của core.
- **1000PEPE:** hiển thị "1 hợp đồng = 1000 PEPE" khi `multiplier > 1`. Tên và icon lấy theo `underlyingAsset` từ `exchangeInfo().assets`.
- **Form lệnh:** đòn bẩy (slider 1–`maxLeverage`), Mở Long / Mở Short, chỉ giảm vị thế, TP/SL, ký quỹ cần dùng = giá × khối lượng ÷ đòn bẩy (`initialMargin`) + phí ước tính.
- **Tab dưới:** Vị thế (n) | Lệnh đang chờ | Lịch sử lệnh | Lịch sử vị thế | Funding (sổ cái loại `FUNDING_FEE`).
- **Sự kiện realtime:** `futuresPosition` / `futuresAccount` → cập nhật ngay; thông báo `POSITION_LIQUIDATED` / `POSITION_TPSL` → hiện toast nổi bật.

## 9. Hồ sơ, bảo mật, lãi lỗ, bot (v0.6.0)

**Hồ sơ + bảo mật** (trang "Tài khoản" kiểu OKX)
- Đầu trang: avatar (`me.avatar`, `null` → chữ cái đầu của tên), tên, **UID** (`me.uid`) có nút sao chép, trạng thái xác minh email.
- Thẻ bảo mật lấy từ `securityOverview()`: 2FA, mã chống lừa đảo, mật khẩu (lần đổi gần nhất), số phiên. Mỗi thẻ có trạng thái "Đã bật / Chưa bật" và nút thao tác.
- Mã chống lừa đảo: form `setAntiPhishingCode` cần mật khẩu, và ô mã 2FA khi `twoFactorEnabled`. Giải thích ngắn: "Mã này sẽ xuất hiện trong mọi email thật từ sàn".
- Lịch sử đăng nhập: bảng `loginHistory` (thời gian, thiết bị, IP, kết quả; nhãn "Thiết bị mới").

**Phân tích lãi lỗ** (`pnlAnalysis`)
- Bộ chọn 7 ngày / 30 ngày / 90 ngày / Tất cả.
- Thẻ tổng: lãi lỗ đã chốt (Spot / Futures), tỷ lệ thắng, profit factor, sụt giảm tối đa.
- Biểu đồ cột theo ngày (xanh/đỏ) + đường cộng dồn (`cumulative`). Lịch tháng tô màu theo ngày (giống OKX) dùng `daily`. Bảng theo cặp dùng `bySymbol`.
- Mọi giá trị có thể `null` (chưa có giao dịch) → hiện `—`, không hiện 0.

**Mua định kỳ (DCA)**
- Form: cặp, số USDT mỗi kỳ, tần suất (Hằng ngày / Hằng tuần + thứ / Hằng tháng + ngày 1–28), giờ (GMT+7). Hiện "Lần mua tiếp theo" = `nextRunAt`.
- Danh sách kế hoạch: đã mua (`totalSpent`, `totalBought`), giá trung bình (`avgPrice`), số kỳ đã chạy / bỏ qua; nút Tạm dừng / Tiếp tục / Hủy.
- Lịch sử từng kỳ (`dcaRuns`): kỳ `SKIPPED` hiện lý do bằng tiếng Việt (bảng mã lỗi chung).

**Bot lưới Spot**
- Form tạo: cặp, giá thấp / cao, số lưới, kiểu lưới, vốn. Gọi `gridBotPreview` khi người dùng ngừng gõ (debounce khoảng 400 ms) để hiện lãi mỗi lưới (`profitPerGridMin`–`Max`, dạng %), vốn tối thiểu, số lệnh mua/bán, và vẽ các mức giá lên biểu đồ.
- Thẻ bot: trạng thái, khoảng giá, số vòng đã xong (`completedRounds`), lãi lưới (`gridProfit`), tổng lãi lỗ (`totalPnl`, gồm cả biến động giá của coin bot đang giữ), số lệnh đang mở.
- Nút "Dừng bot" → hỏi có bán coin bot đang giữ không (`sellBase`).
- Lệnh của bot (`gridBotOrders`) và mọi lệnh có `source !== 'USER'`: badge "Bot lưới" / "Mua định kỳ", **không có nút Hủy**.
- Realtime: sự kiện `gridBot` / `dcaPlan` trên kênh `user` → cập nhật thẻ ngay, không cần gọi lại API.

## 10. Admin cho bot, Futures, đăng nhập (v0.7.0)
- **Tìm người dùng:** ô tìm nhận UID 8 số, email hoặc ID. Luôn hiện UID (có nút sao chép) — đây là mã người dùng đọc cho hỗ trợ.
- **Chi tiết người dùng:** thẻ ví Futures (`detail.futures`) và số bot (`detail.bots`); tab Futures (`adminUserFuturesPositions`), Bot (`adminUserBots`), Đăng nhập (`adminUserLoginHistory`).
- **Dừng bot / hủy kế hoạch:** chỉ hiện khi có quyền `bots.manage`. Hộp xác nhận có ô lý do (≥ 5 ký tự); dừng bot lưới có lựa chọn "bán coin bot đang giữ". Sau khi xong, nhật ký quản trị có dòng `GRID_BOT_STOP` / `DCA_PLAN_CANCEL`.

## 11. Hàm tiện ích cho giao diện (v0.9.0)
Dùng các hàm này thay vì tự viết (chi tiết và ví dụ trong `src/helpers.ts`):
```ts
import { createTickerStore, resolveFuturesSymbol, countdown, spotTradeBlock, TRADE_BLOCK_LABELS, createPager, saveTextFile } from '@cex/contracts';

// giá: MỘT store cho cả app (tạo một lần, cạnh realtime client)
const prices = createTickerStore(rt);                       // 'futures' → futures:tickers
prices.seed((await api.tickers()).items);
const useTicker = (s: string) => useSyncExternalStore((cb) => prices.subscribe(cb, s), () => prices.get(s));

// /futures/PEPEUSDT → /futures/1000PEPEUSDT
const sym = resolveFuturesSymbol(param, futuresInfo.symbols, exchangeInfo.symbols) ?? 'BTCUSDT';

countdown(mark.nextFundingTime);                            // "03:59:12" | null → hiện "—"
const block = spotTradeBlock(symbol, exchangeStatus, ticker); // null → cho đặt lệnh; khác → TRADE_BLOCK_LABELS[block]

const pager = createPager((cursor) => api.orderHistory({ query: { symbol, cursor, limit: 50 } }));
saveTextFile(await api.exportLedger({ query: {} }), 'so-cai.csv');
```

## 12. Chạy kín: mã mời + cấu hình công khai (v0.10.0)
- Lúc app khởi động: `const cfg = await api.publicConfig()`.
  - `cfg.registration === 'INVITE_ONLY'` → form đăng ký có ô **Mã mời** (bắt buộc), điền sẵn từ `?invite=`.
  - `cfg.captchaSiteKey` → hiện Turnstile, gửi `captchaToken`.
  - `cfg.marketFeed === 'sim'` → banner "GIÁ GIẢ LẬP — không phải giá thị trường".
- Lỗi `INVALID_INVITE` → thông báo theo `details.reason`: thiếu mã / mã không đúng / mã hết hạn / mã đã dùng hết lượt / mã đã bị thu hồi.
- Admin: trang "Mã mời" gồm danh sách (lọc trạng thái), tạo mới (người nhận, số lượt, số ngày) và thu hồi (lý do ≥ 5 ký tự).
  Sau khi tạo, **chỉ lúc đó** hiện mã + link kèm nút sao chép; đóng hộp là không xem lại được.

## 13. Web admin nối với web sàn (v0.11.0)
- **Một địa chỉ, một lần đăng nhập:** server phục vụ app sàn ở `/` và app admin ở `/admin/`. Nhân sự đăng nhập ở app sàn
  (có mã 2FA) là vào được admin luôn; đăng xuất ở một bên là đăng xuất cả hai.
- **Link qua lại** dùng `appLinks` (không tự ghép chuỗi):
  ```ts
  import { appLinks, canOpenAdmin } from '@cex/contracts';
  const ADMIN = import.meta.env.VITE_ADMIN_ORIGIN;        // dev: http://localhost:5174 — deploy: undefined (cùng địa chỉ)
  {canOpenAdmin(me) && <a href={appLinks.admin.home(ADMIN)} data-testid="nav-admin">Quản trị</a>}
  // trong app admin:
  const EX = import.meta.env.VITE_EXCHANGE_ORIGIN;
  <a href={appLinks.exchange.trade(symbol, EX)} target="_blank">Xem trên sàn</a>
  ```
- **Thao tác admin → web sàn thấy gì:** bảng ở `docs/antigravity/PROMPT-08-web-admin-noi-web-san.md` mục 3.


# PROMPT cho Antigravity — Giao diện Giai đoạn 0–1 (Design system + Sàn ảo lõi)

> Dán toàn bộ nội dung dưới đây vào Antigravity. Mở Antigravity ở thư mục **`D:\Claude\crypto-ui`** (git worktree, nhánh `ui/gd1-exchange`) — **không** mở `D:\Claude\crypto` (thư mục của Claude Code).

---

## 0. Vai trò & bối cảnh

Bạn là kỹ sư frontend phụ trách **giao diện** của một **sàn giao dịch Spot mô phỏng** (tiền ảo, giá thật từ Binance). Backend, database, bảo mật và logic sàn do Claude Code làm và **đã xong Giai đoạn 1**: đăng ký/đăng nhập, ví + nạp tiền ảo, lệnh Market/Limit, khớp lệnh, dữ liệu thị trường realtime 10 cặp.

Nhiệm vụ lần này: **P07 Design system** + **P08 Giao diện sàn – Giai đoạn 1**, chạy được hoàn toàn bằng **mock** (không cần backend), sau đó chạy thử với backend thật.

## 1. Đọc trước khi viết code (bắt buộc)

1. `.agent/rules/project-rules.md` — quy tắc của bạn.
2. `packages/contracts/README.md` — cách gọi API, realtime, bật mock, 6 kịch bản trạng thái, quy tắc hiển thị số.
3. `packages/contracts/src/endpoints.ts` (danh sách 29 endpoint), `errors.ts` (25 mã lỗi), `market.ts`, `wallet.ts`, `orders.ts`, `realtime.ts`.
4. `docs/parts/P07-design-system.md`, `docs/parts/P08-ui-san.md`.
5. `docs/reports/2026-10-09-backend-gd0-gd1.md` — mục 4 "Antigravity có thể bắt đầu phần nào".

## 2. Phạm vi

- **Được tạo/sửa:** `apps/exchange/`, `packages/ui/`, báo cáo của bạn trong `docs/reports/`, checklist trong `docs/parts/P07-*.md` & `P08-*.md`, và `docs/parts/contract-requests.md`.
- **Không sửa:** `server/`, `packages/contracts/`, `packages/core/`, `legacy/`, file cấu hình gốc (`package.json` gốc, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`).
- Cần thêm/đổi API → ghi vào `docs/parts/contract-requests.md` rồi dùng tạm dữ liệu "không có", **không** tự bịa endpoint hay tự sửa contracts.
- Commit trên nhánh `ui/gd1-exchange`, commit nhỏ theo từng mốc. Không merge vào `main`.

## 3. Thiết lập kỹ thuật (đã được kiểm chứng với monorepo này)

Monorepo npm workspaces — gốc đã khai báo `apps/*` và `packages/*`. Sau khi tạo `package.json` của 2 package dưới, chạy **`npm install` ở thư mục gốc**.

**`packages/ui`** — tên `@cex/ui`, component thuần (không gọi API, không logic nghiệp vụ), xuất từ `src/index.ts` (giống cách `@cex/contracts` làm: `"main": "./src/index.ts"`).

**`apps/exchange`** — tên `@cex/exchange-web`, React 19 + Vite + Tailwind CSS v4, TypeScript.
- dependencies: `"@cex/contracts": "*"`, `"@cex/core": "*"`, `"@cex/ui": "*"`, react, react-dom, router (react-router), gợi ý `@tanstack/react-query` cho trạng thái tải/lỗi, gợi ý `lightweight-charts` cho biểu đồ nến.
- devDependencies: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, **`msw@^2`**.
- Chạy một lần trong `apps/exchange`: `npx msw init public/ --save`.
- `tsconfig.json` (cấu hình này đã typecheck sạch khi import contracts/core/mocks):
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"], "jsx": "react-jsx", "types": ["vite/client"] },
    "include": ["src"]
  }
  ```
  (`tsconfig.base.json` đã có `allowImportingTsExtensions`, `noEmit`, `moduleResolution: bundler` — cần vì contracts xuất mã nguồn `.ts`.)
- `vite.config.ts`: cổng **5173** (trùng `APP_URL` của backend — link xác minh email trỏ về đây) và proxy để cùng origin:
  ```ts
  server: {
    port: 5173, strictPort: true,
    proxy: { '/api': 'http://localhost:8080', '/ws': { target: 'ws://localhost:8080', ws: true } },
  }
  ```
- `.env.development`: `VITE_USE_MOCKS=true`. Khởi tạo mock **chỉ** khi `import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true'` (dùng `import()` động để mock không lọt vào bản build):
  ```ts
  const { setupWorker } = await import('msw/browser');
  const { createMockHandlers, createMockRealtimeClient } = await import('@cex/contracts/mocks');
  await setupWorker(...createMockHandlers()).start({ onUnhandledRequest: 'bypass' });
  // realtime = createMockRealtimeClient()  — còn không thì createRealtimeClient()
  ```
- Một **thanh công cụ dev** (chỉ khi bật mock) để gọi `setMockScenario('normal' | 'empty' | 'error' | 'halted' | 'signedOut' | 'unverified')` rồi tải lại dữ liệu — dùng để kiểm tra mọi trạng thái.
- Lệnh: `npm run dev -w @cex/exchange-web`, `npx tsc -p apps/exchange`, `npm run build -w @cex/exchange-web`.

## 4. Thứ tự làm (mỗi mốc 1 commit)

### Mốc A — `packages/ui` (P07)
- **Design tokens** bằng CSS variables, sáng/tối: nền, chữ, viền, nhấn; **xanh = tăng/mua, đỏ = giảm/bán** (có tùy chọn đảo màu); cảnh báo/lỗi/thành công. Font số **tabular** (`font-variant-numeric: tabular-nums`). Breakpoint mobile-first từ 360px.
- Component cơ bản: Button, Input, **DecimalInput** (chỉ nhận chuỗi số thập phân, giới hạn số chữ số lẻ theo bước), Select, Tabs, Modal + **BottomSheet** (mobile), Toast, Tooltip, Table (cuộn ngang trên mobile), Card, Badge, Skeleton, EmptyState, ErrorState (có nút Thử lại).
- Component sàn: `PriceText` (màu theo tăng/giảm, nháy nhẹ khi đổi), `AmountText`, `PercentChange`, `SymbolBadge`, **`StaleBadge`** (LIVE/STALE/UNAVAILABLE), `OrderStatusBadge` (NEW/PARTIALLY_FILLED/FILLED/CANCELED/REJECTED/EXPIRED), `SideTag` (Mua/Bán), `SimulatedBanner` ("Sàn mô phỏng — không có tiền thật").
- **Định dạng số bằng thao tác chuỗi** (không `Number()`): `formatDecimal("12345.67800000", { decimals: 2, locale: 'vi' })` → `"12.345,68"`; `null` → `"—"`. Không có chuỗi nào được hiển thị thành `0` khi dữ liệu là `null`.
- Trang trưng bày component (route `/__ui` chỉ ở dev) với cả 2 chế độ sáng/tối.

### Mốc B — Khung ứng dụng
- Layout mobile (thanh điều hướng dưới: Thị trường · Giao dịch · Ví · Tài khoản) và desktop (header).
- `SimulatedBanner` luôn hiện. Banner **dừng giao dịch** khi `exchangeInfo.tradingHalted = true`. Banner **mất kết nối** theo `realtime.onStatus` (`connecting/closed`). Cảnh báo **giá cũ** theo `market:status` / `ticker.status`.
- Chuỗi giao diện trong file i18n `vi` (mặc định) + khung `en`. Thời gian hiển thị **GMT+7** (`timeZone: 'Asia/Ho_Chi_Minh'`), dữ liệu API là UTC.
- Bảo vệ route: gọi `me` khi tải; lỗi `UNAUTHENTICATED` (401) ở bất kỳ đâu → về `/login`. `emailVerified = false` → thanh nhắc xác minh + nút gửi lại (`resendVerification`).
- Bảng ánh xạ **mã lỗi → câu tiếng Việt** cho cả 25 mã trong `ErrorCode`.

### Mốc C — Xác thực
| Màn hình | API |
|---|---|
| `/register` (email, tên, mật khẩu ≥ 8 ký tự; chỗ cho captcha sau này — trường `captchaToken`) | `register` |
| `/login` | `login` — lỗi `UNAUTHENTICATED` = sai email/mật khẩu; `RATE_LIMITED` hiện `details.retryAfterSeconds` |
| `/forgot-password` (luôn báo "nếu email tồn tại, đã gửi link") | `forgotPassword` |
| `/reset-password?token=...` | `resetPassword` — xong thì về đăng nhập |
| `/verify-email?token=...` | `verifyEmail` |
| Đăng xuất | `logout` |

Phiên dùng cookie httpOnly do server đặt — **không** lưu token, không đụng `localStorage` cho phiên.

### Mốc D — Thị trường (`/markets`)
- Danh sách 10 cặp từ `exchangeInfo.symbols` + `tickers`, cập nhật qua kênh `ticker:<SYMBOL>`: giá, % 24h, khối lượng (quote), trạng thái.
- Cặp `enabled = false` → nhãn "Tạm ngưng"; `status = STALE` → `StaleBadge`; `UNAVAILABLE` → "—" cho mọi số. Tìm kiếm cặp. Bấm → `/trade/:symbol`.

### Mốc E — Giao dịch (`/trade/:symbol`)
- **Biểu đồ nến**: tải `candles` (interval 1m/5m/15m/1h/4h/1d, `limit` ≤ 1000), cập nhật nến cuối từ kênh `candles:<SYMBOL>:<interval>` (`closed = false` là nến đang chạy). Kéo xem quá khứ: gọi lại với `endTime` = `openTime` của nến cũ nhất. *Chuyển chuỗi sang number chỉ để vẽ biểu đồ — không dùng số đó để tính hay hiển thị tiền.*
- **Sổ lệnh** từ `depth` + kênh `depth:<SYMBOL>` (20 mức mỗi bên, `[giá, khối lượng]`). Bấm một mức giá → điền vào ô giá của form Limit.
- **Giao dịch gần đây**: `marketTrades` + kênh `trades:<SYMBOL>` (`isBuyerMaker = true` hiển thị màu bán).
- **Form Mua/Bán**:
  - Market: nhập **khối lượng** (`quantity`) *hoặc* **số USDT** (`quoteOrderQty`) — gửi đúng một trong hai.
  - Limit: `quantity` + `price`, tùy chọn GTC/IOC.
  - Nút 25/50/75/100% và kiểm tra trước khi gửi: **dùng `@cex/core`** (chỉ import, không sửa) — `dec`, `floorToStep`, `roundDown`, `checkPrice`, `checkQuantity`, `checkNotional` (trả về đúng tên mã lỗi như server). Mua Market theo % → `quoteOrderQty = roundDown(USDT khả dụng × %)`; Mua Limit → `quantity = floorToStep(USDT khả dụng × % / giá, stepSize)`; Bán → `quantity = floorToStep(coin khả dụng × %, stepSize)`.
  - Phí **ước tính** = `feeRate` × giá trị (mua: phí tính bằng coin nhận; bán: bằng USDT) — ghi rõ "ước tính". Số thật lấy từ `fills[].fee` trong response.
  - Gửi kèm `clientOrderId` tạo mới mỗi lần bấm (vd. `crypto.randomUUID().replaceAll('-', '')`) để bấm 2 lần không đặt 2 lệnh (`DUPLICATE_CLIENT_ORDER_ID` = lệnh đã được đặt).
  - Vô hiệu nút đặt lệnh khi: chưa đăng nhập, chưa xác minh email, cặp tắt, giá STALE/UNAVAILABLE, sàn dừng.
  - Sau khi đặt: toast kết quả (Market hiện giá khớp trung bình `order.avgPrice`).
- **Tab dưới**: Lệnh đang chờ (`openOrders`, nút Hủy → `cancelOrder`, Hủy tất cả → `cancelAllOrders` có hộp xác nhận) · Lịch sử lệnh (`orderHistory`, phân trang `cursor`) · Lịch sử khớp (`myTrades`).
- Cập nhật realtime qua kênh `user`: `kind: 'order'` → cập nhật/thêm/xóa lệnh trong danh sách; `kind: 'trade'` → thêm vào lịch sử khớp + toast "Lệnh đã khớp"; `kind: 'balance'` → cập nhật số dư khả dụng ở form.
- **Mobile**: tab Biểu đồ / Sổ lệnh / Giao dịch gần đây; form lệnh mở bằng BottomSheet (nút Mua/Bán cố định dưới màn hình). **Desktop**: bố cục nhiều cột như sàn thật.

### Mốc F — Ví (`/wallet`)
- `balances`: mỗi tài sản (khả dụng / đang khóa / tổng / giá trị USDT). Tổng tài sản = `totalValueUsdt`; nếu `unpricedAssets` không rỗng → ghi chú "chưa tính: LINK (không có giá)". `valueUsdt = null` → "—".
- **Không tự cộng tổng**: khi nhận sự kiện `balance` qua kênh `user`, cập nhật dòng tài sản đó rồi **gọi lại `balances`** (debounce ~1s) để lấy tổng mới.
- **Nạp tiền ảo**: `faucetStatus` (số tiền mỗi lần, đã nạp / trần, `nextAvailableAt` → đếm ngược), nút nạp → `faucetClaim`; lỗi `FAUCET_COOLDOWN` (có `details.nextAvailableAt`), `FAUCET_CAP_REACHED`, `EMAIL_NOT_VERIFIED`.
- **Lịch sử biến động**: `ledger` (lọc theo tài sản; mặc định ẩn ORDER_LOCK/ORDER_UNLOCK, có công tắc hiện), phân trang `cursor`. Nhãn tiếng Việt cho 8 loại: FAUCET, ORDER_LOCK, ORDER_UNLOCK, TRADE_DEBIT, TRADE_CREDIT, FEE, ADMIN_ADJUST, ACCOUNT_RESET.

### Mốc G — Tài khoản / Cài đặt
- Thông tin `me`; đổi mật khẩu (`changePassword` — thiết bị khác bị đăng xuất); danh sách phiên & thiết bị (`listSessions`, đăng xuất từ xa `revokeSession`, đánh dấu phiên hiện tại).
- Cài đặt giao diện: sáng/tối, ngôn ngữ, đảo màu tăng/giảm (lưu `localStorage` được — đây là tùy chọn hiển thị, không phải dữ liệu phiên).

## 5. Trạng thái bắt buộc cho MỌI màn hình
Đang tải (Skeleton) · Trống (EmptyState) · Lỗi (ErrorState + Thử lại) · Mất kết nối realtime · Dữ liệu giá cũ.
Kiểm tra bằng mock: kịch bản `normal` đã có sẵn **AVAXUSDT = STALE**, **LINKUSDT = UNAVAILABLE** (giá `null`), **SUIUSDT bị tắt**; các kịch bản `empty`, `error`, `halted`, `signedOut`, `unverified`; `createMockRealtimeClient({ dropEveryMs: 15000 })` giả lập mất kết nối.

## 6. Quy tắc không được vi phạm
1. Tiền/giá/khối lượng là **chuỗi**; không `Number()`/`parseFloat` để tính hay hiển thị (ngoại lệ duy nhất: tọa độ vẽ biểu đồ). Phép tính cho ô nhập dùng `@cex/core`.
2. **Không bịa dữ liệu**: `null` → "—"/"Không có dữ liệu", không bao giờ thành 0. Mock chỉ bật ở dev với cờ.
3. **Không tự tính** số dư, giá khớp, phí thật, tổng tài sản — hiển thị đúng số API trả về.
4. Gọi API **chỉ** qua `createApiClient` và realtime **chỉ** qua `createRealtimeClient` / `createMockRealtimeClient` của `@cex/contracts`. Không tự `fetch`.
5. Không lưu token; không đặt khóa/bí mật trong frontend.
6. Ẩn nút **không phải** là phân quyền — server luôn kiểm tra; UI phải xử lý lỗi server trả về.
7. Mobile-first từ 360px, sáng/tối, điều khiển được bằng bàn phím.
8. Không báo "xong/PASSED" khi chưa chạy thật — ghi rõ lệnh đã chạy và kết quả.

## 7. Kiểm tra khi xong
1. `npx tsc -p apps/exchange` → 0 lỗi; `npm run build -w @cex/exchange-web` thành công và bản build **không chứa** mock (kiểm tra `dist` không có chuỗi `mockServiceWorker`/`createMockHandlers`).
2. Với mock: đi hết luồng đăng ký → xác minh → nạp → mua Market → đặt Limit → hủy → xem ví/lịch sử, ở **360px** và **desktop**, cả **sáng/tối**; lần lượt bật 6 kịch bản và chụp màn hình mỗi trạng thái.
3. Với backend thật (tắt mock: `VITE_USE_MOCKS=false`):
   ```bash
   cp .env.example .env
   npm run db:start          # terminal 1 — PostgreSQL local
   npm run dev:server        # terminal 2 — API :8080 (link xác minh email in trong log server)
   npm run dev -w @cex/exchange-web   # terminal 3 — :5173
   ```
   (Nếu `db:start` báo cổng 5433 đang bận thì PostgreSQL local đã chạy sẵn — bỏ qua bước đó.)
   Lặp lại luồng ở bước 2 với giá Binance thật; đặt một lệnh Limit sát giá để thấy nó tự khớp và số dư cập nhật realtime.

## 8. Báo cáo
Tạo `docs/reports/<ngày>-ui-gd1.md`: màn hình đã làm, lệnh đã chạy + kết quả, ảnh chụp (đặt trong `docs/reports/img/`), những gì chưa xong, các yêu cầu API đã ghi vào `contract-requests.md`. Đánh dấu checklist trong `docs/parts/P07-design-system.md` và `docs/parts/P08-ui-san.md` cho mục đã thật sự kiểm tra.

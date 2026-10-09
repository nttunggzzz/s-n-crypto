# PROMPT cho Antigravity — Giao diện Giai đoạn 0–1 (Design system + Sàn ảo lõi)

> **Hướng dẫn sử dụng:** Dán toàn bộ nội dung tài liệu này vào Antigravity (hoặc giao diện AI agent). 
> Mở Antigravity tại thư mục làm việc: **`D:\Claude\crypto-ui`** (nhánh `ui/gd1-exchange`) — **tuyệt đối không** mở thư mục `D:\Claude\crypto` (thư mục của backend do Claude Code phụ trách).

---

## 0. Vai trò & Bối cảnh

Bạn là kỹ sư frontend chịu trách nhiệm xây dựng **toàn bộ giao diện** cho dự án **Sàn giao dịch Spot mô phỏng** (tiền ảo, giá thật từ Binance). 
- Phần backend, cơ sở dữ liệu PostgreSQL, bảo mật và logic sàn cốt lõi do Claude Code phụ trách và **đã hoàn thành Giai đoạn 1**: đăng ký/đăng nhập, ví + nạp tiền ảo (faucet), đặt và hủy lệnh Market/Limit, khớp lệnh thời gian thực, nạp dữ liệu thị trường 10 cặp từ Binance.
- Nhiệm vụ trọng tâm của bạn: Xây dựng **P07 Design system** (`packages/ui`) + **P08 Giao diện sàn Giai đoạn 1** (`apps/exchange`).
- Ứng dụng phải hoạt động độc lập và hoàn hảo với **Mock (MSW)** trước, sau đó kết nối và kiểm thử toàn diện với **Backend thật**.

---

## 1. Những file Antigravity phải đọc trước, phần được sửa và phần cấm sửa

### 1.1. Những file bắt buộc phải đọc trước khi viết code
1. `.agent/rules/project-rules.md` — Quy tắc ứng xử và phát triển giao diện dự án.
2. `packages/contracts/README.md` — Hướng dẫn gọi API, realtime WebSocket, kích hoạt mock (MSW), 6 kịch bản giả lập, quy tắc định dạng tiền tệ.
3. Hợp đồng API trong `packages/contracts/`:
   - `src/endpoints.ts` (danh sách đầy đủ 29 endpoint).
   - `src/errors.ts` (25 mã lỗi nghiệp vụ chuẩn hóa `ErrorCode`).
   - `src/market.ts` (kiểu dữ liệu thị trường, ticker, depth, candles, trades).
   - `src/wallet.ts` (kiểu dữ liệu ví, số dư, faucet, sổ cái biến động ledger).
   - `src/orders.ts` (kiểu dữ liệu lệnh, khớp lệnh, tham số đặt lệnh).
   - `src/realtime.ts` (các kênh và kiểu gói tin realtime).
4. `docs/parts/P07-design-system.md` và `docs/parts/P08-ui-san.md` — Yêu cầu thiết kế UI và danh mục tính năng sàn.
5. `docs/reports/2026-10-09-backend-gd0-gd1.md` — Báo cáo backend (đặc biệt mục 4: "Antigravity có thể bắt đầu phần nào").

### 1.2. Phạm vi được phép sửa
- `apps/exchange/` (Ứng dụng web sàn giao dịch).
- `packages/ui/` (Thư viện component dùng chung `@cex/ui`).
- `docs/reports/` (Viết báo cáo tiến độ và kết quả nghiệm thu).
- Đánh dấu checklist trong `docs/parts/P07-design-system.md` và `docs/parts/P08-ui-san.md`.
- `docs/parts/contract-requests.md` (Ghi nhận đề xuất API mới hoặc sửa đổi hợp đồng).

### 1.3. Phạm vi CẤM sửa
- `server/` (Toàn bộ mã nguồn backend).
- `packages/contracts/` (Hợp đồng API là nguồn sự thật duy nhất do backend phát hành — UI chỉ import dùng).
- `packages/core/` (Thư viện tính toán số học chính xác — UI chỉ import dùng hàm kiểm tra & làm tròn).
- `legacy/` (Mã nguồn cũ).
- Các file cấu hình gốc monorepo: `package.json` ở thư mục gốc, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`.

> **Quy tắc phối hợp:** Nếu cần thêm API hoặc đổi định dạng, **tuyệt đối không tự ý sửa `packages/contracts`**. Hãy ghi yêu cầu vào file `docs/parts/contract-requests.md`, đồng thời tạm thời mock giao diện ở trạng thái "không có dữ liệu". Thực hiện commit trên nhánh `ui/gd1-exchange`, chia commit nhỏ theo từng mốc công việc, không merge vào `main`.

---

## 2. Cấu hình kỹ thuật

Dự án sử dụng mô hình monorepo với **npm workspaces** (gốc đã cấu hình `apps/*` và `packages/*`). Sau khi tạo cấu hình cho 2 package bên dưới, chạy lệnh `npm install` tại thư mục gốc.

### 2.1. Thư viện component: `packages/ui` (`@cex/ui`)
- Component giao diện thuần túy: **không gọi API, không chứa logic nghiệp vụ**, chỉ nhận dữ liệu qua props.
- Xuất gói từ `src/index.ts` (tương tự `@cex/contracts`: `"main": "./src/index.ts"`).
- Đóng gói toàn bộ design tokens CSS variables (màu sắc, spacing, bo góc, font chữ).

### 2.2. Ứng dụng sàn: `apps/exchange` (`@cex/exchange-web`)
- Công nghệ: **React 19**, **Vite**, **Tailwind CSS v4**, **TypeScript**.
- Dependencies cần thiết:
  - `"@cex/contracts": "*"`
  - `"@cex/core": "*"`
  - `"@cex/ui": "*"`
  - `react`, `react-dom`, `react-router`
  - Khuyến nghị `@tanstack/react-query` để quản lý trạng thái tải/lỗi/caching dữ liệu.
  - Khuyến nghị `lightweight-charts` của TradingView để vẽ biểu đồ nến.
- DevDependencies: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, **`msw@^2`**.
- Khởi tạo MSW một lần duy nhất trong thư mục `apps/exchange`:
  ```bash
  npx msw init public/ --save
  ```
- Cấu hình `tsconfig.json` trong `apps/exchange`:
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "lib": ["ES2023", "DOM", "DOM.Iterable"],
      "jsx": "react-jsx",
      "types": ["vite/client"]
    },
    "include": ["src"]
  }
  ```
- Cấu hình `vite.config.ts`: Chạy tại cổng **5173** (khớp với `APP_URL` backend gửi trong email xác minh) và proxy chuyển tiếp toàn bộ request API + WebSocket sang server backend:
  ```ts
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import tailwindcss from '@tailwindcss/vite';

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:8080',
          ws: true,
        },
      },
    },
  });
  ```

### 2.3. Cơ chế bật dữ liệu giả (Mock Mode)
- Cấu hình file `.env.development`:
  ```env
  VITE_USE_MOCKS=true
  ```
- Khởi động Mock Service Worker (MSW) và Realtime Mock bằng `import()` động (chỉ load khi dev và có cờ bật, tuyệt đối không lọt vào bundle build production):
  ```ts
  // main.tsx
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true') {
    const { setupWorker } = await import('msw/browser');
    const { createMockHandlers, createMockRealtimeClient } = await import('@cex/contracts/mocks');

    const worker = setupWorker(...createMockHandlers());
    await worker.start({ onUnhandledRequest: 'bypass' });

    // Khởi tạo client realtime giả lập
    // const rt = createMockRealtimeClient();
  }
  ```
- Thanh công cụ dev (Dev Toolbar): Hiển thị floating widget khi bật mock cho phép gọi hàm `setMockScenario('normal' | 'empty' | 'error' | 'halted' | 'signedOut' | 'unverified')` từ `@cex/contracts/mocks` và trigger refetch dữ liệu để kiểm tra tức thì 5 trạng thái giao diện.

---

## 3. Bảy (07) mốc công việc chi tiết

Mỗi mốc tương ứng với một đơn vị công việc hoàn chỉnh và phải được commit riêng biệt trên git.

```
Mốc 1: Bộ component giao diện (packages/ui)
  ↓
Mốc 2: Khung ứng dụng (App Shell & Bố cục)
  ↓
Mốc 3: Đăng nhập / Đăng ký (Xác thực)
  ↓
Mốc 4: Thị trường (/markets)
  ↓
Mốc 5: Trang giao dịch (/trade/:symbol)
  ↓
Mốc 6: Ví và Nạp tiền ảo (/wallet)
  ↓
Mốc 7: Cài đặt phiên đăng nhập & Tài khoản
```

---

### Mốc 1: Bộ component giao diện (`packages/ui` — P07)
*Xây dựng hệ thống UI kit nền tảng và design system.*

- **API sử dụng:** **Không có (N/A)** — Component thuần, không gọi API, không chứa logic nghiệp vụ.
- **Kênh realtime:** **Không có (N/A)**.
- **Chi tiết thực hiện:**
  - **Design tokens:** Khai báo CSS variables cho cả 2 theme Sáng/Tối (Light/Dark).
    - Quy ước màu sàn: **Xanh lá = Tăng / Mua**, **Đỏ = Giảm / Bán** (hỗ trợ tùy chọn đảo màu trong cài đặt).
    - Màu trạng thái: Cảnh báo (warning/amber), Lỗi (destructive/red), Thành công (success/green), Thông tin (info/blue).
    - Kiểu chữ số: Bắt buộc định dạng **tabular numbers** (`font-variant-numeric: tabular-nums`) để bảng giá, khối lượng không bị nhảy bề ngang khi cập nhật.
    - Breakpoint: Thiết kế theo chuẩn mobile-first (khởi đầu từ `360px` trở lên).
  - **Component cơ bản:**
    - `Button`, `Input`, `DecimalInput` (chỉ cho phép nhập chuỗi số thập phân hợp lệ, chặn ký tự lạ, giới hạn số chữ số lẻ theo `stepSize`).
    - `Select`, `Tabs`, `Modal`, `BottomSheet` (tối ưu cho trải nghiệm điện thoại di động).
    - `Toast`, `Tooltip`, `Table` (hỗ trợ cuộn ngang mượt mà trên mobile).
    - `Card`, `Badge`, `Skeleton`, `EmptyState`, `ErrorState` (kèm nút "Thử lại").
  - **Component chuyên biệt cho sàn:**
    - `PriceText`: Đổi màu xanh/đỏ theo chiều biến động giá, hiệu ứng flash/nháy nhẹ khi giá cập nhật.
    - `AmountText`: Định dạng chuỗi số thập phân theo locale Việt Nam (`12.345,67`).
    - `PercentChange`: Hiển thị % biến động kèm dấu `+`/`-` và màu tương ứng.
    - `SymbolBadge`: Huy hiệu cặp giao dịch kèm icon nhận diện.
    - `StaleBadge`: Huy hiệu trạng thái dữ liệu (`LIVE` xanh, `STALE` vàng cảnh báo, `UNAVAILABLE` xám/đỏ).
    - `OrderStatusBadge`: Trạng thái lệnh (`NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `REJECTED`, `EXPIRED`).
    - `SideTag`: Thẻ Mua (Buy) / Bán (Sell).
    - `SimulatedBanner`: Banner cố định với nội dung *"Sàn mô phỏng — không có tiền thật"*.
  - **Quy tắc định dạng số:** Sử dụng thao tác chuỗi thuần túy (không dùng `Number()`), ví dụ `formatDecimal("12345.67800000", { decimals: 2, locale: 'vi' })` → `"12.345,68"`; dữ liệu `null` → `"——"`. Tuyệt đối không hiển thị thành `0`.
  - **Trang trưng bày demo:** Route `/__ui` (chỉ hiển thị ở môi trường DEV) kiểm thử toàn bộ component với cả 2 chế độ Sáng và Tối.

---

### Mốc 2: Khung ứng dụng (App Shell & Bố cục tổng thể)
*Dựng khung định tuyến, thanh điều hướng, layout responsive và banner trạng thái hệ thống.*

- **API sử dụng:**
  - `api.me()` — Kiểm tra phiên đăng nhập của người dùng.
  - `api.exchangeInfo()` — Lấy thông tin vận hành sàn (`tradingHalted`).
  - `api.resendVerification()` — Gửi lại email xác minh khi tài khoản chưa kích hoạt.
- **Kênh realtime:**
  - `market:status` — Nhận thông báo trạng thái thị trường (`tradingHalted`, `maintenance`).
  - `rt.onStatus((status) => ...)` — Theo dõi trạng thái kết nối WebSocket (`'connecting' | 'open' | 'closed'`).
- **Chi tiết thực hiện:**
  - **Bố cục Mobile (< 768px):** Thanh điều hướng cố định dưới đáy màn hình (Bottom Navigation Bar) gồm 4 tab: **Thị trường · Giao dịch · Ví · Tài khoản**.
  - **Bố cục Desktop (≥ 768px):** Header điều hướng trên cùng, hiển thị logo, các menu chính, số dư nhanh, trạng thái kết nối và menu tài khoản.
  - **Hệ thống Banner toàn cục:**
    - `SimulatedBanner`: Luôn hiển thị ở vị trí dễ quan sát trên mọi trang.
    - **Banner Dừng giao dịch khẩn cấp:** Xuất hiện khi `exchangeInfo.tradingHalted = true` hoặc sự kiện realtime `market:status`.
    - **Banner Mất kết nối realtime:** Hiển thị cảnh báo mất kết nối khi trạng thái `rt.onStatus` là `connecting` hoặc `closed`.
    - **Cảnh báo dữ liệu giá cũ (Stale Price Banner):** Khi thị trường bị chậm cập nhật hoặc mất nguồn cấp dữ liệu Binance theo `market:status` / `ticker.status`.
  - **Đa ngôn ngữ & Múi giờ:**
    - Cấu trúc file i18n hỗ trợ tiếng Việt `vi` (mặc định) và chuẩn bị khung cho tiếng Anh `en`.
    - Múi giờ hiển thị cố định: **GMT+7** (`timeZone: 'Asia/Ho_Chi_Minh'`) mặc dù API trả về chuẩn ISO/UTC.
  - **Bảo vệ route (Route Guards):**
    - Gọi `api.me()` khi tải ứng dụng. Bất kỳ request nào trả về lỗi `UNAUTHENTICATED` (401) đều tự động chuyển hướng về `/login`.
    - Khi `emailVerified = false`, hiển thị thanh nhắc nhở xác minh email kèm nút "Gửi lại email xác minh" (`api.resendVerification()`).
  - **Ánh xạ lỗi:** Xây dựng bảng từ điển chuyển ngữ toàn bộ 25 mã lỗi trong `ErrorCode` sang câu thông báo tiếng Việt thân thiện.

---

### Mốc 3: Đăng nhập / Đăng ký (Xác thực)
*Xây dựng toàn bộ luồng quản lý người dùng và phiên đăng nhập.*

- **API sử dụng:**
  | Màn hình / Thao tác | API Endpoint | Ghi chú xử lý |
  |---|---|---|
  | Đăng ký (`/register`) | `api.register({ body })` | Email, họ tên, mật khẩu ≥ 8 ký tự; sẵn sàng ô cho `captchaToken`. |
  | Đăng nhập (`/login`) | `api.login({ body })` | Lỗi `UNAUTHENTICATED` báo sai tài khoản/mật khẩu; `RATE_LIMITED` hiển thị `details.retryAfterSeconds`. |
  | Quên mật khẩu (`/forgot-password`) | `api.forgotPassword({ body })` | Luôn hiển thị thông báo an toàn: *"Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi"*. |
  | Đặt lại mật khẩu (`/reset-password?token=...`) | `api.resetPassword({ body })` | Sau khi thành công, chuyển hướng người dùng về trang đăng nhập. |
  | Xác minh email (`/verify-email?token=...`) | `api.verifyEmail({ body })` | Kích hoạt tài khoản người dùng sau khi bấm link từ email. |
  | Gửi lại email xác minh | `api.resendVerification()` | Yêu cầu gửi lại link kích hoạt tài khoản. |
  | Đăng xuất | `api.logout()` | Xóa phiên đăng nhập trên server và xóa state trên frontend. |
- **Kênh realtime:** **Không có (N/A)**.
- **Quy tắc phiên:**
  - Phiên làm việc sử dụng Cookie `httpOnly` (`cex_session`) do backend tự động set qua response header.
  - **Tuyệt đối không lưu token vào `localStorage`** hay session storage. Không đụng đến token trên client.

---

### Mốc 4: Thị trường (`/markets`)
*Danh sách tổng quan các cặp tiền tệ giao dịch và biến động 24h.*

- **API sử dụng:**
  - `api.exchangeInfo()` — Lấy danh mục cặp giao dịch (`symbols`), thông số bước giá, trạng thái kích hoạt (`enabled`).
  - `api.tickers()` — Lấy thông tin thị trường 24h của 10 cặp tiền tệ (giá hiện tại, % thay đổi 24h, giá cao/thấp nhất, khối lượng quote).
- **Kênh realtime:**
  - `ticker:<SYMBOL>` — Đăng ký lắng nghe biến động giá tức thời từng cặp (ví dụ: `ticker:BTCUSDT`).
  - `market:status` — Cập nhật trạng thái đóng/mở của thị trường.
- **Chi tiết thực hiện:**
  - Hiển thị danh sách 10 cặp giao dịch: Tên cặp coin, giá gần nhất (PriceText đổi màu), % tăng giảm 24h (PercentChange), khối lượng giao dịch tính theo USDT.
  - Xử lý các trạng thái đặc biệt:
    - Cặp có `enabled = false`: Gắn nhãn *"Tạm ngưng"*, làm mờ hàng, không cho bấm vào giao dịch.
    - Cặp có `status = STALE`: Hiển thị `StaleBadge` màu vàng cảnh báo giá bị chậm.
    - Cặp có `status = UNAVAILABLE`: Hiển thị ký tự `"——"` cho tất cả các chỉ số giá và khối lượng.
  - Thanh tìm kiếm và bộ lọc nhanh cặp tiền.
  - Hành động bấm vào một hàng: Điều hướng trực tiếp sang trang giao dịch `/trade/:symbol`.

---

### Mốc 5: Trang giao dịch (`/trade/:symbol`)
*Trung tâm giao dịch cốt lõi: biểu đồ nến, sổ lệnh, giao dịch gần đây, đặt lệnh và quản lý lệnh.*

- **API sử dụng:**
  - `api.exchangeInfo()` — Quy chuẩn bước giá (`tickSize`), bước khối lượng (`stepSize`), giá trị tối thiểu (`minNotional`), phí `feeRate`.
  - `api.candles({ params, query })` — Tải dữ liệu nến lịch sử (interval `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `limit` ≤ 1000).
  - `api.depth({ params, query })` — Lấy snapshot sổ lệnh top 20 mỗi phe Mua/Bán.
  - `api.marketTrades({ params, query })` — Lấy lịch sử giao dịch khớp gần đây của thị trường.
  - `api.placeOrder({ body })` — Gửi lệnh Mua/Bán mới (Market hoặc Limit).
  - `api.cancelOrder({ params })` — Hủy một lệnh đang chờ.
  - `api.cancelAllOrders({ query })` — Hủy toàn bộ lệnh chờ của cặp tiền hoặc tất cả các cặp.
  - `api.openOrders({ query })` — Danh sách lệnh đang mở (`NEW`, `PARTIALLY_FILLED`).
  - `api.orderHistory({ query })` — Lịch sử lệnh đã hoàn thành/hủy, hỗ trợ phân trang bằng con trỏ `cursor`.
  - `api.myTrades({ query })` — Lịch sử các lượt khớp lệnh của người dùng.
  - `api.balances()` — Lấy số dư khả dụng để phục vụ tính toán form đặt lệnh.
- **Kênh realtime:**
  - `candles:<SYMBOL>:<interval>` — Cập nhật cây nến đang chạy (`closed = false`) hoặc chốt nến mới (`closed = true`).
  - `depth:<SYMBOL>` — Cập nhật biến động các mức giá và khối lượng trong sổ lệnh (tối đa 2 lần/giây).
  - `trades:<SYMBOL>` — Đẩy các giao dịch khớp lệnh tức thời của toàn sàn (`isBuyerMaker = true` hiển thị màu Bán, `false` hiển thị màu Mua).
  - `ticker:<SYMBOL>` — Cập nhật giá hiện tại trên đầu trang giao dịch.
  - `user` — Kênh riêng của tài khoản (cần đăng nhập), nhận các sự kiện:
    - `kind: 'order'`: Tự động cập nhật, thêm mới hoặc xóa lệnh trong tab Lệnh chờ / Lịch sử lệnh.
    - `kind: 'trade'`: Bổ sung ngay vào danh sách Lịch sử khớp lệnh + hiển thị Toast thông báo *"Lệnh đã khớp"*.
    - `kind: 'balance'`: Cập nhật lại số dư khả dụng hiển thị trong form đặt lệnh.
  - `market:status` — Nhận tín hiệu dừng giao dịch toàn sàn.
- **Chi tiết thực hiện:**
  - **Biểu đồ nến:** Tích hợp `lightweight-charts`. Cho phép chuyển đổi linh hoạt giữa các khung thời gian (1m/5m/15m/1h/4h/1d). Kéo lùi xem dữ liệu quá khứ: gọi API phân trang ngược với `endTime = openTime` của cây nến cũ nhất hiện tại. *(Lưu ý: Chỉ chuyển đổi chuỗi sang number cục bộ để render canvas biểu đồ, không dùng số này để tính toán tiền tệ).*
  - **Sổ lệnh (Orderbook):** Hiển thị trực quan 20 mức giá Bán (Ask - màu đỏ) và 20 mức giá Mua (Bid - màu xanh) kèm thanh tỷ lệ khối lượng (depth bar). Bấm vào một mức giá bất kỳ sẽ tự động điền giá đó vào ô nhập giá của form Limit.
  - **Form Mua / Bán:**
    - Lệnh **Market**: Cho phép người dùng chọn nhập **Khối lượng** (`quantity`) HOẶC nhập **Số USDT** (`quoteOrderQty`) — chỉ gửi đúng 1 trong 2 trường lên backend.
    - Lệnh **Limit**: Nhập cả `quantity` và `price`, có tùy chọn hiệu lực GTC (Good-Til-Canceled) hoặc IOC (Immediate-Or-Cancel).
    - Các nút tỷ lệ **25% / 50% / 75% / 100%**:
      - Bắt buộc tính toán bằng thư viện **`@cex/core`** (`dec`, `floorToStep`, `roundDown`), không dùng số JavaScript thông thường.
      - Mua Market theo %: `quoteOrderQty = roundDown(USDT_kha_dung × %)`
      - Mua Limit theo %: `quantity = floorToStep((USDT_kha_dung × %) / gia_nhap, stepSize)`
      - Bán (Market & Limit): `quantity = floorToStep(Coin_kha_dung × %, stepSize)`
    - **Kiểm tra hợp lệ trước khi gửi (Client-side validation):** Dùng các hàm kiểm tra của `@cex/core` (`checkPrice`, `checkQuantity`, `checkNotional`) để hiển thị thông báo lỗi ngay lập tức nếu vi phạm bước giá hoặc giá trị tối thiểu, tương ứng với mã lỗi backend.
    - **Phí giao dịch:** Tính phí **ước tính** = `feeRate` × Giá trị lệnh (Mua: phí tính bằng coin nhận; Bán: tính bằng USDT). Luôn gắn nhãn rõ ràng là *"Phí ước tính"*. Phí thực tế chính xác sẽ trích xuất từ mảng `fills[].fee` trong kết quả trả về của API.
    - **Chống gửi trùng lệnh (Idempotency):** Tạo `clientOrderId` ngẫu nhiên (UUID không gạch nối, ví dụ `crypto.randomUUID().replaceAll('-', '')`) cho mỗi lần bấm nút. Khi người dùng click đúp hoặc lag mạng, nếu server trả về `DUPLICATE_CLIENT_ORDER_ID` thì hiểu rằng lệnh đã được tiếp nhận an toàn.
    - **Vô hiệu hóa nút đặt lệnh (Disabled State):** Tự động vô hiệu hóa khi: Chưa đăng nhập, chưa xác minh email, cặp tiền bị tắt (`enabled = false`), dữ liệu giá là `STALE` hoặc `UNAVAILABLE`, hoặc sàn đang dừng (`tradingHalted = true`).
  - **Bố cục Responsive:**
    - Mobile: Chia thành các tab rõ ràng (Biểu đồ / Sổ lệnh / Giao dịch gần đây / Lệnh của tôi). Nút Mua/Bán cố định dưới đáy mở form đặt lệnh qua `BottomSheet`.
    - Desktop: Bố cục đa cột chuẩn chuyên nghiệp (Cột trái: Biểu đồ & Lệnh; Cột giữa: Sổ lệnh & Khớp lệnh; Cột phải: Form đặt lệnh).

---

### Mốc 6: Ví và Nạp tiền ảo (`/wallet`)
*Quản lý tài sản mô phỏng, nạp coin ảo (Faucet) và theo dõi lịch sử biến động số dư.*

- **API sử dụng:**
  - `api.balances()` — Danh sách số dư từng tài sản (khả dụng `free`, đang khóa `locked`, tổng `total`, quy đổi USDT `valueUsdt`, tổng tài sản `totalValueUsdt`, mảng `unpricedAssets`).
  - `api.faucetStatus()` — Thông tin nạp tiền ảo: số tiền mỗi lần nạp, tổng đã nạp / trần tối đa (100.000 USDT), thời điểm có thể nạp tiếp `nextAvailableAt`.
  - `api.faucetClaim()` — Thực hiện nhận tiền ảo vào ví (yêu cầu tài khoản đã xác minh email).
  - `api.ledger({ query })` — Sổ cái lịch sử biến động số dư, lọc theo tài sản, phân trang bằng con trỏ `cursor`.
- **Kênh realtime:**
  - `user` — Lắng nghe sự kiện `kind: 'balance'`.
- **Chi tiết thực hiện:**
  - **Bảng số dư tài sản:**
    - Hiển thị danh sách các đồng coin: Khả dụng, Đang khóa trong lệnh chờ, Tổng số lượng, Giá trị quy ra USDT.
    - Tổng giá trị tài sản hiển thị bằng trường `totalValueUsdt` do API trả về.
    - Nếu danh sách `unpricedAssets` có phần tử (ví dụ: LINK tạm thời mất giá), bắt buộc hiển thị ghi chú cảnh báo: *"Chưa tính: LINK (không có giá thị trường)"*.
    - Tài sản có `valueUsdt = null` hiển thị là `"——"`.
  - **Cơ chế cập nhật số dư:** Khi nhận được sự kiện realtime `kind: 'balance'`, cập nhật tạm thời số dư dòng tài sản đó trên bảng, đồng thời kích hoạt gọi lại `api.balances()` (áp dụng debounce khoảng 1 giây) để lấy lại tổng tài sản chính xác từ server. **Tuyệt đối không tự cộng dồn tổng tài sản trên client.**
  - **Khu vực Nạp tiền ảo (Testnet Faucet):**
    - Hiển thị hạn mức nạp, tiến độ đã nạp so với trần tối đa.
    - Nút "Nạp tiền ảo": Tự động đếm ngược thời gian nếu đang trong thời gian chờ (`nextAvailableAt`).
    - Xử lý các mã lỗi cụ thể: `FAUCET_COOLDOWN` (hiển thị thời gian còn lại), `FAUCET_CAP_REACHED` (đã chạm trần 100.000 USDT trọn đời), `EMAIL_NOT_VERIFIED` (nhắc xác minh email).
  - **Sổ cái biến động tài sản (Ledger History):**
    - Bộ lọc theo đồng coin và loại biến động.
    - Mặc định ẩn 2 loại biến động tạm thời: `ORDER_LOCK` (khóa tiền khi đặt lệnh) và `ORDER_UNLOCK` (mở khóa khi hủy lệnh), cung cấp công tắc bật/tắt nếu người dùng muốn xem chi tiết.
    - Việt hóa đầy đủ 8 loại biến động nghiệp vụ:
      - `FAUCET`: Nạp tiền ảo thử nghiệm
      - `ORDER_LOCK`: Tạm khóa tiền đặt lệnh
      - `ORDER_UNLOCK`: Hoàn trả tiền hủy lệnh
      - `TRADE_DEBIT`: Khấu trừ khớp lệnh mua/bán
      - `TRADE_CREDIT`: Nhận tiền khớp lệnh mua/bán
      - `FEE`: Khấu trừ phí giao dịch
      - `ADMIN_ADJUST`: Quản trị viên điều chỉnh
      - `ACCOUNT_RESET`: Đặt lại tài khoản

---

### Mốc 7: Cài đặt phiên đăng nhập & Tài khoản
*Quản lý bảo mật tài khoản, phiên làm việc và cá nhân hóa giao diện.*

- **API sử dụng:**
  - `api.me()` — Thông tin tài khoản người dùng (id, email, tên, vai trò, trạng thái xác minh).
  - `api.changePassword({ body })` — Đổi mật khẩu (tự động vô hiệu hóa phiên ở các thiết bị khác).
  - `api.listSessions()` — Danh sách các phiên đăng nhập và thiết bị đang hoạt động.
  - `api.revokeSession({ params })` — Thu hồi / đăng xuất một phiên thiết bị từ xa.
- **Kênh realtime:** **Không có (N/A)**.
- **Chi tiết thực hiện:**
  - **Quản lý phiên & Thiết bị:**
    - Hiển thị danh sách phiên: Thiết bị/Trình duyệt, Địa chỉ IP, Thời gian đăng nhập gần nhất.
    - Đánh dấu rõ ràng huy hiệu *"Phiên hiện tại"* trên thiết bị đang sử dụng.
    - Cung cấp nút *"Đăng xuất thiết bị này"* cho các phiên khác (gọi `api.revokeSession`).
  - **Bảo mật:** Form đổi mật khẩu với xác thực mật khẩu cũ và yêu cầu mật khẩu mới an toàn.
  - **Cá nhân hóa giao diện:**
    - Chuyển đổi giao diện Sáng / Tối (Dark / Light mode).
    - Tùy chọn đảo màu nến/thị trường (Xanh tăng - Đỏ giảm hoặc Đỏ tăng - Xanh giảm).
    - Lựa chọn ngôn ngữ hiển thị (Tiếng Việt / English).
    - *Lưu ý:* Các tùy chọn hiển thị cá nhân này được phép lưu trữ trong `localStorage`.

---

## 4. Bảng tổng hợp API & Kênh Realtime theo 7 mốc

| Mốc | Tên mốc | API Endpoints sử dụng | Kênh Realtime sử dụng |
|:---:|---|---|---|
| **1** | Bộ component giao diện (`@cex/ui`) | *Không có (N/A)* | *Không có (N/A)* |
| **2** | Khung ứng dụng (App Shell) | `me`, `exchangeInfo`, `resendVerification` | `market:status`, `rt.onStatus` |
| **3** | Đăng nhập / Đăng ký (Xác thực) | `register`, `login`, `logout`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword` | *Không có (N/A)* |
| **4** | Thị trường (`/markets`) | `exchangeInfo`, `tickers` | `ticker:<SYMBOL>`, `market:status` |
| **5** | Trang giao dịch (`/trade/:symbol`) | `exchangeInfo`, `candles`, `depth`, `marketTrades`, `placeOrder`, `cancelOrder`, `cancelAllOrders`, `openOrders`, `orderHistory`, `myTrades`, `balances` | `candles:<SYMBOL>:<interval>`, `depth:<SYMBOL>`, `trades:<SYMBOL>`, `ticker:<SYMBOL>`, `user` (`order`, `trade`, `balance`), `market:status` |
| **6** | Ví & Nạp tiền ảo (`/wallet`) | `balances`, `faucetStatus`, `faucetClaim`, `ledger` | `user` (`balance`) |
| **7** | Cài đặt phiên đăng nhập & Tài khoản | `me`, `changePassword`, `listSessions`, `revokeSession` | *Không có (N/A)* |

---

## 5. Các quy tắc bắt buộc (TUYỆT ĐỐI TUÂN THỦ)

1. **Tiền tệ và số học luôn là CHUỖI:**
   - Mọi giá trị liên quan đến tiền tệ, đơn giá, khối lượng, số dư đều là chuỗi số thập phân (`string`).
   - Tuyệt đối không dùng `Number()`, `parseFloat()` hay toán tử số học JavaScript (`+`, `-`, `*`, `/`) để tính toán hoặc hiển thị tiền tệ (ngoại lệ duy nhất: chuyển sang số tọa độ phục vụ render biểu đồ nến).
   - Mọi phép tính chia tỷ lệ 25/50/75/100%, làm tròn bước giá (`tickSize`), bước khối lượng (`stepSize`) bắt buộc phải gọi qua thư viện **`@cex/core`** (`dec`, `floorToStep`, `roundDown`, `checkPrice`, `checkQuantity`, `checkNotional`), không dùng số JavaScript.
2. **Dữ liệu `null` hiển thị là “—”, KHÔNG BAO GIỜ hiển thị thành `0`:**
   - Khi dữ liệu API trả về `null` hoặc `undefined` (do chưa có dữ liệu, cặp tiền bị tắt, hoặc giá không khả dụng), giao diện bắt buộc hiển thị ký tự gạch ngang dài `"—"`.
   - Tuyệt đối không fallback về `0` hoặc `"0.00"`.
3. **Không tự tính số dư hay tổng tài sản:**
   - Chỉ hiển thị đúng các giá trị do API trả về (`free`, `locked`, `total`, `totalValueUsdt`).
   - Khi nhận sự kiện realtime thay đổi số dư, chỉ cập nhật dòng tài sản nhận được và kích hoạt debounce gọi lại API `balances` để lấy tổng tài sản mới từ backend.
4. **Mỗi màn hình phải có đầy đủ 5 trạng thái:**
   - **Đang tải (Loading):** Sử dụng `Skeleton` phù hợp với cấu trúc màn hình, không để màn hình trắng hoặc giật layout.
   - **Trống (Empty):** Hiển thị `EmptyState` với thông điệp rõ ràng khi không có dữ liệu (chưa có lệnh nào, lịch sử trống...).
   - **Lỗi (Error):** Hiển thị `ErrorState` kèm thông báo lỗi đã dịch sang tiếng Việt và nút "Thử lại".
   - **Mất kết nối (Disconnected):** Hiển thị banner/badge cảnh báo mất kết nối realtime ngay khi WebSocket chuyển sang trạng thái `connecting` hoặc `closed`.
   - **Dữ liệu giá cũ (Stale / Unavailable):** Hiển thị nhãn cảnh báo `STALE` hoặc `"——"` khi dữ liệu thị trường bị trễ quá ngưỡng hoặc không có nguồn giá từ Binance.
5. **Gọi API và Realtime chuẩn hóa:**
   - Gọi API duy nhất thông qua `createApiClient` của `@cex/contracts`. Tuyệt đối không dùng `fetch` hay `axios` tự do.
   - Kết nối Realtime duy nhất thông qua `createRealtimeClient` hoặc `createMockRealtimeClient` của `@cex/contracts`.
6. **Bảo mật và Phân quyền:**
   - Không lưu trữ phiên/token trong `localStorage`.
   - Không chứa bất kỳ API key hay secret nào ở mã nguồn frontend.
   - Việc ẩn/vô hiệu nút bấm chỉ mang tính chất hướng dẫn người dùng; server luôn là nơi xác thực cuối cùng, UI phải luôn sẵn sàng xử lý các mã lỗi do server trả về.
7. **Trung thực trong báo cáo tiến độ:**
   - Không được báo "hoàn thành" hay "PASSED" nếu chưa chạy lệnh thực tế và kiểm chứng bằng mắt trên trình duyệt. Mọi kết luận phải kèm theo lệnh đã thực thi và kết quả xác thực.

---

## 6. Quy trình nghiệm thu (Acceptance Process)

Quy trình nghiệm thu gồm 2 bước tuần tự bắt buộc:

### Bước 1: Nghiệm thu hoàn chỉnh với Dữ liệu giả (Mock Mode)
Khởi động ứng dụng với chế độ Mock: `VITE_USE_MOCKS=true`. Sử dụng Dev Toolbar gọi `setMockScenario(...)` để kiểm tra toàn diện **6 kịch bản**:

1. **Kịch bản `normal`:**
   - Dữ liệu demo đầy đủ 10 cặp tiền.
   - Kiểm tra hiển thị đặc biệt: Cặp `AVAXUSDT` hiển thị trạng thái **STALE** (cảnh báo giá cũ), cặp `LINKUSDT` hiển thị **UNAVAILABLE** (mọi giá trị là `"—"`), cặp `SUIUSDT` bị tắt (`enabled = false`, nhãn "Tạm ngưng", không thể đặt lệnh).
   - Thực hiện đầy đủ luồng người dùng: Đăng ký → Xác minh email → Nạp tiền Faucet → Đặt lệnh Mua Market → Đặt lệnh Mua Limit → Hủy lệnh → Kiểm tra Ví và Sổ cái.
2. **Kịch bản `empty`:** Kiểm tra giao diện trạng thái Trống (`EmptyState`) tại danh sách lệnh chờ, lịch sử lệnh, lịch sử khớp và sổ cái.
3. **Kịch bản `error`:** Kiểm tra giao diện trạng thái Lỗi (`ErrorState`) khi toàn bộ API trả về mã lỗi 500 kèm nút "Thử lại".
4. **Kịch bản `halted`:** Kiểm tra Banner dừng giao dịch toàn sàn xuất hiện; form đặt lệnh bị vô hiệu hóa hoặc khi gửi lệnh trả về lỗi `TRADING_HALTED`.
5. **Kịch bản `signedOut`:** Kiểm tra khi chưa có phiên đăng nhập, hệ thống xử lý lỗi 401 `UNAUTHENTICATED` và điều hướng về trang `/login`.
6. **Kịch bản `unverified`:** Kiểm tra tài khoản chưa xác minh email: hiển thị thanh thông báo nhắc nhở, chặn thao tác Nạp tiền Faucet và Đặt lệnh với mã lỗi `EMAIL_NOT_VERIFIED`.
7. **Kiểm tra mất kết nối Realtime:** Sử dụng `createMockRealtimeClient({ dropEveryMs: 15000 })` để xác nhận Banner mất kết nối hiển thị và tự động ẩn khi kết nối lại thành công.
8. **Kiểm tra giao diện:** Xác nhận hiển thị hoàn hảo ở cả kích thước mobile **360px** và màn hình **desktop**, trên cả 2 theme **Sáng và Tối**.

### Bước 2: Nghiệm thu kết nối Backend thật (Real Backend Mode)
Tắt chế độ mock bằng cách đặt `VITE_USE_MOCKS=false` trong `.env.development`.

Khởi động các dịch vụ backend:
```bash
# Terminal 1: Khởi động cơ sở dữ liệu PostgreSQL
npm run db:start

# Terminal 2: Khởi động Server Backend API (cổng 8080)
# (Lưu ý: Link xác minh email và OTP sẽ được in trực tiếp trong log của terminal này)
npm run dev:server

# Terminal 3: Khởi động Ứng dụng Giao diện Web (cổng 5173)
npm run dev -w @cex/exchange-web
```

Thực hiện kiểm thử luồng thực tế (End-to-End):
- Đăng ký tài khoản mới → Lấy link xác minh từ log server và mở trên trình duyệt → Xác minh thành công.
- Vào trang Ví → Nhận 10.000 USDT tiền ảo từ Faucet → Số dư tăng ngay lập tức.
- Vào trang Giao dịch với dữ liệu giá Binance thật:
  - Đặt lệnh Market Mua BTC → Lệnh khớp ngay lập tức, toast thông báo khớp lệnh, số dư BTC và USDT cập nhật realtime.
  - Đặt lệnh Limit Mua BTC ở mức giá sát thị trường → Lệnh xuất hiện trong tab "Lệnh đang chờ" → Khi giá thị trường chạm mức, lệnh tự động khớp, biến mất khỏi lệnh chờ, xuất hiện trong lịch sử khớp và số dư cập nhật tức thì.

### Kiểm tra build production:
- Chạy kiểm tra kiểu dữ liệu: `npx tsc -p apps/exchange` (phải đạt 0 lỗi).
- Chạy build ứng dụng: `npm run build -w @cex/exchange-web` (thành công).
- Kiểm tra thư mục `dist`: Đảm bảo **tuyệt đối không** chứa mã nguồn MSW hoặc mock handler (`mockServiceWorker`, `createMockHandlers`).

---

## 7. Yêu cầu Viết Báo Cáo

Sau khi hoàn thành và nghiệm thu, Antigravity phải tạo file báo cáo kết quả chi tiết đặt tại:
**`docs/reports/<YYYY-MM-DD>-ui-gd1.md`**

Nội dung báo cáo bắt buộc bao gồm:
1. **Tổng hợp công việc:** Danh sách chi tiết các màn hình và component đã xây dựng qua 7 mốc.
2. **Minh chứng nghiệm thu:**
   - Liệt kê các lệnh kiểm tra đã chạy và kết quả đầu ra (`tsc`, `npm run build`, các bài test...).
   - Ảnh chụp màn hình nghiệm thu thực tế 5 trạng thái và 6 kịch bản mock (ảnh lưu tại `docs/reports/img/`).
   - Kết quả kiểm thử luồng thực tế với backend thật.
3. **Checklist tiến độ:** Cập nhật các ô đánh dấu `[x]` trong `docs/parts/P07-design-system.md` và `docs/parts/P08-ui-san.md` cho những hạng mục đã kiểm thử đạt yêu cầu.
4. **Vấn đề tồn đọng & Đề xuất:** Liệt kê những phần chưa hoàn thành (nếu có) và các yêu cầu bổ sung/thay đổi API đã ghi vào `docs/parts/contract-requests.md`.

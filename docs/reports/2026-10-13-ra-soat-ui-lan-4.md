# Rà soát giao diện lần 4 — 2026-10-13 (UI `a225402`)

> Đọc cùng [lần 3](2026-10-12-ra-soat-ui-lan-3.md). Mã mới lần này: **L-01…L-06** (A, B, C, H, O, U, W, R, N, K đã dùng).
> Sửa xong ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` ngay dưới mục.

## Kết luận
**Gộp được vào `main`.** Không còn P0/P1, cả hai cổng xanh trên bản gộp cuối (UI `a225402` + main `bbe2a53`):
- `npm run ui-check` (verify): typecheck mọi workspace đạt, lint 0 lỗi (166 cảnh báo UI), **232/232 test**, build cả hai app;
- `npm run ui-check -- --no-verify --e2e`: **39 đạt, 1 bỏ qua, 0 đỏ** (2,3 phút).
  - Test bỏ qua là bản desktop của test chỉ dành cho điện thoại (N-06), cố ý.

Các mục còn lại L-01…L-05 là P3, làm sau được. Gộp và `npm run host -- update` là việc của chủ dự án.

## 0. Bối cảnh và cách kiểm

| Hạng mục | Giá trị |
|---|---|
| Bản rà soát | `ui/gd2-exchange @ a225402` ("remediate K-01..K-08 + PROMPT-12"), sau lần gộp `main` `68bfb91` |
| `main` | `bbe2a53` (gồm test nghiệm thu mới và bản sửa keep-alive của Claude Code, xem mục 3 — L-06) |
| Sàn thật (:8090), `npm run dev` | đều **tắt** trong lúc chạy test (không có cảnh báo máy bận) |
| Phạm vi file | chỉ `apps/exchange/**` và `docs/**` (trạng thái, TESTIDS). Không đụng `e2e/`, `server/`, `packages/contracts` |

### Các lần chạy (nguyên văn)
| # | Lệnh | Bản gộp | Kết quả |
|---|---|---|---|
| 1 | `ui-check -- --e2e` | `a225402` + `ca189d0` | verify đạt (230/230); e2e 34 đạt, **2 đỏ**: `email-gate` test 2 (**lỗi test** — xem dưới), `bots.spec` Bot lưới (`grid-bot-card` 0 sau 15 s) |
| 2 | `ui-check -- --no-verify --only bots email-gate chart-orders trade-form --project=desktop --project=mobile` | `a225402` + `6f6af79` | **11 đạt**, 1 bỏ qua |
| 3 | `ui-check -- --no-verify --e2e` | `a225402` + `6f6af79` | 38 đạt, **1 đỏ**: `bots.spec` Bot lưới — `GET /api/v1/bots/grid → read ECONNRESET` (L-06) |
| 4 | `ui-check -- --no-verify --e2e` | `a225402` + `bbe2a53` (đã sửa L-06) | **39 đạt, 0 đỏ** |
| 5 | `ui-check` (verify) | `a225402` + `bbe2a53` | **232/232**, verify đạt |

**Test sai, đã sửa (Claude Code, `6f6af79`):** `email-gate.spec.ts` tìm nút gửi lại bằng `/xác minh email/i` nên bấm nhầm nút xám "Vui lòng xác minh email trước khi nạp" (disabled).
Đã đổi thành nút **bấm được** có chữ "Gửi (lại) link/email (xác minh)". Điều test kiểm không đổi.

## 1. Kiểm lại mục lần 3

| Mã | Kết quả | Bằng chứng |
|---|---|---|
| K-01 cổng xác minh email | ✅ e2e | `email-gate.spec` 2/2: hệ có bắt xác minh → Tài sản và form lệnh có nút gửi lại, không có nút "Nạp ngay"/"MUA BTC" bấm được; gửi lại → `POST /auth/resend-verification` 2xx; xác minh ở tab khác → tab gốc tự mở khóa, nạp được 10.000 USDT. Hệ host-mode (không bắt): `host-mode/invite-signup.spec` xanh. Đọc mã: mọi chỗ khóa theo `publicConfig?.emailVerificationRequired === true` (`OrderForm.tsx:665`, `WalletPage.tsx`, `Header.tsx`, `SettingsPage.tsx`) |
| K-02 màn đăng ký | ✅ e2e | `spot.spec`, `host-mode/invite-signup.spec` xanh (vào `/trade/` ngay); toast theo cấu hình (`AuthPages.tsx`) |
| K-03 tổng giá trị / xóa ô giá | ✅ e2e | `trade-form.spec` "đổi giá…": 0,01 × 80.000 = `800`; xóa ô giá → giữ trống sau 1,5 s |
| K-04 nháy "Yêu cầu đăng nhập" | ✅ đọc mã | `isLoading` → skeleton ở Wallet, Settings, Bots, Portfolio, PnL |
| K-05 `0,0000` | ✅ đọc mã | `Orderbook.tsx`, `MarketTrades.tsx` dùng `formatAmount(qty, stepSize)` / `formatPrice(price, tickSize)` |
| K-06 + PROMPT-12 | ✅ e2e | `chart-orders.spec` 3/3 (mục 2) |
| K-07 số thô trong thông báo | ✅ đọc mã | `UserOrdersTabs.tsx` ("Khớp lệnh Mua: 0,01384 BTC @ 82.932,29"), `NotificationCenter.tsx`, `OrderForm.tsx` (`formatPrice`, phí trống `—`). Còn `%` ở sổ lệnh → L-04 |
| K-08 gọi `/me` khi focus | ✅ đọc mã | `AuthContext.tsx`: chỉ khi `emailVerificationRequired`; lỗi không phải 401 giữ nguyên `user` |
| K-09.1 ghi trạng thái | ◐ | có ghi, nhưng commit ghi là `0a8f95b` — commit này **không nằm trên nhánh** (bản trước khi amend); commit thật `a225402`. Chỉ ghi "vitest 230/230", không ghi `ui-check --e2e` → L-05 |
| K-10 đỏ giả khi máy bận | ✅ Claude Code | `infra/e2e.mjs` cảnh báo khi :8080/:5173 đang chạy (`290beab`) |
| N-04, N-05, N-06 | ✅ e2e | `trade-form.spec` (desktop + mobile) |
| R-16 `onClose`, N-13 `emailDelivery` | ❌ UI chưa dùng | → L-01 |

## 2. PROMPT-12 — lệnh và điểm khớp trên chart

Test nghiệm thu `e2e/tests/chart-orders.spec.ts` (Claude Code, `6f6af79`) — **3/3 đạt**:
1. Đặt Limit Mua ở 80% giá (qua API, server đẩy sự kiện `order`) → `chart-order-line` có `data-order-id`, `data-side=BUY`, `data-price` = giá đặt **trong 5 s, không tải lại**; hủy → biến mất trong 5 s.
2. Mua Market 100 USDT → `chart-fill-marker` BUY trong 5 s, `data-price` = giá TB khớp (Σ quoteQty / Σ quantity, làm tròn xuống theo tick, so với `GET /api/v1/trades`), `data-count` = số lần khớp; tải lại → còn; đổi 1h → `data-time` = mốc mở nến 1h chứa lúc khớp; bán hết → thêm marker SELL đúng giá; nút "Lệnh của tôi" (`aria-pressed`) ẩn rồi hiện lại cả 2 marker.
3. Chưa đăng nhập → không có nút, không có đường, không có marker.

Đọc mã (`CandlestickChart.tsx`):
- `createSeriesMarkers(…, { autoScale: false })` tạo một lần; marker `atPriceBottom`/`atPriceTop` đúng giá khớp (`:704-719`);
- gộp theo nến + chiều bằng `Dec` (`:621-687`);
- đăng ký `user` có hàm hủy (`:474-506`); đồng bộ lại khi realtime nối lại và khi focus (`:508-529`);
- nhãn ↑/↓ cho lệnh ngoài khung giá; tối đa 20 đường gần giá nhất;
- futures không còn vẽ ở giá 0 (`price: fo.price || null`).

**Chưa kiểm bằng mắt:** canvas trong khung trình duyệt của app quá nhỏ để nhìn ký hiệu. Chủ dự án nên tự nhìn một lần trên `npm run dev` (đặt một lệnh Limit, mua Market nhỏ).

## 3. Lỗi mới

| Mã | Mức | Phụ trách | Vấn đề |
|---|---|---|---|
| L-01 | P3 | Antigravity | Chưa dùng `RealtimeClient.onClose` (vẫn ép kiểu) và `publicConfig.emailDelivery` (toast "Đã gửi lại email xác minh" cả khi server chỉ ghi log) |
| L-02 | P3 | Antigravity | Logic "gửi lại email xác minh" + đếm ngược chép 4 nơi |
| L-03 | P3 | Antigravity | Chart chỉ tải 1.000 lần khớp mới nhất, không theo nến cũ khi kéo về quá khứ |
| L-04 | P3 | Antigravity | Sổ lệnh: `%` spread và tỷ lệ mua/bán dùng `toFixed` (dấu chấm) |
| L-05 | P3 | Antigravity | Trạng thái ghi commit không có trên nhánh (`0a8f95b`), thiếu kết quả `ui-check --e2e`; chưa thêm `data-testid` cho ô giá/khối lượng/tổng |
| L-06 | P1 (đã sửa) | Claude Code | Server đóng kết nối keep-alive sau 5 s (mặc định Node) → `ECONNRESET` trong e2e; trên sàn thật sau cloudflared có thể ra lỗi 502 ngẫu nhiên |

### L-01 — Chưa dùng `onClose` và `emailDelivery` (P3)
- **File:**
  - `apps/exchange/src/context/AuthContext.tsx:121-123` (`rt as unknown as { onClose?… }`);
  - toast "Đã gửi lại email xác minh." ở `Header.tsx`, `WalletPage.tsx`, `OrderForm.tsx`, `SettingsPage.tsx`.
- **Cách xảy ra:** contracts 0.12.0 đã có cả hai (bảng "Backend → UI" trong `docs/LOI-HIEN-TAI.md`).
  - Hiện tại vẫn chạy vì đoạn dò `typeof onClose === 'function'` giờ luôn đúng.
  - Nhưng khi server chỉ ghi log (`emailDelivery: 'log'`), người dùng vẫn được báo "đã gửi" mà không có email nào tới.
- **Cách sửa an toàn:**
  - `rt.onClose(({ code }) => { if (code === WS_SESSION_ENDED) … })`, bỏ ép kiểu;
  - toast khi `'log'`: "Máy chủ này chưa gửi email thật — liên hệ quản trị viên để lấy link xác minh".
- **Nghiệm thu:** typecheck không còn `as unknown as` ở đó. Trên hệ e2e mặc định (`emailDelivery: 'log'`), bấm gửi lại → toast nói rõ chưa gửi email thật.
- **Đánh dấu R-16, N-13 xong** ở `docs/parts/contract-requests.md`.

### L-02 — Logic gửi lại email chép 4 nơi (P3)
- **File:** `Header.tsx`, `WalletPage.tsx`, `OrderForm.tsx`, `SettingsPage.tsx`. Mỗi nơi có `resending` + cooldown 60 s riêng, nên bấm ở Ví rồi bấm ở form lệnh gửi được 2 thư.
- **Cách sửa an toàn:** một hook `useResendVerification()` (trong `AuthContext` hoặc `hooks/`), dùng chung một bộ đếm; đặt luôn xử lý `emailDelivery` (L-01) ở đây.
- **Nghiệm thu:** bấm gửi lại ở Ví → nút ở form lệnh cũng hiện đang đếm ngược.

### L-03 — Ký hiệu khớp chỉ cho 1.000 lần khớp gần nhất (P3)
- **File:** `CandlestickChart.tsx:430-449` (`myTrades` không có `from`, tối đa 5 trang).
- **Cách xảy ra:** tài khoản giao dịch nhiều (bot lưới) có hơn 1.000 lần khớp. Kéo chart về quá khứ thì không thấy B/S cũ, không có thông báo.
- **Cách sửa an toàn:** khi chart tải thêm nến cũ, gọi `myTrades({ symbol, from, to })` cho khoảng đó (PROMPT-12 mục B1) và gộp vào danh sách (bỏ trùng theo `id`).
- **Nghiệm thu:** (thủ công) bot lưới chạy lâu → kéo về ngày trước vẫn thấy B/S.

### L-04 — `%` trong sổ lệnh dùng dấu chấm (P3)
- **File:** `Orderbook.tsx:315` (`spreadPct.toFixed(2)`), `:349` (`ratioBid.toFixed(1)`).
- **Cách sửa:** `formatDecimal(String(x), { decimals: 2 })`.

### L-05 — Ghi trạng thái và testid (P3)
- Báo cáo ghi `0a8f95b` cho K-01…K-08, nhưng commit đó **không có trên nhánh** (`git branch --contains 0a8f95b` rỗng); commit thật là `a225402`. Ghi kết quả `npm run ui-check -- --e2e`, không chỉ vitest.
- Bảng "Backend → UI" xin `data-testid` `order-price`, `order-quantity`, `order-total` cho form lệnh. Chưa có, nên `trade-form.spec` vẫn tìm theo thứ tự ô nhập. Thêm vào `OrderForm.tsx` và `docs/antigravity/TESTIDS.md`.

### L-06 — Keep-alive 5 s → `ECONNRESET` / 502 (P1, **đã sửa** — Claude Code `bbe2a53`)
- **Bằng chứng:** lần chạy 3 — `apiRequestContext.get: read ECONNRESET` khi test gọi `GET /api/v1/bots/grid`. Log server không có lỗi; server vẫn sống tới cuối.
- **Cách xảy ra:**
  - `server/src/main.ts` dùng `http.createServer` mặc định nên kết nối rảnh bị đóng sau 5 s.
  - Client gửi request trên kết nối đang bị đóng thì nhận reset.
  - Trên sàn thật, cloudflared giữ kết nối rảnh tới server tới 90 s, nên cùng hiện tượng sẽ thành lỗi 502 ngẫu nhiên cho người dùng.
- **Sửa:**
  - `server/src/lib/httpServer.ts` `createHttpServer()`: `keepAliveTimeout` 120 s, `headersTimeout` 121 s;
  - test `server/src/lib/httpServer.test.ts`: kết nối rảnh 5,5 s vẫn phục vụ request tiếp theo;
  - **Trạng thái:** Đã sửa (`bbe2a53`). `npm test` 224/224 trên main; lần chạy 4: e2e 39/39.
- **Áp dụng cho sàn thật:** cần `npm run host -- update` (chủ dự án quyết lúc nào).

## 4. Thứ tự đề xuất
1. **Chủ dự án:**
   - gộp `ui/gd2-exchange` vào `main` (cổng xanh);
   - `npm run host -- update` để sàn thật có cả bản UI mới và bản sửa L-06;
   - nhìn chart một lần để xác nhận ký hiệu B/S hiện đúng mắt.
2. **Antigravity:** L-01, L-02 (làm cùng nhau), L-05, L-04, L-03.
3. **Claude Code:** sau khi có `data-testid` (L-05) thì đổi `trade-form.spec` sang dùng chúng.

## 5. Ghi chú
- Không kiểm bằng mắt: ký hiệu B/S và đường lệnh trên canvas (đã kiểm bằng danh sách ẩn + e2e); skeleton K-04 (chỉ đọc mã).
- Lần chạy 1 có `bots.spec` đỏ với triệu chứng khác (`grid-bot-card` = 0 sau 15 s). Nhiều khả năng cùng nguyên nhân L-06 (request của trang bị reset). Sau bản sửa, lần chạy trọn bộ (lần 4) xanh. Nếu tái diễn, mở lại thành mục mới.

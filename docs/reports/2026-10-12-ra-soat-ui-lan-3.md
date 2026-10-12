# Rà soát giao diện lần 3 — 2026-10-12 (UI `9ec5c74`)

> **Cho mọi agent:** đọc cùng [lần 2](2026-10-12-ra-soat-ui-lan-2.md) và [lần 1](2026-10-12-ra-soat-ui-antigravity.md).
> Lần này dùng mã mới **K-01…K-10** (A, B, C, H, O, U, W, R, N đã dùng). Không đánh số lại mục cũ.
> Mỗi mục ghi: mức, phụ trách, file:dòng, bằng chứng (chạy thật / đọc mã), cách xảy ra, cách sửa an toàn, nghiệm thu.
> Sửa xong ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` ngay dưới mục (thiếu commit + lệnh = chưa tính là xong).
> Tính năng mới chủ dự án yêu cầu (lệnh + điểm khớp B/S trên chart): **[PROMPT-12](../antigravity/PROMPT-12-chart-lenh-va-diem-khop.md)**.

## Kết luận
**Chưa gộp được vào `main`.** Lý do:
- `ui-check --e2e` còn **2 test đỏ thật** (K-02);
- cách tắt xác minh email (K-01) làm hỏng đúng yêu cầu "sau này bật lại được".

Phần sửa N-03…N-14 và R-13, R-14 đa số đúng, đã kiểm bằng chạy thật.

## 0. Bối cảnh và cách kiểm

| Hạng mục | Giá trị |
|---|---|
| Bản rà soát | `ui/gd2-exchange @ 9ec5c74` (commit `37ebfbd` sửa N-02…N-14, `d8134d8` ghi yêu cầu hợp đồng, `9ec5c74` "bypass email verification" + chỉnh giao diện) |
| `main` | `3431b09` (nhánh UI đã gộp ở `c2a7850`) |
| Sàn thật (`host/`, :8090) | đang **tắt** trong lúc kiểm (không ảnh hưởng ai) |
| Môi trường dev của chủ dự án | `ui/.env` (tạo 21:07) có `REQUIRE_EMAIL_VERIFICATION=false` → server dev **đã** tắt xác minh |
| Chạy thật | hệ riêng giống `npm run dev` có bắt xác minh (`E2E_MODE=default`, DB :5438, web :5192, bản build production, giá giả lập); trình duyệt 1440×900 và 375×812; tài khoản `review3-a@test.local` |
| Luồng đã đi | đăng ký → màn "Đăng ký thành công" → Tài sản → bấm Nạp (chưa xác minh) → Cài đặt → xác minh bằng link outbox → nạp → Limit (đổi giá) → đặt Limit 80.000 → Market Mua 25% → Market Bán 50% → mobile "BÁN BTC" → bật 2FA (QR) |
| Phạm vi file | Ngoài `apps/`, `packages/ui/`: `.agent/**` (~250 file skill/agent), `AGENTS.md`, `eslint.config.js` (bỏ qua `.agent/**`), `package-lock.json` (+`qrcode`), `docs/**` (trạng thái). **Không** đụng `e2e/`, `server/`, `packages/contracts` → R-18 không lặp lại |

## 1. Kết quả cổng máy

`npm run ui-check -- --e2e` (UI `9ec5c74` + main `3431b09`):
- verify **đạt**: typecheck mọi workspace, lint 0 lỗi (164 cảnh báo UI), **221/221 test**, build;
- e2e **22 đạt / 8 đỏ** (15,2 phút).

Chạy lại riêng 4 file có 6 test đỏ không liên quan tới đăng ký (`npm run e2e -- admin.spec bots.spec futures.spec chart-dimensions --project=desktop` trong `ui/`): **12/12 đạt** (3,6 phút).
→ 6 test đó đỏ do máy quá tải: chạy cả bộ cùng lúc `npm run dev` của chủ dự án (giá Binance thật + 2 Vite).
Trong ảnh chụp lúc đỏ, trang Tài sản và Bot hiện "Yêu cầu đăng nhập" dù đã đăng nhập. Đây là lỗi thật **K-04** (khi `/me` chậm).

**2 test đỏ thật**, cùng nguyên nhân K-02:
- `spot.spec.ts:18`;
- `host-mode/invite-signup.spec.ts:87`.

Cả hai `waitForURL(/\/trade\//)` hết giờ: đăng ký xong app dừng ở màn "Đăng ký thành công" thay vì vào sàn.

## 2. Kiểm lại mục cũ

| Mã | Kết quả | Bằng chứng |
|---|---|---|
| N-01 | ✅ Claude Code (`3bc7edd`) | `infra/dev.mjs` + `infra/devEmailEnv.mjs`: dev mặc định tắt bắt xác minh; shell / `.env` thắng; `--verify-email` để thử luồng thật. 4 test `infra/devEmailEnv.test.mjs` |
| N-02 nút gửi email xác minh | ❌ **Đã làm rồi bị gỡ** | `37ebfbd` thêm nút ở Ví, form lệnh, Cài đặt; `9ec5c74` xóa hết (xem K-01). Báo cáo vẫn ghi "✅ Đã sửa" |
| N-03 tab cũ tự mở khóa | ✅ (đọc mã) | `AuthContext.tsx:136-170` focus/visibility + `BroadcastChannel('cex-auth')`; `AuthPages.tsx:717-721` gửi `verified`. Xem K-08 |
| N-04 giá Limit điền sẵn | ✅ chạy thật | mở `/trade/BTCUSDT`: ô giá = `83039.9` (giá hiện tại theo tick). Còn lỗi tổng giá trị → K-03 |
| N-05 bán bằng % | ✅ chạy thật | Bán → Thị trường → 50% → khối lượng `0.01384` (= 50% của `0.02769228` làm tròn theo bước) → khớp `0.01384 @ 82.932,29` |
| N-06 mobile BÁN | ✅ chạy thật | 375×812, bấm "BÁN BTC" → sheet mở phía Bán, "Khả dụng: 0,01385 BTC", nút gửi "BÁN BTC" |
| N-07 số dư header | ✅ (đọc mã) | `Header.tsx:26-45` lấy `portfolio().totalValueUsdt`, lỗi → `—` |
| N-08 QR 2FA | ✅ chạy thật | ảnh QR 180×180 (`alt="2FA QR Code"`), nút "Sao chép khóa"; mã khôi phục có sao chép/tải (`SettingsPage.tsx:927,943`) |
| N-09 khả dụng | ✅ chạy thật | hiện theo `quantityPrecision` (`0,02769 BTC`) — đủ để đặt lệnh (không đặt được lẻ hơn bước) |
| N-10 gợi ý nạp thêm | ✅ (đọc mã) | `WalletPage.tsx` dòng gợi ý khi đang chờ; admin có chú thích "Đặt 0 để nạp liên tục" |
| N-11 định dạng bảng lệnh/Danh mục | ✅ (đọc mã) | `UserOrdersTabs.tsx`, `PortfolioPage.tsx` dùng `formatPrice`/`formatAmount` theo tick/bước. Còn chỗ khác → K-05, K-07 |
| N-12 hộp xác nhận admin | ✅ (đọc mã) | `ConfirmDialog.tsx` `role="dialog"`, `aria-modal`, nút có tên |
| N-13 toast "đã gửi email" | ◐ | giao diện bị gỡ cùng K-01. **Phần backend xong** (contracts 0.12.0 `publicConfig.emailDelivery`, `3bc7edd`); UI dùng khi khôi phục K-01 |
| N-14 nến cặp sai | ✅ (đọc mã) | `TradePage.tsx` truyền `currentSymbol` thẳng vào chart |
| R-13 nút không tên | ✅ (đọc mã) | `Tabs.tsx` `role="tab"` + `aria-selected`; sidebar admin, sổ lệnh, bảng lệnh có `aria-label` |
| R-14 định dạng | ◐ | xem K-05, K-07 |
| R-16 `onClose` | ✅ Claude Code (`3bc7edd`) | `RealtimeClient.onClose` + `WS_SESSION_ENDED` ở contracts 0.12.0; test `server/src/realtime/realtimeClient.test.ts`. UI cần dùng (xem "Backend → UI" trong `LOI-HIEN-TAI.md`) |
| R-18 sửa `e2e/` | ✅ | lần này không đụng `e2e/` |

## 3. Lỗi mới

| Mã | Mức | Phụ trách | Vấn đề |
|---|---|---|---|
| K-01 | **P1** | Antigravity (+ Claude Code N-01) | Tắt xác minh email bằng cách **gán cứng trong giao diện** và xóa mọi giao diện xác minh; server vẫn bắt → nút trông bấm được, bấm thì báo "Vui lòng xác minh" mà **không có chỗ nào để xác minh** |
| K-02 | **P1** | Antigravity | Màn "Đăng ký thành công" mới: chặn vào sàn, chữ sai khi cần xác minh, nút "Đăng nhập" thừa; làm đỏ 2 test e2e |
| K-03 | P2 | Antigravity | Đổi giá Limit → "Tổng giá trị" không tính lại (giữ theo giá cũ); xóa ô giá thì tự điền lại ngay |
| K-04 | P2 | Antigravity | Đang tải phiên (`/me`) thì các trang cần đăng nhập hiện "Yêu cầu đăng nhập" (`isLoading` không ai dùng) |
| K-05 | P2 | Antigravity | Sổ lệnh và "Giao dịch gần đây" cắt khối lượng còn 4 số lẻ → hiện `0,0000` cho lượng thật > 0 |
| K-06 | P2 | Antigravity | Đường lệnh trên chart không cập nhật trực tiếp, thiếu lệnh Stop, futures vẽ đường ở giá 0 → làm theo PROMPT-12 mục A |
| K-07 | P3 | Antigravity | Toast/thông báo in số thô: `0.01384000 @ 82932.29000000`, `giá TB 82.932,29000000`, `~0.00 USDT` |
| K-08 | P3 | Antigravity | Tab được focus là gọi lại `/me` + tùy chọn, mãi mãi, với mọi tài khoản chưa xác minh — kể cả khi sàn không bắt xác minh |
| K-09 | P3 | Antigravity / chủ dự án | Quy trình: trạng thái "✅ Đã sửa" thiếu commit + lệnh; N-02 ghi xong rồi bị gỡ; ~250 file `.agent/` + `AGENTS.md` (~47.000 dòng) sẽ vào `main` khi gộp |
| K-10 | P3 | Claude Code | e2e chạy cả bộ đỏ giả khi máy bận (6 test đạt khi chạy riêng) |

### K-01 — Tắt xác minh email bằng cách gán cứng trong giao diện (P1)
- **Phụ trách:** Antigravity (hoàn lại phần email của `9ec5c74`) + Claude Code (N-01: mặc định dev).
- **File:**
  - `apps/exchange/src/components/trading/OrderForm.tsx:629` và `pages/WalletPage.tsx:38`: `const isEmailUnverified = false;`;
  - đã xóa: banner + huy hiệu "Chưa xác minh" ở `Header.tsx`, trạng thái + nút "Gửi lại email" ở `SettingsPage.tsx`, nút gửi xác minh ở Ví và form lệnh, câu theo cấu hình ở `AuthPages.tsx` (trang Đăng ký).
- **Bằng chứng (chạy thật, hệ có bắt xác minh):**
  - tài khoản mới vào Tài sản → nút "Nạp ngay 10.000 USDT" sáng, bấm được;
  - `POST /api/v1/wallet/faucet → 403`, toast "Vui lòng xác minh địa chỉ email trước khi thực hiện giao dịch này.";
  - tìm cả trang Tài sản lẫn Cài đặt: không có chữ "xác minh", không có nút gửi email.
- **Cách xảy ra:**
  - Công tắc thật là biến môi trường của **server** `REQUIRE_EMAIL_VERIFICATION`. Server báo cho app qua `GET /api/v1/config` → `emailVerificationRequired`.
  - Bản `37ebfbd` đã làm đúng: chỉ khóa khi `emailVerificationRequired` = true.
  - `9ec5c74` bỏ qua cờ này và xóa giao diện. Kết quả:
    - **Hôm nay:** sàn thật (`infra/host.mjs:57`) và dev của chủ dự án (`ui/.env`) đều đã `false`, nên không ai thấy khác biệt. Đoạn gán cứng là thừa.
    - **Nơi server vẫn bắt** (máy không có `ui/.env`, `.env.example:11` = `true`, hệ e2e mặc định, Railway nếu bật): người dùng bị kẹt, bấm là lỗi, không có đường xác minh.
    - **Muốn bật lại sau này:** phải viết lại phần đã xóa, trái với yêu cầu "bật lại mà không ảnh hưởng UX".
- **Cách sửa an toàn:**
  1. Antigravity khôi phục **phần email** của `37ebfbd`: `git show 37ebfbd:<file>` cho các khối liên quan. Giữ phần chỉnh giao diện của `9ec5c74`.
     - Mọi chỗ khóa, banner, nút gửi xác minh và câu chữ đều **chỉ hiện khi** `publicConfig?.emailVerificationRequired === true` (cấu hình chưa tải xong thì không khóa).
     - Với cấu hình hiện tại (`false`), giao diện **giống hệt** bản `9ec5c74`: không banner, không khóa. Đó chính là "tắt".
  2. Claude Code làm N-01: `npm run dev` mặc định `REQUIRE_EMAIL_VERIFICATION=false` khi chưa đặt, để không cần `ui/.env`.
  3. **Bật lại sau này** = đặt `REQUIRE_EMAIL_VERIFICATION=true` (và có email thật: `EMAIL_TRANSPORT=resend`). Không sửa code giao diện.
- **Nghiệm thu:**
  - hệ host-mode (không bắt): không thấy chữ "xác minh" ở Header, Ví, form lệnh; nạp và mua được (test `host-mode/invite-signup.spec.ts` đã có);
  - hệ mặc định (có bắt): tài khoản chưa xác minh thấy nút "Gửi email xác minh" ở Ví và form lệnh, **không** có nút nạp/mua bấm được rồi báo lỗi. Claude Code sẽ thêm test `e2e/tests/email-gate.spec.ts`.

### K-02 — Màn "Đăng ký thành công" (P1 — làm đỏ e2e)
- **File:** `apps/exchange/src/pages/AuthPages.tsx:219-227` (cờ `registeredSuccess` chặn chuyển trang), `:349-383` (màn mới), chữ ở `:360`.
- **Bằng chứng:**
  - chạy thật: đăng ký → URL vẫn `/register`, màn ghi "Đăng ký thành công! Bạn có thể đăng nhập ngay để giao dịch", 2 nút "Vào sàn giao dịch ngay" / "Đăng nhập tài khoản";
  - e2e: `spot.spec.ts:18` và `host-mode/invite-signup.spec.ts:87` hết giờ chờ `/trade/`.
- **Cách xảy ra:**
  - Đăng ký xong người dùng **đã đăng nhập** (server trả phiên). Nút "Đăng nhập tài khoản" dẫn tới `/login`, mà trang này lại chuyển về sàn (R-12).
  - Khi server bắt xác minh, câu "đăng nhập ngay để giao dịch" sai: phải xác minh email trước.
  - Thêm một bước bấm không mang thông tin gì.
- **Cách sửa an toàn:** bỏ màn này, quay lại chuyển thẳng vào `/trade/BTCUSDT` như trước `9ec5c74`.
  - Muốn chào mừng thì dùng toast "Đăng ký thành công" sau khi chuyển trang.
  - Khi `emailVerificationRequired` = true, toast nhắc "Kiểm tra email để xác minh".
  - Không sửa test e2e: test kiểm đúng hành vi đã thống nhất. Muốn đổi luồng thì chủ dự án quyết trước.
- **Nghiệm thu:** 2 test trên xanh.

### K-03 — "Tổng giá trị" không tính lại khi đổi giá; ô giá xóa không được (P2)
- **File:** `apps/exchange/src/components/trading/OrderForm.tsx:873`: `onValueChange={(v) => { setPrice(v); handleQuantityChange(quantity); }}`. `handleQuantityChange` (`:272-286`) đọc `price` cũ trong closure.
- **Bằng chứng (chạy thật):**
  - Giới hạn, khối lượng `0.01` → tổng `830.39` (giá 83.039,9) — đúng;
  - đổi giá thành `80000` → tổng **vẫn `830.39`** (đúng phải là `800.00`);
  - đặt lệnh → server nhận `80000 × 0.01` (`GET /orders/open`: `price 80000, quantity 0.01`). Người dùng thấy tổng sai trước khi xác nhận.
- **Cũng ở chỗ này:** gõ vào ô giá không đặt `userChangedPriceRef.current = true`, nên xóa trắng ô giá thì effect N-04 (`:131-150`) điền lại giá thị trường ngay → không xóa để gõ lại được.
- **Cách sửa an toàn:**
  - tách hàm tính tổng nhận cả giá và khối lượng làm tham số: `recalcTotal(nextPrice, quantity)` (dùng `Dec`, làm tròn theo `tickSize` của quote);
  - trong `onValueChange` của ô giá: `userChangedPriceRef.current = true; setPrice(v); recalcTotal(v, quantity)`.
- **Nghiệm thu:** khối lượng 0.01, đổi giá 83.039,9 → 80.000 → tổng `800.00`; xóa trắng ô giá → ô vẫn trống tới khi người dùng gõ.

### K-04 — Đang tải phiên mà hiện "Yêu cầu đăng nhập" (P2)
- **File:** `apps/exchange/src/context/AuthContext.tsx:43,250` (`isLoading` có nhưng **không file nào dùng**). Các trang chặn bằng `if (!isAuthenticated)`:
  - `WalletPage.tsx:196`, `BotsPage.tsx:486`, `PortfolioPage.tsx:132`, `SettingsPage.tsx:275`, `PnlAnalysisPage.tsx:99`.
- **Bằng chứng:**
  - đọc mã;
  - ảnh chụp e2e khi máy bận (`admin.spec` "khóa tài khoản", `bots.spec` "Bot lưới"): người dùng đã đăng nhập bằng API nhưng trang hiện "Yêu cầu đăng nhập" suốt 15 giây.
- **Cách xảy ra:** mỗi lần tải trang, `user` = `null` cho tới khi `/me` trả về, nên trang coi là chưa đăng nhập. Qua link trycloudflare (chậm), người dùng thật thấy màn "Yêu cầu đăng nhập" nháy lên mỗi lần F5. Các effect tải dữ liệu (`if (!isAuthenticated) return`) cũng chạy muộn.
- **Cách sửa an toàn:**
  - lấy `isLoading` từ `useAuth()`; khi `isLoading` thì hiện khung xương (skeleton) của trang, không hiện "Yêu cầu đăng nhập";
  - hoặc làm một lần ở `App.tsx`: chờ `isLoading` xong mới dựng trang cần đăng nhập.
- **Nghiệm thu:** làm chậm `/me` 3 giây (DevTools hoặc `page.route`) → `/assets` hiện skeleton rồi hiện số dư, không lúc nào có chữ "Yêu cầu đăng nhập".

### K-05 — Sổ lệnh / giao dịch gần đây hiện `0,0000` (P2)
- **File:** `apps/exchange/src/components/trading/Orderbook.tsx:286,341`, `MarketTrades.tsx:106`: `formatDecimal(qty, { decimals: 4 })`.
- **Bằng chứng:**
  - ảnh chụp của chủ dự án (21:49): dòng `82.432,25 | 0,0000`, `82.430,80 | 0,0000`, giao dịch gần đây `0,0000`;
  - bước khối lượng BTC là `0.00001` (5 số lẻ), nên lượng `0.00003` hiện thành `0,0000`.
- **Cách sửa an toàn:** `formatAmount(qty, activeSymbolInfo?.stepSize)` (đã có trong `@cex/ui`), như N-11 đã làm ở bảng lệnh.
- **Nghiệm thu:** không có dòng nào hiện `0,0000` khi lượng > 0; lượng BTC hiện 5 số lẻ.

### K-06 — Đường lệnh trên chart (P2) → PROMPT-12 mục A
- **File:** `apps/exchange/src/components/trading/CandlestickChart.tsx:368` (tải `openOrders` một lần), `:1183-1198` (chỉ vẽ lệnh có `price`), `:345` (`price: fo.price || '0'` cho futures).
- **Bằng chứng (đọc mã):**
  - danh sách chỉ tải lại khi đổi cặp, đăng nhập hoặc khi `activeSymbolInfo` đổi;
  - không đăng ký sự kiện `order`;
  - đặt Limit 80.000 lúc chạy thật: lệnh có trên server (`NEW`) nhưng chart không được báo.
- **Cách sửa / nghiệm thu:** theo [PROMPT-12](../antigravity/PROMPT-12-chart-lenh-va-diem-khop.md) mục A, D, E.

### K-07 — Số thô trong thông báo (P3)
- **File:**
  - `components/trading/UserOrdersTabs.tsx:151` `Lệnh đã khớp: ${quantity} @ ${price}`;
  - `components/NotificationCenter.tsx:68,110` (`executedQty`, `avgPrice` thô);
  - `components/trading/OrderForm.tsx:380` `formatDecimal(avgPrice)` không theo tick;
  - `:104,346,368` trả `'0.00'` (dấu chấm).
- **Bằng chứng (chạy thật):** toast `Lệnh đã khớp: 0.01384000 @ 82932.29000000` và `Đặt lệnh MARKET Bán thành công! ở giá TB 82.932,29000000`; form "Phí giao dịch (ước tính): ~0.00 USDT".
- **Cách sửa an toàn:** `formatAmount(q, stepSize)`, `formatPrice(p, tickSize)` (lấy luật cặp từ `symbols` như `UserOrdersTabs` đã làm); phí trống hiện `—`; câu toast: "Đã bán 0,01384 BTC, giá TB 82.932,29".
- **Nghiệm thu:** không toast nào có quá số lẻ của tick/bước; không có `.` thập phân trong chữ tiếng Việt.

### K-08 — Gọi `/me` mỗi lần focus tab (P3)
- **File:** `apps/exchange/src/context/AuthContext.tsx:136-153`.
- **Cách xảy ra:**
  - điều kiện chỉ là `user && !user.emailVerified`;
  - trên sàn thật không bắt xác minh nên mọi người dùng đều `emailVerified=false` mãi mãi → mỗi lần chuyển tab là 2 request (`/me` + `/preferences`);
  - nếu request lỗi mạng thì `refreshUser` đặt `user = null` (`:85-86`) → người dùng bị coi là đăng xuất.
- **Cách sửa an toàn:** thêm điều kiện `publicConfig?.emailVerificationRequired === true`; khi lỗi không phải 401 thì giữ nguyên `user`.
- **Nghiệm thu:** hệ host-mode: chuyển tab 5 lần → không có `GET /me` mới.

### K-09 — Quy trình (P3)
1. Bảng N trong báo cáo lần 2 ghi "✅ Đã sửa (Antigravity)" nhưng **không có commit và lệnh đã chạy** (quy tắc ở đầu báo cáo và `project-rules.md` mục 9). N-02 ghi xong rồi bị `9ec5c74` gỡ mà không cập nhật.
2. Nhánh UI thêm `.agent/agents/*`, `.agent/skills/*` (~250 file: script Python, test, tài liệu bên thứ ba) và `AGENTS.md` ở gốc repo. Gộp vào `main` thì:
   - các agent khác cũng đọc `AGENTS.md`;
   - `eslint.config.js` đã được sửa để bỏ qua `.agent/**`.

   **Chủ dự án đã quyết (2026-10-13): giữ lại** — đây là các skill của Claude mà Antigravity dùng. Việc đã làm:
   - quét 246 file trong `.agent/` và `AGENTS.md`: không có file khóa/bí mật, không có chuỗi giống khóa API;
   - `.agent` thêm vào `.dockerignore` để ảnh Docker (Railway) không chứa chúng;
   - ESLint đã bỏ qua `.agent/**`; vitest chỉ chạy `packages/`, `server/`, `infra/` nên không chạy test trong skill;
   - mục K-09.2 coi như **đã đóng**, không còn chặn việc gộp.
3. `AGENTS.md` mô tả bước cuối "✅ Hoàn tất & Merge Code". Antigravity **không** tự gộp vào `main`; gộp là việc của chủ dự án sau khi `ui-check` xanh.

### K-10 — e2e đỏ giả khi máy bận (P3, Claude Code)
- **Bằng chứng:** cùng bản code, chạy cả bộ 8 đỏ; chạy riêng thì 6 trong số đó đạt (12/12). Lúc chạy cả bộ có `npm run dev` (giá Binance thật) cùng chạy.
- **Hướng xử lý:**
  - `ui-check` cảnh báo khi thấy dev server (:8080/:5173) đang chạy;
  - hoặc tự chạy lại một lần những test đỏ rồi báo riêng "đỏ ổn định" và "đỏ một lần".

  Không tăng `retries` chung, vì sẽ che lỗi thật.

## 4. Thứ tự đề xuất
1. **Antigravity:**
   - K-02 và K-01 (trả `ui-check --e2e` về xanh, giữ công tắc ở server);
   - K-03, K-05, K-04;
   - PROMPT-12 (gồm K-06);
   - K-07, K-08.
2. **Claude Code:**
   - N-01 (mặc định dev);
   - test `email-gate.spec.ts` (K-01);
   - R-04 CSP, R-16 `onClose`, N-13 `emailDelivery`;
   - K-10;
   - test `chart-orders.spec.ts` khi PROMPT-12 xong.
3. **Chủ dự án:** không còn việc chờ quyết (K-09.2 đã quyết: giữ `.agent/` và `AGENTS.md`).

Sau mỗi đợt chạy `npm run ui-check -- --e2e`. Phải xanh. Khi chạy, tắt `npm run dev` để tránh đỏ giả (K-10).

## 5. Ghi chú — chưa kiểm được
- Đường lệnh trên canvas chart: khung trình duyệt trong app thu nhỏ quá, không nhìn rõ → K-06 dựa trên đọc mã. PROMPT-12 mục D thêm danh sách ẩn để test đọc được.
- Header dropdown Ví (N-07): chỉ đọc mã.
- Giao diện admin sau `9ec5c74`: chỉ đọc diff (3 file, chỉ thêm `aria-*` và một dòng chú thích).

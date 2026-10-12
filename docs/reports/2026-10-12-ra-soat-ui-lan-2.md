# Rà soát giao diện lần 2 — 2026-10-12 (UI `d5fa8fc`)

> **Cho mọi agent:** đọc cùng [lần 1](2026-10-12-ra-soat-ui-antigravity.md).
> File này gồm:
> - (1) nguyên nhân hai lỗi chủ dự án gặp;
> - (2) kết quả kiểm lại R-01…R-18;
> - (3) lỗi mới N-01…N-14.
>
> Mỗi mục ghi: mức độ, phụ trách, file:dòng, bằng chứng, cách xảy ra, cách sửa an toàn, nghiệm thu. Sửa xong ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` ngay dưới mục.

## 0. Bối cảnh và cách kiểm

| Hạng mục | Giá trị |
|---|---|
| Gom thư mục | Xong, commit `0b4e1e6`. Cấu trúc `D:\Claude\crypto` = `main`; `ui/` = worktree nhánh giao diện (Antigravity); `host/` = bản đang phục vụ; `host-data/` = dữ liệu thật. Ba thư mục này git/docker/eslint bỏ qua. Bản sao lưu trước khi sắp xếp: `D:\Claude\_backup-truoc-sap-xep-2026-10-12\` (bundle mọi nhánh + `crypto-host-data`) |
| Bản rà soát | `ui/gd2-exchange @ d5fa8fc` (Antigravity sửa theo lần 1: `aaea477`, `fcdf790`, `d5fa8fc`) |
| Sàn thật (`host/`) | đang **dừng**, bản `main ec2a625 + ui d5fa8fc`, `"e2e": "skipped"`. Database sàn thật: **0 tài khoản**. Lần tắt trước không sạch: PostgreSQL phải chạy phục hồi khi bật lại để đọc |
| Môi trường phát triển (`ui/`, `npm run dev`) | database `ui/.pgdata`: **1 tài khoản** (gmail của chủ dự án, tạo 11/10 07:52 giờ VN), `email_verified = false`, **0 dòng sổ cái, 0 lệnh** |
| Chạy thật | hệ giống `npm run dev` (`E2E_MODE=default`: đăng ký mở, **bắt xác minh email**, giá giả lập), DB :5438, web :5192, bản build production của `exchange` và `admin`; trình duyệt 1440×900 và 375×812; tài khoản thử `devuser1@test.local` |
| Luồng đã đi | đăng ký → bị khóa nạp/giao dịch → "Gửi lại link" → mở link xác minh ở tab khác → tab gốc → tải lại → nạp 10.000 USDT → nạp lần 2 → đặt Limit (chỉ nhập khối lượng) → đặt Limit đủ giá → hủy → mua Market 100 USDT → bán bằng thanh trượt % → Danh mục → bật 2FA → set-role owner → trang Quản trị → Cấu hình sàn đặt thời gian chờ faucet = 0 → mobile: bấm "BÁN BTC" |

---

## 1. Hai lỗi chủ dự án gặp

### "Không nhấn được nút xác minh email để giao dịch"
- **Nguyên nhân gốc:**
  - `npm run dev` chạy server với cấu hình mặc định: **bắt xác minh email** (`server/src/config.ts:26-29`, mặc định `'true'`).
  - Email **không gửi thật**: `EMAIL_TRANSPORT=log`, nội dung chỉ in vào log server (`server/src/modules/auth/email.ts:20`, dòng `EMAIL (log transport — not sent)`).
  - Thư mục `ui/` không có `.env`, nên Antigravity và chủ dự án đều chạy với mặc định này.
  - Tài khoản của chủ dự án trong `ui/.pgdata` vì vậy **chưa bao giờ được xác minh**.
- **Giao diện làm tệ hơn** (N-02, N-03):
  - nút nạp tiền thành nút xám "Xác minh email để nạp tiền", bấm không được;
  - form đặt lệnh báo "Vui lòng xác minh email trước khi đặt lệnh";
  - cách duy nhất là chữ nhỏ "Gửi lại link" trên banner có nút đóng;
  - xác minh ở tab khác thì tab gốc vẫn khóa cho tới khi tải lại.
- **Cách dùng ngay (chủ dự án):**
  - trong cửa sổ đang chạy `npm run dev`, tìm dòng `EMAIL (log transport — not sent)`, mở link `/verify-email?token=…` ở đó, rồi **tải lại trang sàn**;
  - hoặc tắt `npm run dev`, tạo file `D:\Claude\crypto\ui\.env` có dòng `REQUIRE_EMAIL_VERIFICATION=false`, chạy lại;
  - Claude Code sẽ sửa mặc định (N-01).

### "Không deposit được thêm tiền để test giao dịch"
- **Nguyên nhân 1:** chưa xác minh email thì faucet bị khóa (như trên).
- **Nguyên nhân 2 (có chủ đích):** faucet 10.000 USDT/lần, **chờ 24 giờ** giữa các lần, tối đa 100.000 USDT trọn đời. Đo thật: lần 2 bị `429 FAUCET_COOLDOWN`, `nextAvailableAt` sau 24 giờ.
- **Cách nạp thêm để test (đã kiểm chạy được):** owner (đã bật 2FA) vào **Quản trị → Cấu hình sàn → Thời gian chờ (giờ) = 0**, nhập lý do, bấm Xác nhận. Ngay sau đó `GET /api/v1/wallet/faucet` trả `canClaim: true, cooldownHours: 0`.
  - Có thể tăng "Số tiền mỗi lần nhận" và "Hạn mức trọn đời".
  - Hoặc dùng Quản trị → Người dùng → Cộng tiền (có ghi nhật ký).
- Giao diện không cho người thử nghiệm biết cách này: N-10.

---

## 2. Kiểm lại R-01…R-18 (bản `d5fa8fc`)

| Mã | Kết quả | Bằng chứng |
|---|---|---|
| R-01 chú giải O/H/L/C | ✅ Đã sửa | chạy thật PEPE: `O: 0,00000406 \| H: 0,00000407 \| L: 0,00000405 \| C: 0,00000406` |
| R-02 trục giá | ✅ Đã sửa | ảnh 1440×900: trục `84.750,00 … 82.000,00` |
| R-03 câu lỗi | ✅ Đã sửa (đọc mã) | `errors.ts:6` `Record<ErrorCode,string>`; `CONFLICT` câu chung; `formatApiError(..., overrides)` dùng ở `AuthContext.tsx:156,183` |
| R-04 captcha | ◐ Phần UI xong | `AuthPages.tsx:244,273` có `turnstile.remove`/reset. **Phần CSP của server chưa làm (Claude Code)** |
| R-05 trộn nến khi tải lịch sử | ✅ Đã sửa (đọc mã) | `CandlestickChart.tsx:226-242` có `AbortController`; `:749,764` kiểm `requestKey` |
| R-06 lãi/lỗ DCA | ✅ Bản tạm | `BotsPage.tsx:981` chỉ tính khi ticker LIVE, dùng `dec`, còn lại hiện `—`. Trường lãi/lỗ từ backend vẫn chưa có (cần yêu cầu hợp đồng) |
| R-07 tải gấp đôi nến | ✅ Đã sửa | mở `/trade/PEPEUSDT`: 1 request `limit=500` cho PEPE (nhưng xem N-14) |
| R-08 nhãn tab | ✅ Đã sửa | `display: block` cho "Biểu đồ" và "Thông tin" ở 1440px |
| R-09 cấu hình bịa | ✅ Đã sửa (đọc mã) | `ConfigContext.tsx`: giữ `null`, có `error`, thử lại 1s/3s/10s |
| R-10 ErrorBoundary | ✅ Đã sửa | `App.tsx:115` `<ErrorBoundary key={currentPath}>` |
| R-11 câu trang Đăng ký | ✅ Đã sửa | `AuthPages.tsx:371-372` theo `emailVerificationRequired` |
| R-12 `/login` khi đã đăng nhập | ✅ Đã sửa | vào `/login` thì được chuyển sang `/trade/BTCUSDT` |
| R-13 nút không tên | ❌ Còn | trang Giao dịch: 3 nút đổi kiểu sổ lệnh, nút gửi lệnh, 3 nút ở khung lệnh dưới; trang Quản trị: 11 nút menu bên trái, 2 nút trong hộp xác nhận (cây accessibility không có tên) |
| R-14 định dạng | ◐ Một phần | faucet đã `10.000,00`; còn lỗi ở bảng lệnh và Danh mục (N-11) |
| R-15 code chết ở Wallet | ✅ Đã sửa | `WalletPage.tsx:105` chỉ còn `ev.balance` |
| R-16 `onClose` realtime | ❌ Chưa | phần contracts thuộc Claude Code |
| R-17 header giao diện sáng | ✅ Đã sửa (đọc mã) | `Header.tsx:45` `bg-[var(--panel)]` |
| R-18 sửa `e2e/` | ❌ Lặp lại | `d5fa8fc` lại sửa `e2e/tests/bots.spec.ts` (+4 dòng) |

---

## 3. Lỗi mới

### Bảng tóm tắt

| Mã | Mức | Phụ trách | Vấn đề |
|---|---|---|---|
| N-01 | **P0** (dev/test) | Claude Code | `npm run dev` bắt xác minh email nhưng không gửi email: tài khoản mới không nạp và không giao dịch được |
| N-02 | **P1** | Antigravity | Bị khóa vì email nhưng không có nút hành động: nút xám, banner đóng được, Cài đặt không có nút gửi lại |
| N-03 | **P1** | Antigravity | Xác minh ở tab khác thì tab gốc vẫn khóa tới khi tải lại |
| N-04 | **P1** | Antigravity | Ô "Giá đặt lệnh" trống, chỉ có placeholder là giá hiện tại: nhập khối lượng rồi bấm thì bị báo thiếu giá |
| N-05 | **P1** | Antigravity | Bán Market bằng thanh trượt % không chạy (chế độ nhập USDT mặc định) |
| N-06 | **P1** | Antigravity | Mobile: bấm "BÁN BTC" mở form ở phía **MUA** |
| N-07 | P2 | Antigravity | Menu Ví ở header hiện số viết cứng `10,000.00 USDT` |
| N-08 | P2 | Antigravity | Bật 2FA không có mã QR (hợp đồng có `otpauthUrl`); mã khôi phục không có nút sao chép |
| N-09 | P2 | Antigravity | "Khả dụng" trong form lệnh cắt còn 4 số lẻ (`0,0012 BTC` thay vì `0,00120879`) |
| N-10 | P2 | Antigravity (+ chủ dự án) | Không có hướng dẫn nạp thêm tiền khi đang chờ faucet |
| N-11 | P3 | Antigravity | Định dạng: bảng lệnh và Danh mục hiện giá 8 số lẻ, `%` dấu chấm |
| N-12 | P3 | Antigravity | Hộp xác nhận ở trang Quản trị không phải `role="dialog"`, nút không tên |
| N-13 | P3 | Antigravity | "Đã gửi lại email xác minh" dù môi trường không gửi email thật |
| N-14 | P3 | Antigravity | Mở `/trade/<cặp>` từ trang khác thì tải nến BTCUSDT trước rồi mới tải cặp đúng |

### N-01 — `npm run dev` bắt xác minh email nhưng không gửi email (P0 cho việc test)
- **Phụ trách:** Claude Code (`infra/dev.mjs`, tài liệu).
- **Bằng chứng:**
  - `server/src/config.ts:26-29` mặc định `REQUIRE_EMAIL_VERIFICATION='true'`;
  - `server/src/modules/auth/email.ts:20` chỉ ghi log;
  - không có `ui/.env`;
  - DB `ui/.pgdata`: tài khoản duy nhất `verified=false`, 0 dòng sổ cái;
  - chạy thật hệ cùng cấu hình: `/api/v1/config` trả `"emailVerificationRequired":true`, faucet `disabled`.
- **Cách sửa:**
  - `infra/dev.mjs` truyền `REQUIRE_EMAIL_VERIFICATION=false` cho server **chỉ khi biến này chưa được đặt** (người cần thử luồng xác minh vẫn đặt `true` trong `.env`).
  - In một dòng `[dev] email không gửi thật — link xác minh/quên mật khẩu nằm ở dòng "EMAIL (log transport"`.
  - Không đổi mặc định của server: production/host vẫn theo `.env.host`.
  - Không đổi hệ e2e: hệ default vẫn bắt xác minh để `spot.spec` kiểm luồng xác minh.
- **Nghiệm thu:** `npm run dev`, đăng ký tài khoản mới, bấm nạp tiền được ngay; `GET /api/v1/config` trả `emailVerificationRequired: false`.

### N-02 — Bị khóa vì email nhưng không có nút hành động (P1)
- **File:**
  - `apps/exchange/src/pages/WalletPage.tsx:380-390` (nút xám);
  - `components/trading/OrderForm.tsx:593-600` (thông báo khóa);
  - `components/Header.tsx:~322-330` (banner có `setHideBanner`);
  - `pages/SettingsPage.tsx` (mục "Email: ✗ Chưa" không có nút).
- **Bằng chứng (chạy thật):** nút `"Xác minh email để nạp tiền"` có `disabled: true`, không có `title`/`aria-label`. Banner: "Tài khoản chưa xác minh email. Một số tính năng sẽ bị giới hạn. Gửi lại link" kèm nút ✕; đóng rồi thì không còn chỗ nào gửi lại.
- **Cách sửa (chỉ UI, không đổi API):**
  - Thay nút xám bằng nút **bấm được** "Gửi email xác minh tới <email>". Gọi `resendVerification()` có sẵn trong `AuthContext`, toast kết quả, khóa nút 60 giây.
  - Form đặt lệnh: dưới câu báo khóa thêm nút "Gửi email xác minh".
  - Cài đặt → Bảo mật: thêm nút cạnh "Email: ✗ Chưa".
  - Banner đóng rồi thì nhớ trong phiên (sessionStorage) nhưng các nút trên vẫn còn.
- **Nghiệm thu:** trên hệ bắt xác minh, từ trang Tài sản, form lệnh và Cài đặt đều gửi được email xác minh (Playwright kiểm `outbox.jsonl` có thư mới).

### N-03 — Xác minh ở tab khác, tab gốc vẫn khóa (P1)
- **File:** `context/AuthContext.tsx` (`refreshUser` chỉ chạy lúc tải trang), `pages/AuthPages.tsx` (`VerifyEmailPage`).
- **Bằng chứng (chạy thật):** mở link xác minh ở tab mới thì tab đó báo "Xác minh email thành công!". Tab gốc sau 5 giây vẫn `disabled: true` và còn banner. Tải lại thì mở khóa.
- **Cách sửa:**
  - Trong `AuthProvider`, khi `user && !user.emailVerified`, gọi lại `api.me()` mỗi khi `window` focus hoặc `visibilitychange` sang visible.
  - `VerifyEmailPage` sau khi thành công phát `BroadcastChannel('cex-auth').postMessage('verified')`; `AuthProvider` nghe để `refreshUser()`.
  - Không dùng localStorage cho token (quy tắc 5).
- **Nghiệm thu:** xác minh ở tab B, quay lại tab A thì trong ≤ 2 giây nút nạp tiền mở khóa, không cần tải lại.

### N-04 — Ô "Giá đặt lệnh" trống, placeholder trông như đã điền (P1)
- **File:** `components/trading/OrderForm.tsx` (ô giá Limit/Stop-Limit/OCO; `placeholder` = giá hiện tại).
- **Bằng chứng (chạy thật):** `priceValue: ""`, `pricePlaceholder: "82320.88"`. Chỉ nhập khối lượng 0,01 rồi bấm MUA thì hiện **"Vui lòng nhập đầy đủ giá và khối lượng."**. Ảnh desktop: ô giá trông như đã có `82324.25`.
- **Cách xảy ra:** người dùng tưởng giá đã điền sẵn, bấm mua, bị từ chối. Rất giống "không giao dịch được".
- **Cách sửa:**
  - Khi mở form hoặc đổi cặp, nếu ô giá rỗng thì **điền giá trị** = giá hiện tại làm tròn theo `tickSize` (`floorToStep` đã dùng trong `handlePercentClick`).
  - Không ghi đè khi người dùng đã gõ.
  - Bấm vào sổ lệnh vẫn điền giá như cũ.
  - Không đổi luồng Market.
- **Nghiệm thu:** vào `/trade/BTCUSDT`, nhập khối lượng 0,01, bấm MUA thì ra hộp xác nhận với giá hiện tại.

### N-05 — Bán Market bằng thanh trượt % không chạy (P1)
- **File:** `components/trading/OrderForm.tsx:221-227` (nhánh SELL chỉ `setQuantity`), `:429` (gửi theo `quoteOrderQty` khi `marketInputMode === 'quote'`), `:858-873` (ô đang hiện là USDT).
- **Bằng chứng (chạy thật):**
  - Tài khoản có `0.00120879` BTC; chọn BÁN BTC → Thị trường.
  - Kéo thanh trượt tới 93%: ô "Tổng số tiền USDT" vẫn trống.
  - Bấm BÁN thì báo **"Vui lòng nhập số tiền USDT muốn giao dịch."**
- **Cách xảy ra:** thanh trượt ghi vào `quantity` (ô BTC đang ẩn), còn nút gửi đọc `quoteOrderQty` (ô USDT đang hiện).
- **Cách sửa (chỉ file này):**
  - Phía **BÁN** đặt mặc định nhập theo coin (`marketInputMode = 'base'`) như sàn thật.
  - Khi dùng thanh trượt % ở phía bán, chuyển sang `'base'` và điền `quantity` (bán 100% không để lại bụi).
  - Phía MUA giữ nguyên.
  - Không đổi hợp đồng (server nhận cả `quantity` lẫn `quoteOrderQty` cho MARKET).
- **Nghiệm thu:** BÁN Market 100% bằng thanh trượt thì ra hộp xác nhận với khối lượng = số dư làm tròn theo `stepSize`; sau khi khớp, BTC khả dụng < 1 `stepSize`.

### N-06 — Mobile: bấm "BÁN BTC" mở form ở phía MUA (P1)
- **File:** `pages/TradePage.tsx` (thanh cố định: cả 2 nút chỉ gọi `setMobileOrderSheetOpen(true)`), `components/trading/OrderForm.tsx` (không có prop chọn phía).
- **Bằng chứng (chạy thật, 375×812):** bấm "BÁN BTC" thì sheet "Đặt lệnh BTCUSDT" có nút MUA xanh `rgb(31,194,122)`, BÁN trong suốt, nút gửi "MUA BTC". Có ảnh chụp.
- **Cách xảy ra:** người định bán có thể đặt nhầm lệnh mua. Hộp xác nhận có ghi "MUA" nhưng dễ bỏ qua.
- **Cách sửa:**
  - Thêm state `mobileSide` trong `TradePage`: nút MUA đặt `'BUY'`, nút BÁN đặt `'SELL'`.
  - Truyền `initialSide` cho `OrderForm`; `OrderForm` đặt `side` theo prop mỗi lần sheet mở (`useEffect` theo `initialSide` + `isOpen`).
  - Desktop không đổi.
- **Nghiệm thu:** mobile bấm BÁN thì sheet ở tab BÁN, nút gửi "BÁN BTC"; bấm MUA thì ngược lại.

### N-07 — Menu Ví ở header hiện số viết cứng (P2)
- **File:** `components/Header.tsx:194`, chuỗi `10,000.00` gõ thẳng trong JSX.
- **Cách xảy ra:**
  - Rê chuột vào biểu tượng Ví thì mọi tài khoản đều thấy "Tổng tài sản ước tính 10,000.00 USDT": tài khoản 0 USDT cũng vậy, và sai kiểu số Việt.
  - Vi phạm "không bịa dữ liệu" (Bất biến 6, `.agent/rules` quy tắc 4).
- **Cách sửa:** lấy `totalValueUsdt` từ `api.portfolio()` khi mở menu (có sẵn, dùng ở `PortfolioPage`), hiện `—` khi đang tải hoặc `null`. Hoặc bỏ dòng tổng.
- **Nghiệm thu:** tài khoản mới (0 USDT) rê chuột vào Ví thấy `0,00 USDT` hoặc `—`.

### N-08 — Bật 2FA không có mã QR (P2)
- **File:** `pages/SettingsPage.tsx:74` (state có `otpauthUrl`), `:973` (chỉ hiện `secret` dạng chữ).
- **Bằng chứng (chạy thật):** hộp "Kích hoạt xác thực 2FA" chỉ có khóa 32 ký tự. Phải gõ tay vào điện thoại.
  - Hợp đồng ghi rõ `otpauthUrl` dùng để vẽ QR (`packages/contracts/src/auth.ts:51-52`).
  - Mã khôi phục hiện ra nhưng không có nút sao chép hay tải về.
- **Cách xảy ra:** owner bắt buộc bật 2FA mới vào được Quản trị. Gõ tay 32 ký tự dễ sai.
- **Cách sửa:**
  - Vẽ QR **tại trình duyệt** từ `otpauthUrl` (thư viện `qrcode` xuất SVG/canvas, **không** gửi khóa ra dịch vụ ngoài); giữ dòng chữ và thêm nút "Sao chép khóa".
  - Mã khôi phục: thêm nút "Sao chép tất cả" và "Tải về .txt".
- **Nghiệm thu:** hộp bật 2FA có ảnh QR quét được bằng Google Authenticator.

### N-09 — "Khả dụng" trong form lệnh cắt còn 4 số lẻ (P2)
- **Bằng chứng (chạy thật):** form BÁN hiện `Khả dụng: 0,0012 BTC`; số dư thật `0.00120879`.
- **Cách xảy ra:** người dùng gõ tay theo số đang thấy thì sót lại bụi, hoặc tưởng số dư sai.
- **Cách sửa:** hiện số dư coin đủ 8 số lẻ (hoặc theo `stepSize` của cặp), không cắt cứng 4.

### N-10 — Không có hướng dẫn nạp thêm tiền khi đang chờ faucet (P2)
- **File:** `pages/WalletPage.tsx` (thẻ faucet khi `countdown`).
- **Bằng chứng:** sau lần nạp đầu chỉ hiện "Thời gian chờ: 23:59:58". Không nói cách có thêm tiền để test.
- **Cách sửa:**
  - Dưới đồng hồ chờ thêm dòng "Cần thêm tiền thử nghiệm? Nhờ quản trị viên điều chỉnh định mức faucet".
  - Trang Quản trị → Cấu hình sàn: ghi chú "đặt 0 để nạp liên tục khi thử nghiệm".
  - Đã kiểm: đặt 0 có hiệu lực ngay.
- **Chủ dự án:** dùng cách ở mục 1 khi cần.

### N-11 — Định dạng số còn lệch (P3)

| Chỗ | Đang hiện | Nên |
|---|---|---|
| Bảng "Lệnh đang chờ" (`UserOrdersTabs.tsx`) | `80.000,00000000`, `0,01000000` | giá theo `tickSize` (`80.000,00`), khối lượng theo `stepSize` (`0,01000`) |
| Danh mục: giá vốn, giá hiện tại (`PortfolioPage.tsx`) | `82.486,95695696`, `82.328,29000000` | theo `tickSize` của cặp |
| Danh mục: tỷ lệ (`PortfolioPage.tsx:351,464`) | `99.0%`, `1.0%` | `99,0%` (dùng hàm định dạng chung) |

### N-12 — Hộp xác nhận ở trang Quản trị (P3)
- **Bằng chứng:**
  - Hộp "Nhập lý do thực hiện thao tác…" không có `role="dialog"`/`aria-modal`;
  - hai nút Hủy/Xác nhận không có tên trong cây accessibility (`button [ref_72]`, `[ref_74]`);
  - 11 nút menu trái cũng không có tên.
- **Cách sửa:** `ConfirmDialog` dùng `Modal` của `@cex/ui` (đã có `role="dialog"`), nút có chữ hoặc `aria-label`. Kiểm lại vì sao chữ menu không vào tên nút (chữ đặt trong phần tử `aria-hidden`?).

### N-13 — "Đã gửi lại email xác minh" khi email không gửi thật (P3)
- **Cách xảy ra:** trong `npm run dev` / host, email chỉ ghi log. Toast vẫn báo "Đã gửi…", người dùng chờ thư không bao giờ đến.
- **Cách sửa:** sau N-01 thì dev không còn bắt xác minh. Nếu muốn chính xác hơn, Claude Code thêm `emailDelivery: 'sent' | 'log'` vào `PublicConfig` và UI đổi câu khi `log`. Hiện là P3, chờ yêu cầu hợp đồng.

### N-14 — Mở `/trade/<cặp>` từ trang khác thì tải nến BTCUSDT trước (P3)
- **Bằng chứng (chạy thật):** từ `/assets` chuyển sang `/trade/PEPEUSDT`, danh sách request có `/market/candles/BTCUSDT?interval=15m&limit=500` **trước** `/market/candles/PEPEUSDT?…`.
- **Cách xảy ra:** `MarketContext.activeSymbol` còn giá trị cũ, biểu đồ mount với cặp cũ rồi mới đồng bộ theo URL. Thừa 1 request, và biểu đồ chớp cặp sai.
- **Cách sửa:** `TradePage` truyền `symbolParam` (đã kiểm hợp lệ) thẳng cho `CandlestickChart`/`Orderbook`/`MarketTrades` thay vì `activeSymbol`. Hoặc gọi `setActiveSymbol` trước lần render đầu.

---

## 4. Thứ tự đề xuất
1. **Claude Code:**
   - N-01 (mặc định dev);
   - R-04 phần CSP;
   - R-16;
   - thêm e2e cho N-04, N-05, N-06 (luồng giao dịch mà e2e hiện tại chưa phủ: Limit chỉ nhập khối lượng, bán bằng thanh trượt, mobile bấm BÁN).
2. **Antigravity:**
   - N-05, N-06, N-04 (ảnh hưởng trực tiếp tới việc giao dịch);
   - N-02, N-03;
   - N-07, N-08, N-09, N-10;
   - P3.
3. Sau mỗi đợt:
   ```bash
   npm run ui-check -- --e2e
   ```
   Phải xanh. Ghi trạng thái vào file này.

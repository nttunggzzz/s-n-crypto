# Lỗi hiện tại — danh sách chung cho mọi agent

> **Antigravity, Claude Code và mọi agent khác: đọc file này trước khi sửa lỗi.**
> Mỗi lỗi có mã, người phụ trách, mức độ, bằng chứng, nguyên nhân, cách sửa và điều kiện nghiệm thu.
> Sửa xong một mục thì đổi **Trạng thái**, ghi commit + lệnh đã chạy + kết quả thật vào cột/ô của mục đó. **Không xóa mục.**
> Chỉ sửa trong phạm vi của mình (Antigravity: `apps/*`, `packages/ui`; Claude Code: `server/`, `packages/contracts`, `packages/core`, `infra/`, `e2e/`).

Rà soát: **2026-10-11** (Claude Code). Cập nhật lần cuối: 2026-10-11 tối (C1, O1 xong).

> **Rà soát mới 2026-10-12 (UI `eee01a3`): [docs/reports/2026-10-12-ra-soat-ui-antigravity.md](reports/2026-10-12-ra-soat-ui-antigravity.md)** — 18 mục R-01…R-18. B5 và U2 bên dưới **chưa xong** dù đã đánh "Đã sửa" (xem R-02, R-13).
>
> **Rà soát lần 2 (UI `d5fa8fc`, sau khi gom thư mục): [docs/reports/2026-10-12-ra-soat-ui-lan-2.md](reports/2026-10-12-ra-soat-ui-lan-2.md)** — nguyên nhân "không xác minh email / không nạp thêm tiền", kiểm lại R-01…R-18, lỗi mới N-01…N-14.
>
> **Rà soát lần 3 (UI `9ec5c74`): [docs/reports/2026-10-12-ra-soat-ui-lan-3.md](reports/2026-10-12-ra-soat-ui-lan-3.md)** — **chưa gộp được**: e2e 2 đỏ thật (K-02 màn đăng ký), K-01 tắt xác minh email bằng gán cứng (công tắc phải ở server). Lỗi mới K-01…K-10. Tính năng mới: [PROMPT-12 lệnh + điểm khớp B/S trên chart](antigravity/PROMPT-12-chart-lenh-va-diem-khop.md).

## Backend → UI (Claude Code cập nhật mỗi khi đổi backend/hợp đồng; Antigravity đọc đầu mỗi phiên, cùng `packages/contracts/CHANGELOG.md`)

| Ngày | Thay đổi backend / hợp đồng | UI cần làm gì | Trạng thái |
|---|---|---|---|
| 2026-10-12 | **Có rồi (contracts 0.12.0, commit `3bc7edd`):** `RealtimeClient.onClose(cb)` + hằng số `WS_SESSION_ENDED` (4401) — R-16 | Dùng `onClose` thay đoạn dò `typeof … === 'function'` + ép kiểu ở `AuthContext.tsx`: `code === WS_SESSION_ENDED` → gọi `me`, 401 thì hiện đã đăng xuất. Đánh dấu R-16 xong ở `docs/parts/contract-requests.md` | **Có rồi** — chờ Antigravity dùng |
| 2026-10-12 | **Có rồi (0.12.0):** `publicConfig.emailDelivery` (`'sent'` hoặc `'log'`) — N-13 | Toast "Đã gửi lại email xác minh" chỉ khi `'sent'`; khi `'log'` nói "Máy chủ này chưa gửi email thật". Đánh dấu N-13 xong ở `contract-requests.md` | **Có rồi** — chờ Antigravity dùng |
| 2026-10-12 | **Có rồi:** `npm run dev` mặc định tắt bắt xác minh email (N-01). Quyết định trong shell / `.env` thắng; `npm run dev -- --verify-email` để thử luồng thật | **Không** gán cứng "đã xác minh" trong giao diện (K-01): giao diện đọc `publicConfig.emailVerificationRequired`. Sàn thật và e2e giữ nguyên | **Có rồi** |
| 2026-10-12 | **Có rồi:** CSP của server cho phép script / iframe / kết nối của Cloudflare Turnstile khi có `TURNSTILE_SITE_KEY` — R-04 | Không đổi code UI; kiểm widget captcha hiện trên bản build khi bật captcha | **Có rồi** |
| 2026-10-12 | **Test nghiệm thu mới** (`e2e/tests/trade-form.spec.ts`, `email-gate.spec.ts`) — N-04, K-03, N-05, N-06, K-01, N-03 | Cần `data-testid` cho form lệnh: `order-price`, `order-quantity`, `order-total` (test đang tìm theo thứ tự ô `inputmode="decimal"`). Ghi vào `docs/antigravity/TESTIDS.md` | Chờ Antigravity |
| (không đổi) | Hợp đồng hiện tại: **0.12.0**. Không có endpoint nào bị xóa/đổi tên gần đây | — | — |

## 0. Bức tranh tổng thể

| Bản | Commit | Kết quả kiểm tra |
|---|---|---|
| `main` | `77e7708` | — |
| Nhánh UI `ui/gd2-exchange` (mới nhất) | `7f929b6` | `npm run ui-check -- --e2e`: verify **đạt** (215/215 test), e2e **27/27 đạt** |
| **Sàn đang chạy cho người dùng** (`npm run host`, link trycloudflare) | `main 77e7708` + UI **`d8391db`** | UI **cũ**: chưa có các bản sửa biểu đồ của Antigravity (`33e873c` → `7f929b6`) |

Ba kết luận chính:
1. **Biểu đồ bị kéo dài** mà chủ dự án thấy trên link trycloudflare là do **sàn đang chạy bản UI cũ** (`d8391db`). Bản mới nhất `7f929b6` đã hết lỗi: trên desktop khung chart cao 468–560px và bằng đúng ô của nó, trên mobile 375×812 cao 407px; 1 biểu đồ duy nhất; e2e `chart-dimensions.spec` đạt. → Mục **H1**.
2. **Dữ liệu nến của server khớp Binance từng số** (đo REST + realtime, xem mục **B0**). Chỗ "lệch TradingView" đến từ cách giao diện hiển thị: canvas bị kéo dài (bản cũ), trục thời gian UTC, chỉ tải 180 nến… → Mục **B1–B7**.
3. **Không tạo được tài khoản admin** vì **trang Đăng ký không gửi mã mời**. Sàn đang chạy ở chế độ chỉ đăng ký bằng mã mời, nên mọi lần đăng ký đều bị từ chối. Database sàn: **0 tài khoản**, 3 mã mời "Chủ dự án" chưa dùng lần nào. Chưa có tài khoản thì `set-role owner` không có ai để cấp. → Mục **A1** (sửa) và **W1** (cách tạm dùng ngay).

## 1. Bảng tóm tắt

| Mã | Mức | Phụ trách | Vấn đề | Trạng thái |
|---|---|---|---|---|
| **A1** | P0 chặn | Antigravity | Trang Đăng ký bỏ qua `?invite=` và không gửi `inviteCode`, nên không ai đăng ký được trên sàn thật | Mở (test `host-mode` đỏ) |
| **A2** | P0 chặn | Antigravity | Form đặt lệnh **và nút nạp tiền ảo** khóa người chưa xác minh email, kể cả khi server không yêu cầu (`emailVerificationRequired: false`, đúng cấu hình sàn đang chạy) | Mở (test `host-mode` đỏ) |
| **W1** | P0 tạm | Chủ dự án | Cách tạo tài khoản owner ngay, trong lúc chờ A1 | Dùng được |
| **H1** | P0 | Chủ dự án | Sàn đang chạy bản UI cũ `d8391db`. **Sàn đang TẮT từ 20:40 (O1)**. `update` giờ chạy cả e2e: trước khi có A1+A2 thì dùng `update --skip-e2e` | Mở |
| **C1** | P1 | Claude Code | e2e chạy cấu hình "đăng ký mở + bắt xác minh email" nên không bắt được A1/A2; `host update` chỉ chạy `verify`, không chạy e2e | **Đã sửa** (`4e6ae6d`, `0747e95`) |
| **O1** | **P0** | Claude Code | Sàn đang chạy crash 2 lần trong ngày 11/10 (mã `0xC0000409`, lần 2 lúc 20:40), không tự khởi động lại, không có log nguyên nhân | **Đã phòng hộ** (tự khởi động lại; `e266f2d`, `660ca51`). Nguyên nhân gốc chưa rõ |
| B0 | — | — | Đo đối chiếu dữ liệu nến server ↔ Binance: **khớp** | Không phải lỗi |
| **B1** | — | Antigravity | Biểu đồ kéo dài / dựng trùng desktop+mobile | **Đã sửa** ở `7f929b6`, chưa lên sàn (H1) |
| **B2** | P1 | Antigravity | Trục thời gian của biểu đồ là UTC, còn TradingView và người dùng dùng giờ Việt Nam (UTC+7) | Mở |
| **B3** | P1 | Antigravity | Chỉ tải 180 nến, không kéo về quá khứ được (backend hỗ trợ `limit` ≤ 1000 và `endTime`) | Mở |
| **B4** | P1 | Antigravity | Gộp giá ticker vào nến cuối không kiểm tra khung thời gian → có thể vẽ râu giả lúc chuyển nến | Mở |
| **B5** | P2 | Antigravity | Nhãn trục giá kiểu Mỹ `83094.00`, còn app kiểu Việt `83.094,60` | Mở |
| **B6** | P2 | Antigravity | Danh sách cặp bên trái hiện `%` thô từ API (`0.292%`) khác header (`+0,29%`) | Mở |
| **B7** | — | — | Ghi chú để so với TradingView đúng cách (24h cuốn chiếu ≠ nến ngày…) | Hướng dẫn |
| **U1** | P2 | Antigravity | Mobile: thanh MUA/BÁN đè lên thanh điều hướng dưới ~6px; chú giải che nến; nút khung `1d` bị khuất | Mở |
| **U2** | P2 | Antigravity | Còn tồn từ PROMPT-11: chưa có EMA/RSI, chưa có `aria-label` nào, chưa có ErrorBoundary, còn 2 `alert()`, chưa dùng `publicConfig` | Mở |

---

## 2. Lỗi chặn người dùng thật (làm trước)

### A1 — Trang Đăng ký không gửi mã mời → không ai đăng ký được, không tạo được admin
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/pages/AuthPages.tsx` (RegisterPage), `apps/exchange/src/context/AuthContext.tsx` (`register`)
- **Bằng chứng:**
  - Sàn đang chạy: `GET /api/v1/config` trả `{"registration":"INVITE_ONLY","emailVerificationRequired":false,...}`.
  - Database sàn (cổng 5435): bảng `users` **0 dòng**; bảng `invites` có 3 mã "Chủ dự án", `uses = 0`.
  - `grep -rn invite apps/exchange/src` trên cả `d8391db` và `7f929b6`: **không có kết quả**. Trang đăng ký gọi `register({ email, name, password })`, không có `inviteCode`.
  - Server (`authService.register`) với `REGISTRATION=invite` gọi `invites.consume(tx, input.inviteCode)`. Thiếu mã → lỗi `400 INVALID_INVITE` (`details.reason = "MISSING"`).
  - Link mời in ra có dạng `<APP_URL>/register?invite=XXXX-XXXX` (`inviteService.ts:82`, `appLinks.register` trong `packages/contracts/src/apps.ts`).
- **Hệ quả:** Không đăng ký được thì không có tài khoản để `npm run host -- set-role <email> owner`. Vì vậy không ai vào được trang Quản trị.
- **Cách sửa:**
  1. Khi mở `/register`, đọc `?invite=` từ URL và điền sẵn vào ô **"Mã mời"**.
  2. Gọi `api.publicConfig()` (`GET /api/v1/config`): khi `registration === 'INVITE_ONLY'` thì ô "Mã mời" là bắt buộc và hiển thị rõ; khi `OPEN` thì ẩn.
  3. Gửi `inviteCode` trong body `register` (schema `RegisterRequest.inviteCode`, 4–40 ký tự).
  4. Đổi lỗi `INVALID_INVITE` theo `details.reason` (`InviteRefusal`) sang tiếng Việt:
     - `MISSING`: "Cần mã mời để đăng ký"
     - `UNKNOWN`: "Mã mời không đúng"
     - `EXPIRED`: "Mã mời đã hết hạn"
     - `USED_UP`: "Mã mời đã được dùng hết"
     - `REVOKED`: "Mã mời đã bị thu hồi"
  5. Nếu `publicConfig().captchaSiteKey` khác `null` thì hiện Turnstile (hiện tại sàn đang chạy trả `null`).
- **Nghiệm thu:** Trên hệ chạy ở chế độ mời (xem C1), mở link mời, đăng ký thành công; mở `/register` không có mã thì thấy lỗi tiếng Việt; dùng lại mã đã hết lượt thì thấy "đã được dùng hết".

### A2 — Form đặt lệnh khóa người chưa xác minh email dù server không yêu cầu
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/components/trading/OrderForm.tsx:545-552`, **`apps/exchange/src/pages/WalletPage.tsx:381-389`** (nút nạp tiền ảo: "Xác minh email để nạp tiền"), `Header.tsx:222,314` (banner nhắc xác minh)
- **Bằng chứng:** Sàn đang chạy có `REQUIRE_EMAIL_VERIFICATION=false` (`infra/host.mjs:56`) và `GET /api/v1/config` trả `emailVerificationRequired: false`. Email chưa gửi thật (`EMAIL_TRANSPORT=log`). Nhưng `OrderForm` dùng `isEmailUnverified = user && !user.emailVerified` để khóa nút ("Vui lòng xác minh email trước khi đặt lệnh"). Kết quả: trên sàn thật **không ai đặt lệnh được**, dù server sẽ nhận lệnh.
- **Cách sửa:** Chỉ khóa (form đặt lệnh **và** nút nạp tiền ảo) khi `publicConfig().emailVerificationRequired === true && !user.emailVerified`. Banner/nhắc xác minh trong Header cũng chỉ hiện khi bắt buộc. Server vẫn là bên quyết định: nếu server trả `EMAIL_NOT_VERIFIED` thì hiện thông báo đó.
- **Nghiệm thu:** Trên hệ `emailVerificationRequired: false`, tài khoản mới (chưa xác minh) nạp tiền ảo và mua Market được; trên hệ `true`, vẫn bị khóa như cũ (test `spot.spec` hiện tại).

### W1 — Cách tạm để tạo tài khoản owner ngay (chủ dự án tự làm, chờ A1)
1. Tạo mã mời mới (mã cũ vẫn còn hạn tới 25/10 nhưng bạn không còn thấy mã đầy đủ):
   ```bash
   npm run host -- invite "Chủ dự án"
   ```
   Chép dòng `code:` (dạng `XXXX-XXXX`).
2. Mở link sàn (trycloudflare) trên trình duyệt, nhấn **F12**, sang tab **Console**, dán đoạn dưới.
   - Thay 4 giá trị trong ngoặc: email, tên, mật khẩu ≥ 8 ký tự, mã mời.
   - Bạn tự gõ mật khẩu vào máy mình; **không gửi mật khẩu cho agent nào**.
   ```js
   await fetch('/api/v1/auth/register', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
     body: JSON.stringify({ email: 'EMAIL_CỦA_BẠN', name: 'TÊN', password: 'MẬT_KHẨU', inviteCode: 'MÃ_MỜI' }) }).then(r => r.json())
   ```
   Kết quả có `user` là đã tạo xong (trình duyệt cũng đã đăng nhập).
3. Cấp quyền owner:
   ```bash
   npm run host -- set-role EMAIL_CỦA_BẠN owner
   ```
4. Tải lại trang → **Cài đặt → Bảo mật → bật 2FA**.
   - Bật xong, phiên hiện tại được tính là đã qua 2FA (`authService.ts:291`), không cần đăng nhập lại.
   - Vào `/admin/`.
5. Nếu bước 2 báo `INVALID_INVITE`: mã gõ sai hoặc đã dùng → tạo mã mới ở bước 1.

### H1 — Sàn đang chạy bản UI cũ
- **Phụ trách:** Chủ dự án (chạy lệnh), sau khi A1 + A2 xong và `ui-check --e2e` xanh.
- **Bằng chứng:** `D:\Claude\crypto-host-data\version.json`: `"ui": "ui/gd2-exchange@d8391db"`, cập nhật lúc 10:07 ngày 11/10. Các bản sửa biểu đồ của Antigravity commit lúc ~19:16 cùng ngày.
- **Cách làm:**
  1. Trong cửa sổ đang chạy sàn: nhấn Ctrl+C.
  2. Cập nhật:
     ```bash
     npm run host -- update
     ```
     Từ `0747e95`, `update` chạy cả test trình duyệt, gồm nhóm `host-mode`. Khi A1/A2 chưa sửa, nhóm này đỏ: `update` dừng và **`start` từ chối chạy**, kể cả bản cũ. Muốn đưa bản sửa biểu đồ lên ngay (chấp nhận A1/A2 vẫn còn) thì chạy:
     ```bash
     npm run host -- update --skip-e2e
     ```
  3. Khởi động lại:
     ```bash
     npm run host -- start
     ```
  4. Link trycloudflare sẽ đổi; gửi link mới cho người dùng.
- **Nghiệm thu:** `version.json` ghi UI ≥ commit có A1+A2; trên link mới, biểu đồ nằm gọn trong ô, đăng ký bằng link mời được.

---

## 3. Hạ tầng / kiểm thử (Claude Code)

### C1 — e2e và `host update` không kiểm tra cấu hình của sàn thật
- **Phụ trách:** Claude Code · **File:** `server/scripts/e2eStack.ts`, `e2e/fixtures.ts`, `infra/host.mjs`
- **Vấn đề:**
  - Hệ e2e chạy `NODE_ENV=development`, tức là đăng ký mở và bắt xác minh email. Sàn thật thì ngược lại: chỉ đăng ký bằng mã mời và không bắt xác minh email. Vì vậy 27/27 xanh mà A1, A2 vẫn lọt.
  - `npm run host -- update` chỉ chạy `npm run verify`, không chạy e2e.
- **Cách sửa:**
  1. Thêm một dự án Playwright (ví dụ `host-mode`) chạy trên một hệ e2e thứ hai với `REGISTRATION=invite`, `REQUIRE_EMAIL_VERIFICATION=false`, `EMAIL_TRANSPORT=log`, giống `infra/host.mjs`.
  2. Viết test "mở link mời → đăng ký → nạp → mua Market" và "đăng ký không có mã → lỗi tiếng Việt". Tạo mã mời qua `scripts/createInvite.ts` với `DATABASE_URL` của hệ e2e.
  3. `host update`: chạy cả e2e (hoặc ít nhất dự án `host-mode`) trước khi ghi `version.json`; thêm cờ `--skip-e2e` cho trường hợp gấp.
- **Nghiệm thu:** Trên `7f929b6` (chưa có A1/A2), dự án `host-mode` **phải đỏ**; sau khi Antigravity sửa thì xanh.
- **Trạng thái: ĐÃ SỬA** (2026-10-11, `1315a83` → `4e6ae6d`, `0747e95`, `660ca51`):
  - `npm run e2e` dựng 2 hệ:
    - hệ thường: DB :5436, web :5190;
    - hệ `host-mode`: DB :5437, web :5191, `.e2e/host/`, `REGISTRATION=invite`, `REQUIRE_EMAIL_VERIFICATION=false`.
  - Trước khi chạy test, kiểm tra `/api/v1/config` của từng hệ có đúng cấu hình không.
  - Fixture `createInvite()`; tùy chọn `expectedApiErrors` cho lỗi 4xx cố ý.
  - 3 test trong `e2e/tests/host-mode/invite-signup.spec.ts`.
  - `ui-check` có thêm `--base <ref>`, `--no-verify`, `--keep`. Khi e2e đỏ, báo cáo được chép ra `.e2e/ui-check/`.
  - Khi sàn thật đang chạy (:8090), `ui-check`/`e2e` tự hạ độ ưu tiên CPU.
  - `npm run host -- update` chạy cả e2e; thêm cờ `--skip-e2e`. `version.json` ghi `"e2e"`.
  - **Kết quả thật** (`npm run ui-check -- --no-verify --e2e`, UI `48c9083` + main `55aae15`): **27 đạt, 3 đỏ (host-mode)**, đúng lý do:
    - "đăng ký phải gửi mã mời lấy từ link (?invite=)", Expected mã, Received `""` (A1);
    - nút nạp tiền "Xác minh email để nạp tiền (bị khóa)" và form "Vui lòng xác minh email trước khi đặt lệnh (bị khóa)" (A2);
    - "sau khi bấm Đăng ký phải hiện thông báo nói rõ cần mã mời", Received 0 (A1 bước 4).
  - `npm run verify` trên main: đạt, 213/213 test.

### O1 — Sàn đang chạy bị crash, không tự khởi động lại, không rõ nguyên nhân
- **Phụ trách:** Claude Code · **File:** `server/scripts/hostStack.ts`, `infra/host.mjs`
- **Bằng chứng:** `crypto-host-data/logs/server-2026-10-11.log`:
  - Phiên khởi động ~11:10 (giờ VN) chạy bình thường; ~50 giây sau mọi kết nối Binance đóng rồi nối lại ngay.
  - Sau đó là dòng `[host] server exited (3221226505)`, tức `0xC0000409`: tiến trình Node dừng đột ngột, thường do `abort()`, ví dụ hết bộ nhớ hoặc assert trong native.
  - **Không có dòng lỗi nào** trước đó (stderr của server có được ghi vào log).
  - Thời điểm crash không rõ (sau 11:11:57). Phiên kế tiếp chỉ bắt đầu lúc 20:12, khi chủ dự án tự chạy lại; sàn có thể đã nằm chết tới ~9 giờ.
  - Hiện tại tiến trình server dùng ~248 MB sau 25 phút.
  - **Lần 2: 20:40:01 cùng ngày**, cũng `server exited (3221226505)`, không có dòng lỗi nào trước đó; sàn tắt luôn (cổng 8090 không trả lời). Lúc đó trên cùng máy đang chạy `npm run ui-check -- --e2e` (npm install, tsc, vitest, build, Playwright). Test chỉ dùng các cổng riêng (5434/5436/5190) và chỉ dừng tiến trình theo PID của chính nó, **không** đụng tới tiến trình sàn; nhưng máy bị tải nặng, nên vẫn có thể liên quan.
  - Windows Event Log (Application) **không có** sự kiện crash nào của `node.exe`. Điều này khớp với việc Node tự `abort()` (lỗi fatal/assert trong native), vốn không tạo báo cáo WER.
  - Server chạy bằng `node --import tsx src/main.ts`, tức hook nạp module của tsx chạy trên luồng riêng. Một script thử của Claude Code (dùng WebSocket có sẵn của Node 24) cũng chết với `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c` lúc thoát, cùng loại lỗi native này trên Windows. Chưa chứng minh được là cùng nguyên nhân.
- **Cách sửa:**
  1. `hostStack.ts`: khi server thoát bất thường thì tự khởi động lại (chờ 5s → 30s → 2 phút), gửi cảnh báo Telegram kèm mã thoát, giữ PostgreSQL chạy.
  2. Chạy Node với `--report-on-fatalerror --report-directory=<logs>` (và `--heapsnapshot-near-heap-limit=1`) để lần sau có báo cáo nguyên nhân.
  3. Ghi bộ nhớ (`rss`, `heapUsed`) vào log mỗi 10 phút để thấy rò rỉ nếu có.
  4. Bản phục vụ người dùng không chạy qua tsx: build server ra JavaScript (esbuild/tsc) trong `host update` (và Dockerfile) rồi chạy `node dist/main.js`, bỏ hook nạp module lúc chạy thật.
  5. Trong lúc sàn đang phục vụ, không chạy `ui-check --e2e` / `verify` nặng trên cùng máy (hoặc hạ độ ưu tiên các tiến trình test).
- **Nghiệm thu:** Giết tiến trình server bằng `taskkill /F` → sàn tự lên lại trong ≤ 30s, có tin Telegram; có file report khi gặp lỗi fatal.
- **Trạng thái: ĐÃ PHÒNG HỘ, nguyên nhân gốc CHƯA RÕ** (2026-10-11, `89fd42b`/`e266f2d`, sửa sau review `660ca51`):
  - `hostStack.ts` thành supervisor:
    - server chết thì PostgreSQL vẫn chạy, server tự lên lại sau 5s → 30s → 2 phút; chạy ổn 10 phút thì đếm lại từ đầu (`src/ops/restartPolicy.ts` + test);
    - gửi cảnh báo Telegram mức critical;
    - log ghi giờ crash, thời gian đã chạy và mã thoát dạng hex;
    - chờ 1,5s trước khi coi là crash, để Ctrl+C của chủ dự án không bị tính là crash;
    - nếu tiến trình không tạo được thì cũng khởi động lại.
  - Node chạy với `--report-on-fatalerror --report-directory=host-data/logs`.
  - Server ghi bộ nhớ vào log mỗi 10 phút (`src/ops/memoryLog.ts`).
  - Sàn chạy bằng **bản build** `server/dist/main.js` (`npm run build -w @cex/server`, esbuild, `scripts/build.ts`), không qua tsx. `update` build nó.
  - `MIGRATIONS_DIR` tìm được từ cả mã nguồn lẫn bản build.
  - **Kết quả thật** (hệ thử PG :5439, server :8091, bản build):
    - `taskkill /F` server → "[host] server exited (1) — restarting in 5s (#1)" → trả lời lại sau **8,4s**, PostgreSQL chạy suốt;
    - đóng stdin → "[host] server exited (0)", "[host] PostgreSQL stopped", không khởi động lại, cổng đóng.
    - Ép hết bộ nhớ trên một tiến trình thử → có file `report.*.json`.
  - **Còn lại:**
    - Crash `0xC0000409` không để lại dòng lỗi nào, nên có thể là `abort` trong mã native (libuv/CRT). Loại này `--report-on-fatalerror` **không** bắt được.
    - Muốn bắt cần bật Windows crash dump cho `node.exe` (registry `LocalDumps`). Đây là cài đặt hệ thống, **chủ dự án tự quyết**.
    - Dockerfile (Railway) vẫn chạy tsx, chưa dùng bản build vì máy này không có docker để kiểm tra.

---

## 4. Biểu đồ và dữ liệu nến

### B0 — Đối chiếu dữ liệu nến: server khớp Binance (không phải lỗi, ghi lại để không ai "sửa" dữ liệu)
Đo ngày 11/10, khoảng 20:20–20:35 giờ VN:

| Kiểm tra | Kết quả |
|---|---|
| REST `GET /api/v1/market/candles/BTCUSDT?interval=1d&limit=3` (sàn đang chạy) so với `api.binance.com/api/v3/klines` | O/H/L/C/V **giống hệt** cả 3 nến |
| REST 15m, 6 nến BTCUSDT | **giống hệt** |
| Realtime `candles:BTCUSDT:1m` và `candles:XRPUSDT:1m` trong 75 giây, qua 2 lần chuyển phút | nến cuối cùng **giống hệt** Binance; nến cập nhật trung bình ~2 giây/lần (BTC), ~4 giây/lần (XRP) |
| Ticker 24h BTCUSDT (sàn) so với `api/v3/ticker/24hr` | last, %, volume, high, low **giống hệt** |
| Giá ticker so với lần khớp mới nhất trên kênh `trades:` | 0/73 (BTC), 0/32 (XRP) lệch |

Script đo nằm trong mục "Cách tự đo lại" ở cuối file.

### B1 — Biểu đồ bị kéo dài, dựng trùng biểu đồ — ĐÃ SỬA trên nhánh (`33e873c`, `b212697`, `7f929b6`)
- Đo bản `7f929b6`:
  - Desktop (trang XRP và BTC): `.tv-lightweight-charts` cao 468px và 560px, đều bằng ô chứa nó.
  - 375×812: 407px.
  - Chỉ có 1 biểu đồ.
  - e2e `chart-dimensions.spec` đạt ở 1366/1440/1920.
- Còn lại: đưa lên sàn đang chạy (H1).

### B2 — Trục thời gian của biểu đồ là UTC
- **File:** `CandlestickChart.tsx` (~dòng 476-489): `timeFormatter` dùng `getUTCHours()`, `tickMarkFormatter` mặc định (UTC). Chú giải có hiện thêm "20:30 VN" nhưng **trục thời gian vẫn là UTC**.
- **Hệ quả:** So với TradingView (người dùng Việt Nam để UTC+7), cùng một cây nến hiện lệch 7 giờ trên trục.
- **Cách sửa:**
  1. Hiển thị theo múi giờ người dùng (mặc định `Asia/Ho_Chi_Minh`; có thể thêm tùy chọn trong Cài đặt): đặt cả `localization.timeFormatter` và `timeScale.tickMarkFormatter`, dùng `Intl.DateTimeFormat('vi-VN', { timeZone })`.
  2. Không đổi dữ liệu: `openTime` vẫn là mốc UTC.
  3. Ghi chú: nến ngày của Binance mở lúc 00:00 UTC = 07:00 VN, TradingView (sàn Binance) cũng vậy.
- **Nghiệm thu:** Nến 15m có `openTime = 13:15 UTC` hiện "20:15" trên trục và crosshair, giống TradingView.

### B3 — Chỉ tải 180 nến, không kéo về quá khứ được
- **File:** `CandlestickChart.tsx` (`limit: 180`).
- **Backend đã có:** `CandlesQuery.limit` tối đa 1000, `endTime` lấy các nến có `openTime < endTime` (`packages/contracts/src/market.ts:140-145`). Thử trên sàn: `limit=1000` 15m trả 1000 nến; 1d trả 500 nến (từ 30/05/2025).
- **Cách sửa:**
  1. Tải đầu 500 nến.
  2. `subscribeVisibleLogicalRangeChange`: khi mép trái còn < 50 nến thì tải thêm 500 nến với `endTime = openTime của nến đầu`.
  3. Ghép vào đầu, loại trùng theo `openTime`, giữ vị trí cuộn (không `fitContent`).
  4. Chặn gọi trùng khi đang tải; trả về rỗng thì dừng.
- **Nghiệm thu:** Khung 1d kéo về được tới tháng 5/2025; khung 15m kéo liên tục không giật, không nhảy về cuối.

### B4 — Gộp giá ticker vào nến cuối có thể tạo râu giả lúc chuyển nến
- **File:** `CandlestickChart.tsx`, effect "8. Live Price Tick Synchronization" (~dòng 906-958).
- **Vấn đề:**
  - Mỗi lần `activeTicker` đổi, code ghép `lastPrice` vào `lastCandleRef` (đổi close, nới high/low) mà **không kiểm tra giá đó thuộc khung thời gian nào**.
  - Ticker đến theo lô ≤ 1 lần/giây, rồi qua throttle 500ms ở `MarketContext`.
  - Lúc chuyển sang nến mới: giá cũ có thể bị ghép vào nến mới (râu kéo về giá kỳ trước), hoặc giá kỳ mới ghép vào nến vừa đóng.
- **Đo:** 75 giây qua 2 lần chuyển phút (BTC, XRP; thị trường yên) chưa thấy râu giả (0/73, 0/32). Đây là **rủi ro**, chưa phải nguyên nhân của hình ảnh lệch hiện tại.
- **Cách sửa:** Bỏ việc ghép ticker vào nến; nến chỉ cập nhật từ kênh `candles:<SYMBOL>:<interval>` (~2 giây/lần). Muốn mượt hơn thì cập nhật từ kênh `trades:<SYMBOL>` **chỉ khi** `trade.time ∈ [openTime, openTime + interval)` của nến cuối. Hiệu ứng nháy giá vẫn giữ (chỉ là hiển thị).
- **Nghiệm thu:** Sau 30 phút mở khung 1m, mọi nến đã đóng trên biểu đồ khớp Binance REST (viết thêm một kiểm tra so `series.data()` với `/market/candles`).

### B5 — Nhãn trục giá kiểu Mỹ
- Mobile hiện `83094.00`, `82800.00`; app hiện `83.094,60`. Dùng `priceFormat: { type: 'custom', formatter }` với `formatDecimal` của `@cex/ui`, số chữ số theo `tickSize`.

### B6 — Phần trăm ở danh sách cặp bên trái không thống nhất
- Trang Giao dịch, bản `7f929b6`: header `+0,29%`, danh sách bên trái `0.292%`, `-0.400%` (chuỗi thô từ API: dấu chấm, 3 số lẻ, không có dấu `+`).
- Dùng `PercentChange` / hàm định dạng chung của `@cex/ui` ở mọi chỗ.

### B7 — So với TradingView cho đúng (hướng dẫn, không phải lỗi)
- **"Thay đổi 24h"** của sàn là **24 giờ cuốn chiếu** (giống Binance). TradingView ở khung 1D hiện thay đổi **từ 07:00 sáng nay** (mở nến ngày), nên hai số khác nhau là bình thường (ví dụ 0,31% so với 0,16%).
- **"Vol"** ở danh sách là khối lượng 24h (BTC ~5.791). Số `15.3K` trên TradingView là khối lượng **của cây nến ngày đang trỏ chuột**.
- **Khung mặc định** của sàn là 15m; ảnh TradingView đang ở 1D. So cùng khung và cùng múi giờ (B2).
- Tooltip "24h cuốn chiếu" cạnh ô "Thay đổi 24h" sẽ giúp người dùng đỡ nhầm (Antigravity, P2).

---

## 5. Giao diện khác (Antigravity, P2)

### U1 — Mobile (375×812, bản `7f929b6`)
- Thanh cố định MUA/BÁN (y 699–764) đè lên thanh điều hướng dưới (y 758–812) khoảng 6px. Đặt `bottom` bằng chiều cao nav + `env(safe-area-inset-bottom)`.
- Chú giải O/H/L/C chiếm 2 dòng và che phần trên của nến. Trên mobile: rút gọn còn 1 dòng hoặc chỉ hiện khi chạm.
- Hàng nút khung thời gian bị cắt (`4h` khuất một nửa, `1d` không thấy). Cho cuộn ngang có gợi ý, hoặc gom vào menu.

### U2 — Mục còn tồn từ PROMPT-11 (kiểm tra trên `7f929b6`)

| Mục | Hiện trạng |
|---|---|
| Chỉ báo EMA, RSI (P08 yêu cầu) | chưa có |
| `aria-label` cho nút chỉ có icon | **0** trong `apps/exchange` |
| ErrorBoundary quanh trang | chưa có |
| `alert()` ở `Header.tsx` (gửi lại email xác minh) | còn 2 |
| `publicConfig` (liên quan A1, A2) | chưa dùng |
| `as any` | còn 7 |
| Code-splitting (`React.lazy`) | đã có |
| Ngôi sao yêu thích ở trang Giao dịch | đã có |

---

## 6. Cách tự đo lại

- **Toàn bộ kiểm tra nhánh UI:**
  ```bash
  npm run ui-check -- --e2e
  ```
  Phải xanh.
- **Bản nào đang phục vụ người dùng:** xem `D:\Claude\crypto\host-data\version.json`.
- **Đăng ký / xác minh trên sàn đang chạy:** `curl http://localhost:8090/api/v1/config`.
- **So nến với Binance:** gọi `GET /api/v1/market/candles/<SYMBOL>?interval=<i>&limit=N` của sàn và `https://api.binance.com/api/v3/klines?symbol=<SYMBOL>&interval=<i>&limit=N`, so từng O/H/L/C/V.
- **Đo biểu đồ trong trình duyệt** (DevTools console):
  ```js
  [...document.querySelectorAll('.tv-lightweight-charts')].map(c => [c.getBoundingClientRect().height, c.parentElement.getBoundingClientRect().height])
  ```
  Phải đúng 1 phần tử, hai số bằng nhau và không đổi sau 5 giây.

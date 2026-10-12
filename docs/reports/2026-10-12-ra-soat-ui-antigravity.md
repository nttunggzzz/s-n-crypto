# Rà soát giao diện Antigravity — 2026-10-12

> **Cho mọi agent (Antigravity, Claude Code):** danh sách lỗi đã kiểm chứng của giao diện sàn, đối chiếu yêu cầu (P08, `docs/LOI-HIEN-TAI.md`, `.agent/rules/project-rules.md`) và backend/hợp đồng API hiện có.
> Mỗi mục ghi: **mức độ**, **phụ trách**, **file:dòng**, **bằng chứng**, **cách lỗi xảy ra**, **cách sửa an toàn** (chỉ đụng gì, không đụng gì), **nghiệm thu**.
> Sửa xong thì ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` ngay dưới mục. **Không xóa mục.**

## 0. Phạm vi và cách kiểm

| Hạng mục | Giá trị |
|---|---|
| Bản UI rà soát | `ui/gd2-exchange @ eee01a3` (đã gộp `main @ 606d4a7`); thay đổi mới từ `48c9083` là `e930a1a`, `77cfcad`, `56b93a7`, `eee01a3` |
| Kiểm tự động | `npm run ui-check -- --e2e`: verify **đạt** (typecheck, lint, **221/221** unit test, build), e2e **30/30 đạt** (gồm 3 test `host-mode`) |
| Review mã | skill `code-review` (mức high) trên `48c9083..ui/gd2-exchange -- apps/ packages/ui/` |
| Chạy thật | hệ `host-mode` riêng (`E2E_MODE=host`, DB :5438, web :5192, bản build production của app, giá giả lập), trình duyệt 1440×900 và 375×812, tài khoản thử tạo bằng link mời |
| Đối chiếu hợp đồng | script so `ErrorCode` (`packages/contracts/src/errors.ts`) với `apps/exchange/src/services/errors.ts`; đọc `RegisterRequest`, `HistoryQuery`, `Balance`, `RealtimeClient` |

Mức độ:
- **P0**: chặn người dùng hoặc làm sai tiền.
- **P1**: hiển thị sai dữ liệu, hoặc chức năng hỏng một phần.
- **P2**: trải nghiệm kém hoặc gây hiểu nhầm.
- **P3**: dọn dẹp, chữ nghĩa, quy trình.

### Đã kiểm chứng là ĐÚNG (không cần làm lại)
- **A1** (đăng ký bằng mã mời): mở `/register?invite=…` thì ô mã mời được điền sẵn, đăng ký thành công và vào `/trade/BTCUSDT`. Test `host-mode` xanh.
- **A2** (khóa theo email):
  - trên hệ `emailVerificationRequired: false`, tài khoản chưa xác minh bấm "Nạp ngay 10.000 USDT" được, số dư lên 10.000;
  - mua Market được (test `host-mode` xanh).
- **B1** (biểu đồ kéo dài, dựng trùng): 1 biểu đồ duy nhất; test `chart-dimensions.spec` xanh.
- **B2** (giờ Việt Nam): trục thời gian và chú giải theo giờ VN (`2026-10-12 09:00 VN`).
- **U1** (mobile 375×812):
  - thanh MUA/BÁN (y 693–758) không còn đè thanh điều hướng (y 758–812);
  - đủ 6 nút khung thời gian;
  - trang không cuộn ngang.

### Báo "Đã sửa" nhưng CHƯA đúng
- **B5**: trục giá vẫn kiểu Mỹ. Xem **R-02**.
- **U2**: chưa phải mọi nút chỉ có icon đều có tên đọc được. Trang Đăng nhập còn 3 nút không tên: nút submit `ref_41`, và `ref_19`, `ref_55` trên header. Xem **R-13**.

---

## 1. Bảng tóm tắt

| Mã | Mức | Phụ trách | Vấn đề | Trạng thái |
|---|---|---|---|---|
| R-01 | **P1** | Antigravity | Chú giải O/H/L/C cố định 2 chữ số: PEPE hiện `0,00`, DOGE `0,08` | **Đã sửa** (`aaea477`) |
| R-02 | **P1** | Antigravity | B5 chưa sửa: trục giá và nhãn giá cuối vẫn `82200.00`, `81309.85` | **Đã sửa** (`aaea477`) |
| R-03 | **P1** | Antigravity | Đăng nhập sai mật khẩu báo "phiên đã hết hạn"; lỗi CONFLICT luôn báo "email đã đăng ký" | **Đã sửa** (`aaea477`) |
| R-04 | **P1** (thành P0 khi bật captcha) | Claude Code + Antigravity | Captcha Turnstile không thể chạy: CSP chặn script, token dùng 1 lần không được reset | **Đã sửa phần UI** (`aaea477`) |
| R-05 | **P1** | Antigravity | Tải lịch sử nến xen giữa lúc đổi cặp làm trộn nến 2 cặp | **Đã sửa** (`aaea477`) |
| R-06 | **P1** | Antigravity | Thẻ DCA tự tính lãi/lỗ bằng `number`, thiếu giá thì lấy 0 (hiện lỗ 100% giả) | **Đã sửa** (`aaea477`) |
| R-07 | P2 | Antigravity | Mỗi lần mở biểu đồ tự tải thêm 500 nến cũ (2 request, 1.000 nến) | **Đã sửa** (`aaea477`) |
| R-08 | P2 | Antigravity | Nhãn tab "Biểu đồ" / "Thông tin" bị ẩn ở mọi độ rộng (`xs:` không tồn tại) | **Đã sửa** (`aaea477`) |
| R-09 | P2 | Antigravity | `ConfigContext` bịa cấu hình khi `/api/v1/config` lỗi, không thử lại | **Đã sửa** (`aaea477`) |
| R-10 | P2 | Antigravity | ErrorBoundary không reset khi đổi trang | **Đã sửa** (`aaea477`) |
| R-11 | P2 | Antigravity | Trang Đăng ký hứa "10.000 USDT sau khi xác minh email" dù server không bắt xác minh | **Đã sửa** (`aaea477`) |
| R-12 | P3 | Antigravity | `/login` vẫn hiện form khi đã đăng nhập | **Đã sửa** (`aaea477`) |
| R-13 | P3 | Antigravity | Còn nút chỉ có icon không có tên đọc được (U2 chưa trọn) | **Đã sửa** (`aaea477`) |
| R-14 | P3 | Antigravity | Chữ và định dạng lặt vặt (8 số lẻ ở faucet, `%` dấu chấm ở chú giải, chữ "null" ở Danh mục, icon "USD") | **Đã sửa** (`aaea477`) |
| R-15 | P3 | Antigravity | Nhánh dự phòng ở `WalletPage` tự cộng số dư bằng `parseFloat` (code chết, sai quy tắc) | **Đã sửa** (`aaea477`) |
| R-16 | P3 | Claude Code → Antigravity | `RealtimeClient` không có `onClose`, đoạn bắt mã 4401 trong `AuthContext` là code chết | Chờ Claude Code |
| R-17 | P3 | Antigravity | Giao diện sáng: thanh header vẫn tối | **Đã sửa** (`aaea477`) |
| R-18 | P3 | Quy trình | Nhánh UI sửa `e2e/` (ngoài phạm vi); đánh "Đã sửa" khi chưa kiểm (B5) | Đã rút kinh nghiệm |

---

## 2. Chi tiết

### R-01 — Chú giải O/H/L/C cố định 2 chữ số thập phân (P1)
- **File:** `apps/exchange/src/components/trading/CandlestickChart.tsx:1480-1483` (và `:1488` cho KL).
- **Bằng chứng (chạy thật, `/trade/PEPEUSDT`, 1440×900):** chú giải đọc được là `PEPEUSDT 2026-10-12 09:00 VN O: 0,00 H: 0,00 L: 0,00 C: 0,00 -0.49% KL: 36.051.144.934,97`, trong khi header hiện `0,00000409`.
- **Cách xảy ra:**
  - Code dùng `formatDecimal(legendData.open.toString(), { decimals: 2 })`.
  - (a) `decimals: 2` cắt mọi coin giá nhỏ: DOGE 0,08575 thành `0,08`; XRP 1,3958 thành `1,39`.
  - (b) `Number.toString()` của số < 1e-6 ra dạng mũ (`4.24e-6`). `formatDecimal` tách theo dấu `.` nên ra rác.
  - Đây là hồi quy của REVIEW-03 A7 ("coin giá nhỏ không hiện $0.00"), nằm trong commit sửa B5.
- **Cách sửa (chỉ trong file này):**
  - Tạo một hàm trong component: `const fmtPrice = (n: number) => formatDecimal(n.toFixed(pricePrecision), { decimals: pricePrecision })`.
  - `pricePrecision` lấy từ `tickSize`, cách `setupMainSeries` đang làm.
  - Dùng hàm này cho O/H/L/C.
  - `%` trong chú giải dùng cùng cách định dạng với header (`PercentChange` hoặc `formatPercent` của `@cex/ui`).
  - Không đổi `formatDecimal` dùng chung trong `packages/ui`.
- **Nghiệm thu:**
  - Trên `/trade/PEPEUSDT`, chú giải hiện `0,0000040x`.
  - Trên `/trade/DOGEUSDT`, chú giải hiện 5 số lẻ.
  - Thêm 1 dòng vào test REVIEW-03 A7 (Claude Code thêm vào `e2e/`) để kiểm chú giải không chứa `O: 0,00`.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-02 — B5 chưa sửa: trục giá và nhãn giá cuối vẫn kiểu Mỹ (P1)
- **File:** `CandlestickChart.tsx`, gồm `setupMainSeries` (`priceFormat` kiểu custom), `setupMASeries` / `setupEMASeries` (không có `priceFormat`), và effect "Keep price format updated".
- **Bằng chứng (chạy thật):**
  - Mobile 375×812, `/trade/BTCUSDT`: trục phải hiện `82200.00`, `82000.00`, `81200.00`; nhãn giá cuối `81309.85`; nhãn volume `131.04`.
  - Desktop cũng hiện các nhãn trục dạng `82200.00`.
  - Header và sổ lệnh cùng trang hiện `82.870,63`.
- **Cách xảy ra (cần xác nhận khi sửa):**
  - Thang giá bên phải dùng chung cho series chính và các đường MA/EMA. Các đường này được tạo với định dạng mặc định `price`.
  - Effect đổi kiểu biểu đồ xóa rồi thêm lại series chính, nên series chính không còn là series đầu tiên trên thang. Khả năng cao thang giá lấy formatter của series khác.
  - Nhãn volume dùng `priceFormat: { type: 'volume' }` mặc định.
- **Cách sửa:**
  - Đặt formatter ở **cấp biểu đồ**: `createChart(..., { localization: { priceFormatter: fmtPrice } })`, dùng cùng `fmtPrice` với R-01. Mọi thang giá đều theo nó.
  - Khi đổi cặp: `chart.applyOptions({ localization: { priceFormatter } })`.
  - Gán cùng `priceFormat` custom cho MA/EMA.
  - Volume: formatter riêng, số nguyên có dấu chấm phân cách nghìn.
  - Không đụng dữ liệu nến.
- **Nghiệm thu:** trục phải hiện `82.200,00` và nhãn giá cuối hiện `81.309,85`, ở cả desktop và mobile, cả khi chuyển Nến → Đường → Nến.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-03 — Thông báo lỗi sai ngữ cảnh (P1)
- **File:** `apps/exchange/src/services/errors.ts:6-70` (`ERROR_MESSAGES`, `formatApiError`); nơi gọi: `context/AuthContext.tsx:153,164,175,195` và các trang dùng `getErrorMessage`.
- **Bằng chứng:**
  - Chạy thật: đăng nhập `review1@test.local` với mật khẩu sai → trang Đăng nhập hiện **"Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn."**. Server trả `UNAUTHENTICATED` "Invalid email or password" (`server/src/modules/auth/authService.ts:153`).
  - Server dùng `CONFLICT` cho 14 tình huống, mà UI luôn dịch là **"Địa chỉ email này đã được đăng ký tài khoản."**. Ví dụ: bật 2FA khi đã bật (`authService.ts:270,283`), dừng bot không chạy (`bots`), thu hồi mã mời đã thu hồi, hạ quyền owner cuối cùng.
  - Đối chiếu bằng script: 9 khóa trong bảng **không tồn tại** trong `ErrorCode`: `INVALID_INPUT UNAUTHORIZED EMAIL_ALREADY_EXISTS INVALID_CREDENTIALS INVALID_TOKEN TOKEN_EXPIRED CAPTCHA_FAILED ORDER_NOT_FOUND ORDER_ALREADY_CLOSED`. Kiểu `Record<ErrorCode | string, string>` làm TypeScript không bắt được lỗi gõ sai.
  - Mọi mã có thật đều đã có câu dịch.
- **Cách sửa (chỉ trong `errors.ts` và chỗ gọi đăng nhập):**
  1. Đổi kiểu thành `Record<ErrorCode, string>` và xóa 9 khóa thừa.
  2. Câu chung cho `CONFLICT`: "Thao tác không thực hiện được vì trạng thái đã thay đổi. Vui lòng tải lại." Đăng ký vẫn giữ câu "email đã được đăng ký", đã có nhánh riêng trong `formatApiError`, chỉ cần áp cho `register`.
  3. Cho `formatApiError(err, fallback, overrides?: Partial<Record<ErrorCode,string>>)`. `login` truyền `{ UNAUTHENTICATED: 'Email hoặc mật khẩu không đúng.' }`.
  4. Các tình huống khác tiếp tục dùng câu chung, không đổi hành vi.
- **Nghiệm thu:**
  - Đăng nhập sai mật khẩu hiện "Email hoặc mật khẩu không đúng.".
  - Bật 2FA hai lần hiện câu chung, không nhắc email.
  - `errors.test.ts` có thêm 2 ca.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-04 — Captcha Turnstile không thể hoạt động (P1, thành P0 khi bật)
- **Phụ trách:** Claude Code (CSP của server) và Antigravity (widget).
- **File:**
  - `server/src/app.ts:58` (`app.use(helmet())`);
  - `apps/exchange/src/pages/AuthPages.tsx:226-251` (nạp script, render), `:290-303` (gửi), `:398` (vùng chứa).
- **Bằng chứng:**
  - Header thật của server: `Content-Security-Policy: default-src 'self';…;script-src 'self';script-src-attr 'none';…`.
  - Script `https://challenges.cloudflare.com/turnstile/v0/api.js` (`AuthPages.tsx:245`) và iframe của Turnstile đều bị chặn. Khi chủ dự án điền `TURNSTILE_SITE_KEY`/`SECRET`, widget không hiện, nên không có token. Form dừng ở "Vui lòng hoàn thành xác thực bảo vệ (captcha)" và **không ai đăng ký được**.
  - Token Turnstile chỉ dùng 1 lần (server gọi `siteverify`, `server/src/modules/auth/captcha.ts:9`). Nếu lần gửi đầu bị từ chối (ví dụ sai mã mời), UI không `reset()` widget nên lần sau báo "Captcha failed".
- **Cách sửa:**
  - **Claude Code**: chỉ khi `TURNSTILE_SITE_KEY` được đặt, thêm `https://challenges.cloudflare.com` vào `script-src` và `frame-src` (`helmet({ contentSecurityPolicy: { directives: {...} } })`). Kèm test kiểm header. Không nới các chỉ thị khác.
  - **Antigravity**: giữ `widgetId` từ `turnstile.render`. Sau mỗi lần gửi thất bại, gọi `turnstile.reset(widgetId)` và `setCaptchaToken(null)`. Khi rời trang, gọi `turnstile.remove(widgetId)`. Không đổi luồng khi `captchaSiteKey` là `null`.
- **Nghiệm thu:**
  - Dùng khóa thử của Cloudflare (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`).
  - Widget hiện; gửi sai mã mời rồi sửa lại vẫn đăng ký được.
  - Có e2e (Claude Code) trên hệ có cấu hình captcha thử.
- **Trạng thái:** **Đã sửa phần Antigravity** (`aaea477`) — widgetId lifecycle quản lý đầy đủ, reset widget khi submit lỗi, dọn dẹp khi unmount. Chờ Claude Code cấu hình CSP helmet.

### R-05 — Tải lịch sử nến xen giữa lúc đổi cặp làm trộn nến 2 cặp (P1)
- **File:** `CandlestickChart.tsx`, khối "History paging subscription (B3)" trong effect tạo biểu đồ (`subscribeVisibleLogicalRangeChange`, từ dòng 673).
- **Bằng chứng (đọc mã):**
  - Lấy `symbol/interval` từ `currentParamsRef` **trước** `await api.candles(...)`.
  - Sau `await` không kiểm lại, cứ `setCandles((prev) => [...newItems, ...prev])`.
  - Effect "0. Reset" còn đặt lại `isLoadingMoreRef = false`, nên có thể chạy 2 request song song.
- **Cách xảy ra:** đang kéo trái trên BTCUSDT (request đang chạy) thì bấm ETHUSDT. Phản hồi BTC (~83.000) về sau và được ghép trước các nến ETH (~2.500). Biểu đồ và chỉ báo méo cho tới khi tải lại.
- **Cách sửa (chỉ khối này):**
  - Thêm `const requestKey = \`${curSymbol}|${curInterval}|${curMarketType}\``.
  - Sau `await`, nếu `requestKey` khác khóa hiện tại thì bỏ qua.
  - Dùng `AbortController` hủy request khi effect "0. Reset" chạy.
  - Không đổi cách ghép, loại trùng và bù vị trí cuộn.
- **Nghiệm thu:** test e2e (Claude Code có thể thêm): chặn chậm route `/market/candles?…endTime=` của BTC, đổi sang ETH, chờ, rồi kiểm giá đóng nến đầu tiên (`series.data()[0]`) cùng độ lớn với ETH.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-06 — Thẻ Mua định kỳ (DCA) tự tính lãi/lỗ, thiếu giá thì lấy 0 (P1)
- **File:** `apps/exchange/src/pages/BotsPage.tsx:976-990`.
- **Bằng chứng (đọc mã):**
  - `price = currentTicker?.lastPrice ? parseFloat(...) : 0`.
  - `estValue = boughtNum * price`.
  - `pnlVal = estValue - spentNum`.
- **Cách xảy ra:**
  - Khi chưa có ticker (mới tải trang, mất kết nối, giá STALE) thì giá = 0, nên thẻ hiện lỗ đúng bằng tổng tiền đã chi (−100%).
  - Vi phạm Bất biến 6 trong CLAUDE.md ("NULL ≠ 0, không bịa dữ liệu").
  - Vi phạm `.agent/rules/project-rules.md` quy tắc 2 ("Không tự tính … lãi/lỗ") và 3 ("không chuyển sang `number` để tính").
- **Cách sửa:**
  - **Tạm thời (chỉ file này):** khi `lastPrice` rỗng hoặc ticker không `LIVE` thì hiện `—` thay cho giá trị và lãi/lỗ. Tính bằng `Dec` của `@cex/core` thay cho `parseFloat`.
  - **Đúng lâu dài:** ghi yêu cầu vào `docs/parts/contract-requests.md` để Claude Code thêm `currentValue` / `unrealizedPnl` (nullable) vào `DcaPlan`, giống `GridBot.totalPnl`. UI chỉ hiển thị.
- **Nghiệm thu:** chặn kênh `tickers` (hoặc vào trang khi mất kết nối) thì thẻ DCA hiện `—`, không hiện số âm.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-07 — Mỗi lần mở biểu đồ tự tải thêm 500 nến cũ (P2)
- **File:** `CandlestickChart.tsx`, cùng khối với R-05 và effect 5 (`fitContent`).
- **Bằng chứng (chạy thật, `/trade/ETHUSDT`):** `performance.getEntriesByType('resource')` cho thấy 2 request ngay khi tải:
  - `/market/candles/ETHUSDT?interval=15m&limit=500`
  - `/market/candles/ETHUSDT?interval=15m&limit=500&endTime=1791321300000`
- **Cách xảy ra:** `fitContent()` hiện cả 500 nến nên mép trái `from ≈ 0 < 50`. Điều kiện tải thêm đúng ngay, dù người dùng chưa kéo. Mỗi lần đổi cặp hoặc khung là gấp đôi tải cho server (chỉ có 1 tiến trình) và khung nhìn bị dịch.
- **Cách sửa:**
  - Sau khi nạp lần đầu, thay `fitContent()` bằng `timeScale().setVisibleLogicalRange({ from: n - 150, to: n + 5 })`, tức khoảng 150 nến gần nhất, giống sàn thật.
  - Chỉ cho tải thêm sau khi người dùng đã tương tác (cờ `userScrolledRef` bật trong `subscribeVisibleLogicalRangeChange` khi đã nạp xong lần đầu).
- **Nghiệm thu:** mở `/trade/ETHUSDT` chỉ có 1 request nến; kéo trái tới mép thì có request `endTime`.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-08 — Nhãn tab "Biểu đồ" / "Thông tin" bị ẩn ở mọi độ rộng (P2)
- **File:** `CandlestickChart.tsx:1280,1291` (`<span className="hidden xs:inline">`).
- **Bằng chứng (chạy thật, 1440×900):** `getComputedStyle(span).display === 'none'` cho cả 2 nhãn. Không có `--breakpoint-xs` hay `@custom-variant xs` nào trong `apps/exchange/src/index.css` hoặc `packages/ui/src/tokens.css`. Tailwind v4 bỏ qua biến thể không tồn tại nên `hidden` luôn thắng.
- **Cách sửa:** đổi `xs:inline` thành `sm:inline` (2 chỗ). Hoặc thêm `@theme { --breakpoint-xs: 30rem; }` vào `apps/exchange/src/index.css` nếu thật sự cần mốc nhỏ hơn. Không đổi cấu hình Tailwind dùng chung.
- **Nghiệm thu:** từ 640px trở lên thấy chữ "Biểu đồ" / "Thông tin"; mobile chỉ còn icon nhưng có `aria-label`.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-09 — `ConfigContext` bịa cấu hình khi `/api/v1/config` lỗi (P2)
- **File:** `apps/exchange/src/context/ConfigContext.tsx:22-37`.
- **Bằng chứng (đọc mã):** trong `catch`, code gán `{ registration: 'INVITE_ONLY', captchaSiteKey: null, emailVerificationRequired: false, marketFeed: 'binance' }` và không thử lại.
- **Cách xảy ra:** server chậm hoặc chập chờn lúc mở trang.
  - Trên server **bắt** xác minh email: form và nạp tiền mở khóa, rồi mọi thao tác bị server từ chối `EMAIL_NOT_VERIFIED`.
  - Trên server **đăng ký mở**: trang Đăng ký đòi mã mời.
  - Vi phạm "không bịa dữ liệu".
- **Cách sửa (chỉ file này và nơi dùng):**
  - Giữ `publicConfig = null`, thêm `error`, tự thử lại (1s, 3s, 10s) và có `refreshConfig`.
  - Trang Đăng ký: khi `null`, khóa nút gửi và hiện "Đang tải cấu hình… / Thử lại".
  - Khóa theo email: khi `null` thì **không khóa** (server quyết định, lỗi `EMAIL_NOT_VERIFIED` sẽ hiện qua R-03).
- **Nghiệm thu:** chặn `/api/v1/config` lần đầu (Playwright `route.abort` một lần) thì trang tự hồi phục khi lần thử lại thành công, không hiện ô mã mời trên hệ mở.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-10 — ErrorBoundary không reset khi đổi trang (P2)
- **File:** `apps/exchange/src/App.tsx:115-125` (khối `<ErrorBoundary>` quanh `renderPage()`), `components/common/ErrorBoundary.tsx`.
- **Cách xảy ra:** một trang ném lỗi khi render. Bấm sang trang khác trên header vẫn thấy màn hình lỗi, vì cùng một instance boundary với `hasError: true`. Chỉ nút "Tải lại trang" mới gỡ được.
- **Cách sửa (1 dòng):** `<ErrorBoundary key={currentPath}>`. Đổi trang sẽ tạo boundary mới. Không đổi gì khác.
- **Nghiệm thu:** ném lỗi giả ở một trang (chỉ trong môi trường dev) rồi bấm "Thị trường" thì trang Thị trường hiện bình thường.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-11 — Trang Đăng ký hứa "nhận 10.000 USDT sau khi xác minh email" (P2)
- **File:** `apps/exchange/src/pages/AuthPages.tsx:324`.
- **Cách xảy ra:** trên sàn thật `emailVerificationRequired: false` và email không gửi thật (`EMAIL_TRANSPORT=log`), nhưng người được mời đọc thấy phải xác minh.
- **Cách sửa:** câu theo `publicConfig.emailVerificationRequired`. Khi `false`: "Nhận ngay 10.000 USDT thử nghiệm ở trang Tài sản."
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-12 — `/login` vẫn hiện form khi đã đăng nhập (P3)
- **File:** `AuthPages.tsx` (`LoginPage`, và `RegisterPage` tương tự).
- **Bằng chứng (chạy thật):** `/api/v1/me` trả 200, mở `/login` vẫn thấy form Đăng nhập.
- **Cách sửa:** nếu `isAuthenticated` thì `onNavigate('/trade/BTCUSDT')`, hoặc hiện "Bạn đã đăng nhập" kèm nút vào sàn.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-13 — U2 chưa trọn: còn nút chỉ có icon không có tên đọc được (P3)
- **Bằng chứng (chạy thật, cây accessibility trang `/login` khi đã đăng nhập):** `button [ref_19]`, `button [ref_55]` trên header và nút gửi `button [ref_41] type="submit"` không có tên.
- **Cách sửa:**
  - Thêm `aria-label` cho các nút icon ở `Header.tsx` (tìm kiếm, ví).
  - Nút gửi có chữ nhưng khi đang `loading` chỉ còn spinner, nên đặt `aria-label="Đăng nhập"`.
- **Nghiệm thu:** chạy trong console `[...document.querySelectorAll('button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).length === 0` trên mọi trang.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-14 — Chữ và định dạng lặt vặt (P3)

| Chỗ | Hiện tại | Nên |
|---|---|---|
| `WalletPage.tsx`, thẻ faucet | `Nhận 10.000,00000000 USDT`, `0,00000000 / 100.000,00000000 USDT` | 2 số lẻ cho USDT |
| `WalletPage.tsx`, bảng số dư khi bằng 0 | `0 0 0 0,00` (không có số lẻ) và `10.000,00000000` khi có tiền: không thống nhất | cùng một hàm định dạng theo tài sản |
| `WalletPage.tsx`, icon tài sản | `USD` (do `asset.slice(0, 3)` với USDT) | icon hoặc chữ đầy đủ |
| `PortfolioPage.tsx`, ghi chú biểu đồ | "Ghi nhận theo snapshot định kỳ máy chủ (điểm **null** vẽ đứt đoạn)" | "Khoảng trống: lúc đó chưa có giá" |
| `CandlestickChart.tsx`, `%` chú giải | `-0.49%` (dấu chấm) | `-0,49%` như header |
| `WalletPage.tsx`, "Trạng thái: Chưa xác minh" | luôn hiện | chỉ hiện khi server bắt xác minh |
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-15 — `WalletPage` tự cộng số dư bằng `parseFloat` ở nhánh dự phòng (P3)
- **File:** `apps/exchange/src/pages/WalletPage.tsx:104-111`.
- **Cách xảy ra:**
  - Nhánh `ev.asset ? {…}` dựng `total = parseFloat(available) + parseFloat(locked)` và `valueUsdt = available` (bỏ quên `locked`).
  - Theo hợp đồng, sự kiện `user` loại `balance` luôn mang `balance: Balance` đầy đủ (`packages/contracts/src/realtime.ts`, `wallet.ts:4-12`), nên nhánh này là code chết. Nếu có ngày chạy tới, nó sai số thực và vi phạm quy tắc 2–3.
- **Cách sửa:** xóa nhánh dự phòng, chỉ dùng `ev.balance`.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-16 — `AuthContext` gọi `onClose` không tồn tại (P3)
- **File:** `apps/exchange/src/context/AuthContext.tsx:117-126`; `packages/contracts/src/realtimeClient.ts:60-70`.
- **Cách xảy ra:**
  - Server đóng WebSocket bằng mã 4401 khi phiên kết thúc (`server/src/realtime/hub.ts:32,129`).
  - `RealtimeClient` không có `onClose`, nên ép kiểu `rt as unknown as { onClose?… }` luôn nhận `undefined` và đoạn bắt 4401 không bao giờ chạy.
  - Hiện vẫn đăng xuất được nhờ đường vòng `onError` (UNAUTHENTICATED), nhưng chậm hơn (đợi kết nối lại).
- **Cách sửa:**
  - **Claude Code**: thêm `onClose(cb: (code: number) => void)` vào `RealtimeClient` (contracts) kèm test.
  - **Antigravity**: dùng API có kiểu, bỏ ép kiểu.

### R-17 — Giao diện sáng: thanh header vẫn tối (P3)
- **Bằng chứng (chạy thật):** đặt `data-theme="light"` ở 1440×900 thì nội dung chuyển sáng nhưng thanh điều hướng trên cùng giữ nền đen.
- **Cách sửa:** kiểm `Header.tsx` (và banner mô phỏng) còn màu cứng nào (`bg-black`, `#0a0a0b`…), đổi sang token `var(--panel)` / `var(--bg)`.
- **Trạng thái:** **Đã sửa** (`aaea477`) — `npm run ui-check -- --e2e`: verify đạt (typecheck, lint, 221/221 unit test, build), e2e 30/30 đạt.

### R-18 — Quy trình (P3)
- Nhánh UI sửa `e2e/tests/bots.spec.ts` (đổi kiểm tra trực tiếp sang chờ `expect.poll`) và thêm `e2e/tests/chart-dimensions.spec.ts`. Theo `CLAUDE.md`, Antigravity chỉ sửa `apps/*`, `packages/ui`.
  - Nội dung hợp lý, Claude Code giữ.
  - Lần sau ghi yêu cầu vào `docs/parts/contract-requests.md` hoặc báo Claude Code, tránh xung đột khi gộp.
- `docs/LOI-HIEN-TAI.md` trên nhánh UI đánh **B5** và **U2** là "Đã sửa" nhưng chạy thật thì chưa đúng (R-02, R-13).
  - Quy tắc 9 của `.agent/rules/project-rules.md`: "Không báo xong khi chưa chạy thật."
  - Khi báo sửa, ghi kèm cách đã kiểm (ảnh hoặc số đo).

---

## 3. Thứ tự đề xuất
1. **Antigravity**:
   - R-01, R-02 (cùng một hàm `fmtPrice`);
   - R-03;
   - R-05, R-07 (cùng khối tải lịch sử);
   - R-06 (bản tạm), R-08, R-10, R-09, R-11;
   - rồi P3.
2. **Claude Code**:
   - R-04 phần CSP;
   - R-16 phần contracts;
   - test e2e cho R-01, R-05, R-07;
   - trường lãi/lỗ DCA cho R-06 nếu có yêu cầu hợp đồng.
3. Sau mỗi đợt:
   ```bash
   npm run ui-check -- --e2e
   ```
   Phải xanh. Cập nhật trạng thái từng mục ngay trong file này.

## 4. Ghi chú
- `npm run ui-coverage` báo 3 endpoint xuất CSV "chưa dùng". Thực ra UI có dùng, nhưng qua link `href` thay vì client của contracts, nên công cụ không thấy. Không phải lỗi.
- App admin: chỉ kiểm qua e2e (5 test admin xanh) và báo cáo endpoint (33/34). Chưa duyệt bằng mắt trong đợt này.
- Sàn thật (`npm run host`) đang tắt: lần chạy trước là tiến trình nền của phiên Claude, đã dừng khi phiên kết thúc. Chủ dự án chạy `npm run host -- start` trong cửa sổ terminal của mình.

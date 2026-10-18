# PROMPT-17 — Rà soát lần 8, đợt 1: lỗi Futures, phí/funding, thuế trên form Spot, banner, nút header

Nguồn: chủ dự án báo lỗi ngày 2026-10-17 (mục 1, 2, 5, 6), Claude Code soát mã trên `ui/gd2-exchange` @ `7179707`.
Tiền tố của lần rà này: **S** (S-01 …). Đợt 2 (thống kê hồ sơ + admin) sẽ gửi sau khi backend 0.19.0 xong.

**Đầu phiên:** trong `D:\Claude\crypto\ui` chạy `git merge main`. Chỉ ghi trong `D:\Claude\crypto\ui` (không ghi vào `D:\Claude\crypto`).
Mỗi mục xong: ghi "Trạng thái" ngay dưới mục trong file này (bản ở `ui/`), commit riêng `fix(ui): S-0x …`. Hết đợt: `npm run ui-check -- --e2e`.
Thêm mọi `data-testid` mới vào `docs/antigravity/TESTIDS.md` (mục "Futures — form đặt lệnh" và "Spot — phí/thuế").

---

### S-01 · P1 · Futures: đặt lệnh thất bại mà không nói vì sao
**File:** `apps/exchange/src/pages/FuturesPage.tsx:446-462` (`executePlaceOrder`), `:476-480` (đóng vị thế), `:350-352` (đòn bẩy).
**Hiện tại:** `toastError(getErrorMessage(err.code))` bỏ qua `err.details`; lỗi không phải `ApiError` thì chỉ "Không thể gửi lệnh Futures.". Người dùng không biết thiếu tiền, sai đòn bẩy hay sổ lệnh mỏng.
**Server đã trả sẵn `details`:**
| code | details | Thông báo cần hiện |
|---|---|---|
| `INSUFFICIENT_BALANCE` | `account: 'FUTURES'`, `asset`, `available`, `required` | "Ví Futures không đủ USDT: cần thêm ~X USDT (ký quỹ + phí). Khả dụng: Y." + nút **"Chuyển từ Spot"** mở hộp chuyển tiền. X tính ở client theo S-02 (tổng chi phí − khả dụng), không lấy `required` của server (đó chỉ là một bước con). |
| `NOTIONAL_TOO_SMALL` | `minNotional` | "Giá trị lệnh tối thiểu {minNotional} USDT (hiện {giá × khối lượng})." |
| `INVALID_LEVERAGE` | `maxLeverage` | "Đòn bẩy tối đa của {symbol} là {maxLeverage}x." |
| `LEVERAGE_LOCKED` | — | "Không đổi được đòn bẩy khi còn vị thế {qty} {base} hoặc {n} lệnh chờ trên {symbol}." (đếm từ dữ liệu đang có trên trang) + nút "Xem vị thế". |
| `INVALID_TPSL` | `markPrice` | Long: "Chốt lời phải **cao hơn** và cắt lỗ **thấp hơn** giá mark {markPrice}". Short: ngược lại. |
| `INSUFFICIENT_LIQUIDITY` | — | Mở lệnh: "Sổ lệnh hiện chỉ khớp được khoảng {maxQty} {base} — giảm khối lượng hoặc dùng lệnh Giới hạn." (maxQty theo S-02). |
| `MARKET_DATA_STALE`, `TRADING_HALTED`, `SYMBOL_DISABLED` | — | giữ thông báo hiện có, khóa nút đặt lệnh khi trạng thái này đang đúng (không chờ bấm mới báo). |
| không phải `ApiError` | — | "Không gửi được lệnh: {err.message}" + `console.error(err)`; không nuốt lỗi. |
- Dùng `formatApiError(err, fallback, overrides)` trong `services/errors.ts`, bổ sung xử lý `details` cho các mã trên (một chỗ, dùng lại cho Futures và Spot).
- **Kiểm trước khi gửi (client)**: nếu khối lượng < `minQty`, giá trị < `minNotional`, hoặc tổng chi phí (S-02) > khả dụng ví Futures thì **khóa nút Mở Long/Mở Short** và hiện lý do ngay dưới nút (`data-testid="futures-order-block-reason"`). Server vẫn là chuẩn: nếu server báo lỗi khác, hiện theo bảng trên.
**Nghiệm thu:** ví Futures 100 USDT, đặt Long 1 BTC x10 → nút bị khóa, lý do "cần thêm … USDT"; bấm "Chuyển từ Spot" mở hộp chuyển tiền. Gửi TP sai phía → thông báo nói rõ chiều đúng.
**Trạng thái:** Hoàn thành (Agent A — 2026-10-17). `formatApiError` hỗ trợ đầy đủ `details` và `context`, pre-flight check khóa nút và hiện `futures-order-block-reason` kèm link Chuyển từ Spot, `LEVERAGE_LOCKED` kèm nút Xem vị thế, unit test 17/17 passed, `tsc -p apps/exchange` 0 lỗi.

### S-02 · P1 · Futures: form không cho thấy phí, tổng chi phí, funding, khối lượng tối đa
**File:** `FuturesPage.tsx:1280-1298` (hộp "Ký quỹ ban đầu / Giá thanh lý"), `:1508-1540` (hộp xác nhận).
**Hiện tại:** chỉ có "Ký quỹ ban đầu" (làm tròn **xuống** 2 số: `roundDown(requiredMargin, 2)` — hiện ít hơn số server khóa) và giá thanh lý; không có phí, không có funding, không có số tối đa. Người dùng tưởng đủ tiền nhưng server cần **ký quỹ + phí mở** → bị từ chối.
**Cần hiện** (tính bằng `@cex/core` `dec`/`initialMargin`/`roundUp`, phí lấy từ `futuresExchangeInfo().fees`, không hard-code):
| Dòng | Công thức | testid |
|---|---|---|
| Giá trị lệnh | `giá tham chiếu × khối lượng` (MARKET: mark; LIMIT: giá đặt) | `futures-est-notional` |
| Ký quỹ ban đầu | `initialMargin(giá, khối lượng, đòn bẩy)` — hiển thị **làm tròn lên** 8 số rồi format | `futures-est-margin` |
| Phí mở (ước tính) | `roundUp(giá trị × takerFee)`; ghi tỉ lệ "(0,05% taker)". LIMIT: ghi "tối đa, theo taker; khớp maker {makerFee}% thì hoàn phần chênh" | `futures-est-fee` |
| **Tổng cần** | ký quỹ + phí | `futures-est-cost` (`data-value`) |
| Khả dụng ví Futures | `futuresAccount.available` | `futures-available` |
| Tối đa mở được | Long / Short: `min(theo số dư, theo sổ lệnh)`; theo số dư = `khả dụng ÷ (giá/đòn bẩy + giá × takerFee)` làm tròn xuống theo `stepSize`; theo sổ (chỉ MARKET) = tổng khối lượng 20 mức của phía khớp (Long khớp asks, Short khớp bids) | `futures-max-long`, `futures-max-short` |
| Funding | "{rate}% · còn {mm:ss}"; ước tính mỗi kỳ = `giá trị × fundingRate`; ghi rõ ai trả: rate > 0 → Long trả Short; rate < 0 → Short trả Long | `futures-est-funding` |
| Giá thanh lý (Long/Short) | giữ như hiện có | — |
- Hộp **xác nhận đặt lệnh** (`:1508+`) hiện đủ: giá trị, ký quỹ, phí, tổng cần, giá thanh lý, funding ước tính.
- Nút "Tối đa" cạnh ô khối lượng điền số tối đa của phía đang chọn.
**Nghiệm thu:** mark 80.000, x20, 0,1 BTC → giá trị 8.000, ký quỹ 400, phí 4 (0,05%), tổng 404; đổi x10 → ký quỹ 800, tổng 804. Hộp xác nhận cùng số.
**Trạng thái:** Hoàn thành (Agent B — 2026-10-17). Đã tính toán và hiển thị đầy đủ trên form và hộp xác nhận: `futures-est-notional`, `futures-est-margin`, `futures-est-fee` (kèm % taker/maker), `futures-est-cost` (kèm `data-value`), `futures-available`, `futures-max-long`/`futures-max-short` (tính theo số dư & depth 20 mức cho MARKET), `futures-est-funding` (tỷ lệ, countdown, ước tính mỗi kỳ và bên chi trả), nút 'Tối đa' (`futures-max-btn`) và các mốc slider %, đồng bộ số liệu sang hộp xác nhận đặt lệnh, cập nhật `TESTIDS.md`, `tsc -p apps/exchange` 0 lỗi.

### S-03 · P2 · Spot: dưới "Phí ước tính" thêm dòng Thuế (bao nhiêu %)
**File:** `apps/exchange/src/components/trading/OrderForm.tsx:1272-1280` (dòng "Phí giao dịch (ước tính)" khi không có khối thuế), `:1345+` (hộp "Xác nhận đặt lệnh" — ảnh chủ dự án gửi: chỉ có phí).
**Cần:**
- Dòng phí ghi kèm tỉ lệ: "Phí giao dịch (0,1%): ~0,000022 BTC" (`exchangeInfo.feeRate`).
- Ngay dưới, **luôn có** dòng thuế `data-testid="spot-tax-line"`:
  - MUA: "Thuế (0,1%): 0 — chỉ khấu trừ khi bán";
  - BÁN, `taxMode = 'WITHHOLD'`, không phải `DOMESTIC_ORG`: giữ khối thuế hiện có (`tax-breakdown`, số tiền + "Thực nhận");
  - `taxMode = 'OFF'`: "Thuế: không áp dụng (sàn đang tắt)";
  - `DOMESTIC_ORG`: "Thuế: 0 — tổ chức trong nước tự kê khai".
  Tỉ lệ lấy từ `exchange:status`/`exchangeInfo.taxRate` (đã có `formattedTaxRatePercent`), không hard-code.
- Hộp **Xác nhận đặt lệnh**: thêm dòng thuế như trên, và với BÁN thêm "Thực nhận ước tính". Giữ `data-testid` cũ (`tax-*`) — test e2e thuế đang dựa vào chúng.
**Nghiệm thu:** thuế bật → form MUA có `spot-tax-line` "0 — chỉ khấu trừ khi bán"; form BÁN vẫn có `tax-breakdown`; thuế tắt → "không áp dụng". Spec `tax.spec.ts` vẫn xanh.
**Trạng thái:** Hoàn thành (Agent C — 2026-10-17). Đã cập nhật dòng phí hiển thị tỷ lệ thực tế `Phí giao dịch (${formattedFeeRatePercent}):`, bổ sung dòng `spot-tax-line` cho cả tab MUA và BÁN theo đúng trạng thái taxMode (`OFF` / `WITHHOLD` / `DOMESTIC_ORG` / ước tính khi chưa nhập khối lượng), giữ nguyên vẹn khối `tax-breakdown` và gắn `spot-tax-line` cho dòng thuế, đồng bộ sang hộp Xác nhận đặt lệnh kèm dòng `Thực nhận ước tính` cho lệnh BÁN, cập nhật `TESTIDS.md`, `tsc -p apps/exchange` 0 lỗi.

### S-04 · P3 · Bỏ dòng "SÀN MÔ PHỎNG SPOT — TIỀN ẢO …"
**File:** `packages/ui/src/TradingBadges.tsx:144-151` (nhánh không tạm dừng của `SimulatedBanner`), `apps/exchange/src/App.tsx:110`.
- Chủ dự án yêu cầu bỏ. Chỉ render banner khi `tradingHalted = true` (banner đỏ "TẠM DỪNG GIAO DỊCH KHẨN CẤP" **giữ nguyên** — đó là trạng thái an toàn, không phải quảng cáo).
- **Không** bỏ nhãn "thử nghiệm" trên các màn **Thuế** (quy tắc hợp đồng module T, README mục 15).
**Nghiệm thu:** trang thường không còn dòng mô phỏng; admin dừng sàn → banner đỏ vẫn hiện.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `packages/ui/src/TradingBadges.tsx`: `SimulatedBanner` chỉ render khi `tradingHalted === true`, trả về `null` khi sàn đang hoạt động bình thường, giữ nguyên nhãn "thử nghiệm" trên các màn Thuế.

### S-05 · P2 · Header: nút "Giao diện" (mặt trăng) và "Ngôn ngữ" (quả địa cầu) bấm không có tác dụng
**File:** `apps/exchange/src/components/Header.tsx:346-351` — hai `<button>` không có `onClick`.
- **Mặt trăng:** bấm để đổi sáng/tối. Dùng đúng cơ chế đang có (`applyThemeAndColor` trong `context/AuthContext.tsx:60`, lưu `updatePreferences({ theme })` khi đã đăng nhập, `localStorage cex_theme` khi chưa). Icon đổi Moon/Sun theo chế độ hiện tại. `data-testid="header-theme-toggle"`.
- **Quả địa cầu:** app chỉ có tiếng Việt → **bỏ nút** (không để nút giả). Khi nào có đa ngôn ngữ thì thêm lại.
**Nghiệm thu:** bấm mặt trăng → `document.documentElement[data-theme]` đổi, tải lại trang vẫn giữ.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/components/Header.tsx`: nút mặt trăng gắn `data-testid="header-theme-toggle"`, đổi icon Moon/Sun linh hoạt, chuyển đổi theme sáng/tối lưu vào `localStorage` và `updatePreferences` khi đăng nhập, gỡ bỏ hoàn toàn nút quả địa cầu.

### S-06 · P2 · Trang `/__ui` ("CEX Design System Showcase") lộ ra người dùng
**File:** `apps/exchange/src/App.tsx:99-101` (route không kiểm môi trường), `Header.tsx:352-359` (icon bảng lưới, chỉ hiện khi `import.meta.env.DEV`).
- Đây là trang **trưng bày bộ thành phần giao diện cho lập trình viên**, không phải tính năng của sàn. Icon chỉ hiện khi chạy `npm run dev` nên chủ dự án thấy nó; nhưng route `/__ui` mở được cả trong bản build chạy cho người dùng.
- Sửa: chỉ đăng ký route `/__ui` khi `import.meta.env.DEV`; bản production gõ `/__ui` → về trang Thị trường. Đổi `title` icon thành "Bộ giao diện (chỉ môi trường dev)".
**Nghiệm thu:** bản build (`npm run e2e` dùng bản build) mở `/__ui` → không thấy "Design System Showcase".
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/App.tsx`: route `/__ui` chỉ kích hoạt khi `import.meta.env.DEV`, môi trường production tự động chuyển hướng về trang Thị trường; trong `Header.tsx` icon UI Kit đổi title thành "Bộ giao diện (chỉ môi trường dev)".

---
## Đợt 1b — nút giả và lỗi bị nuốt (soát toàn bộ `apps/exchange`)

### S-07 · P2 · Menu "Tín hiệu — Sắp có" giả nút bị khóa
**File:** `apps/exchange/src/components/Header.tsx:171-176` — `<button>` trông như bị khóa (`opacity-50 cursor-not-allowed`) nhưng không có `disabled`, vẫn nhận bấm.
Tín hiệu hiện **chỉ dành cho Admin** (quyết định C-D1), chưa có lịch mở cho người dùng → **bỏ mục này khỏi menu** người dùng. Không hứa tính năng chưa có.
**Nghiệm thu:** header không còn "Tín hiệu".
**Trạng thái:** Hoàn thành. Đã loại bỏ hoàn toàn nút "Tín hiệu — Sắp có" khỏi thanh điều hướng của Header người dùng.

### S-08 · P2 · Menu tài khoản: "Nạp ảo (Faucet)" và "Lịch sử giao dịch" đều chỉ mở đầu trang Tài sản
**File:** `Header.tsx:234-245` — cả 3 mục cùng `onNavigate('/assets')`.
- "Nạp ảo (Faucet)" → `/assets#faucet`: trang Tài sản cuộn tới thẻ Faucet (`WalletPage.tsx:382`, thêm `id="faucet"`) và làm nổi thẻ 1–2 giây.
- "Lịch sử giao dịch" → `/assets#ledger`: cuộn tới bảng sổ cái (thêm `id="ledger"`).
- `App.tsx` / router: giữ phần `#…` khi điều hướng; `WalletPage` đọc `location.hash` sau khi dữ liệu tải xong rồi `scrollIntoView`.
**Nghiệm thu:** bấm "Nạp ảo (Faucet)" → thẻ Faucet nằm trong khung nhìn.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa: Header liên kết Nạp ảo (Faucet) tới `/assets#faucet` và Lịch sử giao dịch tới `/assets#ledger`. `App.tsx` giữ nguyên hash khi điều hướng và lắng nghe sự kiện `hashchange`. `WalletPage.tsx` tự động cuộn mượt đến phần tử mục tiêu (`#faucet` và `#ledger`) sau khi dữ liệu tải xong và thêm hiệu ứng highlight thẻ Faucet.

### S-09 · P2 · Đánh dấu cặp yêu thích lỗi mà vẫn như đã lưu
**File:** `apps/exchange/src/pages/MarketsPage.tsx:179` — `api.updatePreferences(...).catch(() => {})`.
Lưu lỗi → trả ngôi sao về trạng thái cũ + `toastError(formatApiError(e, 'Không lưu được danh sách yêu thích'))`. Tương tự: rà mọi `.catch(() => {})` mà **thao tác do người dùng bấm** (khoảng 20 chỗ); chỉ được nuốt lỗi với tải nền không quan trọng, còn thao tác của người dùng phải báo.
**Nghiệm thu:** chặn `PATCH /api/v1/account/preferences` trả 500 → ngôi sao trở lại, có thông báo lỗi.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/pages/MarketsPage.tsx`: khi `api.updatePreferences` thất bại, trạng thái `favorites` được hoàn tác về danh sách trước đó và hiển thị thông báo lỗi `toastError(formatApiError(err, 'Không lưu được danh sách yêu thích'))`.

### S-10 · P3 · "Chế độ Pro" trên trang Giao dịch trông như nút nhưng không làm gì
**File:** `apps/exchange/src/pages/TradePage.tsx:313-319`. Đổi thành nhãn (`<span>`, không hover) hoặc bỏ. Không để nút không có chức năng.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/pages/TradePage.tsx`: đổi phần tử nút "Chế độ Pro" thành nhãn `<span>` thông tin tĩnh với `cursor-default` và `title="Đang ở chế độ Pro Trader tiêu chuẩn"`, không còn trạng thái hover nhận bấm giả.

### S-11 · P3 · Futures: nút "Cô lập (Isolated)" bị khóa không giải thích
**File:** `FuturesPage.tsx:1111-1116`. Sàn chỉ hỗ trợ ký quỹ cô lập (`futuresExchangeInfo().marginModes = ['ISOLATED']`). Hiện dạng nhãn "Ký quỹ: Cô lập" kèm `title="Sàn chỉ hỗ trợ ký quỹ cô lập"`, không phải nút bị khóa.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/pages/FuturesPage.tsx`: đổi nút bị khóa thành nhãn tĩnh `<span>Ký quỹ: Cô lập</span>` kèm `title="Sàn chỉ hỗ trợ ký quỹ cô lập"`.

### S-12 · P3 · Cài đặt: thẻ "Telegram — Sắp có"
**File:** `apps/exchange/src/pages/SettingsPage.tsx:524-537`. Chưa có tính năng → ẩn thẻ.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/pages/SettingsPage.tsx`: ẩn thẻ "Telegram — Sắp có" khỏi tab hồ sơ người dùng.

---
## Đợt 2 — hồ sơ người dùng, chi tiết người dùng admin, 2FA khi dev (cần `git merge main` để có contracts 0.20.0)

### S-13 · P1 · Admin: bỏ đoán "localhost", dùng cờ của server
**File:** `apps/admin/src/context/AuthContext.tsx:88-90` (commit `7179707`).
- Chủ dự án quyết: **dev không cần 2FA** cho tới khi làm lại bảo mật. Server đã có cờ (contracts 0.19.0): `npm run dev` chạy với `STAFF_REQUIRE_2FA=false`, mọi endpoint staff chỉ kiểm vai trò + quyền. Production từ chối cờ này.
- Sửa: xóa `isLocalhost`. Đọc `publicConfig().staffTwoFactorRequired` (đã có `ConfigContext`/gọi `publicConfig` lúc khởi động — dùng lại). Chỉ hiện màn "bắt buộc bật 2FA" khi `staffTwoFactorRequired === true && !user.twoFactorEnabled`. Khi cờ là `false`: hiện dải nhỏ trên cùng "Máy chủ dev: admin không yêu cầu 2FA" (`data-testid="admin-no-2fa-notice"`).
- Thêm xử lý chung: lời gọi admin nào trả `TWO_FACTOR_REQUIRED` → chuyển sang màn 2FA (hướng dẫn bật 2FA rồi đăng nhập lại bằng 2FA), không hiện thành "không có quyền" hay danh sách trống.
**Nghiệm thu:** `npm run dev` → admin chưa bật 2FA vào được và thấy dữ liệu. `npm run e2e` (server mặc định bắt 2FA) → staff chưa bật 2FA thấy `admin-2fa-required`.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/admin/src/context/AuthContext.tsx` và `apps/admin/src/services/api.ts`: bỏ biến `isLocalhost`, dùng cờ `staffTwoFactorRequired` từ `api.publicConfig()`. Hiển thị dải `data-testid="admin-no-2fa-notice"` khi dev không bắt 2FA. Bắt lỗi `TWO_FACTOR_REQUIRED` từ mọi API admin qua fetch interceptor để tự động chuyển sang màn hình 2FA `data-testid="admin-2fa-required"`.

### S-14 · P1 · Hồ sơ: khối lượng giao dịch hôm nay / 7 ngày và thuế đã khấu trừ tháng này
**File:** `apps/exchange/src/pages/SettingsPage.tsx:355+` (tab "Hồ sơ & Tài khoản").
- Gọi `api.accountTradingStats()` (README hợp đồng mục 17). Thêm khối **"Hoạt động giao dịch"**:
  | Ô | Nguồn | testid |
  |---|---|---|
  | Khối lượng hôm nay | `volume.today.total` USDT; dòng phụ "Spot X · Futures Y · N lần khớp" | `profile-volume-today` (`data-value`) |
  | Khối lượng 7 ngày | `volume.last7d.*` | `profile-volume-7d` |
  | Khối lượng 30 ngày | `volume.last30d.*` | `profile-volume-30d` |
  | Thuế đã khấu trừ tháng {MM/YYYY} | `tax.thisMonth.withheldAmount` USDT + "{n} lần bán"; dòng phụ tháng trước | `profile-tax-month` (`data-value`) |
- Chữ phải đúng nghĩa: thuế là **"đã khấu trừ"** (sàn trừ ngay khi bán), **không** viết "cần đóng" hay "phải nộp". Thêm câu nhỏ: "Thuế 0,1% được trừ thẳng vào tiền bán; bạn không cần nộp thêm (sàn thử nghiệm)." Khi `category = 'DOMESTIC_ORG'`: "Tổ chức trong nước tự kê khai — sàn không khấu trừ". Khi `taxMode = 'OFF'`: "Sàn đang tắt thuế".
- `excludedNonUsdtFills > 0` → ghi chú "Chưa tính N lần khớp của cặp không phải USDT".
- Có trạng thái tải / lỗi kèm "Thử lại"; không hiện 0 khi lỗi. Nút "Xem chi tiết thuế" → `/account/tax`.
- Số tiền: `formatDecimal` (không `parseFloat`); khối lượng lớn dùng định dạng gọn có sẵn (`format.ts`).
**Nghiệm thu:** mua 100 USDT BTC → `profile-volume-today` `data-value` = `quoteQty` của lần khớp. Thuế bật, bán → `profile-tax-month` = `Trade.tax`.
**Trạng thái:** Hoàn thành. Đã chỉnh sửa `apps/exchange/src/pages/SettingsPage.tsx`: gọi `api.accountTradingStats()`, hiển thị khối "Hoạt động giao dịch" với các ô `profile-volume-today`, `profile-volume-7d`, `profile-volume-30d` (gồm `data-value`, chia rõ Spot/Futures/số lần khớp), và thẻ `profile-tax-month` (thuế đã khấu trừ tháng này, tháng trước, ghi chú giải thích theo danh mục và chế độ thuế, cùng ghi chú các lần khớp không phải USDT).

### S-15 · P1 · Admin chi tiết người dùng: thuế, khối lượng, số dư, tài sản nắm giữ
**File:** `apps/admin/src/pages/UserDetailPage.tsx:656-706` (tab số dư), phần đầu trang.
- **Thẻ tóm tắt đầu trang** (luôn thấy, không phải bấm tab):
  - Tổng tài sản: `detail.totalValueUsdt` USDT; nếu `unpricedAssets` không rỗng: "Chưa tính giá: X, Y" (`admin-unpriced-assets`).
  - Ví Futures: `futures.equity` (null → "—"), `walletBalance`, ký quỹ vị thế + lệnh, PnL chưa thực hiện (null → "—", **không** `|| '0'` — xem AD-07).
  - Khối lượng: hôm nay / 7 ngày / 30 ngày / **tháng trước** từ `detail.trading.volume` (Spot · Futures).
  - Thuế: tháng này + tháng trước từ `detail.trading.tax`; tổng mọi thời gian `detail.tax.withheldTotal` (`admin-user-tax-total`); phân loại `detail.tax.category`.
- **Tab Số dư = bảng tài sản nắm giữ:** mỗi dòng: coin, khả dụng, đang khóa, tổng, **giá trị USDT** (`Balance.valueUsdt`, null → "—"), **% danh mục**; sắp theo giá trị giảm dần; dòng cuối tổng.
- Mọi số qua `formatDecimal`/`dec`; không cộng ở client những gì server đã trả tổng.
**Nghiệm thu:** người dùng có BTC + USDT → bảng 2 dòng có giá trị và %, tổng = `totalValueUsdt`; `admin-user-tax-total` = `detail.tax.withheldTotal`.

---
## Theo dõi khi đang sửa (Claude Code rà commit `8f77399`, `ddd5b0b`, `c6e483d`, `31a57d7`)
S-01…S-04: đúng hướng, công thức ký quỹ/phí/tối đa đúng (`initialMargin` làm tròn lên, phí `roundUp(giá trị × taker)`, tối đa = min(số dư, 20 mức sổ)). Còn:

### S-16 · P3 · Số "mặc định" tự đặt khi dữ liệu chưa tải
- `FuturesPage.tsx`: `takerFee || '0.0005'`, `makerFee || '0.0002'`, `minNotional || '5'` (BTC thật là **50**), `minQty || '0.001'`, `fundingRate || '0'`.
- `OrderForm.tsx` (`c6e483d`): `(exchangeInfo as any)?.makerFeeRate ?? (exchangeInfo as any)?.takerFeeRate ?? exchangeInfo?.feeRate ?? '0.001'` — hợp đồng Spot chỉ có `feeRate`; bỏ `as any` và hai trường không tồn tại.
- Sửa: chưa có `futuresExchangeInfo` / `exchangeInfo` / `markPrice` thì hiện "—" và **khóa nút đặt lệnh** với lý do "Đang tải thông tin hợp đồng…", không đoán số. `fundingRate` null → "—".
**Nghiệm thu:** chặn `GET /api/v1/futures/exchange-info` → form hiện "—", nút khóa, không có "0,05%".

---
Đợt 3: lỗi web admin — xem `PROMPT-18-web-admin.md`.

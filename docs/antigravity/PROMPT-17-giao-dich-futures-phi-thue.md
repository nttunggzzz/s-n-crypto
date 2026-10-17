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

### S-05 · P2 · Header: nút "Giao diện" (mặt trăng) và "Ngôn ngữ" (quả địa cầu) bấm không có tác dụng
**File:** `apps/exchange/src/components/Header.tsx:346-351` — hai `<button>` không có `onClick`.
- **Mặt trăng:** bấm để đổi sáng/tối. Dùng đúng cơ chế đang có (`applyThemeAndColor` trong `context/AuthContext.tsx:60`, lưu `updatePreferences({ theme })` khi đã đăng nhập, `localStorage cex_theme` khi chưa). Icon đổi Moon/Sun theo chế độ hiện tại. `data-testid="header-theme-toggle"`.
- **Quả địa cầu:** app chỉ có tiếng Việt → **bỏ nút** (không để nút giả). Khi nào có đa ngôn ngữ thì thêm lại.
**Nghiệm thu:** bấm mặt trăng → `document.documentElement[data-theme]` đổi, tải lại trang vẫn giữ.

### S-06 · P2 · Trang `/__ui` ("CEX Design System Showcase") lộ ra người dùng
**File:** `apps/exchange/src/App.tsx:99-101` (route không kiểm môi trường), `Header.tsx:352-359` (icon bảng lưới, chỉ hiện khi `import.meta.env.DEV`).
- Đây là trang **trưng bày bộ thành phần giao diện cho lập trình viên**, không phải tính năng của sàn. Icon chỉ hiện khi chạy `npm run dev` nên chủ dự án thấy nó; nhưng route `/__ui` mở được cả trong bản build chạy cho người dùng.
- Sửa: chỉ đăng ký route `/__ui` khi `import.meta.env.DEV`; bản production gõ `/__ui` → về trang Thị trường. Đổi `title` icon thành "Bộ giao diện (chỉ môi trường dev)".
**Nghiệm thu:** bản build (`npm run e2e` dùng bản build) mở `/__ui` → không thấy "Design System Showcase".

---
Đợt 2 (sẽ gửi): S-1x hồ sơ người dùng — khối lượng giao dịch hôm nay/7 ngày, thuế đã khấu trừ tháng này (cần backend 0.19.0); trang chi tiết người dùng admin; các lỗi web admin.

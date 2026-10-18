# `data-testid` cho test nghiệm thu (e2e)

Test trình duyệt (`npm run e2e`) tìm phần tử bằng `data-testid`, để đổi chữ hiển thị hoặc bố cục không làm hỏng test.
Gắn **đúng tên** dưới đây; mỗi id chỉ xuất hiện một lần trên trang, trừ những id ghi "mỗi dòng" / "mỗi thẻ".
Test nằm ở `e2e/tests/*.spec.ts` — đọc test để biết chính xác luồng được kiểm.

## Chung
| id | Phần tử | Ghi chú |
|---|---|---|
| `order-confirm` | Nút xác nhận trong hộp "Xác nhận đặt lệnh" (Spot **và** Futures) | Hộp này hiện khi `preferences.confirmOrders` bật (mặc định bật) |
| `bot-confirm` | Nút xác nhận trong hộp tóm tắt trước khi tạo bot lưới / kế hoạch mua định kỳ | Bot dùng tiền thật trong ví ảo → luôn hỏi lại |
| `header-theme-toggle` | Nút chuyển đổi giao diện sáng/tối trên Header (S-05) | Thuộc tính đổi Moon/Sun, đổi data-theme |

## Trang Giao dịch Spot (`/trade/:symbol`) — `bots.spec.ts`
| id | Phần tử |
|---|---|
| `open-order-row` | Mỗi dòng trong bảng "Lệnh đang chờ" (cả lệnh của bot; badge "Bot lưới" / "Mua định kỳ" nằm trong dòng) |
| `order-cancel` | Nút Hủy trong dòng — **không render** với lệnh có `source !== 'USER'` |

## Trang Futures (`/futures/:symbol`) — `futures.spec.ts`, `review03.spec.ts`
| id | Phần tử | Ghi chú |
|---|---|---|
| `funding-countdown` | Đồng hồ đếm ngược funding | Chỉ chứa chuỗi `HH:MM:SS`, cập nhật mỗi giây (dùng `countdown()` của `@cex/contracts`) |
| `futures-transfer-open` | Nút "Chuyển tiền" | Mở từ trang Futures thì chiều mặc định là Spot → Futures |
| `transfer-amount` | Ô số tiền trong hộp chuyển | |
| `transfer-submit` | Nút xác nhận chuyển | |
| `futures-available` | Số dư khả dụng ví Futures | Định dạng tiếng Việt (`1.000,00 USDT`) |
| `futures-order-type-market` | Tab / nút loại lệnh "Thị trường" | |
| `futures-unit-coin` | Nút chọn nhập khối lượng theo coin (BTC, 1000PEPE…) | |
| `futures-qty` | Ô khối lượng | |
| `futures-open-long` / `futures-open-short` | Nút Mở Long / Mở Short | |
| `position-row` | Mỗi dòng vị thế đang mở (chứa mã hợp đồng) | |
| `position-tpsl` | Nút đặt TP/SL trong dòng | |
| `tpsl-take-profit` / `tpsl-stop-loss` / `tpsl-save` | Hai ô giá và nút lưu trong hộp TP/SL | |
| `position-close` | Nút "Đóng" trong dòng | |
| `close-confirm` | Nút xác nhận đóng (mặc định: đóng toàn bộ, giá thị trường) | |
| `futures-order-block-reason` | Dòng lý do khóa nút đặt lệnh Futures (thiếu tiền, chưa đủ minQty/minNotional, sàn tạm dừng, gián đoạn giá, cặp bị tắt) | Hiện ngay dưới 2 nút Mở Long/Short khi có điều kiện chặn; nếu thiếu tiền có kèm link Chuyển từ Spot |
| `futures-max-btn` | Nút "Tối đa" cạnh ô khối lượng | Điền khối lượng tối đa theo số dư/sổ lệnh |
| `futures-est-notional` | Dòng "Giá trị lệnh" ước tính (USDT) trên form | Định dạng tiếng Việt (`formatDecimal`) kèm đơn vị USDT |
| `futures-est-margin` | Dòng "Ký quỹ ban đầu" ước tính (USDT) trên form | `initialMargin`, làm tròn lên 8 số rồi format |
| `futures-est-fee` | Dòng "Phí mở (ước tính)" trên form | Ước tính phí theo takerFee, kèm ghi chú tỉ lệ |
| `futures-est-cost` | Dòng "Tổng cần" trên form | Ký quỹ + phí mở; có thuộc tính `data-value` chứa số thô |
| `futures-max-long` | Khối lượng tối đa mở được phía Long | `min(theo số dư, theo sổ lệnh)` |
| `futures-max-short` | Khối lượng tối đa mở được phía Short | `min(theo số dư, theo sổ lệnh)` |
| `futures-est-funding` | Dòng "Funding" trên form | Tỷ lệ, đếm ngược, phí ước tính mỗi kỳ và bên chi trả |
| `futures-confirm-notional` | Dòng "Giá trị lệnh" trong hộp xác nhận đặt lệnh | |
| `futures-confirm-margin` | Dòng "Ký quỹ ban đầu" trong hộp xác nhận đặt lệnh | |
| `futures-confirm-fee` | Dòng "Phí mở (ước tính)" trong hộp xác nhận đặt lệnh | |
| `futures-confirm-cost` | Dòng "Tổng cần" trong hộp xác nhận đặt lệnh | Có thuộc tính `data-value` chứa số thô |

## Trang Bot (`/bots`) — `bots.spec.ts`
`/bots?symbol=BTCUSDT` chọn sẵn cặp cho cả bot lưới và mua định kỳ (dùng cho nút "Tạo bot" ở trang Giao dịch).

| id | Phần tử | Ghi chú |
|---|---|---|
| `bots-tab-dca` | Tab "Mua định kỳ" (tab mặc định là Bot lưới) | |
| `grid-symbol` | Chọn cặp (`<select>` hoặc `<input>`, `value` = mã cặp) | |
| `grid-lower` / `grid-upper` / `grid-count` / `grid-investment` | Ô giá thấp, giá cao, số lưới, vốn USDT | |
| `grid-preview-profit` | Lãi mỗi lưới từ `gridBotPreview` (có `%`) | Tự gọi khi người dùng ngừng gõ |
| `grid-create` | Nút "Tạo bot" | Sau đó là `bot-confirm` |
| `grid-bot-card` | Mỗi thẻ bot lưới (bot đã dừng hiện chữ "Đã dừng") | |
| `grid-bot-stop` | Nút "Dừng bot" trong thẻ | |
| `grid-stop-sell-base` | Ô chọn (checkbox) "Bán coin bot đang giữ" | |
| `grid-stop-confirm` | Nút xác nhận dừng | |
| `dca-symbol` | Chọn cặp (`<select>` hoặc `<input>`, `value` = mã cặp) | |
| `dca-amount` | Ô số USDT mỗi kỳ | |
| `dca-interval` | `<select>` chu kỳ, `value` = `DAILY` / `WEEKLY` / `MONTHLY` | |
| `dca-create` | Nút "Tạo kế hoạch" | Sau đó là `bot-confirm` |
| `dca-plan-card` | Mỗi thẻ kế hoạch (giờ chạy ghi rõ "GMT+7") | Kế hoạch đã hủy không còn trong `dcaPlans` → thẻ biến mất |
| `dca-pause` / `dca-cancel` / `dca-cancel-confirm` | Tạm dừng, Hủy, xác nhận hủy | |

## Web sàn ↔ web admin — `admin.spec.ts` (PROMPT-08)
Test mở **hai trình duyệt cùng lúc**: admin thao tác ở `/admin/…`, người dùng ở web sàn phải thấy kết quả **không cần tải lại**.

**Phía web sàn (`apps/exchange`)**
| id | Phần tử | Ghi chú |
|---|---|---|
| `nav-admin` | Link "Quản trị" trên Header | Chỉ render khi `canOpenAdmin(me)`; `href` = `appLinks.admin.home(VITE_ADMIN_ORIGIN)` → bản build là `/admin/` |
| `trade-block-reason` | Dòng báo không đặt được lệnh trên trang Giao dịch (Spot và Futures) | Render khi `spotTradeBlock(...)` / `futuresTradeBlock(...)` khác `null`, **không render** khi `null`. Chữ lấy từ `TRADE_BLOCK_LABELS` |
| `spot-available-<ASSET>` | Số dư khả dụng của từng tài sản ở trang Tài sản (ví dụ `spot-available-USDT`) | **Luôn có dòng USDT**, kể cả khi số dư 0. Cập nhật từ sự kiện `balance` của kênh `user` |

**Phía web admin (`apps/admin`, đường dẫn tính từ `/admin`)**
| id | Phần tử | Ghi chú |
|---|---|---|
| `admin-no-access` | Màn "Không có quyền truy cập" | Đã đăng nhập nhưng `canOpenAdmin(me)` sai. Có link về web sàn |
| `admin-overview` | Khung trang Tổng quan (`/admin/`) | |
| `admin-open-exchange` | Link "Mở sàn" trên Header admin | `href` = `appLinks.exchange.home(VITE_EXCHANGE_ORIGIN)` → bản build là `/` |
| `admin-trading-state` | Ô trạng thái sàn trên Tổng quan | Thuộc tính `data-halted="true"` / `"false"` |
| `admin-halt-open` / `admin-resume-open` | Nút Dừng khẩn cấp / Mở lại, **trên Tổng quan** | Chỉ render khi có quyền `exchange.halt`; chỉ hiện nút hợp với trạng thái hiện tại |
| `admin-user-search` | Ô tìm người dùng ở `/admin/users` | Nhận email, UID, ID |
| `admin-user-row` | Mỗi dòng kết quả (chứa email) | Bấm cả dòng → `/admin/users/:id` |
| `admin-user-status` | Nhãn trạng thái ở trang chi tiết người dùng | Thuộc tính `data-status="active"` / `"locked"` |
| `admin-adjust-open` | Nút Cộng/Trừ số dư | Chỉ render khi có quyền `balances.adjust` |
| `adjust-asset` / `adjust-amount` | Ô tài sản (`<input>` hoặc `<select>`, `value` = mã tài sản) / ô số tiền có dấu | |
| `adjust-preview` | Dòng xem trước "số dư trước → sau" | |
| `admin-lock-open` / `admin-unlock-open` | Nút Khóa / Mở khóa | Chỉ render khi có quyền `users.lock` |
| `confirm-reason` | Ô **lý do** trong hộp xác nhận dùng chung của mọi thao tác thay đổi dữ liệu | ≥ 5 ký tự |
| `confirm-phrase` | Ô gõ chữ xác nhận (`HALT`, `RESUME`, `RESET`) | Chỉ có ở thao tác nguy hiểm |
| `audit-row` | Mỗi dòng ở `/admin/audit-logs` | Dòng chứa cả **lý do** |

## Biểu đồ nến & Lệnh / Điểm khớp (PROMPT-12) — `chart-orders.spec.ts`
| id | Phần tử | Ghi chú |
|---|---|---|
| `chart-my-orders-toggle` | Nút "Lệnh của tôi" trên thanh công cụ chart | Thuộc tính `aria-pressed="true"` / `"false"`. Mặc định bật khi đăng nhập |
| `chart-order-lines` | Danh sách `<ul>` chứa các đường lệnh đang mở trên biểu đồ | Nằm trong DOM `sr-only` để test và screen reader đọc được |
| `chart-order-line` | Mỗi dòng `<li>` lệnh đang mở | Thuộc tính `data-order-id`, `data-side="BUY"` / `"SELL"`, `data-price` (giá chuỗi gốc từ API) |
| `chart-fill-markers` | Danh sách `<ul>` chứa các điểm khớp lệnh (B/S) trên biểu đồ | Nằm trong DOM `sr-only` |
| `chart-fill-marker` | Mỗi dòng `<li>` điểm khớp | Thuộc tính `data-side="BUY"` / `"SELL"`, `data-price` (giá trung bình khớp), `data-time` (giây UTC), `data-count` (số lần khớp) |

## Thuế Việt Nam (Module T) — `tax.spec.ts`
Sàn thử nghiệm: mọi màn thuế có nhãn "thử nghiệm", không dùng tên/số của biểu mẫu nhà nước, không có ô nhập giấy tờ.
**Quy ước giá trị:** phần tử số mang thuộc tính `data-value` = số thập phân thô (chuỗi, dấu chấm, không phân tách hàng nghìn; VND là số nguyên). Chữ hiển thị tùy định dạng vi-VN; test so `data-value`, không đọc chữ.
Đường dẫn: trang Thuế của người dùng ở `/account/tax`; trang Thuế của admin ở `/admin/tax` (mục Thuế trong menu, quyền `tax.read`; sửa cài đặt cần `tax.manage`).

**Form đặt lệnh (`apps/exchange`, `/trade/:symbol`)**
| id | Ở đâu | Nội dung |
|---|---|---|
| `tax-breakdown` | form đặt lệnh, tab BÁN (Limit và Market) | Khối 4 dòng, hiện khi đã nhập khối lượng. **Không có** khi `exchangeInfo.taxMode = OFF`, và **không bao giờ có** ở tab MUA |
| `tax-gross` | trong `tax-breakdown` | Giá trị gộp (quote), `data-value` = giá × khối lượng |
| `tax-fee` | trong `tax-breakdown` | Phí ước tính, `data-value` |
| `tax-amount` | trong `tax-breakdown` | Thuế ước tính, `data-value` = `roundUp(gộp × taxRate)` (8 chữ số, `@cex/core`) |
| `tax-net` | trong `tax-breakdown` | Thực nhận ước tính = gộp − phí − thuế, `data-value` |
| `tax-vnd` | trong `tax-breakdown` | Quy đổi VND của thuế, `data-value` = `roundUp(thuế × taxVndRate, 0)`. **Không có** khi `taxVndRate = null` |
| `tax-test-label` | trong `tax-breakdown` | Nhãn "thử nghiệm" |
| `spot-tax-line` | dưới phí ước tính trên form Spot (hoặc dòng thuế trong `tax-breakdown`), và trong hộp xác nhận đặt lệnh | Dòng hiển thị thuế: MUA hiện "0 — chỉ khấu trừ khi bán"; BÁN hiện thuế ước tính (hoặc "không áp dụng" khi OFF, "0 — tổ chức trong nước tự kê khai" khi DOMESTIC_ORG, hoặc ước tính khi nhập khối lượng) |

**Bảng Lịch sử khớp lệnh (`apps/exchange`, `/trade/:symbol`)**
| id | Ở đâu | Nội dung |
|---|---|---|
| `trade-tax` | Bảng Lịch sử khớp (`UserOrdersTabs`) | Ô thuế khấu trừ của lượt khớp, `data-value` = `tr.tax ?? '0'`. Hiển thị số tiền thuế hoặc `'—'` nếu = 0 |

**Trang Thuế của người dùng (`/account/tax`)**
| id | Nội dung |
|---|---|
| `account-tax-page` | Khung trang |
| `tax-year-select` | Chọn năm (`<select>`, mặc định năm hiện tại giờ Việt Nam) |
| `tax-year-total` | Tổng thuế đã khấu trừ của năm đang chọn, `data-value` = `taxSummary.totals.taxAmount` |
| `tax-month-row` | 12 dòng tháng của năm; `data-month="YYYY-MM"` |
| `tax-category-select` | `<select>` phân loại, `value` = `INDIVIDUAL` / `FOREIGN_ORG` / `DOMESTIC_ORG`; đổi giá trị gọi `taxUpdateProfile`. Không có ô nhập giấy tờ nào |
| `tax-withholding-row` | Mỗi bản ghi khấu trừ; `data-trade-id` = `tradeId` |
| `tax-export-csv` | Nút tải CSV (`taxExport`); tệp tải về có dòng tiêu đề = `TAX_EXPORT_COLUMNS` |

**Trang Thuế của admin (`/admin/tax`)**
| id | Nội dung |
|---|---|
| `admin-tax-page` | Khung trang |
| `admin-tax-mode` | `<select>` `OFF` / `WITHHOLD` |
| `admin-tax-rate` | Ô tỷ lệ (chuỗi thập phân, vd `0.001`) |
| `admin-tax-vnd-rate` | Ô tỷ giá VND/USDT; để trống + lưu = xóa tỷ giá (`null`) |
| `admin-tax-reason` | Ô lý do (≥ 5 ký tự), nằm ngay trên trang (không qua hộp xác nhận) |
| `admin-tax-save` | Nút lưu, gọi `adminUpdateTaxSettings`; khóa khi thiếu lý do; không render khi thiếu quyền `tax.manage` |
| `admin-tax-period` | Chọn kỳ (`YYYY-MM` hoặc `YYYY-Qn`); mặc định tháng hiện tại giờ Việt Nam |
| `admin-tax-total` | Tổng thuế của kỳ, `data-value` = `adminTaxSummary.totals.taxAmount` |
| `admin-tax-by-symbol-row` | Mỗi cặp có bản ghi; `data-symbol` |
| `admin-tax-export-csv` | Nút tải bảng kê CSV; tiêu đề = `ADMIN_TAX_EXPORT_COLUMNS` |


## Rà soát lần 8 (PROMPT-17/18)
Test: `e2e/tests/review08-futures.spec.ts`, `review08-spot-tax.spec.ts`, `review08-profile.spec.ts`, `review08-admin.spec.ts`.
**Quy ước giá trị** (như mục Thuế): phần tử số mang `data-value` = số thập phân thô (chuỗi, dấu chấm, không phân tách hàng nghìn); test so `data-value`, không đọc chữ hiển thị.
Phần tử chưa có dữ liệu (đang tải / lỗi) **không** mang `data-value` (không hiện `0` thay cho "chưa biết").
Những chỗ test đọc **chữ** vì chữ chính là yêu cầu (nút, thông báo) được ghi ở cột "Chữ".

### Futures — form đặt lệnh (`/futures/:symbol`) — `review08-futures.spec.ts` (S-01, S-02)
| id | Phần tử | `data-value` / ghi chú |
|---|---|---|
| `futures-order-type-limit` | Tab "Giới hạn (Limit)" (cạnh `futures-order-type-market`) | mới |
| `futures-price` | Ô "Giá đặt lệnh" của lệnh Limit (`<input>`) | mới |
| `futures-tpsl-toggle` | Ô chọn (`<input type="checkbox">`) "TP / SL" của form | mới. Bật lên mới hiện hai ô dưới |
| `futures-order-tp` / `futures-order-sl` | Ô giá Chốt lời / Cắt lỗ của form (`<input>`) | mới (khác `tpsl-take-profit`/`tpsl-stop-loss` của hộp TP/SL trên dòng vị thế) |
| `futures-est-notional` | Giá trị lệnh = giá tham chiếu × khối lượng (MARKET: mark; LIMIT: giá đặt) | `data-value` (PROMPT-17 chỉ nêu `data-value` cho `futures-est-cost`; bốn ô số dưới đây đều mang `data-value` để test không đọc chữ) |
| `futures-est-margin` | Ký quỹ ban đầu = `initialMargin(giá, khối lượng, đòn bẩy)` | `data-value` = số **làm tròn lên** 8 chữ số, đúng số server khóa |
| `futures-est-fee` | Phí mở ước tính = `roundUp(giá trị × takerFee)` | `data-value`. Chữ ghi tỉ lệ ("0,05% taker"); LIMIT thêm ghi chú "maker"; MARKET **không** có chữ "maker" |
| `futures-est-cost` | Tổng cần = ký quỹ + phí | `data-value` |
| `futures-available` | Khả dụng ví Futures | chữ định dạng vi-VN (như mục Futures ở trên) |
| `futures-max-long` / `futures-max-short` | Tối đa mở được (đơn vị coin) | `data-value` = `floorToStep(khả dụng ÷ (giá/đòn bẩy + giá × takerFee), stepSize)`; MARKET lấy thêm min với tổng khối lượng 20 mức của phía khớp |
| `futures-max-btn` | Nút "Tối đa" cạnh ô khối lượng | tên truy cập đúng là "Tối đa" (test tìm theo chữ); điền số tối đa vào `futures-qty` |
| `futures-est-funding` | Dòng funding | chữ: "{rate}% · còn {mm:ss}", ước tính mỗi kỳ, ghi ai trả: rate > 0 → "Long trả Short", rate < 0 → "Short trả Long" |
| `futures-order-block-reason` | Lý do khóa nút Mở Long/Short, ngay dưới nút | chỉ render khi nút bị khóa vì khối lượng/giá trị/tiền. Chữ: thiếu tiền → "…cần thêm ~X USDT (ký quỹ + phí). Khả dụng: Y" (X = tổng cần − khả dụng); dưới mức tối thiểu → ghi `minNotional` và giá trị lệnh hiện tại. Có nút **"Chuyển từ Spot"** (tìm theo chữ) mở hộp chuyển tiền (`transfer-amount`) |
| `futures-open-long` / `futures-open-short` | (đã có) | `disabled` thật (thuộc tính `disabled`) khi `futures-order-block-reason` hiện |
| `futures-confirm-notional` / `futures-confirm-margin` / `futures-confirm-fee` / `futures-confirm-cost` | Bốn dòng trong hộp "Xác nhận đặt lệnh" Futures (`order-confirm` ở trong cùng hộp) | `data-value`, cùng số với `futures-est-*` của form |
| (thông báo) | Chốt lời/cắt lỗ sai phía | chữ (toast hoặc dòng lỗi): Long "Chốt lời phải **cao hơn** và cắt lỗ **thấp hơn** giá mark …"; Short "Chốt lời phải **thấp hơn** và cắt lỗ **cao hơn** …" (test tìm `/chốt lời[^.]*cao hơn/i`, `/chốt lời[^.]*thấp hơn/i`) |

### Spot — phí/thuế trên form đặt lệnh — `review08-spot-tax.spec.ts` (S-03)
| id | Phần tử | Ghi chú |
|---|---|---|
| `spot-tax-line` | Dòng thuế dưới dòng phí của form `/trade/:symbol`, **luôn có** (cả khi chưa nhập khối lượng) | Chữ: MUA (thuế bật) "Thuế (0,25%): 0 — chỉ khấu trừ khi bán"; thuế `OFF` (cả MUA lẫn BÁN) "Thuế: không áp dụng (sàn đang tắt)"; BÁN `WITHHOLD` có `tax-breakdown` (dòng vẫn ghi tỉ lệ); `DOMESTIC_ORG` "Thuế: 0 — tổ chức trong nước tự kê khai" (không có `tax-breakdown`). Tỉ lệ từ `exchange:status`/`exchangeInfo.taxRate`, không ghi cứng. Dòng phí ghi tỉ lệ: "Phí giao dịch (0,1%): ~…" |

### Hồ sơ (`/settings`, tab "Hồ sơ & Tài khoản") — `review08-profile.spec.ts` (S-14)
| id | Phần tử | `data-value` |
|---|---|---|
| `profile-volume-today` | Khối lượng hôm nay (khối "Hoạt động giao dịch") | `accountTradingStats.volume.today.total` |
| `profile-volume-7d` | Khối lượng 7 ngày | `volume.last7d.total` |
| `profile-volume-30d` | Khối lượng 30 ngày | `volume.last30d.total` |
| `profile-tax-month` | Thuế **đã khấu trừ** tháng này (nhãn "… tháng MM/YYYY") | `tax.thisMonth.withheldAmount` ("0.00000000" khi chưa có, kể cả `DOMESTIC_ORG`/thuế tắt) |
Chữ bắt buộc: "đã khấu trừ", "được trừ thẳng vào tiền bán"; **không bao giờ** "cần đóng" hay "phải nộp"; thuế tắt → "Sàn đang tắt thuế"; `DOMESTIC_ORG` → "tự kê khai … sàn không khấu trừ"; nút/link "Xem chi tiết thuế" → `/account/tax`.

### Web admin (`/admin/…`) — `review08-admin.spec.ts` (S-13, S-15, AD-07, AD-10)
| id | Ở đâu | Ghi chú |
|---|---|---|
| `admin-2fa-required` | Màn "bắt buộc bật 2FA" của app admin | Hiện khi `publicConfig.staffTwoFactorRequired === true` và (`!user.twoFactorEnabled` **hoặc** một lời gọi admin trả `TWO_FACTOR_REQUIRED`). Khi hiện: không có `admin-overview`, `admin-halt-open`, danh sách người dùng |
| `admin-no-2fa-notice` | Dải trên cùng "Máy chủ dev: admin không yêu cầu 2FA" | Chỉ khi `staffTwoFactorRequired === false` (hệ e2e: không bao giờ hiện) |
| `admin-user-tax-total` | Thẻ tóm tắt đầu trang chi tiết người dùng (không nằm trong tab) | `data-value` = `adminGetUser.tax.withheldTotal` |
| `admin-user-volume-today` | Thẻ tóm tắt đầu trang chi tiết người dùng | `data-value` = `adminGetUser.trading.volume.today.total` |
| `admin-unpriced-assets` | Dòng "Chưa tính giá: X, Y" ở thẻ tổng tài sản | Chỉ render khi `unpricedAssets` không rỗng |
| `admin-holding-row` | Mỗi dòng của bảng tài sản nắm giữ (tab "Số dư & Ví") — **một dòng cho mỗi số dư khác 0**, sắp theo giá trị USDT giảm dần | `data-asset` = mã coin |
| `admin-holding-value` | Trong dòng: giá trị USDT | `data-value` = `Balance.valueUsdt` (không có thuộc tính khi `null`; chữ "—") |
| `admin-holding-pct` | Trong dòng: % danh mục | `data-value` = giá trị ÷ tổng × 100 (số thập phân, được làm tròn tối đa 2 chữ số lẻ) |
| `admin-holdings-total` | Dòng cuối bảng: tổng | `data-value` = `totalValueUsdt` của server (không cộng lại ở client) |
| `admin-market-health` | Thẻ "Nguồn giá thị trường" ở Tổng quan | `data-live`, `data-stale`, `data-unavailable` = số cặp theo `market.symbols[].status`. Không còn chữ "150ms" |
| `admin-futures-upnl` | PnL chưa thực hiện của mỗi vị thế Futures ở chi tiết người dùng | `null` → chữ "—" (không "0.00000000"), không có `data-value`. (`review08-admin.spec.ts` AD-07 đang `test.fixme`: sim chưa có cách làm mark STALE) |
| `admin-no-access` | (đã có) | không được hiện thay cho `admin-2fa-required` |

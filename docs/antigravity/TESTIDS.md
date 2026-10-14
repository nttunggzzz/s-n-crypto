# `data-testid` cho test nghiệm thu (e2e)

Test trình duyệt (`npm run e2e`) tìm phần tử bằng `data-testid`, để đổi chữ hiển thị hoặc bố cục không làm hỏng test.
Gắn **đúng tên** dưới đây; mỗi id chỉ xuất hiện một lần trên trang, trừ những id ghi "mỗi dòng" / "mỗi thẻ".
Test nằm ở `e2e/tests/*.spec.ts` — đọc test để biết chính xác luồng được kiểm.

## Chung
| id | Phần tử | Ghi chú |
|---|---|---|
| `order-confirm` | Nút xác nhận trong hộp "Xác nhận đặt lệnh" (Spot **và** Futures) | Hộp này hiện khi `preferences.confirmOrders` bật (mặc định bật) |
| `bot-confirm` | Nút xác nhận trong hộp tóm tắt trước khi tạo bot lưới / kế hoạch mua định kỳ | Bot dùng tiền thật trong ví ảo → luôn hỏi lại |

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
| `confirm-submit` | Nút xác nhận | Khóa khi chưa đủ lý do / gõ sai chữ |
| `audit-row` | Mỗi dòng ở `/admin/audit-logs` | Dòng chứa cả **lý do** |

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

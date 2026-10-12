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
| `audit-row` | Mỗi dòng ở `/admin/audit-logs` | Dòng chứa cả **lý do** |

## Biểu đồ nến & Lệnh / Điểm khớp (PROMPT-12) — `chart-orders.spec.ts`
| id | Phần tử | Ghi chú |
|---|---|---|
| `chart-my-orders-toggle` | Nút "Lệnh của tôi" trên thanh công cụ chart | Thuộc tính `aria-pressed="true"` / `"false"`. Mặc định bật khi đăng nhập |
| `chart-order-lines` | Danh sách `<ul>` chứa các đường lệnh đang mở trên biểu đồ | Nằm trong DOM `sr-only` để test và screen reader đọc được |
| `chart-order-line` | Mỗi dòng `<li>` lệnh đang mở | Thuộc tính `data-order-id`, `data-side="BUY"` / `"SELL"`, `data-price` (giá chuỗi gốc từ API) |
| `chart-fill-markers` | Danh sách `<ul>` chứa các điểm khớp lệnh (B/S) trên biểu đồ | Nằm trong DOM `sr-only` |
| `chart-fill-marker` | Mỗi dòng `<li>` điểm khớp | Thuộc tính `data-side="BUY"` / `"SELL"`, `data-price` (giá trung bình khớp), `data-time` (giây UTC), `data-count` (số lần khớp) |

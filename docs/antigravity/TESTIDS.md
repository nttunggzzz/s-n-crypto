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

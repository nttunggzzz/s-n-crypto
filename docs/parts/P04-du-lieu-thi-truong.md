# P04 — Dữ liệu thị trường

**Phụ trách:** Claude · **Thư mục:** `server/src/modules/market/`

## Mục tiêu
Cung cấp giá, sổ lệnh, giao dịch gần đây và nến **thật, mới, đáng tin** cho giao diện và bộ khớp lệnh; tự phát hiện khi dữ liệu không còn đáng tin.

## Phạm vi
- Kết nối WebSocket Binance cho 10 cặp: giá mua/bán tốt nhất (bookTicker), sổ lệnh (depth), giao dịch (trades), nến (kline).
- REST Binance: nến lịch sử, `exchangeInfo` (bước giá, bước khối lượng, giá trị lệnh tối thiểu).
- Phát lại cho người dùng qua WebSocket của dự án (P02) — người dùng **không** kết nối thẳng Binance.
- **Phát hiện giá cũ:** quá N giây không có cập nhật → đánh dấu `STALE`, báo P05 dừng khớp, cảnh báo Telegram.
- Tự kết nối lại có backoff; REST làm dự phòng.
- Lưu nến đã đóng vào PostgreSQL (dùng cho biểu đồ và P06). Chỉ lưu nến **đã đóng**; ghi vào phải idempotent.
- Thiết kế lớp "nguồn dữ liệu" để thay/bổ sung OKX, Bybit sau này.

## Không làm
Chỉ báo kỹ thuật (thuộc `packages/core`/P06), logic khớp lệnh (P05).

## Checklist
- [x] Giai đoạn 1: kết nối Binance, phát lại qua WS, sổ lệnh, giao dịch gần đây, nến, `exchangeInfo`, phát hiện giá cũ, tự kết nối lại — *chưa có cảnh báo Telegram (P01)*
- [x] Giai đoạn 2: nhiều khung thời gian (1m → 1D), lịch sử nến dài cho biểu đồ (phân trang bằng `endTime`)
- [ ] Giai đoạn 4: backfill nến lịch sử cho engine tín hiệu, kiểm tra không thiếu/không trùng

## Xong khi
Ngắt mạng giả lập → trạng thái chuyển `STALE` trong vài giây, khớp lệnh dừng, có cảnh báo; có mạng lại → tự phục hồi.

## Lưu ý
- Binance chặn IP Mỹ → server phải đặt ở Singapore.
- Tôn trọng giới hạn tần suất (weight) của Binance; ưu tiên WebSocket, REST chỉ khi cần.

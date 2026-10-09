# P10 — Giao diện web tín hiệu

**Phụ trách:** Antigravity · **Thư mục:** `apps/signals/`
**Backend tương ứng:** P06 · **Chỉ làm sau cổng M3** (tín hiệu đã được kiểm chứng)

## Mục tiêu
Cho người dùng xem tín hiệu và **thành tích thật, minh bạch**, rồi chuyển sang sàn ảo để thử.

## Màn hình (giai đoạn 6)
| Màn hình | Nội dung |
|---|---|
| Danh sách tín hiệu | Cặp, hướng, entry, TP, SL, R:R, trạng thái (đang mở / chạm TP / chạm SL / hết hạn), thời gian; lọc theo coin/hướng/setup |
| Chi tiết tín hiệu | Biểu đồ có vùng entry/TP/SL, lý do (các yếu tố hợp lưu), điều kiện vô hiệu, kết quả nếu đã đóng; nút **"Thử trên sàn ảo"** (mở sàn với form lệnh đã điền sẵn) |
| Thành tích | Win rate, kỳ vọng R, profit factor, drawdown, đường vốn; **liệt kê cả lệnh thua**; theo setup/coin/tháng |
| Không có quyền | Giải thích tính năng và cách được cấp quyền (sau này: nâng cấp gói) |

Dùng chung tài khoản với sàn (đăng nhập một lần).

## Quy tắc
- Luôn hiển thị cảnh báo: tín hiệu chỉ để tham khảo/mô phỏng, kết quả quá khứ không đảm bảo tương lai.
- Không làm đẹp số liệu: không ẩn lệnh thua, không chọn khoảng thời gian có lợi.
- Số liệu lấy từ API, không tự tính lại ở giao diện.

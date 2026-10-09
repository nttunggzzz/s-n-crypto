# P11 — App mobile

**Phụ trách:** Antigravity (giao diện, đóng gói) + Claude (thông báo đẩy, token đăng nhập cho app)
**Thư mục:** `apps/exchange/` (cùng code với web, đóng gói bằng Capacitor)

## Mục tiêu
Phát hành app iOS/Android từ chính code web của sàn — không viết app riêng.

## Phạm vi (giai đoạn 7)
- **PWA:** cài được từ trình duyệt, icon, màn hình khởi động, hoạt động khi mạng chập chờn.
- **Capacitor:** đóng gói iOS/Android; xử lý vùng tai thỏ/thanh điều hướng, nút back Android, bàn phím số.
- **Thông báo đẩy** (Claude làm phần server): lệnh khớp, TP/SL kích hoạt, cảnh báo giá, tín hiệu mới.
- **Đăng nhập trong app:** cơ chế token (Claude), lưu an toàn trên thiết bị (Keychain/Keystore), tùy chọn mở khóa bằng vân tay/Face ID.
- **Xóa tài khoản ngay trong app** (Apple bắt buộc).
- Chuẩn bị nộp store: mô tả ghi rõ "mô phỏng, không có tiền thật", chính sách quyền riêng tư, ảnh chụp màn hình; beta qua TestFlight và kênh thử nội bộ Google Play.

## Lưu ý
- Apple hay từ chối app chỉ bọc lại web → thông báo đẩy, đăng nhập sinh trắc học là tính năng riêng cho điện thoại.
- Chi phí: Apple Developer 99 USD/năm, Google Play 25 USD một lần.
- Phần thu phí trong app (nếu sau này có) phải theo quy định thanh toán của Apple/Google — nằm trong backlog kinh doanh.

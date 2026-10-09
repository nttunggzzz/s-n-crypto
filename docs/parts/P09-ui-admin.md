# P09 — Giao diện Admin

**Phụ trách:** Antigravity · **Thư mục:** `apps/admin/`
**Backend tương ứng:** P03 (người dùng, quyền, nhật ký quản trị), P05 (số dư, cấu hình sàn), P06 (tín hiệu)

## Mục tiêu
Công cụ vận hành sàn: an toàn, rõ ràng, mọi thao tác nhạy cảm phải xác nhận và ghi lý do. Ưu tiên desktop.

## Màn hình

### Giai đoạn 3
| Màn hình | Nội dung |
|---|---|
| Đăng nhập + 2FA | Bắt buộc 2FA; chưa bật thì hướng dẫn bật |
| Tổng quan | Số người dùng, số lệnh hôm nay, tình trạng kết nối Binance, trạng thái sàn (đang chạy / đã dừng), kết quả đối soát sổ cái gần nhất |
| Người dùng | Tìm theo email/ID; danh sách có lọc + phân trang |
| Chi tiết người dùng | Thông tin, vai trò, trạng thái; số dư; lệnh; sổ cái; nút Khóa/Mở khóa; **Cộng/Trừ số dư** (bắt buộc nhập lý do, hộp xác nhận hiện số dư trước/sau); Reset tài khoản; bật/tắt **quyền dùng tín hiệu** |
| Cấu hình sàn | Bật/tắt từng cặp, mức phí, cấu hình nạp tiền ảo, khối lượng tối thiểu |
| Dừng khẩn cấp | Nút dừng/mở lại toàn bộ giao dịch — xác nhận 2 bước (gõ lại chữ xác nhận) |
| Nhật ký quản trị | Danh sách chỉ đọc, lọc theo người thao tác, hành động, thời gian |
| Vai trò | Chỉ `owner` thấy: gán vai trò cho tài khoản quản trị |

### Giai đoạn 4
- Hiệu quả tín hiệu: số tín hiệu, win rate, kỳ vọng R, drawdown, đường vốn của bot; lọc theo setup/coin/hướng/phiên bản engine.
- Cấu hình engine: coin theo dõi, trọng số, ngưỡng (mỗi lần lưu tạo phiên bản mới).

## Quy tắc
- Nút/chức năng hiển thị theo quyền của người đăng nhập, **nhưng server vẫn là nơi quyết định** — giao diện không được giả định có quyền.
- Mọi thao tác thay đổi dữ liệu: hộp xác nhận + hiện rõ hậu quả.
- Tài khoản bot tín hiệu: hiển thị khóa, không có nút chỉnh số dư.
- Không hiển thị mật khẩu, token, hay bí mật nào.

## Xong khi
Admin thực hiện đủ các thao tác trên với mock; sau khi nối backend, mỗi thao tác xuất hiện trong Nhật ký quản trị.

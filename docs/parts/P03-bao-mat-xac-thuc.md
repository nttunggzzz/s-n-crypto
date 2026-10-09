# P03 — Xác thực, phân quyền & bảo mật

**Phụ trách:** Claude · **Thư mục:** `server/src/modules/auth/`, `server/src/modules/admin/` (phần người dùng & nhật ký quản trị)

## Mục tiêu
Một tài khoản dùng cho cả sàn và web tín hiệu; mỗi người chỉ thấy dữ liệu của mình; admin được bảo vệ chặt và mọi thao tác đều để lại dấu vết.

## Phạm vi
**Tài khoản người dùng** (Better Auth)
- Đăng ký, xác minh email, đăng nhập/đăng xuất, quên/đổi mật khẩu.
- Phiên trong cookie `httpOnly` + `Secure` + `SameSite`; danh sách thiết bị, đăng xuất từ xa.
- 2FA tùy chọn cho người dùng; **bắt buộc** cho admin.
- Xóa tài khoản (giai đoạn 7 — Apple bắt buộc).

**Phân quyền**
- Vai trò: `user`, `support`, `admin`, `owner`. Kiểm tra theo **quyền**, khai báo tập trung một chỗ.
- Mặc định từ chối; mọi truy vấn dữ liệu cá nhân lọc theo `userId` từ phiên (chống IDOR, trả 404).
- Cờ tính năng theo người dùng: `signals_access` (Admin bật/tắt; sau này nối thanh toán).
- Chỉ `owner` đổi vai trò; không ai tự nâng quyền.

**Chống lạm dụng**
- Rate limit theo IP và theo tài khoản (đăng nhập, đăng ký, đặt lệnh, nạp tiền ảo).
- Captcha khi đăng ký; khóa tạm khi đăng nhập sai nhiều lần.

**Nhật ký quản trị**
- Bảng `audit_logs`: ai, hành động, đối tượng, giá trị trước/sau, IP, thời gian. **Chỉ thêm, không sửa/xóa** (kể cả owner).

**Bảo mật chung**
- Kiểm tra đầu vào bằng schema của P02 ở mọi endpoint.
- Header bảo mật (CSP, HSTS…), CORS chỉ cho phép tên miền của dự án.
- Không log mật khẩu, token, cookie.
- Tài khoản bot tín hiệu: không đăng nhập được, không ai chỉnh số dư.

## Checklist
- [x] Giai đoạn 1: tài khoản người dùng, phiên, rate limit, xác minh email — *captcha Turnstile & email Resend có code, chờ khóa API*
- [ ] Giai đoạn 3: vai trò & quyền, 2FA admin, nhật ký quản trị, cờ `signals_access`, API quản lý người dùng (tìm, xem, khóa/mở)
- [ ] Giai đoạn 7: kiểm tra bảo mật tổng thể, xóa tài khoản, chính sách quyền riêng tư, token cho app mobile

## Xong khi
Có test tự động cho: user A đọc dữ liệu user B → 404; user thường gọi `/api/v1/admin/*` → 403; admin chưa bật 2FA → không vào được; mọi thao tác admin sinh 1 dòng `audit_logs`.

## Lưu ý
Ẩn nút trên giao diện **không** phải phân quyền — server luôn tự kiểm tra.

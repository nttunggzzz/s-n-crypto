# Chạy sàn trên máy cá nhân (trước khi thuê Railway)

Sàn chạy trên máy bạn, người khác vào qua một link HTTPS miễn phí của Cloudflare (`https://….trycloudflare.com`).
Giá thật từ Binance (IP Việt Nam không bị chặn). Khi ổn định thì chuyển sang Railway theo [railway.md](railway.md): code giống hệt.

## Cách hoạt động
| Thư mục | Là gì |
|---|---|
| `D:\Claude\crypto` | Nơi Claude code (không phục vụ người dùng) |
| `D:\Claude\crypto-ui` | Nơi Antigravity code giao diện |
| `D:\Claude\crypto-host` | **Bản đang phục vụ người dùng**: `main` + nhánh giao diện, đã kiểm tra. Chỉ đổi khi chạy `update` |
| `D:\Claude\crypto-host-data` | Dữ liệu thật: `.env.host` (cấu hình + khóa bí mật), `pgdata/` (database), `backups/`, `logs/` |

Nhờ tách thư mục, hai bên code tiếp mà người dùng không bị ảnh hưởng. Giao diện mới chỉ tới người dùng khi bạn chủ động cập nhật.

## Lần đầu
1. **Cài Cloudflare Tunnel** (một lần), trong PowerShell:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
   Cài xong, mở lại cửa sổ terminal.
2. **Chuẩn bị bản chạy** (gộp `main` + giao diện, cài đặt, chạy toàn bộ kiểm tra gồm cả test trình duyệt; khoảng 10–15 phút):
   ```bash
   npm run host -- update
   ```
3. **Khởi động:**
   ```bash
   npm run host -- start
   ```
   - Lần đầu tạo file `D:\Claude\crypto-host-data\.env.host` với một `DATA_ENCRYPTION_KEY` mới. **Chép khóa này vào trình quản lý mật khẩu**: mất khóa là mất 2FA của mọi người.
   - Màn hình in địa chỉ sàn và trang quản trị. **Giữ cửa sổ này mở**; đóng là sàn dừng.
4. **Telegram** (khuyên dùng: nhận link mới mỗi lần khởi động và cảnh báo khi có sự cố):
   - mở `.env.host`, điền `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`;
   - Ctrl+C rồi `start` lại.
5. **Tài khoản của bạn:**
   ```bash
   npm run host -- invite "Chủ dự án"
   ```
   - Mở link mời in ra, đăng ký.
   - Cấp quyền owner:
     ```bash
     npm run host -- set-role <email-của-bạn> owner
     ```
   - Đăng nhập lại, bật 2FA ở Cài đặt → Bảo mật, rồi vào trang Quản trị.

## Hằng ngày
| Việc | Lệnh |
|---|---|
| Bật sàn | `npm run host -- start` |
| Tắt sàn | Ctrl+C trong cửa sổ đang chạy, hoặc `npm run host -- stop` từ cửa sổ khác |
| Mời người dùng | `npm run host -- invite "<tên>" [số lượt] [số ngày]`, hoặc trang Quản trị → Mã mời |
| Xem trạng thái | `npm run host -- status` |
| Cập nhật code mới (Claude/Antigravity đã xong việc) | Ctrl+C → `npm run host -- update` → `npm run host -- start` |
| Cập nhật dù test trình duyệt còn đỏ (bản sửa gấp) | Ctrl+C → `npm run host -- update --skip-e2e` → `npm run host -- start` |

## Cần biết
- **Địa chỉ đổi mỗi lần khởi động** (link miễn phí không cố định). Người dùng cần link mới và đăng nhập lại. Có tên miền thì chuyển sang tunnel cố định.
- **Máy tắt, ngủ hoặc mất mạng là sàn dừng.** Lệnh chờ không khớp được, mua định kỳ bỏ lỡ kỳ đó. Nên tắt chế độ ngủ khi đang chạy.
- **Server tự khởi động lại khi bị crash** (database vẫn chạy): chờ 5 giây, rồi 30 giây, rồi 2 phút nếu vẫn chết liên tục;
  chạy ổn 10 phút thì đếm lại từ đầu. Mỗi lần crash có dòng `[host] server exited (…) — restarting in …` trong log và
  tin Telegram (nếu đã cài). Lỗi fatal của Node để lại file báo cáo `report.*.json` trong `crypto-host-data\logs\`.
  Ctrl+C / `npm run host -- stop` vẫn tắt hẳn, không khởi động lại.
- **`update` chạy cả test trình duyệt**, gồm nhóm `host-mode` chạy app với đúng cấu hình sàn này (chỉ đăng ký bằng mã mời,
  không bắt xác minh email). Test đỏ thì `update` dừng và **`start` từ chối chạy** (kể cả bản cũ), vì `update` xóa
  `version.json` ngay từ đầu. Muốn phục vụ bản mới dù test đỏ (biết rõ phần nào đỏ): `update --skip-e2e`.
  `version.json` ghi `"e2e": "passed" | "skipped"`.
- **Server chạy bằng bản build** `crypto-host\server\dist\main.js` (`update` build nó); không có bản build thì chạy thẳng mã nguồn qua tsx.
- **Bộ nhớ** của server được ghi vào log mỗi 10 phút (dòng `"msg":"memory"`, `rssMb`, `heapUsedMb`).
- **Email chưa gửi thật** (chưa có tên miền):
  - người dùng không cần xác minh email;
  - email "quên mật khẩu" nằm trong `crypto-host-data\logs\`: tìm dòng `EMAIL (log transport`, lấy link gửi cho người đó.
- **Sao lưu:**
  - mỗi lần `start`, database được chép vào `crypto-host-data\backups\` (giữ 7 bản gần nhất);
  - khôi phục: tắt sàn, đổi tên `pgdata` cũ, chép bản sao lưu thành `pgdata`.
- **Captcha (Turnstile):**
  - muốn dùng: thêm `trycloudflare.com` vào Hostnames của widget, điền hai khóa vào `.env.host`;
  - để trống thì không có captcha. Đăng ký vẫn cần mã mời.
- **Không bao giờ** đưa `.env.host` lên git hay gửi qua chat.

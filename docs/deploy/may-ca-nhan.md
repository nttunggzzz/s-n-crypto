# Chạy sàn trên máy cá nhân (trước khi thuê Railway)

Sàn chạy trên máy bạn, người khác vào qua một link HTTPS miễn phí của Cloudflare (`https://….trycloudflare.com`).
Giá thật từ Binance (IP Việt Nam không bị chặn). Khi ổn định thì chuyển sang Railway theo [railway.md](railway.md): code giống hệt.

## Cách hoạt động
| Thư mục | Là gì |
|---|---|
| `D:\Claude\crypto` | Thư mục dự án duy nhất. Nơi Claude code (nhánh `main`, không phục vụ người dùng) |
| `D:\Claude\crypto\ui` | Nơi Antigravity code giao diện (git worktree nhánh giao diện, git bỏ qua) |
| `D:\Claude\crypto\host` | **Bản đang phục vụ người dùng**: `main` + nhánh giao diện, đã kiểm tra. Chỉ đổi khi chạy `update` (git bỏ qua) |
| `D:\Claude\crypto\host-data` | Dữ liệu thật: `.env.host` (cấu hình + khóa bí mật), `pgdata/` (database), `backups/`, `logs/` (git bỏ qua) |

**Không bao giờ chạy `git clean -x` (hay `-X`) ở `D:\Claude\crypto`**: lệnh đó xóa cả `host-data` (dữ liệu người dùng thật).

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
   - Lần đầu tạo file `D:\Claude\crypto\host-data\.env.host` với một `DATA_ENCRYPTION_KEY` mới. **Chép khóa này vào trình quản lý mật khẩu**: mất khóa là mất 2FA của mọi người.
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
| Sao lưu ngay (sàn đang chạy cũng được) | `npm run host -- backup` |
| Hẹn sao lưu mỗi đêm | `npm run host -- schedule-backup [HH:MM]` |
| Cập nhật code mới (Claude/Antigravity đã xong việc) | Ctrl+C → `npm run host -- update` → `npm run host -- start` |
| Cập nhật dù test trình duyệt còn đỏ (bản sửa gấp) | Ctrl+C → `npm run host -- update --skip-e2e` → `npm run host -- start` |

## Cần biết
- **Địa chỉ đổi mỗi lần khởi động** (link miễn phí không cố định). Người dùng cần link mới và đăng nhập lại. Có tên miền thì chuyển sang tunnel cố định.
- **Máy tắt, ngủ hoặc mất mạng là sàn dừng.** Lệnh chờ không khớp được, mua định kỳ bỏ lỡ kỳ đó. Nên tắt chế độ ngủ khi đang chạy.
- **Server tự khởi động lại khi bị crash** (database vẫn chạy): chờ 5 giây, rồi 30 giây, rồi 2 phút nếu vẫn chết liên tục;
  chạy ổn 10 phút thì đếm lại từ đầu. Mỗi lần crash có dòng `[host] server exited (…) — restarting in …` trong log và
  tin Telegram (nếu đã cài). Lỗi fatal của Node để lại file báo cáo `report.*.json` trong `host-data\logs\`.
  Ctrl+C / `npm run host -- stop` vẫn tắt hẳn, không khởi động lại.
- **`update` chạy cả test trình duyệt**, gồm nhóm `host-mode` chạy app với đúng cấu hình sàn này (chỉ đăng ký bằng mã mời,
  không bắt xác minh email). Test đỏ thì `update` dừng và **`start` từ chối chạy** (kể cả bản cũ), vì `update` xóa
  `version.json` ngay từ đầu. Muốn phục vụ bản mới dù test đỏ (biết rõ phần nào đỏ): `update --skip-e2e`.
  `version.json` ghi `"e2e": "passed" | "skipped"`.
- **Server chạy bằng bản build** `host\server\dist\main.js` (`update` build nó); không có bản build thì chạy thẳng mã nguồn qua tsx.
- **Bộ nhớ** của server được ghi vào log mỗi 10 phút (dòng `"msg":"memory"`, `rssMb`, `heapUsedMb`).
- **Email chưa gửi thật** (chưa có tên miền):
  - người dùng không cần xác minh email;
  - email "quên mật khẩu" nằm trong `host-data\logs\`: tìm dòng `EMAIL (log transport`, lấy link gửi cho người đó.
- **Sao lưu (hai lớp):**
  - **Bản chép thư mục** (`pgdata-…` trong `host-data\backups\`): mỗi lần `start` và trước `restore`, giữ 7 bản. Chỉ để quay lại nhanh trên cùng máy.
  - **Sao lưu khi sàn đang chạy:** `npm run host -- backup` → `host-data\backups\logical\cex-<giờ>.cexbak.gz` (giữ `HOST_BACKUP_KEEP` bản, mặc định 30).
    Ghi xong, lệnh **diễn tập khôi phục**: nạp chính file đó vào database tạm `cex_verify`, đối soát sổ cái, rồi xóa.
    Bản sao lưu không khôi phục được thì báo lỗi (và Telegram nếu đã cài). `--no-verify` bỏ bước diễn tập.
  - **Chạy mỗi đêm:** `npm run host -- schedule-backup [HH:MM]` (mặc định 03:30, Windows Task Scheduler; máy phải bật và bạn đã đăng nhập).
    Gỡ: `npm run host -- unschedule-backup`. Kiểm: `schtasks /Query /TN "CEX host backup"`.
  - **Chép ra ngoài máy** (làm ngay, đây là phần quan trọng): thêm vào `host-data\.env.host`
    ```
    HOST_BACKUP_PASSPHRASE=<cụm mật khẩu dài — ghi vào trình quản lý mật khẩu, mất là không mở được bản sao lưu>
    HOST_BACKUP_COPY_DIR=E:\Backup\cex
    HOST_BACKUP_KEEP=30
    ```
    `HOST_BACKUP_COPY_DIR` là ổ khác, USB hoặc thư mục đồng bộ (OneDrive, Google Drive).
    Có `HOST_BACKUP_PASSPHRASE` thì file được mã hóa (AES-256), đưa lên đám mây cũng không đọc được.
    Bản sao lưu chứa email và mật khẩu đã băm của người dùng: **không** chép ra ngoài khi chưa mã hóa.
    Giữ `DATA_ENCRYPTION_KEY` ở nơi riêng, không có nó thì mã 2FA trong bản sao lưu không dùng được.
  - **Khôi phục:** `npm run host -- stop`, rồi `npm run host -- restore <file> --yes`, rồi `start`.
    Lệnh chép thư mục database trước khi ghi đè (quay lại được) và thay **toàn bộ** dữ liệu bằng bản sao lưu
    (mọi thứ sau thời điểm sao lưu sẽ mất). Nó kiểm số dòng từng bảng; sai mật khẩu, file bị cắt hoặc khác phiên bản schema thì không đổi gì.
    Cần cùng phiên bản code với lúc sao lưu (cùng số migration): khôi phục xong mới `update` lên code mới.
  - Chưa khôi phục thử thì chưa coi là có bản sao lưu: bước diễn tập hằng đêm làm việc đó mỗi lần chạy.
- **Captcha (Turnstile):**
  - muốn dùng: thêm `trycloudflare.com` vào Hostnames của widget, điền hai khóa vào `.env.host`;
  - để trống thì không có captcha. Đăng ký vẫn cần mã mời.
- **Tin tức cho hệ phân tích (Module N, chỉ admin thấy):** hai cờ trong `.env.host`, mặc định không cần ghi gì.
  - `NEWS_INGEST_ENABLED` (mặc định `false` ở mọi môi trường): `true` mới bật việc tải tin RSS/GDELT. Tin RSS không lấy lại được về sau, nên chỉ bật sau khi đọc báo cáo đợt N2.
  - `NEWS_CALENDAR_ENABLED` (mặc định `true`): nạp lịch công bố (FOMC, CPI, NFP, PCE) từ file trong repo lúc khởi động. File hỏng thì giữ dữ liệu cũ và gửi cảnh báo Telegram; hết sự kiện `HIGH` trong 45 ngày tới cũng cảnh báo (một lần).
  - Muốn đổi thì thêm dòng `NEWS_INGEST_ENABLED=true`. Đừng để giá trị rỗng (`NEWS_INGEST_ENABLED=`): server sẽ không khởi động.
- **Không bao giờ** đưa `.env.host` lên git hay gửi qua chat.

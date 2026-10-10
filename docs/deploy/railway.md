# Đưa sàn lên Railway (staging, chạy kín)

**Kiến trúc:** một service duy nhất (`Dockerfile`) chạy API, realtime `/ws` và giao diện sàn trên cùng một địa chỉ, cộng PostgreSQL của Railway.
Vùng: **Singapore**, vì Binance chặn IP Mỹ.

**Đã sẵn trong repo:**
- `Dockerfile`, `railway.json`: 1 bản; health check `/api/v1/health`; tự khởi động lại khi lỗi.
- Khóa "một bản duy nhất" khi deploy chồng nhau.
- Migration tự chạy lúc khởi động.
- CI: `.github/workflows/ci.yml`.
- Sao lưu + diễn tập khôi phục hằng đêm: `.github/workflows/backup.yml`.
- Cảnh báo Telegram.
- Đăng ký bằng mã mời.

## A. Việc của chủ dự án (cần tài khoản — Claude không tự tạo)

| # | Việc | Kết quả đưa cho Claude / đặt vào Railway |
|---|---|---|
| 1 | Tạo **repo GitHub riêng tư** (trống), mời Claude push bằng tài khoản của bạn | URL repo |
| 2 | Tạo tài khoản **Railway** (gói Hobby), project mới, vùng **Singapore** | — |
| 3 | **Resend**: xác minh tên miền gửi email, tạo API key | `RESEND_API_KEY`, `EMAIL_FROM` (vd. `CEX Sim <no-reply@tenmien.vn>`) |
| 4 | **Cloudflare Turnstile**: tạo widget cho tên miền | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` |
| 5 | **Telegram**: tạo bot với @BotFather, nhắn bot một tin, lấy chat id | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| 6 | (Tùy chọn) tên miền riêng, trỏ về Railway | `APP_URL=https://…` |

Khóa bí mật **không gửi qua chat**. Bạn tự dán vào Railway → Variables và GitHub → Settings → Secrets.

## B. Dựng trên Railway

1. **PostgreSQL:** New → Database → PostgreSQL (bản 17). Railway tạo sẵn `DATABASE_URL`.
2. **Service sàn:** New → GitHub Repo → chọn repo. Railway đọc `railway.json` và build bằng `Dockerfile`. Settings → Region: Singapore.
3. **Variables** của service:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (tham chiếu, không chép tay) |
| `APP_URL` | `https://<tên-service>.up.railway.app` hoặc tên miền riêng |
| `DATA_ENCRYPTION_KEY` | chạy `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` trên máy, dán kết quả. **Mất khóa này = mất 2FA của mọi người**: lưu thêm vào trình quản lý mật khẩu |
| `EMAIL_TRANSPORT` | `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | từ bước A3 |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | từ bước A4 (đặt cả hai) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | từ bước A5 (đặt cả hai) |
| `ALERT_ENV_NAME` | `staging` |
| `REGISTRATION` | `invite` (mặc định ở production — ghi rõ cho dễ nhìn) |

   `NODE_ENV=production`, `MARKET_FEED=binance`, `WEB_DIST`, `ADMIN_WEB_DIST`, `PORT` đã có trong image hoặc do Railway cấp.
4. **Deploy.** Log phải có lần lượt:
   - `standby` → `symbols synced from Binance` → `binance stream connected` → `server listening`;
   - tin Telegram "Server đã chạy — phiên bản …".

## C. Người đầu tiên (owner)

Các lệnh quản trị chạy **bên trong service** (DB nội bộ của Railway không vào được từ máy bạn).
Cài Railway CLI (`npm i -g @railway/cli`), rồi `railway login`, `railway link`, `railway ssh` để vào container. Trong container:

```bash
cd /app && npm run admin:invite -- "Chủ dự án"
```

Nếu không dùng được `railway ssh`, chạy từ repo trên máy bằng URL **public** của PostgreSQL:
`DATABASE_URL="<public url>" APP_URL="https://…" npm run admin:invite -- "Chủ dự án"`.

1. Mở link in ra, đăng ký, rồi xác minh email.
2. Cấp quyền owner (cùng cách chạy):
   ```bash
   cd /app && npm run admin:set-role -- <email-cua-ban> owner
   ```
3. Đăng nhập, **bật 2FA** (bắt buộc để vào trang admin).
4. Từ đây, mời người khác bằng trang Admin → "Mã mời" (hoặc lại dùng `admin:invite`).

## D. Sao lưu hằng đêm (GitHub Actions)

GitHub → Settings → Secrets and variables → Actions:
- `STAGING_DATABASE_URL`: Railway → PostgreSQL → Connect → **Public URL**. Máy GitHub ở ngoài Railway nên phải dùng địa chỉ public.
- `BACKUP_PASSPHRASE`: chuỗi dài ngẫu nhiên. **Lưu riêng**, mất là không giải mã được bản sao lưu.

Mỗi đêm lúc 02:00 GMT+7, workflow `Backup database` chạy 4 bước:
1. `pg_dump`;
2. khôi phục vào một PostgreSQL mới;
3. `restore:check` (đủ migration, sổ cái khớp số dư);
4. mã hóa AES-256 rồi lưu artifact 30 ngày.

Chạy tay lần đầu: Actions → Backup database → Run workflow.

**Khôi phục khi cần:**
1. Tải artifact về.
2. Giải mã:
   ```bash
   gpg -d cex-staging-<ngày>.dump.gpg > backup.dump
   ```
3. Nạp vào DB:
   ```bash
   pg_restore --no-owner --no-acl -d "<DATABASE_URL>" backup.dump
   ```
4. Kiểm tra:
   ```bash
   DATABASE_URL=… npm run restore:check -w @cex/server
   ```

## E. Kiểm tra sau mỗi lần deploy
- `GET /api/v1/health` → `market: CONNECTED`; trang Thị trường có giá chạy.
- Telegram, trong container (`railway ssh`):
  ```bash
  cd /app && npm run alert:test -w @cex/server
  ```
- Đăng ký bằng mã mời → email xác minh có **mã chống lừa đảo** → nạp tiền ảo → mua thử → Admin → Đối soát → chạy, kết quả "khớp".
- CI xanh trên commit đó (Actions → CI).

## F. Cảnh báo Telegram sẽ báo
- Server khởi động (mỗi lần deploy hoặc khởi động lại).
- Giá Spot / Futures gián đoạn > 2 phút (mất kết nối hoặc > 20 % cặp không LIVE). Báo thêm một lần khi đã chạy lại.
- Đối soát sổ cái (10 phút/lần) **lệch**: có lỗi tiền, cần xem ngay.
- Server crash hoặc mất khóa một-bản → tự khởi động lại.

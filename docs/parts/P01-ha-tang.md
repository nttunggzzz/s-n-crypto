# P01 — Hạ tầng cloud & vận hành

**Phụ trách:** Claude · **Thư mục:** `infra/`, `.github/`, file cấu hình gốc của monorepo

## Mục tiêu
Mọi thứ chạy trên cloud, kín, tự động triển khai, có sao lưu và cảnh báo — máy cá nhân chỉ dùng để viết code.

## Phạm vi
- Monorepo (npm workspaces), lint, format, TypeScript strict.
- Môi trường: **staging** (kín, chạy 24/7) và sau này **production** (riêng DB, riêng tên miền).
- Railway vùng Singapore: service `server` (luôn chạy — giữ kết nối Binance + bộ khớp lệnh), PostgreSQL, các app frontend (static).
- Khóa truy cập staging: chỉ đăng ký qua lời mời + lớp chặn (Cloudflare Access hoặc tương đương).
- CI (GitHub Actions): lint, typecheck, unit test, test hợp đồng, E2E; chặn merge khi đỏ.
- Secrets qua biến môi trường của Railway — không commit `.env`.
- Sao lưu PostgreSQL hằng ngày + **diễn tập khôi phục** định kỳ.
- Giám sát: Sentry (lỗi), log có cấu trúc, health check, cảnh báo về Telegram (server sập, giá Binance cũ, đối soát sổ cái lệch).

## Không làm
Logic nghiệp vụ, giao diện.

## Checklist
**Giai đoạn 0**
- [x] Chuyển code cũ vào `legacy/`, viết lại `CLAUDE.md`
- [x] Khung monorepo + typecheck/test (vitest + PostgreSQL nhúng) + ESLint (`npm run lint`, nằm trong `verify`) — *chưa có format tự động*
- [x] Test trình duyệt `npm run e2e` (Playwright trên hệ riêng: giá giả lập, email ra file, bản build production) — cổng nghiệm thu giao diện
- [ ] Railway staging + PostgreSQL + tự triển khai từ `main` — *sẵn: `Dockerfile` (một image: API + /ws + app), `railway.json` (1 bản, health check); chờ tài khoản*
- [x] Một bản duy nhất khi deploy chồng nhau: khóa PostgreSQL (advisory lock) + máy chủ "chờ" trả health (`server/src/ops/singleInstance.ts`)
- [x] Khóa truy cập staging: chỉ đăng ký bằng mã mời (`REGISTRATION=invite`), mã đầu tiên tạo bằng `npm run admin:invite`
- [ ] CI GitHub Actions — *sẵn `.github/workflows/ci.yml` (verify, e2e giá giả lập, build + chạy thử image); chờ repo GitHub*
- [ ] Backup + thử khôi phục — *sẵn `.github/workflows/backup.yml`: pg_dump hằng đêm → khôi phục vào DB mới → `restore:check` (đối soát) → mã hóa AES-256; chờ secrets*
- [ ] Sentry + cảnh báo Telegram

**Giai đoạn 7**
- [ ] Kiểm tra chịu tải (số kết nối realtime, số lệnh/giây)
- [ ] Môi trường production + tên miền + HTTPS
- [ ] Trang trạng thái hệ thống

## Xong khi
Push lên `main` → CI xanh → staging tự cập nhật; DB khôi phục được từ bản sao lưu; cố ý làm sập server thì có cảnh báo Telegram.

## Lưu ý
- Bộ khớp lệnh phải chạy **đúng 1 instance**. Không bật tự động nhân bản service `server` khi chưa có cơ chế leader.
- Staging chạy liên tục để thu số liệu tín hiệu — không dùng gói tự tắt khi không có truy cập.

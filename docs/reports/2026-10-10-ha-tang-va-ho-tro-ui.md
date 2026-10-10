# Báo cáo 2026-10-10 — Hỗ trợ giao diện giảm lỗi + chuẩn bị chạy kín trên cloud

**Trạng thái:** `main` @ `36e8044`. Lệnh đã chạy: `npm run verify` → typecheck mọi workspace, lint, **201/201 test**, build. Cùng ngày còn chạy:
- `npm run ui-check` (nhánh `ui/gd2-exchange` gộp `main`): verify xanh.
- `npm run e2e` trên bản gộp:
  - 6 test luồng chính đạt;
  - các test nghiệm thu REVIEW-03, Futures, Bot đỏ như dự kiến: chờ giao diện, xem bên dưới.

## 1. Hỗ trợ giao diện (để Antigravity ít lỗi hơn)
| Việc | Ở đâu |
|---|---|
| REVIEW-03: đối chiếu giao diện với tính năng; 9 lỗi nặng, có test nghiệm thu | `docs/antigravity/REVIEW-03-…`, `e2e/tests/review03.spec.ts` |
| Realtime: kênh `tickers` / `futures:tickers`, `REALTIME_MAX_CHANNELS`, `reconnect()`; server đóng kết nối khi phiên kết thúc | hợp đồng 0.8.0 |
| Hàm tiện ích: kho giá, PEPE→1000PEPE, đếm ngược, chặn đặt lệnh, phân trang, tải CSV | hợp đồng 0.9.0 (`src/helpers.ts`) |
| Test nghiệm thu viết trước: Futures (chuyển → Long → TP/SL → đóng), Bot (lưới, mua định kỳ) + danh sách `data-testid` | `e2e/tests/futures.spec.ts`, `bots.spec.ts`, `docs/antigravity/TESTIDS.md` |
| `npm run verify` có lint: backend lỗi là chặn; giao diện chỉ cảnh báo các mẫu đã gây lỗi; báo cáo endpoint chưa dùng | `eslint.config.js`, `infra/ui-coverage.mjs` |
| `npm run ui-check`: gộp thử nhánh UI trong thư mục tạm → verify (+ e2e) | `infra/ui-check.mjs` |

Phần đã sửa phía API thì phía giao diện **không cần đợi**. Phần cần giao diện làm có trong REVIEW-03, PROMPT-05/06 (đã thêm phần nghiệm thu), và **PROMPT-07** (mã mời, captcha, banner giá giả lập, trang Mã mời của Admin).

## 2. Chuẩn bị chạy kín trên cloud (không cần tài khoản)
- **Một image** (`Dockerfile`): API + `/ws` + bản build của app, cùng một địa chỉ. `railway.json`: 1 bản, health check.
  - Đã chạy thử: chỉ cài gói production, `NODE_ENV=production`, giá Binance thật → khởi động, phục vụ trang, CSP không chặn gì.
- **Một bản duy nhất khi deploy chồng nhau:** khóa advisory PostgreSQL. Bản mới trả health "chờ", đợi bản cũ tắt rồi mới chạy (bất biến 5).
- **CI** (`.github/workflows/ci.yml`): verify, e2e với giá giả lập (máy GitHub ở Mỹ bị Binance chặn), build image và chạy thử với PostgreSQL 17.
- **Sao lưu hằng đêm + diễn tập khôi phục mỗi lần** (`backup.yml`): `pg_dump` → khôi phục vào DB mới → `restore:check` (đủ migration, đối soát sổ cái) → mã hóa AES-256.
  `restore:check` đã chạy thử trên DB dev: 11 số dư, 0 lệch.
- **Chỉ đăng ký bằng mã mời** (hợp đồng 0.10.0):
  - `REGISTRATION=invite`, mặc định ở production;
  - mã chỉ lưu bản băm;
  - lượt dùng tính trong cùng giao dịch tạo tài khoản (đã test 3 người tranh lượt cuối: đúng 1 người vào);
  - admin tạo/thu hồi mã có nhật ký;
  - lệnh `npm run admin:invite` cho người đầu tiên;
  - `publicConfig` cho app.
- **Cảnh báo Telegram** khi:
  - server khởi động;
  - giá Spot/Futures gián đoạn > 2 phút (và khi chạy lại);
  - đối soát sổ cái lệch;
  - crash hoặc mất khóa.
  Thử bằng `npm run alert:test`.
- **Hướng dẫn từng bước** cho chủ dự án: [docs/deploy/railway.md](../deploy/railway.md).

## 3. Lỗi tìm và sửa trong lúc làm
- **Vitest trả mã 0 cả khi worker crash** (gặp một lần trên Windows: "183 passed (187)").
  `npm test` / `verify` giờ đi qua `infra/test-all.mjs`: thiếu test nào chạy là báo đỏ. Đã thử bằng file test cố ý làm crash.
- **Trang `/assets` (Ví) trùng thư mục `/assets/` của Vite** khi server phục vụ app. Đã xử lý: chỉ `/assets/<file>` là file tĩnh.
- Sau đăng ký/đăng nhập, kênh realtime của người dùng bị từ chối (cần `reconnect()`, đã có test nghiệm thu).
  Tab đã đăng xuất vẫn nhận dữ liệu riêng: nay server đóng kết nối khi phiên kết thúc.
- "Test web bị treo" của lần trước: do máy quá tải (CPU 70–90%), không tái hiện trong 6 lần chạy.

## 4. Còn lại
- **Cần chủ dự án** (theo `docs/deploy/railway.md` mục A):
  - repo GitHub riêng tư;
  - Railway (Singapore);
  - Resend;
  - Turnstile;
  - bot Telegram.
  Sau đó Claude push, kiểm tra CI và hướng dẫn deploy lần đầu.
- **Antigravity:** REVIEW-03 → PROMPT-07; commit các trang Bot / Lãi lỗ / Cài đặt. Claude chạy `npm run ui-check -- --e2e` sau mỗi lần commit.
- Chưa làm: Sentry, format tự động (Prettier), test chụp ảnh so sánh giao diện. Đề xuất engine tín hiệu (bước 3) chờ duyệt.

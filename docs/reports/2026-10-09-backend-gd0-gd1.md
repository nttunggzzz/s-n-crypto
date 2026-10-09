# Báo cáo tiến độ backend — Giai đoạn 0 & 1 (2026-10-09)

**Người làm:** Claude Code · **Phạm vi:** P01 (một phần), P02, P03, P04, P05 — phần backend + database
**Trạng thái chung:** lõi sàn Spot ảo **chạy được end-to-end trên máy local** với PostgreSQL thật và dữ liệu Binance thật. **Chưa lên cloud** (Railway, CI, backup… chờ tài khoản).

---

## 1. Đã làm

### P01 — Hạ tầng (một phần)
- Code AI Studio cũ chuyển nguyên vẹn vào `legacy/` (đã so khớp từng file trước khi xóa bản gốc).
- Monorepo npm workspaces: `packages/core`, `packages/contracts`, `server` (sẵn chỗ cho `apps/*`, `packages/ui`).
- TypeScript strict cho cả 3 package; vitest; **PostgreSQL thật chạy nhúng** (`embedded-postgres`) cho dev (`npm run db:start`, cổng 5433) và test (tự bật cổng 5434) — không cần Docker.
- `CLAUDE.md` viết lại theo kiến trúc mới; `.env.example`.

### P02 — Hợp đồng API (`packages/contracts`)
- 29 endpoint REST khai báo một chỗ (`src/endpoints.ts`) bằng zod: auth, thị trường, ví, lệnh. Server đăng ký route **từ chính danh sách này**, nên không thể lệch.
- Client có kiểu sẵn (`createApiClient`), realtime client tự kết nối lại (`createRealtimeClient`), 25 mã lỗi chuẩn.
- **Mock cho UI**: MSW handler cho **mọi** endpoint (thiếu một cái là lỗi typecheck), realtime giả lập, 6 kịch bản (`normal/empty/error/halted/signedOut/unverified`) để dựng đủ trạng thái màn hình. Hướng dẫn: [`packages/contracts/README.md`](../../packages/contracts/README.md).

### P03 — Xác thực
- Đăng ký, đăng nhập/đăng xuất, xác minh email, quên/đặt lại mật khẩu (đăng xuất mọi nơi), đổi mật khẩu (đăng xuất thiết bị khác), danh sách phiên + đăng xuất từ xa.
- Mật khẩu băm scrypt; token phiên ngẫu nhiên 256-bit, DB chỉ lưu SHA-256; cookie `httpOnly + SameSite=Lax (+Secure trên production)`; hỗ trợ sẵn `Authorization: Bearer` cho app mobile.
- Chống lạm dụng: rate limit theo IP/tài khoản, khóa tạm sau 5 lần sai mật khẩu/15 phút, không lộ email tồn tại ở "quên mật khẩu", chống CSRF (kiểm tra Origin + bắt buộc JSON), CORS chỉ cho tên miền dự án, helmet.
- Captcha Turnstile và gửi email qua Resend: **code sẵn, tự bật khi có khóa API**. Hiện email in link ra log server (chỉ dev; production bị chặn cấu hình này).

### P04 — Dữ liệu thị trường
- Một kết nối WebSocket Binance cho 10 cặp: ticker 24h, sổ lệnh top-20 (100ms), giao dịch, nến 6 khung (1m→1d). Tự kết nối lại (backoff), tự xoay kết nối trước mốc 24h của Binance.
- Quy tắc lô lấy từ `exchangeInfo` khi khởi động (bước giá, bước khối lượng, giá trị tối thiểu).
- **Phát hiện giá cũ**: quá 10 giây (Admin chỉnh được) không có cập nhật sổ lệnh → `STALE` → từ chối lệnh mới và **dừng khớp** cặp đó.
- Lưu **nến đã đóng** vào Postgres, idempotent. Lịch sử nến cho biểu đồ lấy từ Binance REST (cache 2s), mất Binance thì trả nến đã lưu.
- WebSocket `/ws` cho người dùng (họ không nối thẳng Binance), giới hạn tần suất depth/ticker.

### P05 — Lõi sàn (phần quan trọng nhất)
- **Sổ cái**: mọi thay đổi số dư đi qua **một hàm duy nhất** trong transaction, khóa dòng theo thứ tự cố định (tránh deadlock), mỗi thay đổi ghi 1 dòng `ledger_entries`. Postgres `CHECK` chặn số dư âm; **trigger chặn UPDATE/DELETE** trên sổ cái và nhật ký quản trị.
- Nạp tiền ảo: 10.000 USDT/lần, 24h/lần, trần trọn đời 100.000 (đều chỉnh được trong DB).
- Lệnh **Market** (theo khối lượng hoặc theo số USDT): đi qua sổ lệnh thật → trượt giá thực tế, giá khớp trung bình.
- Lệnh **Limit** (GTC/IOC): khóa tiền; nếu đặt vượt giá thị trường thì khớp ngay phần có thể (taker), phần còn lại nằm chờ; khớp khi giao dịch Binance **vượt qua** giá đặt (chạm không khớp), khớp ở đúng giá đặt (maker).
- Hủy lệnh / hủy tất cả; phí 0,1% trừ vào tài sản nhận về.
- **Đối soát** mỗi 10 phút: tổng sổ cái = số dư; số dư khóa = tổng khóa của lệnh mở. Kết quả lưu bảng `reconciliation_runs`.

### Database (PostgreSQL, 13 bảng)
`users, sessions, verification_tokens, audit_logs, symbols, exchange_settings, balances, ledger_entries, faucet_claims, orders, trades, reconciliation_runs, candles` — schema: `server/src/db/schema.ts`, migration: `server/drizzle/`.

---

## 2. Đã kiểm chứng (lệnh thật, kết quả thật)

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi (core, contracts, server) |
| `npm test` | **41/41 đạt** — 4 file, PostgreSQL thật |

Các test quan trọng (`server/src/modules/exchange/exchange.test.ts`, `server/src/api.test.ts`):
- Mua Market đi qua 2 mức giá → số dư USDT/BTC đúng tới từng chữ số; phí đúng.
- 4 lệnh mua đồng thời chỉ đủ tiền cho 1 → đúng 1 lệnh thành công (**không tiêu tiền 2 lần**).
- 5 lần nạp tiền đồng thời → chỉ cộng 1 lần.
- **Hủy đúng lúc khớp**, lặp 25 lần → mỗi lần đúng một bên thắng, không còn tiền bị khóa treo.
- Phát lại cùng sự kiện giá 2 lần → chỉ khớp 1 lần.
- Limit: giá chạm không khớp, vượt qua mới khớp; Limit vượt giá khớp một phần rồi nằm chờ; IOC hết hạn phần dư.
- Giá cũ → từ chối lệnh; dừng khẩn cấp → không nhận lệnh, không khớp.
- Sai bước giá / bước khối lượng / giá trị tối thiểu → đúng mã lỗi.
- Không sửa/xóa được dòng sổ cái (kể cả bằng SQL).
- Chuỗi **150 thao tác ngẫu nhiên** (mua/bán/đặt/hủy/biến động giá, 3 người dùng) → không số dư âm, đối soát khớp 100%.
- API: user B xem/hủy lệnh của user A → 404; chưa xác minh email → không nạp/đặt lệnh được; đăng xuất/thu hồi phiên có hiệu lực; khóa sau 5 lần sai mật khẩu; đặt lại mật khẩu đăng xuất mọi nơi + link chỉ dùng 1 lần; chặn request khác origin; WebSocket kênh `user` cần đăng nhập và nhận sự kiện lệnh/số dư.
- **Mọi response của server và của mock đều được kiểm tra khớp schema hợp đồng** trong test.

Chạy thật với Binance (server dev, 2026-10-09 ~11:26 GMT+7):
- Đồng bộ 10 cặp từ `exchangeInfo`, cả 10 `LIVE`, không có lỗi/cảnh báo trong log.
- Luồng người dùng thật: đăng ký → xác minh email (link từ log) → nạp 10.000 USDT → mua Market 1.000 USDT BTC → khớp 0,01213 BTC giá 82.434,10, phí 0,00001213 BTC → đặt Limit mua ETH 0,5 @ 2.000 → khóa đúng 1.000 USDT.
- Nến 1m đã đóng được lưu: 40 nến sau 4 phút (10 cặp × 4), không trùng.

**Chưa kiểm chứng:** ngắt mạng thật để xem tự kết nối lại (mới test logic STALE bằng đồng hồ giả); chịu tải; chạy trên cloud.

---

## 3. Quyết định kỹ thuật cần anh/chị biết

| Quyết định | Lý do |
|---|---|
| **Tự viết xác thực thay vì Better Auth** (lệch so với ROADMAP) | Giữ một định dạng lỗi và một hợp đồng cho mọi endpoint `/api/v1`, kiểm soát hoàn toàn phiên cookie + bearer, test được hết. Phần tự viết nhỏ, dùng thuật toán chuẩn (scrypt, token ngẫu nhiên băm SHA-256). 2FA cho admin sẽ thêm ở giai đoạn 3. |
| Trần nạp 100.000 = **tổng đã nạp trọn đời** (không phải số dư hiện tại) | Nếu tính theo số dư USDT, người dùng chỉ cần mua coin là nạp tiếp vô hạn. Admin reset tài khoản sẽ đặt lại. |
| Lệnh Market lớn hơn 20 mức sổ lệnh → **từ chối** (`INSUFFICIENT_LIQUIDITY`) | Không đoán giá ngoài phần sổ lệnh thật nhìn thấy (không bịa dữ liệu). 20 mức của BTC thường đủ cho vài BTC. |
| Limit nằm chờ khớp ở **giá đặt** khi thị trường vượt qua | Thận trọng, giống maker trên sàn thật; tránh khớp ở giá có lợi hơn thực tế. |
| Chỉ bật cặp có số lẻ (bước giá + bước khối lượng) ≤ 8 | Để giá × khối lượng luôn chính xác, khóa/mở khóa tiền không bao giờ làm tròn. Cả 10 cặp hiện tại đều thỏa. |
| Làm tròn: thu của người dùng làm tròn **lên**, trả cho người dùng làm tròn **xuống** (8 chữ số) | Sàn không bao giờ âm tiền vì làm tròn. |

---

## 4. Antigravity có thể bắt đầu giao diện phần nào

Hợp đồng + mock đã đủ để làm **toàn bộ giao diện Giai đoạn 0–1 mà không cần backend chạy**.

| Phần | Bắt đầu được? | Ghi chú |
|---|---|---|
| **P07 Design system** — tokens sáng/tối, component cơ bản, `PriceText`, `AmountText`, `StaleBadge`, `OrderStatusBadge`, `SideTag`… | ✅ **Ngay** | Không phụ thuộc API. `StaleBadge` dùng `status: LIVE/STALE/UNAVAILABLE`. |
| **P08 – Đăng ký / Đăng nhập / Quên & đặt lại mật khẩu / Xác minh email** (`/verify-email?token=`, `/reset-password?token=`) | ✅ **Ngay** | Endpoint `register, login, logout, verifyEmail, resendVerification, forgotPassword, resetPassword`. |
| **P08 – Thị trường** (10 cặp, giá, % 24h, khối lượng) | ✅ **Ngay** | `tickers` + kênh `ticker:*`; cặp `enabled=false` hiển thị bị tắt. |
| **P08 – Trang giao dịch** (biểu đồ nến 6 khung, sổ lệnh, giao dịch gần đây, form Mua/Bán Market/Limit theo khối lượng hoặc USDT, 25/50/75/100%, phí ước tính, Lệnh đang chờ / Lịch sử) | ✅ **Ngay** | `candles`, `depth`, `marketTrades`, `placeOrder`, `openOrders`, `orderHistory`, `myTrades`, `cancelOrder`, `cancelAllOrders` + kênh `candles/depth/trades/user`. |
| **P08 – Ví** (khả dụng/đang khóa, tổng quy USDT, nút Nạp tiền ảo + thời gian chờ, lịch sử biến động) | ✅ **Ngay** | `balances`, `faucetStatus`, `faucetClaim`, `ledger`. |
| **P08 – Banner "Sàn mô phỏng — không có tiền thật", cảnh báo giá cũ, mất kết nối** | ✅ **Ngay** | `market:status`, `rt.onStatus`. |
| P08 – Cài đặt → Phiên đăng nhập & thiết bị, đổi mật khẩu | ✅ Được | `listSessions`, `revokeSession`, `changePassword` (Giai đoạn 2 trong roadmap nhưng API đã có). |
| P08 – Lệnh nâng cao (Stop, OCO, TP/SL, trailing), danh mục lãi/lỗ, cảnh báo giá, thông báo | ⏳ Chưa | Chờ hợp đồng Giai đoạn 2 — có thể dựng khung tĩnh trước. |
| P09 Admin | ⏳ Chưa | Chờ API Giai đoạn 3 (vai trò, 2FA, cộng/trừ số dư, dừng khẩn cấp). |
| P10 Web tín hiệu, P11 App | ⏳ Chưa | Giai đoạn 6–7. |

Antigravity đọc trước: `packages/contracts/README.md` (cách gọi API, bật mock, 6 kịch bản trạng thái, quy tắc hiển thị số).

---

## 5. Việc tiếp theo (đề xuất thứ tự)

1. **Lên cloud (P01)** — cần anh/chị: tạo repo GitHub riêng tư, tài khoản Railway (vùng Singapore). Sau đó em làm: Railway staging + Postgres, CI GitHub Actions, backup hằng ngày + thử khôi phục, Sentry, cảnh báo Telegram (giá cũ, đối soát lệch, server sập).
2. **Giai đoạn 2 backend (P05)**: Stop-Market/Stop-Limit, OCO, TP/SL gắn kèm, trailing stop; giá vốn trung bình, lãi/lỗ; xuất CSV; cảnh báo giá; thông báo — viết hợp đồng trước để Antigravity làm song song.
3. Giai đoạn 3: vai trò/quyền, 2FA admin, API admin (cộng/trừ số dư có lý do + `audit_logs`, dừng khẩn cấp…).

**Cần từ anh/chị khi lên staging:** khóa Resend (gửi email), khóa Cloudflare Turnstile (captcha), bot Telegram + chat ID.

## 6. Lưu ý
- Dự án **chưa là git repo**. Nên `git init` + commit đầu tiên trước khi Antigravity bắt đầu, để làm theo quy tắc nhánh `ui/*` / `be/*`.
- Server phải chạy **đúng 1 instance** (bộ khớp lệnh, chỉ mục lệnh, rate limit nằm trong bộ nhớ).
- File `.env` local đã tạo từ `.env.example` (không chứa bí mật, đã nằm trong `.gitignore`).

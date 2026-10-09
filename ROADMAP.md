# ROADMAP — Sàn giao dịch ảo + Web tín hiệu

> Trạng thái: **ĐANG LÀM** — backend Giai đoạn 0–3 xong (chạy local, chưa lên cloud); giao diện đang làm. Cập nhật: 2026-10-09
> Báo cáo mới nhất: [docs/reports/2026-10-09-backend-gd3.md](docs/reports/2026-10-09-backend-gd3.md) · trước đó: [GĐ2](docs/reports/2026-10-09-backend-gd2.md), [GĐ0–1](docs/reports/2026-10-09-backend-gd0-gd1.md)
> Dự án thử nghiệm cá nhân. Phần kinh doanh (thu phí, thanh toán…) để sau — xem [Backlog](#backlog-để-sau).
> Chi tiết từng phần: [docs/parts/README.md](docs/parts/README.md)

## Tầm nhìn

1. **Sàn giao dịch ảo Spot** — tiền ảo, giá thật từ Binance. Người dùng **không khớp lệnh với nhau**; mọi lệnh khớp mô phỏng theo thị trường Binance.
2. **Web Admin** — quản lý người dùng, số dư, sàn, tín hiệu.
3. **Web tín hiệu** — bổ trợ cho sàn; tạm miễn phí, quyền dùng do Admin bật/tắt từng người (sau này nối thanh toán vào đây).
4. Chạy **kín trên cloud (staging)** cho đến khi hoàn chỉnh → công khai web + phát hành app iOS/Android.

## Quyết định mặc định

| Mục | Giá trị |
|---|---|
| Cloud | Railway, vùng Singapore (Binance chặn IP Mỹ) |
| Database | PostgreSQL |
| Backend | Node.js + TypeScript + Express 5, Drizzle ORM, xác thực tự viết (phiên cookie httpOnly / bearer) — *đổi từ Better Auth, lý do trong báo cáo 2026-10-09* |
| DB local & test | PostgreSQL thật chạy nhúng (`embedded-postgres`), không cần Docker |
| Frontend | React + Vite + Tailwind, mobile-first, tiếng Việt mặc định, sáng/tối |
| App mobile | PWA → đóng gói bằng Capacitor |
| Cặp giao dịch | BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, SUI (/USDT) |
| Nạp tiền ảo | 10.000 USDT/lần, 1 lần/24h, trần 100.000 USDT (Admin chỉnh được) |
| Phí giao dịch | 0,1% |
| Múi giờ hiển thị | GMT+7 (dữ liệu lưu UTC) |
| Phân công | **Antigravity**: giao diện · **Claude Code**: backend, dữ liệu, bảo mật, logic sàn |

## Các phần (workstreams)

| Mã | Phần | Phụ trách |
|---|---|---|
| P01 | Hạ tầng cloud & vận hành | Claude |
| P02 | Hợp đồng API & kiểu dữ liệu dùng chung | Claude (UI chỉ đọc) |
| P03 | Xác thực, phân quyền & bảo mật | Claude |
| P04 | Dữ liệu thị trường | Claude |
| P05 | Lõi sàn: sổ cái, lệnh, khớp lệnh, danh mục | Claude |
| P06 | Engine tín hiệu | Claude |
| P07 | Design system (bộ component UI dùng chung) | Antigravity |
| P08 | Giao diện sàn | Antigravity |
| P09 | Giao diện Admin | Antigravity |
| P10 | Giao diện web tín hiệu | Antigravity |
| P11 | App mobile | Antigravity + Claude |

## Giai đoạn

```
0 Hạ tầng → 1 Sàn lõi (M1) → 2 Sàn đầy đủ (M2) → 3 Admin → 4 Engine tín hiệu ──(thu số liệu 1–3 tháng)──▶ 6 Web tín hiệu (M3) → 7 App (M4)
                                                              └──── 5 Nhật ký & thống kê (song song) ────┘
```

### Giai đoạn 0 — Hạ tầng cloud
- [x] P01: Monorepo (npm workspaces), chuyển code cũ vào `legacy/`, viết lại `CLAUDE.md`
- [ ] P01: Kho GitHub riêng tư (chờ chủ dự án tạo repo)
- [ ] P01: Staging trên Railway (server + PostgreSQL), tự triển khai khi push, khóa truy cập
- [x] P01: typecheck + test chạy local (41 test, PostgreSQL thật)
- [ ] P01: CI GitHub Actions; quản lý secrets; backup DB hằng ngày + **đã thử khôi phục**; Sentry; cảnh báo về Telegram
- [x] P02: Quy ước API, khung `packages/contracts`, cơ chế mock cho UI (MSW + realtime giả lập)
- [ ] P07: Design tokens (màu, chữ, khoảng cách, sáng/tối), component cơ bản

**Xong khi:** push code → staging tự cập nhật; CI xanh; UI chạy được với dữ liệu mock.

### Giai đoạn 1 — Sàn ảo lõi → **M1**
- [x] P03: Đăng ký, xác minh email, đăng nhập/đăng xuất, quên/đổi mật khẩu, quản lý phiên, rate limit, khóa tạm khi sai mật khẩu
- [ ] P03: Bật captcha Turnstile + gửi email thật (Resend) — code sẵn, chờ khóa API
- [x] P04: Giá realtime 10 cặp (WebSocket Binance), sổ lệnh, giao dịch gần đây, nến; **phát hiện giá cũ → dừng khớp**; quy tắc lô (`exchangeInfo`)
- [x] P05: Sổ cái số dư (số thập phân chính xác), nạp tiền ảo, lệnh Market/Limit (+IOC), hủy lệnh/hủy tất cả, khớp mô phỏng (trượt giá theo độ sâu, Limit khớp khi giá vượt qua), phí 0,1%, đối soát
- [x] P02: Hợp đồng API cho các mục trên + realtime events
- [ ] P08: Đăng nhập/đăng ký, trang giao dịch (danh sách cặp, biểu đồ, sổ lệnh, form lệnh, lệnh mở, lịch sử), trang ví

**Xong khi:** đăng ký → nạp tiền → mua Market → đặt Limit → tự khớp; số dư đúng tuyệt đối; test tranh chấp (hủy đúng lúc khớp) không trừ tiền 2 lần.

### Giai đoạn 2 — Sàn ảo đầy đủ → **M2**
- [x] P05: Stop-Limit, Stop-Market, **OCO**, **TP/SL gắn kèm lệnh**, trailing stop, GTC/IOC; giá vốn trung bình, lãi/lỗ chưa chốt/đã chốt, giá trị tài sản theo thời gian; xuất CSV; cảnh báo giá; thông báo trong app (+ cài đặt người dùng, máy tính khối lượng trong `@cex/core`)
- [x] P02: Hợp đồng 0.2.0 cho toàn bộ mục trên + mock
- [ ] P08: Form lệnh nâng cao, đường entry/TP/SL trên biểu đồ, chỉ báo (MA, EMA, RSI, Volume), nhiều khung thời gian, danh mục, lịch sử khớp, máy tính khối lượng theo % rủi ro, yêu thích, tìm kiếm, cài đặt

**Xong khi:** mua kèm TP/SL → chạm TP → SL tự hủy → lãi/lỗ và giá vốn đúng.

### Giai đoạn 3 — Admin
- [x] P03: Vai trò & quyền, 2FA bắt buộc cho admin (+ 2FA tùy chọn cho người dùng), **nhật ký quản trị không xóa được**, cờ quyền dùng tín hiệu
- [x] P05: API admin — cộng/trừ số dư **bắt buộc lý do**, reset tài khoản, bật/tắt cặp, phí, cấu hình nạp, **dừng giao dịch khẩn cấp**, đối soát sổ cái; tài khoản bot khóa không cho chỉnh
- [x] P02: Hợp đồng 0.3.0 + mock (giả lập vai trò)
- [ ] P09: Giao diện Admin cho tất cả mục trên + tình trạng hệ thống + thống kê cơ bản

### Giai đoạn 4 — Engine tín hiệu (chạy ngầm)
- [ ] P06: Chuyển & sửa engine cũ (nến đã đóng, đủ lịch sử, bỏ số liệu bịa, sửa hướng/R:R/SHORT), lưu nến, phiên bản engine, **bot tự vào lệnh bằng OCO**, backtest trung thực + walk-forward
- [ ] P09: Trang "Hiệu quả tín hiệu", cấu hình engine
- [ ] 🚦 **Cổng M3:** ≥ ~100 tín hiệu, kỳ vọng sau phí > 0 trên số liệu chạy thật → mới công bố

### Giai đoạn 5 — Nhật ký & thống kê (song song với giai đoạn 4)
- [ ] P05: Ghi chú/nhãn setup/ảnh cho lệnh, thống kê cá nhân (win rate, kỳ vọng R, drawdown, theo coin)
- [ ] P08: Giao diện nhật ký & thống kê

### Giai đoạn 6 — Web tín hiệu → **M3**
- [ ] P06: API tín hiệu, thành tích công khai (cả lệnh thua), thông báo tín hiệu mới
- [ ] P10: Web tín hiệu (danh sách, chi tiết, thành tích)
- [ ] P08: Bảng tín hiệu trong sàn + nút **"Thử lệnh"** tự điền entry/TP/SL

### Giai đoạn 7 — Hoàn thiện & phát hành app → **M4**
- [ ] P11: PWA, thông báo đẩy, Capacitor iOS/Android, TestFlight + Google Play nội bộ
- [ ] P03: Kiểm tra bảo mật, chính sách quyền riêng tư, **xóa tài khoản trong app**
- [ ] P01: Kiểm tra chịu tải, môi trường production riêng, tên miền chính thức → công khai

## Mốc

| Mốc | Nội dung |
|---|---|
| M1 | Sàn ảo lõi chạy trên staging |
| M2 | Sàn ảo đầy đủ tính năng (TP/SL, OCO, danh mục) |
| M3 | Tín hiệu đã kiểm chứng + web tín hiệu |
| M4 | Công khai web + app trên store |

## Rủi ro kỹ thuật cần lưu ý

1. **Sổ cái & khớp lệnh khi đồng thời** — hủy/khớp cùng lúc, trừ tiền 2 lần → transaction, cập nhật có điều kiện, 1 tiến trình khớp, test tranh chấp.
2. **Realtime** — mất kết nối Binance, giá cũ → phát hiện & dừng khớp, tự kết nối lại.
3. **Tín hiệu không có lợi thế** → cổng M3; chỉ tin số liệu chạy thật.
4. **Duyệt app trên store** — ghi rõ "mô phỏng, không tiền thật", có tính năng riêng cho điện thoại, xóa tài khoản trong app.
5. **Hai công cụ AI cùng sửa một repo** → chia thư mục rõ ràng, làm việc trên nhánh riêng (xem `docs/parts/README.md`).

## Backlog để sau

- Phần kinh doanh: thu phí gói tín hiệu, cổng thanh toán, RevenueCat, giá gói, giải đấu & bảng xếp hạng, affiliate, marketing, tư vấn pháp lý.
- Futures, người dùng khớp lệnh với nhau, API cho bot của người dùng, nạp/rút tiền thật (không làm).

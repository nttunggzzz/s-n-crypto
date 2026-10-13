# ROADMAP — Sàn giao dịch ảo + Web tín hiệu

> Trạng thái (2026-10-13): **M1 + M2 + Admin xong** (backend + giao diện, verify 232/232, e2e 39/39), chạy trên máy chủ dự án (`npm run host`) thay cho staging cloud. Đang làm: engine tín hiệu (GĐ4). Email tạm tắt (chưa có tên miền) — PROMPT-13.
> Báo cáo mới nhất: [tổng quan 2026-10-13](docs/reports/2026-10-13-tong-quan-tien-do.md) · [rà soát giao diện lần 4](docs/reports/2026-10-13-ra-soat-ui-lan-4.md)
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
| Cặp giao dịch | 50 cặp USDT (danh sách: `SYMBOLS` trong `server/src/config.ts`) — trước 2026-10-09 là 10 cặp |
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
- [ ] P01: Staging trên Railway (server + PostgreSQL), tự triển khai khi push, khóa truy cập — *sẵn: Dockerfile, railway.json, khóa 1 bản khi deploy, đăng ký bằng mã mời; chờ tài khoản*
- [x] P01: typecheck + test chạy local (41 test, PostgreSQL thật)
- [ ] P01: CI GitHub Actions; quản lý secrets; backup DB hằng ngày + **đã thử khôi phục**; Sentry; cảnh báo về Telegram — *sẵn: ci.yml, backup.yml (khôi phục + đối soát mỗi đêm), cảnh báo Telegram; chờ repo/secrets; Sentry chưa làm*
- [x] P02: Quy ước API, khung `packages/contracts`, cơ chế mock cho UI (MSW + realtime giả lập)
- [x] P07: Design tokens (màu, chữ, khoảng cách, sáng/tối), component cơ bản — `packages/ui` (nhánh UI)

**Xong khi:** push code → staging tự cập nhật; CI xanh; UI chạy được với dữ liệu mock.

### Giai đoạn 1 — Sàn ảo lõi → **M1**
- [x] P03: Đăng ký, xác minh email, đăng nhập/đăng xuất, quên/đổi mật khẩu, quản lý phiên, rate limit, khóa tạm khi sai mật khẩu
- [ ] P03: Bật captcha Turnstile + gửi email thật (Resend) — code sẵn, chờ khóa API
- [x] P04: Giá realtime 10 cặp (WebSocket Binance), sổ lệnh, giao dịch gần đây, nến; **phát hiện giá cũ → dừng khớp**; quy tắc lô (`exchangeInfo`)
- [x] P05: Sổ cái số dư (số thập phân chính xác), nạp tiền ảo, lệnh Market/Limit (+IOC), hủy lệnh/hủy tất cả, khớp mô phỏng (trượt giá theo độ sâu, Limit khớp khi giá vượt qua), phí 0,1%, đối soát
- [x] P02: Hợp đồng API cho các mục trên + realtime events
- [x] P08: Đăng nhập/đăng ký, trang giao dịch (danh sách cặp, biểu đồ, sổ lệnh, form lệnh, lệnh mở, lịch sử), trang ví — xong, e2e `spot.spec`, `trade-form.spec` (2026-10-13)

**Xong khi:** đăng ký → nạp tiền → mua Market → đặt Limit → tự khớp; số dư đúng tuyệt đối; test tranh chấp (hủy đúng lúc khớp) không trừ tiền 2 lần.

### Giai đoạn 2 — Sàn ảo đầy đủ → **M2**
- [x] P05: Stop-Limit, Stop-Market, **OCO**, **TP/SL gắn kèm lệnh**, trailing stop, GTC/IOC; giá vốn trung bình, lãi/lỗ chưa chốt/đã chốt, giá trị tài sản theo thời gian; xuất CSV; cảnh báo giá; thông báo trong app (+ cài đặt người dùng, máy tính khối lượng trong `@cex/core`)
- [x] P02: Hợp đồng 0.2.0 cho toàn bộ mục trên + mock
- [x] P08: Form lệnh nâng cao, đường entry/TP/SL trên biểu đồ, chỉ báo (MA, EMA, RSI, Volume), nhiều khung thời gian, danh mục, lịch sử khớp, máy tính khối lượng theo % rủi ro, yêu thích, tìm kiếm, cài đặt — xong (EMA/RSI, đường lệnh + điểm khớp B/S PROMPT-12), e2e `chart-orders.spec`

**Xong khi:** mua kèm TP/SL → chạm TP → SL tự hủy → lãi/lỗ và giá vốn đúng.

### Giai đoạn 3 — Admin
- [x] P03: Vai trò & quyền, 2FA bắt buộc cho admin (+ 2FA tùy chọn cho người dùng), **nhật ký quản trị không xóa được**, cờ quyền dùng tín hiệu
- [x] P05: API admin — cộng/trừ số dư **bắt buộc lý do**, reset tài khoản, bật/tắt cặp, phí, cấu hình nạp, **dừng giao dịch khẩn cấp**, đối soát sổ cái; tài khoản bot khóa không cho chỉnh
- [x] P02: Hợp đồng 0.3.0 + mock (giả lập vai trò)
- [x] P09: Giao diện Admin cho tất cả mục trên + tình trạng hệ thống + thống kê cơ bản — xong, 13 trang, e2e `admin.spec`

### Giai đoạn 2.5 — Giao diện v2 phong cách OKX + mở rộng thị trường (chủ dự án yêu cầu 2026-10-09)
- [x] P04: 50 cặp USDT, luồng Binance chia nhiều kết nối; thông tin coin (tên, nhóm ngành, mô tả); sparkline 24h/7 ngày; sổ lệnh sâu tới 500 mức (chỉ hiển thị); realtime `exchange:status`
- [x] P05: Thông báo của sàn (Admin đăng/ghim/ẩn, có nhật ký); Admin sửa thông tin coin
- [x] P02: Hợp đồng 0.4.0 + mock (mock giờ kiểm tra đầu vào như server)
- [x] P07/P08: Giao diện v2 — [PROMPT-04](docs/antigravity/PROMPT-04-giao-dien-v2-phong-cach-okx.md) — xong
- Đề xuất & lựa chọn: [docs/proposals/2026-10-09-tinh-nang-nhu-san-lon.md](docs/proposals/2026-10-09-tinh-nang-nhu-san-lon.md)

### Giai đoạn 2.6 — Tính năng kiểu sàn lớn (đã chọn 2026-10-09)
- [x] P05: **Bot lưới Spot** (Grid) — số học / hình học, 2–100 lưới, xem trước, dừng + bán, giữ kết quả sau khi dừng
- [x] P05: **Mua định kỳ** (DCA) — hằng ngày / tuần / tháng theo giờ GMT+7, mỗi kỳ đúng 1 lần
- [x] P05: **Phân tích lãi lỗ** — lịch PnL theo ngày, lũy kế, tỷ lệ thắng, theo coin, sụt giảm tối đa (gộp phần thống kê của Giai đoạn 5)
- [x] P03: **Hồ sơ + bảo mật kiểu OKX** — biệt danh, ảnh đại diện, UID; mã chống lừa đảo trong email, lịch sử đăng nhập, cảnh báo thiết bị mới
- [x] P02: Hợp đồng 0.6.0 + mock (16 endpoint, tổng 119)
- [x] P08: Giao diện cho các mục trên — [PROMPT-06](docs/antigravity/PROMPT-06-giao-dien-bot-lai-lo-bao-mat.md) — xong (Bot, PnL, Bảo mật), e2e `bots.spec`

### Giai đoạn F — Futures mô phỏng (đã duyệt 2026-10-09: tối đa 20×, ký quỹ cô lập trước; **làm trước GĐ 2.6**)
- [x] P04: 50 hợp đồng vĩnh cửu USDT-M (Binance USDⓈ-M: sổ lệnh, giao dịch, nến, mark/index, funding) — luồng `/public` + `/market`
- [x] P05: Ví Futures + chuyển Spot↔Futures (sổ cái chung, cột `account`), đòn bẩy 1–20×, lệnh Market/Limit/reduce-only, vị thế cô lập một chiều (đảo chiều), TP/SL theo mark, thêm/bớt ký quỹ, **thanh lý**, **funding**, đối soát cả 2 ví, Admin (hợp đồng, phí, reset)
- [x] P02: Hợp đồng 0.5.0 + mock đầy đủ
- [ ] P05 v2: ký quỹ chéo (cross), hedge mode, lệnh Stop-Market/Trailing riêng cho Futures
- [x] P08: Giao diện Futures — [PROMPT-05](docs/antigravity/PROMPT-05-giao-dien-futures.md) — xong, e2e `futures.spec`
- Thiết kế: [docs/proposals/2026-10-09-futures-mo-phong.md](docs/proposals/2026-10-09-futures-mo-phong.md)

### Giai đoạn 4 — Engine tín hiệu (chạy ngầm)
> Kế hoạch thực hiện (2026-10-13): [docs/plans/module-C-engine-tin-hieu.md](docs/plans/module-C-engine-tin-hieu.md) — đợt C0…C7, đội sub-agent: [docs/plans/README.md](docs/plans/README.md)
- [ ] P06: Chuyển & sửa engine cũ (nến đã đóng, đủ lịch sử, bỏ số liệu bịa, sửa hướng/R:R/SHORT), lưu nến, phiên bản engine, **bot tự vào lệnh bằng OCO**, backtest trung thực + walk-forward
- [ ] P09: Trang "Hiệu quả tín hiệu", cấu hình engine
- [ ] 🚦 **Cổng M3:** ≥ ~100 tín hiệu, kỳ vọng sau phí > 0 trên số liệu chạy thật → mới công bố

### Giai đoạn 5 — Nhật ký & thống kê (song song với giai đoạn 4)
> Kế hoạch thực hiện (2026-10-13): [docs/plans/module-A-nhat-ky-giao-dich.md](docs/plans/module-A-nhat-ky-giao-dich.md) — đợt A1…A6
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
- Người dùng khớp lệnh với nhau, API cho bot của người dùng, nạp/rút tiền thật (không làm). *Futures mô phỏng đã chuyển lên Giai đoạn F theo yêu cầu 2026-10-09.*
- Chưa chọn (2026-10-09): Chuyển đổi nhanh (Convert), TWAP/Iceberg, Earn mô phỏng, bậc phí VIP, bảng xếp hạng/giải đấu.

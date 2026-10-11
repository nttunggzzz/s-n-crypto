# CLAUDE.md — Sàn giao dịch ảo (CEX Spot mô phỏng) + Web tín hiệu

Kế hoạch: [ROADMAP.md](ROADMAP.md) · Phân phần & quy trình: [docs/parts/README.md](docs/parts/README.md) · Báo cáo tiến độ: [docs/reports/](docs/reports/)

**Lỗi đang mở (đọc trước khi sửa lỗi, cập nhật trạng thái khi sửa xong):** [docs/LOI-HIEN-TAI.md](docs/LOI-HIEN-TAI.md)

Code cũ từ Google AI Studio nằm trong `legacy/` — chỉ tham khảo, có lỗi đã biết (DB hỏng, backtest bịa số). Không import từ đó.

## Phân công
- **Claude Code**: `server/`, `packages/contracts/`, `packages/core/`, `infra/`, tài liệu backend.
- **Antigravity**: `apps/*`, `packages/ui/`. Quy tắc của nó: `.agent/rules/project-rules.md`.
- Đổi hợp đồng API → chỉ Claude sửa `packages/contracts`; yêu cầu từ UI ghi ở `docs/parts/contract-requests.md`.

## Cấu trúc
```
packages/core        decimal math (decimal.js), lot rules, walkBook (khớp theo độ sâu)
packages/contracts   zod schemas + endpoints registry + typed client + realtime client + fixtures/mocks (MSW)
server/
  drizzle/           migrations (0001 = trigger chặn UPDATE/DELETE trên ledger_entries, audit_logs)
  src/db             schema.ts (Postgres), client.ts
  src/lib            http.ts (route() theo hợp đồng), errors.ts, rateLimit.ts
  src/modules/auth   phiên cookie/bearer, xác minh email, quên/đổi mật khẩu, 2FA TOTP (totp.ts, SecretBox),
                     security.ts (lịch sử đăng nhập, cảnh báo thiết bị mới, mã chống lừa đảo trong email)
  src/modules/admin  adminService (mọi thao tác admin + audit), routes, audit.ts
  src/modules/market Binance WS (nhiều kết nối, SUBSCRIBE) / REST, MarketDataService (LIVE/STALE), nến,
                     assets (thông tin coin), depthSnapshots (sổ lệnh sâu), sparklines,
                     sim/ (MARKET_FEED=sim: giá giả lập trên luật cặp thật — snapshot.json; cấm ở production)
  src/modules/content announcementService (thông báo của sàn)
  src/modules/bots   Bot trên ví Spot: dcaService (mua định kỳ), gridService (bot lưới), index (routes)
  src/modules/futures Futures mô phỏng: config (hợp đồng), markData (mark/funding), service (ví, lệnh, vị thế,
                     thanh lý, funding), engine (chạy theo sự kiện thị trường), routes
  src/modules/exchange  ledger, orderService (mọi loại lệnh, OCO, TP/SL), matcher, openOrderIndex,
                        positions (giá vốn), portfolio, alerts, notifications, preferences, exports (CSV),
                        faucet, reconciliation, pnlService (phân tích lãi lỗ), routes
  src/realtime       WebSocket /ws
  src/ops            singleInstance (khóa 1 bản + máy chủ chờ khi deploy), alerts (Telegram: giá gián đoạn, đối soát lệch, crash)
  src/lib/webApp.ts  phục vụ bản build app sàn ở / (WEB_DIST) và app admin ở /admin/ (ADMIN_WEB_DIST) cùng địa chỉ với API —
                     một lần đăng nhập cho cả hai; link giữa hai app: `appLinks` trong contracts (apps.ts)
  test/              globalSetup (PostgreSQL nhúng :5434), helpers
  scripts/e2eStack.ts hệ chạy cho test trình duyệt (server phục vụ bản build production của app qua WEB_DIST, như khi deploy);
                     E2E_MODE=default (đăng ký mở + bắt xác minh email) | host (cấu hình như sàn thật: chỉ mã mời, không bắt xác minh)
e2e/                 Playwright: fixtures (chặn lỗi console / 5xx / VALIDATION_ERROR / kênh realtime bị từ chối),
                     tests/*.spec.ts (luồng chính + test nghiệm thu REVIEW-xx cho giao diện),
                     tests/host-mode/*.spec.ts (dự án `host-mode` trên hệ :5191: đăng ký bằng link mời, không xác minh email)
legacy/              code AI Studio cũ
```

## Lệnh
```bash
npm install
npm run db:start      # PostgreSQL nhúng :5433 (dữ liệu ở .pgdata) + migrate
npm run dev:server    # API :8080, đọc .env (copy từ .env.example)
npm test              # vitest — tự bật PostgreSQL thật trên :5434
npm run typecheck     # mọi workspace có tsconfig (core, contracts, server, và ui/apps khi đã gộp)
npm run db:generate   # sau khi sửa server/src/db/schema.ts
npm run admin:set-role -- <email> owner   # tạo owner đầu tiên (ghi audit ROLE_BOOTSTRAP)
npm run admin:invite -- "<người nhận>" [lượt] [ngày]  # mã mời đăng ký (REGISTRATION=invite — mặc định ở production)
npm run dev           # cả hệ thống: DB + server + mọi app trong apps/* (mock tắt)
npm run dev -- --sim  # như trên nhưng giá GIẢ LẬP (không cần Binance: offline, test e2e, CI)
npm run verify        # cổng gộp main: typecheck mọi workspace (cả UI) + lint + test + build app + báo cáo API app chưa dùng
npm run lint          # ESLint: backend/contracts/core/infra/e2e lỗi là chặn; apps/*, packages/ui chỉ cảnh báo
npm run ui-coverage   # endpoint nào backend có mà app chưa gọi (--strict: thiếu là lỗi)
npm run ui-check -- [nhánh] [--base <ref>] [--e2e] [--no-verify] [--keep]
                      # nhánh UI (mặc định ui/gd2-exchange) gộp <ref> (mặc định main) trong worktree tạm → verify (+ e2e);
                      #   --no-verify: bỏ verify (chỉ chạy e2e nếu có --e2e); e2e đỏ → báo cáo chép ra .e2e/ui-check/
npm run host -- update | start | invite "<tên>" | set-role <email> owner | status
                      # chạy sàn cho người dùng thật trên máy này (trước Railway): bản riêng ../crypto-host, dữ liệu
                      #   ../crypto-host-data, :8090 + link https trycloudflare — docs/deploy/may-ca-nhan.md
npm run e2e           # test trình duyệt (Playwright, Edge cài sẵn): build apps/exchange, dựng 2 hệ riêng, mỗi hệ phục vụ
                      #   cả API, /ws và bản build app (giá giả lập): DB :5436 + server :5190 (email ra .e2e/outbox.jsonl) và
                      #   hệ host-mode DB :5437 + server :5191 (.e2e/host/; như sàn thật: REGISTRATION=invite,
                      #   REQUIRE_EMAIL_VERIFICATION=false). Sàn thật đang chạy (:8090) → e2e/ui-check tự hạ độ ưu tiên CPU
```
Quy tắc tích hợp backend ↔ hợp đồng ↔ UI: [docs/parts/README.md](docs/parts/README.md#quy-tắc-tích-hợp--để-backend-hợp-đồng-và-giao-diện-luôn-khớp-nhau)

Triển khai: `Dockerfile` + `railway.json` (một service: API + /ws + app sàn ở `/` + app admin ở `/admin/`), hướng dẫn [docs/deploy/railway.md](docs/deploy/railway.md); CI `.github/workflows/`.
Hiện tại (chưa thuê Railway) sàn chạy trên máy chủ dự án: [docs/deploy/may-ca-nhan.md](docs/deploy/may-ca-nhan.md) (`npm run host`).

## Bất biến (KHÔNG được phá)
1. **Mọi thay đổi số dư đi qua `applyBalanceChanges()`** (server/src/modules/exchange/ledger.ts) trong transaction; mỗi thay đổi = 1 dòng `ledger_entries`. Không `UPDATE balances` ở chỗ khác.
2. **Tiền là số thập phân chính xác**: `numeric(38,18)` trong DB, `Dec` (decimal.js) trong code, chuỗi trong API. Không dùng `number` cho tiền. Số dư/sổ cái làm tròn 8 chữ số: thu của người dùng làm tròn lên, trả cho người dùng làm tròn xuống.
3. **Chỉ bật cặp có `decimals(tick)+decimals(step) ≤ 8`** để giá×khối lượng luôn chính xác (khóa/mở khóa không cần làm tròn).
4. **Lệnh đổi trạng thái chỉ khi đang giữ khóa dòng** (`SELECT … FOR UPDATE`) và kiểm tra status còn mở → hủy/khớp đồng thời chỉ một bên thắng; phát lại sự kiện giá không khớp 2 lần.
5. **Chỉ 1 tiến trình server** (matcher + chỉ mục lệnh trong bộ nhớ + rate limit trong bộ nhớ). Không bật autoscale.
   Khi deploy chồng nhau, bản mới chờ khóa advisory của PostgreSQL (`ops/singleInstance.ts`) rồi mới chạy — không bỏ khóa này.
6. **NULL ≠ 0, không bịa dữ liệu**: thiếu dữ liệu thị trường → `null` + `status` UNAVAILABLE/STALE. Giá STALE hoặc sàn dừng → không nhận lệnh, không khớp.
7. **Nến**: chỉ lưu nến đã đóng; `open_time` = mốc mở UTC; ghi idempotent (`onConflictDoNothing`).
8. Mọi endpoint khai báo trong `packages/contracts/src/endpoints.ts` và đăng ký bằng `route()` — dev/test tự kiểm tra response khớp schema.
9. Dữ liệu người dùng luôn lọc theo `userId` của phiên; không thấy → 404 (không phải 403).
10. Không báo "xong/PASSED" khi chưa chạy test thật; ghi rõ lệnh đã chạy và kết quả.
11. **OCO**: tiền khóa nằm trên **đúng một** chân đang sống (chân LIMIT; khi chân STOP kích hoạt thì chuyển sang chân STOP). Mọi thao tác trên một chân phải khóa **cả nhóm** qua `lockGroup()` theo thứ tự id.
12. Mọi thay đổi trạng thái lệnh chạy trong `commit()` của OrderService: chỉ mục trong bộ nhớ + sự kiện realtime chỉ áp dụng **sau khi** transaction commit (`Outcome`).
13. **Admin**: quyền khai báo ở `packages/contracts/src/permissions.ts`; endpoint `auth: 'staff'` cần vai trò staff + 2FA bật + phiên đăng nhập bằng 2FA (`sessions.mfa_verified`) + `permission`. Mọi thay đổi admin ghi `writeAudit()` **trong cùng transaction**; tài khoản bot không ai sửa được.
14. **Database phải là UTF8** (tiếng Việt). Script PostgreSQL nhúng tự tạo UTF8 và từ chối DB khác bảng mã.
15. **Khớp lệnh chỉ dùng 20 mức realtime** (`MarketDataService`). Sổ lệnh sâu (`DepthSnapshots`, REST) và sparkline chỉ để **hiển thị**,
    có cache + giới hạn trọng số Binance (tổng IP 6000/phút; sổ lệnh sâu ≤ 1200). Không gọi REST Binance trong đường khớp lệnh.
16. **Hai ví, một sổ cái**: `balances`/`ledger_entries` có cột `account` (`SPOT` | `FUTURES`). Code Spot luôn lọc `account = 'SPOT'`
    (`getBalances` mặc định SPOT). Futures: `locked` của FUTURES/USDT = Σ (`marginLocked` + `feeLocked`) lệnh mở + Σ `margin` vị thế mở — đối soát kiểm tra đúng đẳng thức này.
17. **Futures**: mọi thao tác trên (user, symbol) khóa dòng `futures_user_symbols` **trước tiên** (kể cả khớp lệnh, TP/SL, thanh lý, funding).
    Thanh lý/TP/SL dùng **mark price LIVE**; mark STALE hoặc sàn dừng → không thanh lý, không khớp. Lỗ tối đa = ký quỹ vị thế (không bao giờ âm số dư).
    Funding idempotent theo (vị thế, mốc thời gian) — bảng `futures_funding_payments`.
18. **Binance Futures WebSocket**: sổ lệnh ở `/public/stream`, còn lại (trade, markPrice, ticker, kline) ở `/market/stream`; `/stream` cũ chỉ còn sổ lệnh.
19. **Bot (DCA, lưới)** đặt lệnh Spot thường qua `OrderService.placeOrder(userId, input, { source, sourceId })` — không có đường tắt số dư.
    Người dùng không hủy được lệnh bot (chỉ dừng bot); admin/reset hủy được và bot tự dừng (`resetUser` của bot chạy **trước** hủy lệnh).
    Mỗi kỳ DCA chạy **đúng 1 lần** (unique `(plan_id, scheduled_at)`), kỳ lỡ không chạy bù.
    Lưới: `sync()` lặp lại an toàn, `clientOrderId` xác định `g{bot}-{ô}-{vòng}-{B|S}`, mỗi bot một hàng đợi; sổ sách bot (ô + `free_base`/`free_quote`) **khớp ví** — test `walletValue`.
20. **Mọi email gửi người dùng** bọc `withAntiPhishing()` (auth/security.ts) để in mã chống lừa đảo.

## Khi thêm tính năng
1. Hợp đồng (schema + endpoint + fixture + resolver mock — `createMockHandlers` bắt buộc có resolver cho mọi endpoint, thiếu sẽ lỗi typecheck).
2. Backend + test (ưu tiên test tranh chấp cho mọi thứ đụng tới số dư).
3. `npm run typecheck && npm test`.
4. Cập nhật checklist trong ROADMAP / docs/parts và viết báo cáo vào `docs/reports/`.

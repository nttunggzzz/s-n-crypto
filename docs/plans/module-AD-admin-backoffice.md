# Module AD — Back office admin kiểu OKX (phần backend)

Ngày: 2026-10-17. Lead: Claude Opus. Nguồn: rà web admin lần 8 (PROMPT-18, mục "Cần backend") + yêu cầu chủ dự án.
Phạm vi: **chỉ backend** (hợp đồng + server + test). Màn hình làm sau, giao Antigravity bằng PROMPT-19 khi các đợt dưới đã gộp.

## 0. Nguyên tắc chung (mọi đợt)
- Hợp đồng trước: schema + endpoint trong `endpoints.ts` + fixture + resolver mock (bắt buộc cho mọi endpoint) + README + CHANGELOG.
  **Không** đổi `packages/contracts/package.json` version: ghi CHANGELOG dưới tiêu đề `## Chưa phát hành — đợt ADx`; lead đánh số khi gộp.
- Dữ liệu người dùng: lọc theo id; không thấy → 404. Tham số người dùng nhận **uuid hoặc UID 8 chữ số** (như `adminListUsers`).
- Mọi thao tác ghi của admin: `reason` (schema `Reason`), `writeAudit()` **trong cùng transaction**, quyền khai báo trong `permissions.ts`.
- Tiền: `Dec`, chuỗi trong API, `null` khi không có dữ liệu (không bao giờ 0 đoán). Giá mark không LIVE → các số phụ thuộc là `null`.
- Danh sách: phân trang cursor (như `adminAuditLogs`), `limit` ≤ 200. CSV: tối đa 10.000 dòng, mới nhất trước, chống CSV injection như `exports.ts`.
- Test PostgreSQL thật qua `ApiHarness` (phản hồi tự kiểm theo hợp đồng). Mỗi agent dùng cổng DB riêng `CEX_TEST_DB_PORT` (bảng dưới).
- Ngày/tháng theo giờ Việt Nam: dùng `server/src/modules/tax/period.ts` (`vnDayStart`, `vnMonthStart`…), không tạo quy tắc thứ hai.

## 1. Các đợt
| Đợt | Nội dung | Ghi/đọc | Model · effort | Skill | Cổng test | Review |
|---|---|---|---|---|---|---|
| AD1 | Tra cứu lệnh/khớp lệnh toàn sàn, phiên đăng nhập của khách, xuất CSV nhật ký + người dùng | chỉ đọc | Sonnet · medium | cex-contract-first-api | 5451 | lead đọc diff |
| AD2 | Rủi ro Futures (vị thế lớn, sắp thanh lý), danh sách thanh lý, funding, số liệu sàn theo ngày | chỉ đọc | Sonnet · medium | cex-contract-first-api, decimal-money-safety | 5452 | lead đọc diff |
| AD3 | Admin hủy lệnh của khách, thu hồi phiên, điều chỉnh ví FUTURES | **ghi tiền/khóa** | Sonnet · high | ledger-order-concurrency, decimal-money-safety, exchange-security-review | 5453 | cex-reviewer Opus |
| AD4 | Ghi chú + nhãn khách, công tắc tính năng (Futures/Bot/Faucet), migration 0011 + index | **migration** | Sonnet · high | db-migration-host-safety, cex-contract-first-api | 5454 | cex-reviewer Opus |
| AD5 *(sau)* | Niêm yết cặp mới từ Binance (thêm cặp nóng vào market data) | ghi + feed | — | realtime-market-data-qa | — | — |
| AD6 *(sau, đợt bảo mật)* | Tạo nhân sự trực tiếp, mã mời gắn vai trò, chính sách 2FA | bảo mật | — | exchange-security-review | — | — |

Thứ tự gộp: AD1 → AD2 → AD3 → AD4. Xung đột ở `endpoints.ts`, `admin.ts`, `permissions.ts`, CHANGELOG, README, mocks: lead giải.

## 2. AD1 — Tra cứu và xuất (chỉ đọc)
Quyền mới: **`users.export`** (ADMIN, owner) cho CSV người dùng (chứa email). Các endpoint khác dùng `users.read` / `audit.read`.
| Endpoint | Method · path | Quyền | Ghi chú |
|---|---|---|---|
| `adminSearchOrders` | GET `/api/v1/admin/orders` | users.read | `market: SPOT\|FUTURES` (bắt buộc), `symbol`, `status: open\|closed\|all`, `side`, `user` (uuid/UID), `orderId`, `clientOrderId`, `from`/`to`, cursor. Dòng: lệnh + `userId`, `uid`, `email`, nguồn (`USER`/`GRID`/`DCA` nếu có) |
| `adminSearchTrades` | GET `/api/v1/admin/trades` | users.read | Như trên cho lần khớp: giá, khối lượng, `quoteQty`, phí, thuế (Spot), `realizedPnl`, `liquidity` (Futures) |
| `adminUserSessions` | GET `/api/v1/admin/users/:userId/sessions` | users.read | Phiên còn hiệu lực: id, `createdAt`, `lastSeenAt`, ip, userAgent, `mfaVerified`. Không trả token |
| `adminAuditExport` | GET `/api/v1/admin/audit-logs/export.csv` | audit.read | Cùng bộ lọc `adminAuditLogs` |
| `adminUsersExport` | GET `/api/v1/admin/users/export.csv` | **users.export** | Cùng bộ lọc `adminListUsers` |
Test: lọc từng tham số; người dùng A không lẫn B khi lọc `user`; cursor không trùng/sót; support gọi export người dùng → 403; CSV có tiêu đề cố định (hằng số trong hợp đồng) và chống injection.

## 3. AD2 — Rủi ro và số liệu (chỉ đọc)
| Endpoint | Method · path | Quyền | Ghi chú |
|---|---|---|---|
| `adminRiskPositions` | GET `/api/v1/admin/risk/positions` | users.read | Vị thế Futures mở: người dùng, cặp, chiều, khối lượng, giá vào, **mark (null nếu không LIVE)**, notional, ký quỹ, PnL chưa thực hiện, giá thanh lý, **khoảng cách tới thanh lý %**, tỉ lệ ký quỹ. `sort: notional\|liqDistance` (mặc định liqDistance tăng dần; null xếp cuối), lọc `symbol`, `side`. Kèm `totals` theo cặp: tổng Long/Short (open interest), số vị thế |
| `adminLiquidations` | GET `/api/v1/admin/risk/liquidations` | users.read | Vị thế đóng do `LIQUIDATION`: người dùng, cặp, chiều, khối lượng, giá vào, giá thanh lý, ký quỹ mất, thời điểm; `from`/`to`, `symbol`, cursor |
| `adminFundingSummary` | GET `/api/v1/admin/risk/funding` | exchange.read | Theo cặp trong khoảng `from`/`to`: tổng Long trả, Short nhận (và ngược lại), ròng, số lần thanh toán |
| `adminMetrics` | GET `/api/v1/admin/metrics` | exchange.read | `range: 7d\|30d\|90d`, mỗi ngày (GMT+7, đủ ngày kể cả 0): khối lượng Spot/Futures, phí Spot/Futures, thuế đã khấu trừ, người dùng mới, người giao dịch (distinct), số lần thanh lý; kèm tổng |
Tính bằng `@cex/core` (`liquidationPrice`, `unrealizedPnl`… trong `packages/core/src/futures.ts`), không công thức mới. Test: mark STALE → null; khoảng cách thanh lý đúng tay; ngày không có giao dịch = 0 có mặt; hai ngày biên GMT+7.

## 4. AD3 — Thao tác của admin (ghi)
Quyền mới: **`orders.manage`** (ADMIN, owner). AuditAction mới: `ORDER_CANCEL`, `SESSION_REVOKE`.
| Endpoint | Method · path | Quyền | Ghi chú |
|---|---|---|---|
| `adminCancelUserOrder` | POST `/api/v1/admin/users/:userId/orders/:orderId/cancel` | orders.manage | body `{ market, reason }`. Spot: dùng đường hủy của `OrderService` (OCO hủy cả nhóm qua `lockGroup`; lệnh của bot → bot dừng như `resetUser`, bất biến 19); Futures: `FuturesService.cancelOrder`. `closeReason` = `ADMIN`. Audit **cùng transaction** với việc hủy (cần cho `commit()` nhận thêm bước ghi audit — không viết đường tắt số dư) |
| `adminCancelUserOrders` | POST `/api/v1/admin/users/:userId/orders/cancel-all` | orders.manage | `{ market?, symbol?, reason }`; một dòng audit với số lệnh đã hủy |
| `adminRevokeSession` | POST `/api/v1/admin/users/:userId/sessions/:sessionId/revoke` | users.lock | `{ reason }`; phiên không thuộc người dùng → 404; đóng kết nối `/ws` của phiên đó (mã 4401) |
| `adminRevokeAllSessions` | POST `/api/v1/admin/users/:userId/sessions/revoke-all` | users.lock | như trên cho mọi phiên; không áp dụng cho chính mình |
| `adminAdjustBalance` *(mở rộng)* | như cũ | balances.adjust | thêm `account?: 'SPOT' \| 'FUTURES'` (mặc định SPOT, tương thích ngược). FUTURES chỉ USDT; trừ ≤ khả dụng; đẳng thức đối soát Futures (bất biến 16) vẫn đúng |
Quy tắc vai trò như `lockUser`: không thao tác trên người có vai trò ngang/cao hơn; tài khoản bot không ai sửa.
Test **tranh chấp**: admin hủy đồng thời với khớp lệnh (một bên thắng, đối soát sạch); hủy chân OCO; hủy lệnh bot → bot STOPPED; thu hồi phiên → lời gọi tiếp theo của phiên đó 401; điều chỉnh FUTURES rồi `reconcile()` không lệch; audit rollback khi hủy thất bại.

## 5. AD4 — Ghi chú, nhãn, công tắc tính năng (migration 0011)
Đọc skill `db-migration-host-safety` trước: migration chạy lúc server khởi động trên sàn thật.
- **Bảng `user_notes`** (id, user_id, author_id, body ≤ 2000, created_at), chỉ thêm (trigger chặn UPDATE/DELETE như `0001`).
- **Bảng `user_tags`** (user_id, tag, created_at, created_by; PK (user_id, tag)); tag ∈ `VIP | WATCH | RISK | TESTER`.
- **`exchange_settings`**: `futures_enabled`, `bots_enabled`, `faucet_enabled` boolean NOT NULL DEFAULT true.
- **Index** (cho số liệu AD2 và thống kê 0.20.0): `trades (user_id, created_at)`, `futures_trades (user_id, created_at)`, `trades (created_at)`, `futures_trades (created_at)`. Ghi trong báo cáo: tạo index không CONCURRENTLY khóa ghi bảng trong lúc tạo — trên sàn thật hiện bảng nhỏ, chấp nhận; nêu thời gian đo trên DB thử.
| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `adminUserNotes` GET `/api/v1/admin/users/:userId/notes` | users.read | mới nhất trước, cursor, có tên/email người viết |
| `adminAddUserNote` POST `.../notes` | **users.notes** (mới: support, admin, owner) | `{ body }`; audit `USER_NOTE_ADD` |
| `adminSetUserTags` PUT `.../tags` | users.lock | `{ tags, reason }`; audit `USER_TAGS` với trước/sau |
| `AdminUserSummary.tags` + lọc `adminListUsers({ tag })` | users.read | |
| `ExchangeSettings.features { futures, bots, faucet }` + `adminUpdateSettings` | exchange.configure | audit `SETTINGS_UPDATE` như cũ |
- **Thực thi công tắc** (ErrorCode mới `FEATURE_DISABLED`, 403):
  - Futures tắt: chặn lệnh **mở** và chuyển tiền **vào** ví Futures; lệnh đóng / reduce-only / TP-SL / thanh lý / funding **vẫn chạy** (không nhốt tiền khách);
  - Bot tắt: chặn tạo/khởi động bot mới; bot đang chạy giữ nguyên (admin dừng từng bot nếu cần);
  - Faucet tắt: chặn nhận faucet.
  - `exchangeInfo` / `exchange:status` mang `features` để giao diện ẩn nút (cập nhật tức thì như `tradingHalted`).
Test: migration chạy trên DB đã có dữ liệu; trigger chặn sửa ghi chú; từng công tắc chặn đúng và **không** chặn đóng vị thế; phát sự kiện `exchange:status` khi đổi.

## 6. Giao diện (để sau — PROMPT-19 cho Antigravity khi AD1–AD4 đã gộp)
Màn: Tra cứu lệnh/khớp lệnh · Rủi ro (bảng vị thế sắp thanh lý, thanh lý, funding) · Bảng số liệu sàn (biểu đồ theo ngày) · tab Phiên + nút thu hồi · nút hủy lệnh trong tab Lệnh · ghi chú/nhãn ở chi tiết người dùng · công tắc tính năng ở Cài đặt · xuất CSV.

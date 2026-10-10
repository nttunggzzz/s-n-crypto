# P02 — Hợp đồng API & kiểu dữ liệu dùng chung

**Phụ trách:** Claude (UI chỉ đọc) · **Thư mục:** `packages/contracts/`

## Mục tiêu
Một nguồn sự thật duy nhất cho mọi dữ liệu đi giữa backend và giao diện, để Antigravity làm UI song song mà không cần chờ backend.

## Nội dung package
- **Schema (zod) + kiểu TypeScript** cho mọi request/response.
- **API client** có kiểu sẵn — UI chỉ gọi qua client này, không tự `fetch`.
- **Sự kiện realtime** (WebSocket).
- **Mã lỗi** chuẩn.
- **Fixtures + mock handlers** (MSW) cho từng endpoint — UI dùng khi phát triển.
- Tài liệu OpenAPI sinh tự động.

## Quy ước
| Mục | Quy ước |
|---|---|
| Đường dẫn | REST JSON dưới `/api/v1/...`; admin dưới `/api/v1/admin/...` |
| Số tiền, giá, khối lượng | **Chuỗi số thập phân** `"64250.12"` — không bao giờ là `number` |
| Thời gian | Chuỗi ISO 8601 UTC; riêng nến dùng epoch ms |
| Cặp giao dịch | `BTCUSDT` |
| Enum lệnh | side `BUY/SELL`; type `MARKET/LIMIT/STOP_MARKET/STOP_LIMIT`; nhóm `OCO`; timeInForce `GTC/IOC`; status `NEW/PARTIALLY_FILLED/FILLED/CANCELED/REJECTED/EXPIRED` |
| Lỗi | `{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "...", "details": {} } }` |
| Phân trang | Cursor: `?cursor=...&limit=50` → `{ items, nextCursor }` |
| Realtime | `wss://.../ws`, tin nhắn `{ "type": "subscribe", "channel": "ticker:BTCUSDT" }`; kênh: `ticker:*`, `depth:*`, `trades:*`, `candles:*:<interval>`, `user` (lệnh, số dư, thông báo — cần đăng nhập) |
| Dữ liệu không có | `null` + trạng thái rõ ràng — **không** dùng 0 |

## Checklist
- [x] Giai đoạn 0: khung package, quy ước, client, mock MSW, ví dụ 1 endpoint (`GET /api/v1/health`)
- [x] Giai đoạn 1: auth, ví, thị trường, lệnh Market/Limit, realtime (29 endpoint + 6 kênh WS) — *chưa sinh OpenAPI*
- [x] Giai đoạn 2: lệnh nâng cao, OCO, danh mục, lịch sử, cảnh báo giá, thông báo (v0.2.0 — xem `packages/contracts/CHANGELOG.md`)
- [x] Giai đoạn 3: toàn bộ API admin (v0.3.0) + 2FA
- [x] Admin cho 2.6 + Futures: v0.7.0 — tìm theo UID, Futures / bot / lịch sử đăng nhập của người dùng, dừng bot có nhật ký (5 endpoint, tổng 124)
- [x] Giai đoạn 2.6: v0.6.0 — hồ sơ + bảo mật, phân tích lãi lỗ, DCA, bot lưới (16 endpoint, tổng 119; sự kiện `dcaPlan`/`gridBot`; mock đủ)
- [x] Giai đoạn F: v0.5.0 — Futures mô phỏng (26 endpoint, tổng 103; kênh realtime `futures:*`; mock đủ)
- [x] Giai đoạn 2.5: v0.4.0 — thông tin coin, sparkline, sổ lệnh sâu, `exchange:status`, thông báo của sàn (77 endpoint); mock kiểm tra đầu vào như server
- [ ] Giai đoạn 5: nhật ký & thống kê
- [ ] Giai đoạn 6: tín hiệu

## Xong khi (mỗi endpoint)
Có schema + fixture + mock + test hợp đồng ở backend xác nhận response đúng schema.

## Lưu ý
- Đổi hợp đồng là thay đổi ảnh hưởng cả hai phía → ghi trong `docs/parts/contract-requests.md`, tăng phiên bản khi phá vỡ tương thích.
- App mobile (Capacitor) gọi API khác origin → cần cơ chế token (bearer) bên cạnh cookie; dự trù từ đầu.

# PROMPT cho Antigravity — Giao diện Giai đoạn 2 (Sàn ảo đầy đủ)

> Dùng **sau khi** xong PROMPT-01 (Giai đoạn 1). Vẫn mở Antigravity ở `D:\Claude\crypto-ui`, không mở `D:\Claude\crypto`.

---

## 0. Bối cảnh
Backend Giai đoạn 2 đã xong: lệnh Stop-Market, Stop-Limit, Trailing stop, OCO, TP/SL gắn kèm lệnh mua, danh mục (giá vốn, lãi/lỗ), giá trị tài sản theo thời gian, xuất CSV, cảnh báo giá, thông báo trong app, cài đặt người dùng. Hợp đồng API **0.2.0** đã có trên `main`, kèm mock cho mọi endpoint mới.

Nhiệm vụ: **P08 Giai đoạn 2** — giao diện cho toàn bộ tính năng trên, chạy được bằng mock rồi với backend thật.

## 1. Chuẩn bị
```bash
git switch ui/gd1-exchange
git merge main            # lấy hợp đồng 0.2.0 (chỉ thêm, không phá code Giai đoạn 1)
git switch -c ui/gd2-exchange
npm install
```
Nếu code Giai đoạn 1 tự dựng object `Order`/`Trade` (ngoài mock của contracts) thì thêm các trường mới — typecheck sẽ chỉ ra chỗ cần sửa.

Đọc: `packages/contracts/CHANGELOG.md`, **mục 5** trong `packages/contracts/README.md`, `docs/reports/2026-10-09-backend-gd2.md` (mục 3–4), `docs/parts/P08-ui-san.md` (Giai đoạn 2). Quy tắc chung vẫn như PROMPT-01 và `.agent/rules/project-rules.md`.

## 2. Việc cần làm (mỗi mốc 1 commit)

### Mốc A — Form lệnh nâng cao (trang `/trade/:symbol`)
- Tab loại lệnh: **Limit · Market · Stop-Limit · Stop-Market · Trailing · OCO**.
- Stop-Market: `stopPrice` + bán theo **số coin** / mua theo **số USDT** (`quoteOrderQty`) — đúng quy định của API.
- Stop-Limit: `stopPrice`, `price`, `quantity`, GTC/IOC.
- Trailing: nhập **%** (0,1–20%) → gửi `trailingDeltaBips` = % × 100 (số nguyên); `activationPrice` tùy chọn. Bán theo coin, mua theo USDT.
- OCO: `quantity`, `price` (chốt lời), `stopPrice`, `stopLimitPrice` (bắt buộc khi MUA). Hiện gợi ý quan hệ giá: Bán `giá > giá hiện tại > stop`; Mua `giá < giá hiện tại < stop`. Lỗi `INVALID_OCO_PRICES` có `details.lastPrice`.
- **TP/SL khi MUA** (Market và Limit): công tắc "Chốt lời/Cắt lỗ" → `tpsl: { takeProfitPrice?, stopLossPrice?, stopLossLimitPrice? }`. Lỗi `INVALID_TPSL`.
- Kiểm tra trước khi gửi bằng `@cex/core` (`checkPrice`, `checkQuantity`, `checkNotional`); gợi ý hướng kích hoạt (stop trên giá hiện tại = kích hoạt khi giá **lên**, dưới = khi giá **xuống**).
- **Hộp xác nhận** trước khi đặt lệnh nếu `preferences.confirmOrders = true` (tóm tắt: loại, giá, khối lượng, TP/SL; phí ghi "ước tính").
- **Máy tính khối lượng theo % rủi ro**: nhập % rủi ro + giá vào + giá cắt lỗ → `positionSizeForRisk({ equity: totalValueUsdt, riskPercent, entryPrice, stopPrice, stepSize, feeRate })` → nút "Dùng khối lượng này" (giới hạn theo số dư khả dụng).

### Mốc B — Lệnh đang chờ & lịch sử
- Lệnh có cùng `orderListId` hiển thị **gộp 1 dòng OCO** (chốt lời / cắt lỗ); nút Hủy → `cancelOrderList` (hoặc `cancelOrder` một chân — server hủy cả cặp).
- Badge `triggerState`: **Chờ kích hoạt** (WAITING) / **Đã kích hoạt** (TRIGGERED); với Trailing hiện `trailingReferencePrice` và `stopPrice` đang di chuyển (cập nhật qua sự kiện `order`).
- Lệnh mua có `tpsl`: hiện TP/SL và trạng thái `PENDING` / `PLACED` (liên kết tới lệnh con) / `SKIPPED` (`skippedReason`).
- Lệnh đóng: hiện `closeReason` bằng chữ (Bạn hủy · Hủy do OCO · Hết hạn phần dư · Admin).
- Lịch sử lệnh & lịch sử khớp: bộ lọc cặp + khoảng thời gian (`from`/`to`, ISO UTC), phân trang `cursor`; cột **Lãi/lỗ đã chốt** (`trade.realizedPnl`, `null` → "—").
- Nút **Xuất CSV** cho lệnh / khớp / sổ cái: `<a href={exportUrl('exportTrades', { symbol, from, to })} download>`.
- Realtime: `kind: 'orderList'` cập nhật dòng OCO; `kind: 'order'` cho mọi thay đổi khác.

### Mốc C — Biểu đồ
- Nhiều khung thời gian (1m → 1d, đã có từ Giai đoạn 1) + mặc định theo `preferences.defaultInterval`.
- Chỉ báo **MA, EMA, RSI, Volume** tính trên nến API trả về — **chỉ để vẽ** (được dùng `number` cho tọa độ/chỉ báo, không dùng để hiển thị tiền).
- Đường ngang cho lệnh đang chờ của cặp: giá Limit, mức Stop, TP/SL (màu khác nhau, có nhãn), và **giá vốn** (`portfolio.positions[].avgCost`).

### Mốc D — Danh mục (`/portfolio`)
- `portfolio()`: bảng tài sản (khối lượng, giá vốn, giá hiện tại, giá trị, lãi/lỗ chưa chốt + %, lãi/lỗ đã chốt, phân bổ %), tổng giá trị, tổng lãi/lỗ, tổng phí. Mọi `null` → "—" (kèm ghi chú "không có giá" cho `unpricedAssets`).
- Biểu đồ phân bổ (tròn/thanh) theo `allocationPercent`.
- Biểu đồ giá trị tài sản `portfolioHistory({ query: { range } })` với nút 24h/7d/30d/90d/Tất cả: điểm `null` vẽ **đứt đoạn**, không nối bằng 0; danh sách rỗng → "Chưa có dữ liệu (số liệu bắt đầu được ghi từ khi tài khoản hoạt động)".

### Mốc E — Cảnh báo giá & thông báo
- Trang/ngăn **Cảnh báo giá**: tạo (cặp, Trên/Dưới, giá, ghi chú), danh sách theo trạng thái, xóa. Lỗi `INVALID_PRICE` (đã chạm), `LIMIT_EXCEEDED` (tối đa 50). Tạo nhanh từ biểu đồ (bấm vào mức giá).
- **Trung tâm thông báo**: chuông có số chưa đọc (`unreadNotifications`), danh sách (`listNotifications`, lọc chưa đọc), đánh dấu đã đọc (`markNotificationsRead` theo `ids` hoặc `all`). Sự kiện `kind: 'notification'` → toast + tăng số. Câu chữ dựng từ `type` + các trường (i18n) cho 6 loại: `ORDER_FILLED`, `ORDER_EXPIRED`, `STOP_TRIGGERED`, `TPSL_PLACED`, `TPSL_SKIPPED`, `PRICE_ALERT`.

### Mốc F — Yêu thích, tìm kiếm, cài đặt
- Ngôi sao yêu thích trên danh sách cặp; bộ lọc "Yêu thích"; ô tìm kiếm cặp.
- Trang **Cài đặt**: ngôn ngữ, sáng/tối/theo hệ thống, **đảo màu tăng/giảm** (`upColor`), hộp xác nhận lệnh, khung nến mặc định — lưu bằng `updatePreferences` (PATCH, chỉ gửi trường thay đổi). Trước khi đăng nhập có thể giữ tạm trong `localStorage` (chỉ tùy chọn hiển thị).

## 3. Kiểm tra bằng mock
Thêm vào thanh công cụ dev các nút gọi `setMockPrice(symbol, giá)` (vd: +3%, −3%, về giá TP, về giá SL) để thấy: stop kích hoạt, OCO hủy chéo, TP/SL tạo lệnh con, trailing bám giá, cảnh báo nổ — kèm toast thông báo. Fixtures sẵn có: một OCO TP/SL của lệnh mua BTC, một Stop-Limit ETH, một Trailing SOL, 2 cảnh báo, 4 thông báo (2 chưa đọc), danh mục có LINK không có giá.

## 4. Quy tắc nhắc lại
- Không tự tính giá vốn, lãi/lỗ, tổng tài sản, phí thật — hiển thị đúng số API trả.
- `null` ≠ 0. Tiền là chuỗi; tính toán cho ô nhập chỉ qua `@cex/core`.
- Cần API mới → `docs/parts/contract-requests.md`.

## 5. Xong khi
1. `npx tsc -p apps/exchange` 0 lỗi; build thành công, bản build không chứa mock.
2. Với mock: đi hết các luồng ở mục 3 trên 360px và desktop, sáng/tối.
3. Với backend thật (`npm run db:start`, `npm run dev:server`, `VITE_USE_MOCKS=false`): **mua kèm TP/SL → thấy OCO tự tạo → đặt TP sát giá → TP khớp, SL tự hủy → danh mục hiện lãi/lỗ đã chốt** (tiêu chí M2 của roadmap); tạo cảnh báo sát giá và thấy thông báo realtime.
4. Báo cáo `docs/reports/<ngày>-ui-gd2.md` (đã chạy gì, kết quả, ảnh chụp, yêu cầu API nếu có); đánh dấu checklist P08 Giai đoạn 2.

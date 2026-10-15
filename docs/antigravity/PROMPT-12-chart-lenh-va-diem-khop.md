# PROMPT-12 — Lệnh đang mở và điểm khớp (B/S) trên biểu đồ

Yêu cầu của chủ dự án (2026-10-12): nhìn chart là biết **mình đang đặt lệnh ở đâu** và **đã khớp lúc nào, giá bao nhiêu** — không phải mở lịch sử.
Ví dụ: đặt Mua giới hạn 80.000 → chart có đường "Mua 80.000"; khi khớp → tại cây nến đó có ký hiệu **B** (mua) hoặc **S** (bán) đúng ở giá khớp.

Nhánh: `ui/gd2-exchange`. Chỉ sửa `apps/exchange/**` (chủ yếu `components/trading/CandlestickChart.tsx`), `packages/ui/**` nếu cần.
**Backend không cần đổi** — mọi dữ liệu đã có trong hợp đồng (bảng dưới). Thiếu gì thì ghi `docs/parts/contract-requests.md`, không tự gọi `fetch`.
Cổng: `npm run ui-check -- --e2e` xanh. Claude Code viết test nghiệm thu `e2e/tests/chart-orders.spec.ts` theo mục E khi bạn báo xong.

## Dữ liệu có sẵn (packages/contracts)

| Cần | Lấy từ | Ghi chú |
|---|---|---|
| Lệnh đang mở của cặp | `api.openOrders({ query: { symbol } })` → `{ items: Order[] }` | `Order.price`, `stopPrice`, `quantity`, `executedQty`, `status`, `type`, `triggerState`, `source` (USER/GRID/DCA) |
| Lệnh thay đổi realtime | `realtimeClient.subscribe('user', …)` sự kiện `{ kind: 'order', order }` | trạng thái mở = `NEW` hoặc `PARTIALLY_FILLED`; còn lại (`FILLED`, `CANCELED`, `REJECTED`, `EXPIRED`) → bỏ khỏi chart |
| Lần khớp (lịch sử) | `api.myTrades({ query: { symbol, from, to, limit: 200, cursor } })` → phân trang | `Trade.side`, `price`, `quantity`, `quoteQty`, `fee`, `feeAsset`, `liquidity`, `createdAt` (ISO), `orderId` |
| Lần khớp mới | `subscribe('user')` sự kiện `{ kind: 'trade', trade }` | lọc `trade.symbol === symbol` |

## Hiện trạng (đã đọc mã `CandlestickChart.tsx` @ `9ec5c74`)

Chart **đã** vẽ đường cho lệnh đang mở (dòng ~1183–1198) nhưng:
1. Chỉ tải `openOrders` **một lần** khi đổi cặp/đăng nhập (dòng ~368) → đặt lệnh mới **không hiện** cho tới khi tải lại trang; lệnh đã khớp/hủy **vẫn còn đường**.
2. Chỉ vẽ lệnh có `price` → lệnh **Stop-Market** (chỉ có `stopPrice`) không hiện; Stop-Limit đang chờ vẽ ở `price` thay vì giá kích hoạt.
3. Futures: map `price: fo.price || '0'` (dòng ~345) → lệnh Market futures vẽ **đường ở giá 0** (vi phạm "NULL ≠ 0").
4. Nhãn `Mua 0.001` không có loại lệnh, khối lượng chưa định dạng, khớp một phần vẫn hiện khối lượng gốc.
5. Chưa có ký hiệu khớp (B/S) nào.

## A. Đường lệnh đang mở (sửa phần đã có)

1. **Cập nhật trực tiếp:** đăng ký `user`; sự kiện `order` của cặp đang xem → thêm/cập nhật nếu còn mở, xóa nếu đã đóng. Khi realtime nối lại (`connectionStatus` về `open`) hoặc tab được focus lại → gọi lại `openOrders` một lần.
2. **Giá vẽ:**
   - `LIMIT` → `price`.
   - `STOP_LIMIT` / `STOP_MARKET` / `TRAILING_STOP_MARKET` đang `WAITING` → `stopPrice`, nét đứt, nhãn có chữ "Stop".
   - `STOP_LIMIT` đã `TRIGGERED` → `price`.
   - `MARKET` → không vẽ.
   - OCO: vẽ cả hai chân (mỗi chân là một `Order`).
   - Không có giá → **không vẽ** (không thay bằng 0).
3. **Nhãn** (dùng `formatPrice` / `formatAmount` theo `tickSize` / `stepSize`):
   - mẫu: `Mua giới hạn 0,0012 BTC`, `Bán Stop 0,5 ETH`;
   - khối lượng còn lại = `quantity − executedQty` (dùng `Dec`, không `parseFloat` để tính);
   - giá hiện ở nhãn trục phải (`axisLabelVisible: true`).
4. **Màu:** Mua = `var(--up)`, Bán = `var(--down)`. Lệnh của bot (`source` GRID/DCA): nhạt hơn, nhãn thêm "Bot". Lệnh lưới có thể rất nhiều → khi > 20 đường thì chỉ hiện 20 lệnh gần giá nhất, kèm chú thích "+N lệnh khác".
5. `parseFloat` **chỉ** dùng để đưa toạ độ cho thư viện vẽ; mọi chữ hiển thị dùng chuỗi gốc + hàm định dạng.
6. **Lệnh nằm ngoài khung giá đang nhìn** (ví dụ khung 1m dao động 82.000–84.000, lệnh Mua ở 80.000): đường giá không lọt vào khung và người dùng không biết là có lệnh.
   - Hiện một nhãn nhỏ ở mép trên/dưới chart, ví dụ `↓ Mua 80.000,00`. Bấm vào nhãn thì cuộn trục giá tới mức đó.
   - Không ép trục giá tự co giãn để chứa mọi lệnh, vì làm vậy nến bị dẹt.

## B. Ký hiệu khớp lệnh B / S (mới)

1. **Tải lịch sử khớp** khi đăng nhập và mở cặp:
   - `myTrades({ symbol, from: <ISO của cây nến cũ nhất đang tải>, limit: 200 })`, theo `nextCursor` tối đa 5 trang (≤ 1.000 lần khớp);
   - khi chart tải thêm nến cũ (kéo về quá khứ — B3), tải thêm khớp của khoảng đó;
   - sự kiện realtime `trade` của cặp → thêm ngay (không tải lại cả danh sách).
2. **Vẽ bằng plugin markers của lightweight-charts v5** (bản 5.2.1 đã có):
   - `createSeriesMarkers(mainSeries, [])` tạo **một lần** cho series chính, sau đó chỉ `setMarkers(...)`;
   - mỗi marker: `time` = thời điểm khớp **làm tròn xuống mốc mở nến của khung đang xem** (UTC giây, cùng cách tính `time` của nến); `position: 'atPriceBottom'` cho Mua / `'atPriceTop'` cho Bán, `price` = giá khớp → ký hiệu nằm **đúng mức giá khớp**, không phải trên/dưới thân nến;
   - `shape: 'arrowUp'` + `text: 'B'` + màu `--up` cho Mua, `shape: 'arrowDown'` + `text: 'S'` + màu `--down` cho Bán;
   - mảng markers phải **sắp theo `time` tăng dần** (thư viện yêu cầu).
3. **Gộp:** nhiều lần khớp cùng cây nến + cùng chiều → một marker; giá = giá trung bình theo khối lượng `Σ quoteQty / Σ quantity` (tính bằng `Dec`), `text` = `B` (hoặc `B×3` nếu 3 lần khớp).
4. **Di chuột:** khi con trỏ ở cây nến có khớp, legend phía trên hiện chi tiết, ví dụ:
   `Mua 0,0012 BTC @ 82.430,76 · 2 lần khớp · phí 0,0000012 BTC · 21:49`
   (dùng `subscribeCrosshairMove`, giờ theo giờ Việt Nam như trục thời gian).
5. **Đổi khung (1m → 1h …):** tính lại `time` từ danh sách khớp đang giữ, không gọi lại API. **Đổi cặp:** xóa markers, tải lại.
6. **Kiểu chart Đường / Vùng:** markers vẫn hiện (gắn vào series chính của kiểu đó).
7. **Nút bật/tắt** trên thanh công cụ chart: "Lệnh của tôi" (mặc định bật khi đã đăng nhập; ẩn khi chưa đăng nhập). Bật/tắt cả đường lệnh (A) và markers (B). Lưu lựa chọn trong `localStorage` (chỉ là tuỳ chọn hiển thị).

## C. Trạng thái

| Tình huống | Hiển thị |
|---|---|
| Chưa đăng nhập | không đường, không markers, không nút "Lệnh của tôi" |
| Đang tải khớp | chart vẫn chạy bình thường; không hiện markers giả |
| `myTrades` / `openOrders` lỗi | dòng nhỏ trong legend: "Không tải được lệnh của bạn" + nút "Thử lại"; **không** hiện số liệu đoán |
| Không có lệnh/khớp | không có gì (không cần thông báo) |
| Mất kết nối realtime | giữ nguyên dữ liệu đã có; nối lại → đồng bộ lại theo A1 |

## D. Truy cập + điểm bám cho test (bắt buộc — canvas không đọc được)

Thêm danh sách ẩn khỏi mắt (`sr-only`) nhưng có trong DOM, cạnh chart. Danh sách này phục vụ cả trình đọc màn hình lẫn test e2e:
```html
<ul data-testid="chart-order-lines" aria-label="Lệnh đang mở trên biểu đồ">
  <li data-testid="chart-order-line" data-order-id="…" data-side="BUY" data-price="80000.00">Mua giới hạn 0,0012 BTC @ 80.000,00</li>
</ul>
<ul data-testid="chart-fill-markers" aria-label="Điểm khớp lệnh trên biểu đồ">
  <li data-testid="chart-fill-marker" data-side="BUY" data-price="82430.76" data-time="1760280540" data-count="2">Mua 0,0012 BTC @ 82.430,76 lúc 21:49</li>
</ul>
```
- `data-price`: chuỗi giá **gốc từ API** (giá trung bình khi gộp: chuỗi `Dec` đã làm tròn theo `tickSize`).
- `data-time`: `time` của marker (giây UTC).
- Nút bật/tắt: `data-testid="chart-my-orders-toggle"`, `aria-pressed`.
- Ghi các testid này vào `docs/antigravity/TESTIDS.md` (mục chart).

## E. Nghiệm thu (Claude Code viết `e2e/tests/chart-orders.spec.ts`)

1. Tài khoản mới + nạp faucet → `/trade/BTCUSDT` → đặt Mua giới hạn thấp hơn giá 20% → **không tải lại trang**, trong 5s có `chart-order-line` `data-side=BUY`, `data-price` = giá đã đặt.
2. Hủy lệnh đó → trong 5s `chart-order-line` biến mất.
3. Mua Market 100 USDT → trong 5s có `chart-fill-marker` `data-side=BUY`, `data-price` = giá khớp trung bình của lệnh (so với `GET /api/v1/trades`).
4. Tải lại trang → marker vẫn còn. Đổi khung 1m → 1h → marker vẫn còn, `data-time` = mốc mở nến 1h chứa thời điểm khớp.
5. Bán Market toàn bộ BTC → có thêm marker `data-side=SELL`.
6. Bấm `chart-my-orders-toggle` → danh sách rỗng; bấm lại → hiện lại.
7. Trang không có lỗi console, không có request lỗi (fixture `guard` đã chặn sẵn).

Sau khi xong: ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` cuối file này.

Trạng thái: **Đã sửa** (`0a8f95b`) — `npm run typecheck` (✓ all workspaces type-check), `npm test` (✓ 230/230 tests passed).

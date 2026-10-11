# PROMPT-10 — Sửa trang giao dịch: biểu đồ bị kéo dài, trùng lặp, và độ mượt

Nhánh: `ui/gd2-exchange`. Chỉ sửa `apps/exchange/**` và `packages/ui/**`. Không đụng `packages/contracts`, `server/`.
Cần đổi hợp đồng API → ghi vào `docs/parts/contract-requests.md`.
Sau khi xong chạy `npm run ui-check -- --e2e` (phải xanh) và báo cáo vào `docs/reports/`.

## A. LỖI NẶNG — biểu đồ cao ~2400px, cột "Thị trường" bị kéo dài theo

Đo thực tế trên `/trade/ETHUSDT` (1440×900): `.tv-lightweight-charts` cao **2418px**, khung chart cha 2470px, canvas 585×2988.
Hậu quả: biểu đồ chỉ thấy một lát cắt, thanh giá bị nén, cột "Thị trường" bên trái, sổ lệnh và form đặt lệnh đều bị kéo cao theo.

**Nguyên nhân:** vòng lặp tự phình to.
1. `CandlestickChart.tsx` dùng `autoSize: true` **và** tự gọi `chart.resize()` trong `ResizeObserver` (dòng ~523) và trong effect fullscreen (~903). Hai cơ chế cùng chỉnh kích thước.
2. Container chart có `min-h-[320px] h-full flex-1` nhưng cha không có chiều cao cố định. Canvas lớn lên thì cha lớn theo, observer đo lại, resize lên nữa.
3. Hàng trên của `TradePage.tsx` (~dòng 232) là `flex flex-1 ... h-[600px]`. `flex-1` đè `h-[600px]`, và flex item mặc định `min-height:auto` nên hàng phình theo nội dung.

**Cách sửa (làm đủ cả ba):**
- Khung chart: `relative flex-1 min-h-0 overflow-hidden`. Div gắn chart đổi thành `absolute inset-0` (không dùng `h-full`/`min-h-[320px]`). Chart không còn đẩy chiều cao cha.
- **Bỏ** `ResizeObserver` và `resize()` thủ công; chỉ giữ `autoSize: true`. Khi fullscreen đổi thì chỉ cần gọi `timeScale().fitContent()` nếu muốn.
- `TradePage.tsx`: hàng trên đổi `flex-1` thành `flex-none h-[clamp(520px,calc(100vh-18rem),720px)]`, và thêm `min-h-0` cho mọi cột. Cột "Thị trường" giữ `overflow-y-auto min-h-0`; Orderbook và MarketTrades đặt `min-h-0` kèm `overflow-hidden`.
- Cột phải (orderbook + trades) và form đặt lệnh cũng phải bị giới hạn theo chiều cao hàng, cuộn bên trong khi dài.

**Nghiệm thu:** ở 1366×768, 1440×900, 1920×1080 chart cao bằng đúng ô của nó, không có thanh cuộn dọc của trang do chart gây ra. Viết test e2e: `getBoundingClientRect().height` của `.tv-lightweight-charts` nằm trong 360–760px và không đổi sau 3 giây, kể cả sau khi đổi cặp và đổi khung 1m/1h.

## B. LỖI — dựng trùng bản desktop và bản mobile

`TradePage.tsx` render đồng thời nhánh `hidden lg:flex` và nhánh `lg:hidden`; ẩn bằng CSS thì React vẫn mount cả hai.
Kết quả ở desktop: 2 `CandlestickChart` (một cái cao 0px), mỗi request nến, depth, trades chạy 2 lần, mỗi kênh WebSocket đăng ký 2 lần.

**Sửa:** tạo hook `useMediaQuery('(min-width: 1024px)')` và chỉ render một nhánh. Làm tương tự ở `FuturesPage.tsx` nếu có cùng cấu trúc.
**Nghiệm thu:** mở `/trade/BTCUSDT` ở desktop, đúng 1 phần tử `.tv-lightweight-charts`, và mỗi `GET /market/candles|depth|trades` chỉ gọi 1 lần mỗi lần đổi cặp.

## C. LỖI DỮ LIỆU CHART khi đổi cặp / khung

- Effect "8. Live Price Tick" cập nhật `lastCandleRef` bằng giá của cặp mới trong khi nến cũ của cặp trước vẫn còn, tạo ra cây nến lai (râu cực dài, trục giá nhảy). Khi `symbol` hoặc `interval` đổi: xóa `lastCandleRef`, `candlesListRef`, gọi `setData([])` cho mọi series, rồi mới nạp dữ liệu mới. Chỉ `update()` khi đã có nến của đúng `symbol` + `interval`.
- Effect tạo chart có deps `[activeTab]` nhưng dùng `chartType`, `showIndicators`, `activeSymbolInfo`. Đảm bảo không có chart bị tạo lại khi đổi cặp (giữ canvas, chỉ đổi dữ liệu) để không nhấp nháy.
- Hover chuột ra khỏi chart thì legend (O/H/L/C) phải quay về nến cuối cùng (hiện đang kẹt ở nến vừa hover).
- Quản lý `loading`: khi đổi cặp hiện overlay mờ nhẹ (opacity transition 150ms), không che kín bằng nền đặc 85% làm chart "chớp".

## D. Các lỗi nhỏ đã thấy trên trang giao dịch

1. Huy hiệu **"10x"** cạnh tên cặp ở trang **Spot**: Spot không có đòn bẩy, bỏ đi (chỉ Futures mới hiện).
2. Nút ngôi sao (yêu thích) và nút "Chuyên nghiệp" **không làm gì**. Hoặc nối vào tính năng thật (yêu thích lưu qua preferences/localStorage), hoặc ẩn.
3. Dropdown đổi cặp trong header mở bằng `group-hover` nên không dùng được trên cảm ứng và bàn phím; các tab "USDC / Crypto" chỉ là chữ. Đổi sang popover bấm để mở (đóng khi bấm ngoài / Esc), có ô tìm kiếm; bỏ các tab giả.
4. Định dạng phần trăm không thống nhất: header `+0,28%` còn danh sách bên trái `0.28%` (dấu chấm, thiếu dấu `+`). Dùng chung `PercentChange` / `formatPercent` của `@cex/ui`.
5. Dòng "≈ giá USDT" dưới giá lặp đúng số vừa hiển thị; bỏ hoặc đổi thành giá mark/giá trung bình.
6. Giá giữa sổ lệnh (`lastPrice` từ kênh tickers, ≤1/s + throttle 500ms) có lúc nằm ngoài khoảng bid/ask. Lấy giá của lần khớp mới nhất từ kênh `trades:<symbol>` cho nhãn giữa sổ lệnh, và hiện thêm spread.
7. `MarketTrades` dùng token `--color-*`, Orderbook dùng `--up/--down`; dùng chung một bộ token. Kiểm tra giao diện sáng (`data-theme="light"`): chart đang hard-code `#a1a1aa`, lưới trắng 4%, `#0a0a0b` ở chế độ fullscreen, nên ở nền sáng gần như không đọc được. Đọc màu từ CSS variable và gọi `chart.applyOptions` khi đổi theme.
8. Khi chưa đăng nhập, trang vẫn gọi `/me/preferences` 3 lần và tạo 3–6 lỗi 401 trong console (`AuthContext`, `CandlestickChart`, `OrderForm`...). Chỉ gọi khi `isAuthenticated`; `syncPreferences` ở lần tải đầu đừng chạy cùng `refreshUser`.
9. Trang đang chọn `activeSymbol` từ localStorage rồi mới đổi theo URL, nên vào thẳng `/trade/ETHUSDT` thì tải dữ liệu BTC trước rồi ETH. Lấy cặp từ URL ngay từ render đầu.

## E. Độ mượt (trải nghiệm)

Mục tiêu: không giật khi đổi cặp, không nhảy bố cục, số cập nhật không "nháy" cả bảng.

1. **Sổ lệnh:** đang dùng `key={idx}` nên mọi dòng bị React tái dùng sai. Dùng `key={price}`. Dòng đổi số lượng thì flash nhẹ 250ms (nền xanh/đỏ mờ), không chớp. Thanh độ sâu dùng `transition: width 200ms ease-out`. Cho phép chiều cao ổn định (dùng số hàng cố định theo chiều cao ô, không để nhảy khi số mức đổi).
2. **Khớp lệnh gần đây:** dòng mới trượt vào từ trên (150ms), `key` phải duy nhất (hiện có thể trùng id giữa REST và WS; loại trùng theo `id` trước khi thêm).
3. **Giá:** khi đổi, chữ chuyển màu xanh/đỏ 300ms rồi về màu thường; dùng `font-variant-numeric: tabular-nums` và chiều rộng cố định để số không làm lệch bố cục.
4. **`MarketContext`:** mỗi 500ms tạo lại object context nên mọi component dùng `useMarket()` đều render lại (kể cả trang không liên quan). Tách ticker ra khỏi context (dùng `useTicker(symbol)` và `useAllTickers()` có sẵn), bọc giá trị context bằng `useMemo`. Danh sách "Thị trường" bên trái dùng `useAllTickers`, từng dòng là `React.memo`.
5. **Chuyển trang:** hiện router tự viết, đổi trang là mất hẳn nội dung rồi dựng lại. Thêm `React.lazy` + `Suspense` cho từng trang (bản build hiện 1.03 MB JS, gzip 286 kB, cảnh báo của Vite) và `manualChunks` tách `lightweight-charts`, `react`. Hiệu ứng vào trang: fade + dịch lên 8px trong 180ms (tôn trọng `prefers-reduced-motion`). Giữ vị trí cuộn khi bấm Back.
6. **Skeleton:** mọi bảng/khối dữ liệu có khung xương đúng kích thước thật, không để giật khi dữ liệu về.
7. **Đổi cặp:** không hiện spinner che toàn chart; giữ khung cũ mờ 60% đến khi có nến mới.
8. Mọi `transition` ≤ 200ms, dùng `transform/opacity`, tránh animate `height/width` của khối lớn.

## F. Thứ tự làm

A → B → C (chặn người dùng nhất), rồi D, rồi E. Mỗi mục một commit, kèm test e2e nếu có thể (`e2e/tests/`). Không báo xong khi chưa chạy `npm run ui-check -- --e2e` và ghi kết quả thật.

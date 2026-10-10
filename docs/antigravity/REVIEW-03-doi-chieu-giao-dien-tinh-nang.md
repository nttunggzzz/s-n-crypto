# REVIEW-03 — Đối chiếu giao diện sàn với tính năng backend (2026-10-10)

**Phạm vi:** nhánh `ui/gd2-exchange` tại `03a4772`, gộp với `main`. Đã chạy trên backend thật (giá giả lập) và đọc code `apps/exchange`.
Phần chưa commit (BotsPage, PnlAnalysisPage, SettingsPage, Header) chỉ có góp ý sơ bộ ở mục E; sẽ review đầy đủ khi commit.

**Đo được:**
- Giao diện gọi **80/93** endpoint dành cho người dùng (admin chưa có giao diện — PROMPT-03).
- Typecheck mọi workspace đạt. `npm run e2e`: 6 test cũ đạt; 9 test đỏ (mục A0 và 8 test nghiệm thu bên dưới).

## Cách nghiệm thu (bắt buộc)

1. Gộp `main` vào nhánh của bạn. Xung đột `package-lock.json`: `git checkout --ours package-lock.json && npm install`.
2. `npm run verify`, rồi `npm run e2e`. Lần đầu sẽ build app và dựng hệ test riêng: DB :5436, API :8090, web :5190.
3. Test nghiệm thu nằm ở `e2e/tests/review03.spec.ts` và `spot.spec.ts`. **Mục nào xong thì test đó xanh.** Không sửa test.
   Nếu thấy test sai, ghi vào `docs/parts/contract-requests.md`.
4. Mọi test còn bị **chốt chặn chung** (`e2e/fixtures.ts`) đánh trượt khi có một trong các lỗi sau:
   - lỗi console hoặc lỗi trang;
   - API trả 5xx hoặc `VALIDATION_ERROR`;
   - **server từ chối một kênh realtime** (`RATE_LIMITED`, `NOT_FOUND`, `UNAUTHENTICATED`).

## Kết quả REVIEW-02

| # | Mục | Kết quả |
|---|---|---|
| 1 | UID thay cho ID nội bộ | ✅ test e2e xanh |
| 2 | Ảnh đại diện theo `AvatarId` | ✅ |
| 3 | Bỏ liên kết Telegram giả | ✅ ("Sắp có") |
| 4 | `/wallet` → `/assets` | ✅ test e2e xanh |
| 5 | Định dạng giá theo tickSize | ⚠️ Spot xong. **Trang Futures chưa:** header giá, giá đánh dấu, cao/thấp dùng `formatDecimal` mặc định — phải dùng `tickSize` của hợp đồng Futures |
| 6 | Badge lệnh bot, ẩn nút Hủy | ✅ |
| 7 | Đủ loại thông báo | ✅ đủ 13 loại |
| 8 | Tên sự kiện Futures | ✅ |
| 9 | Dữ liệu Futures cho biểu đồ / sổ lệnh | ⚠️ Biểu đồ Futures **vẫn vẽ lệnh Spot và giá vốn Spot** → A5 |
| 10 | `floorToStep` cho khối lượng | ✅ |

## Hợp đồng 0.8.0 (mới, đã ở `main`) — dùng ngay

- **Kênh `tickers`** → `{ items: Ticker[] }`. Lúc đăng ký nhận **mọi cặp**; sau đó tối đa 1 lần/giây chỉ gửi các cặp vừa đổi.
  **Kênh `futures:tickers`** tương tự cho hợp đồng Futures (cũng gửi khi mark/funding đổi).
- **`rt.reconnect()`**: mở lại kết nối, giữ nguyên các kênh đã đăng ký. Server chỉ đọc cookie phiên lúc mở kết nối.
- **`REALTIME_MAX_CHANNELS = 100`** mỗi kết nối. Vượt giới hạn → `onError` nhận `RATE_LIMITED`. Mock áp dụng y hệt.
- Server **đóng kết nối realtime (mã 4401)** khi phiên đăng nhập của nó kết thúc (đăng xuất, bị thu hồi, đổi mật khẩu, bị khóa). Client tự kết nối lại dưới dạng khách.

Chi tiết: `packages/contracts/CHANGELOG.md` (0.8.0) và `README.md` mục 2.

---

## A. Phải sửa — sai dữ liệu hoặc lỗi tích hợp (có test)

### A0. Gọi `rt.reconnect()` sau đăng nhập / 2FA / đăng ký / đăng xuất — test: `spot.spec.ts`
- **Lỗi hiện tại:** kết nối realtime mở lúc chưa đăng nhập. Sau khi đăng ký hoặc đăng nhập (không tải lại trang), kênh `user` bị server từ chối (`UNAUTHENTICATED`).
  Hệ quả: **lệnh, số dư, thông báo, vị thế Futures không cập nhật realtime** cho tới khi tải lại trang.
  Ngược lại, sau khi đăng xuất, tab cũ vẫn nhận sự kiện của tài khoản cũ. Server giờ chặn trong ≤ 30 giây, nhưng UI phải chủ động.
- **Sửa:** trong `AuthContext`, mỗi khi người dùng chuyển giữa khách ↔ đã đăng nhập (đăng nhập, bước 2FA, đăng ký, đăng xuất, phiên hết hạn), gọi `(await getRealtimeClient()).reconnect()`.
- Nên lắng nghe `rt.onError`: khi nhận `UNAUTHENTICATED` cho kênh `user` trong lúc UI nghĩ đang đăng nhập → gọi lại `me()`. Nếu `me()` trả 401 thì đưa về trạng thái khách.

### A1. Giá nhiều cặp: dùng MỘT kênh `tickers` — test: `review03 A1`
- **Lỗi hiện tại:** `MarketContext` đăng ký 50 kênh `ticker:<cặp>`. Cộng với `market:status`, `depth`, `trades`, `candles`, `user`, `futures:*`, tổng số kênh vượt 50 (giới hạn cũ).
  Đo được: server từ chối 4–5 kênh (BONK, FLOKI, KAIA, STX, WIF) → **giá các cặp này đứng im**.
  Giới hạn nay đã nâng lên 100 để bản hiện tại chạy được, nhưng vẫn phải sửa.
- **Thêm nữa:** khoảng 50 sự kiện giá/giây, mỗi sự kiện gọi `setTickers` trong context → **cả ứng dụng vẽ lại khoảng 50 lần/giây**.
  Đây là một phần lý do máy dùng 70–90% CPU khi chạy test.
- **Sửa:**
  - `MarketContext` đăng ký `tickers` (một kênh) và gộp `items` vào một kho riêng (store).
  - Component đọc đúng cặp nó cần qua hook kiểu `useTicker(symbol)` (`useSyncExternalStore`), không đưa cả bảng giá vào giá trị context.
  - Trang Futures dùng `futures:tickers` cho danh sách hợp đồng (A4).
  - Mỗi trang ≤ 20 kênh; chỉ cặp đang xem mới đăng ký `ticker:<cặp>` riêng (nếu cần).

### A2. Funding và đồng hồ đếm ngược trên trang Futures là số bịa — test: `review03 A2`
- **Lỗi hiện tại:** `FuturesPage.tsx:515` hiện `'0.0100%'` khi chưa có funding, và chuỗi cứng `04:22:15` (không bao giờ đổi).
- **Sửa:**
  - Lấy `fundingRate` và `nextFundingTime` từ `futures:mark:<SYMBOL>` (hoặc `futures:tickers`).
  - Đếm ngược mỗi giây, dạng `HH:MM:SS`, đặt trong phần tử `data-testid="funding-countdown"` (chỉ chứa chuỗi giờ).
  - Thiếu dữ liệu → `—`.
  - Tỷ lệ dùng định dạng tiếng Việt (`0,0139%`), cùng kiểu với các số khác.

### A3. Tab "Mới niêm yết" lọc bằng điều kiện bịa — test: `review03 A3`
- **Lỗi hiện tại:** `MarketsPage.tsx:61` lọc `SOL || DOGE` ("mock condition"). Backend **không có** ngày niêm yết, nên tab này luôn sai.
- **Sửa:** bỏ tab. Thay bằng chip nhóm ngành lấy từ `exchangeInfo.assets[].tags`, nhãn hiển thị lấy từ `ASSET_TAG_LABELS` (Layer 1, Meme, AI, DeFi…).

### A4. Trang Futures không chọn được hợp đồng; mở bằng mã Spot thì hỏng — test: `review03 A4`
- **Lỗi hiện tại:**
  - Trang Futures không có ô chọn hợp đồng; chỉ đổi được bằng URL.
  - Menu "Futures" mở `/futures/<mã Spot đang xem>`. Có 4 coin khác mã giữa hai chợ: Spot `PEPEUSDT`, `SHIBUSDT`, `BONKUSDT`, `FLOKIUSDT` ↔ Futures `1000PEPEUSDT`, `1000SHIBUSDT`, `1000BONKUSDT`, `1000FLOKIUSDT`.
    Với 4 coin này, trang Futures mở hợp đồng không tồn tại và mọi giá trị hiện `—`.
- **Sửa:**
  - `/futures/<mã>` không phải hợp đồng → tìm hợp đồng có `underlyingAsset` bằng `baseAsset` của cặp Spot đó, rồi `history.replaceState` sang mã đúng (`/futures/PEPEUSDT` → `/futures/1000PEPEUSDT`). Không tìm thấy → `BTCUSDT`.
  - Thêm ô chọn hợp đồng: tìm kiếm, giá, % 24h, funding. Dữ liệu từ `futuresExchangeInfo` + `futures:tickers`.
  - Khối lượng hiển thị theo đơn vị hợp đồng (`1000PEPE`), có chú thích `multiplier`.

### A5. Biểu đồ Futures vẽ dữ liệu Spot (không test được trên canvas — tự kiểm)
- **Lỗi hiện tại:** `CandlestickChart` luôn gọi `openOrders` (Spot) và `portfolio` (giá vốn Spot), kể cả khi `marketType === 'futures'`. Vì vậy biểu đồ Futures BTC hiện lệnh Limit Spot BTC và đường "Giá vốn" Spot.
  Số chữ số giá cũng lấy từ cặp Spot đang chọn (`activeSymbolInfo`).
- **Sửa:**
  - Với Futures, không gọi `openOrders` hay `portfolio`.
  - Vẽ lệnh Futures đang mở (`futuresOpenOrders`, cập nhật theo sự kiện `futuresOrder`), giá vào lệnh, giá thanh lý, TP/SL của vị thế.
  - Số chữ số theo `tickSize` của hợp đồng.

### A6. Theo dõi trạng thái sàn realtime — test: `review03 A6`
- **Lỗi hiện tại:** `tradingHalted` chỉ đọc một lần từ `exchangeInfo` lúc tải trang. Khi Admin dừng sàn, mở lại, hoặc tắt một cặp, người dùng không biết cho tới khi tải lại trang; lệnh gửi lên sẽ bị từ chối.
- **Sửa:**
  - Đăng ký `exchange:status` trong `MarketContext`. Khi `tradingHalted` hoặc `disabledSymbols` đổi: hiện banner, khóa nút đặt lệnh, hiện "Tạm ngưng" ở danh sách.
  - Futures: khi `MarkPrice.status !== 'LIVE'` → khóa Mở Long/Short và hiện "Giá đánh dấu tạm dừng". Server cũng từ chối khớp khi giá STALE.

### A7. Không hiện số 0 thay cho "chưa có dữ liệu" — test: `review03 A7`
- **Lỗi hiện tại:**
  - `TradePage.tsx:142`: dòng `$…` dưới giá dùng `decimals: 2`, nên coin giá nhỏ (PEPE 0,00000981) hiện **`$0.00`**. Khi chưa có giá thì hiện `0.00`.
  - Futures: ROE hiện `'0.00%'` khi chưa tính được (`FuturesPage.tsx:693`).
- **Sửa:**
  - Dòng `$` dùng số chữ số theo tickSize, hoặc bỏ hẳn (giá đã tính bằng USDT).
  - Chưa có dữ liệu → `—`. Chỉ hiện 0 khi API thật sự trả 0.

### A8. Cài đặt giao diện phải áp dụng ngay khi mở app — test: `review03 A8`
- **Lỗi hiện tại:** `data-theme` và `data-color-reversed` chỉ được gắn khi người dùng **mở trang Cài đặt** (effect trong `SettingsPage`). Mở thẳng `/markets` vẫn hiện giao diện tối, xanh = tăng, dù đã chọn khác.
  Biểu đồ dùng màu cứng `#1fc27a` / `#f2475f`, không theo lựa chọn "đỏ = tăng".
- **Sửa:**
  - Sau khi `me` tải xong (trong `AuthContext` hoặc `App`), đọc `getPreferences()` và áp dụng `theme`, `upColor`.
  - Hỗ trợ `theme: 'system'` (theo `prefers-color-scheme`). Hợp đồng có giá trị này; giao diện hiện chỉ cho chọn sáng/tối.
  - Khách: dùng localStorage.
  - Màu biểu đồ đọc từ biến CSS.

---

## B. Thiếu tính năng — backend đã có, giao diện chưa dùng

| # | Tính năng | Endpoint / kênh | Yêu cầu |
|---|---|---|---|
| B1 | **Xuất CSV** — test: `review03 B1` | `exportLedger`, `exportOrders`, `exportTrades` | Nút "Xuất CSV" ở tab lịch sử trang Tài sản (sổ cái) và ở Lịch sử lệnh / Lịch sử khớp. Một lần bấm là tải file `.csv`, theo bộ lọc đang chọn (`from`, `to`, `symbol`). Client trả về chuỗi CSV → `Blob` → tải xuống. |
| B2 | Thông báo của sàn | `announcements` | Dải thông báo ở Thị trường và Giao dịch: ghim lên đầu, màu theo `level` (`INFO` / `IMPORTANT` / `MAINTENANCE`), nút ẩn theo `id` (localStorage). |
| B3 | Trang Thị trường đầy đủ | `sparklines`, `exchangeInfo.assets`, `futures:tickers` | Đồ thị nhỏ 24h/7 ngày (server cache khoảng 60 giây; `status` ≠ LIVE thì làm mờ), tên coin, chip nhóm ngành (A3), sắp xếp theo cột, tab Futures. |
| B4 | Lịch sử khớp Futures | `futuresMyTrades`, `futures:trades` | Tab "Lịch sử khớp" ở trang Futures; bảng giao dịch thị trường Futures (hiện chỉ có sổ lệnh). |
| B5 | Tạo lại mã khôi phục 2FA | `regenerateRecoveryCodes` | Trong mục Bảo mật, cần nhập mã 2FA. Hiện mã một lần, có nút sao chép / tải về. |
| B6 | Phân trang | mọi danh sách có `nextCursor` | Nút "Xem thêm" cho lịch sử lệnh, khớp, sổ cái (Spot + Futures), lịch sử vị thế, lịch sử đăng nhập, kỳ DCA, lệnh bot. Hiện chỉ lấy 50 dòng đầu. |
| B7 | Biểu đồ | `candles` (`endTime`), kênh `candles:*` | Thêm chỉ báo **EMA, RSI** (ROADMAP GĐ2). Kéo về trái thì tải nến cũ. Nến realtime phải được nối vào state: hiện đồng hồ đóng nến và MA đứng yên sau cây nến đầu tiên. Đường lệnh trên biểu đồ phải cập nhật khi đặt / hủy lệnh (sự kiện `order`). |
| B8 | Captcha khi đăng ký | `register.captchaToken` | Khi có `VITE_TURNSTILE_SITE_KEY` (khóa công khai), hiện widget Cloudflare Turnstile và gửi `captchaToken`. Lỗi server là `VALIDATION_ERROR` với `details.field === 'captchaToken'`, **không** có mã `CAPTCHA_FAILED` → sửa ánh xạ trong `services/errors.ts`. |
| B9 | Giờ GMT+7 | — | Thêm hàm `formatDateTime` trong `packages/ui` với `timeZone: 'Asia/Ho_Chi_Minh'` và dùng nó thay cho `toLocaleString`. Biểu đồ: `localization.timeFormatter` + `timeScale.tickMarkFormatter`; lightweight-charts mặc định hiển thị **UTC**. |

## C. Hiệu năng
1. Vẽ lại theo từng sự kiện giá → A1.
2. Bundle `index.js` **911 kB**. Tách theo trang bằng `React.lazy` và tách thư viện biểu đồ ra chunk riêng.
3. `CandlestickChart` tạo lại toàn bộ biểu đồ mỗi khi `openOrders` / `avgCost` / `futuresPosition` đổi, nên người dùng mất vị trí zoom. Chỉ cập nhật series và đường giá.

## D. Lỗi nhỏ
- `UserOrdersTabs`: khi bật "Ẩn cặp khác", sự kiện realtime của cặp khác vẫn được thêm vào bảng.
- Toast "Lệnh đã khớp: 0.00123 @ 84308.0" hiện số thô → định dạng theo step/tick, kiểu tiếng Việt.
- Banner "SÀN MÔ PHỎNG SPOT…" → sàn đã có Futures, nên đổi thành "SÀN MÔ PHỎNG".
- Futures: khi thiếu thông tin hợp đồng, giá thanh lý ước tính dùng MMR mặc định `0.005` → hiện `—`, không đoán.
- Header ở bề rộng khoảng 800 px (tablet): chữ menu xuống dòng.

## E. Phần đang làm (chưa commit) — góp ý sơ bộ
- Thêm route cho trang Bot và Lãi lỗ vào `App.tsx`. Badge lệnh bot đang dẫn tới `/bots?grid=<id>`, nhưng route chưa có nên rơi về trang Thị trường.
- `BotsPage`: `parseFloat(bot.totalPnl || '0')` biến `null` thành 0. `totalPnl` / `totalValue` có thể `null` → hiện `—`, tính bằng `Dec`.
- Mục Bảo mật: thêm B5; lịch sử đăng nhập cần phân trang (B6).
- Sau khi commit, tôi sẽ chạy lại e2e và review tiếp.

## Thứ tự đề xuất
1. **A0, A1, A6** (realtime — ảnh hưởng mọi trang).
2. A2–A5, A7, A8.
3. B1–B3.
4. Phần còn lại.

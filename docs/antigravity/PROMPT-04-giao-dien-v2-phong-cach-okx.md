# PROMPT-04 — Giao diện v2: chuẩn sàn lớn, phong cách OKX, hiện đại hơn OKX

> Dán cho Antigravity: "Đọc và thực hiện toàn bộ file docs/antigravity/PROMPT-04-giao-dien-v2-phong-cach-okx.md trong worktree D:\Claude\crypto-ui."

## 0. Bối cảnh và thứ tự làm
Chủ dự án thấy giao diện v1 **chưa đủ đẹp**. Mục tiêu: trải nghiệm ngang các sàn lớn (OKX, Binance, MEXC), **lấy OKX làm chuẩn tham chiếu chính**, và làm tốt hơn ở độ mượt, độ rõ ràng và sự thân thiện với người mới.

Thứ tự:
1. `git merge main`, rồi sửa mục 1–3 trong `docs/antigravity/REVIEW-01-giao-dien-gd1.md`. Mục 4–9 sửa luôn trong lúc làm lại giao diện.
2. Làm file này (giao diện v2).
3. Sau đó mới làm PROMPT-02 (tính năng GĐ2) và PROMPT-03 (Admin + 2FA), **theo phong cách v2**. Khi hướng dẫn hình ảnh trong PROMPT-01/02/03 khác với file này, **file này thắng**.

Phạm vi vẫn như cũ: chỉ sửa `apps/*` và `packages/ui`. Không sửa `server/` hay `packages/contracts`. Thiếu API thì ghi vào `docs/parts/contract-requests.md`.

## 1. Nguyên tắc pháp lý (bắt buộc)
- **Học bố cục và trải nghiệm**, không sao chép thương hiệu.
  - Không dùng tên, logo, icon riêng, hình minh họa, font độc quyền hay bộ màu nhận diện của OKX/Binance/MEXC.
  - Không chụp lại ảnh của họ để dùng.
- Thương hiệu tạm thời vẫn là **CEX.SPOT**. Tên thật chủ dự án sẽ chọn sau, nên tên và logo phải đổi được ở **một chỗ** (`packages/ui/src/brand.ts`).
- Luôn hiện nhãn **"Mô phỏng"** (tiền ảo) ở header. Đây là yêu cầu khi duyệt app trên store.

## 2. Ngôn ngữ thiết kế v2

### 2.1 Cảm giác chung
Phong cách "bàn làm việc của trader": nền đen tuyền, các khối liền nhau, ngăn cách bằng **đường kẻ 1px** thay vì thẻ (card) nổi có bóng đổ. Số liệu dày đặc nhưng thoáng mắt.

Chỉ dùng màu cho 3 việc: **tăng/giảm**, **hành động chính**, **trạng thái**. Mọi thứ còn lại là thang xám.

### 2.2 Màu (token mới trong `tokens.css`)
| Token | Tối | Sáng | Dùng cho |
|---|---|---|---|
| `--bg` | `#000000` | `#ffffff` | nền trang |
| `--panel` | `#0a0a0b` | `#ffffff` | khối nội dung |
| `--panel-2` | `#141416` | `#f5f5f7` | hover, input, dropdown |
| `--line` | `#1d1e21` | `#ebebef` | đường kẻ 1px |
| `--text` | `#f4f4f5` | `#0a0a0b` | chữ chính |
| `--text-2` | `#a1a1aa` | `#52525b` | nhãn |
| `--text-3` | `#63636b` | `#a1a1aa` | gợi ý, placeholder |
| `--up` | `#1fc27a` | `#12a866` | tăng / mua |
| `--down` | `#f2475f` | `#e0314b` | giảm / bán |
| `--accent` | `#818cf8` | `#5b5bd6` | nhấn thương hiệu (tab đang chọn, focus, link) — dùng **tiết kiệm** |
| `--warn` | `#f5b544` | `#c98a0b` | STALE, cảnh báo |

- Nút hành động chính: **trắng trên nền đen** ở chế độ tối, đen trên nền trắng ở chế độ sáng, bo tròn hoàn toàn (`rounded-full`).
- Nút Mua/Bán dùng `--up`/`--down`.
- Nền nhạt cho thanh độ sâu sổ lệnh: `color-mix(in srgb, var(--up) 12%, transparent)`.
- Giữ tùy chọn **đảo màu tăng/giảm** (`preferences.upColor`), áp dụng bằng cách hoán đổi `--up`/`--down` ở thẻ gốc.

### 2.3 Chữ và số
- Font: **Inter Variable**, tự host qua `@fontsource-variable/inter`, không gọi Google Fonts.
- Mọi con số dùng `font-variant-numeric: tabular-nums`.
- Cỡ chữ: 12 (bảng dày), 13 (mặc định), 14 (form), 16, 20 (giá lớn trên thanh ticker), 28–32 (tổng tài sản).
- Độ đậm chỉ dùng 400/500/600.
- **Số lẻ theo cặp**: giá theo `tickSize`, khối lượng theo `stepSize`; tiền USDT hiển thị 2 số lẻ, tổng tài sản 2 số lẻ.
  - Dùng `stepDecimals()` của `@cex/core`. Không bao giờ hiện 8 số 0 vô nghĩa.
- Số lớn rút gọn: `1,58 T` / `938,9 Tr` (vi) và `1.58B` / `938.9M` (en), dùng cho khối lượng 24h.

### 2.4 Hình khối, chuyển động, icon
- Bo góc: input 8px, dropdown/popover 10px, nút chính `rounded-full`, badge 4px.
- Popover/dropdown: `--panel-2` + viền `--line` + bóng mềm + `backdrop-filter: blur(12px)`.
- Chuyển động 120–180ms `ease-out`, không nảy.
  - Giá nháy màu 400ms khi đổi.
  - Hàng sổ lệnh không giật.
  - Tôn trọng `prefers-reduced-motion`.
- Icon: `lucide-react`, 16px, nét 1.5. Icon coin: SVG trong `apps/exchange/public/coins/` (nguồn giấy phép CC0/MIT, ghi nguồn trong README); thiếu icon thì hiện avatar chữ cái.

## 3. Khung ứng dụng
**Header 56px**, gồm:
- Logo + nhãn "Mô phỏng".
- Menu: Thị trường · Giao dịch ▾ (Spot; sau này thêm Chuyển đổi, Bot) · Tài sản · Tín hiệu (mờ, "Sắp có").
- Bên phải:
  - ô tìm kiếm `Ctrl+K`;
  - chuông thông báo có số chưa đọc (PROMPT-02);
  - nút **Tài sản** (dropdown: tổng tài sản, Nạp ảo, Lịch sử);
  - avatar (dropdown: email, UID rút gọn có nút copy, Cài đặt, Bảo mật, Đăng xuất);
  - nút sáng/tối; ngôn ngữ.

Khi chưa đăng nhập: thay phần tài khoản bằng **Đăng nhập** (nút viền) và **Đăng ký** (nút trắng).

**Command palette `Ctrl+K`** (thư viện `cmdk`): tìm cặp (gõ "eth" → ETH/USDT), nhảy trang, đổi giao diện.

**Toast** góc phải trên cho sự kiện realtime `order`/`trade`:
- "Lệnh mua 0,01 BTC đã khớp 83.120,5".
- Có nút "Xem".
- Gộp các toast liên tiếp.

**Tiêu đề tab** có giá trực tiếp: `83.149,6 · BTC/USDT · CEX.SPOT`.

**Banner** dừng giao dịch, mất kết nối, chưa xác minh email: dải mỏng 32px dưới header, đóng được (trừ dừng giao dịch).

## 4. Trang Giao dịch `/trade/:symbol` — trọng tâm

### 4.1 Hai chế độ (điểm hơn OKX)
Nút chuyển ở thanh ticker, lưu vào localStorage:
- **Chuyên nghiệp** (mặc định trên desktop): bố cục đầy đủ như mục 4.2.
- **Đơn giản** (cho người mới): biểu đồ lớn, ô "Mua/Bán" to, chỉ có Market và Limit, có giải thích ngắn bằng tooltip. Ẩn sổ lệnh, chỉ giữ giá tốt nhất mua/bán.

### 4.2 Bố cục desktop (chế độ Chuyên nghiệp)
```
┌ Thanh ticker ─────────────────────────────────────────────────────────────┐
├ Danh sách cặp ┬ Biểu đồ (tab: Biểu đồ | Thông tin) ┬ Sổ lệnh | GD gần đây ┬ Form lệnh ┤
│ (thu gọn được)│                                    │                      │           │
│               │                                    │                      ├ Tài sản   ┤
├───────────────┴────────────────────────────────────┴──────────────────────┴───────────┤
│ Lệnh đang chờ (n) | Lịch sử lệnh | Lịch sử khớp | Tài sản      [☐ Ẩn cặp khác] [Hủy tất cả] │
└───────────────────────────────────────────────────────────────────────────────────────┘
```
- **≥ 1440px**: 4 cột như hình.
- **1280px**: ẩn danh sách cặp (mở bằng dropdown ở tên cặp).
- **1024px**: biểu đồ và sổ lệnh thu hẹp, form giữ 320px.
- Kéo đổi kích thước bằng `react-resizable-panels`, lưu bố cục, có nút "Đặt lại bố cục".

### 4.3 Thanh ticker
- Icon coin, `BTC/USDT`, nút ▾ mở bảng chọn cặp, sao ★ yêu thích (dùng `preferences.favorites`).
- **Giá lớn** đổi màu theo tick gần nhất, mũi tên ↑↓.
- Thay đổi 24h (số và %).
- Các ô 24h: Cao · Thấp · KL (BTC) · KL (USDT).
- Badge trạng thái: LIVE / STALE / Tạm ngưng.
- Nút chuyển chế độ Đơn giản/Chuyên nghiệp.

**Bảng chọn cặp** (dropdown 420px):
- ô tìm kiếm;
- tab: ★ Yêu thích · USDT · Tăng mạnh · Giảm mạnh · các nhóm ngành (`exchangeInfo().assets[].tags`);
- cột Cặp | Giá | 24h%, sắp xếp được;
- phím ↑↓ Enter để chọn.

### 4.4 Biểu đồ
Thay canvas tự vẽ bằng **TradingView Lightweight Charts v5** (`lightweight-charts`, Apache-2.0). Giữ logo ghi công mặc định của TradingView, đúng điều khoản giấy phép.

- **Thanh công cụ:**
  - khung thời gian 1m 5m 15m 1h 4h 1D; ghim được khung hay dùng;
  - loại biểu đồ nến / đường / vùng;
  - menu **Chỉ báo**: MA, EMA, BOLL, VOL, RSI, MACD (tính bằng `Dec`/số thực chỉ để vẽ — vẽ thì dùng số thực được, nhưng không dùng để tính tiền);
  - toàn màn hình; chụp ảnh biểu đồ.
- **Chú thích góc trái:** O H L C, Thay đổi, Biên độ; dòng MA(5/10/20) có màu.
- **Khung khối lượng** phía dưới, màu theo nến.
- **Nhãn giá hiện tại** bên phải, kèm **đếm ngược đến lúc đóng nến** (vd `04:21`).
- **Đánh dấu đỉnh/đáy** trong vùng nhìn thấy (`← 80.400,0`).
- **Đường lệnh đang chờ**: mỗi lệnh Limit/Stop của người dùng là một đường ngang có nhãn "Mua 0,01 @ 80.000" và nút ✕ hủy.
  - Kéo để sửa giá thì để sau.
  - Đường entry/TP/SL thuộc PROMPT-02.
- **Tab "Thông tin"**: tên coin, nhóm ngành, mô tả ngắn, quy tắc giao dịch (tickSize, stepSize, minNotional, phí) — từ `exchangeInfo` (tên/nhóm/mô tả ở `assets`; `description: null` thì ẩn).
- Cập nhật realtime nến đang chạy; đổi khung không nháy trắng; nhớ khung đã chọn (`preferences.defaultInterval`).

### 4.5 Sổ lệnh và giao dịch gần đây
- **Tab:** Sổ lệnh | Giao dịch gần đây.
- **Nút chế độ:** cả hai / chỉ bán / chỉ mua.
- **Bộ gom giá:** `tickSize` ×1, ×10, ×100, ×1000.
  - Gom phía client: giá mua làm tròn xuống, giá bán làm tròn lên theo bước, bằng `Dec`.
  - Gom ở mức thô (×100, ×1000): gọi thêm `depth({ query: { limit: 200 } })` mỗi 2–3 giây để đủ hàng (hợp đồng 0.4).
- **Cột:** Giá | Khối lượng | Tổng (cộng dồn). Thanh độ sâu từ phải sang, theo tổng cộng dồn.
- **Giá giữa** cỡ 18px có màu + mũi tên; click vào thì điền giá vào form.
- **Hover một hàng:** tô vùng từ giá tốt nhất đến hàng đó, hiện tooltip **Giá TB · Tổng BTC · Tổng USDT** (tính bằng `Dec`).
- **Thanh tỷ lệ cuối khối:** `M 32,1% ▕████░░░░▏ 67,9% B`, tính từ tổng khối lượng 20 mức.
- **Hiệu năng:** gộp cập nhật realtime theo `requestAnimationFrame` (tối đa ~10 lần/giây); hàng có `key` theo giá, không render lại toàn bộ.
- **Giao dịch gần đây:** Giá (màu theo bên chủ động) | Khối lượng | Giờ (HH:mm:ss, GMT+7).

### 4.6 Form lệnh (cột phải, 320px)
- **Nút Mua/Bán** dạng segmented, lấp màu `--up`/`--down`.
- **Loại lệnh:** Giới hạn | Thị trường | ▾ (Stop-Limit, OCO, Trailing… thuộc PROMPT-02).
- **Ô Giá:**
  - nút −/+ theo `tickSize`;
  - nút nhỏ **"Mới nhất"** điền giá hiện tại;
  - không cho nhập quá số lẻ của tickSize.
- **Ô Khối lượng:** đơn vị BTC, chuyển được sang "Tổng (USDT)" như OKX. Hai ô **Khối lượng** và **Tổng** liên động hai chiều, tính bằng `Dec`, làm tròn xuống theo `stepSize`.
- **Thanh trượt 0–100%** có 5 mốc, kéo hiện % nổi, tính theo `available` (`floorToStep`).
- **Dòng thông tin:** Khả dụng `7.500,83 USDT` [+ Nạp ảo] · Mua tối đa `0,09001 BTC` · Phí ước tính.
- **Checkbox TP/SL** (PROMPT-02).
- **Nút lớn** `Mua BTC` / `Bán BTC`.
  - Chưa đăng nhập: hai nút Đăng nhập | Đăng ký.
  - Chưa xác minh / dừng giao dịch / STALE: nút xám kèm lý do.
- **Hộp xác nhận** trước khi đặt nếu `preferences.confirmOrders`, có ô "Không hỏi lại".
- **Số dư cập nhật realtime** (sự kiện `balance` trên kênh `user`) — REVIEW-01 mục 3.
- **Khối Tài sản** dưới form: số dư khả dụng/khóa của coin gốc và USDT, nút Nạp ảo.

### 4.7 Khối dưới
- **Tab có số đếm:** Lệnh đang chờ (n) | Lịch sử lệnh | Lịch sử khớp | Tài sản.
- **Checkbox "Ẩn các cặp khác"**, nút **Hủy tất cả** (có xác nhận).
- **Bảng:** cột cố định, hàng 36px, hover sáng nhẹ, số canh phải, thời gian `09/10 19:07:59`.
- Lịch sử có bộ lọc 7 ngày / 30 ngày / 3 tháng và nút **Xuất CSV** (endpoint `exportOrders`/`exportTrades` đã có).

## 5. Điện thoại (< 768px) — theo kiểu app sàn
- **Bottom nav 5 mục:** Trang chủ · Thị trường · **Giao dịch** · Tài sản · Tài khoản.
- **Trang Giao dịch:**
  - **Header:** cặp + % 24h, nút ▾ mở bottom sheet chọn cặp; icon biểu đồ bật/tắt khung biểu đồ thu gọn (240px).
  - **Thân trang chia 2 cột:** trái **55% form lệnh** gọn, phải **45% sổ lệnh** (7 mức bán – giá giữa – 7 mức mua). Đây là bố cục kiểu app OKX/Binance, **thay cho dải tab xếp dọc của v1**.
  - **Dưới:** lệnh đang chờ dạng thẻ, vuốt trái để hủy.
  - Không có nút Mua/Bán dính đáy (đã có trong form).
- Bottom sheet cho chọn cặp, loại lệnh, xác nhận lệnh.
- Vùng chạm tối thiểu 40px. Không cuộn ngang ở 360px.

## 6. Trang Thị trường `/markets`
- **Hàng thẻ trên cùng (4 thẻ):**
  - Nổi bật (khối lượng lớn nhất);
  - Tăng mạnh nhất;
  - Giảm mạnh nhất;
  - Tổng quan sàn: số cặp, tổng KL 24h, trạng thái nguồn giá.

  Mỗi thẻ có 3 dòng: icon, cặp, giá, %.
- **Tab:** ★ Yêu thích · Tất cả · Tăng mạnh · Giảm mạnh · Khối lượng · các nhóm ngành (chip theo `ASSET_TAG_LABELS`: Layer 1, Meme, AI, DeFi…).
- **Bảng:**
  - ★ | Coin (icon + `BTC` + tên đầy đủ "Bitcoin") | Giá | 24h% (pill màu) | **Sparkline 24h** | **Biên độ 24h** (thanh Thấp—Cao có vạch giá hiện tại) | KL 24h | **[Giao dịch]**;
  - sắp xếp mọi cột; header dính.
- Cặp tạm ngưng: hàng mờ. Cặp STALE: badge vàng. UNAVAILABLE: `—`.
- Sparkline: `sparklines()`; cặp `UNAVAILABLE` để ô trống, không vẽ dữ liệu giả.

## 7. Trang chủ `/` (mới)
- **Chưa đăng nhập:**
  - hero "Luyện giao dịch Spot với giá thật — không mất tiền thật" + nút Đăng ký;
  - bảng 6 cặp nổi bật có giá chạy realtime;
  - 3 bước: Nhận 10.000 USDT ảo → Đặt lệnh như sàn thật → Theo dõi lãi lỗ.
- **Đã đăng nhập:**
  - thẻ tổng tài sản (ẩn/hiện số bằng icon 👁, lưu localStorage) + lãi lỗ hôm nay (từ `portfolio`, PROMPT-02);
  - nút nhanh: Nạp ảo · Giao dịch · Lịch sử;
  - danh sách yêu thích; top tăng/giảm;
  - khung thông báo của sàn (`announcements()`).

## 8. Trang Tài sản `/assets` (thay `/wallet`, giữ redirect)
- **Tổng quan:**
  - tổng tài sản (USDT) cỡ 32px;
  - nút ẩn số;
  - lãi lỗ hôm nay;
  - **biểu đồ tài sản 7N/30N** (`portfolioHistory`);
  - **biểu đồ tròn phân bổ**.
- **Bảng tài sản:**
  - tìm kiếm; checkbox "Ẩn số dư nhỏ (< 1 USDT)";
  - cột: Coin | Tổng | Khả dụng | Đang khóa | Giá trị USDT | Giá vốn TB / Lãi lỗ (PROMPT-02) | [Giao dịch].
- **Tab Lịch sử** (sổ cái): bộ lọc loại, coin, thời gian; Xuất CSV.
- **Khối Nạp ảo:**
  - thanh tiến độ trần 100.000;
  - đếm ngược dạng `23:59:57` (REVIEW-01 mục 4).

## 9. Đăng nhập / Đăng ký / Cài đặt
- **Đăng nhập, đăng ký:** bố cục 2 cột trên desktop — trái là form; phải là khung xem trước thị trường (giá chạy realtime, mini chart) + nhãn "Mô phỏng". Điện thoại chỉ hiện form.
  - Thêm hiện/ẩn mật khẩu.
  - Thanh độ mạnh mật khẩu.
  - Bước nhập mã 2FA 6 ô (PROMPT-03).
- **Cài đặt** dạng menu trái + nội dung phải: Hồ sơ · Bảo mật (mật khẩu, 2FA, phiên đăng nhập) · Tùy chọn (giao diện, màu tăng/giảm, ngôn ngữ, khung mặc định, xác nhận lệnh) · Thông báo.
  - Lưu tùy chọn vào **server** (`getPreferences`/`updatePreferences`), không chỉ localStorage, để đồng bộ giữa máy.

## 10. Chất lượng (điều kiện nghiệm thu)
1. Tách bundle: biểu đồ và trang Admin tải lười. Bundle đầu ≤ 250 KB gzip.
2. Không layout shift khi tải: skeleton đúng hình khối.
3. Sổ lệnh và ticker cập nhật mượt; DevTools Performance không có task > 50ms khi chạy 1 phút.
4. Sáng/tối đồng đều mọi trang. Tương phản chữ ≥ 4.5:1 (WCAG AA).
5. Bàn phím: Tab đi hết form lệnh; `Ctrl+K`; `Esc` đóng popup.
6. Không dữ liệu giả ngoài chế độ mock. Thiếu dữ liệu thì hiện `—` hoặc ẩn khối.
7. typecheck, test, build đều đạt; test cho: gom giá sổ lệnh, liên động Khối lượng ↔ Tổng, thanh trượt %, format số lẻ theo cặp.
8. Báo cáo `docs/reports/2026-10-xx-ui-v2.md`, kèm ảnh chụp ở 1440 / 1280 / 1024 / 390px, cả sáng và tối, lưu ở `docs/reports/ui-v2/`.

## 11. Mốc gợi ý
1. Token v2 + font + icon + trang trưng bày `/__ui` cập nhật.
2. Header, command palette, toast, tiêu đề tab.
3. Trang Giao dịch desktop (biểu đồ Lightweight Charts, sổ lệnh mới, form mới, khối dưới).
4. Trang Giao dịch điện thoại + chế độ Đơn giản.
5. Thị trường, Trang chủ, Tài sản.
6. Đăng nhập/Đăng ký, Cài đặt, nghiệm thu, báo cáo.

## 12. Dữ liệu mới từ backend — hợp đồng 0.4.0 (✅ đã có trên `main`)
Chạy `git merge main` rồi đọc `packages/contracts/CHANGELOG.md` (mục 0.4.0) và README mục 7. Tóm tắt:

| Cần cho | Dùng |
|---|---|
| Tên đầy đủ + nhóm ngành coin | `exchangeInfo().assets` (`name`, `tags`, `description`) + `ASSET_TAG_LABELS` |
| Sparkline 24h / 7 ngày | `sparklines({ query: { range } })` |
| Gom giá thô, biểu đồ độ sâu | `depth({ query: { limit: 200 } })` (tới 500 mức) |
| Banner dừng giao dịch, cặp tạm ngưng | kênh realtime `exchange:status` (bỏ việc gọi lại `exchangeInfo` 30 giây) |
| Thông báo trang chủ | `announcements()` |
| 50 cặp giao dịch | đã có trong `exchangeInfo` và mock |

**Mock đã có đủ các phần trên.** Mock giờ từ chối request sai hợp đồng (`VALIDATION_ERROR`) giống server thật.

**Bổ sung cho PROMPT-03 (app Admin):** thêm 2 màn hình (chi tiết ở README mục 7):
- **Thông báo**: danh sách gồm bản nháp; tạo/sửa; nút Đăng, Ghim, Ẩn; ngày hết hạn.
- **Thông tin coin**: sửa tên, nhóm ngành (tối đa 5), mô tả, có lý do.

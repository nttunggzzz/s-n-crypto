# PROMPT-06 — Giao diện Bot (lưới, mua định kỳ), Phân tích lãi lỗ, Hồ sơ + Bảo mật

> Dán cho Antigravity **sau khi xong PROMPT-04 và PROMPT-05**: "Chạy `git merge main`, rồi đọc và thực hiện toàn bộ file docs/antigravity/PROMPT-06-giao-dien-bot-lai-lo-bao-mat.md trong worktree D:\Claude\crypto-ui."

> **Nghiệm thu (thêm 2026-10-10):** `npm run e2e` — test `e2e/tests/bots.spec.ts` (bot lưới: tạo → badge lệnh bot → dừng và bán; mua định kỳ: tạo → tạm dừng → hủy) phải xanh.
> Gắn `data-testid` theo [TESTIDS.md](TESTIDS.md). Route: `/bots` (nhận `?symbol=BTCUSDT`). Lịch sử dùng `createPager` của `@cex/contracts`.

## 0. Bối cảnh
- **Backend đã xong** (hợp đồng API 0.6.0). Đọc trước khi làm:
  - `packages/contracts/CHANGELOG.md` mục 0.6.0;
  - `packages/contracts/README.md` mục 9 (cách hiển thị từng màn).
- **Mock đủ cả 16 endpoint mới và sự kiện realtime** (`dcaPlan`, `gridBot` trên kênh `user`), nên làm được toàn bộ mà không cần server.
  - Mock không mô phỏng lưới khớp lệnh (lãi lưới luôn 0). Muốn xem số khác 0 thì chạy server thật: `npm run dev`.
- **Phong cách:** theo PROMPT-04 (token v2, nền đen, kiểu OKX). Dùng lại bảng, thẻ, tab, modal, toast đã có.
- **Phạm vi:** chỉ sửa `apps/*` và `packages/ui`. Thiếu API thì ghi vào `docs/parts/contract-requests.md`.
- **Tiền:** mọi phép tính dùng `@cex/core` (Dec). `parseFloat` chỉ được dùng để vẽ biểu đồ.

## 1. Điều hướng
- Menu **Giao dịch ▾**: Spot · Futures · **Bot giao dịch**.
- Route `/bots`, tab **Bot lưới | Mua định kỳ**. Mỗi tab có 2 phần: "Đang chạy" và "Lịch sử".
- Trang Tài sản thêm nút **Phân tích** → `/assets/analysis`.
- Menu avatar (góc phải) hiện avatar + tên + **UID** và các mục: Tổng quan tài khoản · Bảo mật · Phân tích lãi lỗ · Bot của tôi · Đăng xuất.

## 2. Badge lệnh của bot (sửa các bảng lệnh đã có)
Trong mọi bảng lệnh Spot (lệnh đang chờ, lịch sử lệnh, lịch sử giao dịch, trang `/orders`):
- `source === 'GRID'` → badge **"Bot lưới"**, bấm vào mở `/bots?grid=<sourceId>`.
- `source === 'DCA'` → badge **"Mua định kỳ"**.
- Lệnh có `source !== 'USER'`: **ẩn nút Hủy**. Thay bằng tooltip "Dừng bot để hủy lệnh này".
- Nút "Hủy tất cả" chỉ hủy lệnh của người dùng: đổi nhãn thành "Hủy tất cả (trừ lệnh bot)" khi đang có lệnh bot.
- `closeReason === 'BOT_STOPPED'` → hiển thị "Bot đã dừng".

## 3. Bot lưới Spot

### 3.1 Form tạo (cột phải ở desktop, bottom sheet ở điện thoại)
- **Ô nhập:**
  - Cặp: chọn từ 50 cặp, có ô tìm kiếm.
  - Giá thấp / Giá cao: kèm nút "Gợi ý" = giá hiện tại ±10%, làm tròn theo `tickSize`.
  - Số lưới: 2–100, có slider.
  - Kiểu: Số học / Hình học (tooltip giải thích ngắn).
  - Vốn đầu tư (USDT): thanh 0–100% theo số dư USDT khả dụng.
- **Xem trước** (`gridBotPreview`, debounce khoảng 400 ms, hủy request cũ khi người dùng gõ tiếp):
  - Lãi mỗi lưới `profitPerGridMin`–`profitPerGridMax`, hiển thị dạng % (×100, 2 chữ số).
  - Số lệnh mua / bán; khối lượng mỗi lưới; lượng coin mua ngay lúc bắt đầu (`initialBuyQuantity`).
  - Vốn tối thiểu (`minInvestment`).
- **Lỗi `INVALID_GRID`:** hiện ngay dưới ô liên quan. Nếu có `details.minInvestment` thì hiện "Vốn tối thiểu …" và nút "Dùng mức này".
- **Biểu đồ** của cặp đang chọn: vẽ các mức `levels` thành đường ngang mờ. Mức dưới giá hiện tại màu xanh (lệnh mua), mức trên màu đỏ (lệnh bán).
- **Nút "Tạo bot":** mở modal xác nhận tóm tắt thông số và dòng "Bot sẽ mua ngay … coin bằng lệnh Market". Xác nhận → `createGridBot`.

### 3.2 Thẻ bot đang chạy
- **Thông tin:** cặp, khoảng giá, số lưới, kiểu, thời gian chạy (tính từ `createdAt`).
- **Số liệu:**
  - **Tổng lãi lỗ** `totalPnl` và % theo `investment`. Ngay sau khi tạo, con số này hơi âm vì phí mua ban đầu — đó là đúng, không phải lỗi.
  - **Lãi lưới** `gridProfit`; **Số vòng** `completedRounds`.
  - Đang giữ `baseHeld` coin + `quoteHeld` USDT; số lệnh mở.
- `totalValue === null` (giá không LIVE) → hiện `—`.
- **Nút:**
  - "Chi tiết" mở drawer gồm lệnh của bot (`gridBotOrders`) và biểu đồ có các mức lưới.
  - "Dừng" mở modal "Dừng bot lưới" với lựa chọn: **Bán coin bot đang giữ** (`sellBase: true`) hoặc **Giữ coin trong ví**.
- **Realtime:** sự kiện `gridBot` → cập nhật thẻ, không gọi lại API.

### 3.3 Lịch sử
- Bot `STOPPED` / `ERROR` hiển thị kết quả cuối `totalPnl` / `totalValue` (server giữ giá trị lúc dừng), lãi lưới, số vòng, thời gian chạy (`createdAt` → `stoppedAt`).
- `stopReason` hiển thị bằng tiếng Việt:
  - `USER`: Bạn đã dừng
  - `ADMIN`: Quản trị viên dừng
  - `ORDER_CANCELED`: Lệnh của bot bị hủy
  - `SYMBOL_REMOVED`: Cặp đã ngừng giao dịch
  - Mã lỗi khác: dịch theo bảng mã lỗi chung.

## 4. Mua định kỳ (DCA)
- **Form:**
  - Cặp; số USDT mỗi kỳ.
  - Tần suất: Hằng ngày / Hằng tuần (chọn thứ 2…CN → `dayOfWeek` 1…7) / Hằng tháng (ngày 1–28).
  - Giờ: 0–23, ghi rõ "giờ Việt Nam".
  - Dòng "Lần mua đầu tiên: …" — sau khi tạo thì lấy `nextRunAt` từ server.
- **Thẻ kế hoạch:**
  - Cặp, số tiền mỗi kỳ, tần suất dạng câu (ví dụ "Thứ Hai hằng tuần, 09:00").
  - Đã đầu tư `totalSpent`, đã mua `totalBought`, giá trung bình `avgPrice`.
  - **Lãi lỗ tạm tính** = `totalBought` × giá hiện tại − `totalSpent`, tính bằng Dec trên UI.
  - Số kỳ đã chạy / bỏ qua.
- **Nút:**
  - Tạm dừng / Tiếp tục (`updateDcaPlan` với `status`).
  - Sửa số tiền (`updateDcaPlan` với `quoteAmount`).
  - Hủy (`cancelDcaPlan`, có xác nhận).
- **Lịch sử kỳ** (`dcaRuns`, phân trang theo cursor): thời điểm, trạng thái **Đã mua** / **Bỏ qua**, số tiền, giá, lượng mua.
  - Kỳ bỏ qua hiện lý do theo bảng mã lỗi. Ví dụ `INSUFFICIENT_BALANCE` → "Không đủ USDT".
- Ghi chú nhỏ dưới form: "Nếu sàn tạm dừng đúng giờ mua, kỳ đó được bỏ qua và không mua bù."

## 5. Phân tích lãi lỗ `/assets/analysis`
- **Bộ chọn khoảng:** 7 ngày · 30 ngày · 90 ngày · Tất cả → `pnlAnalysis({ query: { range } })`.
- **Hàng thẻ:**
  - Lãi lỗ đã chốt (tổng, kèm Spot / Futures nhỏ bên dưới).
  - Tỷ lệ thắng (`trades.winRate` × 100 %, kèm "x thắng / y thua").
  - Profit factor.
  - Sụt giảm tối đa (`maxDrawdown` × 100 %).
  - Phí + funding Futures.
- **Biểu đồ:** cột theo ngày (xanh dương lãi / đỏ lỗ, theo tùy chọn màu tăng/giảm) và đường cộng dồn `cumulative` trên trục phụ.
- **Lịch PnL kiểu OKX:** lưới tháng, mỗi ô là một ngày, tô màu đậm nhạt theo `total` của ngày đó; di chuột (hoặc chạm trên điện thoại) hiện số.
- **Bảng theo cặp** (`bySymbol`): Thị trường (Spot / Futures), Cặp, Lãi lỗ, Số lệnh, Thắng. Sắp xếp được.
- **Không có dữ liệu:** trạng thái trống có nút "Giao dịch ngay". Giá trị `null` hiện `—`, không hiện 0.
- Ghi chú nhỏ: "Chỉ tính lãi lỗ đã chốt; vị thế đang mở xem ở Tài sản."

## 6. Hồ sơ + Bảo mật (thay phần Cài đặt › Hồ sơ / Bảo mật của PROMPT-04 mục 9)

### 6.1 Tổng quan tài khoản
- Avatar lớn: 12 avatar theo `AvatarId`. Bạn tự vẽ bộ icon đồng bộ (SVG, phong cách tối giản), **không dùng hình có bản quyền**. `null` → chữ cái đầu của tên.
- Tên hiển thị (sửa tại chỗ) → `updateProfile`.
- **UID** `me.uid` + nút sao chép (toast "Đã sao chép UID").
- Email (che một phần) + trạng thái xác minh.

### 6.2 Bảo mật (`securityOverview`)
- **Thanh "Mức độ bảo mật":** Thấp / Trung bình / Cao, tính từ 2FA, mã chống lừa đảo và email đã xác minh.
- **Các thẻ, mỗi thẻ có trạng thái và nút:**
  - **Xác thực 2 bước** (luồng đã có).
  - **Mã chống lừa đảo:**
    - Hiện mã đã che hoặc "Chưa đặt".
    - Modal đặt / đổi / xóa: ô mã 4–20 chữ/số, mật khẩu, và ô 2FA khi `twoFactorEnabled`.
    - Giải thích: "Mã này xuất hiện ở đầu mọi email thật từ sàn. Email không có mã = giả mạo."
  - **Mật khẩu:** "Đổi lần cuối: …" (`passwordChangedAt`, `null` → "Chưa đổi").
  - **Phiên đăng nhập:** số phiên đang mở + nút đăng xuất các thiết bị khác (đã có).
- **Lịch sử đăng nhập** (`loginHistory`, phân trang):
  - Cột: thời gian, thiết bị, IP, kết quả.
  - `result`: OK = Thành công, BAD_PASSWORD = Sai mật khẩu, BAD_2FA = Sai mã 2FA, LOCKED = Tạm khóa.
  - Dòng `newDevice` có nhãn "Thiết bị mới". Dòng thất bại tô đỏ nhạt.

## 7. Thông báo và toast
| Thông báo | Toast / nội dung |
|---|---|
| `NEW_DEVICE_LOGIN` | Vàng, không tự tắt: "Đăng nhập từ thiết bị mới: Safari · iOS (IP …). Không phải bạn? Đổi mật khẩu ngay" + nút tới Bảo mật |
| `DCA_EXECUTED` | "Mua định kỳ: đã mua 0,00999 ETH giá 2.494,20 (24,94 USDT)" |
| `DCA_SKIPPED` | "Mua định kỳ ETHUSDT bị bỏ qua: Không đủ USDT" |
| `GRID_BOT_STOPPED` | "Bot lưới BTCUSDT đã dừng (lý do …), lãi lưới +x USDT" |

## 8. Nghiệm thu
1. **Dùng mock, chạy trọn các vòng:**
   - tạo bot lưới → thấy lệnh có badge "Bot lưới" và không có nút Hủy → dừng có bán → thẻ chuyển sang Lịch sử, vẫn có kết quả cuối;
   - tạo DCA hằng tuần → tạm dừng → tiếp tục → hủy;
   - trang Phân tích với cả 4 khoảng thời gian;
   - đặt mã chống lừa đảo → lịch sử đăng nhập.
2. **Chạy với server thật** (`npm run dev`), tài khoản test trên localhost:
   - tạo bot lưới BTC khoảng ±1,5%, 10 lưới, 2.000 USDT;
   - lãi lỗ ngay sau khi tạo khoảng −1 USDT (phí mua ban đầu);
   - dừng có bán thì khoảng −2 USDT.
3. `npm run verify` xanh. Mọi chuỗi hiển thị bằng tiếng Việt, số theo định dạng `vi-VN`.
4. Báo cáo `docs/reports/2026-10-xx-ui-gd26.md` kèm ảnh chụp desktop và điện thoại của: Bot lưới (tạo + thẻ), DCA, Phân tích, Bảo mật.

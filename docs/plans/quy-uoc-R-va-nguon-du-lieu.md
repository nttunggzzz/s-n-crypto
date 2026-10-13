# Quy ước R chung và tách nguồn dữ liệu (Module A ↔ Module C)

Lập 2026-10-13. Ràng buộc cho mọi đợt của [Module A](module-A-nhat-ky-giao-dich.md) và [Module C](module-C-engine-tin-hieu.md).
Sub-agent đọc file này trước khi viết bất kỳ phép tính R, thống kê hay chấm kết quả nào.

## 1. Một định nghĩa R cho cả hai module

```
R = lãi/lỗ ròng ÷ rủi ro dự kiến

rủi ro dự kiến = |giá vào − dừng lỗ ban đầu| × khối lượng vào     (chỉ rủi ro giá, KHÔNG cộng phí)
lãi/lỗ ròng    = lãi/lỗ theo giá − mọi phí − trượt giá − funding   (phí và chi phí nằm ở TỬ SỐ)
```

- **Giá vào:** giá vào trung bình đã thực hiện, trước phí. Nhiều lần vào thì dùng trung bình theo khối lượng.
- **Dừng lỗ ban đầu:** lần đặt dừng lỗ đầu tiên của mục/tín hiệu. Dời dừng lỗ về sau **không** làm đổi mẫu số. Nếu cho phép dời, R sẽ đẹp giả tạo: thua lỗ bị chia cho một rủi ro lớn hơn.
- **Không có dừng lỗ ban đầu thì R = `null`.** Vẫn tính lãi/lỗ USDT, không đoán rủi ro (A-D4).
- **Hướng SHORT:** đảo dấu tử số. Mẫu số luôn dương.
- **Kết quả:** `WIN` khi R > 0 (hoặc lãi/lỗ ròng > 0 khi R `null`), `LOSS` khi < 0, `BREAKEVEN` khi = 0 sau khi làm tròn 8 chữ số.

### Hàm chung
`packages/core/src/rMetrics.ts`, viết ở đợt **A1**. Đây là hàm thuần, chỉ dùng `Dec`, và là nơi duy nhất được tính R.
- `riskAmount({ entryPrice, stopPrice, quantity })` trả về `Dec | null`.
- `rMultiple({ netPnl, risk })` trả về `Dec | null`.
- `summarizeR(series: { closedAt, r, netPnl }[])` trả về:
  - các chỉ số chính: count, win rate, avg/expectancy R, profit factor (R và USDT), max drawdown (R và USDT);
  - chuỗi thắng/thua dài nhất và đường R lũy kế;
  - với n = 0, mọi chỉ số là `null`.
- `blockBootstrapRatioCI(days, { blockDays, iterations, seed, level })`: thêm ở đợt **C3**, chỉ Module C dùng (phương pháp ở Module C mục 3.3.1).

### 1.1 Yêu cầu chung cho `rMetrics` (viết ở A1, Module C dùng ở C3)
- **Đường R lũy kế bắt đầu từ 0:** `C_0 = 0`, `C_k = Σ_{i≤k} r_i`; drawdown `DD = max_k (max_{j≤k} C_j − C_k)`, cùng cách cho USDT. Chuỗi bắt đầu bằng thua có DD tính từ 0.
- **Thứ tự do người gọi quyết định**, bằng khóa `(thời điểm đóng, id)`:
  - nhật ký: `(closed_at, entry id)`;
  - tín hiệu: `(exited_at, signal id)`.

  `summarizeR` kiểm đầu vào đã sắp xếp; chưa sắp thì ném lỗi, không tự sắp lại.
- **Chỉ `Dec`.** Kết quả là chuỗi. n = 0 → `null`.
- **Phiên bản phương pháp:** `R_METRICS_VERSION` (bắt đầu = 1) in kèm mọi kết quả. Đổi công thức → tăng số, ghi CHANGELOG hợp đồng.
- Bootstrap và cổng M3 **không** nằm trong A1. Chúng thêm ở C3 theo Module C mục 3.3.1, có phiên bản riêng `GATE_METHOD_VERSION`.

Module A (`journalStats.ts`) và Module C (`signalStats.ts`) **gọi** các hàm này, **không** tự viết lại công thức.
Test vàng của `rMetrics` là chuẩn chung. Sửa công thức R thì phải sửa ở đây, đồng thời đổi phiên bản hợp đồng và ghi CHANGELOG.

## 2. Ba nguồn dữ liệu, không bao giờ trộn

| Nguồn | Mô tả | Giá/khối lượng lấy từ | Phí, trượt giá | Lưu ở | Thống kê ở |
|---|---|---|---|---|---|
| `ACTUAL_FILLS` | Giao dịch của người dùng thật | Bảng `trades` / `futures_trades` của chính người đó | Phí thật đã trừ trong sổ cái; trượt giá đã nằm trong giá khớp; funding thật | `journal_*` | `journalStats` (chỉ người đó xem) |
| `MODELED_CANDLES` | Engine tín hiệu, chấm điểm theo nến | Nến 1m đã đóng + mô hình khớp ở Module C mục 3.2 | Phí theo biểu phí lúc ra tín hiệu + `slippageBps` giả định | `signals` | `adminSignalStats`, cổng M3 |
| `BOT_FILLS` | Bot tín hiệu chạy trên sàn ảo (C5) | Lệnh thật của tài khoản `is_bot` qua `OrderService` | Phí thật, trượt giá thật | `orders`/`trades` của tài khoản bot, liên kết bằng `sourceId = signalId` | Mục "Bot" trong Admin, tiêu chí 6 của cổng |

**Luật bắt buộc** (reviewer kiểm từng luật):
1. Mỗi phản hồi thống kê có trường `basis` (`ACTUAL_FILLS` | `MODELED_CANDLES` | `BOT_FILLS`). Một phản hồi chỉ có **một** basis.
2. Nhật ký không bao giờ đọc bảng `signals`. Engine tín hiệu không bao giờ đọc bảng `journal_*`.
3. Tài khoản `is_bot` và lệnh có `source ≠ 'USER'` (GRID, DCA, SIGNAL) **không bao giờ** vào nhật ký.
4. Cổng M3 tính từ `MODELED_CANDLES` của **một** phiên bản engine, chỉ trên dữ liệu chạy thật, không dùng backtest.
   `BOT_FILLS` chỉ dùng để **so dấu** (tiêu chí 6), **không** cộng gộp vào chuỗi R của cổng.
5. Kết quả backtest (C4) chỉ nằm trong báo cáo và file JSON. Không ghi vào bảng `signals`, không xuất hiện trong thống kê của Admin.
6. Giả định thực thi của Module C là tham số của phiên bản engine (`feeModel`, `slippageBps`, `fillRule`), lưu cùng **mỗi** tín hiệu.
   Nhật ký **không** áp giả định nào: chỉ dùng số đã khớp thật.
7. Ở giai đoạn 6 nếu có người dùng giao dịch theo tín hiệu: lệnh của họ vào nhật ký như mọi lệnh `USER` (basis `ACTUAL_FILLS`), **không** cộng vào thống kê tín hiệu.
   Liên kết "mục này theo tín hiệu X" (nếu làm) chỉ là nhãn, không đổi cách tính.

## 3. Kiểm tra tự động (đưa vào test)
- `rMetrics.test.ts`: cùng một bộ số cho ra cùng R, dù gọi từ nhật ký hay từ tín hiệu (test dùng cả hai đường gọi).
- `journal.test.ts`: lệnh GRID/DCA/SIGNAL và lệnh của tài khoản bot không tạo mục nhật ký.
- `signals.test.ts`: thống kê tín hiệu không đổi khi có thêm mục nhật ký hoặc lệnh bot. Cổng M3 bỏ qua tín hiệu của phiên bản khác.
- Kiểm tra cấu trúc (reviewer chạy): `grep` không thấy `modules/journal` import từ `modules/signals`/`modules/analysis`, và ngược lại.

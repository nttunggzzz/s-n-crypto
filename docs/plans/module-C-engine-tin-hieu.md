# Module C — Engine tín hiệu (Giai đoạn 4 → cổng M3)

Đọc trước:
- [README](README.md) (đội ngũ, quy trình, quyết định C-D0…C-D6);
- **[Quy ước R và tách nguồn dữ liệu](quy-uoc-R-va-nguon-du-lieu.md)** (bắt buộc);
- `docs/parts/P06-engine-tin-hieu.md`, `P09-ui-admin.md` ("Giai đoạn 4");
- `docs/architecture/crypto-trading-agents.md`;
- skill `crypto-multi-agent-analysis`.

## 1. Mục tiêu và nguyên tắc
Tạo tín hiệu **LONG/SHORT có giá vào, dừng lỗ, chốt lời** từ hệ phân tích đa tác tử. Lưu **từng tín hiệu kèm phiên bản engine và toàn bộ đầu vào**.
**Chấm kết quả bằng dữ liệu chạy thật** (thêm bot vào lệnh trên sàn ảo), báo cáo trong Admin. Đây là công cụ **nội bộ cho Admin**.
Người dùng **chưa thấy gì** cho tới khi đủ cả hai điều kiện (C-D1):
1. qua **cổng M3** (mục 3.3);
2. có **phê duyệt phát hành riêng** (mục 3.4).

Nguyên tắc không đổi:
1. **Không nhìn trước tương lai:** quyết định lúc nến đóng `t` chỉ dùng dữ liệu có thời điểm ≤ `t`. Vào lệnh từ nến **sau**. Nến chạm cả TP lẫn SL → tính **SL**.
2. **Chỉ tin số liệu chạy thật** cho cổng M3. Backtest chỉ để loại cấu hình tệ.
3. **Đổi tham số = phiên bản engine mới**, đếm lại từ 0. Không chỉnh tham số theo kết quả đang đo.
4. **Không giấu tín hiệu thua**, không xóa tín hiệu. Hết hạn, vô hiệu đều được đếm và hiển thị.
5. **Hệ phân tích chỉ tư vấn:** `server/src/modules/analysis/` không bao giờ gọi `OrderService` / đổi số dư. Bot (C5) nằm ở `server/src/modules/signals/`, chỉ cho tài khoản `is_bot`, có cờ, và **không thể gửi lệnh ra sàn thật** (bốn lớp ranh giới ở đợt C5).
6. **Không LLM, không dữ liệu trả phí** ở GĐ4 (C-D2). Bộ kể chuyện tất định có sẵn.
7. **Không trộn nguồn dữ liệu:**
   - Chấm điểm theo nến (`MODELED_CANDLES`), bot trên sàn ảo (`BOT_FILLS`) và nhật ký người dùng (`ACTUAL_FILLS`) là ba nguồn riêng.
   - Dùng chung **công thức** R (`@cex/core/rMetrics`), không dùng chung **dữ liệu** hay **giả định thực thi**.
   - Xem [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) mục 2.
8. **Cổng M3 không phải phê duyệt phát hành.** Không có code nào tự mở tín hiệu cho người dùng (mục 3.4).

## 2. Hiện trạng (2026-10-13, đã kiểm)
| Có | Ở đâu | Ghi chú |
|---|---|---|
| Hệ phân tích 7 phòng ban + điều phối | `server/src/modules/analysis/` (orchestrator, departments/*, snapshotBuilder, **cexMarketAdapter** `analyzeSymbol()`), `packages/core/src/quant.ts`, `packages/contracts/src/analysis.ts` | **Chưa commit**, do **Antigravity** viết thẳng trong thư mục `main` (theo `AGENT-HANDOFF/PHASE_STATUS.md`), ngoài vùng được phân. Kiểm lại 2026-10-13 14:35: `tsc -p server` và `eslint` trên các file này **sạch**; Antigravity báo 29/29 test. Có thêm `smokeRealMarket.ts`, nối Binance WS/REST thật để thử |
| Backtest walk-forward + DSR/PBO | `server/src/modules/analysis/backtester.ts` `runWalkForwardBacktest()` | Không có sổ lệnh lịch sử → sổ lệnh tổng hợp (giới hạn đã ghi trong tài liệu kiến trúc) |
| Đề xuất giao dịch | `AdvisoryTradeProposal`: `action`, `entryPrice`, `stopLossPrice`, `takeProfitPrice` (+ `rating`, `confidence`, `uncertaintyScore`, `invalidationConditions` trong báo cáo) | Là nguyên liệu của "tín hiệu" |
| Nến Spot đã đóng, 50 cặp, mọi khung | bảng `candles` (ghi từ WebSocket khi sàn chạy), REST Binance cho lịch sử (`fetchKlines`) | Chỉ có từ ngày sàn bắt đầu chạy |
| Sự kiện nến | `MarketDataService` phát `'candle'` (có cờ `closed`) | Điểm móc cho bộ chạy ngầm |
| Tài khoản bot | `users.is_bot`; admin không sửa được (`BOT_ACCOUNT_PROTECTED`) | Dùng cho C5 |
| Đặt lệnh kèm TP/SL, OCO, `positionSizeForRisk` | `OrderService`, `@cex/core` | Dùng cho C5 |
| Quyền cấp tín hiệu cho người dùng | `users.signals` / `signalsAccess` | GĐ6, chưa dùng ở module này |

### 2.1 Quan hệ với kế hoạch "Phase 3" của Antigravity (`AGENT-HANDOFF/`)

Antigravity đã soạn `AGENT-HANDOFF/prompts/phase-3.md` (**chưa làm**). Kế hoạch đó gồm:
- endpoint `GET /api/v1/market/analysis/:symbol` cho người dùng (`auth: 'user'` hoặc `public`);
- lưu "signal shadow";
- nối `adminSetSignalsAccess`;
- ngăn phân tích trong giao diện sàn.

**Module C thay thế toàn bộ kế hoạch đó.** Antigravity không làm `phase-3.md`. Lý do:
- trái C-D1: người dùng không thấy phân tích hay tín hiệu trước cổng M3 và phê duyệt phát hành;
- Antigravity sẽ phải sửa `packages/contracts` và `server/`, là vùng của Claude Code.

Các câu hỏi chưa giải quyết của Antigravity (`AGENT-HANDOFF/DECISIONS.md`) được trả lời như sau:
| Câu hỏi của Antigravity | Trả lời trong kế hoạch này |
|---|---|
| U-01 Nhánh và cách gộp phần phân tích chưa commit | Đợt C0 (cô lập an toàn, C-D0) |
| U-02 Lưu tín hiệu để đo cổng M3 | C2 (bảng `signals`, `signal_runs`, chỉ Admin), C3 (chấm kết quả) |
| U-03 Mức xác thực của endpoint, cổng `signalsAccess` | Không có endpoint cho người dùng ở GĐ4 (C-D1). `signalsAccess` để dành GĐ6 |
| U-04 Dựng bối cảnh danh mục trong route | Không áp dụng (không có route cho người dùng) |
| U-05 Thu thập open interest Binance | Ngoài phạm vi Module C; phòng ban thiếu dữ liệu tiếp tục báo `null`/bỏ phiếu trắng |

Lead báo điều này cho Antigravity qua chủ dự án, đồng thời đề nghị Antigravity **ngừng sửa** các file hệ phân tích trong `main` (điều kiện của C0 bước 2).
Thư mục `AGENT-HANDOFF/` là của Antigravity: Claude Code chỉ đọc, không sửa.

## 3. Định nghĩa (C-D4, C-D5 đã duyệt; C-D5b chờ quyết)

**Tín hiệu** sinh ra từ một lần chạy `(phiên bản engine, cặp, khung, lúc nến đóng)` khi **đủ cả**:
- báo cáo không phải `REVIEW`;
- `rating` ∈ {BUY, OVERWEIGHT} với `action = LONG`, hoặc {SELL, UNDERWEIGHT} với `action = SHORT`;
- có đủ `entryPrice`, `stopLossPrice`, `takeProfitPrice`, đúng phía (LONG: SL < vào < TP);
- `R:R = |TP − vào| ÷ |vào − SL|` ≥ `minRewardRisk` (mặc định 1,5);
- `confidence` ≥ `minConfidence` (0,60), `uncertaintyScore` ≤ `maxUncertainty` (0,50);
- cặp đó **chưa có tín hiệu nào đang chờ/đang chạy** của cùng phiên bản, **bất kể chiều và khung** (giảm tín hiệu tương quan — mục 3.3.1);
- sàn không dừng, dữ liệu LIVE.

Không đủ → lần chạy vẫn được ghi (bản rút gọn) **kèm lý do** (`REVIEW`, `LOW_CONFIDENCE`, `RR_TOO_LOW`, `DUPLICATE`, `HALTED`, `STALE`…).

**Cấu hình engine** (mỗi lần lưu = một **phiên bản** mới, có nhật ký quản trị):
- `watchlist`, `intervals`;
- `minConfidence`, `maxUncertainty`, `minRewardRisk`;
- `entryValidityBars` (mặc định 3), `maxHoldingBars` (mặc định 48);
- `slippageBps` (tối thiểu 5), `feeModel` (mặc định `TAKER_BOTH_SIDES`), `fillRule` (mặc định `PESSIMISTIC_V1` = bảng mục 3.2);
- `departmentsEnabled`;
- `notes` (giả thuyết của phiên bản).

### 3.1 Vòng đời

Chấm trên nến **1m đã đóng**, bắt đầu từ nến **sau** lúc ra tín hiệu.
```
PENDING ──khớp giá vào──▶ ACTIVE ──▶ TP_HIT | SL_HIT | TIME_EXIT (hết maxHoldingBars) | DATA_GAP_EXIT
   │
   ├─ quá entryValidityBars ──▶ EXPIRED      (không vào lệnh; đếm riêng, không tính win rate)
   └─ điều kiện vô hiệu xảy ra ▶ INVALIDATED (trước khi vào)
```

### 3.2 Mô hình khớp và chi phí (cố định, lưu cùng mỗi tín hiệu)

Mọi giả định là tham số của **phiên bản engine** và được chép vào từng tín hiệu (`fee_rate`, `slippage_bps`, `fill_rule`).
Đổi giả định = phiên bản mới. Luôn chọn cách **bất lợi hơn** khi dữ liệu nến không đủ để biết thứ tự giá.

| Tình huống | Quy tắc |
|---|---|
| **Vào lệnh** (LONG; SHORT đối xứng) | Lệnh giới hạn tại `entry`. Khớp khi nến 1m có `low < entry` (**xuyên qua** ít nhất 1 tick, chạm đúng bằng chưa tính). Giá vào = `entry`, kể cả khi nến mở thấp hơn: không tính phần giá tốt hơn |
| Thời điểm đặt và hạn vào lệnh | Lệnh vào được coi là đặt từ nến 1m **đầu tiên sau** lúc ra tín hiệu (`entry` thường gần giá đóng nến tín hiệu). Không đuổi giá: không khớp trong `entryValidityBars` (đếm theo nến **của khung tín hiệu**) → `EXPIRED` |
| Thị trường của tín hiệu | Theo `marketType` của đề xuất. **SHORT luôn là Futures** (Spot không bán khống); LONG theo đề xuất (Spot hoặc Futures). Bot ở C5 đặt lệnh đúng thị trường này |
| **Nến vào lệnh** cũng chạm SL | Tính **SL_HIT** ngay trong nến đó |
| **Nến vào lệnh** chạm TP (không chạm SL) | **Không** tính TP trong nến vào lệnh (không biết TP xảy ra trước hay sau khi vào). Xét TP từ nến kế tiếp |
| Một nến chạm **cả TP và SL** | **SL_HIT** |
| **TP** | Lệnh giới hạn tại `target`. Khớp khi `high > target` (xuyên qua 1 tick). Giá ra = `target`; nến mở vượt TP vẫn chỉ tính `target` |
| **SL** | Lệnh dừng. Khớp khi `low ≤ stop`. Giá ra = `stop`, trừ thêm trượt giá. Nến **mở dưới SL** (gap) → giá ra = giá **mở** nến đó, trừ thêm trượt giá |
| **TIME_EXIT** | Hết `maxHoldingBars` (theo khung tín hiệu) → thoát ở giá **đóng** nến 1m cuối, trừ trượt giá |
| **Phí** | Theo biểu phí **lúc ra tín hiệu**, tính **cả hai chiều** trên giá trị vào và ra. Spot: mức phí **chung** `feeRate` của sàn (Spot không chia maker/taker, `exchangeConfig.ts:68`). Futures: phí **taker** Futures (`futures/config.ts:62`), không giả định được hưởng phí maker |
| **Trượt giá** | `max(slippageBps của phiên bản, ước tính của phòng rủi ro trong báo cáo)`, tối thiểu 5 bps. Áp cho SL, TIME_EXIT, thoát do lỗ hổng dữ liệu. Không áp cho TP và giá vào giới hạn |
| **Funding** (mọi tín hiệu thị trường Futures, cả LONG và SHORT) | Cộng các mốc funding đi qua trong thời gian giữ, theo tỷ lệ thật sàn đã lưu ở `futures_funding_events`, đúng dấu theo hướng. Thiếu dữ liệu một mốc → dùng 0,01% **bất lợi** cho mốc đó |

**R ròng** theo [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md):
`R = [(giá ra − giá vào) × hướng − phí vào − phí ra − funding] ÷ |giá vào − SL|`, tính trên 1 đơn vị khối lượng.
Ghi thêm **MAE/MFE** (theo R, giá xấu nhất và tốt nhất trong lúc giữ) và thời gian giữ.

**Lỗ hổng dữ liệu nến 1m** (sàn tắt, mất kết nối):
1. Tải bù đúng khoảng thiếu từ Binance REST. Đây là giá **đã xảy ra**, chỉ dùng để chấm kết quả, không dùng để ra quyết định mới nên không nhìn trước tương lai.
2. Không tải được → tín hiệu đứng chờ, không đoán.
3. Quá 24 giờ vẫn thiếu, và tín hiệu đang `ACTIVE` → `DATA_GAP_EXIT`: thoát bi quan ở **SL** (−1R trừ chi phí).
   Kết quả này **được tính vào thống kê và cổng như một lần thua**. Không được loại bỏ, nếu loại sẽ thành chọn lọc.
   Tín hiệu đang `PENDING` → `EXPIRED`.

### 3.3 Cổng M3 (C-D5): điều kiện để **xem xét** phát hành, không phải giấy phép bán

Chỉ tính tín hiệu chạy thật (`basis = MODELED_CANDLES`), đã đóng (TP_HIT, SL_HIT, TIME_EXIT, DATA_GAP_EXIT), của **cùng một phiên bản**. Không dùng số backtest.

| # | Tiêu chí | Ngưỡng |
|---|---|---|
| 1 | Số tín hiệu đã đóng | ≥ 100 (và ≥ 30 ngày có tín hiệu đóng — điều kiện phương pháp, mục 3.3.1 bước 3) |
| 2 | Kỳ vọng R ròng (trung bình) | > 0 |
| 3 | Cận dưới khoảng tin cậy 95% của kỳ vọng R (bootstrap **khối theo ngày**, 10.000 lần, hạt giống cố định — mục 3.3.1) | > 0 |
| 4 | Drawdown tối đa của đường R lũy kế | ≤ 20R |
| 5 | Tỷ trọng R dương lớn nhất của một cặp / một tháng | ≤ 40% / ≤ 50% (tháng: cần ≥ 2 tháng có tín hiệu đóng, mục 3.3.1 bước 5) |
| 6 | Bot trên sàn ảo (nếu bật), `basis = BOT_FILLS` | trung bình R của bot **> 0** (chỉ so, không gộp) |

- Kết luận của cổng chỉ có ba giá trị: `INSUFFICIENT_DATA` (chưa đủ 100 tín hiệu, hoặc chưa đủ 30 ngày có tín hiệu đóng, hoặc chưa đủ 2 tháng có tín hiệu đóng), `NOT_MET` (đủ dữ liệu nhưng trượt tiêu chí), `ELIGIBLE_FOR_REVIEW` (đạt mọi tiêu chí áp dụng được).
  **Không có** giá trị "approved" hay "passed", và **không có code nào** tự bật hoặc mở thứ gì khi cổng đạt.
- Không đạt → sửa engine = phiên bản mới, đếm lại từ 0.

#### 3.3.1 Phương pháp tính (điều kiện của C-D5)

Các ngưỡng ở bảng trên là **ngưỡng kiểm định ban đầu**. Phương pháp tính dưới đây cố định cùng các ngưỡng; đổi phương pháp cũng như đổi ngưỡng, phải có chủ dự án duyệt và ghi vào nhật ký giả thuyết.
Hàm `evaluateM3Gate` ở `packages/core/src/signalStats.ts` làm đúng các bước sau; báo cáo cổng in ra cả số trung gian.

**Bước 0: Tập dữ liệu kiểm định.**
- Chỉ tín hiệu của **một** phiên bản `V`, `basis = MODELED_CANDLES`, tạo ra khi `V` đang chạy thật.
- Chỉ trạng thái đã đóng: `TP_HIT`, `SL_HIT`, `TIME_EXIT`, `DATA_GAP_EXIT`. `EXPIRED`/`INVALIDATED` không có vị thế nên không vào chuỗi R, nhưng in số lượng.
- Mốc cắt `T` = lúc lập báo cáo. Tín hiệu còn mở lúc `T` không tính. Chúng bị giới hạn bởi `maxHoldingBars` nên không thể treo mãi.
- Sắp xếp theo `(exited_at, id)`.
- Báo cáo in **mã băm của tập** (sha256 của danh sách `(id, r)`), để chạy lại ra đúng số.

**Bước 1: R ròng của từng tín hiệu.**
- Đúng mô hình khớp và chi phí ở mục 3.2, qua `rMultiple` của `@cex/core/rMetrics`. Mỗi tín hiệu coi như rủi ro **1R**, không lãi kép.
- Phí: phí taker của biểu phí sàn **lúc ra tín hiệu**, lưu ở `fee_rate`.
- Trượt giá: `max(slippageBps của phiên bản, ước tính của phòng rủi ro, 5 bps)`, lưu ở `slippage_bps`.
- Funding cho SHORT theo mục 3.2.

**Bước 2: Kỳ vọng R** (tiêu chí 2) = trung bình cộng `r_i` trên `n` tín hiệu. Mỗi tín hiệu trọng số như nhau.

**Bước 3: Khoảng tin cậy 95%** (tiêu chí 3). Các tín hiệu crypto **tương quan** (cùng lúc, cùng chiều thị trường), nên không bootstrap từng tín hiệu độc lập.
- Gom theo **ngày đóng (UTC)**. Mỗi ngày `d` có tổng `S_d = Σ r` và số tín hiệu `N_d`. Ngày không có tín hiệu đóng vẫn có mặt với `S_d = 0, N_d = 0`, để giữ chuỗi ngày liên tục.
- **Bootstrap khối trượt vòng** (circular moving block bootstrap) trên chuỗi ngày:
  - khối dài **7 ngày**;
  - **B = 10.000 lần**; bộ sinh số **mulberry32** viết trong `@cex/core`, hạt giống `20261013`;
  - chuỗi gốc dài `D` ngày (từ ngày đóng đầu tiên tới ngày đóng cuối cùng, gồm cả ngày trống); mỗi khối bắt đầu ở ngày `floor(u × D)` (vòng tròn), ghép `ceil(D / 7)` khối rồi cắt còn `D` ngày;
  - mỗi lần tính `Σ S / Σ N`. Lần nào có `Σ N = 0` thì **bỏ và rút tiếp** từ cùng dòng số ngẫu nhiên, cho tới khi đủ B lần hợp lệ. Báo cáo in số lần bỏ.
- Cận dưới = phân vị **2,5%** theo **thứ hạng gần nhất**: sắp 10.000 giá trị tăng dần, lấy phần tử thứ `ceil(0,025 × B)` (đếm từ 1), tức phần tử thứ 250.
- Các lựa chọn ở trên (bộ sinh số, cách chọn khối, cách lấy phân vị, B, độ dài khối, hạt giống) là **`GATE_METHOD_VERSION = 1`**, in trong báo cáo. Đổi bất kỳ lựa chọn nào → tăng phiên bản phương pháp, cần chủ dự án duyệt.
- Kèm theo (chỉ để so, **không** dùng cho cổng): bootstrap từng tín hiệu độc lập. Thường hẹp hơn, nên báo cáo in cả hai để thấy mức ảnh hưởng của tương quan.
- **Điều kiện để khoảng tin cậy có nghĩa:** ít nhất **30 ngày** có tín hiệu đóng. Chưa đủ thì `INSUFFICIENT_DATA`, kể cả khi đã có ≥ 100 tín hiệu.
  Đây là điều kiện phương pháp, không phải ngưỡng hiệu quả mới. Nó tránh trường hợp 100 tín hiệu dồn vào vài ngày biến động.
- **Nhiều phiên bản được đo (C-D5b — chờ chủ dự án quyết).** Nếu đo thật lần lượt nhiều phiên bản và dừng ở phiên bản đầu tiên đạt, khả năng đạt do may mắn tăng theo số phiên bản.
  - Báo cáo luôn in `k` = số phiên bản đã có ≥ 1 tín hiệu chạy thật đóng tính tới lúc lập báo cáo, kèm cận dưới điều chỉnh Bonferroni (phân vị `2,5% / k`, thứ hạng gần nhất; B = 10.000 đủ cho k ≤ 25).
  - **Đề xuất (phương án A):** tiêu chí 3 dùng cận dưới điều chỉnh khi k > 1.
  - Phương án B: chỉ in để người xem xét ở mục 3.4 cân nhắc, tiêu chí 3 vẫn dùng mức 2,5%.
  - Khi chưa có quyết định, hàm `evaluateM3Gate` nhận tham số `familyAdjustment: 'BONFERRONI' | 'REPORT_ONLY'`. Báo cáo ghi rõ đang dùng phương án nào.

**Bước 4: Drawdown** (tiêu chí 4).
- Đường R lũy kế `C_0 = 0`, `C_k = Σ_{i≤k} r_i` theo thứ tự bước 0.
- `DD = max_k (max_{j≤k} C_j − C_k)`, tính bằng R.
- Tín hiệu mở chồng nhau đều tính đủ 1R mỗi cái, nên DD **bi quan hơn** một danh mục chia nhỏ rủi ro.

**Bước 5: Tỷ trọng lợi nhuận** (tiêu chí 5).
- `P = Σ r_i` của các tín hiệu có `r_i > 0`.
- Theo cặp: `max_s (Σ_{r_i>0, cặp = s} r_i) ÷ P` ≤ 40%.
- Theo tháng (tháng của ngày đóng, UTC): `max_m (Σ_{r_i>0, tháng = m} r_i) ÷ P` ≤ 50%. Cần **≥ 2 tháng** có tín hiệu đóng; ít hơn thì kết luận chung là `INSUFFICIENT_DATA`, không phải `NOT_MET`, vì một tháng duy nhất luôn chiếm 100%.
- `P = 0` → tiêu chí không đạt.
- Kèm theo (chỉ để so): kỳ vọng R khi **bỏ cặp tốt nhất** và khi **bỏ tháng tốt nhất**.

**Bước 6: Bot** (tiêu chí 6, `basis = BOT_FILLS`, chỉ so).
- R của bot cho mỗi tín hiệu = lãi/lỗ ròng thật của các lệnh bot có `sourceId = signalId` ÷ (`|entry − SL|` × khối lượng đã khớp).
- Đạt khi trung bình R của bot **> 0**. Vì tiêu chí 2 đã đòi kỳ vọng theo nến > 0, điều này chính là "cùng dấu"; trung bình bằng đúng 0 là **không đạt**.
- Bot tắt, hoặc dưới 30 tín hiệu bot đã khớp → "Không áp dụng". Không chặn cổng, nhưng in rõ.

**Bước 7: Độ nhạy chi phí** (chỉ để so, không phải tiêu chí). Tính lại kỳ vọng R với **phí × 2** và **trượt giá × 2**. Âm thì báo cáo ghi "nhạy với chi phí", để người xem xét ở mục 3.4 cân nhắc.

**Xử lý tín hiệu tương quan, tổng hợp:**
1. **Ở nguồn:** mỗi phiên bản chỉ có **một tín hiệu đang chờ hoặc đang chạy cho mỗi cặp**, bất kể chiều và khung (lý do từ chối `DUPLICATE`). Không có chuyện 1h và 4h của cùng cặp cùng mở, đếm đôi một biến động.
2. **Ở khoảng tin cậy:** bootstrap khối theo ngày (bước 3) giữ nguyên tương quan cùng ngày và giữa các ngày gần nhau.
3. **Ở tập trung:** tiêu chí 5 chặn lợi nhuận dồn vào một cặp hay một tháng.
4. **Báo cáo kèm** (chỉ để so):
   - số tín hiệu mở đồng thời tối đa;
   - tỷ lệ ngày có ≥ 3 tín hiệu cùng chiều;
   - số "ngày hiệu dụng" (số ngày có tín hiệu đóng);
   - kỳ vọng R khi mỗi ngày trọng số như nhau (trung bình của trung bình ngày);
   - số tín hiệu và kỳ vọng R **theo từng khung** (1h, 4h), cùng số lần chạy bị từ chối `DUPLICATE` theo khung. Luật một tín hiệu mở cho mỗi cặp làm khung chậm (4h) ít tín hiệu hơn; số này dùng để ước lượng lại thời gian tới 100 tín hiệu (xác nhận lại C-D4).

**Tính lặp lại:** cùng tập dữ liệu (cùng mã băm), cùng `R_METRICS_VERSION` và `GATE_METHOD_VERSION` → báo cáo giống từng chữ số. Có test chứng minh.

### 3.4 Phát hành cần phê duyệt riêng (sau cổng M3, trước GĐ6)

`ELIGIBLE_FOR_REVIEW` chỉ mở **bước xem xét**. Bước này nằm ngoài GĐ4 và không có trong Module C.
1. **Xem xét lại số liệu** (lead + `cex-reviewer`, chế độ chỉ đọc), viết `docs/reports/<ngày>-xem-xet-phat-hanh-v<N>.md`:
   - chạy lại cổng trên dữ liệu mới nhất;
   - kiểm 30 ngày gần nhất riêng: kỳ vọng không âm;
   - so với backtest và holdout;
   - liệt kê khoảng trống dữ liệu, rủi ro đã biết.
2. **Hồ sơ phê duyệt** `docs/plans/phe-duyet-phat-hanh-tin-hieu.md` (lead lập mẫu khi có phiên bản đầu tiên đạt cổng). Chủ dự án ghi rõ:
   - phiên bản engine, mã băm báo cáo cổng;
   - phạm vi (cặp, khung, ai được xem);
   - nội dung cảnh báo rủi ro cho người dùng, giá, điều kiện dừng phát hành;
   - người duyệt, ngày.
3. **Kế hoạch GĐ6 riêng** (API cho người dùng, quyền `signalsAccess`, giao diện, công tắc tắt khẩn cấp). Chỉ bắt đầu khi hồ sơ ở bước 2 đã ký.
   Sau này, nếu phê duyệt được lưu trong hệ thống, đó là một bảng riêng có audit. Kết luận của cổng không bao giờ được dùng thay cho phê duyệt.

### 3.5 Bảo vệ dữ liệu holdout (C4)

Holdout là khoảng dữ liệu để riêng, **không nhìn** khi xây dựng và chỉnh engine. Chỉ dùng **một lần** cho mỗi phiên bản, để kiểm cuối.
1. **Chốt trước:** trước khi chạy backtest đầu tiên, lead ghi `docs/plans/holdout.json` gồm:
   - `{ from, to }`: 3 tháng cuối của dữ liệu đã tải;
   - ngày chốt;
   - commit.

   File này được commit. Không ai sửa, trừ khi chủ dự án đồng ý và ghi lý do.
2. **Mặc định loại trừ:** `signalsBacktest` tự cắt bỏ khoảng holdout. Mọi báo cáo phát triển (`--mode dev`) chỉ dùng dữ liệu trước `from`.
3. **Mở holdout một lần cho mỗi phiên bản**, bằng `--mode holdout`. Script chỉ chạy khi đủ cả ba điều kiện:
   - phiên bản đã có dòng giả thuyết trong `docs/plans/nhat-ky-gia-thuyet.md`, commit **trước** lần chạy;
   - cấu hình của phiên bản khớp mã băm đã ghi trong giả thuyết;
   - phiên bản **chưa có** trong `docs/reports/backtests/holdout-ledger.json`.

   Chạy xong, script ghi vào sổ: phiên bản, mã băm cấu hình, thời điểm, kết quả.
   Chạy lần hai cho cùng phiên bản → từ chối.
4. **Không chỉnh sau khi nhìn:** phiên bản mới tạo **sau** khi holdout đã mở cho phiên bản trước thì báo cáo holdout của nó ghi rõ "holdout đã bị nhìn N lần".
   Mở quá 3 lần thì holdout coi như hết giá trị. Phải chốt holdout mới (dữ liệu mới hơn) hoặc chỉ dựa vào đo thật (C7).
5. **Đếm số cấu hình đã thử** cho mỗi lần tìm tham số trên dữ liệu dev, ghi vào báo cáo. DSR/PBO dùng số này. Không giấu các lần thử thất bại.
6. Đo thật (C7) mới là kiểm tra ngoài mẫu thực sự. Holdout chỉ để loại cấu hình tệ sớm, không thay được cổng M3.

### Bảng mới (một migration, chỉ thêm)
| Bảng | Nội dung | Ràng buộc |
|---|---|---|
| `signal_engine_versions` | `id`, `version` (số tăng dần), `config jsonb`, `notes`, `code_commit`, `created_by`, `created_at`, `active bool` | đúng một bản `active` |
| `signal_runs` | `id`, `version_id`, `symbol`, `interval`, `candle_open_time`, `as_of`, `rating`, `confidence`, `outcome` (`SIGNAL` hoặc lý do), `snapshot_hash`, `duration_ms` | **unique** `(version_id, symbol, interval, candle_open_time)`; xóa sau 90 ngày |
| `signals` | `id`, `run_id`, `version_id`, `symbol`, `interval`, `direction`, `entry/stop/target numeric`, `reward_risk`, `confidence`, `rating`, `summary`, `invalidation jsonb`, `report jsonb` (báo cáo đầy đủ), `fee_rate`, `slippage_bps`, `fill_rule`, `status` (gồm `DATA_GAP_EXIT`), `gap_backfilled bool`, `entered_at/price`, `exited_at/price`, `exit_reason`, `r_multiple`, `mae_r`, `mfe_r`, `last_evaluated_candle`, `created_at` | index `(version_id, status)`, `(symbol, created_at)` |

### API (một phiên bản hợp đồng mới — chỉ Admin, chưa có API cho người dùng)
| Endpoint | Quyền | Nội dung |
|---|---|---|
| `adminSignals` GET `/api/v1/admin/signals` | `signals.view` | lọc phiên bản, cặp, chiều, trạng thái, khoảng ngày; phân trang |
| `adminSignal` GET `/api/v1/admin/signals/:signalId` | `signals.view` | chi tiết + báo cáo phân tích + diễn biến chấm điểm |
| `adminSignalRuns` GET `/api/v1/admin/signals/runs` | `signals.view` | các lần chạy (kể cả không ra tín hiệu) + lý do — để thấy engine có chạy đều không |
| `adminSignalStats` GET `/api/v1/admin/signals/stats` | `signals.view` | win rate, kỳ vọng R, PF (R), drawdown R, đường R; theo cặp / chiều / rating / nhóm confidence (bảng **hiệu chỉnh**: confidence dự báo ↔ tỷ lệ thắng thật); số EXPIRED/INVALIDATED/DATA_GAP_EXIT; `basis` = `MODELED_CANDLES` hoặc `BOT_FILLS` (tham số, mỗi phản hồi một basis) |
| `adminSignalGate` GET `/api/v1/admin/signals/gate?versionId=` | `signals.view` | 6 tiêu chí M3: giá trị, ngưỡng, đạt/chưa; `verdict` ∈ `INSUFFICIENT_DATA` / `NOT_MET` / `ELIGIBLE_FOR_REVIEW`; dòng chữ cố định "Đạt cổng chưa phải phê duyệt phát hành" |
| `adminSignalEngineVersions` GET | `signals.view` | danh sách phiên bản |
| `adminCreateSignalEngineVersion` POST | `signals.manage` | tạo phiên bản (kiểm cấu hình), `reason` bắt buộc, ghi audit |
| `adminActivateSignalEngineVersion` POST `/:versionId/activate` | `signals.manage` | đổi phiên bản đang chạy, `reason`, audit |

Thêm:
- quyền `signals.view` (support, admin, owner) và `signals.manage` (admin, owner);
- `OrderSource` thêm `'SIGNAL'` (giao diện hiện huy hiệu "Bot tín hiệu");
- `AuditAction` thêm `SIGNAL_ENGINE_VERSION_CREATE`, `SIGNAL_ENGINE_VERSION_ACTIVATE`.

---

## 4. Các đợt

### Đợt C0 — Tiếp nhận hệ phân tích (cô lập an toàn — C-D0)
| | |
|---|---|
| Người làm | Lead (bước 0–4) → `cex-quant-engineer` → `cex-reviewer` |
| Nhánh | `be/analysis` (bản chép nguyên trạng, lead tạo) → `be/analysis-fixes` (sub-agent sửa, tách từ `be/analysis`) |
| Cần trước | C-D0 đã duyệt (2026-10-13). **Antigravity đã ngừng sửa các file hệ phân tích** (chủ dự án báo), xem mục 2.1 |
| Thời lượng | 1–2 lượt (có một điểm dừng chờ chủ dự án) |

**Người tạo ra các file này là Antigravity**, không phải một phiên Claude Code (`AGENT-HANDOFF/PHASE_STATUS.md`). `ListAgents`/`SendMessage` **không** liên lạc được với Antigravity: mọi xác nhận đi qua chủ dự án.

**Ranh giới (điều kiện của C-D0):**
- **Không** sửa, xóa, di chuyển, stage hay commit bất kỳ file nào của Antigravity **trong `main`** trước bước 4.
- **Không** commit thay đổi của Antigravity khi chưa qua điểm dừng ở bước 2.
- **Không** tích hợp vào `main` trước khi xác minh xong nguồn gốc và giấy phép (bước 1).
- **Lệnh bị cấm trong toàn đợt** (trên `main` và trên worktree tiếp nhận):
  - `git stash` (mọi dạng; `-a` gồm cả `host-data/`), `git clean`, `git reset --hard`;
  - `git checkout -f` / `git checkout -- .` / `git restore .` (khôi phục cả thư mục);
  - `git add -A` / `git add .`; `git worktree remove --force`;
  - `rm -rf` hoặc xóa bằng Explorer lên một thư mục worktree có `node_modules`. Trên Windows, liên kết junction `node_modules/@cex/*` có thể bị đi theo và xóa luôn mã nguồn thật.
  - Không dùng lại kiểu `rmSync(dir, { recursive, force })` của `infra/ui-check.mjs` lên một thư mục đã có sẵn.

**Bước 0 — Kiểm kê (chỉ đọc).** Lead tạo `docs/reports/<ngày>-c0-kiem-ke.md` gồm:
1. `git status --porcelain=v1 -uall`, `git diff` của các file đang theo dõi bị sửa, `git log -1`.
   Hôm 2026-10-13 có ba file như vậy, mỗi file đúng **một** dòng thêm: `.gitignore` (`/vendor/`), `packages/contracts/src/index.ts`, `packages/core/src/index.ts` (dòng export).
2. Danh sách **mọi** file chưa theo dõi: đường dẫn, kích thước, thời điểm sửa cuối, **sha256**. Đây là bản kê (manifest).
3. Phân nhóm:
   - **(1) Hệ phân tích**, phạm vi C0:
     - `server/src/modules/analysis/**` (gồm `smokeRealMarket.ts`);
     - `packages/core/src/quant*.ts`;
     - `packages/contracts/src/analysis*.ts`;
     - `docs/architecture/**`;
     - các dòng export trong hai `index.ts`, dòng `/vendor/` trong `.gitignore`;
     - `.claude/skills/crypto-multi-agent-analysis/`.
   - **(2) `AGENT-HANDOFF/`**: tài liệu bàn giao của Antigravity. Chỉ đọc, **không** thuộc C0, để nguyên.
   - **(3) Các skill khác trong `.claude/skills/`**: skill của dự án và skill bên thứ ba. **Không** thuộc C0; nguồn gốc kiểm riêng ở một việc khác.
   - **(4) `vendor/TradingAgents`**: repo git lồng bên trong, git bỏ qua. Chỉ dùng để xác minh nguồn gốc, **không** commit.
   - **(5) `ui/.agent/skills/crypto-agent-subsystem/`**: chưa theo dõi trong worktree giao diện. Của Antigravity, ngoài phạm vi, không đụng.
4. **Trạng thái của Antigravity:**
   - đọc `AGENT-HANDOFF/PHASE_STATUS.md` và `DECISIONS.md`;
   - xác nhận không file nhóm (1) nào đổi trong **30 phút** gần nhất;
   - xác nhận chủ dự án đã báo Antigravity ngừng sửa.

   Còn đổi hoặc chưa có xác nhận → dừng, chờ.

**Bước 1 — Nguồn gốc và giấy phép (chỉ đọc), ghi vào cùng báo cáo.**
Kết quả kiểm sơ bộ 2026-10-13:
- `vendor/TradingAgents`: remote `https://github.com/TauricResearch/TradingAgents.git`, HEAD `1394a3f`, `LICENSE` Apache-2.0, **không có `NOTICE`**;
- `contracts/src/analysis.ts:6` và `analysis/orchestrator.ts:19` đã ghi nguồn upstream;
- trong toàn repo không có endpoint đặt lệnh hay khóa API sàn.

Việc của bước này:
- Với từng file nhóm (1): **chuyển thể** từ TradingAgents (cần dòng ghi nguồn + "đã sửa đổi") hay **viết mới**. Tìm URL, tiêu đề giấy phép, đoạn chép từ nguồn khác.
- Xác nhận: không khóa API, không dữ liệu trả phí, không gọi LLM thật (`llmAdapter.ts` chỉ có `DeterministicQuantNarrator`).
- Kết luận: **được tích hợp / cần sửa trước / không được tích hợp** (kèm lý do).

**Bước 2 — Điểm dừng.** Lead gửi chủ dự án tóm tắt báo cáo kiểm kê: số file, nhóm, mã băm, trạng thái Antigravity, kết luận giấy phép.
Chỉ đi tiếp khi chủ dự án xác nhận: **Antigravity đã ngừng sửa và đồng ý bàn giao, hoặc chủ dự án cho tiếp tục**.

**Bước 3 — Cô lập.**
1. Tạo worktree **mới**, ở đường dẫn **chưa tồn tại**, **ngoài** thư mục `main`: `git worktree add <thư mục tạm>/be-analysis -b be/analysis main`.
   - Lệnh này tự từ chối nếu nhánh đã có.
   - Worktree này **không** cài `node_modules`: lead chỉ chép và commit, không chạy test ở đây.
2. **Chép** (không di chuyển) đúng các file nhóm (1) theo danh sách trong bản kê (không dùng mẫu đường dẫn đại diện). So sha256 của **bản chép** với bản kê; lệch là dừng.
   Áp đúng ba dòng thay đổi của ba file đang theo dõi.
3. Commit trong worktree, message ghi rõ:
   - "snapshot of uncommitted analysis subsystem written by Antigravity, taken over per C-D0";
   - đường dẫn bản kê;
   - người đồng ý ở bước 2.
4. `git -C <thư mục tạm>/be-analysis status` phải sạch, rồi `git worktree remove <thư mục tạm>/be-analysis` (**không** `--force`). Mục đích: giải phóng nhánh để sub-agent dùng.
   Bản gốc trong `main` giữ nguyên.

**Bước 3b — Sửa lỗi:** sub-agent chạy trong worktree riêng (`isolation: "worktree"`), tạo nhánh `be/analysis-fixes` từ `be/analysis`.
Git không cho một nhánh mở ở hai worktree cùng lúc, nên sub-agent không làm thẳng trên `be/analysis`. Lead gộp `be/analysis-fixes` vào `be/analysis` sau khi rà.

**Bước 4 — Trả `main` về sạch và gộp** (cuối đợt; lead làm liền một mạch, không chen lệnh khác):
1. **Kiểm lại:**
   - sha256 bản gốc nhóm (1) trong `main` = bản kê; có file đổi → **dừng**, báo chủ dự án;
   - `git diff` của ba file đang theo dõi đúng **ba dòng** đã kê; khác → **dừng**.
2. **Sao lưu** vào `D:\Claude\crypto-backup\c0-<ngày>\` (thư mục mới; đã có thì dừng). Đối chiếu số file và sha256 của bản sao lưu:
   - **nguyên file** của ba file đang theo dõi (không chỉ diff);
   - toàn bộ nhóm (1);
   - **toàn bộ** `.claude/skills/` và `AGENT-HANDOFF/`. Hai thư mục này chưa từng vào git, bản sao lưu ngày 12/10 có trước khi chúng xuất hiện, nên bản sao này là bản dự phòng duy nhất.
3. **Gỡ khỏi `main`:**
   - `git restore --worktree -- .gitignore packages/contracts/src/index.ts packages/core/src/index.ts` (đúng ba đường dẫn này). Git sẽ từ chối gộp nếu còn thay đổi cục bộ trên file mà nhánh cũng đổi;
   - xóa **từng file** nhóm (1) theo danh sách trong bản kê; xóa thư mục chỉ khi nó đã rỗng;
   - **không** đụng nhóm (2)–(5).
4. **Gộp ngay:** `git merge --no-ff be/analysis`. Từ lúc trả `.gitignore` về tới lúc gộp xong, `vendor/` không được bỏ qua, nên **không** chạy bất kỳ lệnh `git add` nào.
5. **Đối chiếu:** nội dung sau gộp = bản sao lưu (trừ phần sửa ở `be/analysis-fixes`); `git status` không còn nhóm (1); nhóm (2)–(5) còn nguyên.
6. **Gộp thất bại:**
   - `git merge --abort`;
   - chép lại từ bản sao lưu đúng các file đã gỡ, so sha256;
   - báo chủ dự án.

**Việc — quant-engineer** (nhánh `be/analysis-fixes`, sau bước 3)
1. Chạy lại `npm run typecheck`, `npx eslint server packages/core packages/contracts`, toàn bộ test (lần kiểm 2026-10-13 14:35 đã sạch). Còn lỗi thì sửa; ghi số.
2. Chuẩn hóa hợp đồng `analysis.ts` theo quy ước dự án: tên trường camelCase (`PriorLessonsUsed` → `priorLessonsUsed`), tiền là `DecimalString`, thời điểm `EpochMs`/`IsoDateTime`, thiếu dữ liệu là `nullable`.
3. Chạy `npx tsx server/src/modules/analysis/cli.ts`; đo thời gian một lần `analyzeSymbol` (dùng để xác nhận lại C-D4 và tính tải cho C2).
4. Giấy phép theo kết luận bước 1:
   - `THIRD_PARTY_NOTICES.md` ở gốc repo: tên dự án, URL, commit `1394a3f72aa4393e1a98f51b382434c4b4c2d972`, toàn văn hoặc đường dẫn giấy phép Apache-2.0 (upstream không có `NOTICE`);
   - đầu mỗi file chuyển thể ghi nguồn + "đã sửa đổi";
   - không có file nào ghi nguồn sai.

**Việc — reviewer:** rà toàn bộ nhánh theo skill `crypto-multi-agent-analysis` mục 5–6:
- nhìn trước tương lai (kể cả `CandleService` lấy nến từ Binance REST: nến chưa đóng không được lọt vào `asOf`);
- `Dec`;
- không bịa số khi thiếu dữ liệu;
- tách biệt khỏi `OrderService`;
- không có kết nối mạng ngoài dữ liệu công khai;
- test không thể đỏ;
- thời gian chạy một lần phân tích;
- **đối chiếu bản kê**: mọi file trong nhánh có trong bản kê hoặc là sửa của `be/analysis-fixes`; không có file nhóm (2)–(5).

**Nghiệm thu**
- [ ] Báo cáo kiểm kê + giấy phép có trước mọi commit. Điểm dừng bước 2 có ghi người đồng ý.
- [ ] `npm run verify` đạt trên `be/analysis` (sau khi gộp nhánh sửa) và trên `main` sau khi gộp; test hệ phân tích N/N.
- [ ] Bản sao lưu `D:\Claude\crypto-backup\c0-<ngày>\` khớp bản kê. `git status` của `main` sau gộp không còn nhóm (1). Nhóm (2)–(5) còn nguyên.
- [ ] Hợp đồng lên phiên bản mới (chỉ thêm export kiểu phân tích), CHANGELOG ghi rõ.
- [ ] Số đo một lần `analyzeSymbol`.

**Lệnh giao việc**
> (quant-engineer) Làm **Đợt C0 phần sửa lỗi** theo `docs/plans/module-C-engine-tin-hieu.md`. Tạo nhánh `be/analysis-fixes` từ `be/analysis` (bản chép nguyên trạng; bản kê ở `docs/reports/<ngày>-c0-kiem-ke.md`). Gọi skill `crypto-multi-agent-analysis` trước. Không thêm tính năng mới — chỉ làm cho nhánh sạch lỗi, đúng quy ước, ghi nguồn giấy phép đúng kết luận bước 1. Không đụng thư mục `main`, `AGENT-HANDOFF/`, `vendor/`, `ui/`, skill khác. Không dùng các lệnh bị cấm ở phần "Ranh giới".

---

### Đợt C1 — Hợp đồng tín hiệu (chỉ Admin)
| | |
|---|---|
| Người làm | `cex-contract-designer` |
| Nhánh | `be/signals-c1-contracts` |
| Cần trước | C0 đã gộp; C-D4, C-D5 đã duyệt (C-D5b có thể chưa — hợp đồng đã có chỗ cho cả hai phương án) |
| Thời lượng | 1 lượt |

**Việc**
1. `packages/contracts/src/signals.ts`:
   - `SignalDirection`, `SignalStatus` (PENDING, ACTIVE, TP_HIT, SL_HIT, TIME_EXIT, DATA_GAP_EXIT, EXPIRED, INVALIDATED), `SignalRunOutcome` (SIGNAL + các lý do);
   - `SignalEngineConfig`:
     - giới hạn hợp lệ: watchlist 1–20 cặp đang bật; intervals ⊂ {15m, 1h, 4h, 1d}; 0 < minConfidence ≤ 1…;
     - `slippageBps` ≥ 5;
     - `feeModel` và `fillRule` là enum, hiện mỗi enum chỉ có một giá trị;
   - `SignalEngineVersion`, `Signal` (có `feeRate`, `slippageBps`, `fillRule`), `SignalDetail` (+ `report: CryptoMarketAnalysisReport`), `SignalRun`;
   - `SignalStats` (có `basis`, dùng `StatsBasis` của A1; A1 chưa gộp thì contract-designer tạo `StatsBasis` ở đợt này);
   - `SignalGateReport`, đủ để in mọi số của mục 3.3.1 (không phải đổi hợp đồng ở C3):
     - `versionId`, `methodVersion` (`GATE_METHOD_VERSION`), `rMetricsVersion`, `datasetHash`, `cutoffAt`;
     - `n`, `exitDays`, `exitMonths`, `familyCount` (k), `familyAdjustment` (`BONFERRONI | REPORT_ONLY`);
     - `criteria[]`: `id`, `value`, `threshold`, `passed` (`true | false | null` = không áp dụng), `note`;
     - `diagnostics`:
       - `iidCiLower`, `adjustedCiLower`, `resamplesDropped`;
       - `expectancyExBestPair`, `expectancyExBestMonth`, `expectancyCostX2`;
       - `maxConcurrentOpen`, `sameDirectionDayRate`, `dayWeightedExpectancy`;
       - `perInterval[]` (`interval`, `n`, `expectancyR`, `duplicateRejects`);
       - `expiredCount`, `invalidatedCount`;
     - `verdict: SignalGateVerdict` (`INSUFFICIENT_DATA | NOT_MET | ELIGIBLE_FOR_REVIEW`).

     **Không** có trường hay endpoint nào mang nghĩa "đã duyệt phát hành".
2. 8 endpoint Admin ở mục 3; quyền mới; `OrderSource` thêm `SIGNAL`; `AuditAction` mới.
3. Mock: kho tín hiệu mẫu (đủ mọi trạng thái, 2 phiên bản). Thống kê/cổng dùng **cùng hàm thuần ở `@cex/core`**.
   - Hàm đó viết ở C3. Đợt này mock trả fixture tĩnh và ghi TODO kèm tên hàm.
   - Lead nhớ nối mock vào hàm thật ở C3.
4. CHANGELOG ("Thay đổi nhỏ có thể ảnh hưởng UI": `OrderSource` có thêm `SIGNAL`).

**Nghiệm thu**
- [ ] Typecheck, test contracts, drift check (8 endpoint chưa có route — đúng), lint.

**Lệnh giao việc**
> Làm **Đợt C1** theo `docs/plans/module-C-engine-tin-hieu.md` (mục 3 + "Đợt C1"). Nhánh `be/signals-c1-contracts`. Các quyết định đã duyệt: <dán C-D4, C-D5>. Không tạo endpoint cho người dùng thường (đó là GĐ6).

**Sau đợt:** lead viết `docs/antigravity/PROMPT-15-admin-hieu-qua-tin-hieu.md` — Antigravity làm trang Admin trên mock song song C2–C5.

---

### Đợt C2 — Lưu trữ + bộ chạy ngầm
| | |
|---|---|
| Người làm | `cex-quant-engineer` (luật rút tín hiệu, hàm thuần) ∥ `cex-backend-builder` (bảng, job, route đọc) → `cex-reviewer` |
| Nhánh | `be/signals-c2-runner` (quant làm `be/signals-c2-extract` rồi lead gộp vào) |
| Cần trước | C1 đã gộp; nếu A2 đã gộp thì rebase + `db:generate` lại |
| Skill | `crypto-multi-agent-analysis`, `db-migration-host-safety`, `realtime-market-data-qa` (sự kiện nến), `cex-feature-delivery` |
| Thời lượng | 1–2 lượt |

**Việc — quant-engineer**
1. `server/src/modules/signals/extract.ts`: hàm thuần `extractSignal(report, config, openSignals) → { signal } | { reason }` đúng mục 3.
2. Test vàng: mỗi lý do từ chối một ca; LONG/SHORT; sai phía SL/TP; R:R đúng ngưỡng (≥, không >); cặp đang có tín hiệu mở (cùng chiều, ngược chiều, khác khung đều từ chối `DUPLICATE`); `REVIEW`.

**Việc — backend-builder**
1. Bảng `signal_engine_versions`, `signal_runs`, `signals` (mục 3) → migration.
   - Script `npm run signals:init`: tạo phiên bản 1 từ cấu hình mặc định (C-D4), có audit.
2. `server/src/modules/signals/`:
   - `scheduler.ts`:
     - nghe `'candle'` có `closed = true` của các cặp/khung trong phiên bản đang chạy;
     - **chờ 3 giây** rồi gọi `CexMarketDataAdapter.analyzeSymbol(symbol, interval, asOf = closeTime)`;
     - **một hàng đợi**, tối đa 2 lần chạy song song;
     - sàn dừng hoặc dữ liệu STALE → ghi lần chạy với lý do, không phân tích.
   - `repo.ts`: ghi lần chạy + tín hiệu trong **một transaction**. Ràng buộc unique chặn trùng khi phát lại/khởi động lại.
   - **Không chạy bù các nến đã lỡ** khi server tắt: sổ lệnh và giao dịch lúc đó không còn, chạy bù sẽ dùng dữ liệu hiện tại cho quá khứ, tức là nhìn trước tương lai. Ghi khoảng trống (gap) vào log.
   - `versions.ts`: tạo/kích hoạt phiên bản (quyền, audit cùng transaction).
   - `routes.ts`: `adminSignals`, `adminSignal`, `adminSignalRuns`, 3 endpoint phiên bản.
   - Dọn dẹp hằng ngày theo C-D6: `signal_runs` > 90 ngày; nến 1m > 60 ngày.
   - Bật trong `main.ts` bằng cờ `SIGNALS_ENABLED` (mặc định **false**). Sàn thật bật khi chủ dự án đồng ý (C7).
3. Test (giá giả lập):
   - đóng một nến của cặp trong danh sách → đúng 1 lần chạy;
   - phát lại sự kiện → không trùng;
   - nến chưa đóng → không chạy;
   - STALE → lần chạy có lý do `STALE`, không tín hiệu;
   - sàn dừng → `HALTED`;
   - tín hiệu được ghi đủ trường;
   - đổi phiên bản đang chạy → lần sau dùng phiên bản mới;
   - support không tạo được phiên bản (403/permission);
   - audit có dòng.

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; drift check còn 2 endpoint (stats, gate).
- [ ] Chạy thử 2 giờ trên `npm run dev -- --sim` với `SIGNALS_ENABLED=true`: số lần chạy = số nến đóng × số cặp × số khung (dán số đếm từ DB).
- [ ] Reviewer: không P0/P1; kiểm riêng nhìn trước tương lai và trùng lặp.

**Lệnh giao việc**
> (quant-engineer) Làm **Đợt C2 phần luật rút tín hiệu** theo `docs/plans/module-C-engine-tin-hieu.md` mục 3. Nhánh `be/signals-c2-extract`. Chỉ `server/src/modules/signals/extract.ts` + test.
>
> (backend-builder) Làm **Đợt C2 phần lưu trữ + bộ chạy ngầm** theo cùng file. Nhánh `be/signals-c2-runner`. Import `extractSignal` từ `./extract.ts` (nhánh quant gộp vào nhánh bạn trước khi bạn chạy test cuối). Gọi skill `db-migration-host-safety` trước khi tạo migration.

---

### Đợt C3 — Chấm kết quả + thống kê + cổng M3
| | |
|---|---|
| Người làm | `cex-quant-engineer` (hàm thuần + thống kê + cổng) ∥ `cex-backend-builder` (job theo dõi + route) → `cex-reviewer` |
| Nhánh | `be/signals-c3-outcomes` |
| Cần trước | C2 đã gộp |
| Thời lượng | 1–2 lượt |

**Việc — quant-engineer** (`packages/core/src/signalOutcome.ts`, `signalStats.ts` — thuần, `Dec`)
1. `advanceSignal(signal, candles1m[])`: máy trạng thái mục 3.1, khớp và chi phí **đúng từng dòng bảng mục 3.2**. R tính bằng `rMultiple` của `@cex/core/rMetrics`, không viết lại.
   Test vàng ≥ 26 ca, mỗi dòng của bảng 3.2 ít nhất một ca:
   - Vào lệnh:
     - chạm đúng `entry` → chưa vào;
     - xuyên 1 tick → vào ở `entry`;
     - nến mở tốt hơn `entry` → vẫn tính `entry`;
     - quá `entryValidityBars` → EXPIRED.
   - Nến vào lệnh: chạm SL → SL_HIT; chạm TP → chưa tính TP.
   - Thoát:
     - TP chạm đúng → chưa; TP xuyên → giá `target`;
     - cả TP và SL trong 1 nến → SL;
     - gap qua SL → giá mở trừ trượt giá;
     - hết giờ → TIME_EXIT ở giá đóng trừ trượt giá.
   - Chi phí:
     - phí taker hai chiều;
     - trượt giá lấy `max`, tối thiểu 5 bps;
     - funding SHORT; không có dữ liệu funding → 0,01%/8h bất lợi.
   - SHORT đối xứng mọi ca trên. MAE/MFE.
   - Lỗ hổng dữ liệu:
     - tải bù được → chấm bình thường, `gap_backfilled = true`;
     - không tải được → đứng chờ;
     - quá 24 giờ khi ACTIVE → DATA_GAP_EXIT ở SL, tính là thua;
     - quá 24 giờ khi PENDING → EXPIRED.
2. `computeSignalStats(closed[], basis)` + `evaluateM3Gate(closed[], opts)` **đúng từng bước của mục 3.3.1**:
   - dùng `summarizeR` + `blockBootstrapRatioCI` (thêm vào `rMetrics.ts` đúng mục 3.3.1 bước 3: mulberry32, hạt giống `20261013`, khối 7 ngày vòng tròn, B = 10.000, bỏ và rút tiếp khi `Σ N = 0`, phân vị thứ hạng gần nhất, `GATE_METHOD_VERSION = 1`);
   - tham số `familyCount` và `familyAdjustment` (C-D5b): in cận dưới điều chỉnh Bonferroni; chỉ dùng cho tiêu chí 3 khi `familyAdjustment = 'BONFERRONI'`;
   - in đủ số trung gian: mã băm tập dữ liệu, n, số ngày, CI khối và CI độc lập (để so), DD, tỷ trọng theo cặp/tháng, kỳ vọng khi bỏ cặp/tháng tốt nhất, độ nhạy chi phí ×2, các chỉ số tương quan;
   - test vàng: tập nhỏ tính tay cho từng bước 2, 4, 5; bootstrap lặp lại giống hệt với cùng hạt giống; 100 tín hiệu dồn vào 5 ngày → `INSUFFICIENT_DATA`; `P = 0` → tiêu chí 5 không đạt; bot dưới 30 → "Không áp dụng"; trung bình R bot = 0 → không đạt; dữ liệu tương quan giả lập (cùng ngày cùng dấu) → CI khối rộng hơn CI độc lập; mọi tín hiệu đóng trong một tháng → `INSUFFICIENT_DATA`; chuỗi ngày có nhiều ngày trống → có lần lấy mẫu `Σ N = 0`, được bỏ và đếm, kết quả vẫn lặp lại; phân vị lấy đúng phần tử thứ 250 (kiểm bằng tập 10.000 giá trị biết trước); `k = 3` với `BONFERRONI` → dùng phần tử thứ `ceil(0,025/3 × 10.000) = 84`;
   - bảng hiệu chỉnh theo nhóm confidence (0,6–0,7 / 0,7–0,8 / 0,8–0,9 / ≥ 0,9);
   - `evaluateM3Gate` từ chối dữ liệu trộn phiên bản hoặc trộn basis (ném lỗi), và chỉ trả 3 giá trị `verdict` ở mục 3.3;
   - test: thêm mục nhật ký hoặc lệnh bot → thống kê tín hiệu không đổi.
3. Nối mock của hợp đồng (C1) vào 2 hàm này (sửa `packages/contracts/src/mocks/…` — lead cho phép trong đợt này).

**Việc — backend-builder**
1. `server/src/modules/signals/tracker.ts`:
   - mỗi nến 1m đã đóng của cặp có tín hiệu mở → `advanceSignal`;
   - ghi trạng thái trong transaction có khóa dòng tín hiệu;
   - `last_evaluated_candle` giúp phát lại an toàn.
2. Khởi động lại → **chấm bù** từ nến 1m đã lưu kể từ `last_evaluated_candle`. Làm được vì chấm điểm chỉ dùng giá đã xảy ra, không ra quyết định mới.
   Thiếu nến 1m → tải bù đúng khoảng thiếu từ Binance REST, rồi theo luật lỗ hổng dữ liệu ở mục 3.2. Việc tải bù là một **hàm được truyền vào** tracker (`fetchMissing1m`), viết trong `modules/market` bằng `fetchKlines` (trong giới hạn trọng số) và nối ở `main.ts`. `modules/signals` không tự import code mạng.
3. Route `adminSignalStats`, `adminSignalGate`.
4. Script chỉ dùng cho dev/e2e: `server/scripts/e2eSeedSignals.ts` (từ chối khi `NODE_ENV=production`) tạo tín hiệu mẫu cho test giao diện.

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; drift check sạch.
- [ ] Test: tắt server giữa chừng, bật lại → kết quả giống hệt khi chạy liền (so từng tín hiệu).
- [ ] Reviewer: không P0/P1.

**Lệnh giao việc**
> (quant-engineer) Làm **Đợt C3 phần hàm thuần + thống kê + cổng** theo `docs/plans/module-C-engine-tin-hieu.md` mục 3. Nhánh `be/signals-c3-math` (lead gộp vào `be/signals-c3-outcomes`). Gọi skill `walk-forward-validation` và `trading-strategy-review` để kiểm cách tính kỳ vọng/khoảng tin cậy.
>
> (backend-builder) Làm **Đợt C3 phần job theo dõi + route** theo cùng file, nhánh `be/signals-c3-outcomes`.

---

### Đợt C4 — Dữ liệu lịch sử + backtest trung thực
| | |
|---|---|
| Người làm | `cex-quant-engineer` → `cex-reviewer` |
| Nhánh | `be/signals-c4-backtest` |
| Cần trước | C2 đã gộp (dùng `extractSignal`); làm song song với C3/C5 được — chỉ thêm script, không đổi bảng |
| Thời lượng | 1–2 lượt |

**Việc**
1. `server/scripts/signalsBackfill.ts`:
   - tải nến Binance REST cho `watchlist × {1h, 4h} × 12 tháng` vào `candles` (`source = 'binance-rest'`, `onConflictDoNothing`);
   - tôn trọng giới hạn trọng số Binance (bất biến 15: tổng IP 6000/phút — tự giới hạn ≤ 1200/phút);
   - mặc định chạy vào **DB dev**. Chạy vào DB sàn thật chỉ khi chủ dự án đồng ý.
2. **Trước khi chạy backtest đầu tiên**, lead chốt và commit:
   - `docs/plans/holdout.json` (mục 3.5 bước 1);
   - `docs/plans/nhat-ky-gia-thuyet.md` với giả thuyết của phiên bản 1 và mã băm cấu hình.
3. `server/scripts/signalsBacktest.ts --version <id> --mode dev|holdout [--from --to]`:
   - phát lại nến đã đóng qua hệ phân tích ở **chế độ lịch sử**: phòng ban không có dữ liệu lịch sử (sổ lệnh, phái sinh) → `ABSTAIN`, ghi rõ;
   - rút tín hiệu bằng **cùng `extractSignal`**;
   - chấm bằng **cùng `advanceSignal`**, cùng bảng khớp/chi phí mục 3.2.
     Nến 1h thay cho 1m: nhiều nến "chạm cả TP và SL" hơn nên kết quả **bi quan hơn** chạy thật. Ghi rõ trong báo cáo;
   - `--mode dev` (mặc định): **tự cắt bỏ** khoảng holdout; walk-forward; ghi số cấu hình đã thử;
   - `--mode holdout`: chỉ chạy khi đủ 3 điều kiện ở mục 3.5 bước 3, rồi ghi `docs/reports/backtests/holdout-ledger.json`. Lần hai cho cùng phiên bản → từ chối, thoát mã lỗi;
   - DSR/PBO từ `backtester.ts`, dùng số cấu hình đã thử thật.
4. Kết quả **chỉ** nằm trong báo cáo và file JSON. **Không** ghi vào bảng `signals`, không vào thống kê Admin ([quy ước](quy-uoc-R-va-nguon-du-lieu.md) mục 2, luật 5):
   - `docs/reports/<ngày>-backtest-engine-v<N>.md`: bảng số, đường R, theo cặp/chiều, kết quả dev và holdout **tách riêng**;
   - câu cảnh báo "backtest không chứng minh lợi thế khi chạy thật" và danh sách giới hạn dữ liệu;
   - JSON tóm tắt kèm theo.

**Nghiệm thu**
- [ ] Báo cáo backtest cho phiên bản 1 (đạt hay không đều ghi thật).
- [ ] Test:
  - script backtest trên 200 nến tổng hợp cho kết quả xác định (chạy 2 lần giống nhau);
  - `--mode dev` không đọc nến nào trong khoảng holdout (đếm nến);
  - `--mode holdout` chạy lần hai cho cùng phiên bản → từ chối;
  - thiếu dòng giả thuyết hoặc mã băm lệch → từ chối.
- [ ] Reviewer kiểm riêng: không có đường nào đọc được khoảng holdout ở chế độ dev.

**Lệnh giao việc**
> Làm **Đợt C4** theo `docs/plans/module-C-engine-tin-hieu.md` (mục 3.2, 3.5 và "Đợt C4"). Nhánh `be/signals-c4-backtest`. Gọi skill `walk-forward-validation`, `trading-strategy-review`, `ohlcv-processing`. Không chỉnh cấu hình để kết quả đẹp hơn — chỉ báo cáo. **Không** chạy `--mode holdout`: chỉ lead chạy, sau khi chủ dự án xem kết quả dev.

---

### Đợt C5 — Bot tín hiệu trên sàn ảo (C-D3)
| | |
|---|---|
| Người làm | `cex-backend-builder` (bắt buộc skill `ledger-order-concurrency`) → `cex-reviewer` |
| Nhánh | `be/signals-c5-bot` |
| Cần trước | C3 đã gộp; C-D3 đã duyệt (2026-10-13) |
| Thời lượng | 1–2 lượt |

**Ranh giới kỹ thuật: bot không thể gửi lệnh đến hệ thống giao dịch thật** (điều kiện của C-D3)

"Lệnh thật" là lệnh gửi ra một sàn bên ngoài (Binance hay bất kỳ sàn nào) bằng tiền thật.

**Hiện trạng đã kiểm 2026-10-13: không có đường nào gửi lệnh thật.**
- Tìm `/api/v3/order`, `/fapi/v1/order`, `/sapi/`, `X-MBX-APIKEY`, ký HMAC trên `server`, `packages`, `apps`, `infra`, `legacy`, `e2e`, `vendor`: không có kết quả. HMAC duy nhất là mã 2FA (`auth/totp.ts:53`).
- Gọi ra Binance đều là GET công khai không ký: `market/binance.ts:32,36,98`, `market/depthSnapshots.ts:16`, `futures/config.ts:127`, cùng WebSocket công khai.
- Các POST ra ngoài khác không phải giao dịch: Cloudflare Turnstile (`auth/captcha.ts:9`), Resend (`auth/email.ts:38`), Telegram (`ops/alerts.ts`).
- Không có biến cấu hình khóa API sàn nào (`.env.example`).
- Chuỗi import **giá trị** của `OrderService` và `FuturesService` không chạm code mạng (chỉ có `import type` tới `market/*`, `futures/config.ts`).

Bốn lớp chặn, để điều này **luôn** đúng về sau. Mỗi lớp có test tự động, gồm cả ca vi phạm cố ý để chứng minh test **có thể đỏ**:
| Lớp | Cách chặn | Test chứng minh |
|---|---|---|
| 1. Kiến trúc | `executor.ts` chỉ nhận một giao diện `SimOrderGateway` **được truyền vào** từ `main.ts`, gồm `OrderService.placeOrder/cancel` (Spot) và `FuturesService.placeOrder/cancel` (Futures), đều ghi vào PostgreSQL của sàn ảo. Giao diện không có tham số URL, khóa, máy chủ | Test executor dùng gateway thật trên DB test |
| 2. Chuỗi import | Test `signals/importBoundary.test.ts` duyệt **chuỗi import giá trị** (bỏ qua `import type`) bắt đầu từ `server/src/modules/signals/executor.ts`. Không file nào trong chuỗi được: import `node:http`, `node:https`, `node:tls`, `node:dgram`, `undici`, `ws`, `modules/market/binance.ts`, `modules/market/depthSnapshots.ts`; hoặc gọi `fetch(`. Cho phép `pg` / `db/client.ts` (database) | Có ca vi phạm cố ý: chạy cùng hàm duyệt trên một chuỗi file mẫu nằm trong thư mục test, có import `node:https` → hàm báo lỗi |
| 3. Cấu hình | `loadConfig` (`config.ts:68`) **từ chối khởi động** khi có biến môi trường khớp `^(BINANCE\|BYBIT\|OKX\|KUCOIN\|GATEIO\|MEXC\|BITGET\|HTX\|KRAKEN\|COINBASE)_.*(KEY\|SECRET)` | `loadConfig({ BINANCE_API_KEY: 'x', … })` ném lỗi rõ ràng; `BINANCE_REST_URL` vẫn được nhận |
| 4. Mã nguồn toàn dự án | Test tĩnh `server/src/ops/noRealTrading.test.ts` quét `server/src`, `server/scripts`, `packages/*/src`, `infra`, `apps/*/src` (bỏ `node_modules`, `dist`, `vendor`, `legacy`): không có đường dẫn đặt/hủy lệnh của sàn ngoài (`/api/v3/order`, `/api/v3/order/oco`, `/api/v3/orderList`, `/fapi/v1/order`, `/fapi/v1/batchOrders`, `/sapi/`, `/v5/order`), không có header `X-MBX-APIKEY`. `createHmac` chỉ được xuất hiện trong danh sách cho phép (`auth/totp.ts`). Mọi `fetch(` trong `modules/market/**` và `futures/config.ts` không có `method` khác `GET` | Có ca vi phạm cố ý: hàm quét chạy trên chuỗi văn bản mẫu chứa `/api/v3/order` → báo lỗi |

**Test chạy thật với mạng bị chặn** (`signals/executor.network.test.ts`):
- Chạy với `MARKET_FEED=sim`. Email và Telegram tắt.
- Vá `net.Socket.prototype.connect` để ghi lại **mọi** lần mở kết nối TCP và từ chối mọi địa chỉ không phải loopback (`127.0.0.1`, `::1`, `localhost`; PostgreSQL test chạy ở đây).
  Cách này bắt được cả `http`, `https`/`tls`, `undici`/`fetch`, `ws`, vì tất cả đều mở socket qua lớp này. Không dùng `MockAgent` một mình, vì nó chỉ chặn `fetch`.
- Cho bot xử lý 20 tín hiệu Spot LONG + Futures LONG/SHORT, gồm vào lệnh, TP/SL, hết hạn, hủy.
- Khẳng định:
  - **0** lần mở kết nối tới địa chỉ không phải loopback;
  - **đúng 20** lệnh vào đã được đặt, để test không thể qua khi bot không làm gì;
  - mọi lệnh nằm trong `orders` / `futures_orders` của tài khoản `is_bot` với `source = 'SIGNAL'`;
  - đối soát sổ cái sạch.
- Ca đối chứng trong cùng file: thử mở một kết nối tới `1.1.1.1:443` → bị ghi lại và từ chối, chứng minh bộ chặn hoạt động.

Executor kiểm tài khoản trước mỗi lệnh: tài khoản không phải `is_bot` (cấu hình sai `SIGNAL_BOT_USER_ID`) → từ chối, ghi log lỗi, không đặt lệnh. Có test.

Bot chỉ ảnh hưởng tài khoản của chính nó: lệnh mỗi người khớp với sổ lệnh Binance một cách độc lập. Trong `exchange/matcher.ts` chưa thấy cơ chế trừ thanh khoản dùng chung giữa người dùng. Reviewer xác nhận lại điểm này ở C5.

**Việc**
0. Migration (chỉ thêm): `futures_orders` thêm `source text not null default 'USER'` + `source_id bigint null`. Hiện bảng này chưa có nguồn lệnh như `orders`.
   - Hủy lệnh qua API người dùng từ chối lệnh `source ≠ 'USER'`, giống Grid/DCA bên Spot.
   - Hợp đồng: `FuturesOrder.source`, kèm CHANGELOG. Lead giao contract-designer làm trước đợt này.
1. Script `npm run signals:bot-setup`:
   - tạo tài khoản hệ thống (`is_bot = true`, không mật khẩu, email `signal-bot@system.local`);
   - nạp tiền ảo qua **faucet** (đi đúng `applyBalanceChanges`, loại `FAUCET`) và chuyển một phần sang ví Futures cho lệnh SHORT;
   - ghi audit.
2. `server/src/modules/signals/executor.ts`. Khi có tín hiệu mới (sau commit) và `SIGNAL_BOT_ENABLED=true`:
   - đúng thị trường của tín hiệu (mục 3.2): LONG Spot → Spot Limit tại giá vào kèm TP/SL; LONG/SHORT Futures → Futures Limit (đòn bẩy 1–2×) kèm TP/SL;
   - khối lượng = `positionSizeForRisk(vốn bot, 1%, giá vào, SL, stepSize, phí)`;
   - **chỉ đặt qua `SimOrderGateway`**: Spot `OrderService.placeOrder(botId, …, { source: 'SIGNAL', sourceId: signalId })`, Futures `FuturesService.placeOrder` với `source: 'SIGNAL'`. Không có đường tắt số dư;
   - mỗi tín hiệu **đúng một** lệnh (kiểm `sourceId` đã có lệnh chưa, trong transaction);
   - tín hiệu `EXPIRED`/`INVALIDATED` → hủy lệnh chờ;
   - sàn dừng → không đặt.
3. Thống kê bot: đường vốn từ ảnh chụp danh mục hằng giờ (có sẵn), so với chấm điểm theo nến (tiêu chí 6 của cổng).
4. Test:
   - tín hiệu → 1 lệnh;
   - phát lại → vẫn 1;
   - hết hạn → lệnh bị hủy;
   - sàn dừng → không lệnh;
   - lệnh `source = 'SIGNAL'` không hủy được qua API người dùng (như Grid/DCA);
   - admin không sửa/reset được tài khoản bot (`BOT_ACCOUNT_PROTECTED` vẫn đúng); dừng bot = tắt cờ, executor hủy lệnh chờ của bot;
   - lệnh bot khớp → **không** tạo mục nhật ký (nếu Module A đã gộp); thống kê `BOT_FILLS` tách khỏi `MODELED_CANDLES`;
   - **đối soát sổ cái sạch** sau mọi test;
   - đủ các test của bốn lớp ranh giới (gồm ca vi phạm cố ý) và test mạng bị chặn (gồm ca đối chứng) ở trên.

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; reviewer không P0/P1 (kiểm riêng tranh chấp, trùng lệnh, **và bốn lớp ranh giới**: reviewer chạy các test ranh giới, xác nhận có ca vi phạm cố ý và ca đối chứng, và đọc chuỗi import của `executor.ts`; reviewer **không** sửa file).
- [ ] Cờ mặc định tắt; tài liệu bật/tắt trong `docs/deploy/may-ca-nhan.md`.

**Lệnh giao việc**
> Làm **Đợt C5** theo `docs/plans/module-C-engine-tin-hieu.md`. Nhánh `be/signals-c5-bot`. Gọi skill `ledger-order-concurrency` trước khi viết executor. Bot chỉ được đặt lệnh qua `SimOrderGateway` (Spot `OrderService`, Futures `FuturesService`) với `source: 'SIGNAL'`; không import gì từ `server/src/modules/analysis/` ngoài kiểu dữ liệu. Làm đủ bốn lớp ranh giới "không thể gửi lệnh thật" và test mạng bị chặn, mỗi test có ca vi phạm cố ý / ca đối chứng — đây là điều kiện duyệt C-D3. Luật chuỗi import chỉ áp cho `executor.ts` và những gì nó import; phần còn lại của `modules/signals` (bộ chấm C3) được dùng hàm tải bù nến được truyền vào.

---

### Đợt C6 — Giao diện Admin "Hiệu quả tín hiệu" + test nghiệm thu
| | |
|---|---|
| Người làm | **Antigravity** theo `PROMPT-15` (viết ở cuối C1) ∥ `cex-e2e-acceptance` |
| Cần trước | C1 (giao diện trên mock); test chạy khi C2–C3 đã gộp |
| Thời lượng | Antigravity 2–3 lượt; e2e 1 lượt |

**PROMPT-15 sẽ yêu cầu** (`apps/admin`):
- **Trang "Tín hiệu":**
  - danh sách có lọc;
  - chi tiết với biểu đồ vùng vào/SL/TP, diễn biến trạng thái;
  - báo cáo phân tích: tóm tắt, ý kiến từng phòng ban, điều kiện vô hiệu.
- **Trang "Hiệu quả":**
  - thẻ: số tín hiệu, win rate, kỳ vọng R, PF, drawdown R;
  - đường R lũy kế;
  - theo cặp/chiều/rating;
  - bảng hiệu chỉnh confidence;
  - số EXPIRED/INVALIDATED/DATA_GAP_EXIT;
  - giả định chi phí của phiên bản (phí, trượt giá, luật khớp) hiện cạnh số liệu;
  - **bảng cổng M3**: thanh tiến độ tới 100, từng tiêu chí đạt/chưa. Kết luận hiện đúng chữ `ELIGIBLE_FOR_REVIEW` = "Đủ điều kiện xem xét — chưa phải phê duyệt phát hành". **Không** có nút "phát hành";
  - số liệu bot (`BOT_FILLS`) ở thẻ riêng, không cộng vào số chấm theo nến.
- **Trang "Cấu hình engine":**
  - danh sách phiên bản;
  - tạo phiên bản mới (form có kiểm giới hạn);
  - kích hoạt: hộp xác nhận + lý do (vào nhật ký quản trị);
  - cảnh báo "kích hoạt phiên bản mới = đếm cổng M3 lại từ 0".
- **Mục bot (nếu bật):** đường vốn, lệnh đang mở (huy hiệu "Bot tín hiệu", không có nút sửa số dư).
- Nút/trang hiện theo quyền `signals.view` / `signals.manage`.
- Web sàn: huy hiệu `SIGNAL` trong bảng lệnh nếu xuất hiện.

**Việc — e2e-acceptance:** `e2e/tests/admin-signals.spec.ts` (dữ liệu tạo bằng `e2eSeedSignals.ts`, như fixture `createInvite`)
1. Admin thấy danh sách + chi tiết + thống kê đúng số API.
2. Support (chỉ `signals.view`) không thấy nút tạo/kích hoạt phiên bản. Gọi thẳng API → bị từ chối.
3. Tạo phiên bản 2 + kích hoạt → nhật ký quản trị có 2 dòng; bảng cổng đếm lại từ 0.
4. Người dùng thường mở `/admin/signals` → bị từ chối.

**Nghiệm thu:** `npm run ui-check -- --e2e` xanh; lead rà giao diện (báo cáo `…-ra-soat-ui-lan-N.md`).

---

### Đợt C7 — Chạy thật và đo (lặp hằng tuần, 1–3 tháng)
| | |
|---|---|
| Người làm | Lead + `cex-quant-engineer` (báo cáo) — chủ dự án bật cờ |
| Cần trước | C2 + C3 trên sàn thật (C5, C6 có thể sau) |

1. Chủ dự án đồng ý → `host backup` → `host update` → thêm `SIGNALS_ENABLED=true` vào `host-data/.env.host` → `start`. Phiên bản 1 bắt đầu đếm.
2. Mỗi tuần: `npm run signals:report` (lead viết ở C3 hoặc ở đây) → `docs/reports/<ngày>-tin-hieu-tuan.md`:
   - số lần chạy, tín hiệu, đã đóng;
   - kỳ vọng R + khoảng tin cậy;
   - tiến độ cổng;
   - khoảng trống dữ liệu (sàn tắt);
   - so với backtest.
3. **Kiểm soát thay đổi:** trong lúc đo không đổi cấu hình. Muốn đổi → ghi giả thuyết (`nhat-ky-gia-thuyet.md`) → phiên bản mới → đếm lại.
4. Khi một phiên bản có ≥ 100 tín hiệu đã đóng → báo cáo cổng M3:
   - `NOT_MET` → sửa engine = phiên bản mới (qua nhật ký giả thuyết), đo lại;
   - `ELIGIBLE_FOR_REVIEW` → **chỉ** mở bước xem xét phát hành (mục 3.4). Module C dừng ở đây.
     Bán tín hiệu cần hồ sơ phê duyệt có chữ ký của chủ dự án, cùng một kế hoạch GĐ6 riêng.

## 5. Rủi ro và cách chặn
| Rủi ro | Chặn bằng |
|---|---|
| Nhìn trước tương lai (dùng nến chưa đóng, chạy bù bằng dữ liệu hiện tại) | Chỉ chạy trên sự kiện nến đã đóng; không chạy bù; test riêng; reviewer kiểm |
| Chỉnh tham số tới khi "đẹp" | Phiên bản engine bất biến, đếm lại khi đổi; nhật ký giả thuyết commit trước; holdout chốt trước, mở một lần/phiên bản, có sổ ghi (mục 3.5); đếm số cấu hình đã thử cho DSR |
| Kết quả đẹp giả do mô hình khớp lạc quan | Bảng 3.2: xuyên giá mới khớp, không tính TP ở nến vào lệnh, SL trước, phí taker hai chiều, trượt giá tối thiểu 5 bps, lỗ hổng dữ liệu tính là thua |
| Trộn số liệu engine / bot / nhật ký | `basis` trong mọi thống kê; `evaluateM3Gate` từ chối dữ liệu trộn; [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) |
| Đạt cổng bị hiểu là được bán | `verdict` chỉ có `ELIGIBLE_FOR_REVIEW`; không code nào tự mở; phát hành cần hồ sơ phê duyệt + kế hoạch GĐ6 riêng (mục 3.4) |
| Backtest khác chạy thật (thiếu sổ lệnh/phái sinh lịch sử) | Ghi rõ giới hạn; cổng M3 chỉ dùng số liệu chạy thật |
| Sàn thật tắt/ngủ → mất nến, tín hiệu thiếu | Ghi khoảng trống; báo cáo tuần nêu tỷ lệ thời gian chạy; không chạy bù |
| Bot làm sai số dư | Chỉ qua `OrderService`/`FuturesService`, một lệnh/tín hiệu, cờ tắt mặc định, đối soát sau test |
| Bot gửi lệnh ra sàn thật | Bốn lớp ranh giới (kiến trúc + truyền gateway vào, chuỗi import của executor, cấu hình từ chối khóa API sàn, test tĩnh toàn dự án) + test chạy với mạng bị chặn ở tầng socket (C5) |
| Đụng thay đổi chưa commit của Antigravity | C0: chủ dự án báo Antigravity ngừng sửa; kiểm kê chỉ đọc + mã băm; điểm dừng; chép sang worktree riêng; sao lưu nguyên file + `.claude/skills/` + `AGENT-HANDOFF/` trước khi gỡ; danh sách lệnh cấm; gộp hỏng thì `merge --abort` và chép lại từ bản sao lưu |
| Antigravity làm "Phase 3" (endpoint phân tích cho người dùng) song song, trái C-D1 | Mục 2.1: Module C thay thế `phase-3.md`; báo qua chủ dự án trước lượt 1 |
| Cổng M3 đạt nhờ tín hiệu tương quan | Một tín hiệu mở/cặp; bootstrap khối theo ngày; ≥ 30 ngày; giới hạn tỷ trọng cặp/tháng (mục 3.3.1) |
| DB phình (báo cáo jsonb, nến 1m) | Báo cáo đầy đủ chỉ cho tín hiệu; dọn lần chạy > 90 ngày, nến 1m > 60 ngày; theo dõi kích thước bản sao lưu |
| Phiên khác vẫn sửa hệ phân tích trong `main` | C0: commit lên `be/analysis` trước; quy tắc README mục 3 |
| Giấy phép Apache-2.0 | `THIRD_PARTY_NOTICES.md` + ghi nguồn ở file chuyển thể (C0) |

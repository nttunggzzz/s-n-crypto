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
5. **Hệ phân tích chỉ tư vấn:** `server/src/modules/analysis/` không bao giờ gọi `OrderService` / đổi số dư. Bot (C5) nằm ở `server/src/modules/signals/`, chỉ cho tài khoản `is_bot`, có cờ.
6. **Không LLM, không dữ liệu trả phí** ở GĐ4 (C-D2). Bộ kể chuyện tất định có sẵn.
7. **Không trộn nguồn dữ liệu:**
   - Chấm điểm theo nến (`MODELED_CANDLES`), bot trên sàn ảo (`BOT_FILLS`) và nhật ký người dùng (`ACTUAL_FILLS`) là ba nguồn riêng.
   - Dùng chung **công thức** R (`@cex/core/rMetrics`), không dùng chung **dữ liệu** hay **giả định thực thi**.
   - Xem [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) mục 2.
8. **Cổng M3 không phải phê duyệt phát hành.** Không có code nào tự mở tín hiệu cho người dùng (mục 3.4).

## 2. Hiện trạng (2026-10-13, đã kiểm)
| Có | Ở đâu | Ghi chú |
|---|---|---|
| Hệ phân tích 7 phòng ban + điều phối | `server/src/modules/analysis/` (orchestrator, departments/*, snapshotBuilder, **cexMarketAdapter** `analyzeSymbol()`), `packages/core/src/quant.ts`, `packages/contracts/src/analysis.ts` | **Chưa commit**, phiên khác còn đang sửa. Typecheck/lint còn lỗi ở `cexMarketAdapter*.ts`. 20/20 test (phần cũ) đạt |
| Backtest walk-forward + DSR/PBO | `server/src/modules/analysis/backtester.ts` `runWalkForwardBacktest()` | Không có sổ lệnh lịch sử → sổ lệnh tổng hợp (giới hạn đã ghi trong tài liệu kiến trúc) |
| Đề xuất giao dịch | `AdvisoryTradeProposal`: `action`, `entryPrice`, `stopLossPrice`, `takeProfitPrice` (+ `rating`, `confidence`, `uncertaintyScore`, `invalidationConditions` trong báo cáo) | Là nguyên liệu của "tín hiệu" |
| Nến Spot đã đóng, 50 cặp, mọi khung | bảng `candles` (ghi từ WebSocket khi sàn chạy), REST Binance cho lịch sử (`fetchKlines`) | Chỉ có từ ngày sàn bắt đầu chạy |
| Sự kiện nến | `MarketDataService` phát `'candle'` (có cờ `closed`) | Điểm móc cho bộ chạy ngầm |
| Tài khoản bot | `users.is_bot`; admin không sửa được (`BOT_ACCOUNT_PROTECTED`) | Dùng cho C5 |
| Đặt lệnh kèm TP/SL, OCO, `positionSizeForRisk` | `OrderService`, `@cex/core` | Dùng cho C5 |
| Quyền cấp tín hiệu cho người dùng | `users.signals` / `signalsAccess` | GĐ6, chưa dùng ở module này |

## 3. Định nghĩa (đề xuất — chốt cùng C-D4, C-D5)

**Tín hiệu** sinh ra từ một lần chạy `(phiên bản engine, cặp, khung, lúc nến đóng)` khi **đủ cả**:
- báo cáo không phải `REVIEW`;
- `rating` ∈ {BUY, OVERWEIGHT} với `action = LONG`, hoặc {SELL, UNDERWEIGHT} với `action = SHORT`;
- có đủ `entryPrice`, `stopLossPrice`, `takeProfitPrice`, đúng phía (LONG: SL < vào < TP);
- `R:R = |TP − vào| ÷ |vào − SL|` ≥ `minRewardRisk` (mặc định 1,5);
- `confidence` ≥ `minConfidence` (0,60), `uncertaintyScore` ≤ `maxUncertainty` (0,50);
- cặp đó **chưa có tín hiệu cùng chiều đang chờ/đang chạy** của cùng phiên bản;
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
| Nến mở đã vượt quá `entry` về phía có lợi lúc ra tín hiệu | Không đuổi giá. Chờ giá quay về `entry`; quá `entryValidityBars` → `EXPIRED` |
| **Nến vào lệnh** cũng chạm SL | Tính **SL_HIT** ngay trong nến đó |
| **Nến vào lệnh** chạm TP (không chạm SL) | **Không** tính TP trong nến vào lệnh (không biết TP xảy ra trước hay sau khi vào). Xét TP từ nến kế tiếp |
| Một nến chạm **cả TP và SL** | **SL_HIT** |
| **TP** | Lệnh giới hạn tại `target`. Khớp khi `high > target` (xuyên qua 1 tick). Giá ra = `target`; nến mở vượt TP vẫn chỉ tính `target` |
| **SL** | Lệnh dừng. Khớp khi `low ≤ stop`. Giá ra = `stop`, trừ thêm trượt giá. Nến **mở dưới SL** (gap) → giá ra = giá **mở** nến đó, trừ thêm trượt giá |
| **TIME_EXIT** | Hết `maxHoldingBars` (theo khung tín hiệu) → thoát ở giá **đóng** nến 1m cuối, trừ trượt giá |
| **Phí** | Phí **taker** của biểu phí lúc ra tín hiệu, tính **cả hai chiều**, trên giá trị vào và giá trị ra (không giả định được hưởng phí maker) |
| **Trượt giá** | `max(slippageBps của phiên bản, ước tính của phòng rủi ro trong báo cáo)`, tối thiểu 5 bps. Áp cho SL, TIME_EXIT, thoát do lỗ hổng dữ liệu. Không áp cho TP và giá vào giới hạn |
| **Futures/SHORT** | Thêm funding ước tính theo số mốc funding đi qua trong thời gian giữ, lấy theo lịch sử funding đã lưu; không có dữ liệu → dùng 0,01%/8h bất lợi |

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
| 1 | Số tín hiệu đã đóng | ≥ 100 |
| 2 | Kỳ vọng R ròng (trung bình) | > 0 |
| 3 | Cận dưới khoảng tin cậy 95% của kỳ vọng R (bootstrap 10.000 lần, hạt giống cố định) | > 0 |
| 4 | Drawdown tối đa của đường R lũy kế | ≤ 20R |
| 5 | Tỷ trọng R dương lớn nhất của một cặp / một tháng | ≤ 40% / ≤ 50% |
| 6 | Bot trên sàn ảo (nếu bật), `basis = BOT_FILLS` | cùng dấu kỳ vọng với chấm điểm theo nến (chỉ so, không gộp) |

- Kết luận của cổng chỉ có ba giá trị: `INSUFFICIENT_DATA` (chưa đủ 100), `NOT_MET` (đủ số nhưng trượt tiêu chí), `ELIGIBLE_FOR_REVIEW` (đạt cả 6).
  **Không có** giá trị "approved" hay "passed", và **không có code nào** tự bật hoặc mở thứ gì khi cổng đạt.
- Không đạt → sửa engine = phiên bản mới, đếm lại từ 0.

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

### Đợt C0 — Tiếp nhận hệ phân tích
| | |
|---|---|
| Người làm | Lead → `cex-quant-engineer` → `cex-reviewer` |
| Nhánh | `be/analysis` |
| Cần trước | **C-D0**: phiên đang viết hệ phân tích dừng và commit lên `be/analysis`, **hoặc** chủ dự án cho lead tiếp nhận nguyên trạng |
| Thời lượng | 1 lượt |

**Việc — lead**
1. Kiểm phiên kia đã dừng (file không còn thay đổi trong 10 phút; công cụ ListAgents/SendMessage để hỏi nếu được chủ dự án cho phép).
2. Tạo nhánh `be/analysis` từ `main`. Commit **đúng** các đường dẫn của hệ phân tích:
   - `packages/core/src/quant*.ts`, `packages/core/src/index.ts`;
   - `packages/contracts/src/analysis*.ts`, `packages/contracts/src/index.ts`;
   - `server/src/modules/analysis/**`, `docs/architecture/**`;
   - dòng `/vendor/` trong `.gitignore`;
   - `.claude/skills/crypto-multi-agent-analysis/`.
   
   Sau đó `main` sạch.

**Việc — quant-engineer**
1. Sửa hết lỗi typecheck/lint, ví dụ ở `cexMarketAdapter.test.ts`:
   - thiếu `quoteVolume` trong nến test;
   - đọc trường không tồn tại `executionAllowed`, `findings`, `bullBearDebate`;
   - `prefer-const`;
   - `no-useless-assignment` ở `cexMarketAdapter.ts:441`.
2. Chuẩn hóa hợp đồng `analysis.ts` theo quy ước dự án: tên trường camelCase (`PriorLessonsUsed` → `priorLessonsUsed`), tiền là `DecimalString`, thời điểm `EpochMs`/`IsoDateTime`, thiếu dữ liệu là `nullable`.
3. Chạy `npx tsx server/src/modules/analysis/cli.ts` và toàn bộ test. Ghi số.
4. Giấy phép Apache-2.0 của TradingAgents: thêm `THIRD_PARTY_NOTICES.md` ở gốc repo (tên dự án, URL, commit `1394a3f`, giấy phép) và dòng ghi nguồn ở đầu các file chuyển thể.

**Việc — reviewer:** rà toàn bộ nhánh theo skill `crypto-multi-agent-analysis` mục 5–6:
- nhìn trước tương lai;
- `Dec`;
- không bịa số khi thiếu dữ liệu;
- tách biệt khỏi `OrderService`;
- test không thể đỏ;
- thời gian chạy một lần phân tích (đo).

**Nghiệm thu**
- [ ] `npm run verify` đạt trên nhánh và sau khi gộp; test hệ phân tích N/N.
- [ ] Hợp đồng lên phiên bản mới (chỉ thêm export kiểu phân tích), CHANGELOG ghi rõ.
- [ ] Đo: một lần `analyzeSymbol` mất bao nhiêu ms (để tính tải cho C2).

**Lệnh giao việc**
> (quant-engineer) Làm **Đợt C0** theo `docs/plans/module-C-engine-tin-hieu.md`. Nhánh `be/analysis` (lead đã commit nguyên trạng). Gọi skill `crypto-multi-agent-analysis` trước. Không thêm tính năng mới — chỉ làm cho nhánh sạch lỗi, đúng quy ước, có ghi nguồn giấy phép.

---

### Đợt C1 — Hợp đồng tín hiệu (chỉ Admin)
| | |
|---|---|
| Người làm | `cex-contract-designer` |
| Nhánh | `be/signals-c1-contracts` |
| Cần trước | C0 đã gộp; chủ dự án duyệt C-D4, C-D5 |
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
   - `SignalGateReport`: 6 tiêu chí (`value`, `threshold`, `passed`), `verdict: SignalGateVerdict` (`INSUFFICIENT_DATA | NOT_MET | ELIGIBLE_FOR_REVIEW`).
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
2. Test vàng: mỗi lý do từ chối một ca; LONG/SHORT; sai phía SL/TP; R:R đúng ngưỡng (≥, không >); trùng chiều đang mở; `REVIEW`.

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
2. `computeSignalStats(closed[], basis)` + `evaluateM3Gate(closed[], opts)`:
   - dùng `summarizeR` + `bootstrapMeanCI` (thêm vào `rMetrics.ts`);
   - bootstrap 10.000 lần với **hạt giống cố định** (kết quả lặp lại được);
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
   Thiếu nến 1m → tải bù đúng khoảng thiếu từ Binance REST (`fetchKlines`, trong giới hạn trọng số), rồi theo luật lỗ hổng dữ liệu ở mục 3.2.
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
| Cần trước | C3 đã gộp; chủ dự án duyệt C-D3 |
| Thời lượng | 1–2 lượt |

**Việc**
1. Script `npm run signals:bot-setup`:
   - tạo tài khoản hệ thống (`is_bot = true`, không mật khẩu, email `signal-bot@system.local`);
   - nạp tiền ảo qua **faucet** (đi đúng `applyBalanceChanges`, loại `FAUCET`) và chuyển một phần sang ví Futures cho lệnh SHORT;
   - ghi audit.
2. `server/src/modules/signals/executor.ts`. Khi có tín hiệu mới (sau commit) và `SIGNAL_BOT_ENABLED=true`:
   - LONG: Spot Limit tại giá vào, kèm TP/SL;
   - SHORT: Futures Limit (đòn bẩy 1–2×) kèm TP/SL;
   - khối lượng = `positionSizeForRisk(vốn bot, 1%, giá vào, SL, stepSize, phí)`;
   - **đặt qua `OrderService.placeOrder(botId, …, { source: 'SIGNAL', sourceId: signalId })`** — không có đường tắt số dư;
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
   - **đối soát sổ cái sạch** sau mọi test.

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; reviewer không P0/P1 (kiểm riêng tranh chấp và trùng lệnh).
- [ ] Cờ mặc định tắt; tài liệu bật/tắt trong `docs/deploy/may-ca-nhan.md`.

**Lệnh giao việc**
> Làm **Đợt C5** theo `docs/plans/module-C-engine-tin-hieu.md`. Nhánh `be/signals-c5-bot`. Gọi skill `ledger-order-concurrency` trước khi viết executor. Bot chỉ được gọi `OrderService.placeOrder` với `source: 'SIGNAL'`; không import gì từ `server/src/modules/analysis/` ngoài kiểu dữ liệu.

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
| Bot làm sai số dư | Chỉ qua `OrderService`, một lệnh/tín hiệu, cờ tắt mặc định, đối soát sau test |
| DB phình (báo cáo jsonb, nến 1m) | Báo cáo đầy đủ chỉ cho tín hiệu; dọn lần chạy > 90 ngày, nến 1m > 60 ngày; theo dõi kích thước bản sao lưu |
| Phiên khác vẫn sửa hệ phân tích trong `main` | C0: commit lên `be/analysis` trước; quy tắc README mục 3 |
| Giấy phép Apache-2.0 | `THIRD_PARTY_NOTICES.md` + ghi nguồn ở file chuyển thể (C0) |

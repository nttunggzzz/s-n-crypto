# Module A — Nhật ký giao dịch & thống kê cá nhân (Giai đoạn 5)

Đọc trước:
- [README](README.md): đội ngũ, quy trình, bảng quyết định A-D1…A-D7.
- **[Quy ước R và tách nguồn dữ liệu](quy-uoc-R-va-nguon-du-lieu.md)** (bắt buộc).
- ROADMAP GĐ5; `docs/parts/P05-loi-san.md` dòng 40–41; `P08-ui-san.md` "Giai đoạn 5".

## 1. Người dùng được gì
- Mỗi giao dịch của tôi **tự có một mục nhật ký**, dựng từ chính các lần khớp lệnh trên sàn ảo. Không phải nhập lại giá, khối lượng hay phí.
- Tôi bổ sung:
  - **setup** (vì sao vào lệnh);
  - **kế hoạch** (giá vào, dừng lỗ, chốt lời);
  - **lỗi** đã mắc (FOMO, không đặt dừng lỗ…);
  - **điểm** tự chấm 1–5;
  - **ghi chú**, **ảnh** chart.
- Sàn **tự tính kết quả** từ các lần khớp thật:
  - lãi/lỗ đã chốt (đã trừ phí);
  - giá vào/ra trung bình;
  - thời gian giữ;
  - **R** theo [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md).
- **Thống kê cá nhân:**
  - win rate, kỳ vọng R, profit factor;
  - drawdown (USDT và R), chuỗi thắng/thua;
  - theo setup, coin, hướng, ngày trong tuần, theo lỗi (ví dụ: "FOMO làm bạn mất 3,4R").

Mục đích: tập kỷ luật giao dịch trên sàn ảo. **Không dùng AI.** Giao diện do Antigravity làm.

**Không làm** trong module này:
- chia sẻ nhật ký công khai;
- AI nhận xét;
- nhập lệnh từ sàn khác;
- nhật ký cho lệnh Grid/DCA/bot tín hiệu (A-D5);
- tách hoặc gộp mục bằng tay;
- xuất CSV nhật ký (để sau, dễ thêm vào `exports`).

## 2. Mô hình

### 2.1 Vòng giao dịch: một mục nhật ký là gì (A-D1)

Đơn vị ghi nhận là **từng lần khớp**: dòng `trades` cho Spot, dòng `futures_trades` cho Futures. Không ghi theo lệnh.
Một lệnh khớp làm nhiều lần sẽ có nhiều dòng; mỗi dòng (mỗi **chân**, xem Futures) được ghi nhận đúng một lần.

**Spot**, mỗi (người dùng, cặp) có **tối đa một mục `AUTO` đang `OPEN`** (chỉ mục duy nhất có điều kiện `status = 'OPEN' AND origin = 'AUTO'`).

| Sự kiện khớp | Xử lý |
|---|---|
| **MUA**, chưa có mục OPEN của cặp | **Mở** mục mới. `opened_at` = thời điểm khớp |
| **MUA**, đã có mục OPEN | **Cộng vào** mục đó (mua thêm) |
| **BÁN**, có mục OPEN | Phân bổ vào mục, **tối đa bằng khối lượng còn mở** của mục. Phần dư (bán coin có từ trước, từ faucet hoặc do bot mua) ghi `unattributed_qty`, không thuộc mục nào |
| **BÁN**, không có mục OPEN | Ghi nhận toàn bộ là `unattributed_qty`. **Không** mở mục (Spot không bán khống) |
| Sau một lần BÁN, khối lượng còn mở < `stepSize`, **hoặc** khối lượng còn mở × **giá của chính lần khớp đó** < `minNotional` | **Đóng** mục: `closed_at` = thời điểm lần khớp đó. Phần lẻ ghi `dust_qty`, không tính lãi/lỗ |
| **MUA** sau khi mục đã đóng | Mở **mục mới** |

- `stepSize` và `minNotional` được **chép vào mục lúc mở** (`lot_step`, `lot_min_notional`). Như vậy luật cặp có đổi về sau thì dựng lại vẫn cho đúng kết quả cũ.
  Không dùng giá thị trường lúc xử lý, vì như thế dựng lại sẽ không xác định.
- Khối lượng còn mở = Σ(khối lượng mua − phí mua tính bằng coin gốc) − Σ khối lượng bán đã phân bổ.
  Trên sàn này phí MUA trừ bằng coin gốc (`orderService.ts:505`, `feeAsset = base`).
- Một lần khớp BÁN chia giữa phần phân bổ và phần dư thì tiền thu và phí bán chia **theo tỷ lệ khối lượng**, làm tròn 8 chữ số. Phần tiền thu của người dùng làm tròn xuống (bất biến 2).
- **Giới hạn đã biết:** bot DCA/Grid dùng chung ví Spot với người dùng. Người dùng tự bán coin do bot mua thì phần bán đó vẫn bị trừ vào mục của người dùng (lần khớp có `source = 'USER'`). Giao diện ghi chú điều này. Đối soát không phát hiện được trường hợp này.

**Futures**: một mục ứng với **đúng một vị thế** (`futures_positions.id`).

Hiện trạng đã kiểm 2026-10-13 (`futures/service.ts:390–510`): **không** thể gán lần khớp theo cột `position_id` có sẵn.
- Lần khớp **đóng hết** vị thế được ghi `position_id = NULL`: dòng 421–428 đặt `pos = undefined` trước khi lấy `positionId`.
- Lần khớp **đảo chiều** (đóng vị thế cũ + mở vị thế mới trong một lệnh) chỉ có **một** dòng, với `position_id` của vị thế **mới**, dù khối lượng gồm cả phần đóng vị thế cũ.
- Thanh lý (`service.ts:773`) ghi đúng `position_id`.

Vì vậy đợt **A2** thêm (chỉ thêm, có giá trị cho lần khớp từ nay) ba cột vào `futures_trades`, do `FuturesService` ghi **trong cùng transaction** khớp lệnh:
- `closed_position_id` (vị thế bị giảm/đóng trong lần khớp, `null` nếu không có);
- `close_qty`;
- `open_qty`.

Mỗi lần khớp Futures có **tối đa hai chân**:
- chân `CLOSE` (`close_qty > 0`) thuộc mục của `closed_position_id`;
- chân `OPEN` (`open_qty > 0`) thuộc mục của `position_id`.

Vị thế đóng (kể cả TP/SL, thanh lý, đảo chiều) → mục đóng. Bị thanh lý thì có cờ `liquidated`.
Lần khớp Futures từ trước khi có ba cột này không bao giờ vào nhật ký tự động: nó nằm trước cửa sổ tự ghi, xem 2.2.

**Lần khớp không vào nhật ký vĩnh viễn** (vẫn ghi một dòng `journal_fills` có `entry_id = null` và lý do, để không xét lại):
- `NOT_USER_SOURCE`: lệnh có `source ≠ 'USER'` (GRID, DCA, sau này SIGNAL);
- `BOT_ACCOUNT`: lệnh của tài khoản `is_bot`.

Lần khớp **nằm ngoài cửa sổ tự ghi** (trước ngày phát hành, hoặc lúc người dùng tắt tự ghi) **không** được ghi dòng nào. Nó để trống, để người dùng có thể tự tạo mục (`MANUAL`) từ nó (mục 2.4).

### 2.2 Cửa sổ tự ghi, chống ghi trùng và không bỏ sót

**Cửa sổ tự ghi (A-D2):**
- Bảng `journal_feature` có một dòng `started_at`. Migration ghi giá trị này bằng `now()` lúc server bản mới chạy migration, tức là thời điểm phát hành.
- Bảng `journal_auto_windows(user_id, started_at, ended_at null)`.
  - Người dùng chưa có dòng nào thì được coi là **bật** từ `journal_feature.started_at`. Bộ xử lý tạo dòng này khi gặp người đó lần đầu.
  - Tắt tự ghi: đặt `ended_at = now()`. Bật lại: thêm dòng mới `started_at = now()`.
  - Vì vậy **không bao giờ ghi bù** lịch sử: bật lại không kéo theo lần khớp lúc đang tắt.
- Một lần khớp **đủ điều kiện tự ghi** khi `created_at` nằm trong một cửa sổ của người đó.
- Bật/tắt qua endpoint riêng của nhật ký (`journalSettings`, mục 2.7), **không** qua preferences.
  Lý do: `UpdatePreferencesRequest = Preferences.partial()` (`account.ts:42`) sẽ cho người dùng tự sửa mốc, và preferences tự quay về mặc định khi dữ liệu lỗi (`preferencesService.ts:16`).

**Chống ghi trùng và không bỏ sót:**
1. **Mỗi chân của một lần khớp có đúng một dòng** trong `journal_fills`:
   - `unique(spot_trade_id)` cho Spot;
   - `unique(futures_trade_id, leg)` cho Futures.

   Dòng này vừa là phân bổ vừa là dấu "đã xử lý". Xử lý lại thì vi phạm unique, nên bỏ qua.
2. **Nguồn sự thật là bảng khớp lệnh, không phải sự kiện trong bộ nhớ.**
   - Bộ xử lý tìm các lần khớp **đủ điều kiện tự ghi** mà **chưa có** dòng `journal_fills` (anti-join), cũ hơn **2 giây**, rồi xử lý theo `id` tăng dần.
   - Sự kiện `ex.events` (Spot) và `FuturesEvents` sau commit chỉ dùng để **đánh thức**.
   - Quét lúc khởi động và mỗi 60 giây.
   - Mốc 2 giây **không bảo đảm** đúng thứ tự: `created_at` mặc định là `now()` = lúc **bắt đầu** transaction, và mã `id` lấy lúc chèn có thể commit lệch thứ tự. Lệch thứ tự hiếm xảy ra, nhưng được đối soát bắt và sửa (loại (e), mục 2.3).
3. **Tuần tự theo người dùng:** mọi thao tác ghi nhật ký của một người (bộ tự ghi, tạo mục tay, đối soát) chạy trong transaction có `pg_advisory_xact_lock` theo người đó.
4. Trong cùng **một transaction**: chèn dòng `journal_fills`, cập nhật mục, tính lại kết quả.
   Lỗi thì rollback, ghi log, thử lại tăng dần (tối đa 5 phút). **Không bao giờ** chạm vào lệnh, số dư hay sổ cái: nhật ký chỉ **đọc** dữ liệu sàn.
   Ngoại lệ duy nhất là ba cột mới của `futures_trades`, do chính `FuturesService` ghi lúc khớp, không phải nhật ký.
5. Bất biến kiểm bằng test và đối soát:
   - mọi chân của lần khớp đủ điều kiện đều có đúng một dòng;
   - phân bổ đang lưu = phân bổ dựng lại từ đầu (`replayAllocations`) theo `id`;
   - Spot: Σ phân bổ khớp khối lượng còn mở + `dust_qty`.

### 2.3 Đối soát nhật ký (điều kiện của A-D2)

Điều kiện chủ dự án đặt cho A-D2: dữ liệu giao dịch bị **điều chỉnh, đảo ngược hoặc phát hiện thiếu** thì nhật ký phải tự phát hiện và sửa theo, có dấu vết.

**Hiện trạng đã kiểm (2026-10-13):**
- Sàn **không** sửa hay xóa dòng `trades` / `futures_trades`; trong `server/src` không có `update`/`delete` trên hai bảng này.
- Các thay đổi làm nhật ký lệch dữ liệu thật:
  - (a) **Admin reset tài khoản** (`adminService.ts:442`): số dư về 0 bằng `ACCOUNT_RESET` mà không có lần khớp. Spot: dòng sổ cái `account = 'SPOT'`, `refType = 'ADMIN'`. Vị thế Futures đóng với `closeReason = 'ADMIN'` và không có lần khớp (`futures/service.ts:867`).
  - (b) **Coin rời ví không qua khớp lệnh**: `ADMIN_ADJUST` của admin, hoặc bot lưới dùng chung ví.
  - (c) **Lần khớp đủ điều kiện chưa được ghi nhận**: mất sự kiện, server tắt, lỗi bộ ghi.
  - (d) Sau này có tính năng hủy/sửa lần khớp (hiện chưa có): dòng khớp đổi giá trị hoặc biến mất.
  - (e) **Phân bổ lệch thứ tự** do commit lệch (mục 2.2 điểm 2).

| Loại lệch | Phát hiện bằng | Xử lý | Tự sửa? |
|---|---|---|---|
| (c) Lần khớp chưa ghi nhận | Anti-join trên lần khớp đủ điều kiện | Gọi `processFills` | **Có** |
| (a) Reset tài khoản | Spot: có dòng sổ cái `ACCOUNT_RESET` của người đó với `account = 'SPOT'` sau `opened_at` của mục đang mở (không lọc theo coin). Futures: vị thế của mục có `closeReason = 'ADMIN'` | Mục chuyển `VOID`, `close_reason = 'ACCOUNT_RESET'` / `'ADMIN_CLOSE'`. Phần đã chốt trước đó vẫn giữ để xem, **không** tính vào thống kê | **Có** |
| (b) Ví ít coin hơn khối lượng còn mở của mục | **Sau khi** đã xử lý hết lần khớp chờ (cùng khóa), so `available + locked` của coin gốc trong ví Spot với Σ khối lượng còn mở các mục OPEN của cặp | Mục bật cờ `needs_review`; không tự đóng. Giao diện hiện "Số coin trong ví ít hơn nhật ký — có thể đã chuyển hoặc điều chỉnh" | **Không**: chỉ đánh dấu |
| (d) Lần khớp đổi hoặc mất | `journal_fills.fill_fingerprint` (sha256 của giá, khối lượng, phí, phía, mã lệnh, các cột chân Futures) khác dòng khớp hiện tại, hoặc dòng khớp không còn | **Dựng lại** phân bổ của (người dùng, cặp) từ lần khớp sớm nhất bị ảnh hưởng | **Có**, ghi dấu vết |
| (e) Phân bổ lệch thứ tự | `replayAllocations` của các lần khớp đã ghi nhận ≠ phân bổ đang lưu | Dựng lại như (d) | **Có**, ghi dấu vết |
| Kết quả lưu sẵn lệch kết quả tính lại | Tính lại `computeEntryResult` từ `journal_fills` | Ghi đè kết quả lưu sẵn | **Có** |

**Luật dựng lại:**
- Không bao giờ xóa ghi chú, setup, kế hoạch, ảnh của người dùng.
- Mục được nhận diện bằng **lần khớp mở mục**. Mục nào sau khi dựng lại không còn lần khớp mở thì chuyển `VOID` với `adjustment_reason`, ghi chú vẫn giữ nguyên.
- Mỗi lần điều chỉnh mục ghi `adjusted_at` + `adjustment_reason`, và hiện huy hiệu "Đã điều chỉnh do đối soát" trên giao diện.
- Thống kê **loại trừ** mục `VOID` và mục `needs_review`. Số mục bị loại hiện riêng, không giấu.

**Lịch chạy:**
- Ngay sau reset tài khoản: `adminService.resetAccount` gọi `journal.onAccountReset(userId)` **sau commit**. Lỗi ở đây không làm hỏng việc reset.
- Mỗi ngày một lần cho mọi người dùng, cùng giờ với đối soát sổ cái.
- Chạy tay: `npm run journal:reconcile -- [--user <id>] [--dry-run]`.

**Kết quả:**
- Mỗi lần chạy ghi một dòng `journal_reconcile_runs`: thời điểm, số người, số lần khớp đã kiểm, danh sách lệch theo loại, đã sửa gì.
- Có lệch loại (b), (d) hoặc (e) → cảnh báo Telegram qua `ops/alerts`, giống đối soát sổ cái.

### 2.4 Mục do người dùng tạo (`MANUAL`)
- **Nguồn:** chỉ những lần khớp **chưa có dòng** `journal_fills`, tức nằm ngoài cửa sổ tự ghi hoặc thuộc một mục `MANUAL` đã xóa. Lần khớp đã thuộc mục khác, hoặc đã bị loại vĩnh viễn (bot) → 409 `FILL_ALREADY_JOURNALED` / `BOT_ORDER`.
  Người dùng tự chọn lệnh cũ không phải "tự động nhập lịch sử", nên không trái A-D2.
- **Tạo:**
  - Spot: chọn ≥ 1 lệnh đã khớp cùng cặp (`orderIds`). Server lấy **mọi** lần khớp của các lệnh đó và chạy **cùng bộ phân bổ** theo `id`.
  - Futures: chọn một vị thế (`futuresPositionId`); lấy mọi chân của vị thế đó.
- **Vòng đời:** trạng thái tính như mục `AUTO`. Mục còn mở thì người dùng **thêm** lệnh được (`addOrderIds` trong `journalUpdate`, chỉ thêm, không gỡ); bộ phân bổ dựng lại toàn bộ mục theo `id`.
  Bộ tự ghi **không bao giờ** gắn lần khớp vào mục `MANUAL`.
- **Xóa** (chỉ `MANUAL`): xóa mục và **xóa các dòng `journal_fills` của nó**, để các lần khớp trở lại trạng thái trống. Ghi chú, ảnh xóa theo mục (người dùng tự chọn xóa).
- Lệnh của người khác → 404. Khác cặp → 409 `SYMBOL_MISMATCH`. Khác thị trường → 409 `MARKET_MISMATCH`. Lệnh chưa khớp → 409 `ORDER_NOT_FILLED`.

### 2.5 Kết quả (server tính, giao diện **không** tự tính)

R theo [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md), hàm `@cex/core/rMetrics`. Tất cả là `Dec`/chuỗi.

**Spot (A-D7: theo giá vốn của chính mục):**
- Giá vốn mỗi đơn vị ròng = Σ tiền USDT đã trả khi mua ÷ Σ khối lượng ròng nhận được (phí mua đã nằm trong giá vốn).
- Lãi/lỗ ròng = Σ(tiền thu phân bổ − phí bán phân bổ) − giá vốn × Σ khối lượng bán phân bổ.
- Giá vào = giá mua trung bình (trước phí). Khối lượng vào = Σ khối lượng mua (trước phí).

**Futures:**
- Lãi/lỗ: `realized_pnl − fees + funding` của vị thế, đúng định nghĩa đang dùng ở `pnlService.ts:100`. Vị thế được cập nhật đúng cả khi đóng bằng lệnh đảo chiều.
- Giá vào = `entry_price`.
- Khối lượng vào = Σ `open_qty` của các chân `OPEN` (**không** dùng `max_quantity`, vì cột này khác tổng khối lượng đã vào khi vào thêm sau khi đóng một phần).

**Dừng lỗ ban đầu** (mẫu số R):
- Spot: SL gắn kèm **lệnh mua đầu tiên** của mục (`orders.tpsl.stopLossPrice`).
- Futures: `stop_loss_price` của **lệnh mở vị thế** (`futures_orders`). **Không** lấy từ vị thế, vì lệnh vào thêm sau đó ghi đè SL của vị thế (`service.ts:457–458`).
- Không có thì là lần đầu người dùng nhập.
- Sửa được **cho tới lần khớp giảm vị thế đầu tiên** (bán hoặc chân `CLOSE` đầu tiên). Sau đó khóa. Sửa nữa chỉ đổi `plan_stop` để hiển thị, không đổi R, và giao diện gợi ý lỗi `MOVED_STOP`.

**Kết quả hiển thị:**
- Mục OPEN: kết quả `null`, chỉ có phần đã chốt (nếu có).
- Thống kê **chỉ dùng mục CLOSED** không `VOID` và không `needs_review`, sắp theo `(closed_at, id)`. Thiếu R thì vẫn tính trong thống kê USDT.

**Danh sách lỗi cố định** (`JournalMistake`): `FOMO`, `REVENGE`, `OVERSIZE`, `NO_STOP`, `MOVED_STOP`, `EARLY_EXIT`, `LATE_ENTRY`, `IGNORED_PLAN`, `OTHER`.

### 2.6 Bảng mới (một migration, chỉ thêm — an toàn với sàn thật)
| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `journal_feature` | `started_at` (một dòng, migration chèn `now()`) | khóa chính cố định |
| `journal_auto_windows` | `id`, `user_id`, `started_at`, `ended_at null` | index `(user_id, started_at)`; tối đa một dòng `ended_at is null` mỗi người (unique một phần) |
| `journal_entries` | `id uuid`, `user_id`, `market` (SPOT/FUTURES), `symbol`, `direction` (LONG/SHORT), `status` (OPEN/CLOSED/VOID), `close_reason null` (FILLS/LIQUIDATED/ACCOUNT_RESET/ADMIN_CLOSE), `needs_review bool`, `adjusted_at null`, `adjustment_reason null`, `origin` (AUTO/MANUAL), `futures_position_id null`, `lot_step`, `lot_min_notional`, `setup text null` (≤ 40), `tags text[]` (≤ 10 × 24), `initial_stop`, `initial_stop_locked bool`, `plan_entry/plan_stop/plan_target numeric(38,18) null`, `notes text` (≤ 5.000), `mistakes text[]`, `execution_score smallint null` (1–5), `liquidated bool`, `dust_qty`, `opened_at`, `closed_at null`, `created_at`, `updated_at` | unique một phần `(user_id, market, symbol) where status='OPEN' and origin='AUTO'`; `unique(futures_position_id)`; index `(user_id, status, closed_at desc)`, `(user_id, setup)` |
| `journal_fills` | `id`, `user_id`, `entry_id null` (FK; mục MANUAL bị xóa thì xóa dòng), `spot_trade_id null`, `futures_trade_id null`, `leg` (SPOT/OPEN/CLOSE), `side`, `allocated_qty`, `unattributed_qty`, `allocated_quote`, `allocated_fee`, `skip_reason null` (NOT_USER_SOURCE/BOT_ACCOUNT), `fill_fingerprint`, `created_at` | `unique(spot_trade_id)`; `unique(futures_trade_id, leg)`; check đúng một trong hai mã; index `(entry_id)` |
| `journal_reconcile_runs` | `id`, `started_at`, `finished_at`, `users_checked`, `fills_checked`, `issues jsonb` (theo loại a–e), `fixed jsonb`, `dry_run bool` | index `(started_at desc)` |
| `journal_attachments` | `id uuid`, `entry_id` (FK, cascade), `user_id`, `content_type`, `bytes int`, `sha256`, `data bytea`, `created_at` | index `(user_id)` (tính hạn mức) |
| `futures_trades` (bảng có sẵn) | **thêm** `closed_position_id bigint null`, `close_qty numeric(38,18) null`, `open_qty numeric(38,18) null` | không đổi dòng cũ, không backfill |

Không thêm gì vào `user_preferences`.

### 2.7 API (một phiên bản hợp đồng mới — số lấy theo thứ tự gộp)
| Endpoint | Method + path | Ghi chú |
|---|---|---|
| `journalList` | GET `/api/v1/journal` | lọc `status, market, symbol, setup, tag, origin, from, to`; phân trang |
| `journalGet` | GET `/api/v1/journal/:entryId` | kèm danh sách chân lần khớp đã phân bổ (giá, khối lượng, phí, phần phân bổ, `leg`) + ảnh (chỉ thông tin) |
| `journalCreate` | POST `/api/v1/journal` → 201 | chỉ `MANUAL`; `orderIds` **hoặc** `futuresPositionId` bắt buộc |
| `journalUpdate` | PATCH `/api/v1/journal/:entryId` | setup, tags, kế hoạch, ghi chú, lỗi, điểm; `addOrderIds` chỉ cho mục `MANUAL` đang mở. Sửa `initialStop` sau khi khóa → 409 `STOP_LOCKED` |
| `journalDelete` | DELETE `/api/v1/journal/:entryId` | chỉ `MANUAL`; mục `AUTO` → 409 `AUTO_ENTRY_NOT_DELETABLE` (A-D2) |
| `journalSetups` | GET `/api/v1/journal/setups` | setup + tag đã dùng kèm số lần (gợi ý khi gõ) |
| `journalStats` | GET `/api/v1/journal/stats` | `range` (7d/30d/90d/all, theo `closed_at`) + lọc `market, symbol, setup, tag, direction`; phản hồi có `basis: 'ACTUAL_FILLS'` và `excluded` |
| `journalSettings` | GET `/api/v1/journal/settings` | `{ autoJournal, autoSince }` (cửa sổ hiện tại; chỉ đọc) |
| `journalUpdateSettings` | PATCH `/api/v1/journal/settings` | `{ autoJournal: boolean }` → mở/đóng cửa sổ; không nhận mốc thời gian |
| `journalUploadAttachment` | POST `/api/v1/journal/:entryId/attachments` → 201 | JSON `{ contentType, dataBase64 }` |
| `journalAttachment` | GET `/api/v1/journal/attachments/:attachmentId` | **trả ảnh nhị phân** (định dạng mới `format: 'binary'`); giao diện dùng `<img src>` qua `journalAttachmentUrl(id)` |
| `journalDeleteAttachment` | DELETE `/api/v1/journal/attachments/:attachmentId` | |

Ba cột mới của `futures_trades` **chỉ dùng nội bộ**, không đưa vào hợp đồng `FuturesTrade`. Nhật ký trả chân lần khớp qua `JournalFill.leg`. Đưa vào hợp đồng trước khi server có cột sẽ làm bước kiểm phản hồi theo hợp đồng (bất biến 8) báo lỗi giữa A1 và A2.

Mã lỗi:
- **`NOT_FOUND`**: không phải của mình, hoặc không có.
- **`CONFLICT`**, có `details.reason`:
  - `FILL_ALREADY_JOURNALED`, `SYMBOL_MISMATCH`, `MARKET_MISMATCH`;
  - `BOT_ORDER`, `ORDER_NOT_FILLED`, `STOP_LOCKED`;
  - `AUTO_ENTRY_NOT_DELETABLE`, `ENTRY_NOT_EXTENDABLE`, `TOO_MANY_ATTACHMENTS`.
- **Mới — `PAYLOAD_TOO_LARGE` (413):** ảnh > 1 MB hoặc vượt hạn mức.
- **Mới — `UNSUPPORTED_MEDIA_TYPE` (415):** không phải PNG/JPEG/WebP thật.

---

## 3. Các đợt

### Đợt A1 — Hợp đồng + công thức R chung + thống kê
| | |
|---|---|
| Người làm | `cex-contract-designer` (hợp đồng) ∥ `cex-quant-engineer` (công thức). **Song song được** — khác thư mục |
| Nhánh | `be/journal-a1-contracts`, `be/journal-a1-stats` |
| Cần trước | Chủ dự án duyệt A-D1…A-D7 |
| Thời lượng | 1 lượt |

**Việc — contract-designer**
1. `packages/contracts/src/journal.ts`:
   - enum: `JournalMarket`, `JournalDirection`, `JournalStatus`, `JournalOrigin`, `JournalMistake`, `JournalOutcome`, `JournalStatsRange`, `JournalFillSkipReason` (`NOT_USER_SOURCE`, `BOT_ACCOUNT`), `JournalFillLeg` (`SPOT`, `OPEN`, `CLOSE`), `JournalCloseReason`, `JournalReconcileIssueType` (`MISSING_FILL`, `ACCOUNT_RESET`, `WALLET_SHORTFALL`, `FILL_CHANGED`, `FILL_MISSING_SOURCE`, `ALLOCATION_DRIFT`, `RESULT_DRIFT`), `StatsBasis` (`ACTUAL_FILLS | MODELED_CANDLES | BOT_FILLS`, dùng chung với Module C);
   - schema: `JournalPlan`, `JournalResult` (`entryQty, avgEntryPrice, avgExitPrice, netPnl, fees, funding, riskUsdt, rMultiple, outcome, holdingMs` — đều nullable khi chưa có), `JournalFill` (có `leg`), `JournalSettings` (`autoJournal`, `autoSince`), `JournalUpdateSettingsRequest` (`autoJournal` — **không** nhận mốc thời gian), `JournalEntry` (có `status` OPEN/CLOSED/VOID, `closeReason`, `needsReview`, `adjustedAt`, `adjustmentReason`), `JournalEntryDetail` (+ `fills`, `attachments`), `JournalCreateRequest` (`orderIds` **hoặc** `futuresPositionId`), `JournalUpdateRequest` (có `addOrderIds`), `JournalListQuery`, `JournalStatsQuery`, `JournalStats` (có `basis`, và `excluded: { void, needsReview }` — số mục bị loại khỏi thống kê), `JournalSetupList`, `JournalAttachment`, `JournalAttachmentUpload` (`dataBase64` ≤ 1.400.000 ký tự);
   - hằng số dùng chung: `JOURNAL_LIMITS = { notes: 5000, tags: 10, tagLength: 24, setupLength: 40, attachmentsPerEntry: 4, attachmentBytes: 1_048_576, userQuotaBytes: 52_428_800 }`.
2. `endpoints.ts`: 12 endpoint ở mục 2.7. **Không** thêm gì vào `Preferences` (lý do ở mục 2.2).
3. Khung hợp đồng: thêm `format: 'binary'` cho phản hồi nhị phân.
   - `server/src/lib/http.ts`: gửi `Buffer` + `Content-Type`, **không** kiểm schema phản hồi;
   - client: không gọi `fetch` cho endpoint này, chỉ có hàm `journalAttachmentUrl(id)` giống `exportUrl`;
   - đây là thay đổi khung **được phép** trong đợt này.
4. Mã lỗi mới `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415) + `ERROR_HTTP_STATUS`.
5. Mock:
   - kho nhật ký trong bộ nhớ, đúng các luật và mã lỗi ở mục 2;
   - phân bổ lần khớp và thống kê mock **gọi cùng hàm** `allocateSpotFill`, `allocateFuturesLegs`, `computeEntryResult`, `computeJournalStats` của `@cex/core` (do quant làm song song);
   - mock có cửa sổ tự ghi (bật/tắt qua `journalUpdateSettings`) và mục `MANUAL` chỉ lấy được lần khớp trống;
   - lead gộp nhánh quant trước, rồi mới gộp nhánh contract.
6. Fixture: 10 mục mẫu (thắng, thua, hòa, đang mở, không có dừng lỗ, futures bị thanh lý, futures đóng bằng lệnh đảo chiều, mục có phần bán `unattributed`, mục `VOID` do reset, mục `needsReview`).
7. README hợp đồng (mục mới "Nhật ký"), CHANGELOG, version.

**Việc — quant-engineer** (hàm thuần, chỉ `Dec`)
1. `packages/core/src/rMetrics.ts`: `riskAmount`, `rMultiple`, `summarizeR` đúng [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) mục 1, **kể cả các yêu cầu Module C cần ở C3** (mục 1.1 của quy ước):
   - đường R lũy kế **bắt đầu từ 0**: `C_0 = 0`, `DD = max_k (max_{j≤k} C_j − C_k)`;
   - thứ tự do người gọi đưa vào bằng khóa sắp xếp `(thời điểm đóng, id)`; hàm từ chối đầu vào chưa sắp xếp;
   - hằng `R_METRICS_VERSION = 1` in kèm mọi kết quả.

   Module C dùng lại ở C3; không có chỗ nào khác tính R.
2. `packages/core/src/journalFills.ts`, máy trạng thái của mục 2.1:
   - `allocateSpotFill(entryState | null, fill, lotRules)` trả về `{ action: OPEN | ADD | REDUCE | CLOSE | UNATTRIBUTED, allocatedQty, unattributedQty, allocatedQuote, allocatedFee, newState }`;
   - `computeEntryResult(state, plan)` cho Spot (mục 2.5); `futuresEntryResult(position, plan)` cho Futures;
   - `allocateFuturesLegs(fill)` trả về chân `CLOSE` (`closed_position_id`, `close_qty`) và chân `OPEN` (`position_id`, `open_qty`) theo mục 2.1;
   - `replayAllocations(fills[], lotRulesSnapshot)`: dựng lại toàn bộ phân bổ của một (người dùng, cặp) từ danh sách lần khớp theo `id`, dùng luật cặp **đã chép vào mục** — cho đối soát loại (d), (e) ở mục 2.3;
   - `fillFingerprint(fill)`: sha256 ổn định của giá, khối lượng, phí, phía, mã lệnh (+ ba cột chân với Futures).
3. `packages/core/src/journalStats.ts`: `computeJournalStats(closedEntries, opts)` gồm:
   - `summarizeR`;
   - nhóm theo setup / symbol / direction / ngày trong tuần GMT+7 / lỗi (số lần + tổng R + tổng USDT);
   - `basis: 'ACTUAL_FILLS'`.
4. Test vàng ≥ 25 ca, tính tay ghi trong comment:
   - R: rỗng; 1 mục; toàn thua; không có dừng lỗ; hòa; SHORT; làm tròn.
   - Phân bổ:
     - mua một lần, bán một lần;
     - mua 2 lần, bán 1 nửa → còn OPEN;
     - bán nhiều hơn khối lượng còn mở → phần dư `unattributed`, tiền thu/phí chia theo tỷ lệ;
     - bán khi không có mục → `UNATTRIBUTED`;
     - còn lẻ < `stepSize` → CLOSE + `dust_qty`;
     - còn lại × **giá lần khớp bán đó** < `minNotional` → CLOSE (không dùng giá thị trường);
     - phí mua bằng coin gốc làm giảm khối lượng ròng;
     - mua sau khi đóng → mục mới.
   - Futures: vị thế thường; bị thanh lý; có funding âm/dương; **đóng hết** (chân `CLOSE`, `position_id` null); **đảo chiều** (một lần khớp → chân `CLOSE` vào mục cũ + chân `OPEN` mở mục mới); vào thêm sau khi đóng một phần (khối lượng vào = Σ `open_qty`, khác `max_quantity`).
   - `rMetrics`: đường R bắt đầu từ 0 (chuỗi toàn thắng có DD = 0; chuỗi bắt đầu bằng thua có DD tính từ 0); đầu vào chưa sắp xếp bị từ chối; cùng thời điểm đóng thì sắp theo `id`.
   - Ngày trong tuần lệch múi giờ: 23:30 UTC là ngày khác ở GMT+7.
   - Dựng lại: `replayAllocations` của cả chuỗi = áp `allocateSpotFill` từng lần (so từng mục); bỏ một lần khớp giữa chuỗi → kết quả xác định, mục mất lần khớp mở bị báo.
   - Thống kê loại trừ mục `VOID` và `needsReview`, đếm đúng vào `excluded`.

**Không làm:** route server, bảng DB, giao diện.

**Nghiệm thu**
- [ ] Typecheck đạt; `npx vitest run packages/contracts packages/core` đạt.
- [ ] Drift check liệt kê đúng 12 endpoint chưa có route. Lint 0 lỗi.
- [ ] CHANGELOG ghi rõ "Thêm" và "Thay đổi nhỏ có thể ảnh hưởng UI" (`format: 'binary'`).

**Lệnh giao việc**
> (contract-designer) Làm **Đợt A1 phần hợp đồng** theo `docs/plans/module-A-nhat-ky-giao-dich.md` mục 2 và "Đợt A1", cùng `docs/plans/quy-uoc-R-va-nguon-du-lieu.md`. Nhánh `be/journal-a1-contracts`. Các quyết định đã duyệt: <dán A-D1…A-D7>. Mock gọi `allocateSpotFill`, `allocateFuturesLegs`, `computeEntryResult`, `computeJournalStats` từ `@cex/core` (nhánh `be/journal-a1-stats` sẽ gộp trước bạn — tạm import theo tên đó). Báo cáo theo mẫu trong định nghĩa agent.
>
> (quant-engineer) Làm **Đợt A1 phần công thức** theo cùng hai file. Nhánh `be/journal-a1-stats`. Chỉ sửa `packages/core/src/{rMetrics,journalFills,journalStats}.ts`, test của chúng, và `packages/core/src/index.ts` (export).

**Sau đợt:**
- Lead viết `docs/antigravity/PROMPT-14-nhat-ky-giao-dich.md`. Antigravity làm giao diện trên mock **ngay từ đây**, song song A2–A4.
- Thêm dòng "Backend → UI" ghi phần server sẽ có ở A2–A4.

---

### Đợt A2 — Lõi nhật ký trên server (bảng, phân bổ, mục MANUAL)
| | |
|---|---|
| Người làm | `cex-backend-builder` → `cex-reviewer` |
| Nhánh | `be/journal-a2-core` |
| Cần trước | A1 đã gộp |
| Skill | `cex-feature-delivery`, `db-migration-host-safety`, `decimal-money-safety`, **`ledger-order-concurrency`** (sửa đường khớp lệnh Futures) |
| Thời lượng | 2 lượt |

**Việc**
1. `server/src/db/schema.ts`: 6 bảng mới + 3 cột mới của `futures_trades` (mục 2.6) → `npm run db:generate` → migration 0008.
   - Kiểm migration chỉ thêm, không khóa bảng lớn. Không thêm trigger.
   - Migration chèn dòng `journal_feature(started_at = now())`.
1b. `server/src/modules/futures/service.ts`: ghi `closed_position_id`, `close_qty`, `open_qty` trong **cùng** lệnh `insert(futuresTrades)` có sẵn (khớp thường dòng ~496, thanh lý dòng ~773), lấy từ `closeQty`/`openQty`/`pos.id` đã tính sẵn trong hàm.
   - Không đổi logic tiền, khóa, thứ tự (bất biến 16–17).
   - Test: đóng một phần, đóng hết, đảo chiều, TP/SL, thanh lý → ba cột đúng; **toàn bộ test Futures cũ vẫn đạt**; đối soát sạch.
2. `server/src/modules/journal/`:
   - `allocator.ts`: **một** hàm `processFills(tx, userId, fills)` dùng chung cho mục AUTO (A3) và MANUAL.
     - Gọi `allocateSpotFill` / `allocateFuturesLegs`, ghi `journal_fills` + cập nhật mục trong **cùng transaction**, có `pg_advisory_xact_lock` theo người dùng.
     - Vi phạm unique → coi là đã xử lý.
   - `service.ts`: tạo `MANUAL` theo mục 2.4 (kiểm lệnh/vị thế của chính người dùng — không thì 404 —, đã khớp, `source = 'USER'`, cùng cặp/thị trường, mọi lần khớp còn **trống**), `addOrderIds`, sửa, xóa `MANUAL` (xóa luôn dòng `journal_fills` của mục), khóa `initial_stop`.
   - `settings.ts`: cửa sổ tự ghi (mục 2.2): `journalSettings`, `journalUpdateSettings`; người chưa có cửa sổ thì coi như bật từ `journal_feature.started_at`.
   - `routes.ts`: 8 endpoint (trừ 3 endpoint ảnh — A4 — và `journalStats` — A3).
3. Đăng ký route trong `server/src/app.ts`.
4. Test (`server/src/modules/journal/journal.test.ts`, qua `apiHarness`):
   - CRUD + mọi mã lỗi ở mục 2.7;
   - mục MANUAL từ lệnh mua + bán → kết quả đúng số tính tay; thêm lệnh bán bằng `addOrderIds` → mục đóng; `addOrderIds` vào mục `AUTO` hoặc mục đã đóng → 409 `ENTRY_NOT_EXTENDABLE`;
   - xóa mục MANUAL → lần khớp trở lại trống, tạo lại mục MANUAL từ chúng được;
   - bật/tắt tự ghi: tắt rồi bật tạo hai cửa sổ; `journalUpdateSettings` không nhận mốc thời gian (gửi kèm → 400);
   - lệnh khớp làm 3 lần → 3 dòng `journal_fills`;
   - lệnh của người khác → 404; lệnh bot → 409;
   - **hai yêu cầu đồng thời** tạo mục từ cùng một lệnh → một 201 + một 409 (không phải 500);
   - gọi `processFills` hai lần cùng dữ liệu → không đổi gì;
   - giới hạn độ dài → 400; mục của người khác → 404;
   - xóa mục MANUAL không đụng lệnh; xóa AUTO → 409;
   - `initialStop` khóa sau lần bán đầu tiên;
   - mỗi dòng `journal_fills` có `fill_fingerprint` đúng.

**Không làm:** tự ghi nhật ký (A3), thống kê (A3), đối soát (A3R), ảnh (A4). Nhưng migration của đợt này **đã có đủ cột và bảng cho đối soát** (mục 2.6) để A3R không cần migration riêng.

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt (ghi N/N), **gồm toàn bộ test Futures cũ**; typecheck, lint, drift check (còn 4 endpoint chưa route: stats + 3 ảnh).
- [ ] Reviewer không còn P0/P1.
- [ ] Báo cáo `docs/reports/<ngày>-journal-a2.md`.

**Lệnh giao việc**
> Làm **Đợt A2** theo `docs/plans/module-A-nhat-ky-giao-dich.md` (mục 2 + "Đợt A2") và `docs/plans/quy-uoc-R-va-nguon-du-lieu.md`. Nhánh `be/journal-a2-core`. Hợp đồng đã có ở `packages/contracts/src/journal.ts` — không sửa. Gọi skill `ledger-order-concurrency` trước khi sửa `futures/service.ts` (chỉ thêm ba cột vào lệnh chèn `futures_trades`, không đổi gì khác). Báo cáo theo mẫu.

---

### Đợt A3 — Tự ghi nhật ký từ khớp lệnh + thống kê
| | |
|---|---|
| Người làm | `cex-backend-builder` (bộ xử lý tự ghi + route) ∥ `cex-quant-engineer` (truy vấn thống kê + hiệu năng) → `cex-reviewer` |
| Nhánh | `be/journal-a3-auto-stats` (quant làm trên nhánh con `be/journal-a3-stats` rồi lead gộp vào) |
| Cần trước | A2 đã gộp |
| Skill | `ledger-order-concurrency` (đọc sự kiện lệnh), `decimal-money-safety` |
| Thời lượng | 1–2 lượt |

**Việc — backend-builder**
1. `server/src/modules/journal/auto.ts`, đúng mục 2.2:
   - **Quét** các lần khớp **đủ điều kiện tự ghi** (nằm trong cửa sổ của người đó) chưa có dòng `journal_fills` (anti-join, cũ hơn 2 giây), theo từng người dùng.
   - Gọi `processFills`, mỗi người một transaction.
   - Lần khớp bị loại vĩnh viễn (bot, `source ≠ USER`) ghi dòng có `skip_reason`. Lần khớp ngoài cửa sổ **không** ghi gì (để trống cho mục MANUAL).
   - Đánh thức bằng `ex.events` (Spot) và `FuturesEvents` sau commit. Quét định kỳ 60 giây. Quét toàn bộ lúc khởi động.
   - Lỗi: ghi log + thử lại tăng dần. **Không bao giờ** làm chậm hay hỏng việc đặt lệnh: không chạy trong transaction khớp lệnh, không `await` trong đường khớp lệnh.
2. Phát hành tính năng: **không** ghi bù lịch sử. Cửa sổ mặc định của mọi người bắt đầu từ `journal_feature.started_at` (migration ghi, A-D2).
3. Sửa `server/src/main.ts` + `test/helpers.ts` để bật bộ xử lý.
4. Test:
   - mua → mục `AUTO` `OPEN`; bán hết → `CLOSED` với kết quả đúng số tính tay;
   - mua 2 lần, bán một nửa → vẫn `OPEN`;
   - bán coin có từ faucet (không có mục) → không tạo mục, có dòng `unattributed`;
   - **phát lại sự kiện 2 lần + gọi quét song song 2 lần** → không trùng;
   - **mất sự kiện** (tắt bộ nghe, khớp lệnh, bật lại và quét) → bắt kịp, kết quả giống khi chạy liền;
   - tắt tự ghi → giao dịch lúc tắt không tạo mục và không có dòng `journal_fills`; bật lại → chỉ ghi từ mốc mới; giao dịch lúc tắt tạo mục MANUAL được;
   - lần khớp trước `journal_feature.started_at` → không bao giờ vào nhật ký tự động;
   - lệnh Grid/DCA, tài khoản bot → không tạo;
   - futures mở/giảm/đóng hết/đảo chiều/thanh lý (chân `CLOSE` vào đúng mục cũ, chân `OPEN` mở mục mới);
   - lỗi giả lập trong bộ xử lý → lệnh vẫn khớp, số dư đúng, đối soát sạch; lần quét sau xử lý xong.

**Việc — quant-engineer**
1. `server/src/modules/journal/stats.ts`: truy vấn mục `CLOSED` trong khoảng + bộ lọc (một câu SQL lấy dữ liệu theo mục) → `computeJournalStats`.
2. Route `journalStats`.
3. Test vàng qua API: dữ liệu dựng bằng lệnh thật trên sàn test.
4. Test hiệu năng: 1.000 mục đã đóng → phản hồi < 300 ms trên máy dev (ghi số đo).

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; drift check còn 3 endpoint (ảnh).
- [ ] Đối soát sổ cái sạch trong mọi test có lệnh.
- [ ] Reviewer: không P0/P1. Kiểm riêng bốn điểm: "không có phụ thuộc vào sự kiện trước commit", "trùng khi khởi động lại", "chân nào của lần khớp đủ điều kiện cũng có đúng một dòng", "không ghi gì cho lần khớp ngoài cửa sổ".

**Lệnh giao việc**
> (backend-builder) Làm **Đợt A3 phần tự ghi nhật ký** theo `docs/plans/module-A-nhat-ky-giao-dich.md` mục 2.1–2.2 và "Đợt A3". Nhánh `be/journal-a3-auto-stats`. Gọi skill `ledger-order-concurrency` trước khi đọc sự kiện lệnh.
>
> (quant-engineer) Làm **Đợt A3 phần thống kê** theo cùng file, nhánh `be/journal-a3-stats` (tách từ `be/journal-a3-auto-stats`). Chỉ sửa `server/src/modules/journal/stats.ts`, route `journalStats` và test của nó.

---

### Đợt A3R — Đối soát nhật ký (điều kiện của A-D2)
| | |
|---|---|
| Người làm | `cex-backend-builder` → `cex-reviewer` |
| Nhánh | `be/journal-a3r-reconcile` |
| Cần trước | A3 đã gộp. Làm **song song với A4** được (khác file, không migration) |
| Skill | `ledger-order-concurrency`, `db-migration-host-safety` (không tạo migration — chỉ kiểm) |
| Thời lượng | 1 lượt |

**Việc**
1. `server/src/modules/journal/reconcile.ts`: `reconcileJournal({ userId?, dryRun })` kiểm đủ các loại lệch (a)–(e) và lệch kết quả ở bảng mục 2.3.
   - Tự sửa các loại được phép; loại (b) chỉ đánh dấu `needs_review`, và chỉ kiểm **sau khi** đã xử lý hết lần khớp chờ của người đó dưới cùng khóa (tránh báo nhầm do độ trễ 2 giây).
   - Mỗi người dùng một transaction có khóa advisory, dùng chung khóa với bộ tự ghi.
   - Ghi `journal_reconcile_runs`.
   - Không bao giờ xóa ghi chú, setup, kế hoạch, ảnh.
2. Móc sau reset: `adminService.resetAccount` gọi `journal.onAccountReset(userId)` **sau commit**, lỗi chỉ ghi log.
3. Lịch hằng ngày, chạy cùng đối soát sổ cái. Có lệch loại (b), (d) hoặc (e) → `ops/alerts` gửi Telegram.
4. Script `npm run journal:reconcile -- [--user <id>] [--dry-run]`.
5. Test:
   - reset tài khoản khi có mục Spot và Futures đang mở → mục `VOID` đúng `close_reason`; thống kê loại trừ; ghi chú còn nguyên;
   - xóa dòng `journal_fills` bằng tay (giả lập thiếu) → đối soát ghi bù, kết quả giống ban đầu;
   - sửa giá một dòng `trades` bằng tay (giả lập điều chỉnh) → phát hiện `FILL_CHANGED`, dựng lại, kết quả đúng số tính tay, `adjusted_at` có giá trị;
   - xóa dòng `trades` có lần khớp mở mục → mục `VOID` với lý do, ghi chú còn;
   - **lệch thứ tự**: chèn một lần khớp MUA có `id` nhỏ hơn lần khớp BÁN đã xử lý (giả lập commit lệch) → phát hiện `ALLOCATION_DRIFT`, dựng lại theo `id`, kết quả bằng chạy đúng thứ tự;
   - reset Spot khi ví có 0 coin gốc nhưng có USDT → vẫn nhận ra reset (không lọc theo coin);
   - rút coin khỏi ví bằng điều chỉnh admin → `needs_review`, không tự đóng;
   - `--dry-run` không đổi gì trong DB;
   - chạy đối soát hai lần liền → lần hai không tìm thấy lệch nào;
   - chạy đối soát cùng lúc với bộ tự ghi → không trùng, không mất;
   - đối soát sổ cái sàn vẫn sạch (nhật ký không đụng số dư).

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; reviewer không P0/P1 (kiểm riêng: không mất ghi chú, dựng lại xác định, không chạm số dư/lệnh).
- [ ] Báo cáo ghi số liệu một lần chạy thử trên DB dev có dữ liệu thật.

**Lệnh giao việc**
> Làm **Đợt A3R** theo `docs/plans/module-A-nhat-ky-giao-dich.md` mục 2.3 và "Đợt A3R". Nhánh `be/journal-a3r-reconcile`. Không tạo migration (bảng/cột đã có từ A2). Ngoài `server/src/modules/journal/**` chỉ được sửa: `adminService.resetAccount` (một lời gọi sau commit), chỗ nối dịch vụ nhật ký vào `adminService` (`server/src/app.ts`, `server/src/main.ts`, `server/test/helpers.ts`), nơi đăng ký lịch chạy, và thêm loại cảnh báo trong `server/src/ops/alerts.ts`.

---

### Đợt A4 — Ảnh đính kèm
| | |
|---|---|
| Người làm | `cex-backend-builder` → `cex-reviewer` (bắt buộc gọi skill `exchange-security-review`) |
| Nhánh | `be/journal-a4-attachments` |
| Cần trước | A2 đã gộp (độc lập với A3) |
| Thời lượng | 1 lượt |

**Việc**
1. Bộ đọc JSON riêng cho đúng đường dẫn upload (giới hạn 1,5 MB), gắn **trước** bộ đọc JSON chung 32 KB trong `app.ts`. Đường dẫn khác vẫn 32 KB.
2. Kiểm ảnh:
   - giải base64 → kiểm **chữ ký đầu file** (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, WebP `RIFF....WEBP`) **và** khớp `contentType` khai báo;
   - ≤ 1 MB, ≤ 4 ảnh/mục (409), tổng ≤ 50 MB/người (413);
   - SVG/GIF/khác → 415.
3. Trả ảnh:
   - `Content-Type` đã lưu, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, `Cache-Control: private, max-age=3600`, `ETag` = sha256;
   - chỉ chủ mục xem được (khác → 404).
4. Xóa ảnh; xóa mục thì xóa theo (cascade).
5. Test:
   - PNG/JPEG/WebP thật → 201;
   - file đổi đuôi (chữ ký sai) → 415;
   - SVG → 415;
   - 1 MB + 1 byte → 413;
   - ảnh thứ 5 → 409;
   - vượt hạn mức → 413;
   - người khác GET → 404;
   - không đăng nhập → 401;
   - **sao lưu logic** (`server/src/ops/logicalBackup.test.ts`) thêm một dòng ảnh và khôi phục đúng từng byte.

**Nghiệm thu**
- [ ] Mọi endpoint nhật ký đã có route (drift check sạch); `npm test` toàn bộ đạt.
- [ ] Báo cáo bảo mật của reviewer (không P0/P1).

**Lệnh giao việc**
> Làm **Đợt A4** theo `docs/plans/module-A-nhat-ky-giao-dich.md`. Nhánh `be/journal-a4-attachments`. Gọi skill `exchange-security-review` trước khi viết phần kiểm ảnh.

---

### Đợt A5 — Giao diện (Antigravity) + test nghiệm thu
| | |
|---|---|
| Người làm | **Antigravity** theo `PROMPT-14` (viết ở cuối A1) ∥ `cex-e2e-acceptance` |
| Nhánh | UI: `ui/gd2-exchange`; test: `be/journal-a5-e2e` |
| Cần trước | A1 (giao diện trên mock); test chạy được khi A2, A3, A3R, A4 đã gộp |
| Thời lượng | Antigravity 2–3 lượt; e2e 1 lượt |

**PROMPT-14 sẽ yêu cầu** (lead viết chi tiết, file:dòng, sau A1):
- **Trang `/journal`:**
  - danh sách có lọc (trạng thái, cặp, setup, tag, khoảng ngày);
  - cột R, lãi lỗ, setup, nhãn "chưa ghi chú";
  - trạng thái loading/trống/lỗi.
- **Chi tiết/sửa mục:**
  - kế hoạch (giá vào, dừng lỗ, chốt lời, rủi ro): R, kết quả, rủi ro **hiển thị số server trả**, không tự tính;
  - setup có gợi ý (`journalSetups`), tags, lỗi, điểm 1–5, ghi chú (chữ thuần);
  - các lệnh/vị thế đã gắn;
  - ảnh: kéo-thả; **thu nhỏ ở trình duyệt** còn ≤ 1600 px và nén WebP/JPEG ≤ 1 MB trước khi gửi;
  - mục `AUTO`: **không có nút xóa**, chỉ sửa ghi chú/kế hoạch; mục `MANUAL` có nút xóa kèm hộp xác nhận, và nút "Thêm lệnh" khi đang mở;
  - mục Futures hiện các chân `OPEN`/`CLOSE` (lệnh đảo chiều xuất hiện ở cả hai mục, mỗi mục một chân);
  - ghi chú giới hạn: "Bán coin do bot DCA/Grid mua cũng được tính vào mục của bạn";
  - huy hiệu theo đối soát: "Đã điều chỉnh do đối soát" (kèm lý do), "Không tính vào thống kê" (mục `VOID`), "Cần kiểm tra — số coin trong ví ít hơn nhật ký" (`needsReview`).
- **Thống kê:**
  - thẻ win rate, kỳ vọng R, profit factor, drawdown;
  - đường R lũy kế;
  - theo setup / coin / ngày trong tuần;
  - "lỗi tốn bao nhiêu";
  - ghi chú A-D7 (khác trang Lãi lỗ khi đang giữ coin từ trước);
  - dòng "N mục không tính vào thống kê" (số `excluded`), bấm vào ra danh sách đã lọc.
- **Lối vào:**
  - nút "Ghi nhật ký" ở dòng lệnh đã khớp (bảng lệnh), ở hộp đóng vị thế Futures;
  - toast sau khi khớp: "Thêm ghi chú?";
  - Cài đặt: bật/tắt tự ghi nhật ký qua `journalSettings` / `journalUpdateSettings` (không phải preferences), hiện "Tự ghi từ <thời điểm>";
  - (tùy chọn) ký hiệu B/S trên chart hiện setup khi rê chuột.
- `data-testid` theo danh sách của e2e.

**Việc — e2e-acceptance:** `e2e/tests/journal.spec.ts`
1. Mua rồi bán hết qua API → mục `AUTO` hiện trong `/journal`, lãi lỗ khớp `GET /api/v1/journal/:id`.
2. Mở mục, nhập setup + dừng lỗ → R hiện đúng số server.
3. Tải ảnh PNG → ảnh nhỏ hiện. Người dùng khác mở URL ảnh → 404.
4. Thống kê đổi sau khi có mục mới (win rate, số mục).
5. Tắt tự ghi → giao dịch mới không tạo mục; tạo mục MANUAL từ giao dịch đó được; bật lại → giao dịch lúc tắt vẫn không tự vào.
6. @mobile: danh sách + chi tiết dùng được ở 390 px.
7. Mục `AUTO` không có nút xóa. Gọi thẳng API xóa → 409 `AUTO_ENTRY_NOT_DELETABLE`.
8. Admin reset tài khoản khi có mục đang mở → mục hiện huy hiệu "Không tính vào thống kê", ghi chú cũ còn nguyên, thống kê không đếm mục đó.

**Nghiệm thu**
- [ ] `npm run ui-check -- --e2e` xanh (cả bộ, không chỉ `journal.spec`).
- [ ] Lead rà giao diện theo skill `ui-branch-review` (báo cáo `…-ra-soat-ui-lan-N.md`).

---

### Đợt A6 — Phát hành
| | |
|---|---|
| Người làm | Lead (+ chủ dự án nghiệm thu) |
| Cần trước | A1–A5 |

1. `npm run verify` + `npm run ui-check -- --e2e` trên `main` sau khi gộp nhánh UI.
2. Chủ dự án đồng ý → `npm run host -- backup` → `npm run host -- update` → `start`. Migration 0008 tự chạy; đã sao lưu ngay trước.
3. Chủ dự án nghiệm thu bằng mắt theo danh sách 8 bước của `journal.spec`.
4. Cập nhật `ROADMAP.md` GĐ5, báo cáo `docs/reports/<ngày>-module-A.md`.

## 4. Rủi ro và cách chặn
| Rủi ro | Chặn bằng |
|---|---|
| Lãi lỗ của mục lệch trang "Phân tích lãi lỗ" | Quyết định A-D7 + ghi chú trên giao diện + test vàng |
| Tự ghi nhật ký làm chậm hoặc hỏng việc đặt lệnh | Chạy ngoài transaction khớp lệnh, chỉ đọc dữ liệu sàn, lỗi chỉ ghi log + thử lại; test "lỗi giả lập → lệnh vẫn khớp" |
| Ghi trùng một lần khớp | `unique(spot_trade_id)` / `unique(futures_trade_id, leg)` trên `journal_fills`; khóa advisory theo người dùng; test phát lại + quét song song |
| Bỏ sót lần khớp (mất sự kiện, server tắt) | Nguồn sự thật là bảng khớp lệnh (anti-join), quét lúc khởi động + mỗi 60 giây; đối soát "mỗi lần khớp đúng một dòng" |
| Thống kê bị chọn lọc (xóa mục thua) | Mục `AUTO` không xóa được (A-D2); R dùng dừng lỗ ban đầu, khóa sau lần giảm vị thế đầu tiên |
| Trộn số liệu nhật ký với tín hiệu | [Quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) mục 2: `basis` trong mọi thống kê, không đọc chéo bảng, lệnh `source ≠ USER` không vào nhật ký |
| Ảnh độc hại (SVG/HTML giả ảnh) | Chữ ký đầu file, danh sách loại cố định, `nosniff`, CSP `default-src 'none'`, chỉ chủ xem |
| Database phình vì ảnh | 1 MB/ảnh, 50 MB/người; thu nhỏ ở trình duyệt; theo dõi kích thước bản sao lưu |
| Sửa đường khớp lệnh Futures để ghi chân lần khớp (A2) làm hỏng Futures | Chỉ thêm 3 cột vào lệnh chèn có sẵn, dùng số đã tính; skill `ledger-order-concurrency`; toàn bộ test Futures cũ + đối soát sạch; reviewer kiểm riêng |
| Gán sai lần khớp Futures (đóng hết ghi `position_id = NULL`, đảo chiều ghi vị thế mới) | Gán theo chân `CLOSE`/`OPEN` từ 3 cột mới, không theo `position_id` (mục 2.1) |
| Hai nhánh cùng tạo migration 0008 (A2 và C2) | Gộp lần lượt, nhánh sau rebase + `db:generate` lại |

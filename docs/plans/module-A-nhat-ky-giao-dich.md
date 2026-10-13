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
Một lệnh khớp làm nhiều lần sẽ có nhiều dòng; mỗi dòng được ghi nhận đúng một lần.

**Spot**, mỗi (người dùng, cặp) có **tối đa một mục `AUTO` đang `OPEN`** (chỉ mục duy nhất có điều kiện `status = 'OPEN' AND origin = 'AUTO'`).

| Sự kiện khớp | Xử lý |
|---|---|
| **MUA**, chưa có mục OPEN của cặp | **Mở** mục mới. `opened_at` = thời điểm khớp |
| **MUA**, đã có mục OPEN | **Cộng vào** mục đó (mua thêm) |
| **BÁN**, có mục OPEN | Phân bổ vào mục, **tối đa bằng khối lượng còn mở** của mục. Phần dư (bán coin có từ trước, từ faucet hoặc do bot mua) ghi `unattributed_qty`, không thuộc mục nào |
| **BÁN**, không có mục OPEN | Ghi nhận toàn bộ là `unattributed_qty`. **Không** mở mục (Spot không bán khống) |
| Khối lượng còn mở < `stepSize`, hoặc giá trị còn lại < `minNotional` của cặp | **Đóng** mục: `closed_at` = thời điểm lần khớp cuối. Phần lẻ ghi `dust_qty`, không tính lãi/lỗ |
| **MUA** sau khi mục đã đóng | Mở **mục mới** |

- Khối lượng còn mở = Σ(khối lượng mua − phí mua tính bằng coin gốc) − Σ khối lượng bán đã phân bổ.
  Trên sàn này phí MUA trừ bằng coin gốc (`orderService.ts:505`, `feeAsset = base`).
- Một lần khớp BÁN chia giữa phần phân bổ và phần dư thì tiền thu và phí bán chia **theo tỷ lệ khối lượng**, làm tròn 8 chữ số. Phần tiền thu của người dùng làm tròn xuống (bất biến 2).

**Futures:**
- Mỗi mục ứng với **đúng một vị thế** (`futures_positions.id`). Mọi `futures_trades` có `position_id` đó đều thuộc mục.
- Vị thế mở thì mục mở. Vị thế đóng (kể cả TP/SL, thanh lý) thì mục đóng. Bị thanh lý thì có cờ `liquidated`.

**Lần khớp không vào nhật ký** (vẫn được ghi nhận để không xử lý lại, với `entry_id = null` và lý do):
- `NOT_USER_SOURCE`: lệnh có `source ≠ 'USER'` (GRID, DCA, sau này SIGNAL);
- `BOT_ACCOUNT`: lệnh của tài khoản `is_bot`;
- `BEFORE_SINCE`: khớp trước mốc `autoJournalSince` của người dùng (không ghi bù, xem A-D2);
- `AUTO_OFF`: người dùng đang tắt tự ghi.

### 2.2 Chống ghi trùng và không bỏ sót

1. **Mỗi lần khớp có đúng một dòng** trong `journal_fills`, với `unique(spot_trade_id)` và `unique(futures_trade_id)`. Dòng này vừa là phân bổ vừa là dấu "đã xử lý".
   Xử lý hai lần cùng một lần khớp → lần sau vi phạm unique → bỏ qua. Không bao giờ tạo hai dòng.
2. **Nguồn sự thật là bảng khớp lệnh, không phải sự kiện trong bộ nhớ.**
   - Bộ xử lý tìm các lần khớp của người dùng **chưa có** trong `journal_fills` (anti-join), chỉ lấy lần khớp có `created_at` ≥ mốc của người đó và cũ hơn **2 giây**, xử lý theo `id` tăng dần.
   - Mốc 2 giây là để các transaction khớp lệnh đang dở kịp commit, không bị xử lý lệch thứ tự.
   - Sự kiện `ex.events` sau commit chỉ dùng để **đánh thức** bộ xử lý.
   - Server khởi động lại hoặc mất sự kiện → lần quét lúc khởi động, cùng lần quét định kỳ mỗi 60 giây, bắt kịp.
3. **Tuần tự theo người dùng:** mỗi lần xử lý của một người chạy trong một transaction có `pg_advisory_xact_lock` theo người đó.
   Hai tiến trình hay hai lần đánh thức không bao giờ phân bổ song song cho cùng người.
4. Trong cùng **một transaction**: chèn dòng `journal_fills`, cập nhật mục (tạo, cộng, đóng), tính lại kết quả.
   Lỗi thì rollback, ghi log và thử lại sau (tăng dần, tối đa 5 phút). Lần thử lại **không bao giờ** chạm vào lệnh, số dư hay sổ cái.
   Nhật ký chỉ **đọc** dữ liệu sàn.
5. Bất biến kiểm bằng test và bằng đối soát:
   - Spot: Σ khối lượng phân bổ của mục = Σ khối lượng ròng đã mua − khối lượng còn mở − `dust_qty`.
   - Mọi lần khớp của người dùng (từ mốc trở đi) đều có đúng một dòng `journal_fills`.

### 2.3 Mục do người dùng tạo (`MANUAL`)
- Người dùng có thể tạo mục cho giao dịch khi **đang tắt** tự ghi: chọn các lệnh Spot đã khớp (cùng cặp) hoặc một vị thế Futures.
- Server dùng **cùng bộ phân bổ** theo lần khớp. Lần khớp đã thuộc mục khác → 409 `FILL_ALREADY_JOURNALED`. Không có mục "trống" (phải có ít nhất 1 lệnh hoặc vị thế).
- Lệnh của người khác → 404. Lệnh bot → 409 `BOT_ORDER`. Khác cặp → 409 `SYMBOL_MISMATCH`. Khác thị trường → 409 `MARKET_MISMATCH`.

### 2.4 Kết quả (server tính, giao diện **không** tự tính)

R theo [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md), hàm `@cex/core/rMetrics`. Tất cả là `Dec`/chuỗi.

**Spot (A-D7: theo giá vốn của chính mục):**
- Giá vốn mỗi đơn vị ròng = Σ tiền USDT đã trả khi mua ÷ Σ khối lượng ròng nhận được (phí mua đã nằm trong giá vốn).
- Lãi/lỗ ròng = Σ(tiền thu phân bổ − phí bán phân bổ) − giá vốn × Σ khối lượng bán phân bổ.
- Giá vào = giá mua trung bình (trước phí). Khối lượng vào = Σ khối lượng mua (trước phí).

**Futures:** `realized_pnl − fees + funding` của vị thế, đúng định nghĩa đang dùng ở `pnlService.ts:100`.
Giá vào = `entry_price`. Khối lượng vào = `max_quantity`.

**Dừng lỗ ban đầu** (mẫu số R):
- Tự lấy từ SL gắn kèm lệnh mua đầu tiên (`orders.tpsl`), hoặc `stop_loss_price` của vị thế lúc mở.
- Không có thì là lần đầu người dùng nhập.
- Sửa được **cho tới lần khớp giảm vị thế đầu tiên** (bán hoặc đóng một phần). Sau đó khóa. Sửa nữa chỉ đổi `plan_stop` để hiển thị, không đổi R, và giao diện gợi ý lỗi `MOVED_STOP`.

**Kết quả hiển thị:**
- Mục OPEN: kết quả `null`, chỉ có phần đã chốt (nếu có).
- Thống kê **chỉ dùng mục CLOSED**; thiếu R thì vẫn tính trong thống kê USDT.

**Danh sách lỗi cố định** (`JournalMistake`): `FOMO`, `REVENGE`, `OVERSIZE`, `NO_STOP`, `MOVED_STOP`, `EARLY_EXIT`, `LATE_ENTRY`, `IGNORED_PLAN`, `OTHER`.

### 2.5 Bảng mới (một migration, chỉ thêm — an toàn với sàn thật)
| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `journal_entries` | `id uuid`, `user_id`, `market` (SPOT/FUTURES), `symbol`, `direction` (LONG/SHORT), `status`, `origin` (AUTO/MANUAL), `futures_position_id null`, `setup text null` (≤ 40), `tags text[]` (≤ 10 × 24), `initial_stop`, `initial_stop_locked bool`, `plan_entry/plan_stop/plan_target numeric(38,18) null`, `notes text` (≤ 5.000), `mistakes text[]`, `execution_score smallint null` (1–5), `liquidated bool`, `dust_qty`, `opened_at`, `closed_at null`, `created_at`, `updated_at` | unique một phần `(user_id, market, symbol) where status='OPEN' and origin='AUTO'`; `unique(futures_position_id)`; index `(user_id, status, closed_at desc)`, `(user_id, setup)` |
| `journal_fills` | `id`, `user_id`, `entry_id null` (FK, `on delete set null`), `spot_trade_id null`, `futures_trade_id null`, `side`, `allocated_qty`, `unattributed_qty`, `allocated_quote`, `allocated_fee`, `skip_reason null`, `created_at` | `unique(spot_trade_id)`, `unique(futures_trade_id)`, check đúng một trong hai; index `(entry_id)` |
| `journal_attachments` | `id uuid`, `entry_id` (FK, cascade), `user_id`, `content_type`, `bytes int`, `sha256`, `data bytea`, `created_at` | index `(user_id)` (tính hạn mức) |

Tùy chọn người dùng nằm trong `user_preferences.data` (jsonb, không thêm cột):
- `autoJournal: boolean`, mặc định theo A-D2;
- `autoJournalSince: IsoDateTime`: đặt lúc phát hành tính năng, và đặt lại mỗi lần người dùng bật lại.

Xóa mục (chỉ mục `MANUAL`, theo A-D2): các dòng `journal_fills` của mục chuyển `entry_id = null`, `skip_reason = 'ENTRY_DELETED'`. Không xử lý lại.

### 2.6 API (một phiên bản hợp đồng mới — số lấy theo thứ tự gộp)
| Endpoint | Method + path | Ghi chú |
|---|---|---|
| `journalList` | GET `/api/v1/journal` | lọc `status, market, symbol, setup, tag, origin, from, to`; phân trang |
| `journalGet` | GET `/api/v1/journal/:entryId` | kèm danh sách lần khớp đã phân bổ (giá, khối lượng, phí, phần phân bổ) + ảnh (chỉ thông tin) |
| `journalCreate` | POST `/api/v1/journal` → 201 | chỉ `MANUAL`; `orderIds` **hoặc** `futuresPositionId` bắt buộc |
| `journalUpdate` | PATCH `/api/v1/journal/:entryId` | setup, tags, kế hoạch, ghi chú, lỗi, điểm. **Không** sửa lần khớp. Sửa `initialStop` sau khi khóa → 409 `STOP_LOCKED` |
| `journalDelete` | DELETE `/api/v1/journal/:entryId` | chỉ `MANUAL`; mục `AUTO` → 409 `AUTO_ENTRY_NOT_DELETABLE` (A-D2) |
| `journalSetups` | GET `/api/v1/journal/setups` | setup + tag đã dùng kèm số lần (gợi ý khi gõ) |
| `journalStats` | GET `/api/v1/journal/stats` | `range` (7d/30d/90d/all, theo `closed_at`) + lọc `market, symbol, setup, tag, direction`; phản hồi có `basis: 'ACTUAL_FILLS'` |
| `journalUploadAttachment` | POST `/api/v1/journal/:entryId/attachments` → 201 | JSON `{ contentType, dataBase64 }` |
| `journalAttachment` | GET `/api/v1/journal/attachments/:attachmentId` | **trả ảnh nhị phân** (định dạng mới `format: 'binary'`); giao diện dùng `<img src>` qua `journalAttachmentUrl(id)` |
| `journalDeleteAttachment` | DELETE `/api/v1/journal/attachments/:attachmentId` | |
| `updatePreferences` | (có sẵn) | thêm `autoJournal`; `autoJournalSince` chỉ đọc |

Mã lỗi:
- **`NOT_FOUND`**: không phải của mình, hoặc không có.
- **`CONFLICT`**, có `details.reason`:
  - `FILL_ALREADY_JOURNALED`, `SYMBOL_MISMATCH`, `MARKET_MISMATCH`;
  - `BOT_ORDER`, `ORDER_NOT_FILLED`, `STOP_LOCKED`;
  - `AUTO_ENTRY_NOT_DELETABLE`, `TOO_MANY_ATTACHMENTS`.
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
   - enum: `JournalMarket`, `JournalDirection`, `JournalStatus`, `JournalOrigin`, `JournalMistake`, `JournalOutcome`, `JournalStatsRange`, `JournalFillSkipReason`, `StatsBasis` (`ACTUAL_FILLS | MODELED_CANDLES | BOT_FILLS`, dùng chung với Module C);
   - schema: `JournalPlan`, `JournalResult` (`entryQty, avgEntryPrice, avgExitPrice, netPnl, fees, funding, riskUsdt, rMultiple, outcome, holdingMs` — đều nullable khi chưa có), `JournalFill`, `JournalEntry`, `JournalEntryDetail` (+ `fills`, `attachments`), `JournalCreateRequest`, `JournalUpdateRequest`, `JournalListQuery`, `JournalStatsQuery`, `JournalStats` (có `basis`), `JournalSetupList`, `JournalAttachment`, `JournalAttachmentUpload` (`dataBase64` ≤ 1.400.000 ký tự);
   - hằng số dùng chung: `JOURNAL_LIMITS = { notes: 5000, tags: 10, tagLength: 24, setupLength: 40, attachmentsPerEntry: 4, attachmentBytes: 1_048_576, userQuotaBytes: 52_428_800 }`.
2. `endpoints.ts`: 10 endpoint ở mục 2.6. `Preferences.autoJournal`, `Preferences.autoJournalSince` (chỉ đọc).
3. Khung hợp đồng: thêm `format: 'binary'` cho phản hồi nhị phân.
   - `server/src/lib/http.ts`: gửi `Buffer` + `Content-Type`, **không** kiểm schema phản hồi;
   - client: không gọi `fetch` cho endpoint này, chỉ có hàm `journalAttachmentUrl(id)` giống `exportUrl`;
   - đây là thay đổi khung **được phép** trong đợt này.
4. Mã lỗi mới `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415) + `ERROR_HTTP_STATUS`.
5. Mock:
   - kho nhật ký trong bộ nhớ, đúng các luật và mã lỗi ở mục 2;
   - phân bổ lần khớp và thống kê mock **gọi cùng hàm** `allocateSpotFill`, `computeEntryResult`, `computeJournalStats` của `@cex/core` (do quant làm song song);
   - lead gộp nhánh quant trước, rồi mới gộp nhánh contract.
6. Fixture: 7 mục mẫu (thắng, thua, hòa, đang mở, không có dừng lỗ, futures bị thanh lý, mục có phần bán `unattributed`).
7. README hợp đồng (mục mới "Nhật ký"), CHANGELOG, version.

**Việc — quant-engineer** (hàm thuần, chỉ `Dec`)
1. `packages/core/src/rMetrics.ts`: `riskAmount`, `rMultiple`, `summarizeR` đúng [quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) mục 1.
   Module C dùng lại ở C3; không có chỗ nào khác tính R.
2. `packages/core/src/journalFills.ts`, máy trạng thái của mục 2.1:
   - `allocateSpotFill(entryState | null, fill, lotRules)` trả về `{ action: OPEN | ADD | REDUCE | CLOSE | UNATTRIBUTED, allocatedQty, unattributedQty, allocatedQuote, allocatedFee, newState }`;
   - `computeEntryResult(state, plan)` cho Spot (mục 2.4); `futuresEntryResult(position, plan)` cho Futures.
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
     - còn lại < `minNotional` → CLOSE;
     - phí mua bằng coin gốc làm giảm khối lượng ròng;
     - mua sau khi đóng → mục mới.
   - Futures: vị thế thường; bị thanh lý; có funding âm/dương.
   - Ngày trong tuần lệch múi giờ: 23:30 UTC là ngày khác ở GMT+7.

**Không làm:** route server, bảng DB, giao diện.

**Nghiệm thu**
- [ ] Typecheck đạt; `npx vitest run packages/contracts packages/core` đạt.
- [ ] Drift check liệt kê đúng 10 endpoint chưa có route. Lint 0 lỗi.
- [ ] CHANGELOG ghi rõ "Thêm" và "Thay đổi nhỏ có thể ảnh hưởng UI" (`format: 'binary'`, `autoJournal`).

**Lệnh giao việc**
> (contract-designer) Làm **Đợt A1 phần hợp đồng** theo `docs/plans/module-A-nhat-ky-giao-dich.md` mục 2 và "Đợt A1", cùng `docs/plans/quy-uoc-R-va-nguon-du-lieu.md`. Nhánh `be/journal-a1-contracts`. Các quyết định đã duyệt: <dán A-D1…A-D7>. Mock gọi `allocateSpotFill`, `computeEntryResult`, `computeJournalStats` từ `@cex/core` (nhánh `be/journal-a1-stats` sẽ gộp trước bạn — tạm import theo tên đó). Báo cáo theo mẫu trong định nghĩa agent.
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
| Skill | `cex-feature-delivery`, `db-migration-host-safety`, `decimal-money-safety` |
| Thời lượng | 1–2 lượt |

**Việc**
1. `server/src/db/schema.ts`: 3 bảng (mục 2.5) → `npm run db:generate` → migration mới.
   - Kiểm migration chỉ thêm, không khóa bảng lớn. Không thêm trigger.
2. `server/src/modules/journal/`:
   - `allocator.ts`: **một** hàm `processFills(tx, userId, fills)` dùng chung cho mục AUTO (A3) và MANUAL.
     - Gọi `allocateSpotFill` / `futuresEntryResult`, ghi `journal_fills` + cập nhật mục trong **cùng transaction**, có `pg_advisory_xact_lock` theo người dùng.
     - Vi phạm unique → coi là đã xử lý.
   - `service.ts`: tạo `MANUAL` (kiểm lệnh/vị thế của chính người dùng — không thì 404 —, đã khớp, `source = 'USER'`, cùng cặp/thị trường), sửa, xóa `MANUAL`, khóa `initial_stop`.
   - `routes.ts`: 7 endpoint (trừ 3 endpoint ảnh — A4 — và `journalStats` — A3).
3. Đăng ký route trong `server/src/app.ts`.
4. Test (`server/src/modules/journal/journal.test.ts`, qua `apiHarness`):
   - CRUD + mọi mã lỗi ở mục 2.6;
   - mục MANUAL từ lệnh mua + bán → kết quả đúng số tính tay;
   - lệnh khớp làm 3 lần → 3 dòng `journal_fills`;
   - lệnh của người khác → 404; lệnh bot → 409;
   - **hai yêu cầu đồng thời** tạo mục từ cùng một lệnh → một 201 + một 409 (không phải 500);
   - gọi `processFills` hai lần cùng dữ liệu → không đổi gì;
   - giới hạn độ dài → 400; mục của người khác → 404;
   - xóa mục MANUAL không đụng lệnh; xóa AUTO → 409;
   - `initialStop` khóa sau lần bán đầu tiên.

**Không làm:** tự ghi nhật ký (A3), thống kê (A3), ảnh (A4).

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt (ghi N/N); typecheck, lint, drift check (còn 4 endpoint chưa route: stats + 3 ảnh).
- [ ] Reviewer không còn P0/P1.
- [ ] Báo cáo `docs/reports/<ngày>-journal-a2.md`.

**Lệnh giao việc**
> Làm **Đợt A2** theo `docs/plans/module-A-nhat-ky-giao-dich.md` (mục 2 + "Đợt A2") và `docs/plans/quy-uoc-R-va-nguon-du-lieu.md`. Nhánh `be/journal-a2-core`. Hợp đồng đã có ở `packages/contracts/src/journal.ts` — không sửa. Báo cáo theo mẫu.

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
   - **Quét** các lần khớp chưa ghi nhận (anti-join `journal_fills`, đủ 2 giây, từ mốc `autoJournalSince`) theo từng người dùng.
   - Gọi `processFills`, mỗi người một transaction.
   - Lần khớp bị loại (bot, `source ≠ USER`, trước mốc, đang tắt) vẫn ghi dòng có `skip_reason`.
   - Đánh thức bằng `ex.events` sau commit (lệnh Spot khớp; vị thế Futures mở, giảm, đóng). Quét định kỳ 60 giây. Quét toàn bộ lúc khởi động.
   - Lỗi: ghi log + thử lại tăng dần. **Không bao giờ** làm chậm hay hỏng việc đặt lệnh: không chạy trong transaction khớp lệnh, không `await` trong đường khớp lệnh.
2. Phát hành tính năng: lúc migration chạy, **không** ghi bù lịch sử. `autoJournalSince` của mọi người = thời điểm server bản mới khởi động lần đầu (A-D2).
3. Sửa `server/src/main.ts` + `test/helpers.ts` để bật bộ xử lý.
4. Test:
   - mua → mục `AUTO` `OPEN`; bán hết → `CLOSED` với kết quả đúng số tính tay;
   - mua 2 lần, bán một nửa → vẫn `OPEN`;
   - bán coin có từ faucet (không có mục) → không tạo mục, có dòng `unattributed`;
   - **phát lại sự kiện 2 lần + gọi quét song song 2 lần** → không trùng;
   - **mất sự kiện** (tắt bộ nghe, khớp lệnh, bật lại và quét) → bắt kịp, kết quả giống khi chạy liền;
   - `autoJournal = false` → không tạo; bật lại → chỉ ghi từ mốc mới;
   - lệnh Grid/DCA, tài khoản bot → không tạo;
   - futures mở/giảm/đóng/thanh lý;
   - lỗi giả lập trong bộ xử lý → lệnh vẫn khớp, số dư đúng, đối soát sạch; lần quét sau xử lý xong.

**Việc — quant-engineer**
1. `server/src/modules/journal/stats.ts`: truy vấn mục `CLOSED` trong khoảng + bộ lọc (một câu SQL lấy dữ liệu theo mục) → `computeJournalStats`.
2. Route `journalStats`.
3. Test vàng qua API: dữ liệu dựng bằng lệnh thật trên sàn test.
4. Test hiệu năng: 1.000 mục đã đóng → phản hồi < 300 ms trên máy dev (ghi số đo).

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; drift check còn 3 endpoint (ảnh).
- [ ] Đối soát sổ cái sạch trong mọi test có lệnh.
- [ ] Reviewer: không P0/P1. Kiểm riêng ba điểm: "không có phụ thuộc vào sự kiện trước commit", "trùng khi khởi động lại", "lần khớp nào cũng có đúng một dòng".

**Lệnh giao việc**
> (backend-builder) Làm **Đợt A3 phần tự ghi nhật ký** theo `docs/plans/module-A-nhat-ky-giao-dich.md` mục 2.1–2.2 và "Đợt A3". Nhánh `be/journal-a3-auto-stats`. Gọi skill `ledger-order-concurrency` trước khi đọc sự kiện lệnh.
>
> (quant-engineer) Làm **Đợt A3 phần thống kê** theo cùng file, nhánh `be/journal-a3-stats` (tách từ `be/journal-a3-auto-stats`). Chỉ sửa `server/src/modules/journal/stats.ts`, route `journalStats` và test của nó.

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
| Cần trước | A1 (giao diện trên mock); test chạy được khi A2–A4 đã gộp |
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
  - ảnh: kéo-thả; **thu nhỏ ở trình duyệt** còn ≤ 1600 px và nén WebP/JPEG ≤ 1 MB trước khi gửi.
- **Thống kê:**
  - thẻ win rate, kỳ vọng R, profit factor, drawdown;
  - đường R lũy kế;
  - theo setup / coin / ngày trong tuần;
  - "lỗi tốn bao nhiêu";
  - ghi chú A-D7 (khác trang Lãi lỗ khi đang giữ coin từ trước).
- **Lối vào:**
  - nút "Ghi nhật ký" ở dòng lệnh đã khớp (bảng lệnh), ở hộp đóng vị thế Futures;
  - toast sau khi khớp: "Thêm ghi chú?";
  - Cài đặt: bật/tắt tự ghi nhật ký;
  - (tùy chọn) ký hiệu B/S trên chart hiện setup khi rê chuột.
- `data-testid` theo danh sách của e2e.

**Việc — e2e-acceptance:** `e2e/tests/journal.spec.ts`
1. Mua rồi bán hết qua API → mục `AUTO` hiện trong `/journal`, lãi lỗ khớp `GET /api/v1/journal/:id`.
2. Mở mục, nhập setup + dừng lỗ → R hiện đúng số server.
3. Tải ảnh PNG → ảnh nhỏ hiện. Người dùng khác mở URL ảnh → 404.
4. Thống kê đổi sau khi có mục mới (win rate, số mục).
5. Tắt tự ghi → giao dịch mới không tạo mục.
6. @mobile: danh sách + chi tiết dùng được ở 390 px.

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
3. Chủ dự án nghiệm thu bằng mắt theo danh sách 6 bước của `journal.spec`.
4. Cập nhật `ROADMAP.md` GĐ5, báo cáo `docs/reports/<ngày>-module-A.md`.

## 4. Rủi ro và cách chặn
| Rủi ro | Chặn bằng |
|---|---|
| Lãi lỗ của mục lệch trang "Phân tích lãi lỗ" | Quyết định A-D7 + ghi chú trên giao diện + test vàng |
| Tự ghi nhật ký làm chậm hoặc hỏng việc đặt lệnh | Chạy ngoài transaction khớp lệnh, chỉ đọc dữ liệu sàn, lỗi chỉ ghi log + thử lại; test "lỗi giả lập → lệnh vẫn khớp" |
| Ghi trùng một lần khớp | `unique(spot_trade_id)` / `unique(futures_trade_id)` trên `journal_fills`; khóa advisory theo người dùng; test phát lại + quét song song |
| Bỏ sót lần khớp (mất sự kiện, server tắt) | Nguồn sự thật là bảng khớp lệnh (anti-join), quét lúc khởi động + mỗi 60 giây; đối soát "mỗi lần khớp đúng một dòng" |
| Thống kê bị chọn lọc (xóa mục thua) | Mục `AUTO` không xóa được (A-D2); R dùng dừng lỗ ban đầu, khóa sau lần giảm vị thế đầu tiên |
| Trộn số liệu nhật ký với tín hiệu | [Quy ước chung](quy-uoc-R-va-nguon-du-lieu.md) mục 2: `basis` trong mọi thống kê, không đọc chéo bảng, lệnh `source ≠ USER` không vào nhật ký |
| Ảnh độc hại (SVG/HTML giả ảnh) | Chữ ký đầu file, danh sách loại cố định, `nosniff`, CSP `default-src 'none'`, chỉ chủ xem |
| Database phình vì ảnh | 1 MB/ảnh, 50 MB/người; thu nhỏ ở trình duyệt; theo dõi kích thước bản sao lưu |
| Hai nhánh cùng tạo migration 0008 (A2 và C2) | Gộp lần lượt, nhánh sau rebase + `db:generate` lại |

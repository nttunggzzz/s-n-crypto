# Module A — Nhật ký giao dịch & thống kê cá nhân (Giai đoạn 5)

Đọc trước: [README](README.md) (đội ngũ, quy trình, quyết định A-D1…A-D7). ROADMAP GĐ5; `docs/parts/P05-loi-san.md` dòng 40–41; `P08-ui-san.md` "Giai đoạn 5".

## 1. Người dùng được gì
- Mỗi giao dịch của tôi tự có một **mục nhật ký**. Tôi ghi: vì sao vào lệnh (**setup**), **kế hoạch** (giá vào / dừng lỗ / chốt lời), **lỗi** đã mắc (FOMO, không đặt dừng lỗ…), **điểm** tự chấm 1–5, **ghi chú**, **ảnh** chart.
- Sàn **tự tính kết quả** từ các lần khớp thật: lãi/lỗ đã chốt (đã trừ phí), giá vào/ra trung bình, thời gian giữ, **R** (lãi/lỗ chia rủi ro dự kiến).
- **Thống kê cá nhân**: win rate, kỳ vọng R, profit factor, drawdown (USDT và R), chuỗi thắng/thua; theo setup, coin, hướng, ngày trong tuần, theo lỗi ("FOMO làm bạn mất 3,4R").

**Không làm** trong module này:
- chia sẻ nhật ký công khai;
- AI nhận xét;
- nhập lệnh từ sàn khác;
- nhật ký cho lệnh Grid/DCA (A-D5);
- xuất CSV nhật ký (để sau, dễ thêm vào `exports`).

## 2. Mô hình (đề xuất — chốt bằng A-D1…A-D7)

**Mục nhật ký** = một vòng giao dịch:
- **Spot:** nhóm ≥ 1 lệnh của người dùng **cùng cặp** (lệnh mua vào, lệnh bán ra). Một lệnh chỉ thuộc một mục.
- **Futures:** đúng **một vị thế** (mở → đóng). Một vị thế chỉ thuộc một mục.
- **Trạng thái:** `OPEN` → `CLOSED`.
  - Spot: tự đóng khi khối lượng còn giữ của các lệnh trong mục ≤ 1 bước khối lượng (`stepSize`).
  - Futures: tự đóng khi vị thế đóng.
  - Người dùng đóng tay được.
- **Nguồn:** `AUTO` (sàn tự tạo, A-D2) hoặc `MANUAL`.

**Kết quả** — server tính, giao diện **không** tự tính:
- Spot, theo **giá mua trung bình của chính mục đó** (A-D7):
  `lãi/lỗ = Σ(giá bán × kl bán) − giáTBmua × Σ kl bán − phí bán − phí mua × (Σ kl bán / Σ kl mua)`.
- Futures: `realized_pnl` của vị thế − phí + funding của vị thế (cùng định nghĩa trang Phân tích lãi lỗ).
- **Rủi ro dự kiến:**
  - `|giá vào − dừng lỗ| × khối lượng vào + phí ước tính 2 chiều`;
  - hoặc số USDT người dùng nhập;
  - không có thì `null`.
  - **R = lãi/lỗ ÷ rủi ro dự kiến** (`null` khi không có rủi ro — A-D4).
- **Kết quả:** `WIN` (> 0), `LOSS` (< 0), `BREAKEVEN` (= 0 sau làm tròn 8 số); `null` khi đang mở.
- Mọi số là `Dec`/chuỗi. Thống kê với n = 0 → `null` (không phải 0).

**Danh sách lỗi cố định** (`JournalMistake`): `FOMO`, `REVENGE`, `OVERSIZE`, `NO_STOP`, `MOVED_STOP`, `EARLY_EXIT`, `LATE_ENTRY`, `IGNORED_PLAN`, `OTHER`.

### Bảng mới (migration 0008, chỉ thêm — an toàn với sàn thật)
| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `journal_entries` | `id uuid`, `user_id`, `market` (SPOT/FUTURES), `symbol`, `direction` (LONG/SHORT), `status`, `origin`, `setup text null` (≤ 40), `tags text[]` (≤ 10 × 24), `plan_entry/plan_stop/plan_target/plan_risk_usdt numeric(38,18) null`, `notes text` (≤ 5.000), `mistakes text[]`, `execution_score smallint null` (1–5), `opened_at`, `closed_at null`, `created_at`, `updated_at` | index `(user_id, status, closed_at desc)`, `(user_id, setup)` |
| `journal_entry_links` | `entry_id` (FK, cascade), `user_id`, `spot_order_id null`, `futures_position_id null` | `unique(spot_order_id)`, `unique(futures_position_id)`, check đúng một trong hai |
| `journal_attachments` | `id uuid`, `entry_id` (FK, cascade), `user_id`, `content_type`, `bytes int`, `sha256`, `data bytea`, `created_at` | index `(user_id)` (tính hạn mức) |
| `user_preferences` | thêm `auto_journal boolean not null default true` (theo A-D2) | |

### API (một phiên bản hợp đồng mới, ví dụ 0.13.0 — số lấy theo thứ tự gộp)
| Endpoint | Method + path | Ghi chú |
|---|---|---|
| `journalList` | GET `/api/v1/journal` | lọc `status, market, symbol, setup, tag, from, to`; phân trang |
| `journalGet` | GET `/api/v1/journal/:entryId` | kèm tóm tắt lệnh/vị thế đã gắn + danh sách ảnh (chỉ thông tin) |
| `journalCreate` | POST `/api/v1/journal` → 201 | tạo tay; `links` tùy chọn |
| `journalUpdate` | PATCH `/api/v1/journal/:entryId` | mọi trường tùy chọn; `links` thay toàn bộ danh sách |
| `journalDelete` | DELETE `/api/v1/journal/:entryId` | xóa cả ảnh; không đụng lệnh |
| `journalSetups` | GET `/api/v1/journal/setups` | setup + tag đã dùng kèm số lần (gợi ý khi gõ) |
| `journalStats` | GET `/api/v1/journal/stats` | `range` (7d/30d/90d/all, theo `closed_at`) + lọc `market, symbol, setup, tag, direction` |
| `journalUploadAttachment` | POST `/api/v1/journal/:entryId/attachments` → 201 | JSON `{ contentType, dataBase64 }` |
| `journalAttachment` | GET `/api/v1/journal/attachments/:attachmentId` | **trả ảnh nhị phân** (định dạng mới `format: 'binary'`); giao diện dùng `<img src>` qua hàm `journalAttachmentUrl(id)` |
| `journalDeleteAttachment` | DELETE `/api/v1/journal/attachments/:attachmentId` | |
| `updatePreferences` | (có sẵn) | thêm `autoJournal` |

Mã lỗi:
- **`NOT_FOUND`**: không phải của mình, hoặc không có.
- **`CONFLICT`**, có `details.reason`:
  - `ORDER_ALREADY_LINKED`, `POSITION_ALREADY_LINKED`, `SYMBOL_MISMATCH`, `MARKET_MISMATCH`;
  - `BOT_ORDER` (lệnh Grid/DCA);
  - `TOO_MANY_ATTACHMENTS`.
- **Mới — `PAYLOAD_TOO_LARGE` (413):** ảnh > 1 MB hoặc vượt hạn mức.
- **Mới — `UNSUPPORTED_MEDIA_TYPE` (415):** không phải PNG/JPEG/WebP thật.

---

## 3. Các đợt

### Đợt A1 — Hợp đồng + công thức thống kê
| | |
|---|---|
| Người làm | `cex-contract-designer` (hợp đồng) ∥ `cex-quant-engineer` (công thức). **Song song được** — khác thư mục |
| Nhánh | `be/journal-a1-contracts`, `be/journal-a1-stats` |
| Cần trước | Chủ dự án duyệt A-D1…A-D7 |
| Thời lượng | 1 lượt |

**Việc — contract-designer**
1. `packages/contracts/src/journal.ts`:
   - enum: `JournalMarket`, `JournalDirection`, `JournalStatus`, `JournalOrigin`, `JournalMistake`, `JournalOutcome`, `JournalStatsRange`;
   - schema: `JournalPlan`, `JournalResult` (`filledQty, avgEntryPrice, avgExitPrice, realizedPnl, fees, riskUsdt, rMultiple, outcome, holdingMs` — đều nullable khi chưa có), `JournalEntry`, `JournalEntryDetail` (+ `links`, `attachments`), `JournalCreateRequest`, `JournalUpdateRequest`, `JournalListQuery`, `JournalStatsQuery`, `JournalStats` (mục 2), `JournalSetupList`, `JournalAttachment`, `JournalAttachmentUpload` (`dataBase64` ≤ 1.400.000 ký tự);
   - các giới hạn đặt thành hằng số dùng chung: `JOURNAL_LIMITS = { notes: 5000, tags: 10, tagLength: 24, setupLength: 40, attachmentsPerEntry: 4, attachmentBytes: 1_048_576, userQuotaBytes: 52_428_800 }`.
2. `endpoints.ts`: 10 endpoint ở bảng trên. `Preferences.autoJournal` (mặc định theo A-D2).
3. Khung hợp đồng: thêm `format: 'binary'` cho phản hồi nhị phân.
   - `server/src/lib/http.ts`: gửi `Buffer` + `Content-Type`, **không** kiểm schema phản hồi;
   - client: không gọi `fetch` cho endpoint này, chỉ có hàm `journalAttachmentUrl(id)` giống `exportUrl`;
   - đây là thay đổi khung **được phép** trong đợt này.
4. Mã lỗi mới `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415) + `ERROR_HTTP_STATUS`.
5. Mock: kho nhật ký trong bộ nhớ, đúng các luật/mã lỗi trên. Thống kê mock dùng **cùng hàm `computeJournalStats` của `@cex/core`** (do quant làm song song). Lead gộp nhánh quant trước, rồi mới gộp nhánh contract.
6. Fixture: 6 mục mẫu (thắng, thua, hòa, đang mở, không có dừng lỗ, futures).
7. README hợp đồng (mục mới "Nhật ký"), CHANGELOG, version.

**Việc — quant-engineer**
1. `packages/core/src/journalStats.ts` — hàm thuần, chỉ `Dec`:
   - `computeEntryResult(fills, plan)` cho Spot;
   - `computeJournalStats(closedEntries, opts)` trả về:
     - count, wins, losses, breakeven, winRate;
     - avgWin, avgLoss, profitFactor (USDT);
     - với các mục có R: avgR, expectancyR, maxDrawdownR (đỉnh → đáy của đường R lũy kế theo `closed_at`), maxDrawdownUsdt;
     - chuỗi thắng/thua dài nhất;
     - theo setup / symbol / direction / ngày trong tuần GMT+7 / lỗi (số lần + tổng R + tổng USDT);
     - đường R lũy kế.
2. Test vàng ≥ 15 ca, tính tay ghi trong comment: rỗng; 1 mục; toàn thua; không có R; hòa; mục futures; ngày trong tuần lệch múi giờ (23:30 UTC = thứ khác ở GMT+7); làm tròn.

**Không làm:** route server, bảng DB, giao diện.

**Nghiệm thu**
- [ ] Typecheck đạt; `npx vitest run packages/contracts packages/core` đạt; drift check liệt kê đúng 10 endpoint chưa có route; lint 0 lỗi.
- [ ] CHANGELOG ghi rõ "Thêm" và "Thay đổi nhỏ có thể ảnh hưởng UI" (`format: 'binary'`, `autoJournal`).

**Lệnh giao việc**
> (contract-designer) Làm **Đợt A1 phần hợp đồng** theo `docs/plans/module-A-nhat-ky-giao-dich.md` mục 2 và "Đợt A1". Nhánh `be/journal-a1-contracts`. Các quyết định đã duyệt: <dán A-D1…A-D7>. Thống kê trong mock gọi `computeJournalStats` từ `@cex/core` (nhánh `be/journal-a1-stats` sẽ gộp trước bạn — tạm import theo tên đó). Báo cáo theo mẫu trong định nghĩa agent.
>
> (quant-engineer) Làm **Đợt A1 phần công thức** theo cùng file. Nhánh `be/journal-a1-stats`. Chỉ sửa `packages/core/src/journalStats.ts`, test của nó, và `packages/core/src/index.ts` (export).

**Sau đợt:**
- Lead viết `docs/antigravity/PROMPT-14-nhat-ky-giao-dich.md`. Antigravity làm giao diện trên mock **ngay từ đây**, song song A2–A4.
- Thêm dòng "Backend → UI" ghi phần server sẽ có ở A2–A4.

---

### Đợt A2 — Lõi nhật ký trên server
| | |
|---|---|
| Người làm | `cex-backend-builder` → `cex-reviewer` |
| Nhánh | `be/journal-a2-core` |
| Cần trước | A1 đã gộp |
| Skill | `cex-feature-delivery`, `db-migration-host-safety`, `decimal-money-safety` |
| Thời lượng | 1–2 lượt |

**Việc**
1. `server/src/db/schema.ts`: 3 bảng + cột `auto_journal` (mục 2) → `npm run db:generate` → `server/drizzle/0008_*.sql`.
   - Kiểm migration chỉ thêm, không khóa bảng lớn.
   - Không thêm trigger.
2. `server/src/modules/journal/`:
   - `service.ts`: tạo, sửa, xóa, gắn lệnh/vị thế, tính kết quả, tự đóng.
     - Kiểm: lệnh/vị thế phải của chính người dùng (không thì 404), cùng `market` và `symbol`, không phải lệnh bot (`source !== 'USER'` → 409 `BOT_ORDER`), chưa thuộc mục khác (409).
     - Gắn lệnh chạy trong transaction; hai yêu cầu cùng gắn một lệnh → ràng buộc unique quyết định bên thắng, bên thua nhận 409 (không phải 500).
   - `results.ts`: lấy fills từ `trades` / `futures_trades` / `futures_positions` của các liên kết → gọi `computeEntryResult` (`@cex/core`).
   - `routes.ts`: 7 endpoint (trừ 3 endpoint ảnh — A4 — và `journalStats` — A3).
3. Đăng ký route trong `server/src/app.ts`.
4. Test (`server/src/modules/journal/journal.test.ts`, qua `apiHarness`):
   - CRUD;
   - gắn lệnh mua + bán → kết quả đúng số tính tay;
   - tự đóng khi bán hết;
   - lệnh của người khác → 404;
   - lệnh bot → 409;
   - hai yêu cầu đồng thời gắn một lệnh → một 200 + một 409;
   - giới hạn độ dài (notes, tags) → 400;
   - mục của người khác → 404;
   - xóa mục không đụng lệnh.

**Không làm:** tự ghi nhật ký (A3), thống kê (A3), ảnh (A4).

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt (ghi N/N); typecheck, lint, drift check (còn 4 endpoint chưa route: stats + 3 ảnh).
- [ ] Reviewer không còn P0/P1.
- [ ] Báo cáo `docs/reports/<ngày>-journal-a2.md`.

**Lệnh giao việc**
> Làm **Đợt A2** theo `docs/plans/module-A-nhat-ky-giao-dich.md` (mục 2 + "Đợt A2"). Nhánh `be/journal-a2-core`. Hợp đồng đã có ở `packages/contracts/src/journal.ts` — không sửa. Báo cáo theo mẫu.

---

### Đợt A3 — Tự ghi nhật ký + thống kê
| | |
|---|---|
| Người làm | `cex-backend-builder` (móc sự kiện + route) ∥ `cex-quant-engineer` (truy vấn thống kê + hiệu năng) → `cex-reviewer` |
| Nhánh | `be/journal-a3-auto-stats` (một nhánh; quant làm trên nhánh con `be/journal-a3-stats` rồi lead gộp vào) |
| Cần trước | A2 đã gộp |
| Skill | `ledger-order-concurrency` (đọc sự kiện lệnh), `decimal-money-safety` |
| Thời lượng | 1–2 lượt |

**Việc — backend-builder**
1. `server/src/modules/journal/auto.ts`: nghe sự kiện **sau khi commit** của sàn (`ex.events` — lệnh khớp; futures: vị thế mở/đóng). Chỉ lệnh `source = 'USER'` của người có `autoJournal = true`.
   - Spot mua: gắn vào mục `AUTO` đang `OPEN` của cặp đó, không có thì tạo mới.
     - Kế hoạch lấy từ TP/SL gắn kèm lệnh (nếu có) và giá TB.
     - Rủi ro tính theo công thức mục 2.
   - Spot bán: gắn vào mục `OPEN` gần nhất của cặp; bán hết → `CLOSED`.
   - Futures: mở vị thế → tạo mục gắn vị thế; đóng → `CLOSED`.
   - **Một hàng đợi cho mỗi người dùng** (không chạy song song cho cùng người).
     - Phát lại sự kiện không tạo trùng (ràng buộc unique của liên kết).
     - Lỗi ở đây ghi log + thử lại, **không bao giờ** làm hỏng việc đặt lệnh.
2. Sửa `server/src/main.ts` + `test/helpers.ts` để bật bộ nghe này.
3. Test:
   - mua → mục `AUTO` `OPEN`; bán hết → `CLOSED` với kết quả đúng;
   - hai lần mua rồi một lần bán một nửa → vẫn `OPEN`;
   - phát lại sự kiện 2 lần → không trùng;
   - `autoJournal = false` → không tạo;
   - lệnh Grid/DCA → không tạo;
   - futures mở/đóng;
   - lỗi giả lập trong bộ nghe → lệnh vẫn khớp, số dư đúng (đối soát sạch).

**Việc — quant-engineer**
1. `server/src/modules/journal/stats.ts`: truy vấn các mục `CLOSED` trong khoảng + bộ lọc (một câu SQL lấy fills theo mục) → `computeJournalStats`.
2. Route `journalStats`.
3. Test vàng qua API (dữ liệu dựng bằng lệnh thật trên sàn test) + hiệu năng: 1.000 mục đã đóng → phản hồi < 300 ms trên máy dev (ghi số đo).

**Nghiệm thu**
- [ ] `npm test` toàn bộ đạt; drift check còn 3 endpoint (ảnh).
- [ ] Đối soát sổ cái sạch trong mọi test có lệnh.
- [ ] Reviewer: không P0/P1; kiểm riêng "sự kiện trước commit" và "trùng khi khởi động lại".

**Lệnh giao việc**
> (backend-builder) Làm **Đợt A3 phần tự ghi nhật ký** theo `docs/plans/module-A-nhat-ky-giao-dich.md`. Nhánh `be/journal-a3-auto-stats`. Gọi skill `ledger-order-concurrency` trước khi đọc sự kiện lệnh.
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
| Tự ghi nhật ký làm chậm hoặc hỏng việc đặt lệnh | Chạy sau commit, hàng đợi riêng, lỗi chỉ ghi log; test "lỗi giả lập → lệnh vẫn khớp" |
| Ảnh độc hại (SVG/HTML giả ảnh) | Chữ ký đầu file, danh sách loại cố định, `nosniff`, CSP `default-src 'none'`, chỉ chủ xem |
| Database phình vì ảnh | 1 MB/ảnh, 50 MB/người; thu nhỏ ở trình duyệt; theo dõi kích thước bản sao lưu |
| Hai nhánh cùng tạo migration 0008 (A2 và C2) | Gộp lần lượt, nhánh sau rebase + `db:generate` lại |

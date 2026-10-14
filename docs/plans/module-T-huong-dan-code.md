# Module T — Hướng dẫn code từng bước (để giao cho model Sonnet)

Lập: 2026-10-14, kỹ sư chính. Đi kèm [module-T-thue-viet-nam.md](module-T-thue-viet-nam.md): file đó trả lời **làm gì, vì sao**; file này trả lời **code thế nào**.
Mỗi thẻ viết đủ để model Sonnet làm **mà không phải tự quyết thiết kế**. Gặp chỗ thẻ không nói thì **dừng và hỏi lead**, không đoán.

## 0. Cách giao việc cho Sonnet

- Lead gọi công cụ Agent với các tham số:
  - `model: "sonnet"`;
  - `subagent_type` ghi trên thẻ;
  - `isolation: "worktree"`;
  - prompt = toàn bộ khối **"Lệnh giao việc"** của thẻ.
- Rà kết quả (`cex-reviewer`) và gộp `main` vẫn do lead làm (model mặc định). Sonnet chỉ code, test và commit trên nhánh của thẻ.
- **Sau khi gộp, lead xóa worktree của thẻ.** Trước đó gỡ junction `node_modules/@cex/*` bằng `cmd /c rmdir`, rồi chạy `git worktree remove --force`.
  Lý do (bài học 2026-10-14): worktree còn mở trong `.claude/worktrees` làm `npm run lint` trên main lỗi "multiple candidate TSConfigRootDirs" (738 lỗi giả).
  Đã sửa gốc: `eslint.config.js` bỏ qua `.claude/**`. Vẫn xóa worktree sau khi gộp cho gọn.
- Mỗi thẻ có 3 phần:
  - **Đầu vào** — phải có trước khi làm;
  - **Bước code** — theo thứ tự;
  - **Nghiệm thu** — lệnh và con số phải dán vào báo cáo.

### Quy tắc chung (dán vào đầu mọi lệnh giao việc)
```
Quy tắc dự án bắt buộc (CLAUDE.md, mục Bất biến):
- Số dư chỉ đổi qua applyBalanceChanges() trong transaction. Tiền dùng Dec (@cex/core), chuỗi trong API, numeric(38,18) trong DB.
  Không dùng number cho tiền. Người dùng trả thì làm tròn lên, nhận thì làm tròn xuống, 8 chữ số.
- Endpoint đăng ký bằng route() theo packages/contracts/src/endpoints.ts. Không đổi hợp đồng (packages/contracts) trừ khi thẻ cho phép.
- Dữ liệu người dùng lọc theo auth.user.id; không thấy thì trả 404, không trả 403.
- Admin: mọi thay đổi gọi writeAudit() trong CÙNG transaction.
- Không sửa apps/**, packages/ui/** (của Antigravity), không sửa host/, host-data/.
- Worktree: node_modules/@cex/* phải trỏ vào packages của worktree (junction), nếu không thì typecheck xanh giả.
- Không báo xong khi chưa chạy lệnh thật. Dán lệnh + kết quả.
- Migration: chỉ thêm (cột nullable hoặc default hằng); diễn tập trên DB tạm có dữ liệu cũ như T2 đã làm.
- Commit trên nhánh của thẻ, không gộp main, không push. Cuối commit message:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  (ghi đúng model đang chạy: Sonnet thì ghi "Claude Sonnet 5.5")
```

## 1. Trạng thái

| Thẻ | Nhánh | Trạng thái |
|---|---|---|
| T1 hợp đồng | `be/tax-t1-contracts` | **Đã gộp** `ca59bc2` (cùng T2) |
| T2 lõi backend | `be/tax-t2-core` (nền T1) | **Đã gộp** `ca59bc2`; verify 424/424; rà: 0 P0/P1, 1 P2 + 7 P3 → T3 mục 3.0 |
| **T2R** rà + gộp T1+T2 | — | **Xong** 2026-10-14 (đã push) |
| **T3** API báo cáo | `be/tax-t3-reports` | **Đã gộp** `fdc0000` (Sonnet); verify 447/447; rà: 0 P0/P1, 1 P2 → T3F |
| **T4a** test e2e + testid | `be/tax-t4-e2e` | **Đã gộp** `f7c8fe4` (Sonnet, effort medium); đỏ tới khi có UI |
| **T3F** sửa theo rà T3 + realtime thuế | `be/tax-t3f` | Sonnet, effort high, thẻ ở mục 4F — **trước T5** |
| **T4b** giao diện | `ui/gd2-exchange` | Antigravity (PROMPT-16, lead viết) |
| **T5** lên sàn thật | — | Lead + chủ dự án |

---

## 2. Thẻ T2R — Rà và gộp T1+T2 (lead, không giao Sonnet)

1. Đọc báo cáo T2.
2. Gọi `cex-reviewer` trên `be/tax-t2-core` (bao gồm cả các commit của T1) với các trọng tâm sau:
   - bất biến 1, 2, 4, 12, 19;
   - migration an toàn trên sàn thật;
   - thuế không trích 2 lần;
   - không có cột giấy tờ.
3. Có P0/P1 thì trả lại T2 sửa.
4. Trong worktree T2: `npm run verify`.
5. `git merge --no-ff be/tax-t2-core` vào main → `npm run verify` trên main → `git push origin main`.
6. Bàn giao:
   - `docs/LOI-HIEN-TAI.md`, mục Backend → UI, thêm dòng contracts 0.15.0. Gồm: nhãn `TAX_WITHHOLDING` cho `WalletPage.tsx:260`, option `TAX_SETTINGS_UPDATE` cho `AuditLogsPage.tsx:55`, quyền `tax.read` cho support;
   - ô ROADMAP;
   - báo cáo `docs/reports/2026-10-xx-thue-t1-t2.md`.

---

## 3. Thẻ T3 — API báo cáo thuế (Sonnet)

**Agent:** `cex-backend-builder`, `model: "sonnet"`. **Nhánh:** `be/tax-t3-reports` từ `main` **sau khi T2R gộp** (đã gộp: `ca59bc2`).
**Đầu vào:**
- `main` có bảng `tax_withholdings`, `trades.tax`, `user_tax_profiles` (migration 0008);
- hợp đồng 0.15.0 (`packages/contracts/src/tax.ts`, `endpoints.ts` dòng ~280–342).

### 3.0. Sửa theo kết quả rà T2R (làm TRƯỚC 3.1, commit riêng "Tax T3 step 0")
Reviewer kết luận gộp được, nhưng có các mục sau phải sửa trước khi bật thuế trên sàn thật:
1. **P2 — lưu phân loại người bán trên từng lệnh BÁN.** Migration **0009** (chỉ thêm):
   - Thêm cột `trades.tax_category text NULL`.
   - Trong `settleFills`: với **mọi** lệnh SELL (kể cả khi `taxMode = OFF` và khi là `DOMESTIC_ORG`) ghi phân loại của người bán **lúc khớp**. Phân loại này đã được đọc trong transaction ở T2; dùng lại biến đó, không đọc lần 2. BUY để `NULL`.
   - Không đổi hợp đồng (cột chỉ dùng nội bộ cho báo cáo).
   - Test: đặt `DOMESTIC_ORG` → bán → đặt lại `INDIVIDUAL` → trade đó vẫn có `tax_category = 'DOMESTIC_ORG'`, không có bản ghi khấu trừ.
2. **P3 — CHECK trên `exchange_settings`**, trong cùng migration 0009:
   - `tax_mode IN ('OFF','WITHHOLD')`;
   - `tax_rate > 0 AND tax_rate <= 0.01`.

   Bảng có đúng 1 hàng nên thêm CHECK rẻ. Trước khi thêm, kiểm tra hàng hiện có thỏa điều kiện.
3. **P3 — `ExchangeConfig.reload()`** (`server/src/modules/exchange/exchangeConfig.ts:42-45`):
   - Cho các lần reload chạy **nối tiếp** bằng chuỗi promise (`this.reloading = this.reloading.then(load, load)`), để lần đọc cũ không ghi đè lần mới.
   - Nếu reload sau commit bị lỗi: ghi log + thử lại 1 lần, **không** trả 500 cho request đã commit.
   - Test: gọi 2 reload song song, xen giữa là một lần đổi DB → cache phải theo giá trị mới.
4. **P3 — chú thích sai** `orderService.ts:501` ("never goes negative"): sửa thành đúng điều kiện. Âm chỉ có thể xảy ra khi quoteQty của một lần khớp < 2e-8, cặp thật không gặp.
5. **P3 — CHANGELOG 0.15.0** (`packages/contracts/CHANGELOG.md:4, :40`) ghi lại cho đúng sau khi đã gộp:
   - server đã trả `Trade.tax` và `exchangeInfo`;
   - đã có route `taxProfile`, `taxUpdateProfile`, `adminTaxSettings`, `adminUpdateTaxSettings`;
   - 6 endpoint báo cáo có route từ T3.

   Đây là lần duy nhất thẻ này được sửa `packages/contracts`.
6. **P3 — mock** `packages/contracts/src/mocks/journal.ts:147-152`: dùng `a.allocatedTax` do `replayAllocations` trả về, xóa phép chia tự viết. Test mock nhật ký vẫn xanh.
7. **Test còn thiếu:**
   - LIMIT SELL khớp từng phần ≥ 3 lần khi thuế bật: mỗi phần làm tròn riêng, Σ khớp sổ cái, `lockedAfter` đúng;
   - HTTP `ledger?type=TAX_WITHHOLDING` trả đúng dòng;
   - `adminRunReconciliation` trả được 2 loại lệch thuế (response khớp schema).

**Không** đổi vị trí cột `tax` trong CSV giao dịch (đã công bố trong CHANGELOG).

### 3.1. File tạo mới / sửa
| File | Việc |
|---|---|
| `server/src/modules/tax/reports.ts` (mới) | Hàm truy vấn + tổng hợp (mục 3.2–3.5) |
| `server/src/modules/tax/period.ts` (mới) | Tính mốc thời gian UTC+7 (mục 3.2) |
| `server/src/modules/tax/routes.ts` | Thêm 6 route. Nếu T2 đã đặt route thuế ở chỗ khác thì thêm vào đúng file đó, **không** tạo file thứ hai |
| `server/src/modules/exchange/exports.ts` | Thêm `exportTaxCsv`, `exportAdminTaxCsv`; dùng lại `csv()` và `gmt7()` có sẵn (export `csv` nếu chưa export) |
| `server/src/modules/tax/reports.test.ts` (mới) | Test mục 3.7 |

Không sửa: `packages/contracts/**` (trừ 3.0 mục 5–6) và `orderService.ts` (trừ 3.0 mục 1, 4). Migration duy nhất là **0009** ở 3.0.

### 3.2. Mốc thời gian theo giờ Việt Nam (`period.ts`)
```ts
const VN_OFFSET_MS = 7 * 3_600_000;
/** Mốc 00:00 UTC+7 ngày 1 của tháng (m: 1..12) → Date UTC. m = 13 → tháng 1 năm sau. */
export function vnMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - VN_OFFSET_MS);
}
/** "2026-10" → [from, to] ; "2026-Q4" → [from, to]. `to` = mili giây cuối kỳ (TÍNH CẢ mốc đó). */
export function periodRange(period: string): { from: Date; to: Date } {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  const [y, first, count] = q ? [Number(q[1]), (Number(q[2]) - 1) * 3 + 1, 3] : [Number(m![1]), Number(m![2]), 1];
  const from = vnMonthStart(y, first);
  const to = new Date(vnMonthStart(y, first + count).getTime() - 1);
  return { from, to };
}
/** Năm hiện tại theo UTC+7. */
export const vnYearNow = (now = new Date()) => new Date(now.getTime() + VN_OFFSET_MS).getUTCFullYear();
```
Kiểm bằng ví dụ có sẵn trong hợp đồng: `2026-10` → `to = "2026-10-31T16:59:59.999Z"`. Quý: `2026-Q4` → `from = 2026-09-30T17:00:00.000Z`.

### 3.3. Tổng hợp bản ghi khấu trừ → `TaxTotals`
Một hàm dùng chung cho cả người dùng và admin. Gom theo `group` (tháng / category / symbol):
```sql
SELECT <group> AS g,
       count(*)                          AS withholding_count,
       count(DISTINCT user_id)           AS user_count,          -- chỉ admin dùng
       coalesce(sum(gross_quote), 0)     AS withheld_gross_quote,
       coalesce(sum(tax_amount), 0)      AS tax_amount,
       sum(gross_vnd)                    AS withheld_gross_vnd,
       sum(tax_vnd)                      AS tax_vnd,
       count(*) FILTER (WHERE vnd_rate IS NULL) AS vnd_missing_count
FROM tax_withholdings
WHERE created_at >= $from AND created_at <= $to [AND user_id = $user]
GROUP BY g
```
Nhóm theo tháng giờ VN: `to_char(created_at AT TIME ZONE 'UTC' + interval '7 hours', 'YYYY-MM')`.
Phải kiểm cột là `timestamptz` hay `timestamp`, rồi viết đúng một cách. Test ở mục 3.7 kiểm chính xác mốc 16:59:59.999Z và 17:00:00Z.

Chuyển sang response:
- tiền: `toFixedStr(dec(x))` (8 chữ số), giống mọi chỗ khác;
- VND: chuỗi số nguyên;
- **`withheldGrossVnd` và `taxVnd` = `null` khi `vnd_missing_count > 0`** (không trả tổng thiếu);
- nhóm không có bản ghi: mọi số = "0" / 0, VND = `"0"`, `vndMissingCount` = 0.

### 3.4. Doanh số bán → `TaxSales` (chỉ người dùng)
```sql
SELECT <tháng VN> AS g,
       count(*) AS sell_count,
       coalesce(sum(quote_qty),0) AS sell_gross_quote,
       coalesce(sum(fee),0) AS sell_fees,
       coalesce(sum(realized_pnl),0) AS realized_pnl,
       count(*) FILTER (WHERE realized_pnl IS NULL) AS sells_without_cost_basis
FROM trades WHERE user_id = $user AND side = 'SELL' AND created_at BETWEEN $from AND $to
GROUP BY g
```
Tính trên **mọi** lệnh bán, kể cả lệnh không bị trích thuế.

### 3.5. Sáu endpoint
| Endpoint | Code |
|---|---|
| `taxSummary` | `year = query.year ?? vnYearNow()`. `from = vnMonthStart(year,1)`, `to = vnMonthStart(year,13) − 1ms`. Chạy 3.3 + 3.4 theo tháng, **luôn trả 12 dòng** (tháng trống = số 0). `totals` = gộp 12 tháng; VND tổng null nếu tổng `vndMissingCount > 0`. `category` = phân loại hiện tại (`user_tax_profiles`, không có dòng → `INDIVIDUAL`). `asset: 'USDT'` |
| `taxWithholdings` | Lọc `user_id = auth.user.id`, `symbol?`, `from?`, `to?`; `ORDER BY id DESC`; phân trang bằng `cursorId()` + `page()` y như `routes.ts` của exchange (`id < cursor`, lấy `limit + 1`). Serializer: id, tradeId, orderId là chuỗi; `createdAt` ISO |
| `taxExport` | Cùng bộ lọc, `LIMIT MAX_EXPORT_ROWS`, cột đúng thứ tự `TAX_EXPORT_COLUMNS` (import từ `@cex/contracts`, **không** gõ lại). `time_utc` = ISO, `time_gmt7 = gmt7(iso)`, null = ô trống |
| `adminTaxSummary` | `periodRange(query.period)`. `totals` (có `userCount`); `byCategory`: **đủ 3 dòng** theo thứ tự enum `TaxCategory.options` (`DOMESTIC_ORG` luôn 0); `bySymbol`: chỉ cặp có bản ghi, sắp `taxAmount` giảm dần (so sánh bằng `Dec`, không bằng chuỗi). Trả `from`, `to` ISO |
| `adminTaxWithholdings` | Như `taxWithholdings` nhưng không ép user; lọc thêm `userId?`; mỗi dòng có `userId` |
| `adminTaxExport` | Như `taxExport`, cột `ADMIN_TAX_EXPORT_COLUMNS` |

Quyền đã khai trong hợp đồng (`tax.read`). `route()` tự kiểm; **không** tự viết kiểm quyền.

### 3.6. Không được làm
- Không tính lại thuế từ `trades`. Báo cáo đọc `tax_withholdings` (nguồn sự thật). Doanh số (3.4) mới đọc `trades`.
- Không dùng `parseFloat`/`Number` cho tiền. Tổng do SQL tính, ra chuỗi rồi `dec()`.
- Không thêm endpoint ngoài 6 endpoint trên.

### 3.7. Test bắt buộc (`reports.test.ts`, DB thật qua helpers trong `server/test/`)
Dựng dữ liệu bằng **đặt lệnh thật** qua OrderService + giá giả (xem cách test thuế T2 làm). Không chèn thẳng `tax_withholdings`, trừ test mốc thời gian (được chèn với `created_at` cố định).
1. `periodRange`: `2026-10`, `2026-01`, `2026-12` (sang năm), `2026-Q1`, `2026-Q4`; bản ghi lúc `2026-10-31T16:59:59.999Z` thuộc tháng 10, lúc `17:00:00.000Z` thuộc tháng 11.
2. `taxSummary`: 12 tháng; tổng = Σ bản ghi; có một bản ghi thiếu tỷ giá → VND tháng đó và tổng là `null`, `vndMissingCount = 1`; `sellCount` đếm cả lệnh bán lúc thuế OFF.
3. Người A không thấy dữ liệu người B ở cả 3 endpoint người dùng (danh sách rỗng / tổng 0).
4. Phân trang: 3 bản ghi, `limit=2` → trang 1 có 2 dòng + `nextCursor`, trang 2 có 1 dòng + `null`.
5. CSV: dòng tiêu đề đúng `TAX_EXPORT_COLUMNS.join(',')` (sau BOM); số dòng; ô null rỗng.
6. Admin: thiếu `tax.read` → 403; `byCategory` đủ 3 dòng; `bySymbol` sắp đúng; `userCount` đúng.
7. Response khớp schema (dev/test tự kiểm qua `route()`; chỉ cần gọi qua HTTP).

### 3.8. Nghiệm thu (dán vào báo cáo)
```
npm run typecheck
npx vitest run server/src/modules/tax        # số test, số đạt
npm test                                     # tổng
npm run lint
npm run ui-coverage                          # 6 endpoint thuế không còn trong danh sách thiếu route
```

### 3.9. Lệnh giao việc T3 (dán nguyên khối, kèm "Quy tắc chung" mục 0)
```
Đợt T3 Module T: sửa theo kết quả rà T2R (mục 3.0) rồi làm API báo cáo thuế (mục 3.1–3.7).
Đọc docs/plans/module-T-huong-dan-code.md mục 3 và làm ĐÚNG theo đó; mục nào không rõ thì dừng và hỏi, không tự quyết thiết kế.
Nhánh be/tax-t3-reports từ main. Hai commit: "Tax T3 step 0" (mục 3.0, migration 0009) và "Tax T3 reports".
Hợp đồng: packages/contracts/src/tax.ts + endpoints.ts — chỉ được sửa CHANGELOG và mocks/journal.ts theo mục 3.0.
Báo cáo: file đã sửa, migration 0009 và vì sao an toàn cho sàn thật, số test mới, kết quả các lệnh ở mục 3.8.
```

---

## 4. Thẻ T4a — Test nghiệm thu giao diện + danh sách testid (Sonnet)

**Agent:** `cex-e2e-acceptance`, `model: "sonnet"`. **Nhánh:** `be/tax-t4-e2e` từ `main` sau T3.
Viết test **trước** khi Antigravity làm giao diện. Test đỏ là bình thường cho tới khi giao diện xong.

### 4.1. `docs/antigravity/TESTIDS.md` — thêm mục "Thuế (Module T)"
| testid | Ở đâu | Nội dung |
|---|---|---|
| `tax-breakdown` | form đặt lệnh, tab BÁN | khối 4 dòng; **không có** khi `taxMode = OFF` |
| `tax-gross` / `tax-fee` / `tax-amount` / `tax-net` | trong `tax-breakdown` | giá trị gộp / phí / thuế 0,1% / thực nhận ước tính |
| `tax-vnd` | trong `tax-breakdown` | quy đổi VND; **không có** khi `taxVndRate = null` |
| `tax-test-label` | trong `tax-breakdown` | nhãn "thử nghiệm" |
| `account-tax-page` | Tài khoản → Thuế | trang |
| `tax-year-select`, `tax-year-total`, `tax-month-row` | trang Thuế | chọn năm, tổng năm, dòng tháng |
| `tax-category-select` | trang Thuế | chọn phân loại (3 lựa chọn, không có ô nhập giấy tờ) |
| `tax-withholding-row`, `tax-export-csv` | trang Thuế | dòng khấu trừ, nút tải CSV |
| `admin-tax-page`, `admin-tax-mode`, `admin-tax-rate`, `admin-tax-vnd-rate`, `admin-tax-reason`, `admin-tax-save` | Admin → Thuế | cài đặt |
| `admin-tax-period`, `admin-tax-total`, `admin-tax-by-symbol-row`, `admin-tax-export-csv` | Admin → Thuế | tổng hợp kỳ |

### 4.2. Spec `e2e/tests/tax.spec.ts` (hệ default :5190)
1. Admin bật thuế (`admin-tax-mode` = WITHHOLD, lý do) → người dùng mở form BÁN BTCUSDT, nhập khối lượng → thấy `tax-breakdown`. `tax-amount` = roundUp8(gộp × 0,001), so bằng `Dec` trong test.
2. Đặt lệnh BÁN MARKET → số dư USDT tăng đúng `gộp − phí − thuế` (đọc qua API `balances`).
3. Trang Thuế: có `tax-withholding-row`; `tax-year-total` = thuế vừa trích; tải CSV, dòng tiêu đề = `TAX_EXPORT_COLUMNS`.
4. Đổi phân loại sang `DOMESTIC_ORG` → bán tiếp → không thêm dòng khấu trừ.
5. Admin tắt thuế → form BÁN không còn `tax-breakdown`.
6. Chưa đặt tỷ giá → không có `tax-vnd`; đặt tỷ giá → có.
7. Form MUA không bao giờ có `tax-breakdown`.

Dùng fixtures có sẵn (`e2e/fixtures`): chặn lỗi console, 5xx, VALIDATION_ERROR. Đăng nhập admin có 2FA theo cách các spec admin đang làm.

### 4.3. Nghiệm thu
```
npm run lint
npm run ui-check -- --no-verify --only tax --project=desktop   # được phép đỏ khi UI chưa có; báo số ca và lỗi đầu tiên
```

### 4.4. Lệnh giao việc T4a
```
Đợt T4a Module T: test e2e + testid cho giao diện thuế. Đọc docs/plans/module-T-huong-dan-code.md mục 4, làm đúng theo đó.
Chỉ sửa e2e/** và docs/antigravity/TESTIDS.md. Nhánh be/tax-t4-e2e từ main. Không sửa apps/**.
```

---

## 4F. Thẻ T3F — Sửa theo lần rà T3 + đẩy cài đặt thuế qua realtime (Sonnet, effort high)

**Agent:** `cex-backend-builder`, `model: "sonnet"`, `effort: "high"` (đụng cache cài đặt quyết định trừ tiền).
**Nhánh:** `be/tax-t3f` từ `main` (≥ `f7c8fe4`). **Phải xong trước T5.** Không có migration.

1. **P2 — cache thuế kẹt giá trị cũ** (`server/src/modules/exchange/exchangeConfig.ts` `reloadAfterCommit`):
   - Khi lần thử thứ 2 cũng lỗi, đặt cờ `stale = true` rồi lên lịch thử lại có backoff: 1 s, 2 s, 4 s … tối đa 30 s, lặp tới khi thành công. Thành công thì xóa cờ.
   - Gửi cảnh báo qua `server/src/ops/alerts.ts`, theo cách các cảnh báo khác đang gửi (một lần khi bắt đầu kẹt, một lần khi hồi phục).
   - Timer dùng `unref()` để không giữ tiến trình. Dừng timer khi server tắt (theo cách các job nền khác dừng).
   - Test: `load` lỗi 3 lần rồi thành công → sau backoff, `config.tax.mode` khớp DB; có đúng 1 cảnh báo kẹt + 1 hồi phục.
2. **P3 — reload sau commit trong admin:** các chỗ gọi `reload()` sau commit ở `server/src/modules/admin/adminService.ts` (~539, 550, 587, 666) chuyển sang `reloadAfterCommit()`. Request đã commit thì không bao giờ trả 500 vì reload.
3. **Realtime — cài đặt thuế đổi là form BÁN cập nhật ngay** (spec e2e T4a ca 5 cần):
   - Hợp đồng: `ExchangeStatus` (`packages/contracts/src/market.ts:205`) thêm `taxMode`, `taxRate`, `taxVndRate: DecimalString | null`. Chỉ thêm trường.
   - Cập nhật fixture, mock (mock gửi `exchange:status` khi `setMockTax()` / PATCH mock), CHANGELOG **0.16.0**, README §15.
   - Server: `ExchangeConfig.exchangeStatus()` trả thêm 3 trường. Sau khi PATCH thuế commit + reload, phát `exchange:status`, giống như khi admin dừng sàn (xem `realtime/hub.ts:55` đang nghe sự kiện nào thì phát đúng sự kiện đó).
   - Test: client đăng ký `exchange:status`, admin PATCH `taxMode` → nhận sự kiện có `taxMode` mới.
4. **P3 — lọc userId an toàn** (`server/src/modules/tax/reports.ts:177`):
   - Tách thành hai hàm: hàm cho người dùng **bắt buộc** có `userId: string` (kiểu không optional), hàm cho admin nhận `userId?`.
   - Chuỗi rỗng → `VALIDATION_ERROR`, không bao giờ bỏ qua bộ lọc.
5. **P3 — test báo cáo độc lập** (`server/src/modules/tax/reports.test.ts`):
   - Lấy kỳ từ `createdAt` của chính bản ghi vừa tạo (tính tháng UTC+7 bằng JS), không lấy từ đồng hồ.
   - Khối admin kiểm bằng **hiệu số**: gọi `adminTaxSummary` trước và sau khi tạo dữ liệu; danh sách và CSV lọc theo `userId` của người dùng trong test.
   - Bỏ ghi chú "ORDER MATTERS". Chạy `npx vitest run server/src/modules/tax --sequence.shuffle` 3 lần, cả 3 lần đều xanh.
6. **P3 — test "two reloads in parallel"** (`exchange/tax.test.ts:~558`): giữ `load` của lần 1 lại sau khi nó SELECT xong, đợi lần 2 xong rồi mới thả lần 1 → cache phải mang giá trị mới. Kiểm chứng test này **đỏ** khi tạm bỏ việc nối tiếp, rồi trả code lại.
7. **P3 — báo cáo cộng một đồng quote:** `adminUpdateTaxSettings` từ chối bật `WITHHOLD` (`VALIDATION_ERROR`, field `taxMode`) khi đang bật một cặp có quote ≠ USDT. Ghi ràng buộc này vào README §15.
8. **P3 — số liệu nhất quán + tải:**
   - Các truy vấn của một lần `taxSummary` / `adminTaxSummary` chạy trong `db.transaction(..., { isolationLevel: 'repeatable read', accessMode: 'read only' })`.
   - Thêm rate limit cho `taxSummary` theo cách `taxExport` đang làm (thay cho index mới trên `trades`).

Nghiệm thu: `npm run typecheck`, `npx vitest run server/src/modules/tax server/src/modules/exchange/tax.test.ts` (+ shuffle 3 lần), `npm test`, `npm run lint`, test contracts. Dán lệnh + số.

Lệnh giao việc T3F:
```
Đợt T3F Module T: sửa theo lần rà T3 và đẩy cài đặt thuế qua exchange:status. Đọc docs/plans/module-T-huong-dan-code.md mục 4F, làm ĐÚNG theo đó;
mục nào không rõ thì dừng và hỏi. Nhánh be/tax-t3f từ main. Được sửa server/** và packages/contracts/** (chỉ phần mục 3: ExchangeStatus, fixture, mock, CHANGELOG 0.16.0, README §15).
```

## 5. Thẻ T4b — PROMPT-16 cho Antigravity (lead viết sau T4a)
Nội dung lấy từ kế hoạch mục 3.6 + bảng testid mục 4.1, cùng các điểm sau:
- form BÁN tính ước tính phía client từ `exchangeInfo.taxMode/taxRate/taxVndRate` + `feeRate`, làm tròn bằng `@cex/core`;
- nhãn sổ cái `TAX_WITHHOLDING` (`WalletPage.tsx:260`);
- option audit `TAX_SETTINGS_UPDATE` (`AuditLogsPage.tsx:55`);
- futures hiện dòng "Futures: chưa có quy định thuế, không khấu trừ";
- không có ô nhập CCCD/MST ở bất kỳ đâu.

Antigravity làm trên mock 0.15.0 (mock đã trích thuế, tỷ giá 26350) rồi chạy `tax.spec.ts`.

## 6. Thẻ T5 — Lên sàn thật (lead + chủ dự án)
```
npm run host -- backup          # sao lưu + diễn tập khôi phục
npm run host -- update          # migration T2 chạy khi khởi động
npm run host -- status
```
- Kiểm tra đối soát sạch (Admin → Đối soát).
- `taxMode` vẫn `OFF`. **Chủ dự án** tự bật trong Admin → Thuế và nhập tỷ giá.
- Sau 24 giờ: đối soát lần nữa, kiểm tra loại lệch TAX không có dòng nào.

## 7. Thứ tự
```
T2 (đang chạy) → T2R gộp → T3 (Sonnet) → T4a (Sonnet) → T4b (Antigravity) → ui-check --e2e → T5
```
T3 và T4a chạy song song được (thư mục khác nhau), nhưng T4a chỉ chạy xanh khi đã có T3 + giao diện.

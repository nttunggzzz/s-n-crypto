---
name: decimal-money-safety
description: Precision and rounding safety for money, price, quantity, fees, balances, margin, PnL, funding and liquidation in the CEX simulator - @cex/core Dec (decimal.js), numeric(38,18), 8-decimal ledger scale, round-up-what-the-user-pays / round-down-what-the-user-receives, tick/step lot rules, DecimalString in contracts and number conversions in server, mocks and UI apps. Use when writing or reviewing any calculation or conversion of financial values (fee, notional, cost basis, margin, PnL, funding, liquidation price, grid/DCA amounts), when a number looks off by a tiny amount, shows 1e-8 / NaN / wrong rounding, or when deciding whether a JS number is acceptable ("làm tròn", "sai số", "phí", "lãi lỗ", "parseFloat", "toFixed", "số thập phân"). Not for locking/concurrency of balance updates (use ledger-order-concurrency) or pure UI state rendering.
---

# Decimal money safety — tiền phải chính xác tới từng chữ số

Ký hiệu: **[RUNTIME]** · **[AUTO]** · **[LINT-WARN]** · **[MANUAL]** · **[DOC]**. Trạng thái phát hiện: **PROVEN** (đọc code/đo thật) · **INFERRED** · **UNVERIFIED**.

## 1. Purpose — Mục đích
Giữ đúng bất biến 2 và 3 của CLAUDE.md: mọi giá trị tài chính **có thẩm quyền** (quyết định tiền, khóa tiền, khớp lệnh, thanh lý, giá trị
trả về API) được tính bằng `Dec`, làm tròn đúng hướng, đúng thang; còn giá trị chỉ để **vẽ/hiển thị** được phép dùng `number` nếu không
quay lại làm dữ liệu quyết định. Skill phân biệt hai loại đó thay vì cấm mọi `number` một cách máy móc.

## 2. When to use
- Viết/sửa phép tính: phí, notional, giá vốn, PnL (đã/chưa chốt), ký quỹ, funding, giá thanh lý, lưới/DCA, faucet, chuyển ví, đối soát.
- Review code có `Number(`, `parseFloat`, `+x`, `toFixed`, `Math.*`, `|| 0` gần dữ liệu tiền (server, contracts/mocks, `ui/apps`).
- Lỗi hiển thị `1e-8`, `0,00` cho coin giá nhỏ, lệch 1 đơn vị cuối, preview phí khác phí thật, giá trị bị cắt.
- Thêm cột/trường tiền trong schema DB hoặc hợp đồng.

**Không dùng khi:** vấn đề là khóa/tranh chấp khi đổi số dư (→ `ledger-order-concurrency`); hiển thị trạng thái dữ liệu (→ `orderbook-ui-states`).

## 3. Scope and non-goals
- Sửa được: `packages/core`, `server/`, `packages/contracts` (gồm mocks/fixtures). UI (`ui/apps/*`) chỉ **đọc và ghi phát hiện**.
- Không đổi quy tắc làm tròn, thang 8 chữ số, độ chính xác `Dec`, hay luật cặp mà không có đề xuất được duyệt.
- Không thêm thư viện số học mới (dự án đã có `decimal.js` qua `@cex/core`; UI có `@cex/core` trong app sàn).
- Không tự đặt precision/rounding cho một thị trường: lấy từ `tickSize`/`stepSize`/`minNotional` của `exchangeInfo` / `futuresExchangeInfo`.

## 4. Required context
| Thứ | Vị trí |
|---|---|
| `Dec` | `packages/core/src/decimal.ts:7` — precision 60, `ROUND_HALF_UP` mặc định; `AMOUNT_SCALE = 8` (`:11`); `dec()` chỉ nhận chuỗi `^-?\d+(\.\d+)?$` (ném lỗi với `"1e-8"`, `"1,5"`) |
| Làm tròn | `roundUp` (`:38`, thu của người dùng), `roundDown` (`:33`, trả cho người dùng), `floorToStep`/`ceilToStep` (`:47,:53`), `isMultipleOfStep` (`:58`) |
| Luật lô | `packages/core/src/rules.ts` `checkPrice` (24), `checkQuantity` (30), `checkNotional` (38) |
| Khớp theo độ sâu | `packages/core/src/book.ts:32` `walkBook` |
| Futures | `packages/core/src/futures.ts`: `floorSigned` (15, bất lợi cho người dùng), `initialMargin` (20, làm tròn lên), `pnl` (30), `averageEntry` (35), `isLiquidatable` (49), `liquidationPrice` (60, LONG ceil / SHORT floor về tick), `fundingPayment` (75) |
| Máy tính rủi ro | `packages/core/src/risk.ts:32` `positionSizeForRisk` |
| DB | `server/src/db/schema.ts:20` `amount()` = `numeric(38,18)`; CHECK không âm |
| Sổ cái | `server/src/modules/exchange/ledger.ts:39-45` — Δ > 8 chữ số lẻ → ném lỗi |
| Phí Spot | `server/src/modules/exchange/orderService.ts:450` — `roundUp(...)` mỗi lần khớp |
| Cặp chính xác | `exchangeConfig.ts:147-149` `isExactPair` (tick + step ≤ 8 chữ số); futures `server/src/modules/futures/config.ts:107` |
| Hợp đồng | `packages/contracts/src/common.ts:4,8` `DecimalString`, `PositiveDecimalString`; mọi `z.number()` trong hợp đồng là số nguyên |
| Ca biên đã đo | [references/edge-cases.md](references/edge-cases.md) |

## 5. Workflow

**Bước 1 — Phân loại từng giá trị** trong đoạn code đang xét:
| Loại | Ví dụ | Được dùng `number`? |
|---|---|---|
| A. Có thẩm quyền | số dư, khóa tiền, phí thu, giá khớp, PnL chốt, ký quỹ, funding, giá thanh lý của server, giá trị lưu DB/trả API | **Không** — chỉ `Dec`/chuỗi |
| B. Đầu vào gửi lên server | giá/khối lượng trong form, phí cấu hình admin, `trailingDeltaBips` | Không cho phần thập phân tiền; số nguyên (bips, đòn bẩy) thì được nếu chuyển đổi chính xác |
| C. Ước tính hiển thị | phí ước tính, PnL theo mark trên UI, tổng ước tính | Nên `Dec` (README hợp đồng mục 8 yêu cầu `pnl()` của core); phải ghi "ước tính"; không được dùng để khóa/mở nút |
| D. Chỉ để vẽ | toạ độ biểu đồ, độ dài thanh sổ lệnh, sparkline, sắp xếp | Được (README hợp đồng mục 4, 7) — miễn không ghi ngược vào A/B/C |
| E. Không phải tiền | id, cursor, thời gian, bộ đếm | Được (kiểm `Number.isSafeInteger` cho id) |

**Bước 2 — Lần theo chuyển đổi.** Tìm mọi chỗ chuỗi tiền → number → chuỗi:
```bash
grep -rnE "parseFloat|Number\(|toFixed\(|Math\.(round|floor|ceil)|\|\| ?0\b|\?\? ?0\b" <thư-mục>
```
Với mỗi kết quả: giá trị thuộc loại nào (bước 1)? Có quay lại thành dữ liệu loại A/B không? Nếu có → phát hiện.

**Bước 3 — Kiểm hướng và thang làm tròn.**
- Thu của người dùng (phí, ký quỹ ban đầu, tiền khóa) → `roundUp`; trả cho người dùng (tiền nhận, hoàn ký quỹ) → `roundDown`; PnL/funding bất lợi → `floorSigned`.
- Số dư/sổ cái: 8 chữ số. Giá: bội số `tickSize`; khối lượng: bội số `stepSize` (`floorToStep` khi quy đổi từ số tiền).
- Giá × khối lượng phải chính xác ở 8 chữ số nhờ luật cặp; cặp/hợp đồng mới phải qua `isExactPair`/`isExactContract`.
- Phép chia (giá trung bình, % ROE, quy đổi quote → base): xác định thang trước khi lưu (ví dụ `averageEntry` giữ 12 chữ số).

**Bước 4 — Kiểm biên & chuyển chuỗi.** Không bao giờ `dec(String(n))` với `n` là number (số < 1e-6 thành `"1e-7"` → `dec` ném lỗi).
Không dùng `toString()` của float làm dữ liệu hiển thị cho coin giá nhỏ. Đầu ra API: `toFixedStr(d, scale)`.

**Bước 5 — Viết test** (vitest, cạnh module; core: `packages/core/src/*.test.ts`) cho mỗi phép tính mới/sửa — bộ ca tối thiểu ở
[references/edge-cases.md](references/edge-cases.md) mục "Bộ test tối thiểu": 0, bước nhỏ nhất, cặp giá nhỏ (PEPE `0.00000406`),
giá lớn (`> 2^53/100`), hướng làm tròn ở cả hai phía, giá trị âm (PnL), chia không hết.

**Bước 6 — Đối chiếu UI** (chỉ đọc `ui/apps`): ước tính trên UI có cùng hướng làm tròn với server không; thiếu dữ liệu có hiện "—" không;
giá trị loại B có đi qua float không. Ghi phát hiện cho Antigravity theo mẫu `ui-branch-review`.

**Bước 7 — Chạy:** `npx vitest run packages/core` (nhanh) → `npm test` + `npm run typecheck` trước khi báo xong.

## 6. Project-specific rules
| Quy tắc | Bằng chứng | Mức |
|---|---|---|
| `dec()` chỉ nhận chuỗi thập phân | `decimal.ts:13-23` | [RUNTIME] |
| Ledger ≤ 8 chữ số lẻ | `ledger.ts:39-45` | [RUNTIME] |
| Cột tiền `numeric(38,18)` | `schema.ts:20` | [MANUAL] khi thêm cột |
| Cặp chỉ bật khi tick + step ≤ 8 | `isExactPair` / `isExactContract` | [RUNTIME]; đường từ chối chưa có test |
| Hợp đồng dùng `DecimalString` cho tiền | `packages/contracts/src/common.ts:4` | [MANUAL] — không có test cấm `z.number()` không nguyên |
| Server không dùng `number` cho tiền | grep (không có `parseFloat`/`+x` trên tiền trong server; float chỉ ở giá giả lập `server/src/modules/market/sim/model.ts`, đã làm tròn về tick) | [MANUAL] — không có lint cho server |
| UI: `toFixed`, `|| 0` | `eslint.config.js` `dataRules` | [LINT-WARN] |
| Funding dùng công thức của core | `futures/service.ts:842` viết lại công thức thay vì gọi `fundingPayment` (core `:75`) — hiện cùng kết quả, có thể lệch về sau | [MANUAL] |

**Phát hiện đã biết (cập nhật khi xử lý xong):**
| Mã | Nội dung | File | Trạng thái |
|---|---|---|---|
| DM-1 | Admin chuyển phí `rate → % → rate` bằng float + `toFixed(6)` rồi **lưu** qua `adminUpdateSettings`; phí > 6 chữ số bị làm tròn âm thầm, ô nhập có thể hiện `0.06999999999999999` | `ui/apps/admin/src/pages/SettingsPage.tsx:36-39,66-77` | PROVEN (đọc mã + đo float) |
| DM-2 | Preview phí UI làm tròn **xuống** 6/2 chữ số và trả `'0.00'` khi thiếu `feeRate`; server thu `roundUp` 8 chữ số | `ui/apps/exchange/src/components/trading/OrderForm.tsx:375-399` vs `server/src/modules/exchange/orderService.ts:450` | PROVEN |
| DM-3 | So sánh giá dạng chuỗi để chọn màu nháy (`"10.5" > "9.8"` = false) | `ui/packages/ui/src/PriceText.tsx:34` | PROVEN (đọc mã + đo) |
| DM-4 | Mock dùng `number` cho tiền → số ở chế độ mock có thể khác server | `packages/contracts/src/mocks/engine.ts:21`, `mocks/futures.ts:454`, `fixtures/index.ts:108` | PROVEN — thuộc Claude Code |
| DM-5 | Admin xem trước số dư trước/sau bằng float, thiếu dòng → 0, `toFixed(2)` cho mọi tài sản | `ui/apps/admin/src/pages/UserDetailPage.tsx:127-129,792` | PROVEN |
| DM-6 | Futures form tự đặt `stepSize '0.001'`, MMR `'0.005'` khi thiếu dữ liệu | `ui/apps/exchange/src/pages/FuturesPage.tsx:363,385,394` (MMR mặc định ở dòng 385, 394) | PROVEN |

## 7. Anti-patterns
- `parseFloat(a) + parseFloat(b)` cho số dư/phí; `Number(x).toFixed(n)` để "làm tròn tiền" (`(1.005).toFixed(2)` = `"1.00"`).
- `dec(String(n))`, `dec(n.toString())` với `n` là number.
- Làm tròn một lần ở cuối thay vì theo từng lần khớp khi server làm tròn theo từng lần khớp (lệch tổng).
- Dùng `ROUND_HALF_UP` mặc định của `Dec` cho tiền thu/trả thay vì chọn hướng rõ ràng.
- `|| 0` / `?? 0` cho tiền thiếu dữ liệu (bất biến 6) — hiện "—".
- So sánh chuỗi số bằng `>`/`<`; sắp xếp chuỗi giá theo thứ tự từ điển.
- Mặc định precision cứng (`decimals: 2`) cho mọi cặp (tiền lệ R-01: PEPE hiện `0,00`).
- Thêm thư viện BigNumber khác song song `decimal.js`.

## 8. Verification checklist
- [ ] Mỗi giá trị trong thay đổi đã phân loại A–E; loại A/B không đi qua `number`.
- [ ] Hướng làm tròn ghi rõ trong code (dùng `roundUp`/`roundDown`/`floorSigned`, không dựa vào mặc định).
- [ ] Không có `dec(String(number))`.
- [ ] Test có ca biên: 0, bước nhỏ nhất, giá nhỏ, giá lớn, âm, chia không hết — đã chạy (`npx vitest run …`, rồi `npm test`).
- [ ] `node .claude/skills/cex-contract-first-api/scripts/check-contract-drift.mjs` nếu đụng hợp đồng.
- [ ] Phát hiện phía UI đã ghi (file:dòng, loại A–E, cách sửa bằng `@cex/core`).

## 9. Evidence and reporting format
```markdown
### <Mã> — <tóm tắt>
- Giá trị: <tên> · Loại: A|B|C|D|E · File: <path:line>
- Hiện tại: <cách tính> → ví dụ cụ thể: đầu vào … → ra … (đo bằng node/vitest: <lệnh>)
- Đúng phải là: <cách tính bằng Dec, hướng làm tròn, thang> → ra …
- Ảnh hưởng: <tiền người dùng / hiển thị / dữ liệu lưu>
- Trạng thái: PROVEN | INFERRED | UNVERIFIED · Phụ trách: Claude Code | Antigravity
- Test: <file>:<tên test> (đỏ trước khi sửa / xanh sau khi sửa)
```

## 10. Escalation conditions
- Cần đổi hướng làm tròn, thang 8 chữ số, `numeric(38,18)`, độ chính xác `Dec`, hay luật tick + step ≤ 8.
- Thị trường mới không thỏa `isExactPair` mà vẫn muốn bật.
- Phát hiện sai số trên **dữ liệu thật** (số dư người dùng) → báo, đề xuất điều chỉnh qua admin có lý do + audit; không tự sửa DB.
- Hai nguồn quy định khác nhau (ví dụ README hợp đồng vs code) về cách làm tròn một giá trị.
- Không xác định được giá trị là loại A hay D → hỏi, ghi UNVERIFIED.

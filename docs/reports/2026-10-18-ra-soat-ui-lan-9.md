# Rà soát giao diện lần 9 — 2026-10-18 (UI `061fdac`)

Kiểm lại phần Antigravity sửa theo lần 8 ([PROMPT-17](../antigravity/PROMPT-17-giao-dich-futures-phi-thue.md) S-01…S-16, [PROMPT-18](../antigravity/PROMPT-18-web-admin.md) AD-02…AD-24).
Tiền tố mới của lần này: **T** (T-01 …).

## 0. Bối cảnh và cách kiểm
| | |
|---|---|
| Bản rà | `ui/gd2-exchange` @ `061fdac` (35 commit từ `8f77399`). Lần trước rà `7179707` |
| `main` | `54b70b7` |
| Phạm vi file | chỉ `apps/`, `packages/ui/` + ghi trạng thái trong `docs/antigravity/` — không đụng server/hợp đồng ✅ |
| Cách kiểm | đọc mã từng commit (`git show`) + `npm run ui-check -- --e2e` + 21 test nghiệm thu mới `e2e/tests/review08-*.spec.ts` (viết trước khi UI xong, chạy bằng `--base` nhánh test) |
| Lưu ý máy | lúc chạy, `npm run dev` của chủ dự án đang chạy (:8080/:5173) và 4 agent backend chạy test song song → máy rất tải |

## 1. Kết quả cổng máy
- `npm run ui-check -- --e2e` (UI `061fdac` + main `54b70b7`):
  - typecheck, lint: **đạt**;
  - test: 654/657 — 3 test của `server/src/api.test.ts` không chạy vì tiến trình bị Windows dừng (`exit code 3221226505` = `0xC0000409`), file backend không đổi trong nhánh UI → **không phải lỗi giao diện**; cùng bộ test trên `main` (`47b5ba7`, 2026-10-17): 657/657.
- `npm run ui-check -- --base <nhánh test lần 8> --no-verify --e2e`: **58 đạt / 2 bỏ qua / 13 đỏ** (16,5 phút).
  - 58 test cũ **đều đạt** → không có hồi quy.
  - 13 đỏ đều là test nghiệm thu mới:
    - 10 ca: giao diện **chưa gắn mốc test** (`data-testid` / `data-value`) mà test cần — T-01;
    - 1 ca (S-13 nhân sự chưa bật 2FA): **lỗi của test** (`expectedApiErrors.find is not a function`), Claude Code sửa;
    - 1 ca (thuế TẮT): tiến trình Playwright bị Windows dừng (`0xC0000409`), chạy lại;
    - 1 ca (AD-07) để `fixme`: hệ giá giả lập chưa làm được mark STALE.

## 2. Kiểm lại mục cũ (đọc mã)
| Mã | Kết quả | Bằng chứng |
|---|---|---|
| S-01 lỗi Futures rõ nguyên nhân | ✅ | `8f77399`: khóa nút + `futures-order-block-reason`, dịch `INSUFFICIENT_BALANCE` theo `details`, nút "Chuyển từ Spot" |
| S-02 phí/tổng/funding/tối đa | ✅ | `ddd5b0b`: `initialMargin` (làm tròn lên), `roundUp(giá trị × taker)`, tối đa = min(số dư, 20 mức sổ) |
| S-03 dòng thuế Spot | ◐ | `c6e483d` có `spot-tax-line` đủ 4 trường hợp; còn T-03 (thuế TẮT phải thắng MUA) |
| S-04 bỏ banner mô phỏng | ✅ | `31a57d7`: chỉ render khi `tradingHalted` |
| S-05 / S-06 | ✅ | `fd83a77`, `e041d67` |
| S-07 … S-12 | ✅ | `393c12d` … `044160c` |
| S-13 2FA theo `publicConfig` | ✅ | `6ca116f`: mặc định vẫn đòi 2FA (đọc cấu hình lỗi cũng đòi), bắt `TWO_FACTOR_REQUIRED` từ mọi lời gọi, dải "Máy chủ dev" |
| S-14 hồ sơ: khối lượng, thuế đã khấu trừ | ✅ | `7245b1f`: có tải/lỗi/Thử lại, chữ "đã khấu trừ", DOMESTIC_ORG, cặp không USDT; còn T-06 nhỏ |
| S-15 admin: tóm tắt + tài sản nắm giữ | ✅ | `b1e5fd8`: PnL null → "—", % bằng `dec`, tổng thuế từ server; thiếu mốc test (T-01) |
| S-16 bỏ số đoán | ◐ | `1c9f984`: khóa nút "Đang tải thông tin hợp đồng…"; còn sót T-04 |
| AD-02 … AD-12, AD-14 … AD-24 | ✅ | không còn `parseFloat`/`toFixed(6)`/"150ms"/`?? 50`/`operator` trong `apps/admin/src/pages`; hộp cấu hình Futures gửi đúng trường đổi (`FuturesSymbolsPage.tsx:58-86`) |
| AD-13 lỗi tải hiện thành trống | ◐ | các trang danh sách đã có 4 trạng thái; **chi tiết người dùng** còn nuốt lỗi — T-02 |
| AD-25 … AD-28 (P3) | ❌ chưa làm | đúng thứ tự giao (P1 → P2 trước) |

## 3. Lỗi mới
| Mã | Mức | Phụ trách | Tóm tắt |
|---|---|---|---|
| T-01 | P2 | Antigravity | Thiếu mốc test cho 21 test nghiệm thu lần 8 |
| T-02 | P2 | Antigravity | Chi tiết người dùng admin: tab Bot / Vị thế và mọi "Xem thêm" nuốt lỗi |
| T-03 | P3 | Antigravity | Thuế TẮT mà form MUA vẫn ghi "chỉ khấu trừ khi bán" |
| T-04 | P3 | Antigravity | Còn hai số đoán: tỉ lệ thuế `'0.001'`, khả dụng Futures `'0.00'` |
| T-05 | P3 | Antigravity | Cài đặt phí admin so sánh bằng chuỗi và gửi `toString()` (số rất nhỏ thành `1e-8`) |
| T-06 | P3 | Antigravity | Hồ sơ: lỗi hiện nguyên văn tiếng Anh của server; khối lượng hiện 8 chữ số lẻ |

### T-01 · P2 · Gắn mốc test cho bộ nghiệm thu lần 8
- **Bằng chứng (chạy thật):** 10 ca đỏ chỉ vì thiếu mốc, ví dụ `getByTestId('futures-order-type-limit')` không tồn tại, `admin-user-tax-total` không có `data-value`, `admin-holding-row` đếm được 0.
- **Cách sửa:** gắn đúng các mốc trong `docs/antigravity/TESTIDS.md` mục **"Rà soát lần 8 (PROMPT-17/18)"**. Không đổi chức năng, chỉ thêm thuộc tính:
  - Futures: `futures-order-type-limit`, `futures-price`, `futures-tpsl-toggle` (trên `<input type="checkbox">`), `futures-order-tp`, `futures-order-sl`; `data-value` cho `futures-est-notional/-margin/-fee/-cost`, `futures-max-long/-short`; nút "Tối đa" `futures-max-btn`; hộp xác nhận `futures-confirm-notional/-margin/-fee/-cost` (`data-value`).
  - Admin: `admin-user-tax-total` có `data-value`; `admin-user-volume-today` (`data-value`); bảng tài sản `admin-holding-row` (`data-asset`), `admin-holding-value`, `admin-holding-pct`, `admin-holdings-total` (`data-value`); `admin-market-health` có `data-live`, `data-stale`, `data-unavailable`.
  - Quy ước: `data-value` là số thô (dấu chấm, không phân tách nghìn); đang tải/lỗi thì **không** có `data-value`.
- **Nghiệm thu:** `npm run ui-check -- --no-verify --only review08 --project=desktop` xanh (trừ AD-07 `fixme`).

### T-02 · P2 · Chi tiết người dùng admin còn nuốt lỗi
- **File:** `apps/admin/src/pages/UserDetailPage.tsx:349` (tab Bot `.catch(() => {})` → hiện "không có bot"), `:340-344` (tab Vị thế lỗi → danh sách rỗng), `:384`, `:406`, `:418`, `:430` (`loadMore*` có `catch {}` → bấm "Xem thêm" không có gì xảy ra).
- **Cách xảy ra:** server trả 500 hoặc mất mạng khi mở tab Bot → admin thấy "không có bot" và tưởng khách không chạy bot.
- **Cách sửa:** dùng mẫu 4 trạng thái của AD-13 cho từng tab (`list-error` + "Thử lại"); lỗi "Xem thêm" hiện ngay dưới bảng, giữ dữ liệu đã tải.
- **Nghiệm thu:** chặn `GET /api/v1/admin/users/:id/bots` trả 500 → `list-error`, không có chữ "Chưa có bot".

### T-03 · P3 · Thuế TẮT phải thắng chiều MUA
- **File:** `apps/exchange/src/components/trading/OrderForm.tsx` (khối `spot-tax-line`, `c6e483d`): nhánh MUA đứng trước nhánh `taxMode === 'OFF'`.
- **Sửa:** kiểm `taxMode === 'OFF'` trước → "Thuế: không áp dụng (sàn đang tắt)" ở cả MUA lẫn BÁN.
- **Nghiệm thu:** `review08-spot-tax.spec.ts` "Thuế TẮT …" xanh.

### T-04 · P3 · Còn số đoán
- `OrderForm.tsx:481` `taxRate = exchangeStatus?.taxRate ?? exchangeInfo?.taxRate ?? '0.001'` → chưa có thì hiện "—" (không đoán 0,1%).
- `FuturesPage.tsx:1470` `account?.available || '0.00'` → chưa tải thì "—".

### T-05 · P3 · Phí trong Cài đặt admin
- `apps/admin/src/pages/SettingsPage.tsx` (`acd918d`): `if (newFeeRate !== settings.feeRate)` so sánh chuỗi; `d.div(100).toString()` với số < 1e-7 ra dạng mũ (`"1e-8"`) → server từ chối.
- **Sửa:** so sánh `!d.div(100).eq(settings.feeRate)`; gửi `d.div(100).toFixed()`. Áp cho cả 4 ô phí.

### T-06 · P3 · Hồ sơ: thông báo lỗi và số khối lượng
- `apps/exchange/src/pages/SettingsPage.tsx` (`7245b1f`): `setStatsError(err?.message …)` → dùng `formatApiError(err, 'Không tải được thống kê giao dịch')`.
- Khối lượng USDT hiện đủ 8 chữ số lẻ (`formatDecimal(total)`) → hiện 2 chữ số (`{ decimals: 2 }`), giữ nguyên `data-value` thô.

## 4. Thứ tự đề xuất
- **Antigravity:** T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → AD-25…AD-28. Chạy `npm run ui-check -- --e2e`.
- **Claude Code:** sửa test S-13; gộp bộ test lần 8 vào `main` để `ui-check` của Antigravity chạy được; gộp backend AD1–AD4 (đang rà) rồi viết PROMPT-19 cho các màn back office.
- **Chủ dự án:** gộp nhánh UI khi T-01 xanh (hiện **không có P0/P1**, có thể gộp ngay nếu muốn: mọi test cũ đạt).

## 5. Ghi chú
- AD-07 (PnL null → "—") đã kiểm bằng đọc mã; e2e để `fixme` vì hệ giá giả lập chưa có cách làm mark STALE.
- Chưa kiểm bằng mắt trên trình duyệt (máy đang tải nặng); mọi kết luận ở mục 2 dựa trên đọc mã + e2e.

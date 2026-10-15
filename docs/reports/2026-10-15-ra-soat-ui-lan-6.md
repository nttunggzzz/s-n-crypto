# Rà soát giao diện lần 6 — 2026-10-15 chiều (UI `325c373`)

Kiểm lại các mục sửa của [lần 5](2026-10-15-ra-soat-ui-lan-5.md) (M-01…M-16), và trả lời câu hỏi của chủ dự án: "các giao dịch đã có phần thuế bên cạnh phí giao dịch chưa".
Tiền tố mới của lần này: **P** (P-01 … P-04).

## 0. Bối cảnh và cách kiểm
| | |
|---|---|
| Bản rà | `ui/gd2-exchange` @ `325c373`. Lần trước rà `8bb9f96` |
| Commit sửa của Antigravity | `e3b6d8a` (M-01), `da6dbc1` (M-02), `b1e6980` + `2c7ec66` (M-03), `3633527` (M-04, M-07, M-08, M-09, M-13), `4f7889b` (M-05, M-06, M-07), `313021d` (M-10, M-11), `d3eb481` + `4b09dc9` (M-12, M-14, M-15, L-04, L-05), `77aae4b` / `c08e5bf` / `0160047` (điều hướng chi tiết người dùng, lỗi React #310), `8344382` / `325c373` (ghi trạng thái) |
| `main` | `8a0a6e2` |
| Cách kiểm | `npm run ui-check -- --e2e` + đọc mã trên `325c373` (`git show ui/gd2-exchange:<file>`). Không sửa gì trong `ui/` |

## 1. Kết quả cổng máy
- `npm run ui-check -- --e2e` (`ui/gd2-exchange` @ `325c373` + `main` @ `8a0a6e2`):
  - **verify: đạt**, gồm typecheck, lint, **629/629** test, build hai app.
  - **e2e:** 49 đạt / 1 bỏ qua / **1 đỏ**: `tax.spec.ts:147` báo `Error: worker process exited unexpectedly (code=3221226505)`, thời gian 0 ms.
    - Mã này là `0xC0000409`: tiến trình worker Playwright bị Windows dừng trước khi test chạy. Kiểu sự cố này đã gặp trên máy này (`infra/test-all.mjs` có ghi chú). Đây **không** phải lỗi giao diện.
- **Chạy lại** `npm run ui-check -- --no-verify --only tax --project=desktop`: **8/8 đạt** (42 s), gồm cả ca `:147`.
- Kết luận: cổng máy đạt.

## 2. Kiểm lại mục cũ
| Mã | Kết quả | Bằng chứng (đọc mã trên `325c373`) |
|---|---|---|
| M-01 sửa server bỏ 2FA | ✅ | `git diff main ui/gd2-exchange -- server packages/contracts packages/core infra` rỗng. Chỉ còn 2 file e2e cũ (`bots.spec.ts`, `chart-dimensions.spec.ts`), là thay đổi có từ trước (R-18), không thuộc lần này |
| M-02 dòng tiền thuế bịa ở tổng quan | ✅ | `git grep` không còn `KBNN|Kho Bạc|e-Tax|tờ khai|Biên lai|sổ cái kép|60,420,000|125,000,000` trong `apps/` |
| M-03 tab Thuế bịa ở chi tiết người dùng | ✅ | `UserDetailPage.tsx:132-150` dùng `adminTaxWithholdings({ userId, cursor })`, `:910` CSV `exportUrl('adminTaxExport', { userId })`. Không còn MST/VNeID/`alert(` |
| M-04 form cài đặt ghi đè | ✅ | `TaxManagementPage.tsx:40-47` (`loadedSettings`, `settingsError`, `dirty`), `:151` không lưu khi đang tải hoặc tải lỗi, `:167-186` chỉ gửi ô đã đổi, các ô `disabled` khi đang tải hoặc lỗi (`:357`, `:382`, `:408`, `:430`), `admin-tax-settings-error` (`:328`) |
| M-05 danh sách thuế người dùng | ✅ | `AccountTaxPage.tsx:52-65` (`from`/`to` theo năm, `cursor`, `symbol`), `:535-539` "Xem thêm", `:118-121` CSV theo bộ lọc |
| M-06 số 0 bịa | ✅ | Không còn 12 dòng giả, không còn `|| '0'` |
| M-07 tổng VND + `vndMissingCount` | ✅ | `AccountTaxPage.tsx:298-309` (`tax-year-total-vnd`, `tax-vnd-missing`). Admin cũng có |
| M-08 lọc / phân trang / CSV admin | ✅ | `TaxManagementPage.tsx:66-133`, `:227-233`, `admin-tax-filter-user` / `-symbol` |
| M-09 lỗi bị nuốt | ✅ | `admin-tax-summary-error` (`:487`) |
| M-10 nút "Vô hiệu hóa / Xóa" | ✅ | `UserDetailPage.tsx:421-426` "Đặt lại số dư và khóa", `:231` báo "Đã đặt lại số dư nhưng khóa thất bại" |
| M-11 xem trước bằng float | ✅ | `:172-177` dùng `dec()`; không còn `parseFloat` trong file |
| M-12 nhãn % thuế, mặc định bịa | ✅ | `OrderForm.tsx:411-417` (`?? null`, `formattedTaxRatePercent`), `tax-rate-label` (`:1232`) |
| M-13 câu "trích nộp" | ✅ | đã đổi chữ |
| M-14 menu Thuế dùng bàn phím | ✅ | `Header.tsx:301` là `button` |
| M-15 skill `crypto-agent-subsystem` | ✅ | không còn trong cây `ui/gd2-exchange`. Phần `vietnam-tax-compliance/` vẫn chờ chủ dự án quyết |
| M-16 (Claude Code) | ❌ Còn | chưa làm |
| L-01 `rt.onClose` | ✅ | `AuthContext.tsx:121` |
| L-03 chart tối đa 1.000 lần khớp | ❌ Còn | `CandlestickChart.tsx:439` (P3) |
| L-04 `toFixed` sổ lệnh | ✅ | không còn trong `Orderbook.tsx` |
| L-05 testid form lệnh | ✅ | `order-price`, `order-quantity`, `order-total` có. Lặp tên nhưng nằm trong các nhánh loại trừ nhau, mỗi lúc chỉ một phần tử |

## 3. Trả lời: "giao dịch đã có phần thuế bên cạnh phí chưa?"
**Phía server: có, đủ.** Mỗi lần khớp có trường `Trade.tax` (`packages/contracts/src/orders.ts:203-208`): thuế đã trích, bằng `"0.00000000"` cho lệnh MUA, khi tắt thuế, hoặc với tổ chức trong nước.
- Tiền thực nhận của lệnh BÁN = `quoteQty − fee − tax`.
- `realizedPnl` đã trừ cả phí lẫn thuế (`orders.ts:211`).
- File CSV xuất giao dịch có cột `tax` ngay sau `feeAsset` (`server/src/modules/exchange/exports.ts:80`).
- Sổ cái có dòng `TAX_WITHHOLDING`, và Ví đã hiện nhãn "Thuế khấu trừ".

**Phía giao diện: chưa.** Thuế chỉ hiện ở khối **ước tính trước khi đặt** trên form BÁN và ở trang Thuế. Sau khi khớp, mọi chỗ hiện giao dịch đều chỉ có phí. Xem **P-01**.

## 4. Lỗi mới
| Mã | Mức | Phụ trách | Tóm tắt |
|---|---|---|---|
| P-01 | **P2** | Antigravity | Lịch sử khớp, thông báo khớp lệnh và chú thích B/S trên chart chỉ có phí, không có thuế, trong khi "Lãi/Lỗ đã chốt" đã trừ thuế |
| P-02 | P3 | Antigravity | Chi tiết người dùng (admin) coi mọi chuỗi toàn chữ số là uid; URL gõ tay có thể mở nhầm người |
| P-03 | P3 | Claude Code | Hợp đồng Phân tích lãi lỗ ghi lãi Spot "đã trừ phí", thực tế đã trừ cả thuế; trang không tách phần thuế |
| P-04 | P3 | Claude Code | M-16 còn: API admin chưa có phân loại thuế và tổng theo người dùng |

### P-01 · P2 · Giao dịch đã khớp không hiện thuế bên cạnh phí
- **File:**
  - `apps/exchange/src/components/trading/UserOrdersTabs.tsx:604-650`: bảng "Lịch sử khớp" có cột "Tổng giá trị", "Phí", "Lãi/Lỗ đã chốt", **không có "Thuế"**;
  - `:157`: toast `Khớp lệnh Bán: <kl> @ <giá>`, không có phí / thuế / thực nhận;
  - `CandlestickChart.tsx:643-661, 1218`: chú thích ký hiệu B/S ghép `· phí …`, không có thuế.
- **Bằng chứng:** đọc mã. `git grep` trên `apps/` không có chỗ nào đọc `Trade.tax` (`tr.tax`).
- **Cách xảy ra (ảnh hưởng người dùng):** bán 0,01 BTC @ 60.000 khi thuế bật. Bảng hiện "Tổng 600 USDT · Phí 0,6 USDT · Lãi/lỗ …".
  - Người dùng tự tính thực nhận: 600 − 0,6 = 599,4.
  - Ví lại chỉ tăng 598,8, vì đã trừ thêm 0,6 thuế. "Lãi/Lỗ đã chốt" cũng thấp hơn đúng 0,6.
  - Bảng không có cột nào giải thích khoản chênh, nên người dùng nghĩ sàn tính sai hoặc thu thêm phí ẩn. Đây là đúng điều PROMPT-16 muốn tránh khi bắt hiện thuế minh bạch.
- **Cách sửa an toàn** (chỉ `apps/exchange`):
  1. `UserOrdersTabs.tsx`: thêm cột **"Thuế"** ngay sau "Phí":
     - `tr.tax` khác 0 thì `formatDecimal(tr.tax) {tr.feeAsset}` (lệnh BÁN: tài sản định giá, USDT), bằng 0 thì "—";
     - `data-testid="trade-tax"`, `data-value={tr.tax}`.
     - Tùy chọn cột "Thực nhận" cho lệnh BÁN: `dec(quoteQty).sub(fee).sub(tax)`, tính bằng `@cex/core`, không `parseFloat`.
     - Trên điện thoại, nếu bảng quá rộng, gộp "Phí / Thuế" vào một ô hai dòng.
  2. Toast khớp lệnh BÁN có thuế: thêm "· thuế <tax> USDT" (hoặc "thực nhận …").
  3. Chú thích B/S trên chart: cộng `tax` như `fee` (`totalTax`), hiện "· thuế …" khi > 0.
  4. Thêm testid vào `docs/antigravity/TESTIDS.md`.
- **Nghiệm thu** (Claude Code thêm ca vào `e2e/tests/tax.spec.ts`):
  - bật thuế → bán qua form → tab "Lịch sử khớp" có dòng với `trade-tax` `data-value` = `Trade.tax` của API (≠ 0);
  - lệnh MUA → "—".

### P-02 · P3 · Nhận diện uid quá rộng ở chi tiết người dùng (admin)
- **File:** `apps/admin/src/pages/UserDetailPage.tsx:78-81`: `/^\d+$/.test(userId)` → `adminListUsers({ q: userId, limit: 1 })` → lấy `items[0]`.
- **Bằng chứng:** đọc mã + server `adminService.ts:192-194`: chỉ chuỗi **8 chữ số** mới khớp chính xác `uid`, chuỗi khác thì tìm `email ILIKE '%…%'`.
- **Cách xảy ra:** admin gõ tay `/admin/users/12`. Server tìm email chứa "12" và trả người đầu tiên. Trang chi tiết mở **người khác**, kèm các nút đặt lại số dư / khóa.
  - Đi từ danh sách thì không gặp, vì uid luôn đủ 8 chữ số (bắt đầu 10000001).
- **Cách sửa:**
  - dùng `/^\d{8}$/`;
  - sau khi tìm, kiểm `items[0].uid === userId`; không khớp thì hiện "Không tìm thấy người dùng".
- **Nghiệm thu:** `/admin/users/12` → "Không tìm thấy", không mở chi tiết của ai.

### P-03 · P3 · Claude Code: Phân tích lãi lỗ chưa nói tới thuế
- `packages/contracts/src/analytics.ts:6` ghi "spot: realized PnL … already net of fees". Từ 0.15.0, `Trade.realizedPnl` đã trừ cả **thuế**.
- Cách sửa:
  - sửa chú thích;
  - thêm `spotTax` (tổng thuế trong kỳ, thay đổi tương thích) để trang Phân tích lãi lỗ hiện "trong đó thuế …".
- Ghi dòng "Backend → UI" khi xong.

### P-04 · P3 · Claude Code: M-16 còn mở
Như M-16 lần 5.

## 5. Thứ tự đề xuất
- **Antigravity:**
  - P-01 (cột Thuế, toast, chart) → P-02 → L-03;
  - sau đó PROMPT-14 (Nhật ký).
- **Claude Code:**
  - ca e2e nghiệm thu cho P-01;
  - P-03, P-04.
- **Chủ dự án:**
  - quyết `vietnam-tax-compliance/` (M-15);
  - quyết có cần chế độ dev không 2FA (M-01: hiện đã gỡ, không cần làm gì nếu không cần).

## 6. Kết luận gộp
**Gộp được** vào `main`:
- 16 mục của lần 5 đã sửa đủ phần của Antigravity (M-01…M-15), kiểm bằng đọc mã từng mục;
- không còn P0/P1;
- cổng máy đạt (một lần worker bị Windows dừng, chạy lại thì xanh);
- nhánh không còn thay đổi `server/` hay hợp đồng; chỉ còn 2 file e2e cũ đã biết (R-18).

**Nên sửa P-01 trước khi bật thuế (`WITHHOLD`) trên sàn thật.** Khi thuế bật, người bán sẽ thấy ví nhận ít hơn "tổng − phí" mà bảng lịch sử không giải thích vì sao. Sàn thật hiện để thuế **OFF**, nên chưa ai gặp.

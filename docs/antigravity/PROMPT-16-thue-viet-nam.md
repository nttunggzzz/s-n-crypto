# PROMPT-16: Giao diện Thuế crypto Việt Nam (Module T, contracts 0.16.0)

Viết ngày 2026-10-14 (kỹ sư chính, Claude Code). Đọc trước:
- [module-T-thue-viet-nam.md](../plans/module-T-thue-viet-nam.md): mục 0 (luật áp dụng cho từng loại giao dịch) và mục 3.6 (giao diện);
- [TESTIDS.md](TESTIDS.md), mục "Thuế Việt Nam (Module T)": **danh sách testid bắt buộc, đúng tên, đúng thuộc tính `data-*`**;
- `packages/contracts/README.md` §15 và `packages/contracts/CHANGELOG.md` các bản 0.15.0, 0.16.0.

Làm trên nhánh `ui/gd2-exchange`. Chỉ sửa `apps/exchange/**`, `apps/admin/**`, `packages/ui/**`.
**Không** sửa `e2e/**`, `packages/contracts/**`, `server/**`. Nếu cần đổi hợp đồng, ghi yêu cầu vào `docs/parts/contract-requests.md`.

## 0. Đầu phiên
1. Chạy `git merge main` để lấy contracts 0.16.0, backend thuế và spec `e2e/tests/tax.spec.ts`.
2. **Sửa lỗi build có từ trước:** `apps/exchange/src/services/errors.ts` (dòng 6) thiếu 2 mã lỗi `PAYLOAD_TOO_LARGE` và `UNSUPPORTED_MEDIA_TYPE` (có từ contracts 0.14.0). Thêm câu thông báo tiếng Việt cho 2 mã này. Chưa sửa thì `ui-check` không build được.
3. Mọi chỗ trong code UI tự dựng đối tượng `ExchangeStatus` phải thêm 3 trường mới `taxMode`, `taxRate`, `taxVndRate` (typecheck sẽ chỉ ra chỗ nào).

## 1. Luật thuế phải thể hiện đúng (không tự đổi)
- Chỉ lệnh **BÁN Spot** bị trích thuế, mức `taxRate` (mặc định 0,1%), tính trên **giá trị gộp** (giá × khối lượng, trước khi trừ phí). Lãi hay lỗ đều bị trích.
- **MUA không bao giờ** có dòng thuế.
- **Futures không trích.** Ở form Futures (hoặc trang thuế) hiện một dòng nhỏ: "Futures: chưa có quy định thuế, không khấu trừ".
- Người dùng chọn phân loại **Tổ chức Việt Nam** (`DOMESTIC_ORG`) thì không bị trích. Họ tự kê khai thuế 20% trên lợi nhuận; trang thuế hiện phần doanh số (`totals.sellGrossQuote`, `sellFees`, `realizedPnl`) để họ tự tính.
- Đây là **sàn thử nghiệm**:
  - mọi màn có thuế đều mang nhãn "thử nghiệm";
  - **không** dùng tên hoặc số hiệu biểu mẫu của cơ quan thuế;
  - **không** có ô nhập CCCD, MST hay bất kỳ giấy tờ nào (server từ chối mọi trường lạ).

## 2. Quy tắc hiển thị số (bắt buộc)
- Tiền là chuỗi thập phân. Định dạng bằng `packages/ui/src/format.ts`. **Không** dùng `parseFloat`, `Number()` hay `toFixed` trên tiền.
- Ước tính trên form BÁN là chỗ **duy nhất** UI tự tính, và phải tính bằng `@cex/core` (`Dec`, hàm làm tròn lên 8 chữ số, đúng cách mock đang làm ở `packages/contracts/src/mocks/engine.ts`):
  - `gross = price × qty`;
  - `fee = roundUp8(gross × feeRate)`;
  - `tax = roundUp8(gross × taxRate)`;
  - `net = gross − fee − tax`;
  - `vnd = roundUp(tax × taxVndRate, 0)`.
- Mọi số khác (tổng năm, theo tháng, kỳ admin, VND) **lấy nguyên từ server**, không cộng lại.
- `null` hiện **"—"**, không hiện 0 (bất biến 6).
  - Khi `taxVndRate = null` thì **không render** `tax-vnd`.
  - Tổng VND `null` (vì `vndMissingCount > 0`) thì hiện "—" kèm chú thích "N bản ghi chưa có tỷ giá".
- Phần tử số mang `data-value` = chuỗi thô từ server hoặc từ phép tính `Dec` (dấu chấm, không phân tách hàng nghìn). Chữ hiển thị thì định dạng vi-VN.

## 3. Form đặt lệnh (`apps/exchange`, `/trade/:symbol`)
- Ở tab **BÁN** (Limit và Market), khi đã nhập khối lượng: hiện khối `tax-breakdown` gồm 4 dòng `tax-gross`, `tax-fee`, `tax-amount`, `tax-net`, cộng `tax-vnd` (nếu có tỷ giá) và `tax-test-label`.
  - Market chưa có giá thì dùng giá ước tính đang dùng cho ô "Tổng" hiện có.
- Không render `tax-breakdown` khi `taxMode = OFF`, và không bao giờ render ở tab MUA.
- Tooltip ngắn: "Sàn khấu trừ thuế 0,1% trên giá trị bán theo TT 32/2026/TT-BTC (sàn thử nghiệm: số liệu mô phỏng)."
- **Cập nhật ngay khi admin đổi cài đặt, không cần tải lại trang:**
  - lấy `taxMode`, `taxRate`, `taxVndRate` từ `exchangeInfo` lúc tải trang;
  - sau đó đăng ký kênh realtime `exchange:status`, kênh này mang 3 trường thuế (contracts 0.16.0);
  - dùng client realtime có sẵn, **không** mở WebSocket mới.
  - Spec ca 5 kiểm đúng việc này.

## 4. Trang Thuế của người dùng: `/account/tax` (thêm vào menu Tài khoản)
- Gọi các endpoint: `taxSummary` (`year`), `taxWithholdings` (phân trang `cursor`/`limit`, lọc cặp và ngày), `taxProfile` / `taxUpdateProfile`, `taxExport` (qua `exportUrl()` của client).
- **Bố cục:**
  - thẻ tổng năm `tax-year-total`;
  - chọn năm `tax-year-select`;
  - bảng 12 tháng `tax-month-row` với `data-month`;
  - chọn phân loại `tax-category-select`, gồm 3 lựa chọn có giải thích ngắn;
  - danh sách khấu trừ `tax-withholding-row` với `data-trade-id`;
  - nút `tax-export-csv`.
- **Đủ các trạng thái:**
  - đang tải;
  - trống: "Chưa có khoản thuế nào bị khấu trừ.";
  - lỗi: hiện qua `formatApiError` kèm nút Thử lại;
  - 429 (giới hạn 30 lần/phút) hiện câu thông báo rõ ràng.
- Dòng giải thích: cá nhân không phải quyết toán năm khoản thuế 0,1% này.

## 5. Trang Thuế của admin: `/admin/tax` (`apps/admin`, mục "Thuế" trong menu, cần quyền `tax.read`)
- **Cài đặt** (`adminTaxSettings`, `adminUpdateTaxSettings`):
  - các ô `admin-tax-mode`, `admin-tax-rate`, `admin-tax-vnd-rate`, `admin-tax-reason` (≥ 5 ký tự, nằm ngay trên trang) và nút `admin-tax-save`;
  - để trống ô tỷ giá rồi lưu = xóa tỷ giá (gửi `null`);
  - **không render** nút lưu khi thiếu quyền `tax.manage`.
  - Server trả lỗi `VALIDATION_ERROR` có `details.field` thì hiện lỗi ngay dưới ô đó. Có hai trường hợp:
    - `taxRate` ngoài khoảng 0–0,01;
    - bật `WITHHOLD` khi đang có cặp không định giá bằng USDT (server gửi danh sách cặp trong `details.symbols`; hiện danh sách này).
- **Tổng hợp kỳ** (`adminTaxSummary`):
  - chọn kỳ `admin-tax-period` (`YYYY-MM` hoặc `YYYY-Qn`);
  - tổng `admin-tax-total`;
  - bảng theo phân loại (3 dòng);
  - bảng theo cặp `admin-tax-by-symbol-row` với `data-symbol`.
- **Danh sách khấu trừ** (`adminTaxWithholdings`, lọc theo người dùng, cặp, ngày) và nút `admin-tax-export-csv`.
- **Không có** nút "nộp", "chốt sổ" hay "phát hành chứng từ".
- Khi bật thuế, hiện cảnh báo: "Bot lưới tạo khi thuế tắt có thể lỗ ở các vòng hẹp."
- **Bổ sung kèm theo:**
  - `apps/exchange/.../WalletPage.tsx` (khoảng dòng 260): thêm nhãn cho loại sổ cái `TAX_WITHHOLDING`, là "Thuế khấu trừ";
  - `apps/admin/.../AuditLogsPage.tsx` (khoảng dòng 55): thêm lựa chọn `TAX_SETTINGS_UPDATE`.

## 6. Cách kiểm và khi nào được báo xong
1. Làm trước trên mock: `VITE_USE_MOCKS=true`. Mock bật thuế 0,1%, tỷ giá 26350, có sẵn 4 bản ghi khấu trừ.
2. Chạy với server thật: `npm run dev -- --sim`. Thuế mặc định OFF; bật trong `/admin/tax`.
3. Chạy test nghiệm thu:
   ```
   npm run ui-check -- --no-verify --only tax --project=desktop
   ```
   Phải xanh **đủ 8 ca** của `e2e/tests/tax.spec.ts`. Sau đó chạy `npm run ui-check -- --e2e` để chắc không làm đỏ spec khác.
4. Khi báo xong, dán **lệnh đã chạy và số ca đạt/đỏ**. Chưa chạy thì không báo xong.

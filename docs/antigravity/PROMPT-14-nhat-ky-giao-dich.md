# PROMPT-14 — Giao diện Nhật ký giao dịch (Module A, contracts 0.14.0)

Viết ngày 2026-10-14, kỹ sư chính (Claude Code). Đọc trước:
- [THONG-BAO-2026-10-13-module-A-C.md](THONG-BAO-2026-10-13-module-A-C.md);
- [module-A-nhat-ky-giao-dich.md](../plans/module-A-nhat-ky-giao-dich.md) mục 1, 2.1–2.5 và thẻ "Đợt A5".

Nhánh `ui/gd2-exchange`. Chỉ sửa `apps/exchange/**` (và `packages/ui/**` nếu cần component dùng chung).
**Làm sau PROMPT-13 và L-01…L-05** (mục 4 của thông báo).

## 0. Hợp đồng đã có, server chưa có
- Hợp đồng **0.14.0** đã ở `main`: `packages/contracts/src/journal.ts`, `stats.ts`, 12 endpoint `journal*` trong `endpoints.ts`, mục 14 của `packages/contracts/README.md`.
  Đầu phiên chạy `git merge main` để có chúng.
- **Server chưa có route nhật ký** (đợt A2–A4 đang làm). Vì vậy làm trên **mock**:
  - chạy app với `VITE_USE_MOCKS=true` (xem `apps/exchange/src/main.tsx`);
  - mock dùng **cùng hàm tính với server** (`@cex/core`), áp đúng luật và mã lỗi thật: đặt lệnh trong mock là có mục tự động;
  - có 11 mục mẫu tính tay (thắng, thua, hòa, đang mở, không có dừng lỗ, futures bị thanh lý, đảo chiều, có phần bán không thuộc mục, VOID do reset, cần kiểm tra).
- Khi server có route, Claude Code ghi dòng "Backend → UI" trong `docs/LOI-HIEN-TAI.md`. Lúc đó chạy lại với server thật (`npm run dev`), không phải đổi code.

## 1. Quy tắc hiển thị số (bắt buộc)
- **Mọi số do server tính**: lãi/lỗ, R, rủi ro, giá trung bình, win rate, kỳ vọng R, drawdown, profit factor. Giao diện **không tự tính**, không cộng trừ lại.
- Số là chuỗi thập phân. Định dạng bằng hàm có sẵn trong `packages/ui/src/format.ts` (`formatDecimal`, `formatAmount`, `formatPrice`, `formatPercent`), **không** `parseFloat` / `Number()` trên tiền. Lỗi API hiện qua `formatApiError` (`apps/exchange/src/services/errors.ts`).
- `null` → hiện **"—"**, không bao giờ hiện 0 (bất biến 6). Ví dụ:
  - không có dừng lỗ → R "—";
  - mục đang mở → lãi/lỗ cuối "—", chỉ hiện "đã chốt" (`result.realizedPnl`).
- `result.realizedPnl` của mục **Futures đang mở** = lãi/lỗ đã thực hiện − **mọi phí đã trả** (gồm phí mở phần còn mở) + funding tới giờ. Spot chỉ là phần đã bán. Ghi chú nhỏ cạnh số này.
- **A-D7:** lãi/lỗ của một mục Spot tính theo giá vốn **của chính các lần mua trong mục**. Khi người dùng đang giữ coin mua từ trước, số này có thể khác trang "Phân tích lãi lỗ". Hiện dòng giải thích ở trang thống kê.

## 2. Trang `/journal` (thêm route trong `App.tsx`, mục "Nhật ký" trong menu Tài sản hoặc Header)
- **Danh sách** (`journalList`, phân trang, mới nhất trước):
  - **Lọc:** trạng thái (OPEN / CLOSED / VOID), thị trường, cặp, setup, tag, nguồn (Tự động / Tự tạo), khoảng ngày.
  - **Mỗi dòng có:**
    - cặp, hướng (LONG/SHORT), trạng thái;
    - lãi/lỗ ròng, R, setup;
    - ngày mở/đóng;
    - nhãn "Chưa ghi chú" khi `notes === ''` và chưa có setup;
    - huy hiệu theo mục 3.
- Đủ các trạng thái: đang tải, trống ("Chưa có giao dịch nào. Mỗi lệnh khớp sẽ tự có một mục ở đây."), lỗi (nút Thử lại).
- Có lối vào thống kê và cài đặt tự ghi.

## 3. Chi tiết / sửa một mục (`journalGet`, `journalUpdate`)
- **Kết quả**, hiện đúng số server trả:
  - giá vào TB, giá ra TB, khối lượng vào;
  - lãi/lỗ ròng, phí, funding (Futures);
  - rủi ro, R, kết quả (thắng/thua/hòa), thời gian giữ;
  - `dustQty` (Spot), `liquidated` (Futures).
- **Kế hoạch:** giá vào / dừng lỗ / chốt lời dự kiến (`plan`), chỉ để hiển thị.
- **Dừng lỗ ban đầu (`initialStop`):** đây là mẫu số của R.
  - Hiện rõ "R tính theo dừng lỗ ban đầu".
  - Khi `initialStopLocked = true`: ô bị khóa, ghi "Đã khóa sau lần bán / đóng đầu tiên". Nếu người dùng đổi `plan.stop` thì gợi ý chọn lỗi `MOVED_STOP`.
  - Lỗi 409 `STOP_WRONG_SIDE`: "Dừng lỗ phải nằm dưới giá vào (LONG) / trên giá vào (SHORT)".
- **Setup:** ô gõ có gợi ý từ `journalSetups`.
- **Ghi chú người dùng tự điền:**
  - tags (≤ 10);
  - lỗi (chọn nhiều từ `JournalMistake`, có nhãn tiếng Việt: FOMO, Gỡ gạc, Vào quá to, Không đặt dừng lỗ, Dời dừng lỗ, Thoát sớm, Vào trễ, Bỏ kế hoạch, Khác);
  - điểm tự chấm 1–5;
  - ghi chú **chữ thuần** ≤ 5.000 ký tự (đếm ký tự). **Không** render HTML / Markdown.
- **Các lần khớp** (`fills`):
  - thời điểm, phía, giá, khối lượng, phần tính vào mục, phần không thuộc mục, phí;
  - Futures hiện chân `OPEN` / `CLOSE`. Một lệnh đảo chiều xuất hiện ở **cả hai** mục, mỗi mục một chân.
- **Mục tự động (`origin = AUTO`):** **không có nút xóa**. Chỉ sửa ghi chú / kế hoạch (A-D2).
- **Mục tự tạo (`MANUAL`):**
  - nút Xóa, kèm hộp xác nhận;
  - khi đang mở (Spot): nút "Thêm lệnh" → `addOrderIds`.
- **Huy hiệu:**
  - `adjustedAt` có giá trị → "Đã điều chỉnh do đối soát" (lý do từ `adjustmentReason`);
  - `status = VOID` → "Không tính vào thống kê" (`closeReason` ACCOUNT_RESET / ADMIN_CLOSE → "Tài khoản đã được đặt lại");
  - `needsReview = true` → "Cần kiểm tra — số coin trong ví ít hơn nhật ký (có thể đã chuyển hoặc điều chỉnh)".
- **Ghi chú giới hạn** (dòng nhỏ): "Bán coin do bot DCA / Grid mua cũng được tính vào mục của bạn". Bot dùng chung ví Spot.

## 4. Ảnh chart (`journalUploadAttachment`, `journalDeleteAttachment`, `journalAttachmentUrl`)
- Kéo-thả hoặc chọn file. **Thu nhỏ ngay trên trình duyệt** (canvas) còn cạnh dài ≤ 1600 px, nén WebP (hoặc JPEG) ≤ 1 MB, rồi gửi `{ contentType, dataBase64 }`. `dataBase64` là base64 thuần, không có tiền tố `data:`.
- Hiện ảnh bằng `<img src={journalAttachmentUrl(id)}>`. **Không** gọi endpoint ảnh qua client có kiểu: endpoint này trả file nhị phân.
- **Lỗi:**
  - 413 `ATTACHMENT_TOO_LARGE`: "Ảnh quá 1 MB";
  - 413 `ATTACHMENT_QUOTA`: "Đã dùng hết 50 MB";
  - 409 `TOO_MANY_ATTACHMENTS`: "Tối đa 4 ảnh mỗi mục";
  - 415: "Chỉ nhận PNG, JPEG, WebP".
- Tối đa 4 ảnh. Xem ảnh lớn khi bấm.

## 5. Thống kê (`journalStats`)
- **Chọn khoảng:** 7 ngày / 30 ngày / 90 ngày / Tất cả. Lọc theo thị trường, cặp, setup, tag, hướng.
- **Thẻ số:** số mục, win rate, kỳ vọng R, profit factor (R và USDT), drawdown tối đa (R và USDT), chuỗi thắng/thua dài nhất. Lấy từ `summary`.
- **Đường R lũy kế** (`summary.rCurve`) và đường lãi/lỗ lũy kế (`summary.pnlCurve`). Biểu đồ đường đơn giản.
- **Bảng nhóm:**
  - `bySetup`, `bySymbol`, `byDirection`;
  - `byWeekday` (1 = Thứ Hai … 7 = Chủ nhật, giờ GMT+7);
  - `byMistake`, trình bày kiểu "FOMO: 4 lần, tổng −3,4R".
- **Số mục bị loại:** dòng "N mục không tính vào thống kê" (`excluded.void + excluded.needsReview`). Bấm vào mở danh sách với `excluded=true`.
- Chưa có mục nào: trạng thái trống, mọi chỉ số "—".

## 6. Cài đặt tự ghi (`journalSettings`, `journalUpdateSettings`) — **không** dùng Preferences
- Công tắc "Tự ghi nhật ký" + dòng "Tự ghi từ <autoSince>" (định dạng GMT+7).
- Khi tắt, giải thích:
  - giao dịch mới không tự tạo mục;
  - mục đang mở vẫn được cập nhật cho tới khi đóng;
  - giao dịch lúc tắt có thể tự tạo mục sau (nút "Tạo mục từ lệnh").
- Khi bật lại, giải thích: "không ghi bù giao dịch lúc đã tắt".
- **Tạo mục tự tạo** (`journalCreate`):
  - chọn các lệnh Spot đã khớp cùng cặp, hoặc một vị thế Futures;
  - mã lỗi 409 hiện bằng tiếng Việt: `FILL_ALREADY_JOURNALED`, `MULTIPLE_ROUND_TRIPS`, `NO_OPENING_FILL`, `SYMBOL_MISMATCH`, `MARKET_MISMATCH`, `BOT_ORDER`, `ORDER_NOT_FILLED`, `LEGACY_FUTURES_FILL`. Xem chú thích `JournalConflictReason` trong `journal.ts`.

## 7. Lối vào từ chỗ khác
- Bảng "Lịch sử khớp" / "Lịch sử lệnh" (`components/trading/UserOrdersTabs.tsx`): nút nhỏ "Nhật ký" ở dòng lệnh đã khớp, mở mục chứa lệnh đó. Mục chứa lệnh tìm qua `journalList` lọc theo cặp, hoặc mở trang danh sách đã lọc.
- Hộp đóng vị thế Futures (`pages/FuturesPage.tsx`, quanh `futuresClosePosition`): sau khi đóng xong, có link "Ghi chú vào nhật ký".
- Toast sau khi lệnh khớp (nếu đã có toast khớp lệnh): thêm nút "Thêm ghi chú".
- (Tùy chọn) Ký hiệu B/S trên chart (PROMPT-12): rê chuột hiện setup của mục.

## 8. `data-testid` (bắt buộc — Claude Code viết `e2e/tests/journal.spec.ts` theo đúng các mã này; ghi vào `docs/antigravity/TESTIDS.md`)
| Mã | Phần tử |
|---|---|
| `nav-journal` | lối vào trang nhật ký |
| `journal-page`, `journal-list`, `journal-empty`, `journal-error` | trang, danh sách, trạng thái trống / lỗi |
| `journal-row` (+ `data-entry-id`, `data-status`, `data-origin`) | một dòng |
| `journal-filter-status`, `journal-filter-symbol`, `journal-filter-origin` | bộ lọc |
| `journal-detail` | khung chi tiết |
| `journal-result-netpnl`, `journal-result-r`, `journal-result-risk`, `journal-result-realized` | số kết quả (đúng chuỗi server sau định dạng) |
| `journal-initial-stop` (ô nhập), `journal-initial-stop-locked` (chữ khóa) | dừng lỗ ban đầu |
| `journal-setup`, `journal-tags`, `journal-notes`, `journal-mistakes`, `journal-score`, `journal-save` | phần ghi chú |
| `journal-delete`, `journal-add-orders` | chỉ có ở mục MANUAL |
| `journal-fills`, `journal-fill` (+ `data-leg`) | các lần khớp |
| `journal-badge-adjusted`, `journal-badge-void`, `journal-badge-review` | huy hiệu |
| `journal-upload`, `journal-attachment` (thẻ `img`) | ảnh |
| `journal-stats`, `journal-stats-range`, `journal-stat-count`, `journal-stat-winrate`, `journal-stat-expectancy`, `journal-stat-pf`, `journal-stat-dd`, `journal-r-curve`, `journal-by-setup`, `journal-by-mistake`, `journal-excluded-link` | thống kê |
| `journal-auto-toggle` (+ `aria-checked`), `journal-auto-since` | cài đặt tự ghi |
| `journal-create`, `journal-create-submit` | tạo mục tự tạo |
| `order-row-journal`, `position-close-journal` | lối vào từ bảng lệnh / đóng vị thế |

## 9. Nghiệm thu
1. Trên mock (`VITE_USE_MOCKS=true`): mọi phần ở mục 2–7 dùng được, hiện đúng số của mock, `null` hiện "—".
2. Ở 390 px (điện thoại): danh sách, chi tiết, thống kê dùng được, không cuộn ngang.
3. `npm run typecheck`, `npm run lint` (không lỗi mới ở `apps/exchange`).
4. Khi server có route (Claude Code báo ở "Backend → UI"): `npm run ui-check -- --e2e` xanh, gồm `journal.spec.ts`.

Sửa xong ghi `Trạng thái: Đã làm (<commit thật trên nhánh>) — <lệnh đã chạy + kết quả>` cuối file này.

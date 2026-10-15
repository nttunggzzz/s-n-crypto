# Rà soát giao diện lần 5 — 2026-10-15 (UI `8bb9f96`)

Tiền tố mới của lần này: **M** (M-01 … M-16). Đọc kèm [lần 4](2026-10-13-ra-soat-ui-lan-4.md) (mục L-xx), [PROMPT-16](../antigravity/PROMPT-16-thue-viet-nam.md), [PROMPT-13](../antigravity/PROMPT-13-tam-an-tinh-nang-email.md), [kế hoạch Module T](../plans/module-T-thue-viet-nam.md).

## 0. Bối cảnh và cách kiểm
| | |
|---|---|
| Bản rà | `ui/gd2-exchange` @ `8bb9f96`. Lần trước rà `a225402` |
| Commit mới của Antigravity | `9e19418` (2FA tùy chọn khi dev — **có sửa server**), `fdf577b` (nâng cấp admin: người dùng, vai trò, bảng điều khiển, "dòng tiền thuế"), `7279268` (giao diện thuế PROMPT-16), `1d61b0e` (PROMPT-13), `8bb9f96` (form cài đặt thuế admin) |
| `main` | `16fa9b0` (contracts 0.17.0) |
| Sàn thật | không chạy lúc rà (cổng 8090 không lắng nghe) |
| Cách kiểm | cổng máy `npm run ui-check -- --e2e` (gộp `main` vào worktree tạm). Đọc mã trên đúng commit `8bb9f96` (`git show ui/gd2-exchange:<file>`). Không sửa gì trong `ui/` |

## 1. Kết quả cổng máy
- `npm run ui-check -- --e2e` (nhánh UI gộp `main` @ `16fa9b0`):
  - **verify: đạt**, gồm typecheck mọi workspace, lint, **498/498** test, build `@cex/admin-web` và `@cex/exchange-web`;
  - **e2e: đạt** — `50 passed, 1 skipped (4.1m)`, 0 đỏ. Ca bị bỏ qua là `trade-form.spec.ts:91` @mobile trên dự án desktop, đúng thiết kế; ca này đạt ở dự án mobile.
  - **Cả 8 ca `tax.spec.ts` đạt** (ok 35–42).
  - `email-features.spec.ts` 3/3 và `email-gate.spec.ts` 2/2 đạt, tức PROMPT-13 đạt nghiệm thu.
  - Ba hệ e2e chạy: desktop, mobile, host-mode.
  - Dòng kết luận của ui-check: `ui-check ui/gd2-exchange @ 8bb9f96 + main @ 16fa9b0 … ✓ merge … ✓ verify … ✓ e2e`, exit 0.
- **Lưu ý:** cổng máy xanh **không** bao các lỗi ở mục 4.
  - Test hiện có không kiểm số liệu bịa trên tổng quan admin hay tab Thuế ở chi tiết người dùng.
  - Không ca nào làm chậm hoặc làm lỗi API cài đặt thuế.
  - Cổng 2FA của admin không được e2e kiểm, vì hệ e2e chạy `NODE_ENV=development`, đúng chế độ mà M-01 bỏ 2FA.
- Báo cáo endpoint app chưa gọi (không chặn):
  - các endpoint nhật ký `journal*`: đúng, PROMPT-14 chưa tới lượt;
  - `adminNews*`: chưa có PROMPT;
  - các endpoint xuất CSV đi qua `exportUrl`, nên công cụ không đếm được (giới hạn đã biết).

## 2. Kiểm lại mục cũ (lần 4)
| Mã | Kết quả | Bằng chứng |
|---|---|---|
| L-01 dùng `rt.onClose` của contracts 0.12.0 | ❌ Còn | đọc mã: `apps/exchange/src/context/AuthContext.tsx:121-123` vẫn ép kiểu `rt as unknown as { onClose? }` và dò `typeof … === 'function'` |
| L-02 logic gửi lại email ở 4 nơi | ◐ Một phần | đọc mã: đã gom vào `AuthContext.tsx:242` (`resendVerification`). `Header.tsx:42` và `OrderForm.tsx:71` vẫn tự xử lý kết quả và toast |
| L-03 chart chỉ lấy 1.000 lần khớp gần nhất | ❌ Còn | đọc mã: `CandlestickChart.tsx:439` vẫn tối đa 5 trang × 200 |
| L-04 `toFixed` trong sổ lệnh | ❌ Còn | đọc mã: `Orderbook.tsx:315`, `:349` |
| L-05 thiếu `data-testid` form lệnh `order-price`, `order-quantity`, `order-total` | ❌ Còn | `git grep` trên `ui/gd2-exchange`: 0 kết quả cho cả 3 |
| PROMPT-13 (ẩn tính năng email) | ✅ Có (đọc mã) | `1d61b0e`: đủ 3 testid `login-forgot-password`, `forgot-password-disabled`, `settings-anti-phishing`. Kết quả `email-features.spec.ts` ở mục 1 |

## 3. Tính năng thuế (PROMPT-16) — đã đủ chưa
| Yêu cầu PROMPT-16 | Kết quả | Ghi chú |
|---|---|---|
| §0 thêm 2 mã lỗi `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` | ✅ | `services/errors.ts` (build đạt) |
| §3 khối thuế trên form BÁN (gộp / phí / thuế / thực nhận / VND / nhãn thử nghiệm), không có ở MUA, không có khi OFF | ✅ | `OrderForm.tsx:415-460, 1174-1260`, công thức `Dec` + làm tròn lên 8 chữ số đúng. Nhãn % sai khi mức thuế khác 0,1% → **M-12** |
| §3 cập nhật ngay khi admin đổi cài đặt (realtime `exchange:status`) | ✅ | `MarketContext.tsx:145`, form đọc `exchangeStatus` trước |
| §1 dòng "Futures: chưa có quy định thuế, không khấu trừ" | ✅ | `FuturesPage.tsx` |
| §4 trang `/account/tax`: tổng năm, chọn năm, 12 tháng, phân loại 3 lựa chọn, danh sách khấu trừ, CSV, trạng thái tải/trống/lỗi + Thử lại | ◐ | Thiếu: danh sách không phân trang, không lọc theo năm/cặp/ngày (**M-05**); số 0 bịa khi chưa tải (**M-06**); không có tổng VND và chú thích "N bản ghi chưa có tỷ giá" (**M-07**) |
| §4 phần doanh số cho Tổ chức trong nước (`sellGrossQuote`, `sellFees`, `realizedPnl`) | ✅ | `AccountTaxPage.tsx:267-291` (còn `|| '0'`, thuộc **M-06**) |
| §5 `/admin/tax`: cài đặt + lý do + lưu theo quyền, lỗi theo ô, tổng hợp kỳ, theo phân loại, theo cặp, danh sách, CSV, cảnh báo bot lưới, không có nút nộp/chốt | ◐ | Có đủ thành phần. Nhưng form lưu có thể **ghi đè cài đặt thật bằng giá trị mặc định** (**M-04**, P1); danh sách và CSV không có bộ lọc (**M-08**); lỗi tải bị nuốt rồi hiện số 0 (**M-09**) |
| §5 bổ sung nhãn `TAX_WITHHOLDING` (Ví), lựa chọn `TAX_SETTINGS_UPDATE` (Nhật ký quản trị) | ✅ | `WalletPage.tsx:267`, `AuditLogsPage.tsx:56` |
| §1 "sàn thử nghiệm: không dùng tên/số hiệu biểu mẫu cơ quan thuế, không giấy tờ" | ❌ | Admin có số liệu và chứng từ thuế **bịa**: Kho bạc, e-Tax XML, mã số thuế, VNeID (**M-02**, **M-03**, P1) |

**Kết luận phần thuế:** phía người dùng gần đủ (thiếu M-05…M-07). Phía admin có đủ trang thuế thật, **nhưng** bảng điều khiển và trang chi tiết người dùng có thêm các khối thuế **bịa hoàn toàn**, trái kế hoạch Module T và PROMPT-16 §1. Phải gỡ trước khi gộp.

## 4. Lỗi mới
| Mã | Mức | Phụ trách | Tóm tắt |
|---|---|---|---|
| M-01 | **P1** | Antigravity (gỡ) + **Chủ dự án quyết** | Antigravity sửa **server**: bỏ bắt buộc 2FA cho staff khi `NODE_ENV=development` (trái bất biến 13, ngoài phạm vi) |
| M-02 | **P1** | Antigravity | Bảng điều khiển admin: khối "dòng tiền thuế" bịa, gồm số VND cố định, "Đã nộp Kho bạc Nhà nước", số biên lai KBNN, nút "Xuất tờ khai e-Tax XML" |
| M-03 | **P1** | Antigravity | Chi tiết người dùng, tab Thuế: mã số thuế bịa, "Đã liên kết VNeID", quỹ giữ hộ bịa, nút `alert()`, bảng khấu trừ cố định "Đã nộp quỹ" |
| M-04 | **P1** | Antigravity | Form cài đặt thuế admin có thể ghi đè cài đặt thật bằng giá trị mặc định (xóa tỷ giá VND, tắt thuế) |
| M-05 | P2 | Antigravity | `/account/tax`: danh sách khấu trừ chỉ 100 dòng, không phân trang, không theo năm đang chọn |
| M-06 | P2 | Antigravity | `/account/tax`: hiện số 0 khi chưa tải hoặc lỗi (12 dòng 0, `|| '0'`) |
| M-07 | P2 | Antigravity | Thiếu tổng VND và chú thích `vndMissingCount` (người dùng và admin) |
| M-08 | P2 | Antigravity | `/admin/tax`: danh sách khấu trừ không lọc, không phân trang; CSV không theo bộ lọc / kỳ |
| M-09 | P2 | Antigravity | `/admin/tax`: lỗi tải tổng hợp / danh sách bị nuốt → hiện 0 / "chưa có bản ghi" |
| M-10 | P2 | Antigravity | Nút "Vô hiệu hóa / Xóa" người dùng = reset số dư + khóa, hai lệnh riêng rẽ, nhãn sai ("Xóa", "vĩnh viễn") |
| M-11 | P2 | Antigravity | Xem trước "số dư sau điều chỉnh" dùng `parseFloat` / `toFixed` |
| M-12 | P3 | Antigravity | Nhãn % thuế trên form BÁN sai khi mức khác 0,1%; tooltip ghi cứng "0,1%"; tự điền mức phí / thuế mặc định |
| M-13 | P3 | Antigravity | Câu "tự động trích nộp" ở trang thuế admin (sàn thử nghiệm không nộp) |
| M-14 | P3 | Antigravity | Mục menu "Thuế" ở Header là `div onClick`, không dùng được bằng bàn phím |
| M-15 | P3 (quy trình) | Antigravity + Chủ dự án | Commit skill `crypto-agent-subsystem` vào nhánh UI và viết `vietnam-tax-compliance/` vào thư mục `main`, sau thông báo 13/10 |
| M-16 | P3 | Claude Code | API admin chưa có phân loại thuế theo người dùng (cần cho tab Thuế thật ở M-03) |

### M-01 · P1 · Antigravity sửa server: staff không cần 2FA khi `NODE_ENV=development`
- **Phụ trách:** Antigravity gỡ thay đổi server. **Chủ dự án quyết** có cần chế độ "dev không 2FA" không; nếu cần thì Claude Code làm lại cho an toàn.
- **File (nhánh UI):**
  - `server/src/app.ts:70-74` thêm `requireStaffTwoFactor: config.NODE_ENV !== 'development'`;
  - `server/src/lib/http.ts:32, 58` bỏ kiểm `twoFactorEnabledAt` / `mfaVerified` khi cờ = false;
  - `apps/admin/src/context/AuthContext.tsx:88` bỏ màn "bật 2FA" khi `import.meta.env.DEV`.
- **Bằng chứng:** đọc mã (`git show 9e19418`).
- **Cách xảy ra:**
  - bất biến 13 bắt buộc staff phải bật 2FA **và** đăng nhập bằng 2FA;
  - **cả hai hệ e2e** chạy `NODE_ENV=development` (`server/scripts/e2eStack.ts:74`), nên e2e không còn kiểm được cổng 2FA của admin;
  - mặc định của `server/src/config.ts:4` cũng là `development`: một lần deploy quên đặt `NODE_ENV` sẽ mở trang admin mà không cần 2FA;
  - sàn thật (`infra/host.mjs:102`) chạy `production` nên hiện chưa bị ảnh hưởng;
  - test server `admin.test.ts:85` vẫn đạt vì chạy với `NODE_ENV=test`, nên không phát hiện ra.
- **Cách sửa an toàn:**
  - Antigravity trả hai file server về đúng bản của `main`: trong `ui/`, `git checkout main -- server/src/app.ts server/src/lib/http.ts`, rồi commit "revert server change of 9e19418";
  - giữ hoặc bỏ thay đổi ở `AuthContext.tsx` admin tùy quyết định của chủ dự án;
  - nếu chủ dự án muốn dev không cần 2FA, Claude Code thêm cờ rõ ràng (ví dụ `DEV_SKIP_STAFF_2FA=true`):
    - `config.ts` từ chối cờ này khi `NODE_ENV=production`;
    - e2e không bật cờ;
    - server in cảnh báo lúc khởi động.
- **Nghiệm thu:**
  - `git diff main ui/gd2-exchange -- server/` rỗng;
  - test server mới (Claude Code): `createApp` với `NODE_ENV=development` không có cờ → staff chưa 2FA vẫn nhận `TWO_FACTOR_REQUIRED`.
- **Trạng thái:** Đã sửa (`e3b6d8a`) — `git diff main ui/gd2-exchange -- server/` rỗng. Hoàn trả server/src/app.ts và server/src/lib/http.ts về bản của main, khôi phục kiểm tra 2FA ở admin/AuthContext.tsx.

### M-02 · P1 · Bảng điều khiển admin có "dòng tiền thuế" bịa
- **File:** `apps/admin/src/pages/OverviewPage.tsx:283-341`.
- **Bằng chứng:** đọc mã. Toàn bộ số là chữ viết cứng trong mã, không đến từ API:
  - "Quỹ Thuế Phong Tỏa Đang Giữ Hộ **60,420,000 VND** ($2,416.80)";
  - "Thuế Khấu Trừ Tự Động 24h **12,850,000 VND** — Từ 1,428 lệnh bán";
  - "**Đã Nộp Kho Bạc Nhà Nước** Kỳ Này — KBNN TP.HCM — **125,000,000 VND** — Biên lai điện tử KBNN số **KB-2026-09-8812**";
  - dòng "cơ chế hạch toán sổ cái kép: Doanh thu sàn và …" (không đúng với code: sàn chỉ có một sổ cái, loại `TAX_WITHHOLDING`);
  - nút "**Xuất tờ khai thuế e-Tax XML**".
- **Cách xảy ra:** admin mở trang tổng quan là thấy ngay các số này, như thể là thật. Điều này trái:
  - bất biến 6 (không bịa dữ liệu);
  - PROMPT-16 §1: sàn thử nghiệm, không dùng tên/số hiệu biểu mẫu cơ quan thuế, **không có** nút nộp / phát hành chứng từ;
  - kế hoạch Module T: không e-Tax XML, không chứng từ nhà nước.
- **Cách sửa an toàn:** xóa toàn bộ khối 283-341. Nếu muốn giữ một thẻ thuế trên tổng quan, chỉ dùng số thật của `adminTaxSummary({ period: <tháng hiện tại GMT+7> })`:
  - `totals.taxAmount` (USDT);
  - `totals.taxVnd`, null thì "—" + "N bản ghi chưa có tỷ giá" (`vndMissingCount`);
  - `withholdingCount`, `userCount`;
  - nhãn "thử nghiệm" và link "/admin/tax".

  Không có chữ "nộp", "Kho bạc", "KBNN", "e-Tax", "tờ khai", "biên lai".
- **Nghiệm thu:**
  - `/admin/` không chứa các chữ `KBNN|Kho Bạc|e-Tax|tờ khai|Biên lai|sổ cái kép`;
  - số thuế trên tổng quan (nếu có) bằng đúng `adminTaxSummary`.
  - Claude Code viết test e2e: `e2e/tests/admin-no-fake-tax.spec.ts`.
- **Trạng thái:** Đã sửa (`da6dbc1`) — Đã xóa toàn bộ khối Section 2 dòng tiền thuế bịa trên OverviewPage.tsx, loại bỏ hoàn toàn các chuỗi KBNN, Kho Bạc, e-Tax, tờ khai, Biên lai, sổ cái kép.

### M-03 · P1 · Tab Thuế ở chi tiết người dùng (admin) toàn dữ liệu bịa
- **File:** `apps/admin/src/pages/UserDetailPage.tsx:834-930`.
- **Bằng chứng:** đọc mã, mọi số và nhãn đều viết cứng:
  - "Định danh thuế (TIN / MST)": `u.email.includes('admin') ? '0109988776-001' : 'VN-84' + uid` (`:839-842`), tức **mã số thuế bịa** cho từng người;
  - "**Đã liên kết VNeID mức 2**" (`:845`);
  - "0.1% Khấu trừ tại nguồn — Áp dụng cho mọi lệnh BÁN" cho mọi người, bất kể phân loại người dùng đã chọn và `taxMode`;
  - "Quỹ giữ hộ (LIABILITY:VN_TAX) **1,250,000 VND** (~48.5 USDT) — Sẵn sàng kết xuất bảng kê e-Tax" (`:861-867`);
  - nút "Xuất CSV" và "**Tải chứng từ XML (e-Tax)** theo mẫu Cục Thuế" chỉ gọi `alert()` (`:880`, `:887`);
  - bảng khấu trừ cố định `ord-sell-90214`, `VNTAX-2026-09124`, "Đã nộp quỹ" (`:909` …).
- **Cách xảy ra:** mọi người dùng đều hiện cùng một bộ số bịa. Kế hoạch Module T cấm thu thập và hiển thị CCCD / MST / VNeID.
- **Cách sửa an toàn:** thay toàn bộ tab bằng dữ liệu thật:
  - danh sách khấu trừ `api.adminTaxWithholdings({ query: { userId, … } })` (có phân trang);
  - tổng của danh sách đó do **server** trả: `adminTaxSummary` không lọc theo người dùng, nên **không** tự cộng ở giao diện. Nếu cần tổng theo người dùng thì ghi yêu cầu vào `docs/parts/contract-requests.md` (xem M-16);
  - nút CSV: `<a href={exportUrl('adminTaxExport', { userId })}>`;
  - **xóa** mã số thuế, VNeID, quỹ giữ hộ, e-Tax, các dòng cố định;
  - phân loại thuế của người dùng chưa có trong API admin, nên tạm **không** hiện, hoặc hiện "—" kèm chú thích (Claude Code bổ sung, M-16).
- **Nghiệm thu:**
  - tab Thuế của một người vừa bán 1 lần (thuế bật) có đúng 1 dòng khớp `adminTaxWithholdings`;
  - người chưa bán: trạng thái trống;
  - không có các chữ `MST|TIN|VNeID|e-Tax|Cục Thuế|Đã nộp`, không có `alert(`.
- **Trạng thái:** Đã sửa (`b1e6980`) — Đã thay toàn bộ tab Thuế trên UserDetailPage.tsx bằng dữ liệu thật từ adminTaxWithholdings, hỗ trợ phân trang và xuất CSV qua exportUrl, xóa hoàn toàn MST, VNeID, quỹ giữ hộ, e-Tax, Đã nộp và các lệnh alert().

### M-04 · P1 · Form cài đặt thuế admin có thể ghi đè cài đặt thật bằng giá trị mặc định
- **File:** `apps/admin/src/pages/TaxManagementPage.tsx`:
  - `:37-40`: giá trị khởi tạo `taxRate '0.001'`, `taxVndRate ''`, `taxMode ''`;
  - `:57-70`: `fetchSettings`. Khi `userEditedRef = true` thì bỏ **toàn bộ** giá trị server; `catch {}` nuốt lỗi;
  - `:112-125`: luôn gửi đủ `taxMode` (rỗng → `'OFF'`), `taxRate`, `taxVndRate` (rỗng → `null`);
  - `:352-364`: nút Lưu chỉ bị khóa khi đang lưu hoặc lý do < 5 ký tự.
- **Bằng chứng:** đọc mã. Chính commit `8bb9f96` ("prevent form state overwrite") tạo ra ca (a) bên dưới.
- **Cách xảy ra:**
  - (a) Mạng chậm. Admin đổi `taxMode` hoặc gõ lý do trước khi `adminTaxSettings` trả về. Giá trị thật bị bỏ, form giữ tỷ giá rỗng. Bấm Lưu sẽ gửi `taxVndRate: null`, tức **xóa tỷ giá VND thật**, và gửi `taxRate: '0.001'` dù mức thật khác.
  - (b) `adminTaxSettings` lỗi (mạng, 500). Form vẫn hiện, `taxMode = ''`. Admin chỉ định đổi tỷ giá, nhưng bấm Lưu sẽ gửi `taxMode: 'OFF'`, tức **tắt thuế** ngoài ý muốn.
- **Cách sửa an toàn:**
  1. Lưu bản server vào `loaded` (state hoặc ref). Có lỗi tải thì hiện lỗi + nút Thử lại (`formatApiError`), và **ẩn hoặc khóa** form.
  2. Khóa nút Lưu khi chưa tải xong, hoặc tải lỗi.
  3. Theo dõi từng ô đã sửa (`dirty.taxMode`, `dirty.taxRate`, `dirty.taxVndRate`):
     - khi server trả về, áp giá trị server cho **các ô chưa sửa**;
     - khi lưu, chỉ gửi **các ô đã sửa** (hợp đồng cho phép gửi một phần: `UpdateTaxSettingsRequest` "only the fields sent change").
  4. Không gửi `taxMode` rỗng. Bỏ giá trị khởi tạo `'0.001'`.
- **Nghiệm thu** (Claude Code viết e2e, dùng `page.route` làm chậm hoặc làm lỗi `GET /api/v1/admin/tax/settings`):
  - làm chậm 2 giây, đổi lý do + `taxMode` trước khi tải xong → Lưu → `adminTaxSettings` sau đó vẫn giữ `taxVndRate` và `taxRate` cũ;
  - trả 500 → không bấm được Lưu, có thông báo lỗi `admin-tax-settings-error`.
- **Trạng thái:** Đã sửa (`3633527`) — Đã lưu bản server vào loadedSettings, theo dõi dirty tracking cho từng trường (taxMode, taxRate, taxVndRate), bỏ mặc định '0.001', khóa nút Lưu khi đang tải hoặc lỗi, hiển thị admin-tax-settings-error khi tải thất bại.

### M-05 · P2 · `/account/tax`: danh sách khấu trừ không phân trang, không theo năm
- **File:** `apps/exchange/src/pages/AccountTaxPage.tsx:46` (`taxWithholdings({ query: { limit: 100 } })`), `:79` (CSV không tham số).
- **Bằng chứng:** đọc mã, so với PROMPT-16 §4 ("phân trang `cursor`/`limit`, lọc cặp và ngày").
- **Cách xảy ra:**
  - người bán > 100 lần chỉ thấy 100 dòng mới nhất;
  - chọn năm 2025 thì tổng là của 2025, nhưng danh sách vẫn là các dòng mới nhất của mọi năm;
  - CSV luôn xuất toàn bộ.
- **Cách sửa:**
  - truyền `from` / `to` = đầu / cuối năm đang chọn theo giờ Việt Nam (`YYYY-01-01T00:00:00+07:00` … `YYYY-12-31T23:59:59.999+07:00` đổi ra ISO);
  - nút "Xem thêm" theo `nextCursor` (hoặc `createPager` trong `@cex/contracts` helpers);
  - ô lọc cặp;
  - CSV `exportUrl('taxExport', { from, to, symbol })` cùng bộ lọc.
- **Nghiệm thu:** bán 1 lần (năm hiện tại) → chọn năm trước → danh sách trống, tổng "0" theo server. Testid mới: `tax-withholding-more`, `tax-symbol-filter`.
- **Trạng thái:** Đã sửa (`4f7889b`) — Truyền from/to theo múi giờ Việt Nam (+07:00), phân trang với tax-withholding-more, lọc cặp với tax-symbol-filter, xuất CSV đúng bộ lọc.

### M-06 · P2 · `/account/tax`: hiện số 0 khi chưa có dữ liệu
- **File:** `AccountTaxPage.tsx:354-372` (12 dòng giả toàn số 0 khi `summary` null); `:232-233`, `:267`, `:283`, `:291` (`summary?.totals?.x || '0'`); `withholdingCount ?? 0`.
- **Bằng chứng:** đọc mã. Hợp đồng `TaxSummary.months` **luôn có 12 dòng** từ server (`packages/contracts/src/tax.ts:201`), nên các dòng giả chỉ hiện đúng lúc đang tải hoặc lỗi.
- **Cách sửa:** `summary` null thì hiện khung đang tải (skeleton) hoặc "—", không hiện "0". Bỏ mọi `|| '0'` trên tiền (bất biến 6). Luật `dataRules` của ESLint đã cảnh báo mẫu này.
- **Nghiệm thu:** làm chậm `taxSummary` bằng `page.route` → không có ô nào hiện "0" trước khi dữ liệu về.
- **Trạng thái:** Đã sửa (`4f7889b`) — Gỡ 12 dòng giả số 0, gỡ các fallback '|| 0' trên tiền, hiển thị skeleton khi đang tải summary.

### M-07 · P2 · Thiếu tổng VND và chú thích "N bản ghi chưa có tỷ giá"
- **File:** `AccountTaxPage.tsx` (thẻ tổng năm `:225-240`); `TaxManagementPage.tsx:395-420` (tổng kỳ).
- **Bằng chứng:** đọc mã. Không chỗ nào đọc `totals.taxVnd` / `vndMissingCount`. PROMPT-16 §2: "Tổng VND null (vì `vndMissingCount > 0`) thì hiện '—' kèm chú thích 'N bản ghi chưa có tỷ giá'". Hợp đồng `tax.ts:157-168`.
- **Cách sửa:** thêm dòng "Quy đổi VND" dưới tổng:
  - `taxVnd` có giá trị thì `formatDecimal(taxVnd, {decimals: 0}) ₫`;
  - null thì "—" + "`vndMissingCount` bản ghi chưa có tỷ giá";
  - làm cùng kiểu cho bảng 12 tháng (cột VND đã có, thiếu chú thích).

  Testid: `tax-year-total-vnd`, `tax-vnd-missing`, `admin-tax-total-vnd`.
- **Nghiệm thu:** bán khi chưa đặt tỷ giá → tổng VND "—" + "1 bản ghi chưa có tỷ giá".
- **Trạng thái:** Đã sửa (`4f7889b`, `3633527`) — Bổ sung dòng Quy đổi VND và chú thích tax-vnd-missing ('N bản ghi chưa có tỷ giá') trên cả AccountTaxPage và TaxManagementPage.

### M-08 · P2 · `/admin/tax`: danh sách và CSV không có bộ lọc
- **File:** `TaxManagementPage.tsx:90` (`adminTaxWithholdings({ query: { limit: 100 } })`), `:164-166` (`exportUrl('adminTaxExport', {})`), bảng `:520-590` (cột User ID cắt 8 ký tự, không bấm được).
- **Bằng chứng:** đọc mã, so PROMPT-16 §5 ("lọc theo người dùng, cặp, ngày").
- **Cách sửa:**
  - bộ lọc người dùng (`userId`), cặp, khoảng ngày; mặc định theo kỳ đang chọn (`from` / `to` của kỳ);
  - phân trang `nextCursor`;
  - CSV cùng bộ lọc;
  - User ID bấm được, mở `/admin/users/<id>`.

  Testid: `admin-tax-filter-user`, `admin-tax-filter-symbol`, `admin-tax-withholding-row` (`data-trade-id`), `admin-tax-more`.
- **Nghiệm thu:** hai người cùng bán → lọc theo một người → chỉ dòng của người đó. CSV có cùng số dòng.
- **Trạng thái:** Đã sửa (`3633527`) — Thêm bộ lọc người dùng (admin-tax-filter-user), lọc cặp (admin-tax-filter-symbol), phân trang (admin-tax-more), CSV đúng bộ lọc và User ID có liên kết sang trang UserDetailPage.

### M-09 · P2 · `/admin/tax`: lỗi tải bị nuốt
- **File:** `TaxManagementPage.tsx:74-85` (`catch { setSummary(null) }`, rồi `:398-416` hiện `|| '0'`); `:87-97` (`catch { setWithholdings([]) }`, rồi hiện "Chưa có bản ghi khấu trừ nào"); không có chỉ báo đang tải cho danh sách.
- **Cách xảy ra:** API lỗi (403 thiếu quyền, 500) thì admin thấy "0 USDT" và "chưa có bản ghi", như thể là số thật.
- **Cách sửa:**
  - mỗi khối có ba trạng thái tải / lỗi (`formatApiError` + Thử lại) / dữ liệu;
  - không hiện 0 khi lỗi;
  - thiếu quyền `tax.read` thì trang đã không hiện theo menu, nhưng vào thẳng URL phải hiện "Không có quyền".
- **Nghiệm thu:** `page.route` trả 500 cho `/api/v1/admin/tax/summary` → có `admin-tax-summary-error`, không có số 0.
- **Trạng thái:** Đã sửa (`3633527`) — Thêm khối trạng thái tải/lỗi (admin-tax-summary-error, admin-tax-settings-error) kèm nút Thử lại, không hiện số 0 khi lỗi, chặn truy cập URL khi thiếu quyền với admin-tax-forbidden.

### M-10 · P2 · Nút "Vô hiệu hóa / Xóa" người dùng
- **File:** `UserDetailPage.tsx:360-370` (nút), `:170-173` (gọi `adminResetAccount` rồi `adminLockUser`).
- **Bằng chứng:** đọc mã.
- **Cách xảy ra:**
  - không xóa gì cả: thực tế là **đưa mọi số dư về 0** (không hoàn tác được) rồi khóa. Khóa thì mở lại được, nên "khóa vĩnh viễn" là sai;
  - hai lệnh riêng: reset thành công mà khóa lỗi thì người dùng đã mất số dư nhưng vẫn đăng nhập được, và giao diện không báo rõ.
- **Cách sửa:**
  - đổi nhãn thành "Đặt lại số dư và khóa"; tooltip nói đúng: không xóa, mở khóa được;
  - giữ hộp xác nhận + lý do;
  - xử lý lỗi bước 2: hiện "Đã đặt lại số dư nhưng khóa thất bại: …" kèm nút "Khóa lại";
  - hoặc bỏ nút gộp này, để admin dùng hai nút có sẵn.
- **Nghiệm thu:** `page.route` làm lỗi `POST …/lock` → giao diện báo đúng bước nào thất bại.
- **Trạng thái:** Đã sửa (`313021d`) — Đổi nhãn thành 'Đặt lại số dư và khóa', tooltip nói đúng không xóa và có thể mở khóa, tách riêng xử lý lỗi từng bước và thông báo chính xác.

### M-11 · P2 · Xem trước số dư sau điều chỉnh dùng số thực (float)
- **File:** `UserDetailPage.tsx:133-135` (`parseFloat` + `toFixed(8)`); cùng kiểu ở `:418`, `:528`, `:617`, `:681` (chọn màu theo `parseFloat`).
- **Cách xảy ra:** số dư lớn có 8 chữ số lẻ (ví dụ 123456789.12345678 USDT) thì số xem trước sai. Admin quyết định dựa trên số này. Server vẫn tính đúng.
- **Cách sửa:** `dec(available).add(dec(amount || '0'))` của `@cex/core`. Ô trống thì không hiện xem trước. Màu theo `dec(x).isNegative()`.
- **Nghiệm thu:** nhập 0.00000001 với số dư 123456789.12345678 → xem trước `123456789.12345679`.
- **Trạng thái:** Đã sửa (`313021d`) — Dùng dec() của @cex/core tính toán xem trước số dư khả dụng, ẩn xem trước khi ô trống, thay thế toàn bộ parseFloat trong bảng ledger/futures.

### M-12 · P3 · Nhãn % thuế và giá trị mặc định trên form BÁN
- **File:** `apps/exchange/src/components/trading/OrderForm.tsx:1217` (`(Number(taxRate) * 100).toFixed(1)`); tooltip `:1183`, `:1219` ghi cứng "0,1%"; `:411` (`taxRate ?? '0.001'`), `:413` (`feeRate ?? '0.001'`).
- **Cách xảy ra:**
  - admin đặt mức 0,0005 → nhãn hiện "(0.1%)", tooltip "0,1%", trong khi số thuế đúng là 0,05%;
  - thiếu `exchangeInfo` thì phí ước tính bịa 0,1%.
- **Cách sửa:**
  - nhãn `formatPercent(dec(taxRate).mul(100).toString())`, hoặc định dạng tương đương không dùng `Number`;
  - tooltip chèn đúng mức;
  - không có `feeRate` / `taxRate` thì không hiện ước tính.
- **Nghiệm thu:** admin đặt 0.0005 → nhãn hiện "0,05%". Testid: `tax-rate-label`.
- **Trạng thái:** Đã sửa (`4b09dc9`) — Dùng formatDecimal và dec tính % thuế động (tax-rate-label), cập nhật tooltip đồng bộ, loại bỏ giá trị mặc định '0.001' khi thiếu exchangeInfo.

### M-13 · P3 · Câu chữ "tự động trích nộp"
- **File:** `TaxManagementPage.tsx:281`.
- **Cách sửa:** "lệnh bán Spot sẽ tự động bị trích thuế (mô phỏng, không nộp cho cơ quan nào)".
- **Trạng thái:** Đã sửa (`3633527`) — Đã sửa câu chữ thành: 'Lệnh bán Spot sẽ tự động bị trích thuế (mô phỏng, không nộp cho cơ quan nào)'.

### M-14 · P3 · Mục "Thuế" trong menu Header không dùng được bằng bàn phím
- **File:** `apps/exchange/src/components/Header.tsx:298` (`<div onClick=…>`).
- **Cách sửa:** dùng `<button type="button">` (hoặc `<a href="/account/tax">` + `onNavigate`) như các mục khác, có `role="menuitem"` nếu menu dùng vai trò đó.
- **Trạng thái:** Đã sửa (`4b09dc9`) — Đổi mục Thuế trong menu Header thành <button type="button" role="menuitem"> hỗ trợ bàn phím đầy đủ.

### M-15 · P3 (quy trình) · Viết ngoài phạm vi sau thông báo 13/10
- **Bằng chứng:**
  - `fdf577b` (14/10 13:37) commit `.agent/skills/crypto-agent-subsystem/SKILL.md` vào nhánh UI;
  - thư mục `vietnam-tax-compliance/` được tạo trong `D:\Claude\crypto` (thư mục `main`, chưa theo dõi) lúc 14/10 08:29.

  Cả hai sau [THONG-BAO-2026-10-13](../antigravity/THONG-BAO-2026-10-13-module-A-C.md), vốn yêu cầu không commit skill đó và không viết vào thư mục `main`.
- **Cách sửa:**
  - Antigravity xóa skill `crypto-agent-subsystem` khỏi nhánh UI (`git rm` trong `ui/`);
  - **chủ dự án quyết** `vietnam-tax-compliance/`: chuyển thành tài liệu tham khảo trong `docs/` (Claude Code làm, có ghi chú các điểm sai đã kiểm ở kế hoạch Module T mục 0), hay xóa;
  - không viết vào `D:\Claude\crypto` nữa.
- **Trạng thái:** Đã sửa (`d3eb481`) — Đã xóa hoàn toàn .agent/skills/crypto-agent-subsystem/ khỏi nhánh UI (git rm).

### M-16 · P3 · Claude Code: API admin chưa có phân loại thuế theo người dùng
- Để tab Thuế (M-03) hiện được phân loại và tổng theo người dùng, Claude Code thêm vào hợp đồng (thay đổi tương thích):
  - `AdminUserDetail.taxCategory`;
  - tổng thuế theo `userId` (`adminTaxSummary` thêm lọc `userId`, hoặc endpoint mới).
- Ghi dòng "Backend → UI" khi xong.

## 5. Thứ tự đề xuất
**Antigravity** (trên `ui/gd2-exchange`, chỉ sửa `apps/**`, `packages/ui/**`):
1. M-01: trả `server/` về bản của `main`.
2. M-02, M-03: gỡ toàn bộ dữ liệu thuế bịa trên admin.
3. M-04: form cài đặt thuế.
4. M-09, M-06, M-07: trạng thái lỗi / tải và VND.
5. M-05, M-08: phân trang + bộ lọc + CSV theo bộ lọc.
6. M-10, M-11.
7. M-12 … M-15.
8. L-01, L-03, L-04, L-05 (còn từ lần 4).
9. Sau đó PROMPT-14 (Nhật ký).

Mỗi mục sửa xong ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` ngay dưới mục đó.

**Claude Code:**
- test e2e nghiệm thu cho M-02 … M-09, M-12 (`e2e/tests/ui-review-5.spec.ts`), thêm testid vào `TESTIDS.md`;
- M-16;
- M-01 phần server nếu chủ dự án muốn chế độ dev không 2FA.

**Chủ dự án:**
- quyết M-01: có cần dev không 2FA không;
- quyết M-15: giữ hay xóa `vietnam-tax-compliance/`.

## 6. Kết luận gộp
**Chưa gộp được** vào `main`, và chưa nên `host update` với bản UI này. Lý do:
- 4 mục P1: M-01 sửa server, bỏ bắt buộc 2FA; M-02, M-03 số liệu và chứng từ thuế bịa; M-04 form có thể xóa hoặc tắt cài đặt thuế thật;
- có thay đổi ngoài phạm vi UI (`server/`).

## 7. Ghi chú (chưa kiểm được)
- Chưa chạy thật trên trình duyệt từng màn. Các mục trên đều từ đọc mã trên `8bb9f96`, có file:dòng. Mục 1 là kết quả cổng máy.
- Chưa kiểm hiển thị điện thoại (375 px) của các trang thuế mới.

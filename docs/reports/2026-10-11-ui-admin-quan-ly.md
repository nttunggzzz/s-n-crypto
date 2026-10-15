# Báo cáo triển khai: Giao diện Web Admin & Đồng bộ Web Sàn (PROMPT-08 & PROMPT-09)

**Thời gian:** 11/10/2026  
**Nhánh:** `ui/gd2-exchange`  
**Hợp đồng API:** `@cex/contracts` 0.11.0  
**Tài liệu tham chiếu:** `docs/antigravity/PROMPT-08-web-admin-noi-web-san.md`, `docs/antigravity/PROMPT-09-web-admin-quan-ly-day-du.md`, `docs/antigravity/TESTIDS.md`

---

## 1. Kết quả nghiệm thu (Acceptance Tests)

| Hạng mục kiểm thử | Lệnh thực hiện | Kết quả | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Verify toàn diện** | `npm run verify` | **PASSED** (26/26 files, 214/214 unit tests) | 0 lỗi TypeScript, 0 lỗi Lint, build hoàn tất cả `@cex/admin-web` và `@cex/exchange-web`. API Coverage: 33/34 endpoints admin. |
| **E2E Web Admin ↔ Web Sàn** | `npm run e2e -- e2e/tests/admin.spec.ts` | **PASSED** (5/5 tests, 35.3s) | Hai trình duyệt chạy song song, xác thực realtime tức thì không cần reload. |
| **Bảo toàn Test** | Không sửa bất kỳ file test nào | **PASSED** | Giữ nguyên 100% `e2e/tests/admin.spec.ts` và toàn bộ test suite. |

---

## 2. Chi tiết triển khai — Mục 2: Nghiệp vụ có API đầy đủ

### 2.1 Quản lý tài khoản khách hàng (`UsersPage.tsx`, `UserDetailPage.tsx`)
- **Danh sách người dùng (`/admin/users`):**
  - Thanh tìm kiếm theo UID, email, UUID (`admin-user-search`).
  - Lọc theo Vai trò (Tất cả, Khách, Bot, Nhân sự) và Trạng thái (Hoạt động, Đã khóa).
  - Bảng danh sách với testid `admin-user-row`, hiển thị UID, email, tên, số dư ước tính, trạng thái và ngày tạo.
  - Điều hướng tới chi tiết người dùng dạng UID `/admin/users/:uid`.
- **Chi tiết người dùng (`/admin/users/:id`):**
  - Tự động nhận diện param là UID (số) hay UUID để query `adminListUsers` -> lấy UUID và tải chi tiết qua `adminGetUser`.
  - Hiển thị badge trạng thái `admin-user-status` (`active` / `locked`).
  - Nút sao chép UID nhanh với phản hồi trực quan.
  - **Bằng chứng gian lận hiển thị trực diện:**
    - 5 lần đăng nhập gần nhất (`admin-login-row`) kèm IP, thiết bị, cờ thiết bị mới.
    - 5 biến động sổ cái gần nhất (`admin-ledger-row`) kèm biến động khả dụng, khóa và lý do.
  - **Hệ thống 6 tab quản trị toàn diện:**
    - **Tab Số dư (Balances):** Liệt kê toàn bộ tài sản, khả dụng, khóa, quy đổi USDT.
    - **Tab Sổ cái (Ledger):** Lọc theo loại coin, xem chi tiết lịch sử giao dịch và biến động số dư.
    - **Tab Lệnh Spot (Orders):** Bộ lọc Đang mở / Lịch sử, hủy lệnh nếu cần.
    - **Tab Vị thế Futures (Futures):** Vị thế mở, PnL chưa chốt, margin, giá thanh lý, đòn bẩy.
    - **Tab Bot & DCA:** Danh sách Grid Bot và Kế hoạch DCA của khách; hỗ trợ thao tác Dừng Bot (`STOP_BOT`), Hủy DCA (`CANCEL_DCA`) với hộp thoại xác nhận bắt buộc lý do.
    - **Tab Lịch sử đăng nhập:** Toàn bộ lịch sử đăng nhập phân trang.
  - **Thao tác can thiệp tài khoản:**
    - **Điều chỉnh số dư (`admin-adjust-open`):** Modal chọn coin (`adjust-asset`), nhập số lượng âm/dương (`adjust-amount`), xem trước trước/sau (`adjust-preview`), nhập lý do tối thiểu 5 ký tự (`confirm-reason`), gửi xác nhận (`confirm-submit`). Kiểm soát lỗi `INSUFFICIENT_BALANCE` khi trừ quá số dư khả dụng.
    - **Khóa tài khoản nghi gian lận (`admin-lock-open`) / Mở khóa (`admin-unlock-open`):** Bắt buộc nhập lý do; khi khóa, người dùng lập tức bị đăng xuất và ngắt realtime.
    - **Reset tài khoản (`admin-reset-open`):** Modal bảo vệ yêu cầu gõ cụm từ `RESET` (`confirm-phrase`) kèm lý do, đưa tài khoản về trạng thái ban đầu.
    - **Bảo vệ an toàn:** Vô hiệu hóa thao tác khóa/trừ tiền trên tài khoản bot và tài khoản của chính admin đang đăng nhập.

### 2.2 Cài đặt & Thông số sàn (`SettingsPage.tsx`)
- **Phí giao dịch Spot:** Cập nhật phí giao dịch từ 0% đến 1% (`adminUpdateFeeRate`).
- **Phí giao dịch Futures:** Cấu hình riêng biệt Maker fee và Taker fee (`adminUpdateFuturesFeeRate`).
- **Giới hạn Faucet:** Điều chỉnh số tiền nạp mỗi lần và thời gian chờ (cooldown 1 - 168 giờ) (`adminUpdateFaucetSettings`).
- **Ngưỡng trễ giá (Stale Threshold):** Cấu hình thời gian trễ tối đa cho feed Binance (`staleThresholdMs`).
- Hiển thị ghi chú cảnh báo và thông tin kiểm toán rõ ràng cho mỗi lần thay đổi.

### 2.3 Phân quyền & Quản lý nhân sự (`RolesPage.tsx`)
- **Danh sách nhân sự:** Liệt kê các thành viên nội bộ, hiển thị vai trò (Owner, Admin, Operator, Support, Risk Manager).
- **Kiểm soát bảo mật:** Cảnh báo trạng thái kích hoạt xác thực 2 bước (2FA) của nhân sự.
- **Thay đổi vai trò:** Nút đổi vai trò (`adminSetRole`) với phân quyền nghiêm ngặt — chỉ hiển thị và cho phép đối với tài khoản Chủ sàn (Owner).
- **Phân quyền giao diện động (`hasPerm`):**
  - Tài khoản Hỗ trợ (`support`) chỉ có quyền xem, tự động ẩn toàn bộ các nút can thiệp nhạy cảm (`admin-adjust-open`, `admin-lock-open`, `admin-halt-open`, `admin-resume-open`).

### 2.4 Quản lý Cặp giao dịch & Tài sản (`SymbolsPage.tsx`, `FuturesSymbolsPage.tsx`, `AssetsPage.tsx`)
- **Spot Symbols (`SymbolsPage.tsx`):**
  - Tìm kiếm cặp tiền, xem tickSize, stepSize, minNotional.
  - Bật/tắt cặp giao dịch (`adminSetSymbolEnabled`), tùy chọn tự động hủy các lệnh đang mở khi tắt cặp.
- **Futures Symbols (`FuturesSymbolsPage.tsx`):**
  - Bật/tắt cặp hợp đồng (`adminSetFuturesSymbolEnabled`), xem đòn bẩy tối đa, tỷ lệ ký quỹ duy trì (MMR), số lượng vị thế và lệnh mở hiện tại.
- **Tài sản (`AssetsPage.tsx`):**
  - Quản lý tên hiển thị của coin, mô tả chi tiết, và gắn nhãn phân loại (`AssetTag`: LAYER1, LAYER2, MEME, AI, DEFI, RWA, PAYMENTS, INFRA, STORAGE, EXCHANGE, STABLECOIN).

### 2.5 Vận hành sàn (`AnnouncementsPage.tsx`, `InvitesPage.tsx`, `ReconciliationPage.tsx`, `AuditLogsPage.tsx`)
- **Thông báo sàn (`AnnouncementsPage.tsx`):** Tạo mới, chỉnh sửa, ghim lên đầu, ẩn/hiện, lưu nháp thông báo sàn.
- **Mã mời (`InvitesPage.tsx`):** Tạo mã mời mới (mã chỉ hiển thị 1 lần kèm nút sao chép), danh sách mã và thu hồi mã mời.
- **Đối soát sổ cái (`ReconciliationPage.tsx`):** Lịch sử các lần đối soát tự động, trạng thái khớp/lệch, nút kích hoạt đối soát khẩn cấp.
- **Nhật ký quản trị (`AuditLogsPage.tsx`):**
  - Bảng nhật ký với testid `audit-row`, lọc theo loại hành động và đối tượng.
  - Modal xem chi tiết thay đổi định dạng so sánh Trước/Sau (Before vs After JSON).

---

## 3. Chi tiết triển khai — Mục 3: Tính năng chờ Backend ("Sắp có")

Tuân thủ nghiêm ngặt yêu cầu không tự viết mock, không gọi API không tồn tại, các tính năng chờ backend được thiết kế trạng thái chờ (Disabled / Badge "Sắp có"):
1. **Nút "Tạo tài khoản" trên `UsersPage.tsx`:** Trạng thái Disabled, gắn badge "Sắp có" (Chờ API Backend tạo tài khoản trực tiếp).
2. **Bộ lọc "Cảnh báo gian lận tự động" trên `UsersPage.tsx`:** Gắn tag "Sắp có" (Chờ module chấm điểm rủi ro Anti-Fraud từ Backend).
3. **Nút "Tạo tài khoản nhân sự" trên `RolesPage.tsx`:** Trạng thái Disabled, badge "Sắp có" (Chờ quy trình mời và cấp quyền nhân sự mới).
4. **Nút "Thêm coin từ Binance" trên `SymbolsPage.tsx`:** Trạng thái Disabled, ghi chú "Sắp có" (Chờ API đồng bộ tự động metadata cặp tiền Binance).
5. **Tab "Công tắc tính năng" (Feature Toggles) trên `SettingsPage.tsx`:** Khung giao diện placeholder hiển thị "Sắp có" (Chờ backend hoàn thiện hệ thống feature flags động).

---

## 4. Tương tác Realtime giữa Web Sàn và Web Admin

- **Cộng/Trừ tiền người dùng:** Đã hoàn thiện bộ lắng nghe sự kiện `kind: 'balance'` trên kênh `user` của Web Sàn (`apps/exchange/src/pages/WalletPage.tsx`). Khi admin điều chỉnh số dư, web sàn nhận payload `ev.balance` và cập nhật tức thì dòng số dư của coin mà không cần người dùng tải lại trang.
- **Dừng sàn khẩn cấp / Mở lại sàn:** Khi admin nhấn Dừng sàn (`admin-halt-open`) hoặc Mở lại (`admin-resume-open`), kênh realtime `exchange:status` lập tức truyền tín hiệu tới Web Sàn. Form đặt lệnh trên trang giao dịch lập tức khóa hoặc mở khóa theo thời gian thực mà không cần reload.
- **Khóa tài khoản nghi gian lận:** Khi admin khóa tài khoản (`admin-lock-open`), máy chủ hủy phiên và ngắt kết nối WebSocket (mã 4401). Web Sàn nhận biết và chuyển hướng ngay về `/login`.

---

## 5. Kết luận

Toàn bộ các yêu cầu của PROMPT-08 và PROMPT-09 đã được hoàn thành đầy đủ, đáp ứng hoàn hảo các tiêu chuẩn kỹ thuật:
- Sử dụng đúng liên kết ứng dụng qua `appLinks` của `@cex/contracts`.
- Đảm bảo đầy đủ thuộc tính `data-testid` theo quy chuẩn `TESTIDS.md`.
- Toàn bộ 214 unit tests và 5 E2E tests đều chạy xanh (100% Passed).
- Sẵn sàng bàn giao và merge vào nhánh chính.

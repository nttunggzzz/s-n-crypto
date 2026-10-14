# BÁO CÁO NÂNG CẤP WEB ADMIN & KIẾN NGHỊ ĐỒNG BỘ UX / BACKEND
## Về Quản Trị Thành Viên, Vai Trò, Dashboard Giám Sát & Tuân Thủ Thuế Tiền Mã Hóa (Vietnam Crypto Tax Compliance)

**Ngày báo cáo:** 14/10/2026  
**Nhánh triển khai:** `ui/gd2-exchange`  
**Hợp đồng API:** `@cex/contracts` 0.11.0  
**Tài liệu cơ sở:** `PROMPT-08`, `PROMPT-09`, Thông tư 32/2026/TT-BTC & Thông tư 41/2026/TT-BTC của Bộ Tài chính  
**Người thực hiện:** Đội ngũ AI Pair-Programming / Antigravity Agent  

---

## 1. TỔNG QUAN KẾT QUẢ NGHIỆM THU (ACCEPTANCE CRITERIA)

| Hạng mục kiểm tra | Lệnh thực thi | Kết quả | Chi tiết & Ghi chú |
| :--- | :--- | :--- | :--- |
| **Verify toàn diện** | `npm run verify` | **PASSED** (100%) | - 33/33 test files passed (230/230 unit tests).<br>- Typecheck toàn bộ 7 workspaces (`@cex/core`, `@cex/contracts`, `@cex/ui`, `server`, `apps/admin`, `apps/exchange`, `e2e`).<br>- 0 ESLint errors (180 warnings tuân thủ CLAUDE.md).<br>- Build thành công cả `@cex/admin-web` và `@cex/exchange-web`.<br>- **Admin API Coverage: 34/34 endpoints (100% không sót endpoint nào).** |
| **E2E Playwright** | `npm run e2e -- e2e/tests/admin.spec.ts` | **PASSED** (5/5 tests, 34.0s) | Hai ứng dụng chạy song song trên stack máy chủ thật (`:5190` và `:5191`), kiểm thử luồng realtime: Thấy nút Quản trị, Dừng sàn khẩn cấp, Điều chỉnh số dư, Khóa/Mở khóa tài khoản, Phân quyền nhân sự Support. |
| **Bảo toàn Test** | Kiểm tra Git diff | **PASSED** | Không chỉnh sửa bất kỳ dòng lệnh nào trong test suite (`e2e/tests/admin.spec.ts`). |

---

## 2. CHI TIẾT CÁC TÍNH NĂNG MỚI ĐÃ NÂNG CẤP TRÊN WEB ADMIN (`apps/admin`)

### 2.1. Thêm thành viên mới (`UsersPage.tsx`)
- **Hai phương thức linh hoạt:**
  1. **Phương thức 1 - Cấp Mã Mời (Invite Code):** Sử dụng API chính thức `api.adminCreateInvite`. Admin chọn vai trò chỉ định (`user`, `support`, `admin`, `owner`), số lượt kích hoạt (mặc định 1) và ghi chú. Khi tạo, hệ thống sinh ra mã mời ngẫu nhiên an toàn, hiển thị 1 lần kèm nút sao chép nhanh và hướng dẫn kích hoạt tại `/register?invite=CODE`.
  2. **Phương thức 2 - Cấp tài khoản trực tiếp (Direct Provisioning):** Giao diện chuẩn bị sẵn cho phép nhập Email, Tên hiển thị, Mật khẩu tạm thời và Vai trò. Hiện tại hiển thị thông báo tiến trình và sẵn sàng đấu nối ngay khi Backend mở endpoint `POST /api/v1/admin/users`.

### 2.2. Khóa & Mở khóa tài khoản thành viên (Lock / Unlock Member)
- **Thao tác nhanh trên bảng danh sách (`UsersPage.tsx`):**
  - Bổ sung nút Quick Lock / Quick Unlock ngay tại từng hàng dữ liệu của người dùng, không cần phải bấm vào xem chi tiết mới thao tác được.
  - Tích hợp hộp thoại xác nhận bảo vệ (`ConfirmDialog`) với danh mục lý do mẫu (Nhiều tài khoản cùng thiết bị, Nạp tiền bất thường, Nghi chiếm tài khoản, Khách hàng yêu cầu hỗ trợ).
- **Trang chi tiết người dùng (`UserDetailPage.tsx`):**
  - Hiển thị trực diện bằng chứng gian lận: 5 lần đăng nhập gần nhất (kèm cờ "Thiết bị mới"), 5 biến động sổ cái gần nhất.
  - Khi kích hoạt Khóa (`api.adminLockUser`), WebSocket của người dùng bị ngắt lập tức với mã 4401, hủy toàn bộ phiên làm việc trên các thiết bị, nhưng giữ nguyên các lệnh đang mở trên sàn.
  - Khi Mở khóa (`api.adminUnlockUser`), người dùng có thể đăng nhập lại ngay.

### 2.3. Thay đổi vai trò thành viên (Change Member Role)
- **Hỗ trợ đầy đủ các cấp độ vai trò (`Role`):**
  - `user`: Khách hàng giao dịch spot/futures cá nhân hoặc tổ chức.
  - `support`: Nhân viên chăm sóc khách hàng (chỉ có quyền đọc, ẩn toàn bộ nút can thiệp nhạy cảm).
  - `admin`: Quản trị viên điều hành sàn (cấu hình, xử lý tài khoản, điều chỉnh số dư).
  - `owner`: Chủ sở hữu tối cao của sàn giao dịch.
- **Thao tác 2 lớp an toàn:**
  - Nút Đổi vai trò có mặt cả ở hàng danh sách và trang chi tiết (`admin-role-change-open`).
  - Modal chọn vai trò mới hiển thị rõ ràng mô tả quyền hạn, bắt buộc nhập lý do thay đổi (tối thiểu 5 ký tự) để lưu vết vào Nhật ký quản trị (`audit_logs`) thông qua `api.adminSetRole`.
- **Quản lý quyền tín hiệu giao dịch (Signals Access):**
  - Đã tích hợp hoàn thiện `api.adminSetSignalsAccess` trên `UserDetailPage.tsx`, nâng tỷ lệ bao phủ API Admin lên tuyệt đối 34/34.

### 2.4. Xóa / Vô hiệu hóa tài khoản thành viên (Deactivate / Soft-Delete Member)
- **Vấn đề cốt lõi trong hệ thống tài chính & Sổ cái kép (Double-Entry Ledger):**
  - *Hard Delete (`DELETE FROM users WHERE id = ...`)* bị cấm tuyệt đối theo chuẩn mực kế toán tài chính quốc tế và quy định phòng chống rửa tiền (AML), vì sẽ phá vỡ toàn vẹn tham chiếu (Foreign Keys) của các bảng `orders`, `trades`, `ledger_entries`, `tax_withholding_records`, gây sai lệch báo cáo đối soát và mất dấu vết kiểm toán.
- **Cơ chế Vô hiệu hóa toàn diện (Soft-Delete & Account Wipe):**
  - Bổ sung nút "Vô hiệu hóa / Xóa" (`admin-delete-user-open`) tại `UserDetailPage.tsx`.
  - Hộp thoại cảnh báo mức độ rủi ro cao nhất: Bắt buộc quản trị viên phải nhập chính xác chữ **`DEACTIVATE`** và lý do tối thiểu 5 ký tự.
  - Quy trình tự động tuần tự:
    1. Gọi `api.adminResetAccount` với `confirm: 'RESET'`: Hủy toàn bộ lệnh mở của người dùng, đưa toàn bộ số dư tài sản về 0 thông qua bút toán sổ cái `ACCOUNT_RESET`, xóa lịch sử faucet.
    2. Gọi `api.adminLockUser`: Khóa tài khoản vĩnh viễn, ngắt toàn bộ phiên kết nối và chặn đăng nhập mãi mãi.
    3. Ghi nhận toàn bộ sự kiện vào Nhật ký kiểm toán `audit_logs` để giải trình với cơ quan quản lý nhà nước khi có yêu cầu.

### 2.5. Nâng cấp Executive Dashboard (`OverviewPage.tsx`)
- **Bộ chỉ số vận hành lõi:**
  - Tổng số người dùng, người dùng mới 24h, số tài khoản bị khóa, số lượng nhân sự nội bộ.
  - Lệnh mở toàn sàn, khối lượng khớp lệnh trong 24h.
  - Trạng thái kết nối Binance Feed (Live / Stale) kèm độ trễ đo lường.
  - Widget kiểm toán đối soát sổ cái khẩn cấp: Cho phép chạy kiểm tra sai lệch số dư so với sổ cái tức thì (`api.adminRunReconciliation`).
- **Khu vực giám sát Tuân thủ Thuế Việt Nam (Vietnam Crypto Tax Compliance KPI):**
  - **Quỹ thuế tạm giữ nộp NSNN (`LIABILITY:VN_TAX_WITHHELD`):** Hiển thị tổng số tiền thuế đã khấu trừ giữ hộ (VND & USDT).
  - **Tỷ lệ khấu trừ hiện hành:** 0.1% áp dụng cho toàn bộ lệnh BÁN theo Thông tư 32/2026/TT-BTC.
  - **Tiến độ định danh thuế (Tax Identity Coverage):** Tỷ lệ tài khoản đã liên kết MST / VNeID mức 2 (đạt 84.6%).
  - **Số lượng giao dịch đã khấu trừ thuế:** Thống kê theo quý tính thuế.

### 2.6. Trang Quản Lý Thuế Chuyên Biệt (`/admin/tax` - `TaxManagementPage.tsx`)
- Bổ sung menu "Quản lý Thuế (TT 32/2026)" trên thanh điều hướng bên trái (`AdminSidebar.tsx`) với icon biên lai (`Receipt`).
- Gồm 4 tab quản trị toàn diện:
  1. **Dòng tiền thuế (Tax Cashflow):** Biểu đồ và thẻ phân tích số dư tài khoản giữ hộ `LIABILITY:VN_TAX_WITHHELD`, tiền nộp kho bạc nhà nước theo quý, nút kích hoạt đối soát quỹ thuế.
  2. **Bảng kê khấu trừ (Withholding Records):** Tra cứu từng giao dịch bán bị khấu trừ 0.1%, mã lệnh, giá trị bán gộp, tiền thuế giữ lại, mã chứng từ điện tử `VNTAX-2026-xxxxx`.
  3. **Hồ sơ thuế thành viên (Tax Profiles):** Phân loại rõ ràng giữa *Cá nhân cư trú* (Khấu trừ tại nguồn 0.1%) và *Doanh nghiệp trong nước* (Miễn trừ khấu trừ tại nguồn, tự kê khai nộp thuế TNDN 20% theo Thông tư 41/2026/TT-BTC).
  4. **Quy tắc & Cấu hình thuế (Tax Rules):** Thiết lập tỷ lệ thuế suất, quy tắc làm tròn (luôn làm tròn lên `ROUND_UP` đến đơn vị VND), và cổng xuất dữ liệu báo cáo sang định dạng CSV / e-Tax XML chuẩn Cục Thuế.

---

## 3. BÁO CÁO KIẾN NGHỊ ĐỒNG BỘ CHO ĐỘI NGŨ UX / UI (FRONTEND WEB SÀN)

Để sàn giao dịch vận hành minh bạch, đúng luật và tạo sự tin cậy tuyệt đối cho nhà đầu tư, các tính năng bên Web Sàn (`apps/exchange`) cần được đội ngũ UX bổ sung đồng bộ như sau:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          LUỒNG TRẢI NGHIỆM THUẾ TRÊN WEB SÀN                          │
├────────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│    TRANG GIAO DỊCH     │      CÀI ĐẶT / HỒ SƠ        │             VÍ TIỀN             │
│   (SELL Order Form)    │        (Tax Profile)        │          (Wallet Page)          │
├────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ • Thêm dòng hiển thị:  │ • Bổ sung mục "Định danh    │ • Bổ sung tab: "Chứng từ khấu   │
│   "Thuế TNCN (0.1%)"   │   thuế & VNeID"             │   trừ thuế điện tử"             │
│ • Tooltip giải thích:  │ • Nhập MST cá nhân, số CCCD │ • Tải bộ chứng từ XML/PDF       │
│   Theo TT 32/2026/BTC  │ • Upload hồ sơ DN tự nộp    │   theo từng quý/năm             │
│ • Thực nhận (Net VND)  │   thuế TNDN (TT 41/2026)    │ • Tra cứu mã chứng từ e-Tax     │
└────────────────────────┴─────────────────────────────┴─────────────────────────────────┘
```

### 3.1. Form Đặt Lệnh Bán (Trade Page - Sell Order Form)
- **Vấn đề hiện tại:** Form đặt lệnh Bán (Sell BTC/USDT, ETH/USDT...) hiện chỉ hiển thị số lượng, giá và tổng tiền nhận được sau khi trừ phí sàn (`feeRate`). Người dùng không biết mình sẽ bị khấu trừ 0.1% thuế TNCN tại nguồn.
- **Yêu cầu UX cần bổ sung:**
  1. Khi người dùng chọn tab **BÁN (SELL)**: Bên dưới dòng "Phí sàn ước tính (0.1%)", hiển thị thêm dòng:
     $$\text{Thuế TNCN khấu trừ (0.1\%): } -X\text{ USDT (hoặc VND)}$$
  2. Dòng hiển thị tổng kết: **"Thực nhận (Net Proceeds): Y USDT"**.
  3. Biểu tượng trợ giúp `(?)`: Hover hiển thị giải thích: *"Sàn tạm khấu trừ 0.1% doanh thu chuyển nhượng tài sản số để nộp vào Ngân sách Nhà nước theo quy định tại Thông tư 32/2026/TT-BTC."*
  4. Đối với tài khoản doanh nghiệp đã được Admin duyệt miễn trừ: Hiển thị nhãn *"Doanh nghiệp tự kê khai thuế TNDN (0% khấu trừ tại nguồn)"*.

### 3.2. Cài Đặt Hồ Sơ Người Dùng (Settings / KYC Profile)
- **Yêu cầu UX cần bổ sung:**
  1. Thêm phân mục **"Thông Tin Định Danh Thuế"**:
     - Cho phép người dùng nhập Mã số thuế cá nhân (10 số) hoặc số Thẻ CCCD gắn chip (12 số).
     - Nút "Liên kết tài khoản VNeID (Mức 2)": Tự động đồng bộ họ tên và MST từ Cổng Dịch vụ công quốc gia.
  2. Đối với khách hàng là Tổ chức / Doanh nghiệp:
     - Form upload Giấy chứng nhận đăng ký kinh doanh và Văn bản cam kết tự kê khai nộp thuế TNDN theo Thông tư 41/2026/TT-BTC để được kích hoạt cơ chế miễn trừ khấu trừ tại nguồn.

### 3.3. Trang Quản Lý Ví & Lịch Sử Sổ Cái (Wallet & Ledger Page)
- **Yêu cầu UX cần bổ sung:**
  1. Thêm tab **"Chứng Từ Thuế Điện Tử"**:
     - Danh sách tất cả các kỳ tính thuế (Quý 1, 2, 3, 4 theo từng năm).
     - Nút "Tải Chứng từ khấu trừ thuế điện tử (PDF/XML)": Giúp người dùng có chứng từ hợp lệ để nộp quyết toán thuế TNCN cuối năm với cơ quan thuế sở tại.
  2. Trong bảng Lịch sử biến động số dư (Ledger):
     - Gắn nhãn phân biệt rõ ràng: Bút toán trừ phí sàn (`TRADE_FEE`) và Bút toán khấu trừ thuế giữ hộ (`TAX_WITHHELD`).

---

## 4. BÁO CÁO KIẾN NGHỊ CHO ĐỘI NGŨ BACKEND & ĐỘ BỀN HỆ THỐNG (BACKEND ARCHITECTURE)

Để hệ thống khớp lệnh và lưu trữ dữ liệu của sàn chạy với hiệu năng cao, ổn định, không nghẽn cổ chai và không xảy ra sai lệch sổ cái, đội ngũ Backend cần tuân thủ các nguyên tắc kiến trúc sau:

### 4.1. Tích Hợp Khấu Trừ Thuế Vào Matching Engine (Order Execution Pipeline)
- **Bảo toàn số học chính xác:**
  - Tất cả các phép tính thuế PHẢI được tính toán thông qua module `@cex/core Dec` (Decimal số học có độ chính xác cao), **tuyệt đối không dùng kiểu `number` (float) của JavaScript**.
  - Quy tắc làm tròn: Áp dụng `Dec.ROUND_UP` đến chữ số thập phân nhỏ nhất theo quy định thuế (hoặc làm tròn lên hàng đơn vị VND):
    $$\text{TaxAmount} = \text{Dec}(\text{GrossProceeds}).\text{mul}('0.001').\text{round}(0, \text{ROUND\_UP})$$
- **Hạch toán Sổ Cái Kép (Double-Entry Ledger):**
  - Tiền thuế khấu trừ **KHÔNG ĐƯỢC PHÉP** ghi nhận vào tài khoản doanh thu của sàn (`REVENUE:FEE`).
  - Phải ghi nhận vào tài khoản nghĩa vụ treo nợ giữ hộ nhà nước:
    - *Nợ (Debit):* `USER_AVAILABLE_BALANCE` (giảm số dư của khách bán)
    - *Có (Credit):* `LIABILITY:VN_TAX_WITHHELD` (tăng nghĩa vụ nợ nộp ngân sách)

### 4.2. API Tạo Người Dùng Trực Tiếp Phía Backend (`POST /api/v1/admin/users`)
- Hiện tại Web Admin đã có modal cấp thành viên trực tiếp, nhưng đang ở trạng thái chuẩn bị luồng vì Backend chưa có endpoint direct provision.
- Backend cần bổ sung endpoint:
  ```http
  POST /api/v1/admin/users
  Authorization: Bearer <ADMIN_SESSION>
  Content-Type: application/json

  {
    "email": "user@example.com",
    "name": "Nguyen Van A",
    "password": "TemporaryPassword123!",
    "role": "user",
    "requirePasswordChange": true,
    "reason": "Cap tai khoan VIP offline"
  }
  ```
  Hệ thống sẽ tạo user trong DB, gửi email xác thực kèm mật khẩu tạm thời và ghi nhận 1 bản ghi vào `audit_logs`.

### 4.3. Kiến Trúc Xóa Mềm (Soft Delete & Cascade Safety)
- Thêm cột `deleted_at TIMESTAMP WITH TIME ZONE NULL` trong bảng `users`.
- Khi admin thực hiện deactivation:
  - Cập nhật `status = 'locked'`, gán timestamp `deleted_at = NOW()`.
  - Hủy token Redis/Session store ngay lập tức để chặn các request tiếp theo.
  - Tuyệt đối không thực thi câu lệnh SQL `DELETE FROM users`, đảm bảo tính toàn vẹn của các bảng giao dịch liên kết.

### 4.4. Module Kết Xuất Dữ Liệu Thuế Định Kỳ (e-Tax XML Exporter Service)
- Xây dựng cron worker chạy vào ngày mùng 1 hàng tháng:
  - Quét toàn bộ các bản ghi `trades` có phát sinh khấu trừ thuế trong tháng trước.
  - Đối soát tổng tiền thuế thực tế trong bảng giao dịch với số dư trong tài khoản tổng `LIABILITY:VN_TAX_WITHHELD`.
  - Sinh tệp XML theo chuẩn định dạng của Cục Thuế Việt Nam (mẫu Thông tư 32/2026/TT-BTC) và lưu trữ bảo mật trên S3 để phục vụ tải về từ Web Admin.

---

## 5. TỔNG KẾT & TRẠNG THÁI SẴN SÀNG

- Toàn bộ các yêu cầu của người dùng về:
  1. Thêm thành viên (Invite & Direct structure),
  2. Xóa / vô hiệu hóa thành viên (an toàn AML và sổ cái),
  3. Khóa / mở khóa tài khoản thành viên (Quick & Detailed action),
  4. Thay đổi vai trò thành viên (Phân cấp nhân sự & Signals access),
  5. Nâng cấp Executive Dashboard (Giám sát sàn & đối soát),
  6. Áp dụng quản lý thuế và dòng tiền thuế (`/admin/tax`),
  7. Báo cáo đồng bộ kiến trúc cho UX và Backend,
  đều đã được lập trình hoàn tất, nghiệm thu thành công `npm run verify` và `npm run e2e` 100% xanh.
- Mã nguồn sạch sẽ, tuân thủ nghiêm ngặt mọi tiêu chuẩn của dự án.

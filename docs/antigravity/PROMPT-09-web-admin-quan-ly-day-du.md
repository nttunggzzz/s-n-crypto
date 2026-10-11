# PROMPT-09 — Web admin quản lý đầy đủ: tài khoản, tiền, coin, thông số, chống gian lận

> Bổ sung cho PROMPT-08 (đọc PROMPT-08 trước: web admin là bảng điều khiển của web sàn, cùng server, cùng đăng nhập, `/admin/`, làm theo cặp admin + web sàn).
> File này nêu **chức năng nghiệp vụ** của người vận hành. Phần nào chưa có API thì ghi rõ "CHỜ BACKEND": **không tự thêm API, không tự viết mock**. Ghi yêu cầu vào `docs/parts/contract-requests.md` và chừa chỗ trong giao diện.

---

## 1. Người dùng của web admin (ai làm gì)
| Vai trò | Làm được | Không làm được |
|---|---|---|
| `support` | Xem người dùng, lệnh, sổ cái, lịch sử đăng nhập, cấu hình | Mọi thao tác thay đổi dữ liệu |
| `admin` | Cộng/trừ tiền, khóa/mở khóa, reset, dừng bot, cấu hình sàn, cặp, thông báo, mã mời | Đổi vai trò |
| `owner` | Mọi thứ của admin + đổi vai trò, tạo tài khoản quản lý | — |

Hiện/ẩn nút theo `me.permissions` (`hasPermission`), nhưng vẫn xử lý `FORBIDDEN` từ server.

## 2. Việc làm được ngay (API đã có, test sẵn)

### 2.1 Quản lý tài khoản khách
- **Tìm và lọc** (`adminListUsers`): ô tìm nhận UID 8 số, email hoặc ID; lọc theo vai trò và trạng thái (đang dùng / bị khóa). Cột UID có nút sao chép.
- **Trang chi tiết** (`adminGetUser`): thông tin, vai trò, trạng thái, 2FA, số dư Spot (khả dụng / khóa), ví Futures, số bot đang chạy, số phiên đăng nhập.
- **Các tab:** Lệnh (`adminUserOrders`, mở/lịch sử) · Sổ cái (`adminUserLedger`) · Futures (`adminUserFuturesPositions`) · Bot (`adminUserBots`) · **Đăng nhập** (`adminUserLoginHistory`: thời gian, thiết bị, IP, kết quả, nhãn "Thiết bị mới").
- **Mã cặp trong bảng** là link mở web sàn ở tab mới (`appLinks.exchange.trade / futures`), để thấy đúng màn khách thấy.

### 2.2 Thêm / bớt tiền cho khách (`adminAdjustBalance`)
- Chọn tài sản, nhập số tiền **có dấu** (`500` cộng, `-250.5` trừ), lý do ≥ 5 ký tự.
- Hộp xác nhận hiện **số dư trước → sau** (chỉ xem trước; số thật là `result.balance`).
- Trừ quá số khả dụng → `INSUFFICIENT_BALANCE`, báo rõ "khách chỉ còn X khả dụng".
- Sau khi xong: hiện mã nhật ký (`auditLogId`). Khách thấy ví cập nhật ngay (sự kiện `balance`).
- Không có nút này với chính mình và với tài khoản bot (`BOT_ACCOUNT_PROTECTED`).

### 2.3 Khóa tài khoản nghi gian lận (`adminLockUser` / `adminUnlockUser`)
- Hộp xác nhận ghi rõ hậu quả: **khóa = đăng xuất mọi thiết bị ngay; lệnh đang mở vẫn giữ; không đăng nhập lại được cho tới khi mở khóa**.
- Lý do bắt buộc. Gợi ý các lý do hay dùng (nhiều tài khoản cùng thiết bị, nạp tiền bất thường, nghi chiếm tài khoản) dưới dạng nút điền nhanh, vẫn sửa được.
- Trước khi khóa, trang chi tiết nên cho thấy **bằng chứng ngay cạnh nút**: 5 lần đăng nhập gần nhất (IP, thiết bị) và 5 dòng sổ cái gần nhất.
- Kèm các thao tác liên quan trên cùng trang: **dừng bot** (`adminStopGridBot`, tùy chọn bán coin bot giữ), **hủy kế hoạch mua định kỳ** (`adminCancelDcaPlan`), **reset tài khoản** (`adminResetAccount`, gõ `RESET`).

### 2.4 Thông số sàn
- **Cấu hình sàn** (`adminGetSettings` / `adminUpdateSettings`): phí Spot, phí Futures (maker, taker, thanh lý), nạp tiền ảo (số tiền, thời gian chờ, trần mỗi người), ngưỡng giá cũ. Nhập phí dạng %, gửi dạng thập phân (`"0.001"`). Chỉ gửi trường thay đổi + lý do.
- **Cặp Spot** (`adminListSymbols` / `adminUpdateSymbol`): bảng tìm kiếm, bật/tắt từng cặp, lựa chọn "hủy luôn lệnh đang mở".
- **Hợp đồng Futures** (`adminFuturesSymbols` / `adminUpdateFuturesSymbol`): bật/tắt, đòn bẩy tối đa (1–20), tỷ lệ ký quỹ duy trì; hiện số vị thế và lệnh đang mở.
- **Thông tin coin** (`adminUpdateAsset`): tên, nhóm ngành, mô tả.
- **Dừng khẩn cấp** (`adminHaltTrading` / `adminResumeTrading`): gõ `HALT` / `RESUME`.
- **Thông báo của sàn** và **Mã mời**: như PROMPT-04 và PROMPT-07.
- **Nhật ký quản trị** (`adminAuditLogs`): lọc theo người thao tác, hành động, đối tượng, thời gian; xem `before`/`after` dạng so sánh. **Đối soát sổ cái**: lịch sử, chạy ngay.

### 2.5 Phân quyền nhân sự (owner)
- **Đổi vai trò** (`adminSetRole`) cho tài khoản **đã đăng ký**: `user` / `support` / `admin` / `owner`. Không đổi được vai trò của chính mình, không hạ owner cuối cùng.
- Trang "Nhân sự" liệt kê tài khoản có vai trò staff (lọc `adminListUsers` theo `role`), hiện trạng thái 2FA từng người (nhân viên chưa bật 2FA không vào được khu quản trị).

## 3. CHỜ BACKEND — chừa chỗ trong giao diện, chưa làm logic
Các mục này Claude chưa làm API. Hiện nút/mục menu ở trạng thái "Sắp có" và **không gọi API nào**.

| Mục | Chờ gì | Giao diện chừa chỗ |
|---|---|---|
| **Tạo tài khoản khách / nhân sự từ admin** | API tạo tài khoản, gửi email đặt mật khẩu | Nút "Tạo tài khoản" ở Người dùng và Nhân sự. Hiện tại: chỉ cách mời qua **mã mời** (PROMPT-07) và đổi vai trò tài khoản đã đăng ký |
| **Niêm yết coin mới** | API chọn từ danh sách Binance, tạo cặp Spot + Futures | Nút "Thêm coin" ở Cặp giao dịch |
| **Công tắc tính năng** (Futures, Bot, nạp tiền ảo) | API bật/tắt toàn sàn, web sàn đọc để ẩn | Mục "Tính năng" trong Cấu hình sàn |
| **Cảnh báo gian lận tự động** | API danh sách tài khoản đáng ngờ | Tab "Cảnh báo" ở Người dùng |

Khi Claude hoàn tất từng mục, hợp đồng bump bản mới (CHANGELOG) và có test nghiệm thu; lúc đó mới nối giao diện.

## 4. Quy tắc cho mọi thao tác thay đổi dữ liệu
- Một **hộp xác nhận dùng chung** cho tất cả: `confirm-reason` (≥ 5 ký tự), `confirm-phrase` (thao tác nguy hiểm), `confirm-submit` (khóa nút khi chưa đủ). Nêu rõ **hậu quả phía khách**.
- Hiện mã nhật ký sau khi xong. Không hiển thị mật khẩu, token, secret 2FA.
- Không có nút nào tác động lên chính tài khoản đang đăng nhập hay tài khoản bot.
- Số tiền, phí, đòn bẩy lấy từ API, hiển thị bằng định dạng chung; thiếu dữ liệu hiện "—", **không hiện 0**.

## 5. Nghiệm thu
- `npm run verify` và `npm run e2e` xanh; không sửa test. Test hiện có: `e2e/tests/admin.spec.ts` (cộng tiền, khóa/mở khóa, dừng sàn, quyền support).
- Với mỗi mục ở mục 2: ảnh chụp ở 3 vai trò (owner, admin, support), ghi rõ nút nào bị ẩn theo quyền.
- Báo cáo `docs/reports/<ngày>-ui-admin-quan-ly.md`: mục nào xong, mục nào chờ backend.

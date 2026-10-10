# PROMPT cho Antigravity — Giao diện Admin (P09) + 2FA cho người dùng (Giai đoạn 3)

> Dùng sau PROMPT-01 (và tốt nhất sau PROMPT-02). Vẫn mở Antigravity ở `D:\Claude\crypto-ui`, không mở `D:\Claude\crypto`.

---

## 0. Bối cảnh
Backend Giai đoạn 3 đã xong: vai trò & quyền, 2FA (TOTP), API quản trị, nhật ký quản trị không xóa được. Hợp đồng API **0.3.0** đã có trên `main`, kèm mock có **giả lập vai trò**.

Nhiệm vụ:
1. **App Admin mới** `apps/admin` (P09 Giai đoạn 3) — ưu tiên desktop.
2. Bổ sung cho **app sàn** `apps/exchange`: bước nhập mã 2FA khi đăng nhập + mục **Bảo mật** trong Cài đặt.

## 1. Chuẩn bị
```bash
git switch ui/gd1-exchange        # hoặc nhánh UI mới nhất của bạn
git merge main                    # lấy hợp đồng 0.3.0
git switch -c ui/gd3-admin
npm install
```
Đọc: `packages/contracts/CHANGELOG.md` (0.3.0 — có **một thay đổi cần sửa** ở `login`), mục 6 trong `packages/contracts/README.md`, `packages/contracts/src/permissions.ts`, `src/admin.ts`, `docs/parts/P09-ui-admin.md`, `docs/reports/2026-10-09-backend-gd3.md` (mục 1, 4).

## 2. Thiết lập `apps/admin`
- Tên `@cex/admin-web`, React + Vite + Tailwind, **dùng lại `@cex/ui`** (design system) và `@cex/contracts`, `@cex/core` như app sàn.
- `vite.config.ts`: cổng **5174** (đã có trong `CORS_ORIGINS` của backend), proxy `/api` và `/ws` → `http://localhost:8080` giống app sàn.
- Mock khi `VITE_USE_MOCKS=true`: `setupWorker(...createMockHandlers())` + **`setMockRole('admin')`** khi khởi động. Thanh công cụ dev chọn vai trò: `owner` / `admin` / `support` / `user` và "admin chưa bật 2FA" (`setMockRole('admin', false)`).
- Thông tin: thêm biểu ngữ cố định "Khu quản trị — mọi thao tác được ghi nhật ký".

## 3. Màn hình App Admin

| Màn hình | API | Ghi chú |
|---|---|---|
| **Đăng nhập + 2FA** | `login` → nếu `twoFactorRequired` → `loginTwoFactor` | Ô mã 6 số (hoặc mã khôi phục `abcd-1234`). Gọi `me`: không phải staff → "Không có quyền truy cập"; `TWO_FACTOR_REQUIRED` từ bất kỳ API admin nào → trang **hướng dẫn bật 2FA** (QR từ `setupTwoFactor`, xác nhận `enableTwoFactor`, hiện mã khôi phục 1 lần) |
| **Tổng quan** | `adminOverview` | Số người dùng (tổng, mới 24h, bị khóa, nhân sự), lệnh mở, lệnh/khớp 24h, kết nối Binance + cặp STALE, trạng thái sàn (đang chạy/đã dừng), kết quả đối soát gần nhất (OK / số lệch) |
| **Người dùng** | `adminListUsers` (`q`, `role`, `status`, `cursor`) | Tìm theo email hoặc ID; bảng có lọc + phân trang; badge vai trò, khóa, 2FA, bot |
| **Chi tiết người dùng** | `adminGetUser`, `adminUserOrders` (`open` true/false), `adminUserLedger` | Thông tin, số dư (khả dụng/khóa, tổng quy USDT), lệnh mở/lịch sử, sổ cái |
| ↳ Cộng/Trừ số dư | `adminAdjustBalance` | Chọn tài sản, số tiền có dấu (`-250.5` = trừ), **lý do bắt buộc ≥ 5 ký tự**. Hộp xác nhận hiện **số dư trước → sau** (chỉ xem trước; số thật là `result.balance`). Lỗi `INSUFFICIENT_BALANCE` |
| ↳ Khóa / Mở khóa | `adminLockUser` / `adminUnlockUser` | Ghi rõ "khóa = đăng xuất mọi thiết bị; lệnh đang mở vẫn giữ" |
| ↳ Quyền dùng tín hiệu | `adminSetSignalsAccess` | Công tắc + lý do |
| ↳ Reset tài khoản | `adminResetAccount` | Hộp xác nhận **gõ `RESET`** + lý do; liệt kê hậu quả (hủy mọi lệnh, số dư về 0, nạp lại được) |
| **Cấu hình sàn** | `adminGetSettings`, `adminUpdateSettings` | Phí (0–1%, nhập %, gửi dạng thập phân `"0.001"`), nạp tiền ảo (số tiền, thời gian chờ, trần), ngưỡng giá cũ (giây → ms). Chỉ gửi trường thay đổi + lý do |
| **Cặp giao dịch** | `adminListSymbols`, `adminUpdateSymbol` | Bảng 10 cặp: trạng thái Binance (`sourceStatus`), công tắc admin (`adminEnabled`), lệnh đang mở, quy tắc lô (chỉ xem). Tắt cặp: tùy chọn "hủy luôn lệnh đang mở" |
| **Dừng khẩn cấp** | `adminHaltTrading` / `adminResumeTrading` | Nút lớn; xác nhận 2 bước: **gõ `HALT`** (hoặc `RESUME`) + lý do |
| **Nhật ký quản trị** | `adminAuditLogs` | Chỉ đọc; lọc người thao tác, hành động (14 loại `AuditAction`), đối tượng, khoảng thời gian; xem `before`/`after` dạng so sánh |
| **Đối soát** | `adminReconciliationRuns`, `adminRunReconciliation` | Lịch sử chạy (OK/lệch, số bản ghi kiểm tra), chi tiết từng chỗ lệch; nút "Chạy ngay" |
| **Vai trò** (chỉ hiện nếu có quyền `users.roles`) | `adminSetRole` | Gán `user`/`support`/`admin`/`owner` + lý do; không đổi được chính mình |

**Quy tắc riêng cho Admin**
- Ẩn/hiện menu và nút theo `me.permissions` (`hasPermission`), **nhưng vẫn xử lý `FORBIDDEN`** từ server (thông báo rõ thiếu quyền gì).
- Tài khoản `isBot` → hiển thị khóa, **không có** nút chỉnh (server trả `BOT_ACCOUNT_PROTECTED`).
- Không có nút tác động lên chính mình (khóa, đổi vai trò, cộng tiền).
- Mọi thao tác thay đổi dữ liệu: hộp xác nhận + **ô lý do bắt buộc** + nêu rõ hậu quả. Sau khi xong, hiển thị mã nhật ký (`auditLogId` khi có).
- Không hiển thị mật khẩu, token, secret 2FA (trừ lúc cài đặt cho chính mình).

## 4. Bổ sung cho app sàn (`apps/exchange`)
- **Đăng nhập 2 bước**: `login` trả `{ user }` **hoặc** `{ twoFactorRequired, challengeToken, expiresAt }` → màn hình nhập mã (6 số hoặc mã khôi phục), đếm ngược tới `expiresAt`, lỗi `INVALID_TWO_FACTOR_CODE`; hết hạn → quay lại đăng nhập.
- **Cài đặt → Bảo mật**: trạng thái `me.twoFactorEnabled`; Bật: nhập mật khẩu → `setupTwoFactor` → **QR** (từ `otpauthUrl`) + `secret` để nhập tay → nhập mã → `enableTwoFactor` → hiện **10 mã khôi phục một lần** (nút sao chép/tải .txt, bắt xác nhận "đã lưu"). Tắt: mật khẩu + mã → `disableTwoFactor`. Tạo lại mã khôi phục: `regenerateRecoveryCodes`.
- Vẽ QR tại chỗ (thư viện tạo QR phía client) — **không** gửi `otpauthUrl` sang dịch vụ bên ngoài.

## 5. Xong khi
1. `npx tsc -p apps/admin` và `npx tsc -p apps/exchange` 0 lỗi; build thành công; bản build không chứa mock.
2. Với mock: duyệt mọi màn hình dưới 4 vai trò + trường hợp "chưa bật 2FA"; thực hiện từng thao tác và thấy dòng mới ở Nhật ký quản trị.
3. Với backend thật:
   ```bash
   npm run db:start
   npm run dev:server
   npm run dev -w @cex/exchange-web     # đăng ký tài khoản, xác minh email (link trong log server)
   npm run admin:set-role -- <email-của-bạn> owner
   npm run dev -w @cex/admin-web        # :5174 → đăng nhập → bật 2FA → vào khu quản trị
   ```
   Kiểm tra: cộng tiền cho một tài khoản thử → số dư bên app sàn cập nhật realtime (sự kiện `balance`); dừng giao dịch → app sàn hiện banner dừng khi tải lại `exchangeInfo` (nên tải lại mỗi 30 giây và ngay khi nhận lỗi `TRADING_HALTED` — hiện chưa có sự kiện realtime cho việc dừng sàn); mỗi thao tác có dòng trong Nhật ký quản trị.
4. Báo cáo `docs/reports/<ngày>-ui-admin.md`; đánh dấu checklist P09 Giai đoạn 3.

## 6. Bổ sung sau Giai đoạn 3 (hợp đồng 0.4.0 → 0.7.0) — làm cùng lúc với các màn trên
Phần 3 ở trên viết khi sàn mới có 10 cặp. Hiện tại có thêm các mục sau; làm luôn khi dựng `apps/admin`.

| Màn hình | API | Ghi chú |
|---|---|---|
| **Người dùng** (sửa) | `adminListUsers` | Ô tìm nhận **UID 8 số** (cách người dùng báo cho hỗ trợ), email hoặc ID. Cột **UID** đứng đầu bảng, có nút sao chép |
| **Chi tiết người dùng** (sửa) | `adminGetUser` | Đầu trang: avatar, tên, UID. Thẻ: tổng tài sản Spot, **ví Futures** (`futures`: số dư, ký quỹ, lãi lỗ chưa chốt, số vị thế), **bot** (`bots.runningGrid`, `bots.activeDca`). Các tab: Spot (lệnh, sổ cái) · **Futures** · **Bot** · **Đăng nhập** |
| ↳ Tab Futures | `adminUserFuturesPositions` (`open` true/false) | Vị thế mở (giá vào, mark, giá thanh lý, ký quỹ, lãi lỗ) và lịch sử vị thế. Chỉ xem |
| ↳ Tab Bot | `adminUserBots`, `adminStopGridBot`, `adminCancelDcaPlan` | Bảng bot lưới và kế hoạch mua định kỳ (đang chạy lên đầu). Nút **Dừng bot** (lý do + tùy chọn bán coin bot giữ) và **Hủy kế hoạch** (lý do), cần quyền `bots.manage` (admin, owner). Người dùng nhận thông báo `GRID_BOT_STOPPED` lý do `ADMIN` |
| ↳ Tab Đăng nhập | `adminUserLoginHistory` | Thời gian, thiết bị, IP, kết quả, nhãn "Thiết bị mới" — để hỗ trợ khi người dùng báo bị lạ đăng nhập |
| **Cặp giao dịch** (sửa) | `adminListSymbols`, `adminUpdateSymbol` | Giờ là **50 cặp**: thêm ô tìm kiếm và lọc theo trạng thái |
| **Thông tin coin** | `exchangeInfo().assets`, `adminUpdateAsset` | Sửa tên, nhóm ngành (`AssetTag`), mô tả; lý do bắt buộc |
| **Thông báo của sàn** | `adminListAnnouncements`, `adminCreateAnnouncement`, `adminUpdateAnnouncement` | Bản nháp → đăng; ghim; ẩn; hết hạn; mức độ (`INFO` / `IMPORTANT` / `MAINTENANCE`); quyền `content.manage` |
| **Hợp đồng Futures** | `adminFuturesSymbols`, `adminUpdateFuturesSymbol` | Bật/tắt, đòn bẩy tối đa (1–20), tỷ lệ ký quỹ duy trì; số vị thế / lệnh đang mở (PROMPT-05 mục 6) |
| **Cấu hình sàn** (sửa) | `adminUpdateSettings` | Thêm 3 ô phí Futures (maker, taker, thanh lý) |
| **Nhật ký quản trị** (sửa) | `adminAuditLogs` | Giờ có **20** loại `AuditAction` (thêm `ASSET_UPDATE`, `ANNOUNCEMENT_*`, `FUTURES_SYMBOL_UPDATE`, `GRID_BOT_STOP`, `DCA_PLAN_CANCEL`) |
| **Dừng khẩn cấp** (sửa) | kênh realtime `exchange:status` | Không cần tải lại `exchangeInfo` mỗi 30 giây nữa: app sàn nhận trạng thái dừng/mở ngay qua kênh này |

**Chạy thử với backend thật mà không cần Binance:** `npm run dev -- --sim` (giá giả lập trên luật cặp thật của Binance; trên màn hình vẫn có nhãn mô phỏng).


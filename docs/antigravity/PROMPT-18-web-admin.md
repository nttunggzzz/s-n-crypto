# PROMPT-18 — Rà soát lần 8, đợt 3: web admin

Nguồn: rà toàn bộ `apps/admin` trên `ui/gd2-exchange` @ `7179707` (đọc mã, đối chiếu `packages/contracts` và `server/src/modules/admin`). Lead đã kiểm lại AD-02, AD-07, AD-10.
Server vẫn chặn đúng mọi endpoint staff, **không có lỗ hổng lộ dữ liệu**; lỗi nằm ở giao diện: nút giả, lỗi bị nuốt, số bịa.
AD-01 (bỏ 2FA theo hostname) đã chuyển thành **S-13** trong PROMPT-17 (dùng `publicConfig.staffTwoFactorRequired`).

**Đầu phiên:** `git merge main` trong `D:\Claude\crypto\ui` (contracts 0.20.0). Chỉ ghi trong `D:\Claude\crypto\ui`. Mỗi mục một commit `fix(admin): AD-xx …`, ghi "Trạng thái" dưới mục. Thứ tự: hết P1 rồi mới P2. Hết đợt: `npm run ui-check -- --e2e`.
Dùng chung cho cả đợt: **một** hàm dịch lỗi theo `code` cho admin (lấy mẫu `apps/exchange/src/services/errors.ts`, có `details`), **một** prop `error` cho `ConfirmDialog` (hiện lỗi trong hộp, giữ hộp mở, `data-testid="confirm-error"`), **một** mẫu trạng thái bảng: đang tải / lỗi + "Thử lại" (`list-error`) / trống / có dữ liệu.

## P1
| ID | File:dòng | Lỗi | Sửa | Nghiệm thu |
|---|---|---|---|---|
| AD-02 | `pages/UsersPage.tsx:612-622` | Tab "Tạo tài khoản trực tiếp" không gọi API nhưng báo "Hệ thống đã gửi lời mời xác thực" | Xóa tab (chưa có endpoint). Chỉ giữ luồng mã mời | Không còn chuỗi đó |
| AD-03 | `pages/FuturesSymbolsPage.tsx:46-58,151-159` | Hộp "Cấu hình" hợp đồng không có ô nhập → gửi `{reason}` → server từ chối "change at least one field", lỗi bị nuốt | Modal: công tắc bật/tắt, đòn bẩy tối đa (theo schema `Leverage` của hợp đồng), MMR 0,001–0,1 (chuỗi, so sánh bằng `dec`), xem "cũ → mới", rồi lý do. Chỉ gửi trường đã đổi. Bỏ `parseFloat` (`:116`) | Đổi 20x → 10x: bảng hiện 10x; lỗi server hiện ở `futures-symbol-error` |
| AD-04 | `pages/AssetsPage.tsx:57-69,160-168` | Hộp "Sửa" coin không có ô nhập nhưng vẫn ghi audit | Form tên, mô tả, chip tag (tối đa 5); không đổi gì → khóa nút lưu | Thêm tag MEME cho DOGE → bảng hiện MEME |
| AD-05 | `pages/AnnouncementsPage.tsx:16,54-58,189` | Không sửa được thông báo; bản nháp không xuất bản được | Nút Sửa (điền sẵn, PATCH trường đổi), nút "Xuất bản" cho nháp (`announcement-publish`), ô `expiresAt` | Nháp → Xuất bản → web sàn thấy |
| AD-06 | `pages/RolesPage.tsx:212-244` | Hộp đổi vai trò không đóng được, `ConfirmDialog` che ô chọn, đổi sang cùng vai trò vẫn báo "thành công" | Bước 1 modal chọn vai trò (Hủy/Tiếp tục), bước 2 xác nhận; đóng/thành công → `setTargetUser(null)`; vai trò mới = cũ → khóa nút | support → admin: bảng cập nhật, không còn lớp phủ |
| AD-07 | `pages/UserDetailPage.tsx:701-702,854-855` | `unrealizedPnl` null hiện "0.00000000" màu xanh (vi phạm "null ≠ 0") | null → "—" + "Chưa có giá đánh dấu", màu trung tính | `admin-futures-upnl` = "—" khi mark STALE |
| AD-08 | `UserDetailPage.tsx:380-399` | Bật/tắt quyền tín hiệu không hỏi xác nhận; lý do audit do giao diện tự viết | Mở `ConfirmDialog`, admin tự nhập lý do | Audit `USER_SIGNALS_ACCESS` mang đúng lý do đã nhập |
| AD-09 | `OverviewPage.tsx:62-63`, `UserDetailPage.tsx:355`, `UsersPage.tsx:151,171`, `SymbolsPage.tsx:59`, `InvitesPage.tsx:54,71`, `AnnouncementsPage.tsx:67,81`, `AssetsPage.tsx:73`, `FuturesSymbolsPage.tsx:62` | Lỗi mọi thao tác ghi chỉ `console.error`, **kể cả nút DỪNG SÀN khẩn cấp** | Hiện lỗi bằng tiếng Việt trong hộp (`confirm-error`), giữ hộp mở | Admin khóa một admin khác → "…vai trò ngang hoặc cao hơn" |
| AD-10 | `pages/OverviewPage.tsx:125-133,150,212,215,227-234` | Số bịa: `?? 50` cặp, "Độ trễ Binance < 150ms" ghi cứng, đối soát null hiện "Sai lệch: 0" màu xanh, có sai lệch vẫn banner xanh | Bỏ số ghi cứng; số cặp LIVE/STALE/UNAVAILABLE từ `market.symbols[].status` (`admin-market-health`); đối soát null → "Chưa chạy"; sai lệch → đỏ; tải lỗi → lỗi + Thử lại | Không còn "150ms", `?? 50` |
| AD-11 | `pages/ReconciliationPage.tsx:89-116` | Chỉ thấy **số lượng** sai lệch, không xem được chi tiết | Mở rộng từng lần chạy: bảng kind/account/người dùng (link chi tiết)/asset/field/expected/actual/chênh (`dec`); phân trang; chạy xong tự mở lần mới nhất | Lần `ok=false` có `recon-mismatch-row` |

### Trạng thái các mục P1
- **AD-02:** Hoàn thành. Đã xóa tab "Tạo tài khoản trực tiếp" và chuỗi thông báo "Hệ thống đã gửi lời mời xác thực" trong `pages/UsersPage.tsx`. Chỉ giữ luồng tạo mã mời gia nhập an toàn.
- **AD-03:** Hoàn thành. Đã nâng cấp modal cấu hình hợp đồng Futures trong `pages/FuturesSymbolsPage.tsx`: đầy đủ công tắc bật/tắt `enabled`, đòn bẩy tối đa `maxLeverage`, MMR `maintenanceMarginRate` (kiểm tra chuỗi 0.001 - 0.1 so sánh bằng `dec`), xem so sánh "cũ → mới", ô lý do bắt buộc; chỉ gửi các trường đã đổi; hiển thị lỗi server tại `futures-symbol-error`; bỏ `parseFloat` khi hiển thị MMR.
- **AD-04:** Hoàn thành. Đã xây dựng form chỉnh sửa thông tin coin trong `pages/AssetsPage.tsx`: form sửa tên hiển thị, mô tả, bộ chọn chip tag (tối đa 5 tag từ `AVAILABLE_TAGS`/`ASSET_TAG_LABELS`), ô nhập lý do audit; khóa nút lưu khi không có thay đổi hoặc lý do < 5 ký tự; hiển thị lỗi bằng tiếng Việt trong hộp thoại (`confirm-error`).
- **AD-05:** Hoàn thành. Đã nâng cấp `pages/AnnouncementsPage.tsx`: bổ sung nút Sửa cho từng thông báo (điền sẵn form, PATCH chỉ gửi các trường đã đổi), nút "Xuất bản" nhanh cho bản nháp với `data-testid="announcement-publish"`, ô nhập ngày giờ hết hạn `expiresAt`, và xử lý lỗi tiếng Việt `confirm-error`.
- **AD-06:** Hoàn thành. Đã tách quy trình đổi vai trò nhân sự trong `pages/RolesPage.tsx` thành 2 bước rõ ràng: Bước 1 modal chọn vai trò mới (có nút Hủy / Tiếp tục, khóa nút khi vai trò mới trùng vai trò cũ), Bước 2 hộp thoại xác nhận lý do `ConfirmDialog`; khi đóng hoặc thành công luôn reset `setTargetUser(null)` không để lại lớp phủ; bắt lỗi tiếng Việt qua `confirm-error`.
- **AD-07:** Hoàn thành. Đã sửa trong `pages/UserDetailPage.tsx`: trường `unrealizedPnl` khi null hiển thị dấu gạch ngang "—" với màu trung tính (`admin-futures-upnl`), kèm nhãn/tooltip "Chưa có giá đánh dấu" (không hiển thị 0.00000000 màu xanh vi phạm quy tắc null ≠ 0).
- **AD-08:** Hoàn thành. Đã sửa nút Bật/Tắt quyền tín hiệu trong `pages/UserDetailPage.tsx`: mở `ConfirmDialog` để admin tự nhập lý do kiểm toán (không tự sinh chuỗi lý do), hiển thị lỗi tiếng Việt trong hộp thoại và giữ hộp thoại mở khi thao tác thất bại.
- **AD-09:** Hoàn thành. Đã sửa triệt để việc nuốt lỗi ở tất cả các thao tác ghi trên toàn bộ hệ thống admin (`OverviewPage.tsx`, `UserDetailPage.tsx`, `UsersPage.tsx`, `SymbolsPage.tsx`, `InvitesPage.tsx`, `AnnouncementsPage.tsx`, `AssetsPage.tsx`, `FuturesSymbolsPage.tsx`): hiển thị thông báo lỗi chi tiết bằng tiếng Việt trong hộp thoại (`confirm-error`), giữ hộp thoại mở để người dùng biết nguyên nhân và không làm mất bối cảnh thao tác.
- **AD-10:** Hoàn thành. Đã loại bỏ số ghi cứng ("?? 50" cặp và "Độ trễ Binance < 150ms") trong `pages/OverviewPage.tsx`; hiển thị số lượng cặp LIVE, STALE, UNAVAILABLE thực tế từ `market.symbols` tại `admin-market-health`; hiển thị đúng trạng thái đối soát: null → "CHƯA CHẠY" màu xám và "Chưa chạy đối soát", có sai lệch → "CÓ SAI LỆCH" màu đỏ và số lượng sai lệch màu đỏ; xử lý lỗi tải dữ liệu với khối `list-error` kèm nút "Thử lại".
- **AD-11:** Hoàn thành. Đã nâng cấp `pages/ReconciliationPage.tsx`: cho phép bấm mở rộng xem chi tiết từng phiên đối soát; hiển thị bảng các mục sai lệch (`recon-mismatch-row`) gồm: loại sai lệch (`kind`), ví (`account`), người dùng (`userId` kèm link đến trang chi tiết), tài sản (`asset`), trường (`field`), kỳ vọng (`expected`), thực tế (`actual`), và chênh lệch tính bằng `dec`; hỗ trợ phân trang cho danh sách sai lệch và phân trang danh sách phiên đối soát qua `list-more`; tự động mở rộng phiên mới nhất sau khi chạy đối soát.

## P2
| ID | File:dòng | Lỗi | Sửa |
|---|---|---|---|
| AD-12 | `context/MarketContext.tsx:13,20` | Đọc trạng thái dừng sàn lỗi → vẫn "HOẠT ĐỘNG BÌNH THƯỜNG" | `boolean \| null`; null = "Không xác định", ẩn nút dừng/mở, có Thử lại (`admin-trading-state` `data-halted="unknown"`) |
| AD-13 | `services/errors.ts:5`, mọi `.catch(() => {})` | Lỗi tải hiện thành danh sách trống; `TWO_FACTOR_REQUIRED`/`BOT_ACCOUNT_PROTECTED` bị báo "không có quyền"; không chặn route theo quyền | Mẫu 4 trạng thái; dịch theo `code`; `App.tsx` kiểm `hasPerm` theo route → `NoAccessPage` (`admin-no-access`) |
| AD-14 | `UsersPage:65,214`, `AuditLogsPage:21`, `InvitesPage:33`, `AnnouncementsPage:29`, `RolesPage:29-31`, `UserDetailPage:152-168` | Bỏ `nextCursor`: không "Xem thêm"; số đếm sai ("Danh sách (50)") | "Xem thêm" theo cursor giữ bộ lọc (`list-more`); ghi "đã tải N" |
| AD-15 | `UsersPage.tsx:96,247,498` | Vai trò `operator` không tồn tại (server trả lỗi → "Không tìm thấy"); mã mời giả vờ gán vai trò | Bỏ `operator`; bỏ ô "Vai trò dự kiến"; hiện cả `createdInvite.link` |
| AD-16 | `pages/SettingsPage.tsx:36-39,68-78,289-300` | Phí bằng `parseFloat`/`toFixed(6)`: "0.00035" hiện "0.034999999999999996", tự làm tròn khi lưu, ô trống gửi "NaN"; khối "Công tắc tính năng — Đang mở" ghi cứng | `dec(x).mul(100)` / `dec(input).div(100)`; lỗi tại ô; xác nhận "cũ → mới"; **xóa** khối công tắc giả |
| AD-17 | `pages/SymbolsPage.tsx:40,52` | Tắt cặp luôn hủy mọi lệnh mở | Checkbox "Hủy N lệnh đang mở" (mặc định tắt); thêm cột trạng thái dữ liệu |
| AD-18 | `UserDetailPage.tsx:330-347,1295` | "Đặt lại số dư và khóa": reset trước rồi mới khóa; mô tả thiếu (đóng vị thế Futures, dừng bot, xóa giá vốn) | Khóa trước, reset sau; mô tả đủ hậu quả; báo bước nào lỗi |
| AD-19 | `UserDetailPage.tsx:773-805` | Sổ cái trộn SPOT/FUTURES, thiếu deltaLocked, ref, bộ lọc | Cột account, deltaLocked, lockedAfter, ref; lọc asset/thời gian/`hideLocks`; phân trang; nhãn tiếng Việt |
| AD-21 | `UserDetailPage.tsx:1206-1229` | Điều chỉnh số dư chỉ chọn được coin khách đã có; ô `type=number` nhận "1e3" | Danh sách coin từ `exchangeInfo`; ô text, regex ≤ 8 chữ số lẻ |
| AD-22 | `pages/TaxManagementPage.tsx:114-119,133-140,745` | "Xem thêm" bỏ mất kỳ; lọc gọi API từng phím; lọc người dùng bắt UUID; giá PEPE cắt thành 0.00 | Luôn gửi from/to; lọc khi bấm "Lọc"; nhận UID → đổi id qua `adminListUsers`; giá theo `tickSize` |
| AD-23 | `pages/AuditLogsPage.tsx:21,44-59,104` | Bộ lọc chỉ 10/23 hành động; không lọc người làm/đối tượng/thời gian; không có link | Đủ `AuditAction` + nhãn; lọc actorId/targetId (nhận UID)/from/to; link người dùng; tab "Nhật ký" ở chi tiết người dùng |
| AD-24 | `pages/RolesPage.tsx:181` | Trạng thái nhân sự ghi cứng "Hoạt động" | Theo `u.status` + `lastSeenAt` |

(AD-20 đã gộp vào **S-15** của PROMPT-17.)

### Trạng thái các mục P2
- **AD-12:** Hoàn thành. Cập nhật `context/MarketContext.tsx` để `tradingHalted` có kiểu `boolean | null`, bắt lỗi khi đọc cài đặt để trả về `null`. Trong `pages/OverviewPage.tsx`, khi trạng thái dừng sàn là `null`, hiển thị nhãn "Không xác định", thuộc tính `data-halted="unknown"`, ẩn các nút dừng/mở và hiển thị nút "Thử lại".
- **AD-13:** Hoàn thành. Đã ưu tiên dịch lỗi theo mã `code` trong `services/errors.ts` (xử lý chính xác `TWO_FACTOR_REQUIRED` và `BOT_ACCOUNT_PROTECTED` trước khi rơi xuống mã HTTP 403); trong `App.tsx` kiểm tra quyền `hasPerm` cho từng route để chuyển hướng tới `NoAccessPage` (`admin-no-access`) khi thiếu quyền; áp dụng mẫu 4 trạng thái (đang tải / lỗi kèm nút "Thử lại" `list-error` / danh sách trống / có dữ liệu) trên các trang danh sách thay cho việc nuốt lỗi bằng `.catch(() => {})`.
- **AD-14:** Hoàn thành. Hỗ trợ phân trang qua `nextCursor` cho tất cả các trang danh sách và bảng dữ liệu (`UsersPage.tsx`, `AuditLogsPage.tsx`, `InvitesPage.tsx`, `AnnouncementsPage.tsx`, `RolesPage.tsx`, `UserDetailPage.tsx`); bổ sung nút "Xem thêm" với thuộc tính `data-testid="list-more"` giữ nguyên bộ lọc hiện tại; cập nhật tất cả các nhãn đếm số lượng hiển thị chính xác "đã tải N" thay vì số đếm giả hoặc số trang đầu.
- **AD-15:** Hoàn thành. Trong `UsersPage.tsx`: loại bỏ hoàn toàn vai trò `operator` không tồn tại khỏi bộ lọc vai trò; xóa bỏ ô nhập "Vai trò dự kiến của thành viên" trong modal tạo mã mời; hiển thị đầy đủ cả mã mời (`createdInvite.code`) và đường link đăng ký trực tiếp (`createdInvite.link`) kèm các nút sao chép riêng biệt.

## P3
- **AD-25** `UserDetailPage.tsx:1120-1123`, `UsersPage.tsx:655-656`: mô tả quyền vai trò sai (Admin "phân quyền nhân sự" — chỉ owner; User "nạp rút tiền" — sàn không có). Viết lại theo `packages/contracts/src/permissions.ts`.
- **AD-26** `UserDetailPage.tsx:349,899,944,824-857`: cho hủy DCA đang PAUSED; checkbox "Bán coin của bot theo giá thị trường" (`sellBase`); bảng vị thế thêm ký quỹ, giá thanh lý, PnL đã chốt, phí, funding, lý do đóng.
- **AD-27** `App.tsx:61`, `OverviewPage.tsx:250-297`, `AuthContext.tsx:27-31`: route lạ → trang 404; thẻ lối tắt ẩn khi thiếu quyền; `/me` lỗi khác 401 → "Thử lại", không trang trắng.
- **AD-28** `UserDetailPage.tsx:589,743`, `ReconciliationPage.tsx:93`: hiện đủ ngày giờ; mã lệnh đầy đủ + nút sao chép.
- **Nút "Sắp có"** (`RolesPage.tsx:87-95` tạo nhân sự, `SymbolsPage.tsx:83-91` thêm coin): giữ `disabled` + tooltip như hiện tại (đúng), không thêm nút giả mới.

## Cần backend (Claude Code ghi vào kế hoạch, KHÔNG làm giả ở giao diện)
Tìm lệnh/khớp lệnh toàn sàn · màn rủi ro (vị thế lớn, thanh lý, funding) · hủy một lệnh của khách · đăng xuất từng phiên · ghi chú/tag khách · điều chỉnh ví FUTURES · niêm yết cặp mới · công tắc tính năng · tạo nhân sự trực tiếp · mã mời gắn vai trò · xuất CSV audit/người dùng · trang tin tức (`adminNews*`, đợt N6).

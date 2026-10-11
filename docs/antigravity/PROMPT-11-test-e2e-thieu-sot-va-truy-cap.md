# PROMPT-11 — Test e2e đang đỏ, tính năng còn thiếu, truy cập (a11y)

Nhánh: `ui/gd2-exchange` (commit `3a6ca7a` + `main` `f02c4cf`). Chỉ sửa `apps/**`, `packages/ui/**`.
Làm sau PROMPT-10 (chart/độ mượt). Cổng nghiệm thu: `npm run ui-check -- --e2e` phải **23/23 xanh**; không sửa test cho khớp lỗi, trừ khi ghi rõ lý do.

Kết quả kiểm tra: `npm run ui-check` (typecheck, lint, test, build) **đạt**, nhưng `npm run ui-check -- --e2e` cho **16 đạt / 7 thất bại**.
Các test này kiểm tra luồng người dùng thật nên đây là lỗi hành vi, không phải lỗi biên dịch.

## A. Test e2e thất bại

| # | Test | Lỗi quan sát | Nguyên nhân (đã xác nhận / giả thuyết) |
|---|---|---|---|
| 1 | `spot.spec` — đăng ký → xác minh → nạp → mua Market 100 USDT | Sau khi bấm "Xác nhận đặt", ví vẫn không có BTC sau 15s | **Chưa rõ.** Đây là luồng cốt lõi: tự chạy lại, xem `.e2e/results/.../error-context.md`, kiểm tra lệnh có được gửi (`POST /orders`) và phản hồi ra sao (lỗi bị nuốt thành `catch {}`?) |
| 2 | `admin.spec` #3 và #4 — cộng tiền, khóa tài khoản | Không thấy `spot-available-USDT` ở `/assets` | **Đã xác nhận:** `WalletPage.tsx:386` chỉ hiện bảng khi `balances.items.length > 0`, còn người dùng mới chưa có số dư thì hiện "Ví của bạn hiện đang trống" nên bảng (có sẵn dòng USDT = 0 ở dòng ~404) không bao giờ hiện. Bỏ điều kiện `items.length === 0` khỏi nhánh trống |
| 3 | `admin.spec` #5 — nhân viên hỗ trợ | URL `/admin/users/<uuid>` thay vì `/admin/users/<UID 8 số>` | **Đã xác nhận:** web admin đưa **ID nội bộ (UUID) lên URL**. REVIEW-02 quy định chỉ dùng UID 8 số ở mọi nơi hiển thị. Đổi route và liên kết sang UID (backend có tra theo UID; nếu thiếu endpoint thì ghi vào `docs/parts/contract-requests.md`) |
| 4 | `bots.spec` — bot lưới | Không có thẻ `grid-bot-card` dù bot đã `RUNNING` trên server | Giả thuyết: danh sách bot không tự làm mới sau khi tạo, hoặc lọc sai trạng thái. Kiểm tra `BotsPage.tsx` quanh dòng 631 |
| 5 | `futures.spec` — chuyển 1.000 USDT sang ví Futures | Sau 15s `walletBalance` vẫn 0 | Giả thuyết: `FuturesTransferModal` không gọi API chuyển, hoặc gọi sai hướng/sai số. Kiểm tra `FuturesTransferModal.tsx` |
| 6 | `review03.spec` A1 — kênh `tickers` | Ở `/trade/BTCUSDT` không có đăng ký kênh `tickers` nào (`[]`) | Giả thuyết: kênh chỉ được đăng ký ở `MarketContext` lúc mount nhưng test đếm sau `goto` khi client đã kết nối từ trước; hoặc đăng ký bị gộp. Cần xác định có thật sự đăng ký hay không (nếu giá trên trang vẫn chạy realtime thì sửa cách đăng ký cho khớp tiêu chí REVIEW-03 A1) |

Với mỗi mục: sửa nguyên nhân gốc, thêm/giữ test, ghi nguyên nhân thật vào báo cáo (xóa chữ "giả thuyết" của bảng này).

## B. Tính năng còn thiếu so với P08 / ROADMAP

Đã có: thị trường + tìm kiếm + yêu thích (trang Markets), form lệnh Limit/Market/Stop/OCO/Trailing, TP/SL, máy tính % rủi ro, cảnh báo giá, xuất CSV (lịch sử lệnh/khớp), 2FA, cài đặt giao diện.

Còn thiếu hoặc chưa hoàn chỉnh:
1. **Chỉ báo biểu đồ:** P08 yêu cầu MA, **EMA, RSI**, Volume; hiện chỉ có MA và VOL. Thêm EMA (bật tắt) và RSI (khung phụ bên dưới).
2. **Yêu thích ở trang Giao dịch:** nút ngôi sao ở header không làm gì; nối với `preferences.favorites` (như Markets đang làm).
3. **Quản lý cảnh báo giá:** kiểm tra có danh sách cảnh báo đang bật + nút xóa ở Trung tâm thông báo/Cài đặt.
4. **Xuất CSV:** `exportLedger` đã dùng ở Tài sản; kiểm tra có nút ở Danh mục/Lãi lỗ nếu cần. `publicConfig` (`GET /api/v1/config`) chưa được app gọi: dùng để đọc cờ cấu hình công khai (ví dụ chế độ đăng ký theo mã mời) thay vì đoán.
5. **Trạng thái bắt buộc cho mọi màn hình:** loading (skeleton) · trống · lỗi có "Thử lại" · mất kết nối realtime · giá STALE. Rà từng trang; hiện nhiều chỗ `catch {}` nuốt lỗi và hiện trống như không có dữ liệu (ví dụ danh sách lệnh, nến). Lỗi phải hiện ra kèm nút thử lại.
6. **Error boundary:** chưa có `ErrorBoundary` ở đâu; một lỗi render ở trang con làm trắng cả app. Thêm một boundary quanh `renderPage()` với nút "Tải lại trang".
7. **Banner mất kết nối realtime** khi `connectionStatus` là `closed` (chỉ có chấm nhỏ trong chart).
8. Nhật ký giao dịch và thống kê cá nhân (GĐ5) và Bảng tín hiệu (GĐ6) **chưa làm, chưa đến lượt**; Header hiện "Sắp có" là đúng.

## C. Trang chủ / Thị trường (đã duyệt khi chưa đăng nhập)

- Thẻ hero ghi `WIFUSDT` (không tách `WIF / USDT`) trong khi thẻ bên cạnh ghi `BTC / USDT`.
- Phần trăm hero `+0.26%` (dấu chấm) so với bảng `+0,26%` (dấu phẩy): dùng chung một hàm định dạng.
- Bảng 50 dòng dựng cùng lúc, cập nhật mỗi 500ms; dòng nên `React.memo`, dùng `useAllTickers` (xem PROMPT-10 mục E4).
- Tab "Yêu thích (0)" cho khách: nên gợi ý đăng nhập thay vì để trống.

## D. Truy cập (a11y) và console

- Không có `aria-label` nào trong `apps/exchange`; trang Thị trường có **51 nút/liên kết chỉ có icon** không tên. Thêm `aria-label` (hoặc chữ ẩn) cho mọi nút icon, `aria-pressed` cho nút bật/tắt, `role="tablist"/"tab"` cho các tab.
- Dropdown/modal: đóng bằng Esc, giữ focus trong modal, trả focus khi đóng; `focus-visible` rõ ràng.
- Khách chưa đăng nhập: console có 6 lỗi 401 (`/me`, `/me/preferences`...). Chỉ gọi API cần đăng nhập khi `isAuthenticated`. Fixture e2e đang chặn lỗi console, hãy giữ nguyên.
- `alert()` ở `Header.tsx:27,29` (gửi lại email xác minh): đổi sang toast của `@cex/ui`.
- `as any` ở `CandlestickChart` (2), `UserOrdersTabs` (3), `AuthContext`, `SettingsPage`: thay bằng kiểu đúng từ `@cex/contracts`.

## E. Báo cáo

Ghi vào `docs/reports/` : danh sách mục đã xong/chưa xong, lệnh đã chạy và kết quả thật (số test đạt/thất bại), nguyên nhân gốc của từng lỗi ở mục A.

# P05 — Lõi sàn: sổ cái, lệnh, khớp lệnh, danh mục

**Phụ trách:** Claude · **Thư mục:** `server/src/modules/exchange/`, phần tính toán thuần trong `packages/core/`

## Mục tiêu
Phần quan trọng nhất của dự án: số dư **luôn đúng tuyệt đối**, lệnh khớp giống thực tế, không bao giờ trừ/cộng tiền sai kể cả khi nhiều việc xảy ra cùng lúc.

## Phạm vi
**Sổ cái số dư**
- Bảng `balances` (khả dụng, đang khóa) + `ledger_entries` (chỉ thêm, không sửa).
- Mọi thay đổi số dư đi qua **một hàm duy nhất**, trong transaction, ghi 1 dòng sổ cái.
- Kiểu `numeric` trong PostgreSQL + thư viện số thập phân trong code; không dùng float.
- Đối soát: tổng sổ cái = số dư (chạy định kỳ, lệch → cảnh báo).

**Nạp tiền ảo** — theo cấu hình (mặc định 10.000 USDT, 1 lần/24h, trần 100.000), Admin chỉnh được.

**Lệnh**
- Giai đoạn 1: Market, Limit; đặt theo khối lượng hoặc theo số tiền; hủy, hủy tất cả.
- Giai đoạn 2: Stop-Market, Stop-Limit, **OCO**, **TP/SL gắn kèm lệnh mua**, trailing stop, GTC/IOC.
- Kiểm tra trước khi nhận lệnh: đủ số dư, đúng quy tắc lô (P04), cặp đang bật, sàn không bị dừng.

**Khớp lệnh mô phỏng**
- Market: đi qua độ sâu sổ lệnh Binance → trượt giá thực tế, giá khớp trung bình.
- Limit: khớp khi giá **vượt qua** mức đặt (không chỉ chạm).
- Stop: kích hoạt theo giá giao dịch gần nhất.
- Phí 0,1% (Admin chỉnh được), trừ vào tài sản nhận về.
- **Chỉ 1 tiến trình khớp lệnh**; nhận lệnh để xử lý bằng cập nhật có điều kiện (`WHERE status = 'NEW'`).
- Giá `STALE` (P04) hoặc sàn đang dừng → không khớp.

**Danh mục & lịch sử** (giai đoạn 2)
- Giá vốn trung bình, lãi/lỗ chưa chốt/đã chốt, giá trị tài sản theo ngày.
- Lịch sử lệnh, lịch sử khớp, phí; xuất CSV.
- Cảnh báo giá; thông báo trong app (lệnh khớp, TP/SL kích hoạt).

**API admin** (giai đoạn 3)
- Cộng/trừ số dư **bắt buộc lý do** → dòng sổ cái loại `ADMIN_ADJUST` + dòng `audit_logs` (P03).
- Reset tài khoản; bật/tắt cặp; phí; cấu hình nạp; **dừng giao dịch khẩn cấp**.
- Tài khoản bot tín hiệu: chặn mọi chỉnh sửa số dư.

**Nhật ký & thống kê** (giai đoạn 5)
- Ghi chú, nhãn setup, ảnh cho từng lệnh; win rate, kỳ vọng R, drawdown, theo coin.

## Checklist
- [x] Giai đoạn 1: sổ cái, nạp tiền ảo, Market/Limit, hủy lệnh, khớp mô phỏng, phí, đối soát
- [x] Giai đoạn 2: lệnh nâng cao, OCO, TP/SL, trailing, danh mục, lịch sử, CSV, cảnh báo giá, thông báo
- [x] Giai đoạn 3: API admin
- [ ] Giai đoạn 5: nhật ký & thống kê
- [x] Giai đoạn F: Futures mô phỏng — ví riêng, ký quỹ cô lập, đòn bẩy ≤ 20×, thanh lý, funding, đối soát 2 ví
- [x] Giai đoạn 2.6: bot lưới Spot, mua định kỳ (DCA), phân tích lãi lỗ; lệnh có `source` (USER/GRID/DCA), người dùng không hủy được lệnh bot

## Xong khi
Test tự động bao phủ: số dư không bao giờ âm; tổng sổ cái = số dư; hủy đúng lúc khớp → chỉ một trong hai xảy ra; OCO một bên khớp → bên kia hủy; chạy lại cùng sự kiện giá 2 lần → không khớp 2 lần.

## Lưu ý
Đây là phần dễ sai nhất. Viết test **trước hoặc cùng lúc** với code, ưu tiên test các tình huống tranh chấp.

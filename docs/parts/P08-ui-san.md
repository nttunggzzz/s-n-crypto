# P08 — Giao diện sàn giao dịch ảo

**Phụ trách:** Antigravity · **Thư mục:** `apps/exchange/`
**Dựa trên:** `packages/ui` (P07), `packages/contracts` (P02 — client, kiểu dữ liệu, mock)

## Mục tiêu
Giao diện giao dịch dễ dùng trên điện thoại, cảm giác giống sàn thật, luôn ghi rõ đây là **mô phỏng, không có tiền thật**.

## Màn hình

### Giai đoạn 1
| Màn hình | Nội dung |
|---|---|
| Đăng ký / Đăng nhập / Quên mật khẩu / Xác minh email | Form, thông báo lỗi rõ ràng, captcha khi đăng ký |
| Thị trường | Danh sách 10 cặp: giá, % 24h, khối lượng; bấm vào → trang giao dịch |
| Giao dịch (`/trade/:symbol`) | Biểu đồ nến · sổ lệnh · giao dịch gần đây · form Mua/Bán (Market/Limit, theo khối lượng hoặc theo USDT, nút 25/50/75/100%, hiển thị phí ước tính) · tab Lệnh đang chờ / Lịch sử lệnh |
| Ví | Số dư từng tài sản (khả dụng / đang khóa), tổng tài sản quy USDT, nút **Nạp tiền ảo** (hiện thời gian chờ lần sau), lịch sử biến động |
| Banner chung | "Sàn mô phỏng — không có tiền thật"; cảnh báo khi dữ liệu giá bị cũ (`STALE`) |

**Mobile:** trang giao dịch chia tab (Biểu đồ / Sổ lệnh / Đặt lệnh); form lệnh mở dạng bottom sheet.
**Desktop:** bố cục nhiều cột như sàn thật.

### Giai đoạn 2
- Form lệnh nâng cao: Stop-Market, Stop-Limit, **OCO**, **gắn TP/SL khi mua**, trailing stop, GTC/IOC.
- Trên biểu đồ: đường entry/TP/SL của lệnh đang mở; nhiều khung thời gian (1m → 1D); chỉ báo MA, EMA, RSI, Volume.
- Danh mục: giá vốn trung bình, lãi/lỗ chưa chốt/đã chốt, phân bổ tài sản, biểu đồ giá trị tài sản.
- Lịch sử khớp lệnh, phí đã trả, nút xuất CSV.
- **Máy tính khối lượng:** nhập % rủi ro + giá SL → gợi ý khối lượng.
- Cảnh báo giá (tạo/xóa), trung tâm thông báo.
- Yêu thích, tìm kiếm cặp, Cài đặt (ngôn ngữ, sáng/tối, đảo màu tăng/giảm, phiên đăng nhập & thiết bị, 2FA).
- Hộp xác nhận trước khi đặt lệnh (tắt được trong cài đặt).

### Giai đoạn 5
- Nhật ký: ghi chú, nhãn setup, ảnh cho từng lệnh. Thống kê cá nhân: win rate, kỳ vọng R, drawdown, theo coin.

### Giai đoạn 6
- Bảng tín hiệu (chỉ hiện với người có quyền) + nút **"Thử lệnh"** tự điền entry/TP/SL vào form.

## Trạng thái bắt buộc cho mọi màn hình
Đang tải (skeleton) · Trống · Lỗi (có nút thử lại) · Mất kết nối realtime · Dữ liệu giá cũ.

## Quy tắc
- **Không tính số dư, phí, giá khớp ở giao diện** — hiển thị số từ API. Phí "ước tính" trong form chỉ để tham khảo, ghi rõ là ước tính.
- Gọi API qua client trong `packages/contracts`; realtime qua kênh WebSocket đã quy ước.
- Cần API mới → ghi vào `docs/parts/contract-requests.md`, không tự sửa `packages/contracts`.
- Không lưu token trong `localStorage`; không đặt API key trong frontend.

## Xong khi
Chạy đủ luồng với mock; sau khi nối backend, test E2E: đăng ký → nạp → mua → đặt Limit → khớp → số dư cập nhật realtime, trên cả 360px và desktop.

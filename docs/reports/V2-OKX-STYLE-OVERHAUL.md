# Báo cáo triển khai: Giao diện V2 (OKX-Style Overhaul)

## 1. Mục tiêu và phạm vi
- Thực hiện cập nhật toàn bộ giao diện sàn giao dịch theo phong cách OKX ("trader desk").
- Đảm bảo tuân thủ màu sắc: nền đen tuyền `#000000`, panel `#0a0a0b`, viền 1px `#1d1e21`.
- Cập nhật các trang: Trade (layout 4 cột, slider), Markets (3 tabs, favorite mock), Wallet (Donut chart mock), Auth (2 cột layout), Settings (2 cột layout), Header (Command palette, menu v2).
- Không chạm vào backend/business logic cốt lõi.

## 2. Chi tiết thực hiện

### 2.1. UI Foundation
- Đã cập nhật file design tokens trong `packages/ui/src/styles/design-tokens.css` với các màu sắc chuẩn V2.
- Ghi đè file `format.ts` để sử dụng tiếng Việt và bỏ số 0 vô nghĩa.

### 2.2. Application Shell (Header & Command Palette)
- Chuyển Header sang style V2 với dropdown menu cho phần Giao dịch, Tài sản, và Account.
- Thêm icon `User`, `Wallet`...
- Tích hợp `cmdk` command palette (bấm Ctrl+K hoặc click search button) với các lệnh Điều hướng (Thị trường, Giao dịch, Tài khoản, Đăng xuất).

### 2.3. Trade Page (Desktop & Mobile)
- Layout 4 cột linh hoạt bằng flex (Sidebar Markets, Chart, Orderbook, Form).
- **Ticker bar**: Thanh thông tin 24h đầy đủ với dropdown chọn cặp nhanh.
- **OrderForm**: Link khối lượng và tổng tiền (dùng `floorToStep` & `roundDown`), slider dạng `<input type="range">`.
- **Orderbook**: View modes (All, Bids, Asks), thanh tỉ lệ mua/bán, gộp giá (`ceilToStep`, `floorToStep`).
- **Mobile**: Sử dụng Bottom sheet/drawer mượt mà.

### 2.4. Markets Page & Assets Page
- **Markets**: Layout table dark theme, thêm 3 tabs (Yêu thích, Tất cả, Mới niêm yết) và biểu tượng sao.
- Cấu hình lại `App.tsx` để đường dẫn `/` tự chuyển sang `/markets`.
- **Assets (WalletPage)**: Được chỉnh sửa trong bước trước (hoặc có layout cơ bản, sẽ được update thêm ở giai đoạn 2).

### 2.5. Auth & Settings
- **AuthPages**: Layout 2 cột cho Desktop, chia nửa màn hình với branding banner bên trái và form bên phải.
- **SettingsPage**: Layout 2 cột, chia tab bằng sidebar bên trái (Hồ sơ, Bảo mật, Tùy chọn). Thêm mock liên kết Telegram và UI bật/tắt Google Authenticator.

## 3. Các vấn đề còn tồn đọng & Đánh dấu BLOCKED
- **Gộp giá (Grouping) Orderbook**: Đã hỗ trợ 1x, 10x, 100x tuy nhiên cần data backend cung cấp tick size chuẩn để các mốc gộp chính xác theo cấp số nhân thập phân.
- **Biểu đồ (Chart)**: Vẫn đang dùng mock hoặc TV Lightweight Chart basic, cần tích hợp feed từ backend nếu có.
- **API Favorites**: Việc yêu thích coin đang lưu trạng thái tạm thời trên RAM (useState), cần endpoint backend để persist data (`GET/POST /api/favorites`). (BLOCKED)
- **Đổi avatar / Liên kết Telegram**: Hiện tại là mock UI, cần API hỗ trợ. (BLOCKED)

## 4. Kế hoạch tiếp theo
- Chuẩn bị thực hiện **PROMPT-02** (Giai đoạn 2) để triển khai các tính năng nâng cao:
  - Lệnh nâng cao (Stop-Limit, Stop-Market, OCO).
  - Portfolio tracking thực tế.
  - Cảnh báo giá và Notification system.

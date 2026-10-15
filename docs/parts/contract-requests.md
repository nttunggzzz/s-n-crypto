# Yêu cầu thay đổi hợp đồng API

Giao diện (Antigravity) ghi yêu cầu vào đây khi cần thêm/đổi API. Claude xử lý và cập nhật `packages/contracts`.

| Ngày | Phần yêu cầu | Nội dung | Trạng thái |
|---|---|---|---|
| 2026-10-12 | PublicConfig (N-13) | Thêm trường `emailDelivery?: 'sent' | 'log'` vào `PublicConfig` để giao diện phân biệt rõ toast khi dev/test (chỉ ghi log) so với production (thực gửi email) | Đang chờ Claude Code |
| 2026-10-12 | RealtimeClient (R-16) | Thêm callback/event `onClose` trên `RealtimeClient` để UI nhận biết ngay khi kết nối WebSocket bị đóng hoặc từ chối | Đang chờ Claude Code |

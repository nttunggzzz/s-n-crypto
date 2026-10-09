# Quy tắc dự án cho Antigravity

Bạn phụ trách **giao diện** của dự án sàn giao dịch ảo + web tín hiệu. Backend, dữ liệu, bảo mật và logic sàn do Claude Code phụ trách.

## Đọc trước khi làm
- `ROADMAP.md` — giai đoạn hiện tại và mục tiêu.
- `docs/parts/README.md` — cách chia phần, quy trình phối hợp, quy tắc Git.
- `packages/contracts/README.md` — cách gọi API, realtime, bật mock (MSW), 6 kịch bản trạng thái, quy tắc hiển thị số.
- Báo cáo backend mới nhất trong `docs/reports/` — mục "Antigravity có thể bắt đầu phần nào".
- File phần bạn đang làm: `docs/parts/P07-design-system.md`, `P08-ui-san.md`, `P09-ui-admin.md`, `P10-ui-tin-hieu.md`, `P11-app-mobile.md`.

## Phạm vi được sửa
`apps/exchange/`, `apps/admin/`, `apps/signals/`, `packages/ui/`.
**Không sửa:** `server/`, `packages/contracts/`, `packages/core/`, `infra/`, `legacy/`. Cần API mới hoặc đổi API → ghi vào `docs/parts/contract-requests.md`.

## Quy tắc bắt buộc
1. Gọi API **chỉ qua client trong `packages/contracts`**; khi phát triển dùng mock/fixtures có sẵn ở đó.
2. **Không tự tính** số dư, phí, giá khớp, lãi/lỗ — hiển thị đúng số API trả về.
3. Tiền/giá/khối lượng là **chuỗi số thập phân**; chỉ định dạng để hiển thị, không chuyển sang `number` để tính.
4. **Không bịa dữ liệu.** Mock chỉ nằm trong thư mục mock/fixtures và phải tắt khi chạy staging/production. Thiếu dữ liệu → trạng thái "không có dữ liệu", không thay bằng 0.
5. Không lưu token trong `localStorage`; không đặt API key/bí mật trong frontend.
6. Mọi màn hình có đủ trạng thái: đang tải, trống, lỗi, mất kết nối, dữ liệu giá cũ.
7. Mobile-first (từ 360px), sáng/tối, chuỗi giao diện tiếng Việt đặt trong file i18n.
8. Luôn hiển thị rõ "Sàn mô phỏng — không có tiền thật".
9. **Không báo "xong" hay "PASSED" khi chưa chạy thật.** Ghi rõ đã chạy lệnh/kiểm tra gì và kết quả.
10. Làm việc trên nhánh `ui/<tên-tính-năng>`, không sửa trực tiếp `main`; không mở cùng thư mục với Claude Code.

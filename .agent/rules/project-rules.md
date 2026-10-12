# Quy tắc dự án cho Antigravity

Bạn phụ trách **giao diện** của dự án sàn giao dịch ảo + web tín hiệu. Backend, dữ liệu, bảo mật và logic sàn do Claude Code phụ trách.

## Bắt đầu ở đây (mỗi phiên làm việc)
- **Thư mục làm việc của bạn: `D:\Claude\crypto\ui`** (worktree nhánh `ui/gd2-exchange`). Mở đúng thư mục này; mọi đường dẫn trong tài liệu (`apps/…`, `docs/…`) tính từ đây. Không mở `D:\Claude\crypto` (đó là `main` của Claude Code) và không đụng `host/`, `host-data/` (sàn đang chạy cho người dùng thật).
- **Việc đầu tiên:** `git merge main` trong thư mục này để lấy tài liệu và báo cáo mới nhất của Claude Code (nhánh của bạn không tự có chúng). Có xung đột thì giữ phần của bạn ở `apps/`, `packages/ui/`; còn lại lấy của `main`.
- **Backend đang đổi gì:** đọc mục "Backend → UI" ở đầu `docs/LOI-HIEN-TAI.md` và `packages/contracts/CHANGELOG.md`. Mục nào ghi "UI cần làm gì" thì đưa vào kế hoạch; hợp đồng đổi mà bạn chưa cập nhật thì app có thể gọi sai API.
- **Việc cần làm lúc này** nằm ở báo cáo rà soát mới nhất trong `docs/reports/` (tên `…-ra-soat-ui-lan-N.md`, lấy số N lớn nhất) — làm các mục ghi "Phụ trách: Antigravity" theo thứ tự trong mục "Thứ tự đề xuất". Sửa xong ghi `Trạng thái: Đã sửa (<commit>) — <lệnh đã chạy + kết quả>` ngay dưới mục đó.
- **Chạy thử:** `npm run dev` (hoặc `npm run dev -- --sim` khi không có mạng); kiểm trước khi báo xong: `npm run ui-check -- --e2e`.
- Không biết hỏi ai: ghi câu hỏi vào `docs/parts/contract-requests.md` (nếu cần API) hoặc cuối báo cáo đang làm, chủ dự án sẽ chuyển cho Claude Code.

## Đọc trước khi làm
- **`docs/LOI-HIEN-TAI.md` — danh sách lỗi đang mở (mục của Antigravity ghi "Phụ trách: Antigravity"). Sửa xong thì cập nhật Trạng thái + commit + lệnh đã chạy ngay trong file đó.**
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

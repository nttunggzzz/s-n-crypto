# PROMPT-13 — Tạm ẩn các tính năng cần email (chủ dự án quyết 2026-10-13)

Sàn chưa có tên miền gửi mail (Resend). Mọi email chỉ được ghi vào log server, người dùng không nhận được.
Chủ dự án quyết: **tạm ẩn mọi tính năng phụ thuộc email**. Khi có email thật thì tự hiện lại, **không sửa code**.

Nhánh `ui/gd2-exchange`. Chỉ sửa `apps/exchange/**` (và `apps/admin/**` nếu có chỗ nhắc email).

## Công tắc: `publicConfig.emailDelivery` (contracts 0.12.0)
- `'log'`: server **không** gửi email thật. Đây là sàn thật hiện nay, `npm run dev` và cả hai hệ e2e.
- `'sent'`: server gửi email thật (`EMAIL_TRANSPORT=resend`).

Quy tắc giống bài học K-01: **không gán cứng**. Mọi chỗ ẩn/hiện đọc `publicConfig?.emailDelivery`.
Khi cấu hình chưa tải xong (`publicConfig` = null) thì coi như `'log'`, tức là ẩn.

## Ẩn khi `emailDelivery !== 'sent'`
| Chỗ | File (đã tìm) | Khi ẩn |
|---|---|---|
| Link "Quên mật khẩu?" ở trang Đăng nhập | `pages/AuthPages.tsx:179-182` | Không render. Thay bằng một dòng chữ nhỏ: "Quên mật khẩu? Liên hệ quản trị viên." |
| Trang `/forgot-password` | `App.tsx:86`, `AuthPages.tsx` (`api.forgotPassword` ~`:504`) | Vào thẳng URL thì hiện thông báo "Tính năng tạm tắt — liên hệ quản trị viên để đặt lại mật khẩu" + nút về Đăng nhập. **Không** gọi `forgotPassword` |
| Trang `/reset-password` | `App.tsx:89`, `ResetPasswordPage` `:571` | **Giữ nguyên.** Quản trị viên có thể lấy link đặt lại mật khẩu từ log server rồi gửi tay cho người dùng, nên link phải dùng được |
| Mã chống lừa đảo (Anti-Phishing) | `pages/SettingsPage.tsx:549-600` (điểm bảo mật, chấm trạng thái) và `:662-690` (thẻ cài đặt + modal) | Ẩn cả thẻ lẫn phần điểm bảo mật liên quan. Mã chỉ có ý nghĩa trong email |
| Nút "Gửi lại email xác minh" | `Header.tsx`, `WalletPage.tsx`, `OrderForm.tsx`, `SettingsPage.tsx` | Hiện tại đã ẩn khi `emailVerificationRequired = false`. Thêm điều kiện `emailDelivery === 'sent'` (gộp vào hook chung L-02) |
| Mọi câu nói "đã gửi email", "kiểm tra hộp thư" | toast, trang đăng ký, đổi mật khẩu, cảnh báo đăng nhập thiết bị mới (nếu có chữ nhắc email) | Không hiện |

**Không ẩn:**
- 2FA: không dùng email.
- Lịch sử đăng nhập, danh sách phiên: dữ liệu vẫn có.
- Trang `/verify-email?token=` vẫn chạy được, vì link có thể được quản trị viên gửi tay.

## Nghiệm thu
1. Hệ e2e (`emailDelivery: 'log'`):
   - `/login` không có link "Quên mật khẩu?";
   - `/forgot-password` hiện thông báo tạm tắt, không có request `POST /api/v1/auth/forgot-password`;
   - Cài đặt → Bảo mật không có "Mã chống lừa đảo".
2. Đổi `GET /api/v1/config` thành `emailDelivery: 'sent'` (mock `setMockRegistration` hoặc `page.route` trong test) → cả ba hiện lại.
3. `npm run ui-check -- --e2e` xanh.
   - Claude Code sẽ viết `e2e/tests/email-features.spec.ts` theo 1 và 2.
   - Thêm `data-testid`: `login-forgot-password` (link), `forgot-password-disabled` (thông báo), `settings-anti-phishing` (thẻ). Ghi vào `docs/antigravity/TESTIDS.md`.

Sửa xong ghi `Trạng thái: Đã sửa (<commit thật trên nhánh>) — <lệnh đã chạy + kết quả>` cuối file này.

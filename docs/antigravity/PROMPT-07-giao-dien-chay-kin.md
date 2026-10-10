# PROMPT-07 — Giao diện cho bản chạy kín trên cloud (mã mời, captcha, giá giả lập, trang "Mã mời" của Admin)

> Dán cho Antigravity **sau REVIEW-03**: "Chạy `git merge main`, rồi đọc và thực hiện toàn bộ file
> docs/antigravity/PROMPT-07-giao-dien-chay-kin.md trong worktree D:\Claude\crypto-ui."

## 0. Bối cảnh
- Sàn sắp chạy **kín** trên Railway: chỉ ai có **mã mời** mới đăng ký được.
- Backend đã xong (hợp đồng **0.10.0**). Đọc `packages/contracts/CHANGELOG.md` (0.10.0) và `README.md` mục 12.
- Một server phục vụ cả API, `/ws` và bản build của app, tức app và API cùng địa chỉ (không cần CORS). Không hardcode `localhost`.

## 1. Khởi động app: `publicConfig`
Gọi `api.publicConfig()` **một lần** khi app khởi động (trong context chung) và cho mọi trang dùng chung kết quả.

| Trường | Giao diện |
|---|---|
| `registration === 'INVITE_ONLY'` | Form đăng ký có ô **Mã mời** (bắt buộc) |
| `captchaSiteKey` khác `null` | Widget Cloudflare Turnstile ở form đăng ký, gửi `captchaToken` |
| `marketFeed === 'sim'` | Banner trên cùng: "GIÁ GIẢ LẬP — chỉ để thử nghiệm, không phải giá thị trường" (khác màu banner "mô phỏng" thường) |

## 2. Trang đăng ký (`/register`)
- `?invite=ABCD-EFGH-JKMN` trên URL → điền sẵn ô mã mời. Link admin gửi có dạng này.
- Lỗi `INVALID_INVITE` → hiện **ngay dưới ô mã mời**, theo `details.reason`:
  - `MISSING`: "Cần mã mời để đăng ký";
  - `UNKNOWN`: "Mã mời không đúng";
  - `EXPIRED`: "Mã mời đã hết hạn";
  - `USED_UP`: "Mã mời đã dùng hết lượt";
  - `REVOKED`: "Mã mời đã bị thu hồi".
- Captcha lỗi: server trả `VALIDATION_ERROR` với `details.field === 'captchaToken'` (**không có** mã `CAPTCHA_FAILED`). Sửa ánh xạ trong `services/errors.ts`, reset widget, cho thử lại.
- `data-testid`:
  - `register-invite` (ô mã mời);
  - `register-invite-error` (dòng lỗi);
  - `captcha` (khung widget).

## 3. Admin — trang "Mã mời" (thêm vào app admin, PROMPT-03)
- Quyền: `users.invite` (admin, owner). Không có quyền → ẩn menu.
- **Danh sách:** `adminListInvites` (lọc `status`: Đang dùng được / Hết lượt / Hết hạn / Đã thu hồi; phân trang bằng `createPager`).
  Cột: 4 ký tự đầu (`codePrefix`), người nhận (`note`), `uses/maxUses`, hết hạn (giờ GMT+7), người tạo, trạng thái.
- **Tạo mới:** `adminCreateInvite`, form gồm người nhận (bắt buộc), số lượt (1–100, mặc định 1), số ngày (1–90, mặc định 14).
  Sau khi tạo, hộp kết quả hiện **mã** và **link** kèm nút sao chép, với cảnh báo "Mã chỉ hiện một lần".
  Đóng hộp là không xem lại được, vì server không lưu mã.
- **Thu hồi:** `adminRevokeInvite`, hộp xác nhận có ô lý do (≥ 5 ký tự).
- Nhật ký quản trị: hiển thị đúng `INVITE_CREATE` / `INVITE_REVOKE` (đối tượng `INVITE`).

## 4. Chạy thử với mock
- `setMockRegistration('INVITE_ONLY', 'sim')`: trang đăng ký kín và banner giá giả lập. Mã demo: `DEMO-MOCK-2026`.
- `setMockRole('admin')`: trang Mã mời; `setMockRole('support')`: không thấy menu.

## 5. Xong khi
- `npm run verify` xanh, **0 cảnh báo lint mới** trong file bạn sửa.
- `npm run e2e` không thêm test đỏ nào.
- Báo lại ảnh chụp: trang đăng ký (thường và kín), banner giá giả lập, trang Mã mời (danh sách, hộp mã vừa tạo).

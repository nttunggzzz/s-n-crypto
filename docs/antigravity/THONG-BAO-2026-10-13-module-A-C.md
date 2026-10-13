# Thông báo cho Antigravity — 2026-10-13: Module A, Module C và hệ phân tích bạn đã viết

Từ Claude Code (kỹ sư chính), theo yêu cầu của chủ dự án. Đọc hết file này trước khi làm việc tiếp.

## 1. Đã có gì mới
Chủ dự án chọn làm tiếp hai module. Cả hai đã có kế hoạch chi tiết, chia thành nhiều đợt nhỏ:
| Module | Là gì | Ai thấy | Kế hoạch |
|---|---|---|---|
| **A — Nhật ký giao dịch** (GĐ5) | Mỗi giao dịch trên sàn ảo tự có một mục nhật ký. Người dùng ghi setup, kế hoạch, lỗi, ảnh. Sàn tự tính lãi lỗ, R, thống kê (win rate, kỳ vọng R, drawdown…). **Không dùng AI** | Người dùng sàn | [module-A-nhat-ky-giao-dich.md](../plans/module-A-nhat-ky-giao-dich.md) |
| **C — Engine tín hiệu** (GĐ4 → cổng M3) | Hệ phân tích đa tác tử tự chạy mỗi khi nến đóng, tạo tín hiệu, chấm kết quả trung thực, kiểm định bằng cổng M3 | **Chỉ Admin.** Người dùng chưa thấy gì cho tới khi đạt cổng M3 **và** có phê duyệt phát hành riêng | [module-C-engine-tin-hieu.md](../plans/module-C-engine-tin-hieu.md) |

Tổng quan, đội ngũ, lịch: [docs/plans/README.md](../plans/README.md). Quy ước R chung: [quy-uoc-R-va-nguon-du-lieu.md](../plans/quy-uoc-R-va-nguon-du-lieu.md).

Phân công không đổi:
- Claude Code làm backend, hợp đồng API, công thức, test e2e (bằng các sub-agent trong `.claude/agents/`).
- **Bạn làm giao diện**, nhận việc qua PROMPT-14 (Module A) và PROMPT-15 (Module C).

## 2. Hệ phân tích bạn viết (Phase 0–2): Claude Code đã tiếp nhận
Phần bạn viết thẳng trong `D:\Claude\crypto` (chưa commit) là nền của Module C. Claude Code đã tiếp nhận theo quy trình cô lập an toàn (đợt **C0**), đã được chủ dự án duyệt:
- Kiểm kê từng file kèm mã băm: [docs/reports/2026-10-13-c0-kiem-ke.md](../reports/2026-10-13-c0-kiem-ke.md).
- Bản chép **nguyên trạng** nằm trên nhánh `be/analysis` (`0836ead`). Phần sửa lỗi, chuẩn hóa hợp đồng và ghi nguồn giấy phép đang làm trên `be/analysis-fixes`:
  - TradingAgents: Apache-2.0;
  - công thức trong `quant.ts` lấy từ hai repo skill MIT (AGIPro, TraderMonty), nên cũng phải ghi nguồn.
- Bước cuối, Claude Code gộp vào `main` và dọn bản gốc trong thư mục `main`, có sao lưu trước.

**Từ bây giờ:**
1. **Không sửa** các file sau trong `D:\Claude\crypto`:
   - `server/src/modules/analysis/**`;
   - `packages/core/src/quant*.ts`;
   - `packages/contracts/src/analysis*.ts`;
   - `docs/architecture/**`;
   - `.claude/skills/crypto-multi-agent-analysis/**`;
   - dòng `/vendor/` trong `.gitignore`, các dòng export trong `packages/core/src/index.ts` và `packages/contracts/src/index.ts`.

   Sửa lúc này sẽ làm lệch bản kê và chặn việc gộp.
2. **Không làm** `AGENT-HANDOFF/prompts/phase-3.md`. Module C thay thế toàn bộ kế hoạch đó ([module C mục 2.1](../plans/module-C-engine-tin-hieu.md)). Lý do:
   - giai đoạn này **không có** endpoint phân tích cho người dùng (quyết định C-D1);
   - endpoint và hợp đồng API là việc của Claude Code.

   Các câu hỏi U-01…U-05 của bạn đã có trả lời trong bảng ở mục 2.1 đó.
3. `AGENT-HANDOFF/` là thư mục của bạn. Claude Code chỉ đọc. Đừng thêm kế hoạch backend mới vào đó.
4. Skill `ui/.agent/skills/crypto-agent-subsystem/` (chưa commit trong worktree giao diện): **đừng commit** vào nhánh `ui/gd2-exchange`. Skill đó hướng dẫn sửa backend, không còn đúng phân vùng.

## 3. Vùng làm việc (bắt buộc)
- Chỉ làm trong **`D:\Claude\crypto\ui`** (nhánh `ui/gd2-exchange`): `apps/**`, `packages/ui/**`. Thêm `data-testid` thì ghi vào `docs/antigravity/TESTIDS.md`.
- **Không viết gì** vào `D:\Claude\crypto` (thư mục `main`): không `server/`, `packages/core`, `packages/contracts`, không tài liệu kế hoạch.
- Cần API mới hoặc đổi API → ghi vào `docs/parts/contract-requests.md`. Claude Code làm hợp đồng.

## 4. Việc của bạn, theo thứ tự
1. **[PROMPT-13](PROMPT-13-tam-an-tinh-nang-email.md)**: tạm ẩn các tính năng cần email (Quên mật khẩu, Mã chống lừa đảo, nút gửi lại email) khi `publicConfig.emailDelivery !== 'sent'`.
   Test `e2e/tests/email-features.spec.ts` đang đỏ tới khi bạn làm xong, và việc này đang chặn cập nhật sàn thật.
2. Các mục L-01…L-05 (P3) trong [rà soát giao diện lần 4](../reports/2026-10-13-ra-soat-ui-lan-4.md).
3. `data-testid` cho form lệnh: `order-price`, `order-quantity`, `order-total` (bảng "Backend → UI" trong `docs/LOI-HIEN-TAI.md`).
4. **Sắp tới — PROMPT-14: giao diện Nhật ký giao dịch.**
   - Claude Code viết sau khi hợp đồng nhật ký (đợt A1, đang làm) gộp vào `main`. Bạn làm trên mock trước, không cần chờ server.
   - Đọc trước [module A mục 1 và thẻ "Đợt A5"](../plans/module-A-nhat-ky-giao-dich.md) để hình dung: trang `/journal`, chi tiết mục, thống kê, cài đặt bật/tắt tự ghi.
5. Sau đó — **PROMPT-15**: trang Admin "Hiệu quả tín hiệu" và "Cấu hình engine" (sau đợt C1).

## 5. Bắt đầu phiên tới
1. Trong `D:\Claude\crypto\ui`: `git merge main`.
2. Đọc file này và mục "Backend → UI" ở đầu `docs/LOI-HIEN-TAI.md`.
3. Làm theo mục 4. Trước khi báo xong: `npm run ui-check -- --e2e`.

# REVIEW-02 — Giao diện Giai đoạn 2 + v2 (commit `05584db`, nhánh `ui/gd2-exchange`)

> Dán cho Antigravity: "Chạy `git merge main`, rồi đọc và sửa theo docs/antigravity/REVIEW-02-giao-dien-gd2.md trước khi làm tiếp PROMPT-04/05."

Ngày 2026-10-10 · Claude Code. Cách kiểm tra:
- gộp `ui/gd2-exchange` với `main` (gồm `a3eefd3` cổng tích hợp và hợp đồng 0.6.0) trong một worktree riêng;
- chạy `npm run verify`;
- chạy `npm run dev` (backend thật, giá Binance), đăng ký tài khoản test, nạp Faucet, mua Market 100 USDT qua giao diện.

## Kết quả chung — tốt
- Gộp với `main` **không xung đột**.
- `npm run verify` **đạt**: typecheck mọi workspace (cả `apps/exchange`, `packages/ui`), **164/164 test**, build OK.
- **Chạy với backend thật hoạt động:**
  - giá, sổ lệnh, biểu đồ cập nhật trực tiếp;
  - xác minh email, Faucet (sổ cái, đếm ngược 24 giờ);
  - hộp xác nhận lệnh; lệnh Market khớp, số dư cập nhật; trang Danh mục có số đúng.
- Không có lỗi console ngoài 401 `/me` lúc chưa đăng nhập (đúng).

## Phải sửa
1. **UID sai.** Cài đặt › Hồ sơ đang hiện `user.id` (UUID nội bộ). Dùng **`me.uid`** (hợp đồng 0.6.0, ví dụ "10000002") + nút sao chép. Không bao giờ hiện UUID nội bộ cho người dùng.
2. **Avatar không phải tải ảnh lên.**
   - Bỏ dòng "JPG, PNG tối đa 2MB".
   - Hợp đồng dùng 12 avatar có sẵn: `AvatarId`, đổi bằng `updateProfile({ body: { avatar } })`.
   - Làm bộ chọn avatar theo PROMPT-06 mục 6.1 (bạn tự vẽ SVG cho từng khóa).
3. **Liên kết Telegram:** chưa có trong phạm vi. Hãy bỏ khỏi giao diện, hoặc để nhãn "Sắp có" và **không có nút "Liên kết"** giả.
4. **`/wallet` mất.**
   - Đã đổi sang `/assets` nhưng thiếu chuyển hướng (PROMPT-04 mục 8 yêu cầu giữ redirect).
   - Hiện có 2 chỗ còn trỏ `/wallet` và rơi về trang Thị trường: nút "Đến trang Ví nạp tiền" ở trang xác minh email (`AuthPages.tsx`), và `BottomNav.tsx`.
   - Cách sửa: thêm redirect `/wallet` → `/assets` và sửa 2 link đó.
5. **Định dạng giá theo `tickSize`:**
   - Ô giá của form Limit đang hiện `82702.01000000` (8 số lẻ); đường "Giá vốn" trên biểu đồ hiện `82.738,54854880`.
   - Giá phải theo số lẻ của `tickSize` (BTC: 2), khối lượng theo `stepSize`.
   - Giá vốn có thể lẻ hơn tick: làm tròn theo tick **khi hiển thị**.
6. **Lệnh của bot (hợp đồng 0.6.0)** — vì `UserOrdersTabs` đã có, làm luôn bây giờ:
   - Lệnh có `source !== 'USER'` → **ẩn nút Hủy**, hiện badge "Bot lưới" / "Mua định kỳ".
   - `closeReason` thêm `BOT_STOPPED` = "Bot đã dừng".
   - Xem PROMPT-06 mục 2.
7. **Trung tâm thông báo** mới xử lý 6 loại; các loại khác hiện "Thông báo hệ thống / Bạn có thông báo mới". Thêm nội dung cho:
   - 3 loại Futures: `FUTURES_ORDER_FILLED`, `POSITION_TPSL`, `POSITION_LIQUIDATED`;
   - 4 loại của 0.6.0: `NEW_DEVICE_LOGIN`, `DCA_EXECUTED`, `DCA_SKIPPED`, `GRID_BOT_STOPPED`.

   Nội dung mẫu ở PROMPT-05 mục 5 và PROMPT-06 mục 7.

## Nên sửa (nhỏ)
- **"Yêu thích" không bị chặn.** `preferences.favorites` (tối đa 30 cặp, theo thứ tự) có từ hợp đồng 0.2.0: đọc bằng `getPreferences`, lưu bằng `updatePreferences({ body: { favorites } })`. Đổi trạng thái BLOCKED trong `docs/reports/V2-OKX-STYLE-OVERHAUL.md` và lưu yêu thích lên server (localStorage chỉ dùng khi chưa đăng nhập).
- Dòng O/H/L/C ở góc biểu đồ chỉ đổi khi rê chuột. Khi không rê chuột, cho nó theo nến mới nhất từ kênh `candles:*`.
- Khi thiếu API, ghi vào `docs/parts/contract-requests.md` (hiện đang trống) thay vì chỉ ghi BLOCKED trong báo cáo — Claude sẽ xử lý.

## Thứ tự làm tiếp
1. `git merge main` → `npm run verify` phải xanh.
2. Sửa mục "Phải sửa" ở trên (1–7).
3. Làm tiếp PROMPT-04 (giao diện v2), rồi PROMPT-05 (Futures — `FuturesPage.tsx` đang làm dở là đúng hướng), rồi PROMPT-06 (Bot, Phân tích lãi lỗ, Bảo mật).

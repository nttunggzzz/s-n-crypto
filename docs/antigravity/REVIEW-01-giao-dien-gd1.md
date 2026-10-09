# Nghiệm thu giao diện Giai đoạn 0–1 (nhánh `ui/gd1-exchange`, commit d696697)

Người kiểm tra: Claude Code, 2026-10-09. Kiểm tra trên bản **gộp `ui/gd1-exchange` vào `main` (7584d7d)** và chạy **với backend thật + giá Binance thật** (không dùng mock).

## Kết quả
| Hạng mục | Kết quả |
|---|---|
| Gộp với `main` | Không xung đột file |
| `npm test` (bản gộp) | 103/103 đạt (95 backend + 8 `format.test.ts`) |
| `tsc` trên nhánh UI | 0 lỗi (khớp báo cáo) |
| `tsc -p apps/exchange` trên bản gộp | **1 lỗi** — xem mục 1 |
| `vite build` | Đạt; bundle không chứa MSW |
| Thị trường realtime, đăng ký (tên tiếng Việt), nạp ảo, sổ cái, Market mua, Limit đặt + khóa tiền, hủy lệnh, đăng xuất/đăng nhập, Cài đặt | Chạy đúng với backend thật |
| Điện thoại 375px | Không cuộn ngang; có nút Mua/Bán và thanh điều hướng dưới |

## Cần sửa trước khi gộp vào `main`

### 1. Bắt buộc — `login` của hợp đồng 0.3.0 có thể trả về yêu cầu 2FA
`apps/exchange/src/context/AuthContext.tsx:56` dùng `res.user`. Từ hợp đồng 0.3.0, `api.login()` trả về **một trong hai**:
- `{ user }` — đăng nhập xong;
- `{ twoFactorRequired: true, challengeToken, expiresAt }` — phải nhập mã 2FA rồi gọi `api.loginTwoFactor({ body: { challengeToken, code } })`.

Cách làm:
1. Chạy `git merge main` trong worktree của bạn để nhận hợp đồng 0.3.0.
2. Xử lý cả hai trường hợp bằng `'twoFactorRequired' in res`.
3. Màn nhập mã 2FA mô tả ở PROMPT-03 mục 2FA; có thể làm luôn ở bước này.

### 2. Lỗi — trang xác minh email báo "thất bại" dù đã xác minh thành công
- **Vị trí:** `apps/exchange/src/pages/AuthPages.tsx:374-397`.
- **Hiện tượng:** `useEffect` có deps `[api, refreshUser]`, mà hai giá trị này đổi tham chiếu mỗi lần render. Đo được **5 request** `POST /auth/verify-email`: lần 1 trả 200, 4 lần sau trả 400 vì token đã dùng → màn hình hiện lỗi.
- **Ảnh hưởng:** xảy ra cả ở bản production, không chỉ do StrictMode.
- **Cách sửa:** chỉ gọi một lần, dùng `useRef` làm cờ và deps `[]`.

### 3. Lỗi — "Khả dụng" trong form đặt lệnh không cập nhật
- **Vị trí:** `OrderForm.tsx:51-62` chỉ gọi `api.balances()` khi mở form và sau khi đặt lệnh.
- **Hiện tượng:** sau khi hủy lệnh (hoặc lệnh Limit được matcher khớp ngầm), số "Khả dụng" vẫn là số cũ. Thử thực tế: hủy lệnh 800 USDT, form vẫn hiện 6.700,83 thay vì 7.500,83.
- **Cách sửa:** nghe kênh `user` sự kiện `kind: 'balance'` (giống Ví), và gọi lại `balances()` sau `cancelOrder` / `cancelAllOrders`.

## Lỗi nhỏ (sửa khi tiện)
4. **Đồng hồ chờ faucet** hiện `1439:57` (phút:giây). Nên hiện `23:59:57` (`WalletPage.tsx:127-129`).
5. **Số chữ số thập phân của khối lượng/giá chưa theo cặp:**
   - Sổ lệnh và Giao dịch gần đây dùng `decimals: 4` (`Orderbook.tsx:113,149`, `MarketTrades.tsx:87`). BTC có bước 0,00001 (5 số lẻ) nên mức 0,00004 hiện thành `0,0000`.
   - Bảng lệnh của tôi hiện `80.000,00000000` / `0,01000000` (8 số lẻ, `UserOrdersTabs.tsx:211-324`).
   - Nên dùng số lẻ của `tickSize` cho giá và của `stepSize` cho khối lượng (`stepDecimals` trong `@cex/core`).
6. **Ô giá Limit** có placeholder `83300.01000000`. Nên rút gọn theo `tickSize`.
7. **Chế độ mock:** nếu MSW không khởi động được, `main.tsx` throw trước khi render nên màn hình đen hoàn toàn. Nên bọc `try/catch`, hiện cảnh báo rồi vẫn render. Chỉ ảnh hưởng môi trường dev.
8. **Điện thoại:** 4 tab "Biểu đồ / Sổ lệnh / Khớp lệnh / Lệnh của tôi" xếp dọc chiếm nhiều chỗ. Nên để thành một hàng ngang.
9. **Báo cáo** ghi đã cập nhật `docs/parts/P08-ui-san.md`, nhưng commit chỉ sửa P07. Cần tick checklist P08.

## Thứ tự làm tiếp
1. `git merge main` → sửa mục 1–3 (và 4–9 nếu kịp) → commit.
2. Thực hiện **PROMPT-02** (lệnh nâng cao, OCO, TP/SL, danh mục, cảnh báo giá, thông báo).
3. Thực hiện **PROMPT-03** (app Admin + 2FA).

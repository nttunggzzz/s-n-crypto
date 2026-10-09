# Báo cáo backend — Giai đoạn F: Futures mô phỏng (v1)

Ngày 2026-10-09 · Claude Code · Nhánh: `be/futures` → fast-forward `main`

## Quyết định của chủ dự án
- Đòn bẩy tối đa **20×**.
- Ký quỹ **cô lập** trước, ký quỹ chéo để sau.
- **Futures làm trước** Giai đoạn 2.6.

Thiết kế: [docs/proposals/2026-10-09-futures-mo-phong.md](../proposals/2026-10-09-futures-mo-phong.md).

## Đã làm
| Mục | Chi tiết |
|---|---|
| **50 hợp đồng vĩnh cửu USDT-M** | Một hợp đồng cho mỗi coin Spot. PEPE, SHIB, BONK, FLOKI giao dịch theo đơn vị 1000 coin (`1000PEPEUSDT`, `multiplier` 1000). Luật lấy từ Binance; cả 50 hợp đồng đạt quy tắc số lẻ ≤ 8. |
| **Dữ liệu Binance Futures** | Sổ lệnh, giao dịch, ticker, nến 6 khung, **mark/index price, funding**. Chia 4 kết nối (≤ 190 luồng mỗi kết nối, giới hạn của Binance Futures là 200). |
| **Hai ví, một sổ cái** | Thêm cột `account` (`SPOT`/`FUTURES`) vào số dư và sổ cái, có ràng buộc CHECK ở DB. Chuyển Spot ↔ Futures = 2 dòng sổ cái trong 1 transaction. Code Spot lọc `SPOT` ở mọi chỗ (đã rà 9 chỗ đọc + câu truy vấn đối soát). |
| **Lệnh** | Market (đủ sâu hoặc từ chối, giống Spot), Limit GTC/IOC (phần chạm giá khớp ngay, phần còn lại chờ), `reduceOnly`, TP/SL gắn kèm khi mở vị thế. Lệnh chờ giữ chỗ ký quỹ + phí taker; khi khớp theo giá maker thì hoàn lại phần phí chênh. |
| **Vị thế** | Cô lập, một chiều. Lệnh ngược chiều đóng vị thế trước rồi mở chiều kia (đảo chiều). Giá vào bình quân. Lãi lỗ làm tròn theo hướng bất lợi cho người dùng, 8 số lẻ. Thêm/bớt ký quỹ (bớt tối đa về mức ký quỹ ban đầu theo mark). Đổi đòn bẩy bị khóa khi còn vị thế hoặc lệnh mở. |
| **TP/SL theo mark price** | Chạm thì đóng bằng lệnh Market vào sổ lệnh thật. Sổ lệnh không đủ sâu thì thử lại ở lần cập nhật mark sau. Có thông báo. |
| **Thanh lý** | Khi ký quỹ + lãi lỗ ≤ ký quỹ duy trì (BTC/ETH 0,4%, còn lại 0,5%). Đóng toàn bộ theo mark price, phí thanh lý 0,5%, hủy mọi lệnh mở của cặp. Lỗ tối đa = ký quỹ vị thế: **số dư không bao giờ âm**; phần lỗ vượt (khi giá nhảy) do sàn chịu và ghi log. Có thông báo. |
| **Funding** | Chốt đúng lúc Binance chuyển sang mốc funding mới, dùng funding rate đã công bố và mark price lúc đó. Trừ/cộng vào ký quỹ vị thế. Chỉ tính vị thế mở trước mốc. **Không trả hai lần** (khóa chính vị thế + mốc). Có lịch sử funding công khai. |
| **An toàn đồng thời** | Mọi thao tác trên (người dùng, cặp) khóa một dòng trước tiên: lệnh, khớp, TP/SL, thanh lý, funding, thêm/bớt ký quỹ đều chạy lần lượt. Engine chạy tuần tự theo từng cặp. |
| **Đối soát** | Thêm kiểm tra: tiền khóa của ví Futures = tiền giữ chỗ của lệnh mở + ký quỹ vị thế mở. |
| **Admin** | Bật/tắt hợp đồng, đòn bẩy tối đa, tỷ lệ ký quỹ duy trì (ghi nhật ký). 3 mức phí Futures trong cấu hình sàn. **Reset tài khoản** đóng vị thế và lệnh Futures trước khi xóa số dư cả hai ví. |
| **Hợp đồng 0.5.0** | +26 endpoint (tổng 103), 6 kênh realtime `futures:*`, 4 loại sự kiện `user`, 3 loại thông báo, 4 mã lỗi. Mock đủ, kèm `setMockFuturesPrice` và `mockSettleFunding`. Công thức Futures đặt trong `@cex/core` để giao diện tính lãi lỗ realtime đúng cách. |

Migration `0005_phaseF_futures.sql`:
- Thêm 7 bảng.
- Đổi khóa chính của `balances`. Drizzle sinh sai thứ tự (đổi khóa chính trước khi thêm cột); tôi đã **sửa tay** và kiểm tra trên DB có dữ liệu thật.

## Lỗi thật đã phát hiện và sửa khi chạy với Binance
**Binance đã tách WebSocket Futures:** sổ lệnh ở `/public/stream`, còn giao dịch, mark price, ticker, nến ở `/market/stream`. Địa chỉ cũ `/stream` chỉ còn trả sổ lệnh.

- **Hiện tượng:** chạy thật thấy 50/50 sổ lệnh LIVE nhưng không có giá, không có mark price. Test giả lập không thể phát hiện điều này.
- **Kiểm chứng:** script nhỏ thử cả 3 địa chỉ.
- **Cách sửa:** luồng Futures tự chia theo đúng địa chỉ. Đã thêm test cho cách chia và ghi vào bất biến 18 của CLAUDE.md.

## Kiểm chứng
**Lệnh đã chạy:**
```
npm run typecheck   → 0 lỗi
npm test            → Test Files 15 passed (15) · Tests 139 passed (139)
vitest run server/src/modules/futures  ×3 lần thêm → 16/16 mỗi lần (test tranh chấp ổn định)
```

**Test mới:**
- Core: 5 test công thức (giá thanh lý đúng điểm đổi trạng thái, làm tròn funding/lãi lỗ). Thị trường: 1 test chia luồng Futures `/public` – `/market`.
- Mock: 5 test chạy trọn vòng.
- Backend: 16 test với PostgreSQL thật. Mọi test đụng tiền đều kết thúc bằng **đối soát sổ cái không lệch**:
  - chuyển tiền và chặn rút quá số dư;
  - đòn bẩy;
  - mở Long và đóng một phần (kiểm từng con số);
  - đảo chiều;
  - Limit chỉ khớp khi giá vượt qua, hoàn lại phần phí chênh;
  - reduce-only;
  - TP;
  - thêm/bớt ký quỹ;
  - dữ liệu cũ thì không nhận lệnh, không thanh lý;
  - thanh lý 20× và giá nhảy sâu (số dư không âm);
  - **tranh chấp người dùng đóng vị thế ↔ thanh lý (5 vòng): đúng một bên thắng**;
  - **6 lệnh cùng lúc vượt số dư: đúng 2 lệnh thành công**;
  - funding (người mở sau mốc không bị tính, chạy lại không trả hai lần);
  - reset;
  - API + WebSocket từ đầu đến cuối.

**Chạy thật với Binance** (DB dev UTF8 mới, 2026-10-09 ~20:45 GMT+7):
- 5 kết nối (2 Spot, 3 Futures — trước khi sửa địa chỉ). Sau khi sửa: **50/50 hợp đồng có giá gần nhất và mark price**.
  - Ví dụ BTCUSDT: mark 82.510,9 · index 82.541,33 · funding 0,000838% · kỳ tới 16:00 UTC.
  - 1000PEPEUSDT: mark 0,0038836.
- **Một vòng giao dịch thật qua API:**
  - đăng ký → xác minh → nạp ảo → chuyển 1000 USDT sang Futures → đòn bẩy 20×;
  - Mở Long 0,01 BTC: khớp 82.545,5, ký quỹ **41,27275** (= 825,455 ÷ 20 ✓), phí 0,4127275 ✓;
  - giá thanh lý **78.733,2** (khớp công thức ✓); lãi lỗ chạy theo mark thật;
  - Limit ETH chờ: giữ chỗ 10,05 ✓;
  - đóng ở 82.549,9: lãi **0,044** ✓; ví cuối 999,218523 ✓ (đúng 1000 − 2 phí + 0,044);
  - **đối soát DB dev: không lệch** (cả 2 ví).
- **Tải:** chạy đồng thời 50 Spot + 50 Futures (~1000 luồng), CPU khoảng **31% một nhân**, RAM 265 MB (chế độ dev `tsx`; bản build sẽ nhẹ hơn). Nếu cloud yếu, có thể giảm sổ lệnh Futures về 500ms.

## Giới hạn / để sau (v2)
- Ký quỹ chéo, hedge mode, lệnh Stop-Market/Trailing riêng cho Futures (hiện có TP/SL theo vị thế).
- Bảng tỷ lệ ký quỹ duy trì là **một bậc** cho mỗi cặp (Binance có nhiều bậc theo quy mô vị thế).
- Funding bị bỏ lỡ khi server tắt đúng lúc chốt (không truy thu).
- Biểu đồ tài sản (danh mục) vẫn chỉ tính ví Spot.
- Chưa thử dữ liệu Futures từ vùng Singapore — cần khi lên cloud.

## Antigravity
- Hết PROMPT-04 → làm [PROMPT-05](../antigravity/PROMPT-05-giao-dien-futures.md) (giao diện Futures; mock đã đủ).
- Không xung đột với nhánh UI (đã thử gộp).

## Tiếp theo
Giai đoạn 2.6 (đã duyệt): Bot lưới Spot · Mua định kỳ · Phân tích lãi lỗ · Hồ sơ + bảo mật kiểu OKX.

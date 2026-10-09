# Thiết kế: Futures mô phỏng (hợp đồng vĩnh cửu USDT-M)

Ngày 2026-10-09 · Claude Code · Trạng thái: **đã duyệt 2026-10-09 — đang làm** (đòn bẩy tối đa 20×, ký quỹ cô lập trước, Futures làm trước Giai đoạn 2.6)

Chủ dự án chọn thêm Futures (2026-10-09). Đây là hạng mục lớn nhất từ trước tới nay, khoảng Giai đoạn 1 + 2 cộng lại, vì có thêm đòn bẩy, ký quỹ, funding và thanh lý. Vẫn là **tiền ảo**: người dùng không khớp lệnh với nhau, giá lấy từ thị trường Futures thật của Binance.

## 1. Phạm vi bản đầu (v1)
| Mục | Đề xuất v1 | Để sau |
|---|---|---|
| Sản phẩm | Hợp đồng **vĩnh cửu USDT-M** (giống "USDT-M Perpetual" của Binance/OKX) | Hợp đồng coin-M, giao hàng theo kỳ |
| Cặp | Các cặp trong 50 cặp Spot có trên Binance Futures | |
| Ví | **Ví Futures riêng** (USDT); chuyển Spot ↔ Futures bằng 2 dòng sổ cái trong cùng 1 transaction | |
| Chế độ ký quỹ | **Cô lập (isolated)**: mỗi vị thế có ký quỹ riêng, bị thanh lý chỉ mất phần đó — dễ hiểu cho người mới | Ký quỹ chéo (cross) |
| Chiều vị thế | **Một chiều**: mỗi cặp một vị thế Long *hoặc* Short | Hedge mode (Long và Short cùng lúc) |
| Đòn bẩy | 1–20× (Admin chỉnh trần theo từng cặp) | Tới 125× nếu muốn |
| Lệnh | Market, Limit (GTC/IOC), Stop-Market; **chỉ giảm vị thế (reduce-only)**; **TP/SL theo vị thế**; đóng toàn bộ | Trailing, OCO cho futures |
| Phí | Maker 0,02% · Taker 0,05% (Admin chỉnh) | Bậc phí VIP |

## 2. Dữ liệu thị trường
- **Nguồn:** luồng công khai của Binance Futures.
  - **mark price + index price + funding rate**: mỗi giây;
  - sổ lệnh 20 mức, giao dịch, nến.
- **Tách khỏi Spot:** module riêng `FuturesMarketData`, cùng nguyên tắc LIVE/STALE — giá cũ thì dừng nhận lệnh và **dừng thanh lý**.
- ⚠️ **Rủi ro cần kiểm tra:** Binance chặn dữ liệu Futures ở một số vùng. Phải thử gọi từ server Railway Singapore trước khi làm. Nếu bị chặn, nguồn dự phòng là dữ liệu công khai của OKX.
  - **Đã thử từ máy local (2026-10-09):** `fapi.binance.com` trả 200. Cả 50 cặp đều có hợp đồng vĩnh cửu đang giao dịch.
  - Riêng PEPE, SHIB, BONK, FLOKI giao dịch theo **đơn vị 1000 coin** (`1000PEPEUSDT`…). Giao diện phải ghi rõ "1 hợp đồng = 1000 PEPE".
  - Mẫu dữ liệu: BTC mark 82.930,9 · index 82.978,2 · funding 0,001955%.

## 3. Luật tính tiền (đều dùng số thập phân chính xác)
- **Ký quỹ ban đầu** = giá trị vị thế ÷ đòn bẩy.
- **Lãi lỗ chưa chốt** tính theo **mark price**:
  - Long: (mark − giá vào) × khối lượng;
  - Short: ngược lại.
- **Funding** mỗi 8 giờ, theo funding rate thật của Binance tại mốc thanh toán.
  - Khoản thanh toán = giá trị vị thế (theo mark) × rate.
  - rate > 0: Long trả, Short nhận.
  - Bên đối ứng là "sàn" (vì người dùng không khớp với nhau).
  - Mỗi lần thanh toán ghi 1 dòng sổ cái `FUNDING_FEE`.
- **Thanh lý (ký quỹ cô lập):**
  - Khi ký quỹ + lãi lỗ chưa chốt ≤ ký quỹ duy trì (bảng tỷ lệ đơn giản hóa theo bậc giá trị, Admin chỉnh), vị thế bị đóng theo mark price, thu thêm phí thanh lý.
  - Lỗ tối đa = ký quỹ của vị thế: **số dư không bao giờ âm**. Phần lỗ vượt ký quỹ do "quỹ bảo hiểm" của sàn chịu và được ghi sổ để đối soát.
- **Giá thanh lý ước tính** hiển thị ngay khi đặt lệnh và trên vị thế.

## 4. Bất biến mới (thêm vào CLAUDE.md khi làm)
1. Mọi thay đổi số dư Futures vẫn đi qua sổ cái. Ký quỹ vị thế là "đang khóa" của ví Futures.
2. Kiểm tra thanh lý chạy trong matcher (1 tiến trình), khóa dòng vị thế; một vị thế không thể vừa bị thanh lý vừa được người dùng đóng cùng lúc (test tranh chấp).
3. Funding idempotent theo mốc thời gian: chạy lại không trừ hai lần.
4. Đối soát mở rộng: tổng sổ cái = số dư; ký quỹ khóa = tổng ký quỹ các vị thế mở.

## 5. Các bước
1. Kiểm tra truy cập dữ liệu Binance Futures từ vùng Singapore.
2. Hợp đồng API (ví Futures, chuyển tiền, lệnh, vị thế, đòn bẩy, funding, lịch sử) + mock → Antigravity làm giao diện song song.
3. Dữ liệu Futures realtime.
4. Ví, chuyển tiền, lệnh Market/Limit, vị thế, lãi lỗ.
5. Funding, thanh lý, TP/SL vị thế, reduce-only.
6. Test tranh chấp + đối soát + chạy thật với giá Binance → báo cáo.

## 6. Quyết định của chủ dự án (2026-10-09)
1. **Đòn bẩy tối đa 20×** (Admin có thể hạ trần theo từng cặp, không vượt 20×).
2. **Ký quỹ cô lập trước**, ký quỹ chéo làm sau.
3. **Futures làm trước** Giai đoạn 2.6 (Bot lưới, Mua định kỳ, Phân tích lãi lỗ, Hồ sơ + bảo mật).

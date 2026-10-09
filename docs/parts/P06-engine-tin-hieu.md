# P06 — Engine tín hiệu

**Phụ trách:** Claude · **Thư mục:** `server/src/modules/signals/`, chỉ báo thuần trong `packages/core/`
**Nguồn tham khảo:** `legacy/src/engine/` (code cũ — có lỗi đã phân tích, không dùng nguyên trạng)

## Mục tiêu
Tạo tín hiệu LONG/SHORT có entry, TP, SL — và **chứng minh bằng số liệu thật** trước khi cho người dùng xem.

## Phạm vi
**Chuyển & sửa engine cũ**
- Chỉ dùng **nến đã đóng**; đủ lịch sử (EMA200 cần ≥ 200 nến).
- Bỏ mọi số liệu bịa (fallback funding/OI, `× 1.05`, `|| 100`…). Thiếu dữ liệu → bỏ yếu tố đó khỏi điểm, không cho 50 điểm mặc định.
- Sửa logic hướng (không dùng OR giữa price action và SMC), R:R thật, phần SHORT dùng cấu trúc giá.
- Chỉ báo (EMA, ATR, RSI, Bollinger…) và SMC (OB, FVG, sweep, BOS/CHoCH) đặt trong `packages/core`, có unit test.

**Lưu & kiểm chứng**
- Mỗi tín hiệu lưu kèm **phiên bản engine** và toàn bộ đầu vào.
- **Tài khoản bot** trên sàn ảo tự vào lệnh theo mọi tín hiệu, đặt TP/SL bằng OCO (cần P05 giai đoạn 2).
- Backtest trên nến lịch sử, có phí + trượt giá, không nhìn trước tương lai; walk-forward.
- Thống kê: số tín hiệu, win rate, kỳ vọng R, profit factor, drawdown — theo setup, coin, hướng.

**Công bố** (giai đoạn 6)
- API tín hiệu cho người có `signals_access`; thành tích công khai gồm cả lệnh thua; thông báo tín hiệu mới.

## Checklist
- [ ] Giai đoạn 4: chỉ báo + SMC có test, engine đã sửa, lưu tín hiệu + phiên bản, bot vào lệnh, backtest, trang số liệu cho Admin
- [ ] 🚦 Cổng M3: ≥ ~100 tín hiệu chạy thật, kỳ vọng sau phí > 0
- [ ] Giai đoạn 6: API tín hiệu, thành tích công khai, thông báo

## Lưu ý
- Nguy cơ lớn nhất: chỉnh tham số cho đến khi backtest đẹp (overfitting). **Chỉ tin số liệu chạy thật về sau.**
- Không đạt cổng M3 → sửa engine, đo lại; không công bố.

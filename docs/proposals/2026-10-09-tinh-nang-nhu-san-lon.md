# Đề xuất: bổ sung tính năng để ngang các sàn lớn (OKX, Binance, MEXC)

Ngày 2026-10-09 · Người viết: Claude Code · Trạng thái: **đã chọn (2026-10-09)**

> **Chủ dự án đã chọn:**
> - **Nhóm A** — làm ngay; ✅ xong cùng ngày (hợp đồng 0.4.0, [báo cáo](../reports/2026-10-09-backend-gd25.md)).
> - **Nhiều coin**: 50 cặp ✅.
> - **Futures** (Spot + Futures) → Giai đoạn F, [thiết kế](2026-10-09-futures-mo-phong.md) chờ duyệt.
> - **Bot lưới Spot**, **Mua định kỳ**, **Phân tích lãi lỗ**, **Hồ sơ + bảo mật** → Giai đoạn 2.6.
> - Chưa chọn: Chuyển đổi nhanh, TWAP/Iceberg, Bảng xếp hạng, Earn, bậc phí VIP.

## 1. So sánh hiện trạng (chỉ phần Spot — phần sàn mình làm được với tiền ảo)

| Tính năng | OKX / Binance / MEXC | Sàn mình | Ghi chú |
|---|---|---|---|
| Lệnh Market, Limit, Stop-Limit, Stop-Market, OCO, Trailing, TP/SL | Có | **Có** (backend) | Đã làm, kèm test |
| Giá vốn, lãi lỗ, biểu đồ tài sản, xuất CSV | Có | **Có** | |
| Cảnh báo giá, thông báo trong app | Có | **Có** | |
| 2FA, quản lý phiên | Có | **Có** | |
| Danh sách yêu thích | Có | **Có** (`preferences.favorites`) | |
| Tên đầy đủ coin, nhóm ngành (Layer 1, Meme, AI…) | Có | Chưa | Cần cho trang Thị trường kiểu OKX |
| Sparkline 24h/7 ngày | Có | Chưa | |
| Sổ lệnh sâu (gom giá ×10, ×100) | 400+ mức | 20 mức | |
| Số cặp giao dịch | Hàng trăm | 10 | |
| Thông báo của sàn (announcement) | Có | Chưa | |
| Sự kiện realtime "sàn dừng / cặp tạm ngưng" | Có | Chưa | Đã ghi là thiếu ở GĐ3 |
| **Chuyển đổi nhanh (Convert)** | Có | Chưa | Đổi coin A → B một chạm, báo giá trước 10 giây |
| **Mua định kỳ (DCA / Recurring buy)** | Có | Chưa | Tự mua theo ngày/tuần |
| **Bot lưới Spot (Grid)** | Có (nổi bật) | Chưa | Đặt thang lệnh mua thấp – bán cao tự động |
| Lệnh thuật toán TWAP / Iceberg | Có | Chưa | Ít người mới dùng |
| **Phân tích lãi lỗ** (lịch PnL theo ngày, tỷ lệ thắng, theo coin) | Có | Một phần | Trùng Giai đoạn 5 trong roadmap |
| Hồ sơ: biệt danh, ảnh đại diện, UID | Có | Chưa | |
| Mã chống lừa đảo trong email, lịch sử đăng nhập, email cảnh báo thiết bị mới | Có | Chưa | |
| Bậc phí VIP theo khối lượng 30 ngày | Có | Chưa | |
| **Bảng xếp hạng / giải đấu** | Có | Chưa | Đang nằm trong Backlog |
| Earn (gửi tiết kiệm lấy lãi) | Có | Chưa | Với sàn ảo: lãi suất ảo do Admin đặt |
| Copy trade | Có | Chưa | Nên gắn với web tín hiệu (GĐ6) |
| Futures, Margin, Options, P2P, nạp/rút thật, Launchpad | Có | **Không làm** | Ngoài phạm vi (pháp lý, độ phức tạp) |

## 2. Các nhóm đề xuất

### Nhóm A — Dữ liệu cho giao diện v2 (đề xuất làm ngay, không đổi logic tiền)
| Mã | Việc | Độ lớn |
|---|---|---|
| A1 | Thông tin coin: tên đầy đủ, nhóm ngành, thứ tự hiển thị — bảng `assets` + đưa vào `exchangeInfo`; Admin sửa được | Nhỏ |
| A2 | Sparkline: `GET /market/sparklines` (24 điểm giá đóng nến 1h cho mọi cặp, cache 60s) | Nhỏ |
| A3 | Sổ lệnh sâu: `depth?limit=` tới 500 mức cho cặp đang xem (lấy từ Binance, cache 1s); matcher vẫn dùng 20 mức realtime | Vừa |
| A4 | Realtime `exchange:status`: báo dừng/tiếp tục giao dịch, bật/tắt cặp | Nhỏ |
| A5 | Thêm cặp: 10 → ~30 cặp USDT phổ biến (lọc theo quy tắc số lẻ ≤ 8) | Vừa — kiểm tra tải WebSocket |
| A6 | Thông báo của sàn: Admin đăng/ghim/ẩn (ghi audit), người dùng xem ở trang chủ | Nhỏ |

### Nhóm B — Giao dịch kiểu sàn lớn
| Mã | Việc | Độ lớn |
|---|---|---|
| B1 | **Chuyển đổi nhanh**: báo giá giữ 10 giây → xác nhận; A→B đi qua USDT; chạy trên engine khớp hiện có (cùng sổ cái, cùng đối soát) | Vừa |
| B2 | **Mua định kỳ**: lịch hằng ngày/tuần/tháng, số tiền USDT, tạm dừng/hủy; thiếu số dư thì bỏ lượt + thông báo | Vừa |
| B3 | **Bot lưới Spot**: giá dưới/trên, số lưới (≤ 100), cách đều số học/hình học, vốn đầu tư; lợi nhuận lưới, dừng bot (hủy lệnh, tùy chọn bán coin) | Lớn |
| B4 | TWAP / Iceberg | Vừa — **đề xuất để sau** |

### Nhóm C — Tài khoản & phân tích
| Mã | Việc | Độ lớn |
|---|---|---|
| C1 | **Phân tích lãi lỗ**: lãi lỗ theo ngày (lịch), lũy kế, tỷ lệ thắng, theo coin, sụt giảm tối đa | Vừa (gộp Giai đoạn 5) |
| C2 | Hồ sơ: biệt danh, ảnh đại diện chọn từ bộ có sẵn, UID ngắn | Nhỏ |
| C3 | Bảo mật kiểu OKX: mã chống lừa đảo trong email, lịch sử đăng nhập, email khi đăng nhập thiết bị mới | Nhỏ |
| C4 | Bậc phí VIP theo khối lượng 30 ngày (Admin cấu hình bảng phí) | Vừa |

### Nhóm D — Cộng đồng (hiện nằm trong Backlog)
| Mã | Việc | Độ lớn |
|---|---|---|
| D1 | **Bảng xếp hạng ROI** 7/30 ngày, tự chọn tham gia bằng biệt danh; giải đấu theo mùa | Vừa |
| D2 | Earn mô phỏng: gửi linh hoạt, lãi suất ảo do Admin đặt, cộng lãi hằng giờ qua sổ cái | Vừa |
| D3 | Copy trade | Để GĐ6 |

## 3. Cách làm (giữ như các giai đoạn trước)
1. Hợp đồng API + mock trước → Antigravity làm giao diện song song.
2. Backend + test (mọi thứ đụng số dư có test tranh chấp + đối soát).
3. Báo cáo + prompt cho Antigravity.

**Đề xuất thứ tự**: A → B1 (Chuyển đổi) → C1 (Phân tích lãi lỗ) → B3 (Bot lưới) → B2 (Mua định kỳ) → phần còn lại. Thứ tự này đổi được nếu chủ dự án muốn.

**Lưu ý**: Giai đoạn 4 (engine tín hiệu) cần chạy thật 1–3 tháng. Nếu làm thêm nhóm B/C/D trước thì nên đưa hệ thống lên cloud sớm để engine thu số liệu song song.

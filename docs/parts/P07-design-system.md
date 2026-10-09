# P07 — Design system (bộ component dùng chung)

**Phụ trách:** Antigravity · **Thư mục:** `packages/ui/`
**Dùng bởi:** P08 (sàn), P09 (admin), P10 (tín hiệu), P11 (app)

## Mục tiêu
Ba web trông như một sản phẩm, làm giao diện mới nhanh hơn, đổi giao diện một chỗ là áp dụng khắp nơi.

## Phạm vi
**Design tokens**
- Màu: nền, chữ, viền, nhấn; **xanh = tăng/mua, đỏ = giảm/bán** (cho phép đảo ngược trong cài đặt); trạng thái cảnh báo/lỗi/thành công.
- Chế độ sáng/tối — mọi màu khai báo bằng biến, không viết mã màu trực tiếp trong component.
- Chữ: font hiển thị số dạng **tabular** (các chữ số cùng độ rộng, để bảng giá không nhảy).
- Khoảng cách, bo góc, đổ bóng, breakpoint (mobile-first: 360px → tablet → desktop).

**Component cơ bản**
Button, Input (kể cả input số thập phân), Select, Tabs, Modal/Sheet (mobile dùng bottom sheet), Toast, Tooltip, Table (sắp xếp, cuộn ngang trên mobile), Card, Badge, Skeleton, EmptyState, ErrorState.

**Component chuyên cho sàn**
- `PriceText` — tô màu theo tăng/giảm, nháy nhẹ khi giá đổi.
- `AmountText` — định dạng chuỗi thập phân theo kiểu Việt Nam, đúng số chữ số lẻ của cặp.
- `PercentChange`, `SymbolBadge` (icon + tên coin), `StaleBadge` (dữ liệu cũ), `OrderStatusBadge`, `SideTag` (Mua/Bán).

**Khác**
- Chuỗi giao diện đặt trong file ngôn ngữ (i18n): `vi` mặc định, chuẩn bị `en`.
- Trang trưng bày component (Storybook hoặc trang demo) để xem toàn bộ component.

## Checklist
- [ ] Giai đoạn 0: tokens sáng/tối, component cơ bản, trang trưng bày
- [ ] Giai đoạn 1: component chuyên cho sàn
- [ ] Giai đoạn 3: bảng dữ liệu lớn cho Admin (lọc, phân trang)

## Xong khi
Mọi component có cả chế độ sáng/tối, dùng tốt ở 360px, điều khiển được bằng bàn phím, có trong trang trưng bày.

## Quy tắc
- Component **không gọi API** và không chứa logic nghiệp vụ — chỉ nhận dữ liệu qua props.
- Không tự làm tròn/tính toán số tiền; chỉ định dạng chuỗi nhận được.

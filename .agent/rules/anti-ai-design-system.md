# Quy tắc Thiết kế Giao diện Anti-AI (Antigravity Design Rules)

Quy tắc này áp dụng tự động cho mọi tác vụ phát triển giao diện trong `D:\Claude\crypto\ui` nhằm loại bỏ triệt để các thiết kế khuôn mẫu "AI slop" và nâng tầm thẩm mỹ giao diện người dùng.

## 1. Danh sách Cấm Tuyệt đối (Absolute Bans)
- **Cấm gradient tím/indigo vô nghĩa:** Không sử dụng `bg-gradient-to-r from-purple-500 to-indigo-600` làm nền hoặc chữ gradient chỉ để trang trí vô thưởng vô phạt.
- **Cấm bố cục 3 thẻ giống hệt nhau (The 3-Card Template):** Không sắp xếp màn hình theo kiểu tiêu đề căn giữa + 3 thẻ tính năng giống hệt nhau với icon tròn ở trên.
- **Cấm lồng thẻ trong thẻ (Nested Cards):** Thẻ chỉ dùng cho nhóm dữ liệu có ranh giới tự nhiên; không đặt thẻ con bên trong thẻ mẹ.
- **Cấm nhãn tracking rộng trên mọi tiêu đề:** Không đặt nhãn hoa tracking rộng (ví dụ: `OVERVIEW`, `FEATURES`) phía trên tiêu đề một cách máy móc. Hãy để tiêu đề tự thể hiện sức nặng của nó.
- **Cấm số thứ tự 01 / 02 / 03:** Trừ khi đó là một quy trình các bước tuần tự (step-by-step onboarding) thực tế.
- **Cấm hiệu ứng fade-in & slide-up rải rác:** Không gán hiệu ứng cuộn mờ dần trên từng section hay từng card.

## 2. Tiêu chuẩn Chế tác Bắt buộc (Craft Floor)
- **Tương phản (Contrast):** Text thân trang ≥ 4.5:1; Text lớn ≥ 3:1 (theo tiêu chuẩn WCAG AA).
- **Khoảng cách (Spacing):** Khoảng cách phía trên tiêu đề luôn lớn hơn khoảng cách bên dưới tiêu đề để liên kết trực quan với nội dung phụ thuộc.
- **Typography:** Độ dài dòng đọc tối ưu 65–75 ký tự. Tracking tối đa -0.04em (khuyên dùng -0.02em).
- **Nút bấm & Microcopy:** Động từ hành động rõ ràng ("Lưu thay đổi", "Đặt lệnh"), không dùng từ ngữ chung chung ("Submit", "Click here").
- **Tích hợp kiểm tra tự động:** Sử dụng kịch bản scanner `node .agent/skills/avoid-ai-design/scripts/detect.mjs` để kiểm tra độ sạch trước khi hoàn thành công việc.

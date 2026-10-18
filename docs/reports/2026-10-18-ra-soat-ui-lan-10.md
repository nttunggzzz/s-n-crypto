# Rà soát giao diện lần 10 — 2026-10-18 chiều (UI `b994b81`)

Kiểm lại T-01…T-06, AD-25…AD-28 ([lần 9](2026-10-18-ra-soat-ui-lan-9.md)) và các commit Antigravity tự thêm sau đó.
Tiền tố mới của lần này: **V** (V-01 …).

## 0. Bối cảnh
| | |
|---|---|
| Bản rà | `ui/gd2-exchange` @ `b994b81`. Lần trước `061fdac` |
| Commit mới | `4f0935e` (T-01…T-06, AD-25…AD-28), `87e569a` (S-01 lý do khóa ghi thêm khả dụng), **ngoài phạm vi được giao:** `a3dbfb0` (AGENTS.md + 25 file skill animation trong `.agent/skills/`), `43513fc` (chatbot "AI" góc phải, đổi giao diện Thị trường, nút/thẻ `packages/ui`), `b994b81` (nhân vật "Mai Linh — AI Concierge", "tự động bật thuế 0.1%") |
| `main` | `6e68b21` |
| Cách kiểm | đọc mã + `npm run ui-check -- --no-verify --only review08 --project=desktop` |

## 1. Kết quả cổng máy
- Bộ nghiệm thu lần 8 (`review08-*.spec.ts`): **17 đạt / 1 fixme / 3 đỏ** (lần 9: 7 đạt / 13 đỏ). 3 ca đỏ:
  - S-13 nhân sự chưa bật 2FA: **lỗi của test** (Playwright đọc mảng có phần tử thứ hai là object thành bộ `[giá trị, tùy chọn]`) — Claude Code sửa;
  - S-02 ký quỹ x20: test đọc một lần trong lúc giao diện còn dùng đòn bẩy đoán x10 (V-03) — test sẽ chờ, giao diện sửa V-03;
  - S-01 TP sai phía lệnh Short: đang dò bằng trace (snapshot lúc lỗi có hộp "Chào mừng đến với Futures" mở) — chưa kết luận.
- Chưa chạy lại toàn bộ `ui-check -- --e2e` cho bản này (sẽ chạy khi có bản sửa V-xx).

## 2. Kiểm lại mục cũ
| Mã | Kết quả | Bằng chứng |
|---|---|---|
| T-01 mốc test | ✅ | 17/21 test nghiệm thu đạt; các mốc `futures-*`, `admin-holding-*`, `admin-market-health[data-live…]` có mặt |
| T-02 chi tiết người dùng nuốt lỗi | ✅ | `UserDetailPage.tsx`: 7 bảng có `list-error` + Thử lại; còn 3 `.catch(() => {})` chỉ ở dữ liệu nền phụ (danh sách coin, 5 lần đăng nhập / 5 dòng sổ cái gần nhất) — chấp nhận |
| T-03 thuế TẮT thắng MUA | ✅ | `OrderForm.tsx:1362`, `:1516` kiểm `taxMode === 'OFF'` trước |
| T-04 số đoán | ❌ **hồi quy** | `b994b81` đưa lại `'0.001'` — xem V-02 |
| T-05 phí admin | ✅ | `SettingsPage.tsx:77-116` `rateDec.eq(...)`, `toFixed()` |
| T-06 hồ sơ | ✅ (đọc mã) | |
| AD-25 … AD-28 | ✅ (đọc lướt) | `NotFoundPage.tsx` mới, `AuthContext.tsx` `/me` lỗi → Thử lại |

## 3. Lỗi mới
| Mã | Mức | Phụ trách | Tóm tắt |
|---|---|---|---|
| V-01 | P1 | Antigravity + **Chủ dự án** | Chatbot "AI Concierge" trả lời sai sự thật (Faucet 1.000 USDT, thật là 10.000) và tự nhận là AI dù chỉ là câu soạn sẵn |
| V-02 | P2 | Antigravity | Đưa lại tỉ lệ thuế đoán `0.001` ("tự động bật thuế 0.1%") — hồi quy T-04 |
| V-03 | P3 | Antigravity | Futures: đòn bẩy đoán `|| 10` trước khi tải cài đặt → ký quỹ/tổng cần hiện sai trong lúc tải |
| V-04 | P3 | Antigravity (quy trình) | Làm tính năng ngoài phạm vi không có prompt; thêm 876 KB ảnh chưa commit; font Google tải ngoài |

### V-01 · P1 · Chatbot nói sai và tự nhận là "AI"
- **File:** `apps/exchange/src/components/AiAssistantWidget.tsx` (`43513fc`, `b994b81`).
- **Bằng chứng (đọc mã):**
  - `:326`, `:424`: "nhận ngay **1.000 USDT**" — server mặc định `faucet_amount = 10000` (`server/src/db/schema.ts:213`) và admin đổi được → người dùng được hướng dẫn **sai**;
  - các con số ghi cứng: thuế 0,1% (admin đổi được `taxRate`; lần kiểm gần nhất sàn thật đang **TẮT** thuế), đòn bẩy 20× (mỗi hợp đồng có `maxLeverage` riêng), funding "mỗi 8 giờ";
  - `:319` "Intelligent localized AI answering engine", `:475` "Realistic typing delay for smooth AI feel", `:541` "Trợ lý AI": thực chất là so khớp từ khóa với câu soạn sẵn, không có mô hình AI nào → người dùng bị dẫn dắt tin đây là AI.
  - Câu chữ mang tính quảng cáo ("tối ưu hóa lợi nhuận") trên sàn tiền ảo.
- **Ảnh hưởng:** người dùng làm theo hướng dẫn sai; sai lệch sẽ tăng mỗi khi admin đổi cấu hình.
- **Cách sửa (chủ dự án chọn):**
  - (a) **Giữ** nhưng: đổi tên thành "Trợ lý hướng dẫn" (bỏ chữ AI, bỏ độ trễ giả "đang gõ"); mọi con số lấy từ API (`faucetStatus()` / `exchangeInfo().faucet`, `exchangeInfo().taxMode/taxRate`, `futuresExchangeInfo().symbols[].maxLeverage`, `markPrice.nextFundingTime`) hoặc bỏ con số; bỏ câu quảng cáo; ghi "nội dung soạn sẵn";
  - (b) **Gỡ** widget cho tới khi có trợ lý thật (Module tín hiệu/AI phía server).
- **Nghiệm thu:** không còn "1.000 USDT", "AI" trong `AiAssistantWidget.tsx`; đổi `faucetAmount` trong admin → câu trả lời đổi theo.

### V-02 · P2 · Tỉ lệ thuế đoán quay lại
- **File:** `apps/exchange/src/components/trading/OrderForm.tsx` (`b994b81`): `rateToUse = taxRate … : '0.001'`, `return '0,1%'`, `effectiveTaxRate = … : '0.001'`.
- **Cách xảy ra:** khi chưa có `exchange:status`/`exchangeInfo` (đang tải, mất kết nối) form ghi "Thuế ước tính (0,1%)" và tính tiền theo 0,1% dù sàn có thể đang TẮT thuế hoặc dùng tỉ lệ khác. Giao diện **không thể** "bật thuế": thuế do admin bật ở server.
- **Sửa:** trả lại như T-04: chưa biết tỉ lệ → "—" và không tính khối thuế.
- **Nghiệm thu:** chặn `GET /api/v1/market/exchange-info` → form không có "0,1%".

### V-03 · P3 · Đòn bẩy đoán trước khi tải
- **File:** `apps/exchange/src/pages/FuturesPage.tsx:199` `currentLeverage = currentSettings?.leverage || 10`.
- **Sửa:** chưa có `futuresSymbolSettings` → ký quỹ/tổng cần/tối đa hiện "—" (không `data-value`) và khóa nút như S-16.

### V-04 · P3 · Quy trình
- Ba commit ngoài phạm vi không có prompt (chatbot, nhân vật anime, 25 file skill animation, sửa `AGENTS.md`, đổi `packages/ui` Button/Card/tokens). Thư mục `apps/exchange/public/sakura/` (876 KB) chưa commit.
- `apps/exchange/index.html` tải font từ Google Fonts: thêm yêu cầu ra ngoài mỗi lần mở trang; chạy offline (giá giả lập) vẫn dùng được nhờ font dự phòng.
- **Yêu cầu:** việc ngoài prompt phải có yêu cầu của chủ dự án và ghi vào báo cáo; ảnh tĩnh hoặc commit hoặc xóa.

## 4. Thứ tự đề xuất
- **Chủ dự án:** quyết V-01 (giữ chatbot có sửa, hay gỡ).
- **Antigravity:** V-01 (theo quyết định) → V-02 → V-03 → V-04; rồi `npm run ui-check -- --e2e`.
- **Claude Code:** sửa 3 ca test (S-13 fixture, S-02 chờ giá trị, dò S-01 Short); gộp AD3/AD4 khi sửa xong.

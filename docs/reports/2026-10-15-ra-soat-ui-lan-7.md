# Rà soát giao diện lần 7 — 2026-10-15 tối (UI `6b93ac2`)

Kiểm lại các mục sửa của [lần 6](2026-10-15-ra-soat-ui-lan-6.md) (P-01, P-02, L-03), soát lỗi ảnh hưởng trải nghiệm người dùng trên web sàn và web admin.
Tiền tố mới của lần này: **Q** (Q-01 … Q-04).

## 0. Bối cảnh và cách kiểm
| | |
|---|---|
| Bản rà | `ui/gd2-exchange` @ `6b93ac2`. Lần trước rà `325c373` |
| Commit của Antigravity | `ad607ec` (gộp `main`), `d7e367c` (P-01 cột Thuế + L-03 tải thêm lần khớp), `35eee8a` (P-02), `ad9ac8e` (giữ khung thời gian người dùng chọn khi tùy chọn tải về muộn), `6b93ac2` (ghi trạng thái) |
| File đã sửa | `apps/admin/src/pages/UserDetailPage.tsx`, `apps/exchange/src/components/trading/CandlestickChart.tsx`, `apps/exchange/src/components/trading/UserOrdersTabs.tsx`, `docs/antigravity/TESTIDS.md`, `docs/reports/2026-10-15-ra-soat-ui-lan-6.md` |
| `main` | `dfe6009` |
| Cách kiểm | `npm run ui-check -- --e2e` + đọc mã (`git show refs/heads/ui/gd2-exchange:<file>`) + ca e2e mới cho P-01. Không sửa gì trong `ui/` |

## 1. Kết quả cổng máy
- `npm run ui-check -- --e2e` (`ui/gd2-exchange` @ `6b93ac2` + `main` @ `dfe6009`):
  - **verify: đạt**, gồm typecheck, lint, **629/629** test, build hai app.
  - **e2e: 50 đạt / 1 bỏ qua / 0 đỏ** (2,8 phút), cả hệ default và host-mode.
- Ca nghiệm thu P-01 mới (`899d26d`, `tax.spec.ts:245`):
  - `npm run ui-check -- --no-verify --only tax --project=desktop` trên `6b93ac2`: **9/9 đạt**;
  - chạy trên bản cũ `325c373`: **đỏ** đúng chỗ (`toHaveCount` nhận 0 ô `trade-tax`), tức ca này bắt được lỗi cũ.
- Kết luận: cổng máy đạt.

## 2. Kiểm lại mục cũ
| Mã | Kết quả | Bằng chứng |
|---|---|---|
| P-01 thuế bên cạnh phí | ✅ (còn Q-01 ở chú thích chart) | đọc mã + e2e: `UserOrdersTabs.tsx:616` cột "Thuế" ngay sau "Phí"; `:648-657` ô `trade-tax`, `data-value={tr.tax ?? '0'}`, bằng 0 hiện "—"; `:158-161` thông báo khớp lệnh BÁN có "· thuế …"; `CandlestickChart.tsx:661,668,680` cộng `totalTax`, `:1262` thêm "· thuế …" vào chú thích B/S. Ca e2e mới `tax.spec.ts` "Lịch sử khớp có cột Thuế…": đạt trên `6b93ac2`, đỏ trên `325c373` |
| P-02 nhận diện uid | ✅ | đọc mã: `UserDetailPage.tsx:81-99` chỉ nhận đúng 8 chữ số, kiểm `items[0]?.uid === userId` (uid trong hợp đồng là chuỗi, `admin.ts:14`, nên so sánh đúng kiểu); server cũng so khớp uid chính xác (`adminService.ts:193-194`). Màn "Không tìm thấy người dùng" `admin-user-not-found` (`:182`). Còn Q-03 |
| P-03 (Claude Code) | ❌ Còn | chưa làm |
| P-04 / M-16 (Claude Code) | ❌ Còn | chưa làm |
| L-03 chart tối đa 1.000 lần khớp | ◐ Một phần | đọc mã: `CandlestickChart.tsx:1154-1180` khi cuộn về nến cũ thì gọi thêm `myTrades({ symbol, from, to, limit: 200 })` cho đúng khoảng nến mới. Còn thiếu, xem Q-02 |
| `ad9ac8e` khung thời gian | ✅ | đọc mã: `:350` chỉ áp `defaultInterval` khi người dùng chưa bấm chọn (`userSelectedIntervalRef`, `:1858`) |

## 3. Lỗi mới
| Mã | Mức | Phụ trách | Tóm tắt |
|---|---|---|---|
| Q-01 | P2 | Antigravity | Chú thích B/S trên chart làm tròn phí và thuế theo bước khối lượng của coin: cặp DOGE, PEPE hiện "phí 0 USDT · thuế 0 USDT" |
| Q-02 | P3 | Antigravity | L-03 mới sửa một phần: mỗi khoảng chỉ lấy 200 lần khớp, khoảng đang xem lúc mở trang vẫn thiếu, tải lại danh sách thì mất phần đã tải thêm |
| Q-03 | P3 | Antigravity | Admin: lỗi mạng / lỗi server / hết phiên cũng hiện "Không tìm thấy người dùng" |
| Q-04 | P3 | Antigravity (quy trình) | Lại ghi trực tiếp vào thư mục `main` (`D:\Claude\crypto\docs\reports\2026-10-15-ra-soat-ui-lan-6.md`, chưa commit), trái quy tắc 7 |

### Q-01 · P2 · Phí và thuế trên chú thích chart bị cắt thành 0
- **File:** `apps/exchange/src/components/trading/CandlestickChart.tsx:1261-1262`:
  `formatAmount(f.totalFee.toString(), stepSize)` và `formatAmount(f.totalTax.toString(), stepSize)`.
- **Bằng chứng (đọc mã):**
  - `stepSize` là bước khối lượng của **coin gốc** (DOGE, PEPE: `"1"` → 0 chữ số thập phân; XRP: `"0.1"` → 1 chữ số; `server/src/modules/market/sim/snapshot.json`).
  - `formatAmount` → `formatDecimal(…, { decimals })` **cắt** phần lẻ (`packages/ui/src/format.ts:52-58`, `slice`).
  - Thuế luôn tính bằng USDT, phí lệnh BÁN cũng bằng USDT (`orderService.ts:520` `feeAsset: isBuy ? base : quote`).
- **Cách xảy ra:** bật thuế, bán 6.000 DOGE giá 0,1 (600 USDT) → thuế 0,6 USDT, phí 0,6 USDT. Rê chuột lên ký hiệu S trên chart: "Bán 6.000 DOGE @ … · 1 lần khớp · phí 0 USDT · thuế 0 USDT". Điều kiện `gt(0)` đúng nên vẫn in ra, nhưng số hiện là 0. Lệnh MUA cũng bị: phí 0,1% của 100 DOGE = 0,1 DOGE → "phí 0 DOGE". Lỗi phí có từ trước, nay thêm thuế cũng bị theo.
- **Ảnh hưởng:** người dùng thấy "thuế 0 USDT" trong khi bảng Lịch sử khớp ghi 0,6, hai chỗ mâu thuẫn nhau.
- **Cách sửa an toàn:** không dùng `stepSize` cho phí và thuế. Dùng `formatDecimal(f.totalFee.toString(), { decimals: 8, trimTrailingZeros: true })` (tương tự cho thuế), giống bảng Lịch sử khớp đang dùng `formatDecimal(tr.fee)`.
- **Nghiệm thu:** cặp DOGEUSDT, bán 6.000 DOGE khi thuế bật → chú thích có "phí 0,6 USDT · thuế 0,6 USDT", khớp ô `trade-tax`. (Chú thích nằm trên canvas, e2e chưa đọc được. Nếu Antigravity thêm `data-fee`/`data-tax` vào `chart-fill-marker` (`:2285`) thì Claude Code viết ca kiểm.)

### Q-02 · P3 · Ký hiệu B/S trên chart vẫn có thể thiếu (L-03 một phần)
- **File:** `CandlestickChart.tsx:455-462` (lúc mở trang: tối đa 5 × 200 = 1.000 lần khớp mới nhất), `:1154-1162` (khi cuộn: một lần gọi `limit: 200`, không theo `nextCursor`).
- **Bằng chứng (đọc mã), ba chỗ thiếu:**
  1. Khi cuộn về trước, khoảng 500 nến có hơn 200 lần khớp (bot lưới dễ vượt) → chỉ lấy 200 lần mới nhất của khoảng, phần cũ hơn trong khoảng không có ký hiệu.
  2. Khoảng nến đang hiện lúc mở trang (500 nến 15m ≈ 5 ngày) mà có hơn 1.000 lần khớp → phần cũ trong khoảng này vẫn thiếu. Bản sửa chỉ tải cho khoảng nến **mới cuộn tới**, không lấp phần này.
  3. `fetchTrades` chạy lại mỗi khi đổi `activeSymbolInfo` (`:488`) và gán đè `setMyTrades(allTrades)` → các lần khớp tải thêm khi cuộn bị xóa, trong khi nến cũ vẫn còn trên chart.
- **Cách sửa an toàn:** khi tải lần khớp cho một khoảng thời gian, lặp theo `nextCursor` (giới hạn số trang). Lúc mở trang, lấy theo `from` = mốc mở của nến cũ nhất đang hiện thay vì "1.000 mới nhất". Khi `fetchTrades` chạy lại, gộp theo `id` thay vì gán đè.
- **Nghiệm thu:** tài khoản có 1.500 lần khớp BTCUSDT trong 2 ngày (bot lưới) → mọi nến có lần khớp đều có ký hiệu (`chart-fill-marker` đếm khớp số nhóm tính từ API).

### Q-03 · P3 · Admin: mọi lỗi đều hiện "Không tìm thấy người dùng"
- **File:** `apps/admin/src/pages/UserDetailPage.tsx:114-118`: `catch (e) { …; setNotFound(true) }`.
- **Cách xảy ra:** server trả 500, mất mạng, hoặc phiên admin hết hạn (401) khi mở chi tiết người dùng có thật → màn hình báo "Không tìm thấy người dùng… Vui lòng kiểm tra lại UID hoặc UUID". Admin tưởng tài khoản bị xóa hoặc nhập sai.
- **Cách sửa an toàn:** chỉ đặt `notFound` khi lỗi là 404 (`ApiError` có `status === 404` / mã `NOT_FOUND`). Lỗi khác: hiện trạng thái lỗi có nút "Thử lại" gọi lại `loadUserData`.
- **Nghiệm thu:** chặn `GET /api/v1/admin/users/:id` trả 500 → hiện thông báo lỗi + "Thử lại", không có `admin-user-not-found`.

### Q-04 · P3 · Quy trình: ghi vào thư mục `main`
- `git status` của `D:\Claude\crypto` (nhánh `main`) có `M docs/reports/2026-10-15-ra-soat-ui-lan-6.md` chưa commit, nội dung trùng phần Antigravity đã commit ở `6b93ac2` trên nhánh UI.
- `.agent/rules/project-rules.md` dòng 7: "Không viết gì vào `D:\Claude\crypto` (thư mục `main`)". Ghi trạng thái chỉ làm trong `D:\Claude\crypto\ui`, rồi Claude Code gộp.
- Lần này không mất dữ liệu: phần sửa đó Claude Code giữ nguyên trên `main` (trùng nội dung commit trên nhánh UI, gộp sẽ không xung đột).
- `docs/antigravity/TESTIDS.md` (của Claude Code) Antigravity thêm dòng `trade-tax`, nội dung đúng, giữ.

## 4. Thứ tự đề xuất
- **Antigravity:** Q-01 → Q-03 → Q-02. Xong ghi "Trạng thái" dưới từng mục trong file này (ở `D:\Claude\crypto\ui`), chạy `npm run ui-check -- --e2e`.
- **Claude Code:** P-03 (ghi chú thuế trong `analytics.ts`, `spotTax`), P-04 / M-16 (phân loại thuế theo người dùng cho admin).
- **Chủ dự án:** quyết định gộp nhánh UI vào `main`; `vietnam-tax-compliance/` giữ hay xóa; C-D5b.

## 5. Ghi chú
- Chú thích chart (Q-01) vẽ trên canvas, chưa kiểm bằng trình duyệt; kết luận dựa trên đọc mã và quy tắc của `formatDecimal`.
- Q-02 chưa dựng được dữ liệu 1.000+ lần khớp để chạy thật.
- Màn hình 375 px: bảng Lịch sử khớp thêm một cột, bảng nằm trong `overflow-x-auto` (`packages/ui/src/Table.tsx:9`) nên cuộn ngang được, không vỡ trang.

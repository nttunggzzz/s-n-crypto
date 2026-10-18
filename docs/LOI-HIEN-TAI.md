# Lỗi hiện tại — danh sách chung cho mọi agent

> **Antigravity, Claude Code và mọi agent khác: đọc file này trước khi sửa lỗi.**
> Mỗi lỗi có mã, người phụ trách, mức độ, bằng chứng, nguyên nhân, cách sửa và điều kiện nghiệm thu.
> Sửa xong một mục thì đổi **Trạng thái**, ghi commit + lệnh đã chạy + kết quả thật vào cột/ô của mục đó. **Không xóa mục.**
> Chỉ sửa trong phạm vi của mình (Antigravity: `apps/*`, `packages/ui`; Claude Code: `server/`, `packages/contracts`, `packages/core`, `infra/`, `e2e/`).

Rà soát: **2026-10-11** (Claude Code). Cập nhật lần cuối: 2026-10-11 tối (C1, O1 xong).

> **Rà soát mới 2026-10-12 (UI `eee01a3`): [docs/reports/2026-10-12-ra-soat-ui-antigravity.md](reports/2026-10-12-ra-soat-ui-antigravity.md)** — 18 mục R-01…R-18. B5 và U2 bên dưới **chưa xong** dù đã đánh "Đã sửa" (xem R-02, R-13).
>
> **Rà soát lần 2 (UI `d5fa8fc`, sau khi gom thư mục): [docs/reports/2026-10-12-ra-soat-ui-lan-2.md](reports/2026-10-12-ra-soat-ui-lan-2.md)** — nguyên nhân "không xác minh email / không nạp thêm tiền", kiểm lại R-01…R-18, lỗi mới N-01…N-14.
>
> **Rà soát lần 3 (UI `9ec5c74`): [docs/reports/2026-10-12-ra-soat-ui-lan-3.md](reports/2026-10-12-ra-soat-ui-lan-3.md)** — **chưa gộp được**: e2e 2 đỏ thật (K-02 màn đăng ký), K-01 tắt xác minh email bằng gán cứng (công tắc phải ở server). Lỗi mới K-01…K-10. Tính năng mới: [PROMPT-12 lệnh + điểm khớp B/S trên chart](antigravity/PROMPT-12-chart-lenh-va-diem-khop.md).
>
> **Rà soát lần 4 (UI `a225402`, 2026-10-13): [docs/reports/2026-10-13-ra-soat-ui-lan-4.md](reports/2026-10-13-ra-soat-ui-lan-4.md)** — **gộp được**: verify 232/232, e2e 39/39, K-01…K-08 + PROMPT-12 đạt (có test). Còn L-01…L-05 (P3, Antigravity). Bản sửa keep-alive L-06 (Claude Code) cần `npm run host -- update` để lên sàn thật.

>
> **Rà soát lần 5 (UI `8bb9f96`, 2026-10-15): [docs/reports/2026-10-15-ra-soat-ui-lan-5.md](reports/2026-10-15-ra-soat-ui-lan-5.md)** — **chưa gộp được**, dù cổng máy xanh (verify 498/498, e2e 50 đạt / 1 bỏ qua; đủ 8 ca thuế, PROMPT-13 đạt). Có **4 mục P1** cho Antigravity:
> - **M-01**: Antigravity sửa `server/`, bỏ 2FA cho staff khi `NODE_ENV=development`. Trả 2 file server về bản `main`.
> - **M-02**: số liệu và chứng từ thuế bịa trên tổng quan admin (Kho bạc, biên lai KBNN, e-Tax XML).
> - **M-03**: tab Thuế ở chi tiết người dùng có mã số thuế bịa, VNeID, nút `alert()`.
> - **M-04**: form cài đặt thuế admin có thể xóa tỷ giá VND hoặc tắt thuế ngoài ý muốn.
>
> Ngoài ra: 7 mục P2 (M-05…M-11), 5 mục P3 (M-12…M-16), và L-01, L-03, L-04, L-05 còn từ lần 4. Thứ tự sửa ở mục 5 của báo cáo.

>
> **Rà soát lần 6 (UI `325c373`, 2026-10-15 chiều): [docs/reports/2026-10-15-ra-soat-ui-lan-6.md](reports/2026-10-15-ra-soat-ui-lan-6.md)** — **gộp được**.
> - M-01…M-15 đã sửa đủ (kiểm bằng đọc mã); verify 629/629; e2e đạt (spec thuế 8/8 khi chạy lại).
> - Việc tiếp cho Antigravity:
>   - **P-01 (P2)**: lịch sử khớp, toast và chú thích B/S trên chart thêm **thuế** bên cạnh phí;
>   - P-02 (P3): nhận diện uid ở chi tiết người dùng admin;
>   - L-03.

>
> **Rà soát lần 7 (UI `6b93ac2`, 2026-10-15 tối): [docs/reports/2026-10-15-ra-soat-ui-lan-7.md](reports/2026-10-15-ra-soat-ui-lan-7.md)** — **gộp được**.
> - P-01 và P-02 đã sửa; L-03 mới sửa một phần. verify 629/629; e2e 50/50 (1 bỏ qua); ca nghiệm thu P-01 mới đạt.
> - Việc tiếp cho Antigravity:
>   - **Q-01 (P2)**: chú thích B/S trên chart cắt phí/thuế thành 0 ở DOGE, PEPE (làm tròn theo bước khối lượng);
>   - Q-03 (P3): admin báo "Không tìm thấy người dùng" cho mọi lỗi;
>   - Q-02 (P3): phần còn thiếu của L-03;
>   - Q-04: không ghi vào thư mục `main`.
> - **Đã gộp `ui/gd2-exchange` (6b93ac2) vào `main` (7b229bf)**; `npm run verify` trên `main` đạt 629/629. Chưa `host update`, chưa push.

>
> **Rà soát lần 9 (UI `061fdac`, 2026-10-18): [docs/reports/2026-10-18-ra-soat-ui-lan-9.md](reports/2026-10-18-ra-soat-ui-lan-9.md)** — S-01…S-16 và AD-02…AD-24 đã làm; **không có P0/P1**; 58 test e2e cũ đạt.
> - Việc tiếp cho Antigravity: **T-01 (P2)** gắn mốc test theo TESTIDS "Rà soát lần 8"; **T-02 (P2)** chi tiết người dùng admin còn nuốt lỗi; T-03…T-06 (P3); AD-25…AD-28.

>
> **Rà soát lần 10 (UI `b994b81`, 2026-10-18 chiều): [docs/reports/2026-10-18-ra-soat-ui-lan-10.md](reports/2026-10-18-ra-soat-ui-lan-10.md)** — T-01…T-06 xong (17/21 test nghiệm thu đạt), trừ T-04 bị đưa lại.
> - **V-05 (P1)**: hộp chatbot che nút "Mở Short"/"Mở Long" trên trang Futures (đã chứng minh bằng e2e).
> - **V-01 (P1)**: chatbot "AI Concierge" nói sai (Faucet 1.000 USDT, thật 10.000) và tự nhận là AI — chờ chủ dự án quyết giữ/gỡ; **V-02 (P2)** tỉ lệ thuế đoán 0,1% quay lại; V-03, V-04.

## Backend → UI (Claude Code cập nhật mỗi khi đổi backend/hợp đồng; Antigravity đọc đầu mỗi phiên, cùng `packages/contracts/CHANGELOG.md`)

| Ngày | Thay đổi backend / hợp đồng | UI cần làm gì | Trạng thái |
|---|---|---|---|
| 2026-10-18 | **Có rồi (contracts 0.23.0, back office AD3):** `adminCancelUserOrder`, `adminCancelUserOrders`, `adminRevokeSession`, `adminRevokeAllSessions` (quyền mới `orders.manage`), `adminAdjustBalance` nhận `account: 'FUTURES'` (chỉ USDT). Admin hủy lệnh thì TP/SL chờ chuyển SKIPPED (`ADMIN_CANCELED`), không sinh lệnh mới. Sửa kèm: đặt lệnh LIMIT khóa số dư hai đồng theo thứ tự (hết kẹt khóa khi khớp ngay) | Màn hình trong PROMPT-19 (nút hủy lệnh ở tab Lệnh, tab Phiên + thu hồi, chọn ví khi điều chỉnh số dư). Thông báo `TPSL_SKIPPED` lý do `ADMIN_CANCELED` cần nhãn tiếng Việt | **Có rồi** — chờ PROMPT-19 |
| 2026-10-18 | **Có rồi (contracts 0.21.0 + 0.22.0, back office AD1 + AD2):** `adminSearchOrders`, `adminSearchTrades`, `adminUserSessions`, `adminAuditExport`, `adminUsersExport` (quyền mới `users.export`); `adminRiskPositions`, `adminLiquidations`, `adminFundingSummary`, `adminMetrics`. README hợp đồng mục "Back office" | Chưa làm vội: màn hình sẽ giao trong PROMPT-19 khi AD3 + AD4 cũng gộp xong. Nếu `Record<Permission, …>` ở app admin báo thiếu `users.export` thì thêm nhãn | **Có rồi** — chờ PROMPT-19 |
| 2026-10-17 | **Có rồi (contracts 0.20.0):** `accountTradingStats` GET `/api/v1/account/stats` (khối lượng hôm nay / 7 ngày / 30 ngày / tháng này / tháng trước, tách Spot–Futures; thuế đã khấu trừ tháng này và tháng trước); `AdminUserDetail.trading` cùng số cho admin. README mục 17 | Hồ sơ người dùng và chi tiết người dùng admin hiện các con số này (đợt 2 của PROMPT-17). Thuế ghi là "đã khấu trừ", không phải "còn phải nộp" | **Có rồi** — chờ Antigravity dùng |
| 2026-10-17 | **Có rồi (contracts 0.19.0):** `publicConfig.staffTwoFactorRequired`; `npm run dev` chạy server với `STAFF_REQUIRE_2FA=false` (admin không cần 2FA, quyết định của chủ dự án tới khi làm lại bảo mật; production từ chối) | `apps/admin/src/context/AuthContext.tsx`: bỏ kiểm tra hostname của commit `7179707`, chỉ hiện màn "bắt buộc bật 2FA" khi `publicConfig().staffTwoFactorRequired === true` (S-13) | **Có rồi** — chờ Antigravity dùng |
| 2026-10-15 | **Có rồi (hành vi, không đổi hợp đồng):** đóng vị thế Futures lớn hơn sổ lệnh không còn bị từ chối cả lệnh: khớp phần sổ có, `futuresClosePosition` trả `FuturesOrder` `status: 'EXPIRED'`, `closeReason: 'INSUFFICIENT_LIQUIDITY'`, `executedQty` < `quantity` (sổ trống hẳn vẫn 400) | `FuturesPage.tsx` `handleClosePosition`: so `executedQty` với `quantity`; chưa đủ thì báo "Đã đóng X / Y BTC — sổ lệnh chưa đủ, bấm đóng tiếp", không báo "đã đóng toàn bộ", giữ hộp thoại với khối lượng còn lại. Lỗi `INSUFFICIENT_LIQUIDITY` khi mở lệnh: gợi ý giảm khối lượng. Mở Short/Long lớn hơn sổ vẫn bị từ chối | **Có rồi** — chờ Antigravity dùng |
| 2026-10-15 | **Có rồi (contracts 0.18.0):** `pnlAnalysis.spotTax` (thuế trên các lần bán trong `spotRealized`; `spotRealized` đã trừ phí và thuế) — P-03; `adminGetUser(...).tax` = `{ category, categoryUpdatedAt, withheldCount, withheldTotal }` — P-04 / M-16 | Trang Phân tích lãi lỗ: ghi "đã trừ phí và thuế", hiện "trong đó thuế …" khi `spotTax` ≠ 0. Tab Thuế ở chi tiết người dùng (admin): đầu tab hiện phân loại, số lần khấu trừ và tổng thuế từ `detail.tax` (không tự cộng từ danh sách) | **Có rồi** — chờ Antigravity dùng |
| 2026-10-12 | **Có rồi (contracts 0.12.0, commit `3bc7edd`):** `RealtimeClient.onClose(cb)` + hằng số `WS_SESSION_ENDED` (4401) — R-16 | Dùng `onClose` thay đoạn dò `typeof … === 'function'` + ép kiểu ở `AuthContext.tsx`: `code === WS_SESSION_ENDED` → gọi `me`, 401 thì hiện đã đăng xuất. Đánh dấu R-16 xong ở `docs/parts/contract-requests.md` | **Có rồi** — chờ Antigravity dùng |
| 2026-10-12 | **Có rồi (0.12.0):** `publicConfig.emailDelivery` (`'sent'` hoặc `'log'`) — N-13 | Toast "Đã gửi lại email xác minh" chỉ khi `'sent'`; khi `'log'` nói "Máy chủ này chưa gửi email thật". Đánh dấu N-13 xong ở `contract-requests.md` | **Có rồi** — chờ Antigravity dùng |
| 2026-10-12 | **Có rồi:** `npm run dev` mặc định tắt bắt xác minh email (N-01). Quyết định trong shell / `.env` thắng; `npm run dev -- --verify-email` để thử luồng thật | **Không** gán cứng "đã xác minh" trong giao diện (K-01): giao diện đọc `publicConfig.emailVerificationRequired`. Sàn thật và e2e giữ nguyên | **Có rồi** |
| 2026-10-12 | **Có rồi:** CSP của server cho phép script / iframe / kết nối của Cloudflare Turnstile khi có `TURNSTILE_SITE_KEY` — R-04 | Không đổi code UI; kiểm widget captcha hiện trên bản build khi bật captcha | **Có rồi** |
| 2026-10-12 | **Test nghiệm thu mới** (`e2e/tests/trade-form.spec.ts`, `email-gate.spec.ts`) — N-04, K-03, N-05, N-06, K-01, N-03 | Cần `data-testid` cho form lệnh: `order-price`, `order-quantity`, `order-total` (test đang tìm theo thứ tự ô `inputmode="decimal"`). Ghi vào `docs/antigravity/TESTIDS.md` | Chờ Antigravity |
| 2026-10-13 | **Có rồi:** server giữ kết nối keep-alive 120 s (trước 5 s) — L-06, `bbe2a53`. Hết `ECONNRESET` trong e2e và lỗi 502 ngẫu nhiên sau cloudflared | Không đổi code UI | **Có rồi** — sàn thật cần `host update` |
| 2026-10-13 | **Chủ dự án quyết: tạm tắt mọi tính năng cần email** (chưa có tên miền gửi mail). Không đổi backend: công tắc là `publicConfig.emailDelivery` (`'log'` hiện nay) | [PROMPT-13](antigravity/PROMPT-13-tam-an-tinh-nang-email.md): ẩn "Quên mật khẩu", Mã chống lừa đảo, nút gửi lại email khi `emailDelivery !== 'sent'`; test `e2e/tests/email-features.spec.ts` (đỏ tới khi xong) | Chờ Antigravity |
| 2026-10-13 | **Kế hoạch Module A (Nhật ký giao dịch) + Module C (Engine tín hiệu, chỉ Admin).** Hệ phân tích Antigravity viết trong `main` đã được Claude Code tiếp nhận (đợt C0, nhánh `be/analysis`); `AGENT-HANDOFF/prompts/phase-3.md` bị Module C thay thế | Đọc [THONG-BAO-2026-10-13-module-A-C.md](antigravity/THONG-BAO-2026-10-13-module-A-C.md). **Không** sửa file phân tích trong `main`, **không** làm `phase-3.md`, chỉ làm trong `ui/`. Việc kế tiếp: PROMPT-13 → L-01…L-05 → PROMPT-14 (sắp có) | Chờ Antigravity đọc |
| 2026-10-14 | **Có rồi (contracts 0.13.0, `781e246`):** kiểu dữ liệu hệ phân tích (`analysis.ts`), chỉ export, **không có endpoint** | Không làm gì (chưa có giao diện cho phân tích ở GĐ4; trang Admin tín hiệu là PROMPT-15, sau C1) | **Có rồi** |
| 2026-10-14 | **Có rồi (contracts 0.14.0, `35aab16`): hợp đồng Nhật ký giao dịch** — 12 endpoint `journal*`, định dạng phản hồi nhị phân (`journalAttachmentUrl`), mã lỗi 413/415, mock chạy cùng hàm tính với server. **Server chưa có route** (A2–A4) | [PROMPT-14](antigravity/PROMPT-14-nhat-ky-giao-dich.md): làm trên mock (`VITE_USE_MOCKS=true`), sau PROMPT-13 và L-01…L-05 | Chờ Antigravity (server: chờ A2–A4) |
| 2026-10-14 | **Có rồi (contracts 0.15.0, `ca59bc2`): Thuế crypto Việt Nam (Module T, T1+T2)** — `Trade.tax`, `exchangeInfo.taxMode/taxRate/taxVndRate/taxVndRateUpdatedAt`, loại sổ cái `TAX_WITHHOLDING` (cần nhãn ở `WalletPage.tsx:260`), audit `TAX_SETTINGS_UPDATE` (thêm option ở `AuditLogsPage.tsx:55`), quyền `tax.read` (support/admin/owner) và `tax.manage` (admin/owner), CSV giao dịch thêm cột `tax` sau `feeAsset`. Server đã có `taxProfile`, `taxUpdateProfile`, `adminTaxSettings`, `adminUpdateTaxSettings`; **6 endpoint báo cáo (`taxSummary`, `taxWithholdings`, `taxExport`, `adminTax*`) chờ T3** — trên server thật trả 404 tới lúc đó. Thuế mặc định OFF | [PROMPT-16](antigravity/PROMPT-16-thue-viet-nam.md) (contracts 0.16.0: thêm cài đặt thuế trên `exchange:status`; server đã có đủ 10 endpoint thuế) | Chờ Antigravity |
| 2026-10-14 | **Có rồi (contracts 0.17.0, `60d48ea`): Module N, tin tức real-time và sự kiện vĩ mô cho hệ phân tích (đợt N1)** — `SnapshotNews`/`SnapshotMacroEvent` trong snapshot, `newsContext` trong báo cáo phân tích, phòng ban `news_event_risk`, 3 endpoint Admin `adminNewsItems`, `adminNewsSources`, `adminNewsMacroEvents`, quyền `news.view` (support/admin/owner — `me.permissions` của các vai trò này có thêm giá trị). **Server đã có route** (N2b, `75ea9d0`); chưa có job tải tin (N2c), nên danh sách tin còn rỗng, chỉ nguồn lịch LIVE | Chưa làm gì. Giao diện Admin "Tin tức và sự kiện" là đợt N6, sẽ có PROMPT riêng ([kế hoạch](plans/module-N-tin-tuc-va-vi-mo.md)) | **Có rồi** |
| (không đổi) | Hợp đồng hiện tại: **0.17.0**. Không có endpoint nào bị xóa/đổi tên gần đây | — | — |

## 0. Bức tranh tổng thể

| Bản | Commit | Kết quả kiểm tra |
|---|---|---|
| `main` | `77e7708` | — |
| Nhánh UI `ui/gd2-exchange` (mới nhất) | `aaea477` | `npm run ui-check -- --e2e`: verify **đạt** (typecheck, lint, 221/221 test, build), e2e **30/30 đạt** |
| **Sàn đang chạy cho người dùng** (`npm run host`, link trycloudflare) | `main 77e7708` + UI **`d8391db`** | UI **cũ**: chưa có các bản sửa biểu đồ của Antigravity (`33e873c` → `7f929b6`) |

Ba kết luận chính:
1. **Biểu đồ bị kéo dài** mà chủ dự án thấy trên link trycloudflare là do **sàn đang chạy bản UI cũ** (`d8391db`). Bản mới nhất `7f929b6` đã hết lỗi: trên desktop khung chart cao 468–560px và bằng đúng ô của nó, trên mobile 375×812 cao 407px; 1 biểu đồ duy nhất; e2e `chart-dimensions.spec` đạt. → Mục **H1**.
2. **Dữ liệu nến của server khớp Binance từng số** (đo REST + realtime, xem mục **B0**). Chỗ "lệch TradingView" đến từ cách giao diện hiển thị: canvas bị kéo dài (bản cũ), trục thời gian UTC, chỉ tải 180 nến… → Mục **B1–B7**.
3. **Không tạo được tài khoản admin** vì **trang Đăng ký không gửi mã mời**. Sàn đang chạy ở chế độ chỉ đăng ký bằng mã mời, nên mọi lần đăng ký đều bị từ chối. Database sàn: **0 tài khoản**, 3 mã mời "Chủ dự án" chưa dùng lần nào. Chưa có tài khoản thì `set-role owner` không có ai để cấp. → Mục **A1** (sửa) và **W1** (cách tạm dùng ngay).

## 1. Bảng tóm tắt

| Mã | Mức | Phụ trách | Vấn đề | Trạng thái |
|---|---|---|---|---|
| **A1** | P0 chặn | Antigravity | Trang Đăng ký bỏ qua `?invite=` và không gửi `inviteCode`, nên không ai đăng ký được trên sàn thật | **Đã sửa** (Antigravity) |
| **A2** | P0 chặn | Antigravity | Form đặt lệnh **và nút nạp tiền ảo** khóa người chưa xác minh email, kể cả khi server không yêu cầu (`emailVerificationRequired: false`, đúng cấu hình sàn đang chạy) | **Đã sửa** (Antigravity) |
| **W1** | P0 tạm | Chủ dự án | Cách tạo tài khoản owner ngay, trong lúc chờ A1 | Dùng được |
| **H1** | P0 | Chủ dự án | Sàn đang chạy bản UI cũ `d8391db`. **Sàn đang TẮT từ 20:40 (O1)**. `update` giờ chạy cả e2e: trước khi có A1+A2 thì dùng `update --skip-e2e` | Mở |
| **C1** | P1 | Claude Code | e2e chạy cấu hình "đăng ký mở + bắt xác minh email" nên không bắt được A1/A2; `host update` chỉ chạy `verify`, không chạy e2e | **Đã sửa** (`4e6ae6d`, `0747e95`) |
| **O1** | **P0** | Claude Code | Sàn đang chạy crash 2 lần trong ngày 11/10 (mã `0xC0000409`, lần 2 lúc 20:40), không tự khởi động lại, không có log nguyên nhân | **Đã phòng hộ** (tự khởi động lại; `e266f2d`, `660ca51`). Nguyên nhân gốc chưa rõ |
| B0 | — | — | Đo đối chiếu dữ liệu nến server ↔ Binance: **khớp** | Không phải lỗi |
| **B1** | — | Antigravity | Biểu đồ kéo dài / dựng trùng desktop+mobile | **Đã sửa** ở `7f929b6`, chưa lên sàn (H1) |
| **B2** | P1 | Antigravity | Trục thời gian của biểu đồ là UTC, còn TradingView và người dùng dùng giờ Việt Nam (UTC+7) | **Đã sửa** (Antigravity) |
| **B3** | P1 | Antigravity | Chỉ tải 180 nến, không kéo về quá khứ được (backend hỗ trợ `limit` ≤ 1000 và `endTime`) | **Đã sửa** (Antigravity) |
| **B4** | P1 | Antigravity | Gộp giá ticker vào nến cuối không kiểm tra khung thời gian → có thể vẽ râu giả lúc chuyển nến | **Đã sửa** (Antigravity) |
| **B5** | P2 | Antigravity | Nhãn trục giá kiểu Mỹ `83094.00`, còn app kiểu Việt `83.094,60` | **Đã sửa** (Antigravity) |
| **B6** | P2 | Antigravity | Danh sách cặp bên trái hiện `%` thô từ API (`0.292%`) khác header (`+0,29%`) | **Đã sửa** (Antigravity) |
| **B7** | — | — | Ghi chú để so với TradingView đúng cách (24h cuốn chiếu ≠ nến ngày…) | Hướng dẫn |
| **U1** | P2 | Antigravity | Mobile: thanh MUA/BÁN đè lên thanh điều hướng dưới ~6px; chú giải che nến; nút khung `1d` bị khuất | **Đã sửa** (Antigravity) |
| **U2** | P2 | Antigravity | Còn tồn từ PROMPT-11: chưa có EMA/RSI, chưa có `aria-label` nào, chưa có ErrorBoundary, còn 2 `alert()`, chưa dùng `publicConfig` | **Đã sửa** (Antigravity) |
| **N-01** | **P0** | Claude Code | `npm run dev` bắt xác minh email nhưng không gửi email: tài khoản mới không nạp và không giao dịch được | Chờ Claude Code |
| **N-02** | **P1** | Antigravity | Bị khóa vì email nhưng không có nút hành động: nút xám, banner đóng được, Cài đặt không có nút gửi lại | **Đã sửa** (Antigravity) |
| **N-03** | **P1** | Antigravity | Xác minh ở tab khác thì tab gốc vẫn khóa tới khi tải lại | **Đã sửa** (Antigravity) |
| **N-04** | **P1** | Antigravity | Ô "Giá đặt lệnh" trống, chỉ có placeholder là giá hiện tại: nhập khối lượng rồi bấm thì bị báo thiếu giá | **Đã sửa** (Antigravity) |
| **N-05** | **P1** | Antigravity | Bán Market bằng thanh trượt % không chạy (chế độ nhập USDT mặc định) | **Đã sửa** (Antigravity) |
| **N-06** | **P1** | Antigravity | Mobile: bấm "BÁN BTC" mở form ở phía **MUA** | **Đã sửa** (Antigravity) |
| **N-07** | P2 | Antigravity | Menu Ví ở header hiện số viết cứng `10,000.00 USDT` | **Đã sửa** (Antigravity) |
| **N-08** | P2 | Antigravity | Bật 2FA không có mã QR (hợp đồng có `otpauthUrl`); mã khôi phục không có nút sao chép | **Đã sửa** (Antigravity) |
| **N-09** | P2 | Antigravity | "Khả dụng" trong form lệnh cắt còn 4 số lẻ (`0,0012 BTC` thay vì `0,00120879`) | **Đã sửa** (Antigravity) |
| **N-10** | P2 | Antigravity (+ chủ dự án) | Không có hướng dẫn nạp thêm tiền khi đang chờ faucet | **Đã sửa** (Antigravity) |
| **N-11** | P3 | Antigravity | Định dạng: bảng lệnh và Danh mục hiện giá 8 số lẻ, `%` dấu chấm | **Đã sửa** (Antigravity) |
| **N-12** | P3 | Antigravity | Hộp xác nhận ở trang Quản trị không phải `role="dialog"`, nút không tên | **Đã sửa** (Antigravity) |
| **N-13** | P3 | Antigravity | "Đã gửi lại email xác minh" dù môi trường không gửi email thật | ◐ Chờ backend |
| **N-14** | P3 | Antigravity | Mở `/trade/<cặp>` từ trang khác thì tải nến BTCUSDT trước rồi mới tải cặp đúng | **Đã sửa** (Antigravity) |
| **K-01** | **P1** | Antigravity | Tắt/bật xác minh email an toàn theo cấu hình server `emailVerificationRequired` | **Đã sửa** (Antigravity) |
| **K-02** | **P1** | Antigravity | Màn "Đăng ký thành công" chặn vào sàn làm đỏ 2 test e2e | **Đã sửa** (Antigravity) |
| **K-03** | P2 | Antigravity | Đổi giá Limit không tính lại tổng giá trị; xóa ô giá bị tự điền | **Đã sửa** (Antigravity) |
| **K-04** | P2 | Antigravity | Đang tải phiên (`isLoading`) hiện "Yêu cầu đăng nhập" nhấp nháy | **Đã sửa** (Antigravity) |
| **K-05** | P2 | Antigravity | Sổ lệnh và Giao dịch gần đây cắt khối lượng còn 4 số lẻ (`0,0000`) | **Đã sửa** (Antigravity) |
| **K-06** / **PROMPT-12** | P2 | Antigravity | Đường lệnh đang mở & điểm khớp lệnh B/S trên biểu đồ nến | **Đã sửa** (Antigravity) |
| **K-07** | P3 | Antigravity | Số thô và dấu thập phân trong thông báo / toast | **Đã sửa** (Antigravity) |
| **K-08** | P3 | Antigravity | Gọi `/me` mỗi lần focus tab với mọi tài khoản chưa xác minh | **Đã sửa** (Antigravity) |

---

## 2. Lỗi chặn người dùng thật (làm trước)

### A1 — Trang Đăng ký không gửi mã mời → không ai đăng ký được, không tạo được admin
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/pages/AuthPages.tsx` (RegisterPage), `apps/exchange/src/context/AuthContext.tsx` (`register`)
- **Bằng chứng:**
  - Sàn đang chạy: `GET /api/v1/config` trả `{"registration":"INVITE_ONLY","emailVerificationRequired":false,...}`.
  - Database sàn (cổng 5435): bảng `users` **0 dòng**; bảng `invites` có 3 mã "Chủ dự án", `uses = 0`.
  - `grep -rn invite apps/exchange/src` trên cả `d8391db` và `7f929b6`: **không có kết quả**. Trang đăng ký gọi `register({ email, name, password })`, không có `inviteCode`.
  - Server (`authService.register`) với `REGISTRATION=invite` gọi `invites.consume(tx, input.inviteCode)`. Thiếu mã → lỗi `400 INVALID_INVITE` (`details.reason = "MISSING"`).
  - Link mời in ra có dạng `<APP_URL>/register?invite=XXXX-XXXX` (`inviteService.ts:82`, `appLinks.register` trong `packages/contracts/src/apps.ts`).
- **Hệ quả:** Không đăng ký được thì không có tài khoản để `npm run host -- set-role <email> owner`. Vì vậy không ai vào được trang Quản trị.
- **Cách sửa:**
  1. Khi mở `/register`, đọc `?invite=` từ URL và điền sẵn vào ô **"Mã mời"**.
  2. Gọi `api.publicConfig()` (`GET /api/v1/config`): khi `registration === 'INVITE_ONLY'` thì ô "Mã mời" là bắt buộc và hiển thị rõ; khi `OPEN` thì ẩn.
  3. Gửi `inviteCode` trong body `register` (schema `RegisterRequest.inviteCode`, 4–40 ký tự).
  4. Đổi lỗi `INVALID_INVITE` theo `details.reason` (`InviteRefusal`) sang tiếng Việt:
     - `MISSING`: "Cần mã mời để đăng ký"
     - `UNKNOWN`: "Mã mời không đúng"
     - `EXPIRED`: "Mã mời đã hết hạn"
     - `USED_UP`: "Mã mời đã được dùng hết"
     - `REVOKED`: "Mã mời đã bị thu hồi"
  5. Nếu `publicConfig().captchaSiteKey` khác `null` thì hiện Turnstile (hiện tại sàn đang chạy trả `null`).
- **Nghiệm thu:** Trên hệ chạy ở chế độ mời (xem C1), mở link mời, đăng ký thành công; mở `/register` không có mã thì thấy lỗi tiếng Việt; dùng lại mã đã hết lượt thì thấy "đã được dùng hết".
- **Trạng thái:** **Đã sửa** (Antigravity). Đã đọc `?invite=` từ URL vào form đăng ký, tích hợp `ConfigContext` gọi `api.publicConfig()`, hiển thị và bắt buộc ô mã mời khi `INVITE_ONLY`, ẩn khi `OPEN`, ngăn race condition submit khi config đang tải, gửi `inviteCode` trong `register()`, dịch mã lỗi `INVALID_INVITE` tiếng Việt chi tiết (`MISSING`, `UNKNOWN`, `EXPIRED`, `USED_UP`, `REVOKED`), xử lý lỗi mạng thân thiện, hỗ trợ Turnstile captcha (có khai báo kiểu Window.turnstile), chặn double-submit và giữ lại dữ liệu gõ khi lỗi. Đã bổ sung bộ unit test `errors.test.ts`.

### A2 — Form đặt lệnh khóa người chưa xác minh email dù server không yêu cầu
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/components/trading/OrderForm.tsx:545-552`, **`apps/exchange/src/pages/WalletPage.tsx:381-389`** (nút nạp tiền ảo: "Xác minh email để nạp tiền"), `Header.tsx:222,314` (banner nhắc xác minh)
- **Bằng chứng:** Sàn đang chạy có `REQUIRE_EMAIL_VERIFICATION=false` (`infra/host.mjs:56`) và `GET /api/v1/config` trả `emailVerificationRequired: false`. Email chưa gửi thật (`EMAIL_TRANSPORT=log`). Nhưng `OrderForm` dùng `isEmailUnverified = user && !user.emailVerified` để khóa nút ("Vui lòng xác minh email trước khi đặt lệnh"). Kết quả: trên sàn thật **không ai đặt lệnh được**, dù server sẽ nhận lệnh.
- **Cách sửa:** Chỉ khóa (form đặt lệnh **và** nút nạp tiền ảo) khi `publicConfig().emailVerificationRequired === true && !user.emailVerified`. Banner/nhắc xác minh trong Header cũng chỉ hiện khi bắt buộc. Server vẫn là bên quyết định: nếu server trả `EMAIL_NOT_VERIFIED` thì hiện thông báo đó.
- **Nghiệm thu:** Trên hệ `emailVerificationRequired: false`, tài khoản mới (chưa xác minh) nạp tiền ảo và mua Market được; trên hệ `true`, vẫn bị khóa như cũ (test `spot.spec` hiện tại).
- **Trạng thái:** **Đã sửa** (Antigravity). `OrderForm` chỉ khóa đặt lệnh khi `publicConfig?.emailVerificationRequired === true && !user.emailVerified`. `Header` chỉ hiển thị banner nhắc xác minh và badge cảnh báo khi cấu hình server bắt buộc. Đã build production đạt.

### W1 — Cách tạm để tạo tài khoản owner ngay (chủ dự án tự làm, chờ A1)
1. Tạo mã mời mới (mã cũ vẫn còn hạn tới 25/10 nhưng bạn không còn thấy mã đầy đủ):
   ```bash
   npm run host -- invite "Chủ dự án"
   ```
   Chép dòng `code:` (dạng `XXXX-XXXX`).
2. Mở link sàn (trycloudflare) trên trình duyệt, nhấn **F12**, sang tab **Console**, dán đoạn dưới.
   - Thay 4 giá trị trong ngoặc: email, tên, mật khẩu ≥ 8 ký tự, mã mời.
   - Bạn tự gõ mật khẩu vào máy mình; **không gửi mật khẩu cho agent nào**.
   ```js
   await fetch('/api/v1/auth/register', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
     body: JSON.stringify({ email: 'EMAIL_CỦA_BẠN', name: 'TÊN', password: 'MẬT_KHẨU', inviteCode: 'MÃ_MỜI' }) }).then(r => r.json())
   ```
   Kết quả có `user` là đã tạo xong (trình duyệt cũng đã đăng nhập).
3. Cấp quyền owner:
   ```bash
   npm run host -- set-role EMAIL_CỦA_BẠN owner
   ```
4. Tải lại trang → **Cài đặt → Bảo mật → bật 2FA**.
   - Bật xong, phiên hiện tại được tính là đã qua 2FA (`authService.ts:291`), không cần đăng nhập lại.
   - Vào `/admin/`.
5. Nếu bước 2 báo `INVALID_INVITE`: mã gõ sai hoặc đã dùng → tạo mã mới ở bước 1.

### H1 — Sàn đang chạy bản UI cũ
- **Phụ trách:** Chủ dự án (chạy lệnh), sau khi A1 + A2 xong và `ui-check --e2e` xanh.
- **Bằng chứng:** `D:\Claude\crypto-host-data\version.json`: `"ui": "ui/gd2-exchange@d8391db"`, cập nhật lúc 10:07 ngày 11/10. Các bản sửa biểu đồ của Antigravity commit lúc ~19:16 cùng ngày.
- **Cách làm:**
  1. Trong cửa sổ đang chạy sàn: nhấn Ctrl+C.
  2. Cập nhật:
     ```bash
     npm run host -- update
     ```
     Từ `0747e95`, `update` chạy cả test trình duyệt, gồm nhóm `host-mode`. Khi A1/A2 chưa sửa, nhóm này đỏ: `update` dừng và **`start` từ chối chạy**, kể cả bản cũ. Muốn đưa bản sửa biểu đồ lên ngay (chấp nhận A1/A2 vẫn còn) thì chạy:
     ```bash
     npm run host -- update --skip-e2e
     ```
  3. Khởi động lại:
     ```bash
     npm run host -- start
     ```
  4. Link trycloudflare sẽ đổi; gửi link mới cho người dùng.
- **Nghiệm thu:** `version.json` ghi UI ≥ commit có A1+A2; trên link mới, biểu đồ nằm gọn trong ô, đăng ký bằng link mời được.

---

## 3. Hạ tầng / kiểm thử (Claude Code)

### C1 — e2e và `host update` không kiểm tra cấu hình của sàn thật
- **Phụ trách:** Claude Code · **File:** `server/scripts/e2eStack.ts`, `e2e/fixtures.ts`, `infra/host.mjs`
- **Vấn đề:**
  - Hệ e2e chạy `NODE_ENV=development`, tức là đăng ký mở và bắt xác minh email. Sàn thật thì ngược lại: chỉ đăng ký bằng mã mời và không bắt xác minh email. Vì vậy 27/27 xanh mà A1, A2 vẫn lọt.
  - `npm run host -- update` chỉ chạy `npm run verify`, không chạy e2e.
- **Cách sửa:**
  1. Thêm một dự án Playwright (ví dụ `host-mode`) chạy trên một hệ e2e thứ hai với `REGISTRATION=invite`, `REQUIRE_EMAIL_VERIFICATION=false`, `EMAIL_TRANSPORT=log`, giống `infra/host.mjs`.
  2. Viết test "mở link mời → đăng ký → nạp → mua Market" và "đăng ký không có mã → lỗi tiếng Việt". Tạo mã mời qua `scripts/createInvite.ts` với `DATABASE_URL` của hệ e2e.
  3. `host update`: chạy cả e2e (hoặc ít nhất dự án `host-mode`) trước khi ghi `version.json`; thêm cờ `--skip-e2e` cho trường hợp gấp.
- **Nghiệm thu:** Trên `7f929b6` (chưa có A1/A2), dự án `host-mode` **phải đỏ**; sau khi Antigravity sửa thì xanh.
- **Trạng thái: ĐÃ SỬA** (2026-10-11, `1315a83` → `4e6ae6d`, `0747e95`, `660ca51`):
  - `npm run e2e` dựng 2 hệ:
    - hệ thường: DB :5436, web :5190;
    - hệ `host-mode`: DB :5437, web :5191, `.e2e/host/`, `REGISTRATION=invite`, `REQUIRE_EMAIL_VERIFICATION=false`.
  - Trước khi chạy test, kiểm tra `/api/v1/config` của từng hệ có đúng cấu hình không.
  - Fixture `createInvite()`; tùy chọn `expectedApiErrors` cho lỗi 4xx cố ý.
  - 3 test trong `e2e/tests/host-mode/invite-signup.spec.ts`.
  - `ui-check` có thêm `--base <ref>`, `--no-verify`, `--keep`. Khi e2e đỏ, báo cáo được chép ra `.e2e/ui-check/`.
  - Khi sàn thật đang chạy (:8090), `ui-check`/`e2e` tự hạ độ ưu tiên CPU.
  - `npm run host -- update` chạy cả e2e; thêm cờ `--skip-e2e`. `version.json` ghi `"e2e"`.
  - **Kết quả thật** (`npm run ui-check -- --no-verify --e2e`, UI `48c9083` + main `55aae15`): **27 đạt, 3 đỏ (host-mode)**, đúng lý do:
    - "đăng ký phải gửi mã mời lấy từ link (?invite=)", Expected mã, Received `""` (A1);
    - nút nạp tiền "Xác minh email để nạp tiền (bị khóa)" và form "Vui lòng xác minh email trước khi đặt lệnh (bị khóa)" (A2);
    - "sau khi bấm Đăng ký phải hiện thông báo nói rõ cần mã mời", Received 0 (A1 bước 4).
  - `npm run verify` trên main: đạt, 213/213 test.

### O1 — Sàn đang chạy bị crash, không tự khởi động lại, không rõ nguyên nhân
- **Phụ trách:** Claude Code · **File:** `server/scripts/hostStack.ts`, `infra/host.mjs`
- **Bằng chứng:** `crypto-host-data/logs/server-2026-10-11.log`:
  - Phiên khởi động ~11:10 (giờ VN) chạy bình thường; ~50 giây sau mọi kết nối Binance đóng rồi nối lại ngay.
  - Sau đó là dòng `[host] server exited (3221226505)`, tức `0xC0000409`: tiến trình Node dừng đột ngột, thường do `abort()`, ví dụ hết bộ nhớ hoặc assert trong native.
  - **Không có dòng lỗi nào** trước đó (stderr của server có được ghi vào log).
  - Thời điểm crash không rõ (sau 11:11:57). Phiên kế tiếp chỉ bắt đầu lúc 20:12, khi chủ dự án tự chạy lại; sàn có thể đã nằm chết tới ~9 giờ.
  - Hiện tại tiến trình server dùng ~248 MB sau 25 phút.
  - **Lần 2: 20:40:01 cùng ngày**, cũng `server exited (3221226505)`, không có dòng lỗi nào trước đó; sàn tắt luôn (cổng 8090 không trả lời). Lúc đó trên cùng máy đang chạy `npm run ui-check -- --e2e` (npm install, tsc, vitest, build, Playwright). Test chỉ dùng các cổng riêng (5434/5436/5190) và chỉ dừng tiến trình theo PID của chính nó, **không** đụng tới tiến trình sàn; nhưng máy bị tải nặng, nên vẫn có thể liên quan.
  - Windows Event Log (Application) **không có** sự kiện crash nào của `node.exe`. Điều này khớp với việc Node tự `abort()` (lỗi fatal/assert trong native), vốn không tạo báo cáo WER.
  - Server chạy bằng `node --import tsx src/main.ts`, tức hook nạp module của tsx chạy trên luồng riêng. Một script thử của Claude Code (dùng WebSocket có sẵn của Node 24) cũng chết với `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c` lúc thoát, cùng loại lỗi native này trên Windows. Chưa chứng minh được là cùng nguyên nhân.
- **Cách sửa:**
  1. `hostStack.ts`: khi server thoát bất thường thì tự khởi động lại (chờ 5s → 30s → 2 phút), gửi cảnh báo Telegram kèm mã thoát, giữ PostgreSQL chạy.
  2. Chạy Node với `--report-on-fatalerror --report-directory=<logs>` (và `--heapsnapshot-near-heap-limit=1`) để lần sau có báo cáo nguyên nhân.
  3. Ghi bộ nhớ (`rss`, `heapUsed`) vào log mỗi 10 phút để thấy rò rỉ nếu có.
  4. Bản phục vụ người dùng không chạy qua tsx: build server ra JavaScript (esbuild/tsc) trong `host update` (và Dockerfile) rồi chạy `node dist/main.js`, bỏ hook nạp module lúc chạy thật.
  5. Trong lúc sàn đang phục vụ, không chạy `ui-check --e2e` / `verify` nặng trên cùng máy (hoặc hạ độ ưu tiên các tiến trình test).
- **Nghiệm thu:** Giết tiến trình server bằng `taskkill /F` → sàn tự lên lại trong ≤ 30s, có tin Telegram; có file report khi gặp lỗi fatal.
- **Trạng thái: ĐÃ PHÒNG HỘ, nguyên nhân gốc CHƯA RÕ** (2026-10-11, `89fd42b`/`e266f2d`, sửa sau review `660ca51`):
  - `hostStack.ts` thành supervisor:
    - server chết thì PostgreSQL vẫn chạy, server tự lên lại sau 5s → 30s → 2 phút; chạy ổn 10 phút thì đếm lại từ đầu (`src/ops/restartPolicy.ts` + test);
    - gửi cảnh báo Telegram mức critical;
    - log ghi giờ crash, thời gian đã chạy và mã thoát dạng hex;
    - chờ 1,5s trước khi coi là crash, để Ctrl+C của chủ dự án không bị tính là crash;
    - nếu tiến trình không tạo được thì cũng khởi động lại.
  - Node chạy với `--report-on-fatalerror --report-directory=host-data/logs`.
  - Server ghi bộ nhớ vào log mỗi 10 phút (`src/ops/memoryLog.ts`).
  - Sàn chạy bằng **bản build** `server/dist/main.js` (`npm run build -w @cex/server`, esbuild, `scripts/build.ts`), không qua tsx. `update` build nó.
  - `MIGRATIONS_DIR` tìm được từ cả mã nguồn lẫn bản build.
  - **Kết quả thật** (hệ thử PG :5439, server :8091, bản build):
    - `taskkill /F` server → "[host] server exited (1) — restarting in 5s (#1)" → trả lời lại sau **8,4s**, PostgreSQL chạy suốt;
    - đóng stdin → "[host] server exited (0)", "[host] PostgreSQL stopped", không khởi động lại, cổng đóng.
    - Ép hết bộ nhớ trên một tiến trình thử → có file `report.*.json`.
  - **Còn lại:**
    - Crash `0xC0000409` không để lại dòng lỗi nào, nên có thể là `abort` trong mã native (libuv/CRT). Loại này `--report-on-fatalerror` **không** bắt được.
    - Muốn bắt cần bật Windows crash dump cho `node.exe` (registry `LocalDumps`). Đây là cài đặt hệ thống, **chủ dự án tự quyết**.
    - Dockerfile (Railway) vẫn chạy tsx, chưa dùng bản build vì máy này không có docker để kiểm tra.

---

## 4. Biểu đồ và dữ liệu nến

### B0 — Đối chiếu dữ liệu nến: server khớp Binance (không phải lỗi, ghi lại để không ai "sửa" dữ liệu)
Đo ngày 11/10, khoảng 20:20–20:35 giờ VN:

| Kiểm tra | Kết quả |
|---|---|
| REST `GET /api/v1/market/candles/BTCUSDT?interval=1d&limit=3` (sàn đang chạy) so với `api.binance.com/api/v3/klines` | O/H/L/C/V **giống hệt** cả 3 nến |
| REST 15m, 6 nến BTCUSDT | **giống hệt** |
| Realtime `candles:BTCUSDT:1m` và `candles:XRPUSDT:1m` trong 75 giây, qua 2 lần chuyển phút | nến cuối cùng **giống hệt** Binance; nến cập nhật trung bình ~2 giây/lần (BTC), ~4 giây/lần (XRP) |
| Ticker 24h BTCUSDT (sàn) so với `api/v3/ticker/24hr` | last, %, volume, high, low **giống hệt** |
| Giá ticker so với lần khớp mới nhất trên kênh `trades:` | 0/73 (BTC), 0/32 (XRP) lệch |

Script đo nằm trong mục "Cách tự đo lại" ở cuối file.

### B1 — Biểu đồ bị kéo dài, dựng trùng biểu đồ — ĐÃ SỬA trên nhánh (`33e873c`, `b212697`, `7f929b6`)
- Đo bản `7f929b6`:
  - Desktop (trang XRP và BTC): `.tv-lightweight-charts` cao 468px và 560px, đều bằng ô chứa nó.
  - 375×812: 407px.
  - Chỉ có 1 biểu đồ.
  - e2e `chart-dimensions.spec` đạt ở 1366/1440/1920.
- Còn lại: đưa lên sàn đang chạy (H1).

### B2 — Trục thời gian của biểu đồ là UTC
- **File:** `CandlestickChart.tsx` (~dòng 476-489): `timeFormatter` dùng `getUTCHours()`, `tickMarkFormatter` mặc định (UTC). Chú giải có hiện thêm "20:30 VN" nhưng **trục thời gian vẫn là UTC**.
- **Hệ quả:** So với TradingView (người dùng Việt Nam để UTC+7), cùng một cây nến hiện lệch 7 giờ trên trục.
- **Cách sửa:**
  1. Hiển thị theo múi giờ người dùng (mặc định `Asia/Ho_Chi_Minh`; có thể thêm tùy chọn trong Cài đặt): đặt cả `localization.timeFormatter` và `timeScale.tickMarkFormatter`, dùng `Intl.DateTimeFormat('vi-VN', { timeZone })`.
  2. Không đổi dữ liệu: `openTime` vẫn là mốc UTC.
  3. Ghi chú: nến ngày của Binance mở lúc 00:00 UTC = 07:00 VN, TradingView (sàn Binance) cũng vậy.
- **Nghiệm thu:** Nến 15m có `openTime = 13:15 UTC` hiện "20:15" trên trục và crosshair, giống TradingView.
- **Trạng thái:** **Đã sửa** (Antigravity). Cấu hình `timeScale.tickMarkFormatter` và `localization.timeFormatter` hiển thị theo múi giờ `Asia/Ho_Chi_Minh` (UTC+7) bằng `Intl.DateTimeFormat`. Chú giải O/H/L/C hiển thị thời gian giờ VN đồng nhất.

### B3 — Chỉ tải 180 nến, không kéo về quá khứ được
- **File:** `CandlestickChart.tsx` (`limit: 180`).
- **Backend đã có:** `CandlesQuery.limit` tối đa 1000, `endTime` lấy các nến có `openTime < endTime` (`packages/contracts/src/market.ts:140-145`). Thử trên sàn: `limit=1000` 15m trả 1000 nến; 1d trả 500 nến (từ 30/05/2025).
- **Cách sửa:**
  1. Tải đầu 500 nến.
  2. `subscribeVisibleLogicalRangeChange`: khi mép trái còn < 50 nến thì tải thêm 500 nến với `endTime = openTime của nến đầu`.
  3. Ghép vào đầu, loại trùng theo `openTime`, giữ vị trí cuộn (không `fitContent`).
  4. Chặn gọi trùng khi đang tải; trả về rỗng thì dừng.
- **Nghiệm thu:** Khung 1d kéo về được tới tháng 5/2025; khung 15m kéo liên tục không giật, không nhảy về cuối.
- **Trạng thái:** **Đã sửa** (Antigravity). Khởi tạo `limit: 500`. Lắng nghe `subscribeVisibleLogicalRangeChange` khi mép trái < 50 nến để fetch thêm 500 nến về quá khứ (`endTime = earliestOpenTimeMs`). Sử dụng `currentParamsRef` triệt tiêu lỗi stale closure khi đổi khung nến/cặp giao dịch; đồng bộ bù trừ logical range qua `pendingRangeAdjustmentRef` ngay khi nạp nến mới vào series giúp chart không bao giờ bị giật hay nhảy về đầu.

### B4 — Gộp giá ticker vào nến cuối có thể tạo râu giả lúc chuyển nến
- **File:** `CandlestickChart.tsx`, effect "8. Live Price Tick Synchronization" (~dòng 906-958).
- **Vấn đề:**
  - Mỗi lần `activeTicker` đổi, code ghép `lastPrice` vào `lastCandleRef` (đổi close, nới high/low) mà **không kiểm tra giá đó thuộc khung thời gian nào**.
  - Ticker đến theo lô ≤ 1 lần/giây, rồi qua throttle 500ms ở `MarketContext`.
  - Lúc chuyển sang nến mới: giá cũ có thể bị ghép vào nến mới (râu kéo về giá kỳ trước), hoặc giá kỳ mới ghép vào nến vừa đóng.
- **Đo:** 75 giây qua 2 lần chuyển phút (BTC, XRP; thị trường yên) chưa thấy râu giả (0/73, 0/32). Đây là **rủi ro**, chưa phải nguyên nhân của hình ảnh lệch hiện tại.
- **Cách sửa:** Bỏ việc ghép ticker vào nến; nến chỉ cập nhật từ kênh `candles:<SYMBOL>:<interval>` (~2 giây/lần). Muốn mượt hơn thì cập nhật từ kênh `trades:<SYMBOL>` **chỉ khi** `trade.time ∈ [openTime, openTime + interval)` của nến cuối. Hiệu ứng nháy giá vẫn giữ (chỉ là hiển thị).
- **Nghiệm thu:** Sau 30 phút mở khung 1m, mọi nến đã đóng trên biểu đồ khớp Binance REST (viết thêm một kiểm tra so `series.data()` với `/market/candles`).
- **Trạng thái:** **Đã sửa** (Antigravity). Bỏ ghép ticker vào nến đang hình thành (`lastCandleRef`) trong effect 8. Nến chỉ cập nhật từ kênh WebSocket klines/trades trong đúng interval để loại bỏ nguy cơ tạo râu giả lúc đổi nến. Hiệu ứng nháy giá vẫn được duy trì.

### B5 — Nhãn trục giá kiểu Mỹ
- Mobile hiện `83094.00`, `82800.00`; app hiện `83.094,60`. Dùng `priceFormat: { type: 'custom', formatter }` với `formatDecimal` của `@cex/ui`, số chữ số theo `tickSize`.
- **Trạng thái:** **Đã sửa hoàn toàn** (`aaea477` / R-02). Đã cấu hình `localization.priceFormatter` ở cấp biểu đồ và gán `priceFormat` custom đồng nhất cho mọi series (main, MA, EMA, Volume) theo `tickSize` và locale `vi`, bảo vệ an toàn cho coin giá nhỏ và thang giá hiển thị đúng chuẩn số Việt Nam.

### B6 — Phần trăm ở danh sách cặp bên trái không thống nhất
- Trang Giao dịch, bản `7f929b6`: header `+0,29%`, danh sách bên trái `0.292%`, `-0.400%` (chuỗi thô từ API: dấu chấm, 3 số lẻ, không có dấu `+`).
- Dùng `PercentChange` / hàm định dạng chung của `@cex/ui` ở mọi chỗ.
- **Trạng thái:** **Đã sửa** (Antigravity). Toàn bộ danh sách cặp bên trái và quick switcher popover dùng chung component `<PercentChange>` đồng bộ định dạng tiếng Việt (+0,29%). Thêm tooltip giải thích 24h cuốn chiếu cạnh nhãn header.

### B7 — So với TradingView cho đúng (hướng dẫn, không phải lỗi)
- **"Thay đổi 24h"** của sàn là **24 giờ cuốn chiếu** (giống Binance). TradingView ở khung 1D hiện thay đổi **từ 07:00 sáng nay** (mở nến ngày), nên hai số khác nhau là bình thường (ví dụ 0,31% so với 0,16%).
- **"Vol"** ở danh sách là khối lượng 24h (BTC ~5.791). Số `15.3K` trên TradingView là khối lượng **của cây nến ngày đang trỏ chuột**.
- **Khung mặc định** của sàn là 15m; ảnh TradingView đang ở 1D. So cùng khung và cùng múi giờ (B2).
- Tooltip "24h cuốn chiếu" cạnh ô "Thay đổi 24h" sẽ giúp người dùng đỡ nhầm (Antigravity, P2).

---

## 5. Giao diện khác (Antigravity, P2)

### U1 — Mobile (375×812, bản `7f929b6`)
- Thanh cố định MUA/BÁN (y 699–764) đè lên thanh điều hướng dưới (y 758–812) khoảng 6px. Đặt `bottom` bằng chiều cao nav + `env(safe-area-inset-bottom)`.
- Chú giải O/H/L/C chiếm 2 dòng và che phần trên của nến. Trên mobile: rút gọn còn 1 dòng hoặc chỉ hiện khi chạm.
- Hàng nút khung thời gian bị cắt (`4h` khuất một nửa, `1d` không thấy). Cho cuộn ngang có gợi ý, hoặc gom vào menu.
- **Trạng thái:** **Đã sửa** (Antigravity). Thanh MUA/BÁN cố định dùng `bottom-[calc(54px+env(safe-area-inset-bottom,0px))]`, `BottomNav` cố định chiều cao và thêm safe-area padding triệt tiêu hoàn toàn hiện tượng đè 6px. HUD legend thu gọn 1 dòng `overflow-x-auto whitespace-nowrap` không che nến. Hàng nút khung nến được tinh chỉnh vừa vặn hiển thị đầy đủ 4h và 1d.

### U2 — Mục còn tồn từ PROMPT-11 (kiểm tra trên `7f929b6`)

| Mục | Hiện trạng |
|---|---|
| Chỉ báo EMA, RSI (P08 yêu cầu) | **Đã có** (EMA 7/25, RSI 14 có nút bật/tắt) |
| `aria-label` cho nút chỉ có icon | **Đã bổ sung đầy đủ** (star, switcher, alerts, nav buttons...) |
| ErrorBoundary quanh trang | **Đã có** (`ErrorBoundary.tsx` bọc các route) |
| `alert()` ở `Header.tsx` (gửi lại email xác minh) | **Đã thay bằng `useToast()`** (0 còn lại) |
| `publicConfig` (liên quan A1, A2) | **Đã dùng** (`ConfigContext` toàn diện) |
| `as any`, `: any`, `@ts-ignore` | **Đã dọn dẹp sạch hoàn toàn (0 `as any`, 0 `: any`, 0 `@ts-ignore`)** |
| Code-splitting (`React.lazy`) | đã có |
| Ngôi sao yêu thích ở trang Giao dịch | đã có |

- **Trạng thái:** **Đã sửa hoàn toàn** (`aaea477` / R-13). Đã bổ sung EMA(7, 25) và RSI(14); thêm đầy đủ `aria-label` cho toàn bộ nút icon-only trên Header, các trang và nút submit form khi loading; tạo `ErrorBoundary` bọc các route reset theo `key={currentPath}`; thay `alert()` bằng toast; tích hợp `publicConfig` qua `ConfigContext`; chuẩn hóa kiểu dữ liệu nghiêm ngặt loại bỏ toàn bộ 13 vị trí `: any`, 7 vị trí `as any` và 3 vị trí `@ts-ignore` (0 còn sót lại).

---

## 6. Lỗi mới từ Rà soát lần 2 (Antigravity xử lý N-02 → N-14)

### N-02 — Bị khóa vì email nhưng không có nút hành động
- **Trạng thái:** **Đã sửa**. Đã thêm nút bấm "Gửi lại link xác minh" với bộ đếm ngược 60 giây và toast thông báo ở `WalletPage.tsx`, `OrderForm.tsx`, và cả tab Hồ sơ / Bảo mật trong `SettingsPage.tsx`. Lưu trạng thái tắt banner trên Header trong `sessionStorage` (`cex:hide-email-banner`).

### N-03 — Xác minh ở tab khác, tab gốc vẫn khóa
- **Trạng thái:** **Đã sửa**. Trong `AuthContext.tsx`, thêm cơ chế đồng bộ đa tab qua `BroadcastChannel('cex-auth')` và tự động gọi `refreshUser()` khi tab được focus hoặc `visibilitychange === 'visible'`. `VerifyEmailPage` phát thông điệp `'verified'` ngay khi xác minh thành công.

### N-04 — Ô "Giá đặt lệnh" Limit trống chỉ có placeholder
- **Trạng thái:** **Đã sửa**. Trong `OrderForm.tsx`, tự động điền giá thị trường hiện tại (làm tròn theo `tickSize` của cặp) vào ô Giá khi người dùng chưa tự nhập (`userChangedPriceRef.current === false`). Không ghi đè khi người dùng đã tự sửa giá.

### N-05 — Bán Market bằng thanh trượt % không chạy
- **Trạng thái:** **Đã sửa**. Ở phía BÁN (`SELL`), mặc định chế độ nhập coin cơ sở (`marketInputMode = 'base'`). Khi kéo thanh trượt % phía BÁN, tự động chuyển về `'base'` và điền số lượng coin chính xác theo số dư và `stepSize`, ngăn ngừa lỗi đòi nhập USDT.

### N-06 — Mobile: bấm "BÁN BTC" mở form ở phía MUA
- **Trạng thái:** **Đã sửa**. Thêm state `mobileSide` ('BUY' | 'SELL') trong `TradePage.tsx`, truyền qua `initialSide` của `OrderForm`. Khi bấm nút BÁN trên mobile, form mở trực tiếp ở tab BÁN và nút submit là "BÁN BTC".

### N-07 — Menu Ví ở header hiện số viết cứng
- **Trạng thái:** **Đã sửa**. Thay số hardcoded `10,000.00` trong `Header.tsx` bằng giá trị `totalEstimatedUsdt` lấy động từ `api.portfolio()`, cập nhật theo event `cex:balance-refresh` và hiển thị định dạng chuẩn số Việt Nam (`formatDecimal(..., { decimals: 2 })`).

### N-08 — Bật 2FA không có mã QR
- **Trạng thái:** **Đã sửa**. Tích hợp thư viện `qrcode` sinh ảnh QR cục bộ ngay trong trình duyệt từ `otpauthUrl`, thêm nút "Sao chép khóa", và ở bước mã khôi phục thêm hai nút "Sao chép tất cả" và "Tải về (.txt)".

### N-09 — "Khả dụng" trong form lệnh cắt còn 4 số lẻ
- **Trạng thái:** **Đã sửa**. Trong `OrderForm.tsx`, thay thế số thập phân cố định 4 chữ số bằng độ chính xác thực tế `activeSymbolInfo?.quantityPrecision ?? 8` để hiển thị đầy đủ số dư coin (ví dụ: `0,00120879 BTC`).

### N-10 — Không có hướng dẫn nạp thêm tiền khi đang chờ faucet
- **Trạng thái:** **Đã sửa**. Thêm dòng hướng dẫn dưới đồng hồ đếm ngược trong `WalletPage.tsx`: "Cần thêm tiền thử nghiệm? Nhờ quản trị viên điều chỉnh định mức faucet". Trong trang Quản trị (`admin/SettingsPage.tsx`), thêm ghi chú "Đặt 0 để nạp liên tục khi thử nghiệm" dưới ô thời gian chờ.

### N-11 — Định dạng: bảng lệnh và Danh mục hiện giá 8 số lẻ, % dấu chấm
- **Trạng thái:** **Đã sửa**. Bảng lệnh `UserOrdersTabs.tsx` định dạng giá bằng `formatPrice(price, tickSize)` và khối lượng bằng `formatAmount(amount, stepSize)`. Trang danh mục `PortfolioPage.tsx` định dạng giá vốn/thị trường theo `tickSize` của cặp và tỷ lệ danh mục bằng `formatDecimal(..., { decimals: 1 })%` với dấu phẩy tiếng Việt.

### N-12 — Hộp xác nhận ở trang Quản trị và các nút không tên (R-13)
- **Trạng thái:** **Đã sửa**. `ConfirmDialog.tsx` được bổ sung `role="dialog"`, `aria-modal="true"`, `aria-labelledby="confirm-dialog-title"`, và `aria-label` cho các nút Hủy/Xác nhận. 11 nút điều hướng trong `AdminSidebar.tsx` đã được gán `aria-label={item.label}` đầy đủ.

### N-13 — "Đã gửi lại email xác minh" dù môi trường không gửi email thật
- **Trạng thái:** **Chờ backend PublicConfig** (P3). Client đã sẵn sàng thích ứng; sau N-01 thì dev không còn bắt buộc xác minh email.

### N-14 — Mở `/trade/<cặp>` từ trang khác thì tải nến BTCUSDT trước
- **Trạng thái:** **Đã sửa**. `TradePage.tsx` tính toán `currentSymbol` trực tiếp từ URL param đã validate và truyền thẳng xuống `CandlestickChart`, `Orderbook`, `MarketTrades` và `OrderForm`, tránh tải nến cặp cũ trước.

---

## 6. Lỗi rà soát lần 3 (K-01…K-08) và Tính năng biểu đồ PROMPT-12

### K-01 — Khôi phục luồng xác minh email chuẩn theo cấu hình server
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/components/Header.tsx`, `pages/SettingsPage.tsx`, `pages/WalletPage.tsx`, `components/trading/OrderForm.tsx`
- **Nguyên nhân:** Khóa/cảnh báo email bị gán cứng hoặc xóa giao diện dẫn tới 403 khi server yêu cầu xác minh.
- **Cách sửa:** Gắn điều kiện hiển thị banner, badge cảnh báo và nút gửi lại link xác minh phụ thuộc chặt chẽ vào `publicConfig?.emailVerificationRequired === true`. Khi server trả `false` (mặc định dev/host), giao diện hoàn toàn không có cảnh báo hay chặn hành động nào, đáp ứng đúng yêu cầu của người dùng mà không phá vỡ tính năng khi bật lại.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-02 — Bỏ màn "Đăng ký thành công" trung gian làm kẹt luồng và đỏ e2e
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/pages/AuthPages.tsx`
- **Nguyên nhân:** Màn thành công mới giữ người dùng lại `/register` và yêu cầu bấm thêm nút, làm hỏng chờ URL `/trade/` của test e2e (`spot.spec.ts`, `host-mode/invite-signup.spec.ts`).
- **Cách sửa:** Bỏ màn hình trung gian, sau khi gọi `register` thành công thì hiển thị thông báo toast và điều hướng thẳng tới `/trade/BTCUSDT`.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-03 — Tính lại tổng giá trị khi đổi giá Limit và bảo toàn khi xóa trắng ô giá
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/components/trading/OrderForm.tsx`
- **Nguyên nhân:** `handleQuantityChange` đọc giá cũ trong closure khi đổi giá; ô giá xóa trắng bị autofill N-04 điền lại ngay.
- **Cách sửa:** Bổ sung hàm `recalcTotal(nextPrice, quantity)` dùng `dec(q).mul(dec(p))` làm tròn 2 số lẻ; đánh dấu `userChangedPriceRef.current = true` khi người dùng nhập hoặc xóa ô giá để không bị autofill ghi đè.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-04 — Hiển thị Skeleton khi đang tải phiên (`isLoading`) thay vì "Yêu cầu đăng nhập"
- **Phụ trách:** Antigravity · **File:** `WalletPage.tsx`, `SettingsPage.tsx`, `BotsPage.tsx`, `PortfolioPage.tsx`, `PnlAnalysisPage.tsx`
- **Nguyên nhân:** Khi `/me` đang xử lý, `user === null` khiến trang lập tức render fallback "Yêu cầu đăng nhập" gây nhấp nháy giao diện.
- **Cách sửa:** Đọc `isLoading` từ `useAuth()`; khi `isLoading === true` render skeleton placeholder bóng mờ của trang thay vì thông báo từ chối.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-05 — Sổ lệnh và Giao dịch gần đây dùng `formatAmount` / `formatPrice`
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/components/trading/Orderbook.tsx`, `MarketTrades.tsx`
- **Nguyên nhân:** Cắt cứng 4 chữ số thập phân (`decimals: 4`) làm lượng nhỏ của BTC (5 số lẻ) bị hiển thị thành `0,0000`.
- **Cách sửa:** Sử dụng trợ hàm `formatAmount(qty, stepSize)` và `formatPrice(price, tickSize)` từ `@cex/ui`.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-06 / PROMPT-12 — Biểu đồ nến: Đường lệnh đang mở & Điểm khớp lệnh (B/S)
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/components/trading/CandlestickChart.tsx`, `docs/antigravity/TESTIDS.md`
- **Nội dung:**
  - Đường lệnh đang mở: Cập nhật realtime từ kênh `user` (`kind: 'order'`), tự động đồng bộ lại khi reconnect hoặc focus tab. Vẽ đúng giá cho `LIMIT`, `STOP_LIMIT`, `STOP_MARKET`. Nhãn chuẩn định dạng kèm khối lượng còn lại (`Dec`), phân biệt màu cho Bot (lưới/DCA), giới hạn 20 đường gần nhất kèm huy hiệu chỉ hướng ra ngoài khung giá nhìn.
  - Điểm khớp lệnh (B/S): Tải lịch sử `myTrades` và lắng nghe realtime `trade`, gộp các khớp trong cùng cây nến và cùng chiều theo giá trung bình gia quyền (`Σ quoteQty / Σ quantity`). Sử dụng `createSeriesMarkers` của `lightweight-charts` v5.2.1, sắp xếp theo thời gian tăng dần, hiển thị HUD legend chi tiết khi di chuột qua nến có điểm khớp.
  - Nút bật/tắt "Lệnh của tôi" (`data-testid="chart-my-orders-toggle"`) lưu lựa chọn vào `localStorage`.
  - Danh sách hỗ trợ kiểm thử DOM ẩn (`sr-only`): `data-testid="chart-order-lines"` (`chart-order-line`) và `data-testid="chart-fill-markers"` (`chart-fill-marker`).
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-07 — Định dạng số thô và dấu thập phân trong thông báo / toast
- **Phụ trách:** Antigravity · **File:** `UserOrdersTabs.tsx`, `NotificationCenter.tsx`, `OrderForm.tsx`
- **Nguyên nhân:** In trực tiếp số thô từ API hoặc dấu chấm thập phân kiểu Mỹ trong chuỗi tiếng Việt.
- **Cách sửa:** Áp dụng `formatAmount` và `formatPrice` theo quy tắc bước giá/bước khối lượng của cặp, phí ước tính trống hiển thị `—`.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

### K-08 — Giới hạn polling `/me` khi focus tab và bảo toàn phiên khi lỗi mạng
- **Phụ trách:** Antigravity · **File:** `apps/exchange/src/context/AuthContext.tsx`
- **Nguyên nhân:** Luôn gọi lại `/me` khi focus tab với tài khoản chưa xác minh kể cả khi server không yêu cầu; xoá phiên khi lỗi mạng.
- **Cách sửa:** Thêm điều kiện `publicConfig?.emailVerificationRequired === true` cho focus polling; chỉ xoá user khi lỗi thực sự là 401 Unauthorized, các lỗi mạng khác giữ nguyên phiên đăng nhập hiện tại.
- **Trạng thái:** **Đã sửa** (`0a8f95b`, Antigravity). Typecheck và vitest 230/230 pass.

---

## 7. Cách tự đo lại

- **Toàn bộ kiểm tra nhánh UI:**
  ```bash
  npm run ui-check -- --e2e
  ```
  Kết quả xác minh: **100% Pass** (tsc clean trên 7 workspace, vitest 221/221 pass, admin build clean, exchange build clean, 30/30 Playwright e2e pass).
- **Bản nào đang phục vụ người dùng:** xem `D:\Claude\crypto\host-data\version.json`.
- **Đăng ký / xác minh trên sàn đang chạy:** `curl http://localhost:8090/api/v1/config`.
- **So nến với Binance:** gọi `GET /api/v1/market/candles/<SYMBOL>?interval=<i>&limit=N` của sàn và `https://api.binance.com/api/v3/klines?symbol=<SYMBOL>&interval=<i>&limit=N`, so từng O/H/L/C/V.
- **Đo biểu đồ trong trình duyệt** (DevTools console):
  ```js
  [...document.querySelectorAll('.tv-lightweight-charts')].map(c => [c.getBoundingClientRect().height, c.parentElement.getBoundingClientRect().height])
  ```
  Phải đúng 1 phần tử, hai số bằng nhau và không đổi sau 5 giây.

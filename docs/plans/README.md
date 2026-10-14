# Kế hoạch thực hiện — Module A (Nhật ký giao dịch) và Module C (Engine tín hiệu)

Lập: 2026-10-13, kỹ sư chính (Claude Code). Chủ dự án chọn **A + C**; B (PWA) để sau.

| Module | Giai đoạn ROADMAP | Kết quả cuối | Kế hoạch chi tiết |
|---|---|---|---|
| **A — Nhật ký giao dịch & thống kê cá nhân** | GĐ5 | Mỗi giao dịch có ghi chú, setup, kế hoạch, ảnh. Thống kê thật: win rate, kỳ vọng R, drawdown, theo setup/coin | [module-A-nhat-ky-giao-dich.md](module-A-nhat-ky-giao-dich.md) |
| **C — Engine tín hiệu** | GĐ4 → cổng M3 | Tín hiệu LONG/SHORT từ hệ phân tích đa tác tử, lưu theo phiên bản engine, chấm kết quả bằng dữ liệu chạy thật, trang Admin "Hiệu quả tín hiệu". Qua cổng M3 chỉ mở bước **xem xét** phát hành; bán tín hiệu cần phê duyệt riêng | [module-C-engine-tin-hieu.md](module-C-engine-tin-hieu.md) |
| **T — Thuế crypto Việt Nam** (thêm 2026-10-14, đã duyệt) | ngoài GĐ, làm trước A2 | Trích 0,1% người bán khi khớp Spot theo TT 32/41/2026, sổ thuế riêng, đối soát, báo cáo người dùng/admin; mọi loại giao dịch xử lý đúng luật | [module-T-thue-viet-nam.md](module-T-thue-viet-nam.md) |
| **N — Tin tức real-time & sự kiện vĩ mô** (đề xuất 2026-10-14, **chờ duyệt N-D1…N-D6**) | GĐ4, bổ sung cho C | Hệ phân tích có thêm tin tức (GDELT, RSS) và lịch vĩ mô theo đúng thời điểm hệ biết tin; v0 là cổng rủi ro (không mở tín hiệu sát sự kiện lớn, chặn cặp vừa có tin nóng); dùng tin để dự báo hướng chỉ khi nghiên cứu sự kiện chứng minh được | [module-N-tin-tuc-va-vi-mo.md](module-N-tin-tuc-va-vi-mo.md) |

Hai module dùng chung **[quy ước R và tách nguồn dữ liệu](quy-uoc-R-va-nguon-du-lieu.md)** — mọi sub-agent đọc trước khi làm.

Mỗi module chia thành nhiều **đợt**. Mỗi đợt làm trọn trong 1–2 lượt làm việc, có đầu ra kiểm được và gộp vào `main` riêng.
Có thể dừng giữa hai đợt bất kỳ mà không để dự án ở trạng thái hỏng.

---

## 1. Đội ngũ và vai trò

### Phía Claude Code (backend, dữ liệu, test) — sub-agent định nghĩa ở `.claude/agents/`
| Sub-agent | File | Làm gì | Được sửa | Skill chính |
|---|---|---|---|---|
| **Kỹ sư chính (lead)** — phiên Claude Code chính | — | Đọc kế hoạch, giao việc, rà kết quả, chạy cổng kiểm tra, gộp `main`, đẩy GitHub, viết PROMPT cho Antigravity, báo cáo chủ dự án | mọi chỗ của Claude Code | tất cả |
| `cex-contract-designer` | `.claude/agents/cex-contract-designer.md` | Hợp đồng API: schema, endpoint, mã lỗi, quyền, mock, CHANGELOG | `packages/contracts/**` | `cex-contract-first-api`, `decimal-money-safety` |
| `cex-backend-builder` | `.claude/agents/cex-backend-builder.md` | Bảng + migration, module server, route, job nền, test HTTP/tranh chấp | `server/**`, `packages/core/**` | `cex-feature-delivery`, `db-migration-host-safety`, `decimal-money-safety`, `ledger-order-concurrency`, `exchange-security-review` |
| `cex-quant-engineer` | `.claude/agents/cex-quant-engineer.md` | Toán: thống kê R, rút tín hiệu, chấm kết quả, backtest walk-forward, cổng M3 | `packages/core/**`, `server/src/modules/{analysis,signals,journal}/**`, `server/scripts/**` | `crypto-multi-agent-analysis`, `walk-forward-validation`, `trading-strategy-review`, `position-sizing`, `risk-management`, `slippage-modeling`, `ohlcv-processing` |
| `cex-e2e-acceptance` | `.claude/agents/cex-e2e-acceptance.md` | Test nghiệm thu Playwright cho giao diện, danh sách `data-testid` | `e2e/**`, `docs/antigravity/TESTIDS.md` | quy ước `ui-branch-review` |
| `cex-reviewer` | `.claude/agents/cex-reviewer.md` | Rà độc lập từng nhánh trước khi gộp (chỉ đọc) | không sửa gì | `code-review`, `exchange-security-review` |

### Phía Antigravity (giao diện)
- Nhận việc qua `docs/antigravity/PROMPT-14…` (Module A) và `PROMPT-15…` (Module C). Lead viết các PROMPT này **sau khi hợp đồng của đợt đó đã gộp**.
- Đội agent riêng của Antigravity (`AGENTS.md` trong nhánh UI) dùng như sau:
  - `contracts-integrator`: nối API;
  - `ui-craftsman`, `ux-writer`, `motion-specialist`: dựng màn hình;
  - `anti-ai-auditor`: rà trước khi báo xong;
  - **`e2e-sync-tester` chỉ chạy test và thêm `data-testid`, không sửa `e2e/`** (thư mục của Claude Code — bài học R-18).

### Chủ dự án
Duyệt các quyết định (bảng mục 4), bật/tắt tính năng trên sàn thật, nghiệm thu bằng mắt, quyết định cổng M3.

---

## 2. Quy trình chạy một đợt (lead làm theo đúng thứ tự)

1. **Kiểm điều kiện:** đợt trước đã gộp, quyết định cần thiết đã được duyệt. `git status` trên `main` sạch (không có thay đổi dở của phiên khác — xem mục 3).
2. **Giao việc:** gọi sub-agent bằng công cụ Agent:
   - `subagent_type` = tên sub-agent ở bảng trên;
   - `isolation: "worktree"` (mỗi agent một bản checkout riêng);
   - chạy nền (mặc định);
   - prompt = khối **"Lệnh giao việc"** của đợt trong file module, kèm dòng ghi công commit hiện hành.
   - Hai sub-agent chỉ chạy **song song** khi thư mục được sửa không chồng nhau (đợt có ghi rõ).
3. **Nhận báo cáo:** đối chiếu với mục "Nghiệm thu" của đợt. Thiếu số liệu thật (lệnh + kết quả) thì trả lại.
4. **Rà độc lập:** gọi `cex-reviewer` trên nhánh đó.
   - Có P0/P1 thì giao lại cho đúng sub-agent sửa, rồi rà lại.
   - Với nhánh nhỏ, lead tự rà bằng skill `code-review` thay cho reviewer.
5. **Cổng máy:** trong worktree của nhánh: `npm run verify`. Có đụng giao diện thì thêm `npm run ui-check -- --e2e`. Nếu sàn thật hoặc `npm run dev` đang chạy, ghi rõ trong báo cáo.
6. **Gộp và đẩy:**
   - `git merge --no-ff <nhánh>` vào `main`, chạy `npm run verify` lần nữa trên `main`, rồi `git push origin main`.
   - **Mỗi lúc chỉ gộp một nhánh có migration hoặc đổi hợp đồng.** Nhánh sau phải rebase lên `main` mới và chạy lại `npm run db:generate` (số migration không được trùng).
7. **Bàn giao:** cập nhật đủ các nơi sau.
   - `docs/LOI-HIEN-TAI.md` mục "Backend → UI";
   - `packages/contracts/CHANGELOG.md`;
   - ô đánh dấu trong `ROADMAP.md`;
   - báo cáo `docs/reports/<ngày>-<module>-<đợt>.md`;
   - PROMPT cho Antigravity nếu có việc giao diện.
8. **Báo chủ dự án:** 5–10 dòng gồm làm được gì, số liệu kiểm tra, việc tiếp theo, quyết định cần duyệt.

**Đưa lên sàn thật** (`npm run host -- update` → `start`) chỉ khi chủ dự án đồng ý. Tính năng mới vào sàn thật ở trạng thái **tắt** nếu đợt đó ghi như vậy.

## 3. Quy tắc phối hợp (rút ra từ 2026-10-12/13)
- **Antigravity chỉ làm trong `ui/` (nhánh `ui/gd2-exchange`).** Hệ phân tích hiện chưa commit trong `main` là do Antigravity viết ngoài vùng. Kế hoạch "Phase 3" của nó (`AGENT-HANDOFF/prompts/phase-3.md`) bị Module C thay thế (Module C mục 2.1). `AGENT-HANDOFF/` là của Antigravity: Claude Code chỉ đọc.
- **Không phiên nào sửa thẳng thư mục `main` rồi để dở.** Mỗi phiên/agent làm trên nhánh và worktree riêng, xong thì commit. (Hôm 13/10, phần phân tích chưa commit trong `main` đã chặn việc gộp nhánh UI.)
- Phân vùng thư mục:
  - Antigravity: `apps/**`, `packages/ui/**`;
  - Claude Code: còn lại;
  - không ai sửa `host/`, `host-data/` bằng tay.
- Hợp đồng đổi theo thứ tự gộp. Số phiên bản `0.x.0` lấy theo thứ tự vào `main`, không đặt trước.
- Không báo "xong" khi chưa chạy lệnh thật. Mọi báo cáo dán lệnh và con số.
- Module A và C dùng chung **hàm** R (`@cex/core/rMetrics`, viết ở A1), không dùng chung **dữ liệu**: nhật ký không đọc `signals`, engine không đọc `journal_*`, mọi thống kê có `basis`.
- Không có code nào tự mở tín hiệu cho người dùng khi đạt cổng M3.
- Module C không bao giờ gọi `OrderService` từ `server/src/modules/analysis/`. Bot tín hiệu (nếu bật) ở `server/src/modules/signals/`, chỉ cho tài khoản `is_bot`, có cờ tắt/bật.

## 4. Quyết định — **đã duyệt** (chủ dự án, 2026-10-13), trừ C-D5b đang chờ

Mục tiêu sản phẩm đã được chủ dự án xác nhận ngày 2026-10-13:
- **A** là tính năng cho người dùng sàn, không dùng AI.
- **C** là công cụ nội bộ cho Admin.
- Hai module dùng chung công thức R, tách riêng dữ liệu ([quy ước](quy-uoc-R-va-nguon-du-lieu.md)).
- Cổng M3 chỉ là điều kiện để xem xét phát hành.

Bốn mục được duyệt **có điều kiện**. Điều kiện của chủ dự án là yêu cầu bắt buộc, đã đưa vào thẻ đợt tương ứng.

| Mã | Đã duyệt | Điều kiện của chủ dự án → nằm ở đâu |
|---|---|---|
| A-D1 | Một **vòng giao dịch**, ghi nhận theo **từng lần khớp**. Spot: tối đa 1 mục tự động mở/cặp; mua mở hoặc cộng; bán phân bổ tới hết khối lượng còn mở, phần dư không thuộc mục nào; lẻ dưới bước khối lượng thì đóng. Futures: một mục = một vị thế | — (Module A mục 2.1) |
| A-D2 | Tự ghi **bật mặc định**, tắt được (cửa sổ tự ghi lưu trong bảng riêng của nhật ký, không trong preferences); **không** nhập dữ liệu trước thời điểm kích hoạt; mục tự động người dùng **không xóa được**, chỉ bổ sung ghi chú | **Có cơ chế đối soát** khi dữ liệu giao dịch bị điều chỉnh, đảo ngược hoặc phát hiện thiếu → Module A mục 2.3 + **đợt A3R** (bảng/cột có sẵn từ A2) |
| A-D3 | Ảnh trong PostgreSQL: ≤ 1 MB/ảnh, ≤ 4 ảnh/mục, 50 MB/người, PNG/JPEG/WebP | — (A4) |
| A-D4 | Không có dừng lỗ → R `null`; R theo **dừng lỗ ban đầu**, khóa sau lần giảm vị thế đầu tiên | — |
| A-D5 | Lệnh bot (Grid/DCA/tín hiệu) và tài khoản bot không vào nhật ký | — |
| A-D6 | Ghi chú chữ thuần ≤ 5.000 ký tự | — |
| A-D7 | Lãi lỗ theo giá vốn của chính mục; giao diện ghi chú khác trang Lãi lỗ | — |
| C-D0 | Tiếp nhận hệ phân tích bằng **phương án cô lập an toàn** | Kiểm `git status`, diff, file chưa theo dõi, trạng thái các phiên trước **trước**; rồi mới chọn nhánh/worktree riêng; **không** làm mất, ghi đè hay tự ý commit thay đổi của phiên khác; **xác minh nguồn gốc + giấy phép** trước khi tích hợp → **đợt C0** bước 0–4 (có điểm dừng ở bước 2) |
| C-D1 | Chỉ Admin thấy tín hiệu trong GĐ4; người dùng chỉ sau cổng M3 + phê duyệt phát hành riêng + kế hoạch GĐ6 | — (Module C mục 3.4) |
| C-D2 | Không dùng LLM ở GĐ4 | — |
| C-D3 | Có bot tín hiệu trên sàn ảo, **mặc định tắt** | **Ranh giới kỹ thuật ngăn đặt lệnh thật** + **test chứng minh** bot không thể gửi lệnh tới hệ thống giao dịch thật → **đợt C5**: bốn lớp chặn (kiến trúc, lint, cấu hình từ chối khóa API sàn, test tĩnh toàn server) + test chạy với mạng bị chặn |
| C-D4 | 10 cặp × 1h và 4h | Xác nhận lại sau C0 khi đã đo thời gian một lần phân tích |
| C-D5 | Ngưỡng cổng M3 là **ngưỡng kiểm định ban đầu**: ≥ 100 tín hiệu đã đóng của một phiên bản; kỳ vọng R > 0; cận dưới CI 95% > 0; drawdown ≤ 20R; một cặp ≤ 40%, một tháng ≤ 50% R dương; trung bình R của bot > 0 (nếu bật) | **Định nghĩa phương pháp tính** kỳ vọng R, CI 95%, drawdown, tỷ trọng cặp/tháng, phí/trượt giá, **tín hiệu tương quan** → Module C **mục 3.3.1**. Đạt chỉ là `ELIGIBLE_FOR_REVIEW`, **không** tự cho phép bán (mục 3.4) |
| C-D6 | Nến 1m giữ 60 ngày, lần chạy không ra tín hiệu giữ 90 ngày, báo cáo đầy đủ chỉ cho tín hiệu | — |
| **C-D5b** | **Chờ chủ dự án quyết.** Khi đã đo thật nhiều phiên bản engine, tiêu chí 3 (cận dưới CI 95% > 0) có điều chỉnh theo số phiên bản `k` không? **Đề xuất (A):** có — dùng cận dưới Bonferroni (phân vị 2,5%/k). (B): không — chỉ in để người xem xét cân nhắc | Module C mục 3.3.1 bước 3. Chưa quyết thì C1/C3 vẫn làm được: hợp đồng và hàm có tham số cho cả hai phương án |

Hai điểm phương pháp mới ở mục 3.3.1 cần chủ dự án biết (không phải ngưỡng hiệu quả mới):
1. Cần **≥ 30 ngày có tín hiệu đóng** thì khoảng tin cậy mới có nghĩa; chưa đủ thì cổng ghi `INSUFFICIENT_DATA`.
2. Cần **≥ 2 tháng có tín hiệu đóng** thì tiêu chí tỷ trọng theo tháng mới có nghĩa (một tháng duy nhất luôn chiếm 100%); chưa đủ thì `INSUFFICIENT_DATA`.
3. Mỗi phiên bản chỉ có **một tín hiệu mở cho mỗi cặp**, bất kể chiều và khung, để giảm tín hiệu tương quan.
4. Tiêu chí bot (6) viết chính xác thành "trung bình R của bot > 0" (bằng 0 là không đạt).

Quy tắc **không phải quyết định** (cố định trong kế hoạch, đổi phải có lý do và phiên bản mới):
- mô hình khớp/phí/trượt giá (Module C mục 3.2);
- bảo vệ holdout (C mục 3.5);
- cửa sổ tự ghi, chống ghi trùng và đối soát nhật ký (A mục 2.2–2.3);
- tách nguồn dữ liệu (quy ước chung).

## 5. Thứ tự và làn song song

**Điều kiện trước lượt 1:** chủ dự án đã báo Antigravity (a) ngừng sửa các file hệ phân tích trong `main` và (b) không làm `AGENT-HANDOFF/prompts/phase-3.md`.

Hai làn chạy song song (thư mục khác nhau). Chỗ đụng nhau (hợp đồng, migration) gộp lần lượt.

```
Làn A:  A1 hợp đồng+công thức ─ A2 lõi ─ A3 tự ghi+thống kê ─ A3R đối soát ∥ A4 ảnh ─ A5 giao diện (Antigravity)+e2e ─ A6 phát hành
Làn C:  C0 tiếp nhận ─ C1 hợp đồng ─ C2 chạy ngầm+lưu ─ C3 chấm điểm+thống kê+cổng ─┬─ C5 bot sàn ảo
                                                                    └─ C4 backtest      ─ C6 giao diện Admin+e2e ─ C7 đo thật 1–3 tháng
```
Đề xuất lịch (mỗi ô ≈ 1 lượt làm việc của lead + sub-agent):

| Lượt | Làn A | Làn C | Ghi chú |
|---|---|---|---|
| 1 | A1 | C0 (bước 0–2: kiểm kê, giấy phép, điểm dừng) | A1 đổi hợp đồng. C0 dừng ở bước 2 chờ xác nhận; sau đó bước 3–4 + sửa lỗi, gộp trước A1 nếu kịp |
| 2 | A2 | C1 | A2 có migration 0008; C1 chỉ hợp đồng |
| 3 | A3 | C2 | C2 có migration → rebase sau A2 |
| 4 | A3R ∥ A4 | C3 | A3R và A4 khác file, không migration mới |
| 5 | A5 (Antigravity bắt đầu từ lượt 2 trên mock) | C4 ∥ C5 | C5 cần hợp đồng `FuturesOrder.source` + migration cột nguồn lệnh Futures |
| 6 | A6 phát hành | C6 (Antigravity) | |
| 7+ | — | C7: bật trên sàn thật, báo cáo hằng tuần | Cổng M3 khi đủ 100 tín hiệu |

## 6. Cách chủ dự án ra lệnh
- "Làm đợt A1" / "làm lượt 1": lead chạy đúng quy trình mục 2, báo lại.
- "Duyệt A-D2: tắt mặc định": lead ghi vào bảng mục 4 rồi làm theo.
- "Dừng" bất cứ lúc nào: các đợt đã gộp vẫn chạy được, các đợt dở nằm trên nhánh riêng.

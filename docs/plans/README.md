# Kế hoạch thực hiện — Module A (Nhật ký giao dịch) và Module C (Engine tín hiệu)

Lập: 2026-10-13, kỹ sư chính (Claude Code). Chủ dự án chọn **A + C**; B (PWA) để sau.

| Module | Giai đoạn ROADMAP | Kết quả cuối | Kế hoạch chi tiết |
|---|---|---|---|
| **A — Nhật ký giao dịch & thống kê cá nhân** | GĐ5 | Mỗi giao dịch có ghi chú, setup, kế hoạch, ảnh. Thống kê thật: win rate, kỳ vọng R, drawdown, theo setup/coin | [module-A-nhat-ky-giao-dich.md](module-A-nhat-ky-giao-dich.md) |
| **C — Engine tín hiệu** | GĐ4 → cổng M3 | Tín hiệu LONG/SHORT từ hệ phân tích đa tác tử, lưu theo phiên bản engine, chấm kết quả bằng dữ liệu chạy thật, trang Admin "Hiệu quả tín hiệu". Qua cổng M3 chỉ mở bước **xem xét** phát hành; bán tín hiệu cần phê duyệt riêng | [module-C-engine-tin-hieu.md](module-C-engine-tin-hieu.md) |

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

## 4. Quyết định (bản cuối 2026-10-13, trả lời theo mã)

Mục tiêu sản phẩm đã được chủ dự án xác nhận ngày 2026-10-13:
- **A** là tính năng cho người dùng sàn, không dùng AI.
- **C** là công cụ nội bộ cho Admin.
- Hai module dùng chung công thức R, tách riêng dữ liệu ([quy ước](quy-uoc-R-va-nguon-du-lieu.md)).
- Cổng M3 chỉ là điều kiện để xem xét phát hành.

Cột "Trạng thái" có ba giá trị:
- **Đủ căn cứ**: suy ra từ bất biến của dự án hoặc từ mục tiêu đã xác nhận. Duyệt theo đề xuất là an toàn.
- **Cần chủ dự án quyết**: lựa chọn sản phẩm hoặc chính sách, không có đáp án kỹ thuật đúng duy nhất.
- **Đã xác nhận**: chủ dự án đã nói rõ.

| Mã | Câu hỏi | Đề xuất | Căn cứ | Trạng thái |
|---|---|---|---|---|
| A-D1 | Một mục nhật ký là gì | Một **vòng giao dịch**, ghi nhận theo **từng lần khớp**. Spot: tối đa 1 mục tự động mở cho mỗi cặp; mua mở/cộng, bán phân bổ tới hết khối lượng còn mở, phần dư không thuộc mục nào, còn lẻ dưới bước khối lượng thì đóng. Futures: một mục = một vị thế (Module A mục 2.1) | Dữ liệu `trades`/`futures_trades` có sẵn; mỗi lần khớp chỉ thuộc một mục nên không ghi trùng | **Đủ căn cứ** |
| A-D2 | Tự ghi nhật ký | **Bật mặc định**, tắt được trong Cài đặt. **Không ghi bù** giao dịch trước ngày phát hành. Mục tự động **không xóa được** (chỉ sửa ghi chú) | Thống kê không bị chọn lọc. Nhưng đây là trải nghiệm người dùng: có người không muốn bị ghi tự động, hoặc muốn xóa mục | **Cần chủ dự án quyết** |
| A-D3 | Ảnh lưu ở đâu | Trong PostgreSQL: ≤ 1 MB/ảnh, ≤ 4 ảnh/mục, 50 MB/người, chỉ PNG/JPEG/WebP | Sao lưu một chỗ (logical backup đã có); không cần dịch vụ lưu trữ ngoài; số giới hạn đổi được sau | **Đủ căn cứ** |
| A-D4 | R khi không có dừng lỗ | `null`. Vẫn tính lãi lỗ USDT. R dùng **dừng lỗ ban đầu**, khóa sau lần giảm vị thế đầu tiên | Bất biến 6 (không bịa dữ liệu); chặn R đẹp giả do dời dừng lỗ | **Đủ căn cứ** |
| A-D5 | Lệnh bot (Grid/DCA/tín hiệu), tài khoản bot | Không vào nhật ký | Quy ước tách nguồn dữ liệu, luật 3 | **Đủ căn cứ** |
| A-D6 | Ghi chú | Chữ thuần ≤ 5.000 ký tự | Chặn XSS; không cần trình soạn thảo định dạng | **Đủ căn cứ** |
| A-D7 | Lãi lỗ của một mục | Theo giá vốn **của chính các lần mua trong mục**. Có thể khác trang "Phân tích lãi lỗ" (giá vốn chung tài khoản) khi đang giữ coin từ trước; giao diện ghi chú rõ | Một vòng giao dịch phải tự đủ để tính R. Giá vốn chung của tài khoản bị trộn lẫn coin từ trước | **Đủ căn cứ** (người dùng sẽ thấy hai con số khác nhau) |
| C-D0 | Hệ phân tích đang dở, chưa commit, ở phiên khác | Phiên đó tự commit lên `be/analysis`. Nếu không, bạn cho lead tiếp nhận nguyên trạng (C0) | Code của phiên khác; lead không tự lấy | **Cần chủ dự án quyết** |
| C-D1 | Ai thấy tín hiệu | Chỉ Admin trong GĐ4. Người dùng chỉ thấy sau **cổng M3 + phê duyệt phát hành riêng** (Module C mục 3.4) + kế hoạch GĐ6 | Chủ dự án đã nói 2026-10-13 | **Đã xác nhận** |
| C-D2 | Dùng LLM | **Không** ở GĐ4 | Không tốn phí, kết quả lặp lại được (cần để đo). Đã có bộ kể chuyện tất định | **Đủ căn cứ** |
| C-D3 | Bot tín hiệu vào lệnh trên sàn ảo | **Có**, đợt C5, cờ **mặc định tắt**, tài khoản `is_bot`, tiền ảo, chỉ qua `OrderService` | Kiểm tra chéo mô hình khớp bằng khớp thật (tiêu chí 6). Nhưng bot sẽ đặt lệnh thật trên sàn ảo đang có người dùng | **Cần chủ dự án quyết** |
| C-D4 | Cặp và khung | 10 cặp (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, LINK, AVAX, SUI) × 1h và 4h, đổi được qua cấu hình engine | Đủ tín hiệu để tới 100 trong 1–3 tháng. **Xác nhận lại sau C0**, khi đã đo một lần phân tích mất bao lâu | **Đủ căn cứ** (có điều kiện đo tải) |
| C-D5 | Cổng M3 | ≥ 100 tín hiệu đã đóng của **một** phiên bản; kỳ vọng R ròng > 0; cận dưới khoảng tin cậy 95% > 0; drawdown ≤ 20R; một cặp ≤ 40%, một tháng ≤ 50% R dương; bot cùng dấu. Kết luận tốt nhất chỉ là `ELIGIBLE_FOR_REVIEW` | Các ngưỡng là mức chấp nhận rủi ro của sản phẩm | **Cần chủ dự án quyết** (ngưỡng) |
| C-D6 | Lưu trữ | Nến 1m giữ 60 ngày (đủ chấm tín hiệu giữ tối đa 48 nến 4h = 8 ngày); nến ≥ 1h giữ mãi; báo cáo đầy đủ chỉ lưu cho tín hiệu; lần chạy không ra tín hiệu lưu 90 ngày | Kích thước DB và bản sao lưu | **Đủ căn cứ** |

Quy tắc **không phải quyết định** (cố định trong kế hoạch, đổi phải có lý do và phiên bản mới):
- mô hình khớp/phí/trượt giá (Module C mục 3.2);
- bảo vệ holdout (C mục 3.5);
- chống ghi trùng nhật ký (A mục 2.2);
- tách nguồn dữ liệu (quy ước chung).

## 5. Thứ tự và làn song song

Hai làn chạy song song (thư mục khác nhau). Chỗ đụng nhau (hợp đồng, migration) gộp lần lượt.

```
Làn A:  A1 hợp đồng+công thức ─ A2 lõi ─ A3 tự ghi+thống kê ─ A4 ảnh ─ A5 giao diện (Antigravity)+e2e ─ A6 phát hành
Làn C:  C0 tiếp nhận ─ C1 hợp đồng ─ C2 chạy ngầm+lưu ─ C3 chấm điểm+thống kê+cổng ─┬─ C5 bot sàn ảo
                                                                    └─ C4 backtest      ─ C6 giao diện Admin+e2e ─ C7 đo thật 1–3 tháng
```
Đề xuất lịch (mỗi ô ≈ 1 lượt làm việc của lead + sub-agent):

| Lượt | Làn A | Làn C | Ghi chú |
|---|---|---|---|
| 1 | A1 | C0 | A1 đổi hợp đồng, C0 chỉ đổi `analysis.ts` → gộp C0 trước |
| 2 | A2 | C1 | A2 có migration 0008; C1 chỉ hợp đồng |
| 3 | A3 | C2 | C2 có migration → rebase sau A2 |
| 4 | A4 | C3 | |
| 5 | A5 (Antigravity bắt đầu từ lượt 2 trên mock) | C4 ∥ C5 | |
| 6 | A6 phát hành | C6 (Antigravity) | |
| 7+ | — | C7: bật trên sàn thật, báo cáo hằng tuần | Cổng M3 khi đủ 100 tín hiệu |

## 6. Cách chủ dự án ra lệnh
- "Làm đợt A1" / "làm lượt 1": lead chạy đúng quy trình mục 2, báo lại.
- "Duyệt A-D2: tắt mặc định": lead ghi vào bảng mục 4 rồi làm theo.
- "Dừng" bất cứ lúc nào: các đợt đã gộp vẫn chạy được, các đợt dở nằm trên nhánh riêng.

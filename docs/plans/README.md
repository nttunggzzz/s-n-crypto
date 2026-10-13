# Kế hoạch thực hiện — Module A (Nhật ký giao dịch) và Module C (Engine tín hiệu)

Lập: 2026-10-13, kỹ sư chính (Claude Code). Chủ dự án chọn **A + C**; B (PWA) để sau.

| Module | Giai đoạn ROADMAP | Kết quả cuối | Kế hoạch chi tiết |
|---|---|---|---|
| **A — Nhật ký giao dịch & thống kê cá nhân** | GĐ5 | Mỗi giao dịch có ghi chú, setup, kế hoạch, ảnh. Thống kê thật: win rate, kỳ vọng R, drawdown, theo setup/coin | [module-A-nhat-ky-giao-dich.md](module-A-nhat-ky-giao-dich.md) |
| **C — Engine tín hiệu** | GĐ4 → cổng M3 | Tín hiệu LONG/SHORT từ hệ phân tích đa tác tử, lưu theo phiên bản engine, chấm kết quả bằng dữ liệu chạy thật, trang Admin "Hiệu quả tín hiệu". Qua cổng M3 mới công bố | [module-C-engine-tin-hieu.md](module-C-engine-tin-hieu.md) |

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
- Module C không bao giờ gọi `OrderService` từ `server/src/modules/analysis/`. Bot tín hiệu (nếu bật) ở `server/src/modules/signals/`, chỉ cho tài khoản `is_bot`, có cờ tắt/bật.

## 4. Quyết định cần chủ dự án duyệt (trả lời theo mã)

| Mã | Câu hỏi | Đề xuất của kỹ sư chính |
|---|---|---|
| A-D1 | Một mục nhật ký là gì | Một vòng giao dịch: Spot = nhóm lệnh cùng cặp (mua vào → bán ra), Futures = một vị thế |
| A-D2 | Tự tạo mục cho mọi giao dịch | **Bật mặc định**, tắt được trong Cài đặt — để thống kê không bị chọn lọc |
| A-D3 | Ảnh lưu ở đâu | Trong PostgreSQL: ≤ 1 MB/ảnh, ≤ 4 ảnh/mục, hạn mức 50 MB/người, PNG/JPEG/WebP |
| A-D4 | R khi không có dừng lỗ | `null` — không tính R, vẫn tính lãi lỗ USDT |
| A-D5 | Lệnh của bot (Grid/DCA) | Không đưa vào nhật ký |
| A-D6 | Ghi chú | Chữ thuần ≤ 5.000 ký tự |
| A-D7 | Lãi lỗ của một mục | Theo giá mua trung bình **của chính các lệnh trong mục**, có thể khác trang "Phân tích lãi lỗ" (giá vốn chung tài khoản) khi đang giữ coin từ trước — giao diện ghi chú rõ |
| C-D1 | Phạm vi GĐ4 | Chỉ tạo + đo tín hiệu; người dùng **không** thấy tín hiệu tới khi qua M3 |
| C-D2 | Dùng LLM | **Không** ở GĐ4 (bộ kể chuyện tất định có sẵn; không tốn phí, kết quả lặp lại được) |
| C-D3 | Bot tín hiệu vào lệnh trên sàn ảo (tài khoản `is_bot`, tiền ảo, OCO) | **Có** — đúng P06, đợt C5, mặc định tắt |
| C-D4 | Cặp và khung theo dõi | 10 cặp thanh khoản cao (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, LINK, AVAX, SUI) × khung 1h và 4h; đổi được qua cấu hình engine |
| C-D5 | Cổng M3 | ≥ 100 tín hiệu đã đóng **của cùng một phiên bản engine**; kỳ vọng R ròng > 0 với cận dưới khoảng tin cậy 95% > 0; drawdown ≤ 20R; không cặp nào > 40% lợi nhuận; chủ dự án quyết cuối |
| C-D6 | Lưu trữ | Nến 1m giữ 60 ngày; nến ≥ 1h giữ mãi; báo cáo phân tích đầy đủ chỉ lưu cho tín hiệu; lần chạy không ra tín hiệu lưu bản rút gọn 90 ngày |
| C-D0 | Hệ phân tích đang dở ở phiên khác | Phiên đó dừng, commit lên nhánh `be/analysis`, hoặc cho phép lead tiếp nhận nguyên trạng (đợt C0) |

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

# Tổng quan tiến độ — 2026-10-13 (kỹ sư chính)

Ảnh chụp trạng thái thật của dự án: đã kiểm git, cổng test, sàn tự host, tài liệu, việc đang dở.

## 1. Đang ở đâu (một câu)
Sàn mô phỏng **Spot + Futures + Bot + Admin đã chạy đầy đủ trên máy chủ dự án**, qua cổng kiểm tra trọn bộ: verify 232/232, e2e 39/39.
Đó là mốc **M1 + M2 + Admin** (trên sàn tự host thay cho staging cloud).
Chưa làm: **engine tín hiệu** (GĐ4, mới bắt đầu ở một phiên khác), nhật ký (GĐ5), web tín hiệu (GĐ6), app (GĐ7).

## 2. Tiến độ theo giai đoạn

| Giai đoạn | Backend (Claude Code) | Giao diện (Antigravity) | Ghi chú |
|---|---|---|---|
| 0 Hạ tầng | ✅ monorepo, Docker, CI, backup Railway, cảnh báo Telegram, sàn tự host (`npm run host`) | ✅ design system `packages/ui` | Railway **chưa thuê**; GitHub **lệch 26 commit**, nhánh UI **chưa đẩy lên** (mục 3) |
| 1 Sàn lõi (M1) | ✅ | ✅ đăng ký/đăng nhập, ví, giao dịch | Email thật (Resend) và captcha chờ tên miền/khóa |
| 2 Sàn đầy đủ (M2) | ✅ Stop/OCO/TP-SL/trailing, danh mục, CSV | ✅ form lệnh nâng cao, chart MA/EMA/RSI, lệnh + điểm khớp B/S trên chart (PROMPT-12) | e2e `trade-form`, `chart-orders` xanh |
| 3 Admin | ✅ quyền, 2FA, audit, cộng/trừ, dừng sàn, đối soát, mã mời | ✅ 13 trang admin | e2e `admin.spec` 5/5 |
| 2.5 / 2.6 / F | ✅ 50 cặp, bot lưới, DCA, PnL, bảo mật OKX, Futures cô lập 20× | ✅ trang Bot, PnL, Futures | Futures v2 (cross, hedge) chưa làm — chưa ai yêu cầu |
| 4 Engine tín hiệu | 🟡 **đang dở, chưa commit**: hệ phân tích đa tác tử (`packages/core/src/quant.ts`, `packages/contracts/src/analysis.ts`, `server/src/modules/analysis/`, ~3.500 dòng, 20/20 test, typecheck sạch) — chỉ tư vấn, chạy bằng CLI, chưa nối API, chưa thu tín hiệu thật | — | Cổng M3: ≥ ~100 tín hiệu thật, kỳ vọng sau phí > 0 |
| 5 Nhật ký | ⬜ (một phần thống kê đã có trong PnL) | ⬜ | |
| 6 Web tín hiệu (M3) | ⬜ | ⬜ | `adminSetSignalsAccess` có sẵn, chưa dùng |
| 7 App (M4) | ⬜ | ⬜ | PWA → Capacitor |

Sàn tự host: `host-data/version.json` = `main 4e82608 + ui a225402`, verified, e2e passed (cập nhật 2026-10-13 07:27). **Đang tắt** — chờ chủ dự án `npm run host -- start`.

## 3. Rủi ro và lỗi cần làm tiếp (xếp theo mức)

| # | Mức | Vấn đề | Bằng chứng | Phụ trách | Việc tiếp |
|---|---|---|---|---|---|
| 1 | **P0** | **Mất code nếu máy hỏng**: `main` hơn `origin/main` 26 commit; nhánh `ui/gd2-exchange` (toàn bộ giao diện) **chưa từng đẩy lên GitHub** | `git rev-list --count origin/main..main` = 26; `git ls-remote` chỉ có `main` | Chủ dự án duyệt → Claude Code đẩy | `git push origin main ui/gd2-exchange` (CI GitHub sẽ chạy lại) |
| 2 | **P0** | **Dữ liệu người dùng thật chỉ được sao lưu khi tắt/cập nhật sàn** (sao chép thư mục lúc PostgreSQL dừng), cùng ổ đĩa, không có bản ngoài máy | `infra/host.mjs` `coldBackup()`; bản mới nhất `host-data/backups/pgdata-2026-10-11…` | Claude Code | Thêm `npm run host -- backup` (pg_dump lúc đang chạy) + lịch Windows Task Scheduler hằng đêm + chép sang ổ/đám mây khác; diễn tập khôi phục |
| 3 | **P1** | **Hai phiên cùng sửa thư mục `main` chưa commit** (module phân tích) → không gộp được nhánh UI vào `main` (cùng sửa `.gitignore`), dễ ghi đè nhau | `git status`: `M .gitignore`, `?? server/src/modules/analysis/`… | Chủ dự án / phiên kia | Phiên kia làm trên nhánh `be/analysis` (worktree riêng) và commit; sau đó Claude Code gộp UI vào `main` |
| 4 | **P1** | **Người dùng thật không tự đặt lại mật khẩu được**: sàn tự host dùng `EMAIL_TRANSPORT=log` (email chỉ vào log) | `infra/host.mjs` `.env.host`; CHANGELOG 0.12.0 `emailDelivery: 'log'` | Chủ dự án (tên miền + Resend) / Claude Code | Trước khi có email: lệnh vận hành tạo link đặt lại mật khẩu cho người dùng (đề xuất, chưa làm); sau đó Resend |
| 5 | **P1** | **Crash `0xC0000409` chưa rõ nguyên nhân** (O1). Supervisor tự khởi động lại, nhưng gốc rễ chưa biết | `docs/LOI-HIEN-TAI.md` O1 | Chủ dự án quyết bật crash dump (registry `LocalDumps`) | Bật dump → lần crash sau có file để phân tích |
| 6 | P2 | Link trycloudflare đổi mỗi lần start → người dùng mất link | `docs/deploy/may-ca-nhan.md` | Chủ dự án | Tên miền + Cloudflare named tunnel (cũng mở đường cho Resend) |
| 7 | P2 | Tài liệu tổng lỗi thời: `ROADMAP.md` (ô P08/P09 vẫn trống), bảng tóm tắt đầu `LOI-HIEN-TAI.md` (A1, A2, H1, B2–B6, U1–U2 vẫn ghi "Mở" dù đã sửa) — agent đọc sẽ hiểu sai | đọc trực tiếp | Claude Code | Làm mới hai bảng (chỉ tài liệu) |
| 8 | P3 | L-01…L-05 (rà soát lần 4): chưa dùng `onClose`/`emailDelivery`, logic gửi lại email chép 4 nơi, B/S chỉ 1.000 lần khớp gần nhất, `%` dấu chấm, `data-testid` form lệnh | `docs/reports/2026-10-13-ra-soat-ui-lan-4.md` | Antigravity | Theo thứ tự trong báo cáo |
| 9 | P3 | Trang UI rất dài (`BotsPage` 1.622 dòng, `FuturesPage` 1.555, `SettingsPage` 1.311), 166 cảnh báo lint UI | `wc -l`, `npm run lint` | Antigravity | Tách component khi sửa tới, không cần đợt riêng |

## 4. Thứ tự đề xuất

**Ngay bây giờ (chủ dự án, ~15 phút):**
1. `npm run host -- start` trong terminal của bạn. Mở link trycloudflare, tạo tài khoản owner bằng `npm run host -- invite "Chủ dự án"`, bật 2FA.
2. Đồng ý cho Claude Code **đẩy `main` + `ui/gd2-exchange` lên GitHub** (rủi ro #1).
3. Bảo phiên đang làm module phân tích chuyển sang nhánh riêng và commit (rủi ro #3).

**Tuần này (Claude Code):**
4. Sao lưu nóng + lịch hằng đêm + bản ngoài máy cho sàn tự host, kèm diễn tập khôi phục (#2).
5. Gộp nhánh UI vào `main` khi #3 xong; làm mới ROADMAP và bảng tóm tắt LOI (#7).
6. Lệnh vận hành tạo link đặt lại mật khẩu khi chưa có email thật (#4) — đề xuất trước khi làm.

**Song song (Antigravity):** L-01, L-02, L-05, L-04, L-03.

**Giai đoạn kế tiếp — engine tín hiệu (GĐ4), cần chủ dự án duyệt hướng:**
7. Rà soát thiết kế hệ phân tích đa tác tử (`docs/architecture/crypto-trading-agents.md`). Chốt ba điều:
   - (a) chỉ tư vấn, **không** tự đặt lệnh trên ví người dùng;
   - (b) lưu từng tín hiệu (bảng `signals`, phiên bản engine) từ **dữ liệu chạy thật** để đo cổng M3;
   - (c) có dùng LLM hay không: chi phí, kết quả không lặp lại được, khóa API.
8. Nối vào hợp đồng và API (theo `cex-contract-first-api`), chạy ngầm thu tín hiệu 1–3 tháng; trang "Hiệu quả tín hiệu" trong admin (P09).
9. Chỉ khi qua cổng M3 mới làm web tín hiệu (GĐ6).

**Sau đó:** tên miền → Resend + named tunnel (#4, #6) → cân nhắc Railway; nhật ký giao dịch (GĐ5); PWA/app (GĐ7).

## 5. Agent và skill — có nên thêm?

Hiện có **23 skill** trong `.claude/skills`:
- 10 skill dự án: hợp đồng, tiền, sổ cái, realtime, trạng thái UI, bảo mật, migration, giao tính năng, rà soát UI, bảo trì skill;
- 1 skill mới của phiên phân tích: `crypto-multi-agent-analysis`;
- 12 skill giao dịch nhập từ ngoài: regime, volatility, walk-forward, vectorbt…

Antigravity có thêm 8 agent và ~14 skill trong `.agent/`.

**Không nên thêm nhiều.** Chỗ thiếu thật không phải số lượng agent, mà là vận hành và đối chiếu bằng chứng. Đề xuất:

| Đề xuất | Loại | Vì sao | Ưu tiên |
|---|---|---|---|
| `host-ops` — sổ tay vận hành sàn tự host: start/stop/update, sao lưu/khôi phục, đọc log crash, mời người dùng, kiểm tra sức khỏe (chỉ đọc trước, thao tác phải hỏi) | Skill dự án | Sàn tự host giờ là "production" có người dùng thật; hiện kiến thức này rải ở `host.mjs`, `may-ca-nhan.md`, LOI O1 | **Cao** |
| Lịch tự động hằng đêm trên máy: sao lưu + `npm run ui-check` (không e2e khi sàn đang phục vụ) gửi kết quả về Telegram | Tác vụ định kỳ (Windows Task Scheduler) | Phát hiện hỏng sớm, không cần agent chạy liên tục | Cao |
| Dùng **CI GitHub có sẵn** (`ci.yml`, `backup.yml`) bằng cách đẩy code | Không thêm gì | Đã viết nhưng chưa chạy cho 26 commit gần nhất | Cao |
| Kết hợp `crypto-multi-agent-analysis` với `trading-strategy-review` + `walk-forward-validation` thành **cổng bằng chứng M3** (không công bố tín hiệu khi chưa qua) | Quy trình (sửa skill có sẵn) | Rủi ro số 3 của ROADMAP: tín hiệu không có lợi thế | Trung bình — khi bắt đầu GĐ4 |
| Rà bảo mật trước khi mời người ngoài nhóm (skill `exchange-security-review` có sẵn) | Dùng skill có sẵn | Sàn công khai qua internet, đăng nhập thật | Trung bình — trước khi mời rộng |
| Agent gọi LLM trong đường chạy sàn | **Không nên** | Tốn tiền, không lặp lại được, khó kiểm thử; hệ phân tích nên giữ chế độ tư vấn | — |

## 6. Số liệu đã kiểm (2026-10-13)
- `npm run ui-check` (UI `a225402` + main `bbe2a53`): verify đạt — typecheck mọi workspace, lint 0 lỗi / 166 cảnh báo UI, **232/232 test**, build 2 app.
- `npm run ui-check -- --no-verify --e2e`: **39 đạt / 0 đỏ**.
- `npm run host -- update`: verified, e2e passed (`host-data/version.json`).
- Module phân tích (chưa commit): `npx vitest run server/src/modules/analysis packages/core/src/quant.test.ts packages/contracts/src/analysis.test.ts` → 20/20; `tsc` server/core/contracts sạch. Không gọi mạng hay LLM, không nối API.
- `origin/main` = `77e7708` (2026-10-11); `main` = `4e82608` (+26).

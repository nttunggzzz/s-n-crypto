# Các phần của dự án & cách phối hợp

Dự án chia thành 11 phần độc lập. Mỗi phần có file riêng mô tả phạm vi, thư mục, giao tiếp và checklist theo giai đoạn (xem [ROADMAP.md](../../ROADMAP.md)).

## Danh sách phần

| Mã | Phần | Phụ trách | Thư mục |
|---|---|---|---|
| [P01](P01-ha-tang.md) | Hạ tầng cloud & vận hành | Claude | `infra/`, `.github/` |
| [P02](P02-hop-dong-api.md) | Hợp đồng API & kiểu dữ liệu dùng chung | Claude | `packages/contracts/` |
| [P03](P03-bao-mat-xac-thuc.md) | Xác thực, phân quyền & bảo mật | Claude | `server/src/modules/auth/`, `server/src/modules/admin/` |
| [P04](P04-du-lieu-thi-truong.md) | Dữ liệu thị trường | Claude | `server/src/modules/market/` |
| [P05](P05-loi-san.md) | Lõi sàn: sổ cái, lệnh, khớp lệnh, danh mục | Claude | `server/src/modules/exchange/` |
| [P06](P06-engine-tin-hieu.md) | Engine tín hiệu | Claude | `server/src/modules/signals/`, `packages/core/` |
| [P07](P07-design-system.md) | Design system | Antigravity | `packages/ui/` |
| [P08](P08-ui-san.md) | Giao diện sàn | Antigravity | `apps/exchange/` |
| [P09](P09-ui-admin.md) | Giao diện Admin | Antigravity | `apps/admin/` |
| [P10](P10-ui-tin-hieu.md) | Giao diện web tín hiệu | Antigravity | `apps/signals/` |
| [P11](P11-app-mobile.md) | App mobile | Antigravity + Claude | `apps/exchange/` (Capacitor) |

## Sơ đồ phụ thuộc

```
                 P02 Hợp đồng API  ◀── điểm gặp nhau duy nhất giữa UI và backend
              ┌──────┴──────────────────────────┐
   Backend (Claude)                        Giao diện (Antigravity)
   P03 Bảo mật ──┐                          P07 Design system
   P04 Thị trường├─▶ P05 Lõi sàn ─▶ P06     ├─▶ P08 Sàn ─▶ P11 App
                 │                          ├─▶ P09 Admin
   P01 Hạ tầng (nền cho tất cả)             └─▶ P10 Tín hiệu
```

## Cấu trúc thư mục (dự kiến)

```
apps/
  exchange/     ← Antigravity  (sàn ảo, sau này đóng gói thành app)
  admin/        ← Antigravity
  signals/      ← Antigravity
packages/
  ui/           ← Antigravity  (component dùng chung cho 3 app)
  contracts/    ← Claude       (UI chỉ import, KHÔNG sửa)
  core/         ← Claude       (logic thuần: chỉ báo, rủi ro, tính toán số thập phân)
server/         ← Claude
infra/          ← Claude
legacy/         ← code cũ từ Google AI Studio, chỉ để tham khảo
docs/           ← cả hai đọc; sửa tài liệu phần của mình
```

## Quy trình làm một tính năng (UI và backend song song)

1. **Claude** viết hợp đồng trong `packages/contracts`: schema request/response, mã lỗi, sự kiện realtime, **dữ liệu mẫu (fixtures)** và mock handler.
2. **Antigravity** dựng giao diện dựa trên hợp đồng, chạy với mock (không cần backend).
3. **Claude** làm backend; test hợp đồng đảm bảo response đúng schema.
4. Tắt mock, chạy `npm run e2e` (test trình duyệt trên backend thật, giá giả lập), sau đó chạy trên staging.
   Mỗi bản review giao diện (`docs/antigravity/REVIEW-xx`) có test nghiệm thu trong `e2e/tests/reviewxx.spec.ts`: mục nào xong thì test đó xanh.
5. Đánh dấu checklist trong file phần tương ứng và ROADMAP.

Cần đổi hợp đồng? UI **không tự sửa** `packages/contracts` — ghi yêu cầu vào [contract-requests.md](contract-requests.md), Claude cập nhật.

## Quy tắc Git khi dùng 2 công cụ AI

- **Không mở cùng một thư mục làm việc trong Antigravity và Claude Code cùng lúc** — dùng 2 bản clone (hoặc `git worktree`) riêng.
- Nhánh: `ui/<tên-tính-năng>` cho Antigravity, `be/<tên-tính-năng>` cho Claude. Gộp vào `main` qua Pull Request; CI phải xanh.
- Mỗi công cụ chỉ sửa thư mục mình phụ trách (bảng trên). Sửa ngoài phạm vi → ghi lý do trong PR.

## Quy tắc tích hợp — để backend, hợp đồng và giao diện luôn khớp nhau

Mục tiêu cuối là **một web sàn chạy được** (sau đó đóng gói thành app). Vì vậy:

1. **Một nguồn sự thật duy nhất là `packages/contracts`.** Giao diện chỉ gọi API qua typed client (`createApiClient`) và nhận realtime qua `ChannelData<…>`; **không** tự viết `fetch` hay tự định nghĩa kiểu dữ liệu API. Server đăng ký mọi endpoint bằng `route()` theo đúng hợp đồng đó.
2. **Tính tiền chỉ bằng `@cex/core`** (cả server lẫn UI). UI chỉ tính để *hiển thị* (ví dụ lãi lỗ theo mark); con số chốt luôn lấy từ server.
3. **Mock = server:** mock kiểm tra đầu vào như server và dùng chung luật/fixture. Giao diện chạy được với mock thì phải chạy được với server thật.
4. **Hợp đồng chỉ thêm, không phá.** Nếu buộc phải đổi, CHANGELOG ghi rõ mục "Thay đổi cần sửa UI".
5. **Cổng gộp `main`:** `npm run verify` phải xanh, gồm typecheck **mọi** workspace (kể cả `apps/*`, `packages/ui`), toàn bộ test và build các app. Hợp đồng đổi mà UI vỡ thì bị chặn ngay ở đây.
6. **Nhịp gộp:**
   - Claude gộp nhánh backend vào `main` khi xanh.
   - Antigravity `git merge main` vào nhánh UI **trước** mỗi lần làm prompt mới.
   - Khi một prompt UI xong, Claude kiểm tra (REVIEW-xx, chạy với server thật) rồi gộp nhánh UI vào `main`.
7. **Chạy cả hệ thống bằng một lệnh:** `npm run dev`, gồm PostgreSQL :5433, API/WebSocket :8080 và mọi app trong `apps/*` với **mock tắt**. Đây là cách kiểm tra cuối cùng trước khi báo xong.

## Quy tắc chung (bắt buộc cho cả hai)

1. **Không bịa dữ liệu.** Dữ liệu mock chỉ nằm trong thư mục `mocks/`/`fixtures/` và **tự tắt trên staging/production**. Thiếu dữ liệu → hiển thị "không có dữ liệu", không thay bằng 0 hay số giả.
2. **Không báo "xong/PASSED" khi chưa chạy test thật.** Ghi rõ đã chạy lệnh gì, kết quả ra sao.
3. **Tiền và khối lượng là chuỗi số thập phân** (`"0.00123400"`), không dùng `number` của JavaScript để tính toán.
4. **Không đặt bí mật (API key, token) trong code frontend hay trong Git.**
5. Thời gian lưu UTC, hiển thị GMT+7.

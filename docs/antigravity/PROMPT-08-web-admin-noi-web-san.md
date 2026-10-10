# PROMPT-08 — Web admin là bảng điều khiển của web sàn: làm song song hai giao diện

> Mở Antigravity ở `D:\Claude\crypto-ui`. Làm sau REVIEW-03 các mục **A0, A1, A6** (sự kết nối dưới đây dựa vào chúng).
> File này **thay** cách đăng nhập riêng của admin trong PROMPT-03 mục 3. Các màn hình còn lại của PROMPT-03 (mục 3, 6), PROMPT-04 (Thông báo, Thông tin coin), PROMPT-05 mục 6 (Hợp đồng Futures) và PROMPT-07 mục 3 (Mã mời) **vẫn giữ nguyên**: làm theo thứ tự ở mục 6 dưới đây.

---

## 1. Ý chính — đọc trước khi code
**Web admin không có dữ liệu riêng.** Nó là bảng điều khiển của web sàn: mỗi nút bấm trong admin thay đổi thứ mà người dùng đang thấy trên web sàn.
Vì vậy hai web là **một sản phẩm**:

```
                 ┌──────────── một server (một địa chỉ) ─────────────┐
 trình duyệt ──▶ │  /            → apps/exchange (web người dùng)    │
                 │  /admin/      → apps/admin    (web quản trị)      │
                 │  /api/v1/...  → cùng một API, cùng một database   │
                 │  /ws          → cùng một kênh realtime            │
                 └───────────────────────────────────────────────────┘
```
- **Một lần đăng nhập:** cùng cookie phiên. Nhân sự đăng nhập ở web sàn (có mã 2FA) là vào được `/admin/`. Đăng xuất ở một bên thì cả hai cùng đăng xuất.
- **Một hợp đồng API** (`@cex/contracts` 0.11.0). Admin đổi dữ liệu → server phát sự kiện realtime → web sàn cập nhật **ngay, không tải lại**.
- **Một bộ giao diện** (`@cex/ui`): nút, bảng, hộp thoại, định dạng số/ngày dùng chung. Thứ gì cả hai app cần thì đưa vào `packages/ui`, **không copy file** từ `apps/exchange` sang `apps/admin`.
- **Mỗi tính năng làm thành cặp:** màn admin + chỗ hiển thị tương ứng bên web sàn, xong cả hai mới sang cặp tiếp (mục 6). Làm xong admin mà web sàn chưa phản ánh thì tính năng **chưa xong**.

## 2. Dựng `apps/admin`
```bash
git merge main            # hợp đồng 0.11.0: ADMIN_BASE_PATH, appLinks, canOpenAdmin, safeNext
npm install
```
- Gói `@cex/admin-web`, React + Vite + Tailwind như app sàn; dùng `@cex/ui`, `@cex/contracts`, `@cex/core`.
- `vite.config.ts`: **`base: '/admin/'`**, cổng **5174**, proxy `/api` và `/ws` → `http://localhost:8080`, giống app sàn.
- Router dùng basename **`/admin`**. Các trang: `/admin/` (Tổng quan), `/admin/users`, `/admin/users/:id`, `/admin/symbols`, `/admin/futures`, `/admin/assets`, `/admin/announcements`, `/admin/invites`, `/admin/settings`, `/admin/audit-logs`, `/admin/reconciliation`, `/admin/roles`.
- `package.json` có `build` (`tsc -b && vite build`): `npm run verify`, Docker và `npm run e2e` tự build app này khi có `apps/admin/package.json`. Server phục vụ bản build ở `/admin/`; mình đã làm phần server.
- Mock: `setMockRole('owner' | 'admin' | 'support' | 'user')`, `setMockRole('admin', false)` = chưa bật 2FA. **Lưu ý:** mock chạy riêng trong từng tab, nên dùng mock thì admin và web sàn **không thấy nhau**. Muốn kiểm tra sự kết nối, chạy server thật (mục 7).

## 3. Thao tác admin → web sàn phải hiện gì
Cột cuối là việc **bên web sàn**: làm cùng lúc với màn admin.

| Thao tác trong admin | API | Web sàn nhận qua | Web sàn phải làm |
|---|---|---|---|
| Dừng / mở sàn khẩn cấp | `adminHaltTrading` / `adminResumeTrading` | kênh `exchange:status` (ngay) | Spot và Futures: khóa form, hiện `trade-block-reason` theo `spotTradeBlock` / `futuresTradeBlock`; mở lại thì tự hết khóa |
| Tắt / bật một cặp Spot | `adminUpdateSymbol` | `exchange:status.disabledSymbols` (ngay); nếu chọn "hủy lệnh" thì có thêm sự kiện `order` (CANCELED) | Như trên, cho đúng cặp đó; lệnh bị hủy biến khỏi "Lệnh đang chờ" |
| Cộng / trừ số dư | `adminAdjustBalance` | kênh `user`, sự kiện `balance` (ngay) | Ví, form lệnh ("Khả dụng"), Tổng tài sản cập nhật ngay; sổ cái có dòng `ADMIN_ADJUST` |
| Reset tài khoản | `adminResetAccount` | `user`: `order` (hủy), `balance` (về 0), `gridBot` / `dcaPlan` (dừng) | Mọi bảng cập nhật; nút "Nhận tiền ảo" dùng lại được |
| Khóa tài khoản | `adminLockUser` | Server xóa phiên và đóng `/ws` với mã **4401** (≤ 30 giây); API trả **401** | Gặp 4401 hoặc 401 → về `/login`, hiện "Phiên đăng nhập đã kết thúc". Đăng nhập lại bị `ACCOUNT_LOCKED` → "Tài khoản đang bị khóa, liên hệ hỗ trợ" |
| Mở khóa | `adminUnlockUser` | — | Đăng nhập lại bình thường |
| Dừng bot lưới / hủy kế hoạch mua định kỳ | `adminStopGridBot` / `adminCancelDcaPlan` | `user`: `gridBot` / `dcaPlan`; bot lưới có thêm thông báo `GRID_BOT_STOPPED` với lý do `ADMIN` | Thẻ bot đổi trạng thái ngay; chuông thông báo ghi "Quản trị viên đã dừng bot" |
| Bật/tắt quyền tín hiệu, đổi vai trò | `adminSetSignalsAccess` / `adminSetRole` | `me` (gọi lại) | Gọi lại `me` khi tab được mở lại (focus) và mỗi 5 phút. Vai trò thành staff → hiện nút "Quản trị" |
| Phí Spot / Futures, cấu hình nạp tiền ảo | `adminUpdateSettings` | `exchangeInfo` (`feeRate`), `futuresContracts` (`makerFee` / `takerFee`), `faucetStatus` | Không có realtime: tải lại khi vào trang Giao dịch / Tài sản. Form lệnh hiện phí theo số **từ API**, không viết cứng |
| Hợp đồng Futures (bật/tắt, đòn bẩy tối đa) | `adminUpdateFuturesSymbol` | `futuresContracts` | Tải lại khi vào trang Futures và khi đặt lệnh bị từ chối; thanh đòn bẩy lấy giới hạn từ `maxLeverage` |
| Thông tin coin | `adminUpdateAsset` | `exchangeInfo().assets` | Tên, nhóm ngành, mô tả ở trang Thị trường / Giao dịch lấy từ đây |
| Đăng / ghim / ẩn thông báo | `adminCreateAnnouncement` / `adminUpdateAnnouncement` | `announcements` | Tải khi mở app và mỗi 5 phút; thông báo `MAINTENANCE` hiện thành dải trên cùng |
| Tạo mã mời | `adminCreateInvite` | link `/register?invite=…` | Trang đăng ký điền sẵn mã (PROMPT-07) |
| Nhật ký quản trị, đối soát | `adminAuditLogs`, `adminReconciliation*` | — (chỉ trong admin) | — |

## 4. Đăng nhập chung: admin **không có** trang đăng nhập riêng
App admin khi khởi động gọi `me`:

| Kết quả | App admin làm |
|---|---|
| 401 (chưa đăng nhập) | Chuyển tới `appLinks.exchange.login(location.href)` (`/login?next=…`) |
| Đã đăng nhập, `!canOpenAdmin(me)` | Màn `admin-no-access`: "Tài khoản không có quyền quản trị" + link về sàn |
| Staff, `me.twoFactorEnabled === false` | Màn hướng dẫn: "Bật 2FA để vào khu quản trị" + link tới **Cài đặt → Bảo mật** của web sàn. Không làm lại màn bật 2FA trong admin |
| API admin trả `TWO_FACTOR_REQUIRED` (phiên đăng nhập không qua bước mã 2FA) | "Đăng nhập lại bằng mã 2FA": đăng xuất rồi chuyển tới `login(next)` |
| API admin trả `FORBIDDEN` | Báo rõ thiếu quyền gì; không văng lỗi |

**Bên web sàn:**
- Trang `/login` đọc `?next=` và chỉ đi tới đó nếu `safeNext(next, [VITE_ADMIN_ORIGIN])` khác `null` (chặn chuyển hướng sang trang lạ).
- Trang `/login` giữ nguyên `next` qua bước nhập mã 2FA.
- Nếu đang đăng nhập rồi mà mở `/login?next=/admin/` thì đi luôn tới `next`.

## 5. Link qua lại (dùng `appLinks`, không tự ghép đường dẫn)
```ts
import { appLinks, canOpenAdmin } from '@cex/contracts';
// web sàn — Header (desktop) và menu tài khoản (mobile)
{canOpenAdmin(me) && <a data-testid="nav-admin" href={appLinks.admin.home(import.meta.env.VITE_ADMIN_ORIGIN)}>Quản trị</a>}
// web admin — Header
<a data-testid="admin-open-exchange" href={appLinks.exchange.home(import.meta.env.VITE_EXCHANGE_ORIGIN)}>Mở sàn</a>
```
- `npm run dev` đặt sẵn `VITE_EXCHANGE_ORIGIN=http://localhost:5173` và `VITE_ADMIN_ORIGIN=http://localhost:5174`. Bản build để trống, nên link là `/` và `/admin/` trên cùng địa chỉ. Khai báo hai biến này trong `vite-env.d.ts`.
- Trong admin:
  - mã cặp ở bảng Cặp giao dịch, lệnh và vị thế của người dùng → `appLinks.exchange.trade(symbol)` hoặc `.futures(symbol)`, mở tab mới, để xem đúng màn người dùng thấy;
  - link mã mời → `appLinks.exchange.register(code)`.
- **Không có** "đăng nhập thay người dùng" hay xem ví người dùng bằng giao diện sàn. Admin chỉ xem qua API admin (có nhật ký).

## 6. Thứ tự làm — mỗi bước một cặp admin + web sàn
| Bước | Web admin | Web sàn (cùng bước) |
|---|---|---|
| 1 | Khung app (`base`, router, Header có `admin-open-exchange`, menu theo quyền), luồng `me` ở mục 4, `admin-no-access` | `nav-admin`; `/login?next=` + `safeNext`; xử lý 4401 / 401 → `/login` |
| 2 | Tổng quan + **Dừng / mở sàn** trên Tổng quan (`admin-trading-state`, `admin-halt-open`, `admin-resume-open`) | `trade-block-reason` trên Spot và Futures theo `exchange:status` (REVIEW-03 A6) |
| 3 | Người dùng: tìm, chi tiết, **Cộng/Trừ số dư**, Reset | Ví: `spot-available-<ASSET>` cập nhật từ sự kiện `balance` |
| 4 | Khóa / mở khóa (`admin-user-status`) | Phiên kết thúc → `/login` + thông báo; lỗi `ACCOUNT_LOCKED` |
| 5 | Tab Bot / Futures / Đăng nhập của người dùng; dừng bot, hủy kế hoạch | Thẻ bot + thông báo "Quản trị viên đã dừng bot" |
| 6 | Cặp giao dịch, Hợp đồng Futures, Cấu hình sàn (phí, nạp tiền ảo), Thông tin coin | Phí, đòn bẩy tối đa, tên/nhóm coin lấy từ API (mục 3) |
| 7 | Thông báo của sàn, Mã mời (PROMPT-07) | Dải thông báo, trang đăng ký điền sẵn mã |
| 8 | Nhật ký quản trị (`audit-row`), Đối soát, Vai trò (chỉ owner) | — |

**Quy tắc chung cho admin** (giữ từ PROMPT-03):
- Ẩn/hiện menu và nút theo `me.permissions` (`hasPermission`), nhưng vẫn xử lý `FORBIDDEN`.
- Không có nút tác động lên chính mình.
- Tài khoản bot: chỉ xem (server trả `BOT_ACCOUNT_PROTECTED`).
- Mọi thao tác thay đổi dữ liệu đi qua **một hộp xác nhận dùng chung**:
  - `confirm-reason`: lý do ≥ 5 ký tự;
  - `confirm-phrase`: gõ `HALT` / `RESUME` / `RESET` cho thao tác nguy hiểm;
  - `confirm-submit`;
  - nêu rõ hậu quả **phía người dùng** (lấy từ cột cuối bảng mục 3, ví dụ "Người dùng sẽ bị đăng xuất khỏi mọi thiết bị").

## 7. Kiểm tra sự kết nối bằng tay (server thật, không cần Binance)
```bash
npm run dev -- --sim                                   # DB + server + cả hai app
npm run admin:set-role -- <email-của-bạn> owner        # sau khi đăng ký ở http://localhost:5173
```
Mở **hai trình duyệt**: một cửa sổ thường (bạn, owner) và một cửa sổ ẩn danh (tài khoản thử).
1. Bạn bật 2FA ở Cài đặt → Bảo mật → bấm "Quản trị" → vào `localhost:5174/admin/`.
2. Đi từng dòng của bảng mục 3 và nhìn cửa sổ ẩn danh:
   - Dừng sàn → form đặt lệnh khóa ngay;
   - Cộng 500 USDT → ví nhảy số ngay;
   - Khóa tài khoản → bị đẩy ra trang đăng nhập.

## 8. Nghiệm thu (không sửa test)
- `e2e/tests/admin.spec.ts`: 5 test hai trình duyệt (nút Quản trị, dừng sàn, cộng tiền + nhật ký, khóa/mở khóa, quyền support chỉ xem).
  `data-testid` ở `docs/antigravity/TESTIDS.md` mục "Web sàn ↔ web admin".
- `npm run verify` xanh (typecheck cả `apps/admin`, build) và `npm run e2e` xanh, gồm cả test cũ.
- Báo cáo `docs/reports/<ngày>-ui-admin.md`: bước nào xong, ảnh chụp từng màn ở 3 vai trò.

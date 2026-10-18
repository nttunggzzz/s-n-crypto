# CEX Sim — sàn giao dịch crypto mô phỏng (Spot + Futures) / Simulated crypto exchange

> ⚠️ **Đây là sàn MÔ PHỎNG. Không có tiền thật, không nạp/rút thật, không phải lời khuyên đầu tư.**
> This is a **simulation**: virtual balances only, no real money, not financial advice. Provided "as is" under the MIT license.

Sàn giao dịch ảo chạy trên máy của bạn: giá thật từ Binance (hoặc giá giả lập khi offline), ví Spot và Futures mô phỏng,
các loại lệnh (market/limit/stop/OCO/TP-SL), bot DCA và bot lưới, sổ cái kép, trang quản trị (admin), 2FA, đối soát số dư.
Viết bằng TypeScript: Node.js + PostgreSQL (nhúng sẵn, không cần cài) + React.

## Chạy thử trên máy bạn (khoảng 5 phút)

Cần: **Node.js 22 trở lên** và git. Không cần cài PostgreSQL, Docker hay tài khoản Binance.

```bash
git clone https://github.com/nttunggzzz/s-n-crypto.git
cd s-n-crypto
npm install
npm run dev -- --sim      # giá GIẢ LẬP, chạy offline
```

- Sàn: http://localhost:5173 · Quản trị: http://localhost:5174 · API: http://localhost:8080
- Dùng giá thật của Binance (cần internet): `npm run dev`
- Dev không bắt xác minh email; link xác minh/quên mật khẩu in ở log của server (dòng `EMAIL (log transport`).
- Tạo tài khoản owner đầu tiên: đăng ký trên web rồi chạy `npm run admin:set-role -- <email> owner`.

Kiểm tra mã: `npm run typecheck`, `npm test` (tự bật PostgreSQL thật trên cổng 5434), `npm run verify` (typecheck + lint + test + build),
`npm run e2e` (Playwright, cần trình duyệt Edge hoặc Chromium).

## Nhánh và lỗi đang mở

Nhánh mặc định `ui/gd2-exchange` là **bản mới nhất, kể cả giao diện Antigravity đang làm**: nó đã gộp cả backend của `main`.
Bản này **còn lỗi đã biết** (chưa được rà soát xong), ghi đầy đủ ở [docs/LOI-HIEN-TAI.md](docs/LOI-HIEN-TAI.md).
Nhánh `main` là bản ổn định cũ hơn, giao diện ít tính năng hơn.

**Gặp lỗi?** Mở một [Issue](https://github.com/nttunggzzz/s-n-crypto/issues/new) ghi: bạn làm gì, thấy gì, đáng lẽ thấy gì, kèm ảnh chụp màn hình nếu có.

## Cấu trúc

```
packages/core        toán thập phân chính xác (decimal.js), luật lot, khớp lệnh theo độ sâu sổ lệnh
packages/contracts   hợp đồng API: zod schema + registry endpoint + client có kiểu + dữ liệu mẫu/mock
packages/ui          thành phần giao diện dùng chung
server/              API, WebSocket /ws, khớp lệnh, ví, futures, bot, admin, dữ liệu thị trường
apps/exchange        giao diện sàn          apps/admin   giao diện quản trị
e2e/                 test trình duyệt (Playwright)
infra/               script chạy dev, verify, e2e, host
docs/                kế hoạch, báo cáo rà soát, hướng dẫn triển khai
legacy/              mã cũ từ Google AI Studio, chỉ để tham khảo (có lỗi đã biết)
```

Quy tắc bất biến của hệ thống (số dư chỉ đổi qua sổ cái, tiền là số thập phân chính xác, một tiến trình server...)
ghi trong [CLAUDE.md](CLAUDE.md). **Đọc trước khi sửa code.**

## Muốn giúp sửa lỗi?

- Danh sách lỗi đang mở, có mã, mức độ, bằng chứng và điều kiện nghiệm thu: [docs/LOI-HIEN-TAI.md](docs/LOI-HIEN-TAI.md).
- Chọn một mục, sửa, rồi chạy `npm run verify`. Mô tả lệnh đã chạy và kết quả thật trong pull request.
- Đổi API: sửa `packages/contracts` trước (schema + endpoint + fixture + mock), rồi mới sửa server và giao diện.
- Phần việc: backend/hợp đồng/core/hạ tầng ở `server/`, `packages/contracts`, `packages/core`, `infra/`; giao diện ở `apps/*`, `packages/ui`.

## Chạy cho nhiều người dùng

Chạy sàn cho người khác vào qua mạng: [docs/deploy/may-ca-nhan.md](docs/deploy/may-ca-nhan.md) (`npm run host`, tunnel Cloudflare)
hoặc [docs/deploy/railway.md](docs/deploy/railway.md) (Docker một service). **Chỉ chạy một tiến trình server** (không bật autoscale).

## Giấy phép

[MIT](LICENSE). Một số skill/agent trong `.agent/` và `.claude/` là của bên thứ ba và giữ giấy phép riêng của chúng.

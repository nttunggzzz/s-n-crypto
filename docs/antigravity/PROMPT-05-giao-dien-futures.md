# PROMPT-05 — Giao diện Futures (hợp đồng vĩnh cửu mô phỏng)

> Dán cho Antigravity **sau khi xong PROMPT-04**: "Chạy `git merge main`, rồi đọc và thực hiện toàn bộ file docs/antigravity/PROMPT-05-giao-dien-futures.md trong worktree D:\Claude\crypto-ui."

> **Nghiệm thu (thêm 2026-10-10):** `npm run e2e` — test `e2e/tests/futures.spec.ts` (chuyển tiền → mở Long → TP/SL → đóng) phải xanh.
> Gắn `data-testid` theo [TESTIDS.md](TESTIDS.md). Dùng hàm sẵn có trong `@cex/contracts` 0.9.0: `createTickerStore(rt, 'futures')`,
> `resolveFuturesSymbol`, `countdown`, `futuresTradeBlock`, `createPager` (README hợp đồng mục 11).

## 0. Bối cảnh
- **Backend Futures đã xong** (hợp đồng API 0.5.0). Đọc:
  - `packages/contracts/CHANGELOG.md` mục 0.5.0;
  - `packages/contracts/README.md` mục 8 (luật sản phẩm + cách hiển thị) — đọc kỹ trước khi làm.
- **Mock đủ cả 26 endpoint và realtime**, làm được giao diện mà không cần server:
  - `setMockFuturesPrice('BTCUSDT', 70000)` → thử lệnh Limit khớp, TP/SL, thanh lý;
  - `mockSettleFunding()` → thử thanh toán funding.
- **Phong cách:** theo PROMPT-04 (token v2, Inter, nền đen, bố cục kiểu OKX). Dùng lại các component đã làm "tái dùng được cho Futures" theo PROMPT-04 mục 13.
- **Phạm vi:** chỉ sửa `apps/*` và `packages/ui`. Thiếu API thì ghi vào `docs/parts/contract-requests.md`.

## 1. Điều hướng
- Menu **Giao dịch ▾**: Spot · **Futures** (bỏ nhãn "Sắp có").
- Route `/futures/:symbol` (mặc định `BTCUSDT`).
- Trang Tài sản có tab **Spot | Futures**.
- Nhãn **"Futures · Mô phỏng"** cạnh tên cặp. Lần đầu vào trang Futures, hiện hộp giới thiệu 3 dòng:
  - đòn bẩy làm lãi/lỗ lớn hơn;
  - có thể bị thanh lý;
  - tiền ảo.

  Có ô "Không hiện lại".

## 2. Trang Futures — desktop
Bố cục như trang Spot v2 (thanh ticker · biểu đồ · sổ lệnh · form · khối dưới), thêm các phần riêng của Futures.

### 2.1 Thanh ticker
Giá gần nhất · **Giá đánh dấu** · **Giá chỉ số** · **Funding / Đếm ngược** (ví dụ `0,0084% · 03:12:45`) · Cao/Thấp/KL 24h.
- Dữ liệu từ `futuresTickers` lúc đầu, rồi kênh `futures:ticker:<S>` và `futures:mark:<S>`.
- Đếm ngược tính từ `nextFundingTime`.
- Với hợp đồng `multiplier > 1`: ghi "1 hợp đồng = 1.000 PEPE" ngay dưới tên cặp.

### 2.2 Biểu đồ
- Nến từ `futuresCandles` + kênh `futures:candles:<S>:<i>`. Có công tắc **Giá gần nhất / Giá đánh dấu**: đường mark vẽ từ kênh mark.
- Trên biểu đồ, với vị thế đang mở, vẽ các đường:
  - **Giá vào** (trắng);
  - **Giá thanh lý** (đỏ, nét đứt);
  - **TP** (xanh) và **SL** (đỏ), kéo được để sửa → gọi `futuresSetTpSl`.
- Lệnh Limit đang chờ vẽ đường ngang như bên Spot.

### 2.3 Form lệnh (cột phải)
- **Hàng trên:** chip **Cô lập** (chế độ ký quỹ, chỉ hiển thị) + chip **Đòn bẩy 10×**. Bấm chip đòn bẩy mở modal:
  - slider 1–`maxLeverage` có mốc 1/5/10/15/20, ô nhập;
  - cảnh báo màu khi > 10×.
  - Lỗi `LEVERAGE_LOCKED` → "Đóng vị thế và hủy lệnh của cặp này trước".
- **Tab loại lệnh:** Giới hạn | Thị trường.
- **Ô nhập:** Giá (Limit), Khối lượng — chuyển được đơn vị coin ↔ USDT; khi chọn USDT, tính khối lượng = USDT × đòn bẩy ÷ giá, làm tròn xuống theo `stepSize` bằng `@cex/core`.
- **Thanh trượt 0–100%** theo `futuresAccount.available` × đòn bẩy.
- **Checkbox:** TP/SL (2 ô giá, kiểm tra hướng giống server), Chỉ giảm vị thế.
- **Thông tin** (tính bằng `@cex/core`, chỉ để hiển thị):
  - Ký quỹ cần = `initialMargin(price, qty, leverage)`;
  - Phí ước tính (taker);
  - Giá thanh lý ước tính = `liquidationPrice(...)`;
  - Khả dụng (`futuresAccount.available`) [+ Chuyển tiền].
- **Hai nút lớn:** **Mở Long** (xanh) và **Mở Short** (đỏ). Khi đang có vị thế, đổi nhãn theo ngữ cảnh: "Mua / Đóng Short", "Bán / Đóng Long".
- **Chưa có tiền ở ví Futures:** nút "Chuyển USDT từ Spot" mở modal chuyển tiền (`futuresTransfer`, hai chiều, nút Tối đa).

### 2.4 Khối dưới
Tab có số đếm: **Vị thế (n)** · Lệnh đang chờ (n) · Lịch sử lệnh · Lịch sử vị thế · Funding.

**Bảng Vị thế** — mỗi hàng:
- Cặp + Long/Short + đòn bẩy;
- Khối lượng; Giá vào; **Giá đánh dấu**; **Giá thanh lý**;
- Ký quỹ [nút ✎ thêm/bớt → `futuresAdjustMargin`, lỗi `MARGIN_TOO_LOW` có `details.maxRemovable`];
- **Lãi lỗ chưa chốt (ROE%)**: tính realtime từ kênh mark bằng `pnl()` + `returnOnMargin()`, màu theo dấu;
- TP/SL [✎];
- Đóng: **Thị trường** (`futuresClosePosition`), **Một phần** (nhập khối lượng).

Thêm:
- **Thanh rủi ro** mỗi vị thế: tỷ lệ ký quỹ duy trì ÷ (ký quỹ + lãi lỗ), xanh → vàng → đỏ khi gần thanh lý.
- **Lịch sử vị thế:** giá vào/ra, lãi lỗ đã chốt, phí, funding, lý do đóng (Người dùng / TP / SL / **Thanh lý** — nổi bật đỏ).
- **Funding:** `futuresLedger` lọc `FUNDING_FEE`, cột thời gian, cặp, số tiền (+/−).

## 3. Điện thoại
- Giống trang Spot mobile v2: form (trái) + sổ lệnh (phải). Chip đòn bẩy và ký quỹ ở đầu form.
- **Vị thế dạng thẻ:** lãi lỗ lớn, ROE, giá thanh lý, nút Đóng / TP-SL / Ký quỹ.
- **Bottom sheet:** đòn bẩy, chuyển tiền, TP/SL, đóng một phần.

## 4. Tài sản → tab Futures
- **Thẻ tổng:** Số dư ví, Khả dụng, Ký quỹ vị thế, Ký quỹ lệnh, **Lãi lỗ chưa chốt**, Vốn chủ sở hữu (`futuresAccount`; `null` → `—`).
- **Nút:** Chuyển tiền (hai chiều).
- **Sổ cái Futures** (`futuresLedger`), dịch các loại:

| Mã | Hiển thị |
|---|---|
| TRANSFER | Chuyển tiền |
| ORDER_LOCK / ORDER_UNLOCK | Khóa/mở ký quỹ |
| FEE | Phí |
| REALIZED_PNL | Lãi lỗ đã chốt |
| FUNDING_FEE | Funding |
| LIQUIDATION | Thanh lý |
| MARGIN_ADJUST | Điều chỉnh ký quỹ |

## 5. Thông báo và toast
| Thông báo | Toast |
|---|---|
| `POSITION_LIQUIDATED` | Đỏ, không tự tắt: "Vị thế Long 0,01 BTCUSDT đã bị thanh lý ở 76.300,0 — mất 40,01 USDT ký quỹ" |
| `POSITION_TPSL` | "Chốt lời / Cắt lỗ đã khớp, lãi lỗ +5,80 USDT" |
| `FUTURES_ORDER_FILLED` | Giống Spot |

## 6. Admin (bổ sung PROMPT-03)
- **Màn Hợp đồng Futures** (`adminFuturesSymbols`): bảng 50 hợp đồng, bật/tắt, **đòn bẩy tối đa** (1–20), **tỷ lệ ký quỹ duy trì**, số vị thế/lệnh đang mở. Sửa → `adminUpdateFuturesSymbol` có lý do.
- **Cấu hình sàn:** thêm 3 ô phí Futures (maker, taker, thanh lý).

## 7. Nghiệm thu
1. Dùng mock, chạy được trọn vòng: chuyển tiền → đòn bẩy 20× → Mở Long kèm SL → thấy lãi lỗ chạy theo mark → thêm ký quỹ → đóng một phần → `setMockFuturesPrice` xuống sâu → toast thanh lý + lịch sử ghi "Thanh lý".
2. Mọi con số tiền dùng `@cex/core` (Dec). Không `parseFloat` cho tiền (chỉ được dùng để vẽ biểu đồ).
3. Mark STALE / UNAVAILABLE (mock: AVAXUSDT, LINKUSDT) → `—` và khóa form, không hiện số giả.
4. Báo cáo `docs/reports/2026-10-xx-ui-futures.md` kèm ảnh chụp desktop và điện thoại.

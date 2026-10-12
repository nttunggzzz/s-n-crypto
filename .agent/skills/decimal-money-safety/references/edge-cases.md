# Ca biên tiền tệ — đã đo thật (2026-10-12)

Đo bằng Node 22+ trên máy dự án. `@cex/core` chạy qua loader tsx:
`node --import tsx <file.ts>` với `import { … } from 'file:///D:/Claude/crypto/packages/core/src/decimal.ts'`.
Đo lại khi nâng Node hoặc đổi `decimal.ts`.

## JavaScript `number` (float64)
| Biểu thức | Kết quả | Hệ quả trong dự án |
|---|---|---|
| `0.1 + 0.2` | `0.30000000000000004` | cộng số dư bằng float lệch |
| `parseFloat("0.0007") * 100` | `0.06999999999999999` | ô nhập phí % ở admin (DM-1) có thể hiện chuỗi này |
| `(parseFloat("0.0000125") * 100 / 100).toFixed(6)` | `"0.000013"` | phí > 6 chữ số bị làm tròn âm thầm rồi lưu (DM-1) |
| `(1.005).toFixed(2)` | `"1.00"` | `toFixed` không làm tròn "nửa lên" như người đọc nghĩ |
| `Number("0.00000001").toString()` | `"1e-8"` | chuỗi dạng mũ → `dec()` ném lỗi; `formatDecimal` tách sai (tiền lệ R-01) |
| `Number("0.00000406").toString()` | `"0.00000406"` | ≥ 1e-6 vẫn bình thường — lỗi chỉ lộ với số rất nhỏ |
| `Number("90071992547409.93")` | `90071992547409.94` | mất chữ số cuối khi giá trị > ~2^53/100 |
| `"10.5" > "9.8"` | `false` | so sánh chuỗi giá cho màu tăng/giảm sai (DM-3) |
| `Math.round(parseFloat("0.29") * 100)` | `29` | trường hợp này đúng; quy đổi % → bips bằng float vẫn cần test biên |

## `@cex/core` `Dec`
| Biểu thức | Kết quả |
|---|---|
| `dec('0.1').add(dec('0.2'))` | `0.3` |
| `toFixedStr(roundUp(dec('0.12345678').mul('0.001')))` | `0.00012346` (phí thu → làm tròn lên) |
| `toFixedStr(roundDown(dec('1.234567891')))` | `1.23456789` (tiền trả → làm tròn xuống) |
| `floorToStep(dec('0.123456789'), dec('0.00001'))` | `0.12345` |
| `isDecimalString('1e-8')`, `isDecimalString('1,5')` | `false`, `false` |
| `dec('1e-8')` | ném `Invalid decimal string: "1e-8"` |
| `dec('90071992547409.93')` | `90071992547409.93` (không mất chữ số) |

## Bộ test tối thiểu cho một phép tính tiền mới
1. **0 và rỗng:** khối lượng 0, số dư 0, dữ liệu thiếu (`null`) → kết quả `null`/từ chối, không phải 0 bịa.
2. **Bước nhỏ nhất:** `stepSize` và `tickSize` của cặp thật (`server/test/helpers.ts` `TEST_SYMBOLS` có filter Binance thật).
3. **Coin giá nhỏ:** giá `0.00000406` (PEPE) — không được ra dạng mũ, không mất chữ số.
4. **Giá lớn:** giá × khối lượng > 2^53/100 — kết quả khớp tính tay bằng chuỗi.
5. **Hướng làm tròn:** cùng một đầu vào cho phía thu và phía trả → phía thu ≥ phía trả; chênh tối đa 1e-8.
6. **Theo từng lần khớp:** lệnh khớp 3 mức giá → tổng phí = Σ `roundUp(phí từng mức)`, không phải `roundUp(Σ)`.
7. **Âm:** PnL âm, funding âm → `floorSigned` bất lợi cho người dùng; lỗ không vượt ký quỹ (futures).
8. **Chia không hết:** giá trung bình / quy đổi quote → base — thang lưu được ghi rõ và test.
9. **Chuỗi vào/ra:** đầu ra API là chuỗi đúng thang (`toFixedStr`), đầu vào `"1e-8"` / `"1,5"` bị từ chối `VALIDATION_ERROR`.

# Module T — Thuế crypto Việt Nam trên sàn (giai đoạn thử nghiệm)

Lập: 2026-10-14, kỹ sư chính (Claude Code). **Trạng thái: ĐÃ DUYỆT 2026-10-14** — chủ dự án: "duyệt đầy đủ theo thuế Việt Nam",
áp dụng luật thuế lên **mọi loại giao dịch** sau khi rà soát kỹ (kết quả rà soát: mục 0). Sàn đang chạy thử, hướng tới sàn thật.

## 0. Rà soát luật: mỗi loại giao dịch trên sàn chịu thuế gì (2026-10-14)

**Câu hỏi của chủ dự án:** "mọi giao dịch, lãi hay lỗ, đều mất 0,1%" có đúng luật không?
**Trả lời:** đúng một nửa.
- **Đúng:** thuế tính trên giá chuyển nhượng, không phụ thuộc lãi/lỗ (TT 32/2026 Điều 5; Luật Thuế TNCN 109/2025/QH15 điểm d khoản 10 Điều 3, hiệu lực 01/07/2026, nâng 0,1% lên thành luật).
- **Sai:** không phải "mọi giao dịch". Thuế đánh vào **người chuyển nhượng** (người BÁN tài sản mã hóa), giống thuế 0,1% chứng khoán
  (NQ 05 Điều 4 khoản 9: áp dụng như thuế chứng khoán; TT 32: thời điểm xác định thu nhập theo quy định cho chứng khoán).
  Người MUA trả tiền (VND) để nhận tài sản mã hóa, không chuyển nhượng tài sản mã hóa nào, nên **không** bị trích.

Áp dụng "luật thuế lên toàn bộ các loại giao dịch" = mỗi loại giao dịch được xử lý **đúng theo luật**, kể cả loại luật nói là không chịu thuế:

| Loại giao dịch trên sàn | Thuế theo luật hiện hành | Sàn làm |
|---|---|---|
| Spot **BÁN** (LIMIT, MARKET, STOP-LIMIT, OCO, TP/SL), khớp toàn phần hay từng phần | TNCN 0,1% × giá trị khớp, mỗi lần khớp, lãi hay lỗ đều trích (cá nhân cư trú và không cư trú); tổ chức nước ngoài: TNDN 0,1% doanh thu | **Trích 0,1%** khi khớp |
| Spot **MUA** (mọi loại lệnh) | Không phải chuyển nhượng tài sản mã hóa | Không trích |
| Lệnh bot: **lưới** (có chân bán), **DCA** (chỉ mua) | Là giao dịch của chính người dùng | Lưới: trích ở chân bán. DCA: không trích |
| Người bán là **tổ chức Việt Nam** | TNDN 20% × (giá bán − giá mua − chi phí), **tự kê khai**, sàn không khấu trừ | Không trích. Báo cáo cung cấp doanh thu, giá vốn, phí |
| **Futures** (mở/đóng vị thế, thanh lý, funding) | **Không có quy định** trong TT 32/41. NQ 05 không có phái sinh trong các dịch vụ được phép (Điều 3 khoản 3) | Không trích. Ghi rõ "chưa có căn cứ" trên giao diện; sàn thật theo NQ 05 không được mở futures |
| Chuyển ví nội bộ Spot ↔ Futures | Không đổi chủ sở hữu | Không trích |
| Nhận tiền ảo (faucet), admin cộng/trừ, reset tài khoản | Sàn ảo: không phải giao dịch. Sàn thật: nạp/rút cùng chủ không phải chuyển nhượng | Không trích |
| Phí giao dịch sàn thu | Là thu nhập **của sàn**: TNDN 20% (TT 32). GTGT trên phí dịch vụ **chưa rõ** ("hoạt động khác áp dụng GTGT thông thường") | Không đụng tới người dùng. Ghi vào danh sách hỏi luật sư trước khi lên sàn thật |
| Quà tặng, thừa kế, staking, airdrop | Sàn không có các giao dịch này. TT 32 không thấy quy định riêng | Không áp dụng |
| Cặp crypto–crypto (BTC/USDT) | NQ 05 Điều 4 khoản 7: sàn được cấp phép chỉ giao dịch bằng **VND**. NQ 05 Điều 3 khoản 2: "dạng số của tiền pháp định" không phải tài sản mã hóa | Sàn thử nghiệm coi **USDT là vai trò của VND**: chỉ người bán base bị trích; quy đổi VND theo tỷ giá tham khảo |

**Thủ tục (TT 41/2026)** mà sàn thật phải làm. Sàn thử nghiệm mô phỏng phần dữ liệu:
- khấu trừ khi giao dịch xác nhận thành công;
- khai thuế khấu trừ **theo tháng**, hạn ngày 20 tháng sau, nộp tiền cùng hạn;
- cấp chứng từ khấu trừ **mẫu 01/CTKT-TSMH theo năm**;
- cá nhân **không quyết toán năm** khoản này;
- giữ dữ liệu giao dịch và chứng từ. NQ 05 Điều 15 khoản 2 điểm l: lưu tối thiểu **10 năm** trên máy chủ đặt tại Việt Nam.

### 0.1. Điều kiện để thành sàn thật (NQ 05/2025, toàn văn trên cổng Chính phủ)
Chủ dự án muốn chuyển sàn thử nghiệm thành sàn thật, nên phải biết trước:
- Chỉ **tối đa 5** tổ chức được cấp phép (Điều 17).
- Điều kiện của tổ chức đó (Điều 8):
  - công ty Việt Nam, vốn điều lệ đã góp **≥ 10.000 tỷ đồng**;
  - ≥ 65% vốn từ tổ chức, trong đó > 35% từ ít nhất 2 ngân hàng / công ty chứng khoán / quỹ / bảo hiểm / công nghệ;
  - vốn nước ngoài ≤ 49%;
  - nhân sự có chứng chỉ;
  - hệ thống CNTT an toàn **cấp độ 4**.
- Mọi giao dịch bằng **VND** (Điều 4 khoản 7). Không có USDT làm đồng định giá.
- Không có futures/ký quỹ trong danh sách dịch vụ.
- Chỉ tổ chức được cấp phép mới được quảng cáo (Điều 4 khoản 4).
- Sau 6 tháng kể từ khi có tổ chức đầu tiên được cấp phép, giao dịch ngoài tổ chức được cấp phép bị xử phạt (Điều 7 khoản 2).

Hệ quả: module thuế làm **đúng luật về cách tính và ghi sổ**, để khi có pháp nhân đủ điều kiện thì phần thuế không phải làm lại.
Các phần chỉ có ý nghĩa khi đã có giấy phép thì **chưa làm**, vì chưa có pháp nhân khai thuế và thu dữ liệu định danh lúc này là rủi ro:
- thu CCCD/MST, eKYC;
- tờ khai gửi cơ quan thuế, ký số chứng từ.

Thiết kế chừa chỗ: phân loại người nộp đã có (mục 3.3); trường giấy tờ thêm sau bằng migration riêng khi có giấy phép.

Đầu vào: thư mục `vietnam-tax-compliance/` (Antigravity tổng hợp, 5 file + README, chưa commit). Kế hoạch này đối chiếu tài liệu đó với
(1) văn bản pháp luật tra được và (2) code thật của sàn. Chỗ nào lệch thì ghi rõ và theo code/văn bản, không theo tài liệu.

---

## 1. Kiểm chứng tài liệu Antigravity

### 1.1. Phần khớp với nguồn tra được (báo chí pháp luật, chưa đối chiếu Công báo)
| Nội dung | Kết quả |
|---|---|
| Luật Công nghiệp công nghệ số 71/2025/QH15, hiệu lực 01/01/2026, định danh tài sản số / tài sản mã hóa | Đúng |
| **TT 32/2026/TT-BTC** ngày 27/03/2026: cá nhân (cư trú và không cư trú) chịu TNCN **0,1% trên giá chuyển nhượng từng lần**, không phụ thuộc lãi/lỗ; tổ chức nước ngoài 0,1% doanh thu; tổ chức Việt Nam TNDN 20% trên (giá bán − giá mua − chi phí); chuyển nhượng **không chịu GTGT** | Đúng |
| **TT 41/2026/TT-BTC** ngày 06/04/2026: tổ chức cung cấp dịch vụ **khấu trừ và nộp thay** cho từng giao dịch; thời điểm khấu trừ = khi giao dịch xác nhận thành công; tờ khai + bảng kê chi tiết | Đúng |
| NQ 05/2025/NQ-CP: thí điểm 5 năm, vốn điều lệ tối thiểu **10.000 tỷ đồng**, giao dịch bằng VND | Đúng về nội dung, **sai ngày**: ký 09/09/2025, không phải "đầu năm 2025" |

### 1.2. Phần sai hoặc chưa kiểm chứng được — **không đưa vào thiết kế**
| Tài liệu ghi | Thực tế |
|---|---|
| Chứng từ "Mẫu số 03/TNCN-TSM" | Nguồn tra được ghi mẫu **01/CTKT-TSMH** |
| Sandbox vốn 500–1.000 tỷ | Không thấy trong NQ 05; mức là 10.000 tỷ |
| Cổng e-Tax tự từ chối tờ khai lệch > 1.000đ; khai tháng khi ≥ 50 tỷ phí / 500 tỷ giao dịch | Không tìm thấy nguồn |
| Futures: 0,1% trên lợi nhuận đóng vị thế; staking 5%; airdrop 10% | Không tìm thấy trong TT 32. Thí điểm NQ 05 cũng không thấy nói tới phái sinh |
| "Tổng cục Thuế" | Từ 2025 đã tổ chức lại thành Cục Thuế (Bộ Tài chính) |
| Làm tròn tiền thuế lên số nguyên VND | TT không quy định cách làm tròn (theo nguồn tra được); chỉ là lựa chọn thiết kế |

### 1.3. Thiết kế kỹ thuật (file 04) không khớp code
| File 04 giả định | Code thật |
|---|---|
| Sổ cái kép: `CLEARING:MATCH_VND`, `REVENUE:TRADING_FEE`, `LIABILITY:VN_TAX_WITHHELD` | Sổ cái **theo ví người dùng** (`ledger_entries`: user × account × asset). Phí hiện là một dòng `FEE` trừ khỏi ví, **không ghi có vào tài khoản nào của sàn** (`orderService.ts:485-488`) |
| Cặp `BTC/VND`, giá VND | Mọi cặp quote **USDT**. Sàn không có nguồn tỷ giá VND |
| `infra/db`, khóa UUID cho `trades`/`orders` | Drizzle ở `server/src/db/schema.ts`; `trades.id`, `orders.id` là `bigserial` |
| Hook ở matcher → `TaxService` gọi riêng | Tiền chỉ đổi trong `settleFills()` của `OrderService` (bất biến 1, 12); thuế phải nằm **trong cùng transaction** đó |

## 2. Ranh giới — sàn này **không** phải tổ chức khấu trừ thật

Sàn đang chạy thử bằng tiền ảo, chưa có giấy phép NQ 05 (mục 0.1). Hiện chưa phát sinh nghĩa vụ thuế thật.
Module này **tính và ghi sổ đúng như sàn được cấp phép phải làm**, nhưng gắn nhãn "thử nghiệm". Từ đó suy ra:

**Làm:**
- trích 0,1% bằng USDT ảo khi khớp lệnh BÁN;
- ghi sổ riêng, tách khỏi phí;
- báo cáo cho người dùng và admin;
- quy đổi VND tham khảo.

**Không làm** (khác bảng của Antigravity):
| Hạng mục Antigravity | Quyết định | Lý do |
|---|---|---|
| Thu CCCD / MST / VNeID, eKYC | **Không** | Dữ liệu cá nhân nhạy cảm, không có mục đích hợp pháp trên sàn ảo. Thu là tạo rủi ro (Luật Bảo vệ dữ liệu cá nhân), không thêm giá trị mô phỏng |
| Xuất XML nộp Cổng thuế, ký số HSM | **Không** | Không có gì để nộp. File giống mẫu nhà nước dễ bị hiểu nhầm là giấy tờ thật |
| "Chứng từ khấu trừ thuế điện tử" | Thay bằng **"Bảng tổng hợp thuế đã khấu trừ (thử nghiệm)"** (CSV/màn hình) | Ghi rõ "sàn thử nghiệm, không phải chứng từ thuế"; không dùng tên/số hiệu mẫu của cơ quan thuế |
| "Nộp vào Kho bạc", "tài khoản ký quỹ thuế ngân hàng" | **Không** | Chỉ có "kỳ thuế đã khóa sổ" (tùy chọn, đợt T3) |
| Travel Rule, báo cáo CTR/STR | **Không** | Sàn không có nạp/rút on-chain |
| Thuế futures, staking, airdrop | **Không** (giai đoạn này) | Chưa kiểm chứng được căn cứ (mục 1.2) |

## 3. Thiết kế

### 3.1. Cấu hình (`exchange_settings`, admin sửa, có `writeAudit`)
- `tax_mode`: `OFF` | `WITHHOLD`. **Mặc định `OFF`**, sàn thật vào trạng thái tắt.
- `tax_rate`: mặc định `0.001`, tối đa `0.01` (giống chặn `feeRate`).
- `tax_vnd_rate`: tỷ giá USDT→VND **admin nhập tay**, kèm `tax_vnd_rate_updated_at`.
  - Để trống thì mọi cột VND là `null` (bất biến 6: không bịa số).
  - Giao diện ghi rõ "tỷ giá tham khảo do sàn đặt".

### 3.2. Tính thuế khi khớp (trong `settleFills`, cùng transaction)
- Chỉ lệnh **SELL** Spot, khi `tax_mode = WITHHOLD` **tại thời điểm khớp**.
  - Lệnh đặt lúc tắt mà khớp lúc bật vẫn bị trích. Tỷ lệ chụp lại vào bản ghi.
- Mỗi phần khớp: `tax = roundUp8(quoteQty × taxRate)`.
  - Người dùng trả nên làm tròn **lên** 8 chữ số (bất biến 2), giống `fee`.
  - Tính trên **giá trị gộp** (`quoteQty`), không trừ phí trước (TT 32: "giá chuyển nhượng").
- Sổ cái: thêm `LEDGER_TYPES` mới `TAX_WITHHOLDING`.
  - Thêm một dòng trừ USDT sau `TRADE_CREDIT` và `FEE`, `ref = ORDER`.
  - Không thể âm vì tiền nhận về ≥ phí + thuế (phí ≤ 1%, thuế ≤ 1%).
- `trades`: thêm cột `tax` (mặc định `0`) để mọi chỗ đọc giao dịch thấy thuế.
- Bảng mới `tax_withholdings`, một dòng mỗi trade có thuế. Đây là "sổ nghĩa vụ thuế" thay cho `LIABILITY:VN_TAX_WITHHELD`:
  - `trade_id` (FK, unique), `order_id`, `user_id`, `symbol`, `asset`;
  - `gross_quote`, `tax_rate`, `tax_amount`;
  - `vnd_rate` (nullable), `gross_vnd`, `tax_vnd` (làm tròn lên số nguyên đồng, chỉ để hiển thị);
  - `category`, `created_at`;
  - `period_id` (nullable, đợt T3).
- **Đối soát** (`reconciliation.ts`) thêm kiểm tra thứ 4: với mỗi (user, asset), Σ `ledger_entries` loại `TAX_WITHHOLDING` = −Σ `tax_withholdings.tax_amount`
  và = Σ `trades.tax`. Cách này tách tiền thuế khỏi phí mà không cần dựng sổ cái kép.

### 3.3. Phân loại người nộp (tự khai, không giấy tờ)
`user_tax_profiles(user_id, category)`:
- `INDIVIDUAL` (mặc định, trích 0,1%);
- `FOREIGN_ORG` (trích 0,1%, ghi là TNDN);
- `DOMESTIC_ORG` (không trích; báo cáo in doanh thu, giá vốn, phí để tự tính 20%).

Không có cột số giấy tờ. Đổi phân loại có hiệu lực cho lần khớp sau. → **Quyết định T-D2**: có làm phân loại không hay chỉ có `INDIVIDUAL`.

### 3.4. Chỗ phải sửa theo (thuế làm "tiền nhận về" nhỏ hơn)
| File | Việc |
|---|---|
| `exchange/positions.ts` | Lãi lỗ đã thực hiện = (USDT nhận − phí − **thuế**) − khối lượng × giá vốn |
| `bots/gridService.ts` (dòng 127–141, 187, 280, 329–354, 442–463) | Mọi chỗ `cumulativeQuoteQty − fee` trừ thêm thuế. Kiểm tra "khoảng lưới nhỏ hơn phí" tính cả thuế cho chân bán. Test `walletValue` (bất biến 19) chạy với thuế bật |
| `bots/dcaService.ts` | Chỉ mua, không đổi. Có test xác nhận |
| `packages/core/src/journalFills.ts` + nhật ký A | Phân bổ chân bán thêm `tax`. Nhật ký là của Module A nên **phối hợp thứ tự gộp** (mục 5) |
| `exchange/exports.ts` | CSV giao dịch thêm cột thuế |
| `exchange/serializers.ts`, `portfolioService.ts` | Trả `tax` |
| `market/routes.ts:29` (cấu hình công khai) | Thêm `taxMode`, `taxRate`, `taxVndRate` để form đặt lệnh ước tính |
| Admin `resetUser` | Giữ nguyên `tax_withholdings` (như `trades`). Test đối soát sau reset |
| `analysis/` (backtester) | **Không** đổi trong module này. Ghi chú cho Module C: nếu bật thuế trên sàn thật thì ma sát backtest nên cộng thuế |

### 3.5. Hợp đồng API (`packages/contracts`)
- `Trade.tax: DecimalString` (thêm trường; UI cũ không vỡ). Fixture + mock engine trích thuế như server.
- Cấu hình sàn công khai: `taxMode`, `taxRate`, `taxVndRate | null`.
- Người dùng (`auth: user`, lọc theo `userId`, không thấy thì 404):
  - `GET /account/tax/summary?year=`: tổng giá trị bán, tổng thuế (USDT + VND nếu có), theo tháng;
  - `GET /account/tax/withholdings` (phân trang);
  - `GET /account/tax/export.csv`: "Bảng tổng hợp thuế đã khấu trừ (thử nghiệm)";
  - `GET/PUT /account/tax/profile` (nếu T-D2 = có).
- Admin (`auth: staff`; quyền mới `tax.read`, `tax.manage` trong `permissions.ts`):
  - `GET /admin/tax/summary?period=` (tháng/quý, theo phân loại, theo cặp);
  - `GET /admin/tax/withholdings`;
  - `GET /admin/tax/export.csv` (bảng kê: trade_id, thời điểm UTC+7, người dùng, cặp, khối lượng, giá, giá trị gộp, thuế, VND);
  - `PATCH /admin/settings` mở rộng ba trường cấu hình (có audit).
- (T3, tùy chọn) `POST /admin/tax/periods/{id}/close`: khóa sổ kỳ, gắn `period_id`, có audit. Mô phỏng nghiệp vụ "chốt bảng kê", không có "nộp".

### 3.6. Giao diện (Antigravity, PROMPT-16 sau khi hợp đồng gộp)
- **Form BÁN** (`apps/exchange`) có 4 dòng: giá trị gộp, phí, thuế TNCN tạm tính (0,1%), thực nhận ước tính.
  - Thêm dòng VND chỉ khi có tỷ giá.
  - Ẩn dòng thuế khi `taxMode = OFF`.
  - Nhãn "thử nghiệm".
- **Tài khoản → Thuế**: thẻ tổng năm, bảng theo tháng, danh sách khấu trừ, nút tải CSV.
- **Admin → Thuế**: bật/tắt, tỷ lệ, tỷ giá; tổng theo kỳ; bảng kê; xuất CSV; (T3) khóa sổ kỳ.
- `data-testid` do `cex-e2e-acceptance` đăng ký trong `docs/antigravity/TESTIDS.md`.

### 3.7. Test bắt buộc (đợt T2)
- Toán: làm tròn lên 8 chữ số, nhiều phần khớp, giá trị biên (0.00000001).
- Mọi loại lệnh bán: LIMIT/MARKET khớp từng phần, MARKET theo USDT, STOP-LIMIT, OCO (cả hai chân), TP/SL con.
- Tranh chấp: hủy và khớp đồng thời, phát lại sự kiện giá → thuế **không** trích 2 lần (unique `trade_id`).
- Bật/tắt giữa chừng: lệnh khớp từng phần trước và sau khi bật.
- Bot lưới với thuế bật: `walletValue` khớp ví sau nhiều vòng. Lệnh bot vẫn bị trích (→ T-D4).
- Đối soát: chạy sạch sau khớp, sau reset tài khoản. Cố tình làm lệch thì báo lỗi.
- HTTP: 404 khi đọc khấu trừ của người khác; staff thiếu quyền `tax.read` → 403; đổi cấu hình ghi audit trong cùng transaction.

## 4. Đợt thực hiện

| Đợt | Ai | Việc | Nghiệm thu |
|---|---|---|---|
| **T0** | Chủ dự án | Duyệt mục 6 | Bảng quyết định có ngày duyệt |
| **T1** | `cex-contract-designer` | Hợp đồng mục 3.5, quyền, fixture, mock, CHANGELOG (phiên bản theo thứ tự gộp) | `npm run typecheck`, test contracts, mock trả thuế đúng công thức |
| **T2** | `cex-backend-builder` (+ `cex-quant-engineer` cho `journalFills` nếu A đã gộp) | Migration, `settleFills`, `positions`, lưới, nhật ký, CSV, đối soát, cấu hình admin + test mục 3.7 | `npm run verify` xanh; số test mới; rà bởi `cex-reviewer` (bất biến 1, 2, 4, 12, 19) |
| **T3** | `cex-backend-builder` | API báo cáo người dùng + admin, xuất CSV, (tùy chọn) khóa sổ kỳ | Test HTTP + phân quyền + audit |
| **T4** | Antigravity + `cex-e2e-acceptance` | PROMPT-16, giao diện mục 3.6; e2e: bật thuế → bán → thấy 4 dòng, số dư đúng, báo cáo đúng | `npm run ui-check -- --e2e` |
| **T5** | Lead + chủ dự án | `npm run host -- backup` → `update` (thuế **tắt**) → chủ dự án tự bật trong Admin | Đối soát sạch trước/sau |

Ước lượng: T1 + T2 khoảng 2 lượt; T3 1 lượt; T4 theo tốc độ Antigravity.

## 5. Thứ tự với Module A/C

- T2 có migration và sửa `journalFills` (của A1, đã gộp). Theo quy tắc, mỗi lúc chỉ gộp một nhánh có migration.
- **Đề xuất:** làm Module T **sau A2** (migration 0008 của nhật ký), trước A3. Lý do: A3 tự ghi nhật ký từ trade, nên có `trades.tax` trước thì A3 dùng luôn.
- Nếu chủ dự án muốn giữ nguyên lịch A/C thì T chèn vào sau A6/C6.
- C không bị ảnh hưởng: phân tích không đọc `trades`.

## 6. Quyết định — **đã duyệt 2026-10-14** ("duyệt đầy đủ theo thuế Việt Nam")

Mỗi mục áp dụng theo đề xuất, chỉnh lại theo kết quả rà soát luật ở mục 0:
- **T-D3:** chỉ người BÁN. Chủ dự án muốn "mọi loại giao dịch", nhưng luật chỉ đánh vào người chuyển nhượng; mọi loại giao dịch khác được xử lý theo bảng ở mục 0.
- **T-D5:** futures không trích, vì luật chưa có quy định. Thêm sau nếu có văn bản hoặc chủ dự án chọn giả định riêng.
- **T-D8:** A2 chưa bắt đầu (kiểm `git worktree list` 2026-10-14), nên **làm T ngay**. A2 rebase lên sau và lấy số migration kế tiếp.

| Mã | Câu hỏi | Đề xuất (= đã duyệt) |
|---|---|---|
| **T-D1** | Phạm vi: chỉ thuế mô phỏng, **không** thu CCCD/MST/VNeID, **không** XML Cổng thuế / ký số / chứng từ theo mẫu nhà nước (mục 2) | **Đồng ý** |
| **T-D2** | Có phân loại người nộp (cá nhân / tổ chức nước ngoài / tổ chức Việt Nam, tự khai) không? | **Có**, nhưng chỉ là một trường chọn, không giấy tờ |
| **T-D3** | Cặp crypto–crypto: chỉ trích bên **BÁN base** (như chứng khoán, như tài liệu) hay cả bên MUA (vì cũng "chuyển nhượng" USDT)? | **Chỉ BÁN**. Ghi rõ đây là giả định của mô phỏng (sàn thật theo NQ 05 giao dịch bằng VND nên không có câu hỏi này) |
| **T-D4** | Lệnh bot (lưới, tín hiệu) và tài khoản `is_bot` có bị trích không? | **Có**: mô phỏng nhất quán, track record tín hiệu không đẹp giả |
| **T-D5** | Futures | **Không** trích trong module này (chưa có căn cứ) |
| **T-D6** | Tỷ giá VND: admin nhập tay (đề xuất) hay nối nguồn ngoài (tốn công, thêm phụ thuộc)? | **Nhập tay**, để trống thì không hiện VND |
| **T-D7** | Khóa sổ kỳ (T3) có làm không? | **Để sau**. Báo cáo theo kỳ đủ dùng |
| **T-D8** | Lịch: chèn sau A2 (mục 5) hay sau A6/C6? | **Sau A2** |
| **T-D9** | Thư mục `vietnam-tax-compliance/` | Chuyển vào `docs/research/thue-vn/` (giữ nguyên nội dung, thêm `KIEM-CHUNG.md` = mục 1). Báo Antigravity không dùng các mục ở 1.2 |

## 7. Nguồn đã tra (2026-10-14)
- TT 32/2026: thuvienphapluat.vn (bài 108560, 108607), luatvietnam.vn, baochinhphu.vn
- TT 41/2026: vneconomy.vn, thuvienphapluat.vn (văn bản 700476, Công văn 171)
- NQ 05/2025: toàn văn tại xaydungchinhsach.chinhphu.vn (Điều 3, 4, 6, 7, 8, 15, 17); luatvietnam.vn, baodauthau.vn, lsvn.vn
- Luật Thuế TNCN 109/2025/QH15 (thông qua 10/12/2025, hiệu lực 01/07/2026): dantri.com.vn, nld.com.vn, lsvn.vn

Chưa đối chiếu với Công báo. Sàn ảo không phụ thuộc chi tiết này, nhưng nếu sau này làm thật thì phải có luật sư rà.

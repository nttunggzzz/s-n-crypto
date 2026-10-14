# Module N — Tin tức real-time và sự kiện vĩ mô cho hệ phân tích

Lập: 2026-10-14, kỹ sư chính (Claude Code).

**Trạng thái:** chủ dự án duyệt 2026-10-14 ("bắt đầu").
- Kèm yêu cầu: **hệ AI phải kết hợp cập nhật tin real-time với dữ liệu giao dịch để đưa ra lời khuyên** (mục 4.1).
- N-D3 (khóa FRED) chờ chủ dự án đăng ký.

Đọc cùng:
- [README](README.md): đội ngũ, quy trình một đợt, quy tắc phối hợp;
- [Module C](module-C-engine-tin-hieu.md): engine tín hiệu, phiên bản engine, holdout (mục 3.5), cổng M3;
- [Quy ước R và nguồn dữ liệu](quy-uoc-R-va-nguon-du-lieu.md);
- skill `crypto-multi-agent-analysis` (hệ 7 phòng ban, point-in-time).

## 1. Mục tiêu và nguyên tắc

Hệ phân tích hiện chỉ dùng giá, sổ lệnh và dữ liệu phái sinh. Module N thêm hai loại thông tin:
- **Sự kiện vĩ mô có lịch:** FOMC, CPI, việc làm Mỹ (NFP), PCE… Biết trước giờ công bố.
- **Tin không báo trước:** sàn/giao thức bị hack, ETF, kiện tụng và quy định, niêm yết/hủy niêm yết, tin vĩ mô lớn.

Giá trị, xếp từ chắc nhất đến ít chắc nhất:
1. **Quản trị rủi ro:** không mở tín hiệu mới sát sự kiện tác động mạnh; gắn cờ cặp vừa có tin nóng.
2. **Giải thích:** báo cáo phân tích liệt kê tin/sự kiện đã dùng, kèm nguồn và thời điểm.
3. **Dự báo hướng:** chỉ dùng những loại sự kiện đã qua nghiên cứu sự kiện (đợt N3) **ngoài mẫu, sau phí**.
   Giả thuyết ban đầu (chưa đo): tin giúp dự báo **biến động** tốt hơn dự báo **hướng**.

Nguyên tắc, bắt buộc cho mọi đợt:
1. **Point-in-time theo thời điểm hệ biết tin** (`firstSeenAt`), không theo `publishedAt` do báo ghi.
   - Bài đăng lúc 10:00 mà hệ thấy lúc 10:20 thì trước 10:20 không được dùng.
   - Hiện `snapshotBuilder.ts:183` lọc theo `publishedAt`: vô hại với tin mẫu, sai với tin backfill.
2. **NULL ≠ 0 (bất biến 6):**
   - nguồn chết thì lát `news` là `UNAVAILABLE`, phòng ban bỏ phiếu trắng;
   - "nguồn sống, không có tin" (`LIVE`, `items: []`) khác "không có nguồn";
   - tin không có điểm giọng điệu thì `tone: null`, không ghi `"0"`.
3. **Tin tức không phải phòng ban lõi:** thiếu tin không chặn tín hiệu. Cờ rủi ro do tin tạo ra thì được phép chặn (`blocksExecution`).
4. **Tái lập được:** mọi nhãn (cặp liên quan, loại sự kiện, giọng điệu) mang `classifierVersion`. Đổi bộ phân loại hay luật cổng là tạo **phiên bản engine mới** (Module C).
5. **Không LLM ở v0** (C-D2). Nếu sau này dùng LLM phân loại tin thì **chỉ kiểm chứng tiến**, tức đo trên dữ liệu chạy thật về sau.
   - Không backtest LLM trên tin cũ: mô hình đã học những gì xảy ra sau các tin đó, nên có rò rỉ tương lai qua dữ liệu huấn luyện.
6. **Bản quyền:** chỉ lưu tiêu đề, URL, nguồn, thời điểm và nhãn tự suy ra. Không lưu, không hiển thị toàn văn bài.
7. **Chỉ Admin thấy** (C-D1). Không đặt lệnh, giống toàn bộ `server/src/modules/analysis/`.
8. **Test không gọi mạng:** test dùng tệp mẫu đã ghi sẵn trong repo.
9. **Mọi giờ lưu UTC.** Giờ công bố của Mỹ (ET) đổi sang UTC phải đúng ở cả hai mốc đổi giờ mùa hè (có test riêng).

## 2. Hiện trạng (2026-10-14, đã kiểm)

| Thành phần | Hiện trạng | Hệ quả |
|---|---|---|
| Hợp đồng | `SnapshotHeadline` (id, title, source, publishedAt, sentimentTilt) nằm **trong** `SnapshotOnChainAndMacro.headlines` (`packages/contracts/src/analysis.ts:126-153`) | Tin bị buộc vào dữ liệu on-chain |
| Phòng ban 4 | `fundamentalsSentimentAgent.ts:39-55`: `onChainAndMacro` null thì cả phòng ban `UNAVAILABLE`. Tin chỉ cộng/trừ tối đa 15 điểm theo số tin tăng trừ số tin giảm (`:197-219`) | Không có on-chain thì tin không bao giờ được dùng |
| Nguồn tin | Không có. `cexMarketAdapter.ts:631` ghi rõ server không nạp nguồn tin nào. `cli.ts` dùng tin mẫu viết tay | Khi chạy thật, phòng ban 4 luôn bỏ phiếu trắng |
| Lịch vĩ mô | Không có | — |
| LLM | `llmAdapter.ts` chỉ có `DeterministicQuantNarrator`; C-D2 cấm LLM ở GĐ4 | v0 phân loại bằng luật |

## 3. Nguồn dữ liệu (kiểm sơ bộ 2026-10-14; điều khoản chốt ở N0)

| Nguồn | Nội dung | Lịch sử cho backtest | Chi phí / điều kiện | Dùng ở v0 |
|---|---|---|---|---|
| GDELT 2.0, file GKG thô | Tin toàn cầu, đa ngôn ngữ; có điểm giọng điệu tính sẵn, chủ đề, tổ chức | Có: mỗi 15 phút một file, ít nhất từ 2015 | Miễn phí, tải file | **Có**: nguồn chính cho backfill và nghiên cứu sự kiện |
| GDELT DOC 2.0 API | Tìm bài theo từ khóa | Tìm từ 2017, nhưng chế độ danh sách bài chỉ trả 3 tháng gần nhất; có giới hạn tốc độ (chưa tìm thấy số chính thức) | Miễn phí | Chỉ để thử, không dùng cho backfill |
| RSS báo crypto (danh sách chốt ở N0) và thông cáo của cơ quan quản lý (vd SEC) | Tin crypto nhanh nhất | **Không**: chỉ ghi được từ ngày bật | Miễn phí; **phải kiểm điều khoản dùng thương mại** | Có, nếu N0 đạt |
| Thông báo niêm yết/hủy niêm yết của Binance | Tác động mạnh lên cặp liên quan | Tùy cách lấy | Kiểm cách lấy chính thức ở N0; không cào trang nếu điều khoản cấm | Nếu N0 đạt |
| Lịch công bố chính thức (Fed: FOMC; BLS: CPI, NFP; BEA: PCE) | Giờ công bố biết trước | Có (lịch các năm trước) | Miễn phí | **Có**: tệp lịch trong repo, mỗi dòng có link nguồn |
| FRED / ALFRED | Giá trị thực đã công bố, **đúng như tại từng thời điểm** (real-time period / vintage) | Có | Miễn phí nhưng **cần khóa API** (đăng ký tài khoản) | Tùy N-D3 |
| Dự báo đồng thuận (consensus), dùng để tính "mức bất ngờ" | — | — | Thường trả phí | Không |
| CryptoPanic | Tổng hợp tin crypto | Hạn chế | Cần khóa + gói; giá chưa xác minh | Không |

Việc thu thập chạy trên chính máy đang chạy sàn thật. N0 phải đo dung lượng một ngày GKG (sau lọc) và băng thông; job thu thập phải hạ ưu tiên giống `ui-check`.

## 4. Kiến trúc

```
Nguồn: GDELT (15'), RSS (2–5'), lịch vĩ mô (tệp), FRED (tùy N-D3)
  → server/src/modules/news/   job thu thập trong tiến trình server, lỗi được cô lập,
                               cờ bật/tắt (mặc định TẮT trên sàn thật)
      → chuẩn hóa URL, khử trùng lặp
      → phân loại bằng hàm thuần ở @cex/core (newsClassify.ts):
        cặp liên quan (từ điển bí danh), loại sự kiện (luật), giọng điệu (GDELT; RSS = null)
  → bảng news_sources, news_items, news_ingest_runs, macro_events (một migration, chỉ thêm)
  → cexMarketAdapter: tại asOf lấy tin có firstSeenAt ≤ asOf (cửa sổ 24h)
                      + sự kiện vĩ mô trong [asOf − 6h, asOf + 24h]
  → snapshotBuilder: lọc lại firstSeenAt ≤ asOfMs, đếm vào lookaheadItemsFiltered
  → phòng ban mới news_event_risk → finalSynthesis (cờ chặn được; không phải phòng ban lõi)
  → báo cáo phân tích: bằng chứng gồm tin/sự kiện đã dùng, nguồn, firstSeenAt
Backfill (N3): script đọc file GKG lịch sử → news_items (nguồn GDELT, firstSeenAt = mốc của file 15')
```

**Ghi chú từ N0** (đo thật, [báo cáo](../reports/2026-10-14-module-N-nguon.md)):
- **GDELT khi backfill:** `firstSeenAt` = mốc trong tên file. File thực tế có mặt sớm hơn mốc tên 9–11 phút, nên dùng mốc tên là an toàn. `publishedAt` = `null`, vì GKG không có giờ đăng.
- **GDELT khi chạy thật:**
  - `firstSeenAt` = lúc hệ tải được file;
  - `lastupdate.txt` có thể trỏ tới file chưa có (404) — gặp thì thử lại sau, không tính là nguồn hỏng;
  - dùng cùng loại file GKG với backfill để dữ liệu lúc chạy thật và lúc backtest giống nhau. DOC API chỉ là dự phòng;
  - mỗi tháng tải khoảng 18 GB; lọc ngay khi đọc, không lưu file thô.
- **Tone GDELT:** điểm tích cực và tiêu cực cùng bằng 0 thì `tone = null` (4,8% số bài trong mẫu).
- **Ghi nguồn:** dữ liệu GDELT bắt buộc ghi "GDELT Project" kèm link.

**Đổi hợp đồng (chỉ thêm):**
- `SnapshotNews` gồm:
  - `status`, `observedAt`, `sourcesLive`, `sourcesTotal`;
  - `items[]`, mỗi tin có: `id`, `title`, `url`, `source`, `publishedAt`, `firstSeenAt`, `symbols[]`, `eventTypes[]`, `tone` (chuỗi thập phân hoặc null), `classifierVersion`.
- `SnapshotMacroEvent` gồm `code`, `name`, `scheduledAt`, `importance` (`HIGH` | `MEDIUM` | `LOW`), `source`, `actual` (chuỗi hoặc null), `actualKnownAt` (hoặc null).
- Thêm vào `CryptoMarketSnapshot` hai trường `news` và `macroEvents`, đều nullable.
- Thêm `news_event_risk` vào `AnalysisDepartmentId`.
- Giữ nguyên `SnapshotHeadline` (đánh dấu là cũ). Phòng ban 4 thôi đọc tin để không đếm hai lần.

**Luật cổng rủi ro v0.** Các luật này được cố định trước và không chỉnh theo dữ liệu, để đưa được vào phiên bản engine đầu tiên mà không tốn một lượt "thử cấu hình".
1. Sự kiện vĩ mô `HIGH` trong khoảng [−30 phút, +60 phút] quanh `scheduledAt` → cờ `NEWS_MACRO_EVENT_WINDOW`, `blocksExecution: true` → rating `REVIEW`.
2. Tin loại `HACK_EXPLOIT`, `DELISTING` hoặc `REGULATORY_ACTION`, gắn đúng cặp, có `firstSeenAt` trong vòng 2 giờ trước asOf → cờ chặn cho riêng cặp đó.
3. Lát `news` ở trạng thái `UNAVAILABLE` hoặc `STALE` → không tạo cờ; phòng ban bỏ phiếu trắng, ghi `missingData`. Lịch vĩ mô là tệp tĩnh nên luật 1 vẫn chạy.
4. Ở v0 phòng ban **không** đưa ra hướng: `stance` chỉ là `NEUTRAL` hoặc `ABSTAIN`. Hướng chỉ được thêm sau N3 và N5, dưới dạng phiên bản engine mới.

Các ngưỡng 30/60 phút và 2 giờ là **giả định đặt trước**. Chúng được ghi vào `docs/plans/nhat-ky-gia-thuyet.md` trước khi đo. N3 đo lại và báo cáo, không tự sửa ngưỡng.

### 4.1 Lời khuyên kết hợp tin tức và dữ liệu giao dịch (yêu cầu của chủ dự án, 2026-10-14)

Mỗi lời khuyên (báo cáo phân tích của một cặp tại asOf) dựng từ **cùng một snapshot** và luôn có ba phần:

1. **Thị trường:** kết luận của các phòng ban giá, chỉ báo, order flow, phái sinh: hướng, vùng vào, dừng lỗ, chốt lời, R:R. Ở v0, đây là nguồn quyết định **hướng**.
2. **Tin tức và sự kiện** (trường mới `newsContext` của báo cáo):
   - các tin liên quan tới cặp trong 24 giờ: tiêu đề, nguồn, `firstSeenAt`, loại sự kiện, tone;
   - tin vĩ mô chung;
   - sự kiện vĩ mô trong 24 giờ tới;
   - độ tươi của từng nguồn.
3. **Tổng hợp:** tin tác động lên lời khuyên ngay từ v0, theo ba cách, với ngưỡng đặt trước:
   - **chặn** (luật 1 và 2 ở trên);
   - **tăng bất định:**
     - điều kiện: có sự kiện vĩ mô `HIGH` trong 24 giờ tới, hoặc cặp có tin loại nóng nhưng chưa tới ngưỡng chặn;
     - khi đó thêm lý do vào `uncertaintyReasons` và giới hạn `confidence` ≤ 0.60. Trần 0.60 là con số đặt trước, ghi vào nhật ký giả thuyết;
   - **giải thích:** một câu "Tin tức: …" nói rõ tin có làm thay đổi lời khuyên hay không, và vì sao.
   
   `newsContext.impact` nhận các giá trị `BLOCKED` | `UNCERTAINTY_RAISED` | `CONTEXT_ONLY` | `UNAVAILABLE`.

**Độ nghiêng của tin** (số tin tích cực/tiêu cực, tone trung bình):
- luôn được tính và hiển thị, kèm nhãn `validated: false` — "chưa kiểm chứng, chưa tính vào hướng";
- chỉ được **tính vào hướng** khi N3 và N5 chứng minh có tác dụng, và khi đó là một phiên bản engine mới.

**Không lời khuyên nào bỏ qua một trong hai nguồn:**
- nguồn tin không có (`UNAVAILABLE`) thì phần 2 ghi "thiếu tin tức" và thêm lý do vào `uncertaintyReasons`, nhưng không đổi rating;
- dữ liệu giao dịch không `LIVE` thì lời khuyên là `REVIEW` như hiện nay. Tin tức một mình không bao giờ tạo ra lời khuyên vào lệnh.

**Độ trễ và độ tươi:**
- Mỗi nguồn ghi độ trễ `firstSeenAt − publishedAt` và thời điểm thu thập thành công gần nhất.
- Quá 3 chu kỳ không thành công thì nguồn chuyển `STALE`. Mọi nguồn tin đều `STALE` hoặc hỏng thì lát `news` là `UNAVAILABLE`.
- Cảnh báo vận hành gửi qua `ops/alerts.ts`.

## 5. Kiểm chứng phương pháp

**Nghiên cứu sự kiện (N3):**
- Với mỗi tổ hợp loại sự kiện × khung (15m, 1h, 4h) tính từ `firstSeenAt`: đo lợi suất và biến động (|r|, biến động thực), so với **cửa sổ đối chứng cùng giờ trong ngày** ở những ngày không có sự kiện.
- CI 95% bằng bootstrap. Hiệu chỉnh nhiều phép thử theo số tổ hợp (loại × khung) đã thử. Ghi lại mọi phép thử, kể cả phép thử thất bại.
- Chỉ dùng dữ liệu **trước** `holdout.from` (Module C mục 3.5). Nếu chưa có `holdout.json` thì lead chốt trước khi N3 chạy, dùng chung với C4.
- Độ phủ tin crypto trên GDELT tăng dần theo năm, nên phải chuẩn hóa theo tổng số bài trong cùng khung và báo cáo riêng từng năm.
- Giả thuyết được đăng ký trước trong `nhat-ky-gia-thuyet.md`.

**Giá trị tăng thêm (N5, trong backtest C4).** Chạy cùng một engine, **có** và **không** có cổng tin, rồi so:
- kỳ vọng R, drawdown, số tín hiệu;
- số tín hiệu bị cổng chặn, và **kết quả phản thực** của chúng (nếu không chặn thì R bằng bao nhiêu).

Quyết định bật cổng dựa trên các số này. Bật cổng là tạo phiên bản engine mới, nên được tính vào `k` của C-D5b.

## 6. Các đợt

Đội ngũ và quy trình theo [README](README.md) mục 1–2.
- Code do sub-agent chạy **Sonnet 5.5**, mức effort ghi ở từng đợt.
- `cex-reviewer` rà từng nhánh; lead gộp.

Thứ tự đề xuất:
```
N0 nguồn + điều khoản ─ N1 hợp đồng ─ N2 thu thập + lưu (bắt đầu ghi sớm) ─ N4 phòng ban + cổng v0 ─ (C2 tạo phiên bản engine 1)
                                       └ N3 backfill + nghiên cứu sự kiện ─ N5 A/B trong C4
N1 đã gộp → N6 giao diện Admin (Antigravity làm trên mock)
```
- N1 đổi hợp đồng, N2 có migration. Vì vậy áp dụng luật "mỗi lúc chỉ gộp một nhánh có migration hoặc đổi hợp đồng", xếp chung hàng với Module A và C.
- N4 xong trước C2 thì phiên bản engine 1 có sẵn cổng rủi ro v0. Nếu không kịp, cổng vào phiên bản 2.

### Đợt N0 — Xác minh nguồn và điều khoản
| | |
|---|---|
| Người làm | Lead (không code) |
| Cần trước | N-D1, N-D2 |
| Thời lượng | 1 lượt |

**Việc**
1. Với mỗi nguồn ứng viên ở mục 3, kiểm:
   - điều khoản dùng: lưu tiêu đề + URL cho phân tích nội bộ; và việc hiển thị cho người dùng trả phí sau này;
   - giới hạn tốc độ, định dạng;
   - độ trễ đo thật trong 24 giờ.
2. Tải mẫu một ngày file GKG. Đo dung lượng thô, số bài liên quan crypto/vĩ mô sau khi lọc, và tỷ lệ trùng lặp.
3. Lập tệp lịch vĩ mô 2019–2026 tại `server/src/modules/news/data/macro-calendar.csv`.
   - Mỗi dòng có `code`, `scheduledAtUtc`, `importance`, `sourceUrl`.
   - Kiểm ngẫu nhiên 10 dòng với trang chính thức.
4. Viết báo cáo `docs/reports/<ngày>-module-N-nguon.md`: nguồn được chọn, nguồn bị loại và lý do.

**Nghiệm thu**
- [ ] Mỗi nguồn được chọn có link điều khoản và kết luận được dùng hay không.
- [ ] Số đo dung lượng và độ trễ là số thật, kèm lệnh đo.

### Đợt N1 — Hợp đồng
| | |
|---|---|
| Người làm | `cex-contract-designer` (Sonnet, effort medium) → `cex-reviewer` |
| Nhánh | `be/news-n1-contracts` |
| Cần trước | N0 xong; không có nhánh đổi hợp đồng nào khác đang chờ gộp |
| Thời lượng | 1 lượt |

**Việc**
1. Trong `packages/contracts/src/analysis.ts`:
   - thêm `SnapshotNews`, `SnapshotMacroEvent`;
   - thêm trường `news` và `macroEvents` (nullable) vào `CryptoMarketSnapshot`;
   - thêm `news_event_risk` vào `AnalysisDepartmentId`;
   - giữ `SnapshotHeadline`, ghi chú là cũ;
   - thêm `AnalysisNewsContext` và trường `newsContext` (nullable) vào `CryptoMarketAnalysisReport`, theo mục 4.1:
     - `status`;
     - `itemsUsed[]`: id, tiêu đề, nguồn, `firstSeenAt`, loại sự kiện, tone;
     - `upcomingEvents[]`;
     - `tilt`: positive, negative, neutral, `meanTone` (chuỗi hoặc null), `validated: false`;
     - `impact[]`;
     - `summaryLine`.
2. Tạo `packages/contracts/src/news.ts`:
   - `NewsEventType` (danh sách đóng, có `OTHER`), `NewsSourceHealth`, `NewsItemAdmin`;
   - endpoint Admin `adminNewsItems`: lọc theo cặp, loại, nguồn, khoảng thời gian; có phân trang;
   - endpoint Admin `adminNewsSources`: sức khỏe từng nguồn;
   - quyền mới `news.view`.
3. Fixture và resolver mock cho cả 2 endpoint; cập nhật CHANGELOG.

**Nghiệm thu**
- [ ] Typecheck, test contracts, drift check, lint đều xanh.
- [ ] Mọi trường thời gian của tin là `IsoDateTime`.
- [ ] `tone` và `actual` là chuỗi thập phân hoặc null; không bao giờ dùng `"0"` thay cho dữ liệu thiếu.

**Lệnh giao việc**
> Làm **Đợt N1** theo `docs/plans/module-N-tin-tuc-va-vi-mo.md` (mục 1, 4 và "Đợt N1"). Nhánh `be/news-n1-contracts`. Chỉ thêm, không đổi nghĩa trường cũ. Không có endpoint cho người dùng thường (C-D1).

### Đợt N2 — Thu thập và lưu trữ
| | |
|---|---|
| Người làm | `cex-quant-engineer` (bộ phân loại thuần, Sonnet medium) ∥ `cex-backend-builder` (bảng, job, route; Sonnet high) → `cex-reviewer` |
| Nhánh | `be/news-n2-ingest` (quant làm trên `be/news-n2-classify`, lead gộp vào) |
| Cần trước | N1 đã gộp |
| Skill | `db-migration-host-safety`, `cex-feature-delivery`, `realtime-market-data-qa` (cách đo độ tươi), `crypto-multi-agent-analysis` |
| Thời lượng | 1–2 lượt |

**Việc của quant-engineer** — file `packages/core/src/newsClassify.ts`, chỉ hàm thuần, không I/O:
1. `canonicalUrl` và `titleFingerprint` (để khử các tin trùng gần giống nhau).
2. `tagSymbols(title, aliases)`:
   - dùng từ điển bí danh cho các cặp đang bật (BTC/Bitcoin, ETH/Ether…);
   - không bắt nhầm, ví dụ chuỗi "ETH" nằm trong một từ khác.
3. `classifyEventTypes(title, gdeltThemes?)`: luật từ khóa/chủ đề cho ra danh sách loại sự kiện; không chắc thì trả `OTHER`.
4. `classifierVersion` là hằng số.
5. Test vàng: ≥ 60 tiêu đề thật (tiếng Anh) gắn nhãn bằng tay, mỗi loại ≥ 5 tiêu đề.

**Việc của backend-builder**
1. Migration (chỉ thêm):
   - `news_sources`;
   - `news_items`: unique `url_canonical`, index `(first_seen_at)`, GIN trên `symbols`;
   - `news_ingest_runs`;
   - `macro_events`: unique `(code, scheduled_at)`.
2. Module `server/src/modules/news/`:
   - bộ đọc RSS;
   - bộ đọc GDELT (file 15 phút mới nhất);
   - nạp tệp lịch vĩ mô;
   - FRED, nếu có khóa (N-D3).
   
   Mỗi nguồn có thời gian chờ, lùi dần khi lỗi, đếm lỗi, và ghi vào `news_ingest_runs`.
3. Cờ cấu hình `NEWS_INGEST_ENABLED`, mặc định tắt ở production. Job chạy trong tiến trình server; lỗi của job không được làm sập server.
4. Route Admin của N1. Gửi cảnh báo vận hành khi một nguồn hỏng quá 3 chu kỳ.
5. Dọn dẹp:
   - tin không gắn cặp nào và không thuộc loại vĩ mô: giữ 30 ngày;
   - tin còn lại: giữ lâu dài, vì đó là bằng chứng của tín hiệu.
6. Test, chỉ dùng tệp RSS/GKG mẫu trong repo (không gọi mạng):
   - khử trùng lặp;
   - nguồn hỏng thì trạng thái chuyển đúng;
   - đổi giờ ET sang UTC đúng qua 2 mốc đổi giờ mùa hè.

**Nghiệm thu**
- [ ] `npm run verify` xanh trên nhánh.
- [ ] Chạy thử 1 giờ trên máy dev (không phải sàn thật). Báo cáo số thật: số tin thu được, độ trễ từng nguồn, 0 lỗi chưa xử lý.

**Lệnh giao việc**
> Làm **Đợt N2** theo `docs/plans/module-N-tin-tuc-va-vi-mo.md` (mục 3, 4 và "Đợt N2"). Phần của bạn: <quant: newsClassify | backend: bảng, job, route>. Test không gọi mạng. Không bật thu thập trên sàn thật.

**Sau đợt:** chủ dự án quyết định có bật `NEWS_INGEST_ENABLED` trên sàn thật hay không, để bắt đầu ghi RSS (loại tin này không lấy lại được về sau).

### Đợt N3 — Backfill lịch sử và nghiên cứu sự kiện
| | |
|---|---|
| Người làm | `cex-quant-engineer` (Sonnet high) → `cex-reviewer` |
| Nhánh | `be/news-n3-eventstudy` |
| Cần trước | N2 đã gộp; `docs/plans/holdout.json` đã chốt (dùng chung với C4); giả thuyết của N3 đã ghi |
| Thời lượng | 1–2 lượt |

**Việc**
1. `server/scripts/newsBackfill.ts`:
   - đọc các file GKG trong một khoảng ngày, lọc chủ đề crypto/vĩ mô;
   - ghi vào `news_items` với `firstSeenAt` bằng mốc thời gian của file;
   - chạy lại nhiều lần vẫn an toàn (idempotent);
   - ghi lại số file, số bài, dung lượng.
2. `server/scripts/newsEventStudy.ts` theo mục 5: chỉ dùng dữ liệu trước `holdout.from`; nến lấy từ bảng `candles` (nến đã đóng).
3. Viết báo cáo `docs/reports/<ngày>-module-N-nghien-cuu-su-kien.md`:
   - bảng loại × khung: n, trung bình, CI trước và sau hiệu chỉnh;
   - tổng số phép thử;
   - kết luận cho từng loại sự kiện: "ảnh hưởng biến động", "ảnh hưởng hướng" hoặc "không thấy".

**Nghiệm thu**
- [ ] Có test: tin có `publishedAt` ≤ t nhưng `firstSeenAt` > t thì không được tính tại t.
- [ ] Mọi con số trong báo cáo tái tạo được bằng lệnh ghi trong báo cáo.

### Đợt N4 — Phòng ban `news_event_risk` và cổng rủi ro v0
| | |
|---|---|
| Người làm | `cex-quant-engineer` (Sonnet high) → `cex-reviewer` |
| Nhánh | `be/news-n4-department` |
| Cần trước | N2 đã gộp. N3 không bắt buộc, vì luật v0 đã cố định trước |
| Skill | `crypto-multi-agent-analysis` |
| Thời lượng | 1 lượt |

**Việc**
1. `cexMarketAdapter.ts`: dựng lát `news` và `macroEvents` từ DB tại thời điểm asOf.
2. `snapshotBuilder.ts`: lọc theo `firstSeenAt`, đếm số tin bị loại vào `lookaheadItemsFiltered`.
3. `departments/newsEventRiskAgent.ts`:
   - áp dụng luật v0 ở mục 4;
   - mỗi tin/sự kiện được dùng tạo một bằng chứng `OBSERVED`;
   - không bao giờ đưa ra hướng ở v0.
4. `orchestrator.ts` và `finalSynthesisAgent.ts`:
   - thêm phòng ban này (không phải phòng ban lõi); có cờ chặn thì rating là `REVIEW`;
   - dựng `newsContext` theo mục 4.1, gồm tăng bất định và trần `confidence`;
   - đặt câu "Tin tức: …" vào `executiveSummary`.
5. Phòng ban 4 thôi đọc `headlines`.
6. Cập nhật skill `crypto-multi-agent-analysis`: bước 2 đổi sang lọc theo `firstSeenAt`; cập nhật danh sách phòng ban.

**Nghiệm thu**
- [ ] Test đủ các ca:
  - trong cửa sổ sự kiện HIGH → `REVIEW`;
  - ngoài cửa sổ → không ảnh hưởng;
  - nguồn tin chết → phòng ban `ABSTAIN`, và rating không đổi chỉ vì thiếu tin;
  - tin hack gắn đúng cặp thì chặn cặp đó, không chặn cặp khác;
  - có sự kiện HIGH trong 24 giờ tới → `confidence` ≤ 0.60, `impact` có `UNCERTAINTY_RAISED`, hướng không đổi;
  - độ nghiêng của tin đổi dấu → hướng và rating không đổi (v0), `tilt.validated = false`.
- [ ] `node infra/test-all.mjs quant.test.ts analysis.test.ts` và `npm run verify` đều xanh.

### Đợt N5 — Giá trị tăng thêm trong backtest
| | |
|---|---|
| Người làm | `cex-quant-engineer` (Sonnet high) → `cex-reviewer` |
| Cần trước | C4 đã có backtest trung thực; N3 và N4 đã gộp |

**Việc**
1. Chạy backtest C4 hai lần trên cùng dữ liệu dev: có cổng tin và không có cổng tin.
2. Báo cáo theo mục 5, kèm đề xuất bật hay không. Bật là tạo phiên bản engine mới, cần chủ dự án duyệt.

### Đợt N6 — Giao diện Admin "Tin tức và sự kiện"
| | |
|---|---|
| Người làm | Antigravity (qua PROMPT) ∥ `cex-e2e-acceptance` (Sonnet medium) |
| Cần trước | N1 đã gộp (làm trên mock); N2 đã gộp (để chạy với dữ liệu thật) |

**Việc.** Giao diện gồm:
- danh sách tin đã thu, lọc theo cặp, loại, nguồn;
- sức khỏe từng nguồn;
- các sự kiện vĩ mô sắp tới;
- trong trang chi tiết tín hiệu: các tin/sự kiện mà engine đã dùng.

Chỉ hiện tiêu đề và link nguồn.

### Ngoài kế hoạch: dùng LLM phân loại tin
Chỉ làm khi chủ dự án đổi C-D2. Khi đó phải có đủ:
- đầu ra JSON theo schema, có kiểm số liệu;
- lưu phiên bản mô hình đã dùng;
- **chỉ đánh giá tiến**, trên tin xuất hiện sau ngày cắt dữ liệu huấn luyện của mô hình;
- trần ngân sách theo tháng;
- khi LLM lỗi thì quay về bộ phân loại bằng luật.

## 7. Quyết định

**Đã duyệt 2026-10-14** (chủ dự án: "bắt đầu"):
- N-D1, N-D2, N-D4, N-D5 như bảng dưới.
- N-D6 duyệt kèm yêu cầu: lời khuyên luôn kết hợp tin và dữ liệu giao dịch, xem mục 4.1.
- N-D3 chờ chủ dự án đăng ký khóa FRED.

| Mã | Đề xuất | Vì sao |
|---|---|---|
| N-D1 | Duyệt Module N. Làm N0 → N1 → N2 ngay sau đợt đang chạy, xen với A/C theo luật gộp tuần tự. Cố gắng xong N4 trước C2 | Tin RSS không lấy lại được về sau, nên ghi càng sớm càng có dữ liệu. Cổng rủi ro có mặt ngay trong phiên bản engine 1 thì không tốn thêm một phiên bản (C-D5b) |
| N-D2 | v0 chỉ dùng nguồn miễn phí: GDELT, các RSS đạt điều khoản ở N0, và lịch công bố chính thức. Không dùng nguồn trả phí | Đủ cho cổng rủi ro và nghiên cứu. Chỉ trả phí khi N3/N5 chứng minh là cần |
| N-D3 | Chủ dự án đăng ký khóa FRED miễn phí và đặt trong `host-data/.env.host` (không đưa vào repo). Nếu không có khóa, v0 chỉ dùng giờ công bố | Nghiên cứu "sau công bố" cần giá trị thực đúng như tại thời điểm (ALFRED). Cổng v0 chỉ cần giờ công bố |
| N-D4 | Giữ C-D2 (không LLM) cho Module N v0. LLM sau này chỉ được đánh giá tiến và có trần ngân sách | Backtest LLM trên tin cũ bị rò rỉ tương lai qua dữ liệu huấn luyện |
| N-D5 | Chỉ lưu và hiển thị tiêu đề, link và nhãn tự suy ra; không lưu toàn văn | Bản quyền và điều khoản của nguồn |
| N-D6 | Ở v0, tin chỉ được dùng làm **cổng rủi ro** với ngưỡng đặt trước. Chỉ dùng tin để dự báo **hướng** sau N3 và N5, dưới dạng phiên bản engine mới | Tránh chỉnh tham số theo dữ liệu; hiện chưa có bằng chứng về hướng |

## 8. Rủi ro và cách chặn

| Rủi ro | Cách chặn |
|---|---|
| Rò rỉ tương lai qua `publishedAt`, hoặc qua tin bị sửa sau | Lọc theo `firstSeenAt`; có test riêng ở N3 và N4 |
| Nguồn đổi định dạng hoặc chết mà không ai biết | `news_ingest_runs`, trạng thái từng nguồn, cảnh báo, lát `UNAVAILABLE` |
| Gắn nhầm cặp vì bí danh mơ hồ | Test vàng; loại mơ hồ đưa vào `OTHER`; chỉ luật 2 dùng thông tin cặp |
| Thu thập làm nặng máy đang chạy sàn thật | Đo ở N0; job nhẹ, hạ ưu tiên, có cờ tắt |
| Độ phủ của GDELT thay đổi theo năm | Chuẩn hóa theo tổng số bài; báo cáo riêng từng năm |
| Vi phạm điều khoản nguồn | Làm N0 trước khi code; chỉ lưu tiêu đề và link |
| Đẹp trên backtest nhưng vô dụng khi chạy thật | Holdout, A/B ở N5; cổng M3 vẫn là bước kiểm cuối cùng |

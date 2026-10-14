# Báo cáo 2026-10-14 — Module N, đợt N0: nguồn tin và lịch vĩ mô

Phần đầu của [Module N](../plans/module-N-tin-tuc-va-vi-mo.md). Lead làm, không viết code sản phẩm.

Kết quả:
- 6 nguồn RSS truy cập được;
- đã đo thật dữ liệu GDELT;
- tệp lịch vĩ mô gồm 119 sự kiện có link nguồn (`server/src/modules/news/data/macro-calendar.csv`).

Đợt N0 phát hiện 3 điểm làm thay đổi thiết kế N2 và N3 (mục 4).

## 1. RSS (đo lúc 2026-10-14 16:23 UTC, một lần)

| Nguồn | URL | HTTP | Số tin | Tin mới nhất | Khoảng thời gian trong feed |
|---|---|---|---|---|---|
| CoinDesk | `https://www.coindesk.com/arc/outboundfeeds/rss/` | 200 | 25 | 48 phút trước | 27,6 h |
| Cointelegraph | `https://cointelegraph.com/rss` | 200 | 30 | 122 phút trước | 29,3 h |
| Decrypt | `https://decrypt.co/feed` | 200 | 34 | 8 phút trước | 51,6 h |
| The Block | `https://www.theblock.co/rss.xml` | 200 | 19 | 30 phút trước | 34,2 h |
| Fed (thông cáo) | `https://www.federalreserve.gov/feeds/press_all.xml` | 200 | 20 | không đọc được định dạng ngày (N2 phải xử lý) | — |
| SEC (thông cáo) | `https://www.sec.gov/news/pressreleases.rss` | 200 | 25 | 113 phút trước | 1.031 h (ra tin thưa) |

Cách đo:
- `curl -L -A <UA>` rồi đếm `<item>`;
- lấy `pubDate` mới nhất so với giờ máy;
- đồng hồ máy lệch dưới 2 giây so với Google, Binance và GDELT (đã đo).

Đây là đo **một lần**, chưa phải độ trễ 24 giờ. N2 sẽ đo 1 giờ trên máy dev; đo 24 giờ khi bật trên sàn thật.

Feed giữ 1–2 ngày tin, nên chu kỳ thu 2–5 phút là đủ, không mất tin.

## 2. GDELT (đo trên file thật)

**Thời điểm tải lên so với mốc giờ ghi trong tên file** (lấy theo `Last-Modified`):

| File | Kích thước | Tải lên lúc | Tải lên trước mốc tên |
|---|---|---|---|
| `20261014160000.gkg.csv.zip` | 6,11 MB | 15:50:46 | 554 s |
| `20261014154500` | 6,69 MB | 15:35:25 | 575 s |
| `20261014153000` | 6,31 MB | 15:20:19 | 581 s |
| `20261013120000` | 5,09 MB | 11:49:50 | 610 s |
| `20250601120000` | 2,86 MB | 11:48:44 | 676 s |
| `20230301120000` | 5,81 MB | 11:50:57 | 543 s |

- Lúc 16:24 UTC, `lastupdate.txt` đã liệt kê file `20261014163000` nhưng file đó (và cả file `161500`) trả **404**. Danh sách "mới nhất" có thể trỏ tới file chưa có.
- Trong tệp GKG, trường `DATE` của mọi dòng đều bằng mốc của file. GKG **không có giờ đăng bài**.

**Nội dung một file 15 phút** (`20261014160000`, 18,8 MB sau giải nén):
- 1.464 bài; 1.462 có tiêu đề (`<PAGE_TITLE>`); 1.464 có tone.
- Liên quan crypto (từ khóa trong tiêu đề hoặc URL): **4 bài**. Liên quan vĩ mô: **29 bài**.
- Có chủ đề `ECON_BITCOIN`.
- Có bài đăng lại trùng (aol.com chép lại bài của fool.com).
- **71/1.464 bài (4,8%) có tone = 0** với điểm tích cực = 0, tiêu cực = 0, và chỉ khoảng 30 từ. Đó là "không chấm được", không phải trung tính.

Đây là một mẫu 15 phút; số bài crypto mỗi ngày cần đo 24 giờ (N2).

**Dung lượng:** khoảng 6 MB nén cho mỗi 15 phút, tức khoảng 590 MB/ngày, khoảng 18 GB/tháng nếu tải mọi file. Tải một file mất khoảng 1,5 giây.

## 3. Lịch vĩ mô — `server/src/modules/news/data/macro-calendar.csv`

| Loại | Số dòng | Khoảng | Nguồn | Giờ |
|---|---|---|---|---|
| `FOMC_DECISION` | 56 | 2021-01 → 2027-12 | Trang lịch FOMC của Fed (tải bằng script) | 14:00 ET, đã xác minh trên 2 thông cáo thật ("For release at 2:00 p.m. EDT/EST") |
| `PCE` | 35 | 2025-01 → 2027-12 | Lịch ICS của BEA | Giờ UTC lấy nguyên từ ICS; **không phải luôn 8:30 ET** (vd 2025-04-30 lúc 14:00 UTC = 10:00 ET) |
| `CPI` | 14 | 2026-11 → 2027-12 | Trang lịch BLS, đọc bằng trình duyệt | 08:30 ET |
| `NFP` | 14 | 2026-11 → 2027-12 | Trang lịch BLS, đọc bằng trình duyệt | 08:30 ET |

**Cách dựng:**
- Script ở scratchpad của phiên (`build-macro-calendar.mjs`).
- Giờ ET đổi sang UTC bằng múi `America/New_York` qua `Intl`, nên tự đúng ở các mốc đổi giờ mùa hè.
- Kiểm các ngày sát mốc đổi giờ:
  - FOMC 2026-10-28 → 18:00Z (EDT), 2026-12-09 → 19:00Z (EST);
  - CPI 2027-03-10 → 13:30Z (trước ngày đổi giờ 14/3), 2027-04-13 → 12:30Z.
- Bỏ "August 22 (notation vote)" năm 2025, vì đó không phải cuộc họp có công bố lúc 14:00.
- Không có dòng trùng (script kiểm `code|scheduledAtUtc`).
- Mỗi dòng có `sourceUrl`.

**Thiếu:** CPI và NFP **trước tháng 11/2026**. BLS chặn truy cập tự động (HTTP 403 với `curl`, kể cả tệp `bls.ics`), và trang lịch chỉ liệt kê các kỳ sắp tới. Nghiên cứu sự kiện ở N3 cần các ngày này, có hai cách lấy:
- (a) API `release/dates` của FRED (cần khóa, N-D3);
- (b) trang lưu trữ của BLS, đọc bằng trình duyệt.

Khuyến nghị (a), vì có thể tự động và kiểm lại được.

## 4. Phát hiện làm đổi thiết kế

1. **`firstSeenAt` khi backfill GDELT = mốc trong tên file**, không phải `Last-Modified`.
   - File thực tế có mặt sớm hơn mốc tên 9–11 phút; dùng mốc tên là chậm hơn thực tế, tức an toàn, không nhìn trước.
   - `publishedAt` của tin GDELT = `null`, vì GKG không có giờ đăng.
   - Khi chạy thật, `firstSeenAt` = lúc hệ tải được file. Bộ đọc phải chịu được việc `lastupdate.txt` trỏ tới file chưa có (404 → thử lại sau, không báo lỗi nguồn ngay).
2. **Tone GDELT:** khi điểm tích cực và tiêu cực đều bằng 0 thì `tone = null` (NULL ≠ 0). Đưa vào `newsClassify` ở N2.
3. **Chạy thật dùng cùng loại file GKG với backfill**, để dữ liệu lúc chạy thật và lúc backtest giống nhau (cùng tone, cùng chủ đề).
   - DOC API không trả tone cho từng bài, dùng nó sẽ làm hai bên lệch nhau. DOC API chỉ làm phương án dự phòng.
   - Cái giá: khoảng 18 GB tải về mỗi tháng trên máy đang chạy sàn. Lọc ngay khi đọc, không lưu file thô.
   - Có cờ cấu hình để tắt GDELT, chỉ giữ RSS.

Ngoài ra:
- **Backfill nhiều năm** khoảng 200 GB/năm tải về. N3 phải chọn khoảng ngày hợp lý (đề xuất 12–18 tháng trước `holdout.from`) và đo thời gian tải trước.
- **Crypto trên GDELT thưa** (4 bài/15 phút trong mẫu). Tin riêng từng cặp phải trông vào RSS báo crypto; GDELT mạnh ở tin vĩ mô và các tin crypto lớn.

## 5. Điều khoản

| Nguồn | Kết luận | Căn cứ |
|---|---|---|
| GDELT | **Được dùng**, kể cả thương mại, miễn phí. **Bắt buộc ghi nguồn GDELT Project kèm link** gdeltproject.org ở nơi hiển thị và trong báo cáo | Trang About của GDELT |
| CoinDesk RSS | Dùng nội bộ (chỉ Admin, chỉ tiêu đề + link) rủi ro thấp. **Hiển thị cho người dùng trả phí cần xin phép bằng văn bản**: CoinDesk bán quyền nhúng tin qua thỏa thuận riêng | Không tìm thấy điều khoản RSS công khai; có thỏa thuận nhúng tin thương mại với một bên thứ ba |
| Cointelegraph RSS | Như CoinDesk: nội bộ được; hiển thị cho người dùng thì xin phép | Trang terms-and-privacy, không thấy điều khoản riêng cho RSS |
| Decrypt, The Block | **Chưa kiểm**. Tạm xếp như CoinDesk | — |
| Fed, SEC | Tài liệu của chính phủ Mỹ. SEC yêu cầu truy cập tự động khai báo `User-Agent` có tên và email, và giới hạn tốc độ (N2 phải tuân theo) | Hiểu biết chung về chính sách truy cập của SEC; N2 kiểm lại trang chính sách |

Quy tắc N-D5 (chỉ tiêu đề + link + nhãn tự suy) cùng C-D1 (chỉ Admin) đủ cho v0. Trước GĐ6 (người dùng thấy tin) phải có văn bản cho phép của từng báo, hoặc chỉ hiển thị nhận định của hệ, không kèm tiêu đề báo.

## 6. Việc tiếp theo

- **N1** (hợp đồng 0.17.0): đã xong trên nhánh `be/news-n1-contracts`, đang được `cex-reviewer` rà.
- **N2:** đưa các phát hiện ở mục 4 vào lệnh giao việc.
- **Chủ dự án:**
  - khóa FRED (N-D3) để có lịch CPI/NFP lịch sử;
  - quyết định có tải khoảng 18 GB/tháng cho GDELT khi chạy thật trên máy sàn hay không (mặc định: bật, có cờ tắt).

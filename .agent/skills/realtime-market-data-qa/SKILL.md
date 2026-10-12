---
name: realtime-market-data-qa
description: QA for realtime market data in the CEX simulator - Binance spot/futures WebSocket ingestion (server/src/modules/market/binance.ts), MarketDataService LIVE/STALE/UNAVAILABLE freshness, futures mark price and funding timing, the /ws hub (snapshot-on-subscribe, throttles, heartbeat, 4401), the contracts RealtimeClient (reconnect, resubscribe, status) and how stale or missing data reaches the matcher, liquidation engine and UI. Use when changing or debugging feeds, reconnect/backoff, heartbeat, subscriptions, staleness thresholds, order book/ticker/candle/trade streams, "giá đứng im", "mất kết nối", "dữ liệu cũ", "STALE", "websocket", "reconnect", "sổ lệnh không cập nhật", or when designing tests that simulate feed outages. Not for rendering decisions inside UI components (use orderbook-ui-states) or REST-only endpoints.
---

# Realtime market data QA — dữ liệu thời gian thực không được "giả vờ còn sống"

Ký hiệu: **[RUNTIME]** · **[AUTO]** · **[MANUAL]** · **[DOC]**. Trạng thái: **PROVEN** · **INFERRED** · **UNVERIFIED**.

## 1. Purpose — Mục đích
Bảo đảm dữ liệu thị trường mà matcher, engine Futures và người dùng nhìn thấy là **mới, đúng thứ tự trong phạm vi kiến trúc hiện có, và
được đánh dấu cũ khi nó cũ** (bất biến 6, 15, 17, 18). Mỗi vấn đề phải có cách tái hiện và test khi khả thi; không bịa giao thức
(sequence, backfill) mà hệ thống không có.

## 2. When to use
- Sửa `server/src/modules/market/*` (binance, marketData, candleService, depthSnapshots, sparklines, sim), `server/src/modules/futures/markData.ts`,
  `server/src/realtime/hub.ts`, `packages/contracts/src/realtime*.ts`.
- Điều tra: giá đứng im, sổ lệnh không đổi, nến thiếu, lệnh không khớp dù giá đã chạm, thanh lý không chạy, kênh bị từ chối, UI không biết mất kết nối.
- Thiết kế test mất kết nối / STALE / reconnect; trước khi thêm engine tín hiệu (P06) dùng nến.

**Không dùng khi:** chỉ quyết định UI hiển thị trạng thái thế nào (→ `orderbook-ui-states`); endpoint REST không liên quan realtime.

## 3. Scope and non-goals
- Sửa được: server, contracts, test. UI chỉ đọc và ghi phát hiện.
- **Không** thử ngắt mạng / chặn Binance trên sàn thật (:8090) hay máy đang phục vụ người dùng; chỉ trên dev/test (sim feed, clock giả).
- Không tự đặt ngưỡng STALE, chu kỳ heartbeat, thuật toán backoff mới, hay thêm sequence/backfill mà không đề xuất (mục 10).

## 4. Required context — kiến trúc thực tế (đã kiểm)
| Lớp | Hành vi hiện có | Vị trí |
|---|---|---|
| Binance → server | Stream mỗi cặp: `@ticker`, `@depth20@100ms`, `@aggTrade`, kline 6 khung; futures thêm `@markPrice@1s`. Sổ lệnh futures ở `/public/stream`, còn lại `/market/stream` (bất biến 18). SUBSCRIBE theo lô 100, cách 250 ms | `binance.ts:113-141, 325-329` |
| Reconnect upstream | backoff `min(30s, 1s·2^n)`, **không jitter**; xoay kết nối mỗi 23 h; **không** ping/idle watchdog riêng | `binance.ts:333, 349` |
| Sổ lệnh | **Ảnh chụp 20 mức thay toàn bộ** mỗi lần (partial depth) — không có diff, không `lastUpdateId`, không sequence | `binance.ts:223-225`, `marketData.ts:87-96` |
| Độ tươi | `depthAt === null` → UNAVAILABLE; `now − depthAt > staleThresholdMs` → STALE; còn lại LIVE. Chỉ dựa trên **giờ nhận depth tại server** (không dùng event time của Binance). Timer 1000 ms | `marketData.ts:117-138` |
| Ngưỡng | mặc định 10 000 ms (`stale_threshold_ms`), admin chỉnh 2 000–120 000 | `schema.ts` (exchange_settings), `packages/contracts/src/admin.ts:109` |
| Khi STALE | không nhận lệnh (`MARKET_DATA_STALE` 503), matcher bỏ qua cửa sổ, futures không khớp/thanh lý/TP-SL; `livePrice()` = null trừ khi LIVE; cảnh báo Telegram sau 2 phút | `orderService.ts:86-94`, `matcher.ts:87`, `futures/service.ts:129,645,810`, `ops/alerts.ts:97` |
| Mark futures | cùng ngưỡng, tính khi đọc; funding chốt khi `nextFundingTime` trong bộ nhớ nhảy kỳ | `futures/markData.ts:36-54` |
| Hub `/ws` | Origin phải trong allowlist; phiên đọc **lúc upgrade**; tối đa 100 kênh; **snapshot khi subscribe** cho ticker, depth, nến đang chạy, `market:status`, `exchange:status`, `tickers` và bản futures (gồm mark); **không** snapshot cho `trades:*`, `user`. Throttle depth 500 ms, ticker 1000 ms; `tickers` gộp mỗi 1 s chỉ cặp vừa đổi; heartbeat 30 s (ping, cắt client không pong, đóng **4401** khi phiên hết) | `hub.ts:27-39, 69-127, 158-262` |
| Client (contracts) | trạng thái `connecting/open/closed`; backoff `min(15s, 500ms·2^n)` không jitter; tự subscribe lại khi mở; ping 20 s nhưng **không kiểm pong**; payload **không** được kiểm schema; phải gọi `reconnect()` sau đăng nhập/2FA/đăng xuất; chưa có `onClose` (R-16) | `realtimeClient.ts:3, 27-118` |
| Sim | `MARKET_FEED=sim` tick 1000 ms, **không bao giờ STALE**; production từ chối sim | `market/sim/feed.ts:95-125`, `server/src/config.ts:76-78` |

## 5. Workflow

**Bước 1 — Vẽ đường đi của một mẩu dữ liệu.** Binance frame → `binance.ts` handler → `MarketDataService.ingest*` → sự kiện (`depth`/`ticker`/`trade`/`candle`/`status`)
→ (a) matcher / futures engine, (b) hub → kênh → client → store UI. Ghi rõ ở mỗi chặng: có kiểm hợp lệ không, có throttle không, có snapshot không, trạng thái lấy từ đâu.

**Bước 2 — Kiểm vòng đời kết nối** (cả upstream và `/ws`):
- mở → subscribe → nhận; đóng → backoff → mở lại → **subscribe lại đủ kênh**; dọn timer/handler khi đóng (không nhân đôi listener).
- liveness: phát hiện socket nửa mở bằng gì? (upstream: chỉ gián tiếp qua STALE; client: không kiểm pong) → ghi rủi ro, không giả định có watchdog.
- đóng có chủ đích (4401, đăng xuất) khác đóng do lỗi: client hiện tự nối lại như khách và **không báo** cho app.

**Bước 3 — Kiểm ngữ nghĩa thời gian.** Mọi so sánh độ tươi dùng đồng hồ server (`now()` tiêm được trong test). Không so `Date.now()` của trình duyệt
với `updatedAt` của server để kết luận STALE (lệch đồng hồ). Nến: `openTime` = mốc mở UTC; chỉ lưu nến đã đóng (bất biến 7).

**Bước 4 — Kiểm lan truyền trạng thái tới từng consumer.**
| Consumer | Lấy trạng thái từ | Câu hỏi phải trả lời |
|---|---|---|
| Đặt lệnh / matcher | `market.isLive()` / `livePrice()` | STALE có chặn mọi loại lệnh (stop, OCO, cảnh báo giá) không? |
| Futures engine | `liveMark()` | mark STALE → không thanh lý, không TP/SL? Funding khi server khởi động lại qua mốc? |
| Hub → UI | kênh `market:status` / `futures:status` | Kênh `tickers`, `ticker:S`, `depth:S`, `futures:mark:S` có được gửi lại khi chuyển STALE không? |
| UI | `spotTradeBlock(symbol, exchangeStatus, ticker)` | dựa vào `ticker.status` — có thấy STALE khi feed chết không? |

**Bước 5 — Tái hiện an toàn.** Ưu tiên test với đồng hồ giả (không cần mạng):
```ts
// mẫu: exchange.test.ts:138 (STALE chặn lệnh) + api.test.ts:208 (WebSocket thật tới server test)
setBook(env, 'BTCUSDT', bids, asks);          // depthAt = clock.now()
env.clock.advance(11_000);                     // > ngưỡng mặc định 10 000 ms
env.market.checkStaleness();                   // hoặc getStatus(symbol) — đánh giá lại khi đọc
expect(env.market.getStatus('BTCUSDT')).toBe('STALE');
// với hub: mở ws tới ApiHarness, subscribe 'tickers' + 'market:status', advance + checkStaleness,
// rồi khẳng định frame nào được gửi (market:status có; tickers có/không)
```
Mất kết nối upstream: test `StreamConnection` với server `ws` cục bộ giả Binance (chưa có test nào — `binance.ts` chưa có test close/backoff/resubscribe).
Dev thủ công: `npm run dev -- --sim` không tạo STALE được; muốn thấy STALE ở UI dùng mock (`setMockScenario('normal')`: AVAXUSDT STALE, LINKUSDT UNAVAILABLE).

**Bước 6 — Viết phát hiện / sửa** theo mục 9; sửa phía server/contracts kèm test; phía UI ghi cho Antigravity.

**Bước 7 — Chạy:** `npx vitest run server/src/modules/market` (và file test liên quan) → `npm test` + `npm run typecheck`.
Kiểm hành vi trình duyệt: `npm run ui-check -- --e2e` (sim feed — không có ca STALE).

## 6. Project-specific rules
| Quy tắc | Bằng chứng | Mức |
|---|---|---|
| Khớp lệnh chỉ dùng 20 mức realtime; REST sâu chỉ hiển thị | bất biến 15; `depthSnapshots.ts:24-27` (ngân sách trọng số 1200/phút) | [RUNTIME] cho depth sâu; **nến REST không có ngân sách** (`candleService.ts:35-41`, INFERRED rủi ro) |
| STALE / sàn dừng → không nhận lệnh, không khớp | `orderService.ts:86-94`, `matcher.ts:87` + test `exchange.test.ts:138`, `server/src/modules/futures/futures.test.ts:159` | [RUNTIME] + [AUTO] |
| Chỉ lưu nến đã đóng, idempotent | `binance.ts:248-271` | [RUNTIME]; chưa có test |
| Futures: sổ lệnh `/public`, còn lại `/market` | `binance.ts:138-141` + test phase25 | [RUNTIME] + [AUTO] |
| Phát hiện mất feed | `ops/alerts.ts` FeedWatcher (2 phút) | [RUNTIME] (chỉ cảnh báo) |
| Kênh/phiên `/ws` | `hub.ts` (Origin, 100 kênh, 4401) | [RUNTIME]; Origin chưa có test |

**Phát hiện đã biết**
| Mã | Nội dung | Trạng thái |
|---|---|---|
| RT-1 | Chuyển LIVE→STALE chỉ phát trên `market:status`/`futures:status`; `tickers`, `ticker:S`, `depth:S`, `futures:mark:S` giữ `status: LIVE` cũ → UI (dựa `ticker.status`) có thể hiện giá cũ như mới và mở form | PROVEN (đọc `marketData.ts:117-131`, `hub.ts:262-292`); hành vi runtime UNVERIFIED |
| RT-2 | Không resync sau reconnect: `user`, `trades:*` không có snapshot; UI không gọi lại REST khi `closed → open` | PROVEN (code); mất sự kiện INFERRED |
| RT-3 | Upstream không có idle watchdog / jitter; socket nửa mở chỉ lộ qua STALE + cảnh báo 2 phút | INFERRED |
| RT-4 | Client ping không kiểm pong; đóng 4401 tự nối lại như khách, app không được báo (chờ R-16 `onClose`) | PROVEN (code) |
| RT-5 | Funding có thể bị bỏ qua nếu server khởi động lại qua mốc funding hoặc mất feed > 1 kỳ (phát hiện kỳ dựa trên trạng thái trong bộ nhớ) | INFERRED — cần test |
| RT-6 | Tài liệu tần suất depth lệch: `packages/contracts/src/realtime.ts:19` ghi ~1/s, code throttle 500 ms (~2/s) | PROVEN |
| RT-7 | `livePrice()` có thể trả giá giao dịch cũ khi depth vẫn mới (độ tươi chỉ theo depth) | INFERRED |
| RT-8 | e2e không tạo được STALE (sim không bao giờ cũ; ngưỡng tối thiểu 2 000 ms) | PROVEN |

## 7. Anti-patterns
- Giả định có sequence/`lastUpdateId`/diff depth — hệ thống dùng ảnh chụp 20 mức.
- Thêm "backfill sau reconnect" ở UI bằng cách tự gọi Binance — UI chỉ gọi API của sàn.
- Đánh dấu STALE dựa trên đồng hồ trình duyệt.
- Phát giá/sổ lệnh cũ với `status: 'LIVE'` cố định; thay `null` bằng giá cuối cùng "cho đẹp".
- Gọi REST Binance trong đường khớp lệnh (bất biến 15).
- Đăng ký 50 kênh `ticker:<S>` thay vì một kênh `tickers` (giới hạn 100 kênh, tiền lệ REVIEW-03).
- Test mất kết nối trên sàn thật; `sleep` thật trong test thay vì đồng hồ giả.

## 8. Verification checklist
- [ ] Đã vẽ đường dữ liệu và ghi trạng thái lấy từ đâu ở mỗi consumer.
- [ ] Reconnect: subscribe lại đủ kênh, không nhân đôi listener/timer (đọc code + test nếu sửa).
- [ ] STALE: có test với đồng hồ giả cho thay đổi; kiểm cả kênh tổng hợp (`tickers`, `futures:mark`), không chỉ `market:status`.
- [ ] Không đổi ngưỡng/giao thức khi chưa duyệt.
- [ ] `npm test` đạt (ghi N/N); `npm run typecheck` đạt.
- [ ] Phát hiện có cách tái hiện + test (hoặc ghi lý do không viết được test).

## 9. Evidence and reporting format
```markdown
### RT-x — <tóm tắt>
- Lớp: upstream | MarketDataService | futures mark | hub | client | UI
- Bằng chứng: <file:line> (+ frame /ws hoặc log nếu chạy thật trên dev)
- Tái hiện: <test với clock giả / mock scenario / dev sim> — lệnh: `npx vitest run <file>`
- Ảnh hưởng: khớp lệnh | thanh lý | hiển thị | thông báo
- Đề xuất: <thay đổi> · cần quyết định kiến trúc? có/không
- Trạng thái: PROVEN | INFERRED | UNVERIFIED
```

## 10. Escalation conditions
- Đổi ngưỡng STALE mặc định, heartbeat, backoff, giới hạn kênh, hay thêm giao thức sequence/backfill/snapshot mới cho `user`.
- Thay đổi khiến client cũ (UI đang chạy) hiểu sai payload — đi qua `cex-contract-first-api`.
- Cần ngắt mạng / chặn Binance trên máy đang chạy sàn thật.
- Phát hiện matcher/thanh lý chạy trên dữ liệu không LIVE (vi phạm bất biến 6/17) → báo ngay, mức cao.
- Nghi funding bị bỏ/lặp trên dữ liệu thật → báo, không tự bù tiền.

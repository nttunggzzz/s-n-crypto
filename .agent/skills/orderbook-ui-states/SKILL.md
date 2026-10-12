---
name: orderbook-ui-states
description: Honest data states for the trading screens of the CEX simulator (order book, recent trades, candlestick chart, ticker header, order/trade panel, open orders, balances; spot and futures) - defines loading, live, empty, error, stale, unavailable, disconnected, reconnecting and trade-blocked states from what the contract really delivers (DataStatus, MarketStatus, exchange:status, RealtimeClient status, spotTradeBlock/futuresTradeBlock), checks the apps (read-only) and the backend for gaps, writes UI requirements and transition tests. Use when reviewing or specifying how trading panels behave while loading, empty, failing, stale or disconnected, when "sổ lệnh hiện dữ liệu cũ", "giá đứng im mà vẫn đặt lệnh được", "trống hay đang tải", "banner mất kết nối", or when writing acceptance tests/PROMPT items for Antigravity about these states. Not for writing UI code (Antigravity owns apps/*), not for visual design, and not for feed internals (use realtime-market-data-qa).
---

# Order book UI states — hiển thị trung thực trạng thái dữ liệu

Ký hiệu: **[RUNTIME]** · **[AUTO]** · **[LINT-WARN]** · **[MANUAL]** · **[DOC]**. Trạng thái: **PROVEN** · **INFERRED** · **UNVERIFIED** · **PROPOSED** (đề xuất, chưa có trong hệ thống).

## 1. Purpose — Mục đích
Người dùng không bao giờ được thấy: giá cũ như giá mới, "trống" khi thực ra đang tải hoặc lỗi, số 0 thay cho "không có dữ liệu", nút đặt
lệnh mở khi server chắc chắn từ chối. Skill này chuẩn hóa các trạng thái **từ những gì hợp đồng thật sự cung cấp**, phát hiện chỗ hợp đồng
còn thiếu, và biến chúng thành yêu cầu + test nghiệm thu cho Antigravity — Claude Code không sửa UI.

## 2. When to use
- Đặc tả/rà soát hành vi trang Giao dịch Spot (`/trade/:symbol`), Futures (`/futures/:symbol`), Thị trường, Ví khi tải / trống / lỗi / STALE / mất kết nối.
- Viết mục PROMPT-xx hoặc phát hiện trong báo cáo rà soát về trạng thái dữ liệu; viết test e2e cho các chuyển trạng thái.
- Quyết định backend/hợp đồng cần thêm tín hiệu gì để UI hiển thị đúng (ví dụ R-16 `onClose`).

**Không dùng khi:** viết code UI; chỉnh màu/bố cục; lỗi ở tầng feed/hub (→ `realtime-market-data-qa`); định dạng số (→ `decimal-money-safety`).

## 3. Scope and non-goals
- Đọc `ui/apps/*`, `ui/packages/ui` (chỉ đọc). **Không sửa** `ui/` hay `ui/.agent/`.
- Claude Code được sửa: hợp đồng (`helpers.ts`, `realtime*.ts`, mocks), server (hub), `e2e/`, tài liệu (`docs/LOI-HIEN-TAI.md`, `docs/antigravity/*`).
- Không tự quyết thiết kế hình ảnh (màu, vị trí banner); chỉ quy định **thông tin** và **hành vi** (nút có bấm được không, giá trị hiện gì).

## 4. Required context — tín hiệu hợp đồng thật sự có
| Tín hiệu | Ở đâu | Ý nghĩa |
|---|---|---|
| `DataStatus` = `LIVE` / `STALE` / `UNAVAILABLE` | `packages/contracts/src/common.ts:63`; có trong `Ticker`, `Depth`, `MarketTrades`, `Sparkline` (`market.ts`), mark futures (`packages/contracts/src/futures.ts:77`) | trạng thái **tại thời điểm gửi payload** |
| `MarketStatus` (kênh `market:status`, `futures:status`) | `market.ts` — `connection` (CONNECTED/CONNECTING/DISCONNECTED = kết nối server↔Binance), `staleThresholdMs`, mỗi cặp `status` + `lastUpdateAt` | **nguồn có thẩm quyền** cho STALE (được đẩy khi đổi) |
| `exchange:status` | `tradingHalted`, `disabledSymbols` | sàn dừng / cặp tắt |
| Trạng thái kết nối client | `RealtimeClient.onStatus` → `'connecting' \| 'open' \| 'closed'` (`realtimeClient.ts:3`) | kết nối trình duyệt↔server; **không** có "reconnecting" riêng, chưa có `onClose` (R-16) |
| Chặn đặt lệnh | `spotTradeBlock` / `futuresTradeBlock` → `HALTED > PAIR_DISABLED > PRICE_STALE`, nhãn `TRADE_BLOCK_LABELS` (`packages/contracts/src/helpers.ts:116-141`) | spot dựa `ticker.status`; **ticker null cũng thành PRICE_STALE** |
| Giá trị thiếu | mọi trường giá của `Ticker` nullable ("never 0") | hiện "—" |
| Nến | `Candle` không có `status`; `closed=false` = nến đang chạy | độ tươi nến suy ra từ `market:status` |
| Snapshot khi subscribe | có: ticker, depth, nến đang chạy, status, `tickers`; **không**: `trades:*`, `user` (`server/src/realtime/hub.ts:188-222`) | sau reconnect phải gọi lại REST cho phần không có snapshot |
| Mock | `setMockScenario('normal' \| 'empty' \| 'error' \| 'halted' \| 'signedOut' \| 'unverified')`; `normal` có AVAXUSDT STALE, LINKUSDT UNAVAILABLE, SUIUSDT tắt; `createMockRealtimeClient({ dropEveryMs })` | `packages/contracts/README.md` mục 3 |
| Test id | `trade-block-reason` (`docs/antigravity/TESTIDS.md:65`) | e2e kiểm banner chặn lệnh |

## 5. Workflow

**Bước 1 — Chọn panel, liệt kê nguồn.** Ví dụ Order book Spot: REST `depth` (khởi tạo / sổ sâu chỉ hiển thị) + kênh `depth:S` (20 mức) +
`trades:S` (giá giữa) + `market:status` + `exchange:status` + `onStatus`.

**Bước 2 — Điền bảng trạng thái chuẩn** (dùng cho mọi panel; bỏ dòng không áp dụng):
| Trạng thái | Điều kiện kích hoạt (nguồn) | Panel hiển thị | Tương tác |
|---|---|---|---|
| LOADING | chưa có dữ liệu lần đầu cho **cặp hiện tại** (REST đang chờ / chưa có snapshot) | skeleton; xóa dữ liệu cặp cũ khi đổi cặp | form: khóa với lý do "đang tải", **không** gọi là "giá gián đoạn" |
| LIVE | có dữ liệu + `market:status` cặp = LIVE + client `open` | dữ liệu bình thường | theo `TradeBlock` |
| EMPTY | đã tải xong, thành công, danh sách rỗng | thông báo rỗng rõ ràng (ví dụ "Chưa có lệnh") | bình thường |
| ERROR | REST lỗi (`ApiError`) | thông báo lỗi + "Thử lại"; **không** hiện như EMPTY, **không** hiện 0 | thử lại |
| STALE | `market:status` cặp = STALE (hoặc payload `status` STALE) | giữ số cuối, làm mờ + nhãn "giá cũ" + thời điểm `lastUpdateAt` | form khóa (`PRICE_STALE`) — server cũng từ chối `MARKET_DATA_STALE` |
| UNAVAILABLE | status UNAVAILABLE / giá `null` | "—" / "Không có dữ liệu" | form khóa |
| DISCONNECTED | client `closed` | banner mất kết nối realtime; dữ liệu trên màn hình có thể cũ | **cần quyết định** (mục 10): REST đặt lệnh vẫn hoạt động |
| RECONNECTING | client `connecting` **sau khi** đã từng `open` (suy ra — PROPOSED) | banner "đang kết nối lại", không nhấp nháy tắt/bật | như DISCONNECTED |
| BLOCKED | `TradeBlock` ≠ null | `trade-block-reason` + nhãn `TRADE_BLOCK_LABELS` | nút đặt lệnh khóa, kể cả nút trong hộp xác nhận |
| PARTIAL | chỉ khi thật cần: ví dụ sổ sâu REST mới nhưng 20 mức realtime STALE | ưu tiên trạng thái xấu hơn | — |
Quy tắc ưu tiên khi nhiều điều kiện đúng: ERROR/UNAVAILABLE > STALE > DISCONNECTED/RECONNECTING > LOADING > EMPTY > LIVE cho **dữ liệu**;
cho **form**: HALTED > PAIR_DISABLED > PRICE_STALE > LOADING.

**Bước 3 — Đối chiếu hợp đồng.** Mỗi điều kiện ở cột 2 có tín hiệu thật không? Thiếu → ghi PROPOSED + yêu cầu hợp đồng/backend
(`cex-contract-first-api`). Ví dụ đã biết: STALE không được đẩy lại trên `tickers`/`ticker:S`/`depth:S`/`futures:mark:S` (RT-1 trong
`realtime-market-data-qa`) → UI phải lấy STALE từ `market:status`/`futures:status`, hoặc backend sửa hub.

**Bước 4 — Đối chiếu nhất quán giữa panel.** Cùng một cặp, cùng thời điểm: header, sổ lệnh, chart, form phải cùng trạng thái. Kiểm có
**một** nguồn suy ra trạng thái theo cặp (store) hay mỗi component tự đọc một tín hiệu khác nhau (tiền lệ: banner dùng `activeTradeBlock`, form tự kiểm `ticker.status`).
Futures phải dùng `futuresTradeBlock` + mark, không dùng trạng thái của cặp spot.

**Bước 5 — Đọc code UI (chỉ đọc)** theo bảng: mỗi ô trạng thái → file:dòng xử lý, hoặc "thiếu". Các chỗ hay sai: `catch {}` biến lỗi thành rỗng,
không reset khi đổi cặp, `|| '0'`, nhãn "realtime" cố định, badge ẩn trên mobile.

**Bước 6 — Test chuyển trạng thái.**
- Hàm thuần (Claude viết được): `packages/contracts/src/helpers.test.ts` — thêm ca cho `spotTradeBlock`/`futuresTradeBlock` (null ticker, STALE, UNAVAILABLE).
- Mock (Antigravity tự xem): `setMockScenario(...)`, `createMockRealtimeClient({ dropEveryMs: 15000 })` — lưu ý app hiện **không** dùng mock realtime (UNVERIFIED cho bản mới nhất, đọc lại `ui/apps/exchange/src/services/api.ts`).
- e2e (Claude viết trong `e2e/tests/`): dùng `data-testid`; ràng buộc hiện tại: fixture chặn **mọi** 5xx và lỗi console (`e2e/fixtures.ts`) → test trạng thái ERROR cần mở rộng fixture có chủ đích; sim feed **không bao giờ STALE** → chưa test STALE/UNAVAILABLE bằng e2e được (PROPOSED: công cụ test-only làm một cặp sim đứng giá — cần đề xuất).
- Mất kết nối trong e2e: Playwright `context.setOffline(true)` hoặc chặn route `/ws` — chỉ trên hệ e2e.

**Bước 7 — Bàn giao.** Viết yêu cầu cho Antigravity: bảng trạng thái của panel + nghiệm thu quan sát được + test id; ghi vào báo cáo rà soát
(`ui-branch-review`) hoặc PROMPT-xx; phần backend/hợp đồng ghi "Phụ trách: Claude Code" và dòng "Backend → UI" khi có.

## 6. Project-specific rules
| Quy tắc | Bằng chứng | Mức |
|---|---|---|
| Mọi màn hình có đủ: đang tải, trống, lỗi, mất kết nối, giá cũ | `ui/.agent/rules/project-rules.md` quy tắc 6; PROMPT-11 mục B5 | [DOC] |
| `null` → "—", không 0 | bất biến 6; README hợp đồng mục 4 | [LINT-WARN] (`|| 0`, `?? 0`) |
| STALE: hiện cảnh báo, nút đặt lệnh bị server từ chối | README hợp đồng mục 4; `orderService.ts:86-88` | [RUNTIME] phía server; UI [MANUAL] |
| Banner chặn lệnh theo `TradeBlock` | `TESTIDS.md:65`; `admin.spec.ts` (sàn dừng → banner hiện/ẩn) | [AUTO] một phần (không kiểm nút bị khóa) |
| `tradingHalted` → banner đỏ + khóa form | README hợp đồng mục 7 | [DOC] |
| Không chữ `NaN`/`undefined`/`Infinity` trên trang | `e2e/fixtures.ts` `expectCleanText` | [AUTO] trong test có gọi |

**Khoảng trống đã biết (UI `c2a7850`, đọc mã — UNVERIFIED khi chạy)**
| Mã | Panel | Vấn đề | Bằng chứng |
|---|---|---|---|
| US-1 | Header / form | Banner/form lấy STALE từ `ticker.status`; `market:status` được subscribe nhưng không dùng → kết hợp RT-1 có thể hiện giá cũ như LIVE | `ui/apps/exchange/src/context/MarketContext.tsx:151-153,179` |
| US-2 | Header | Một cờ `hideBanner` (nút ✕ của banner email) ẩn cả khối banner, gồm banner mất kết nối; banner mất kết nối chỉ hiện khi `closed` nên tắt mỗi lần `connecting` | `ui/apps/exchange/src/components/Header.tsx:26,349-365` |
| US-3 | Order book | Không reset khi đổi cặp; giá giữa giữ trade của cặp cũ; `Depth.status` không đọc; lỗi bị nuốt; rỗng không có thông báo | `ui/apps/exchange/src/components/trading/Orderbook.tsx:53,70,105,152,257` |
| US-4 | Trades | Lỗi thành danh sách rỗng; `status` bỏ qua; nhãn "Khớp lệnh realtime" cố định | `ui/apps/exchange/src/components/trading/MarketTrades.tsx:37-38,68` |
| US-5 | Chart | Badge: `closed` hiện "Stale", UNAVAILABLE hiện "LIVE", ẩn dưới `sm`, chart futures đọc ticker spot | `ui/apps/exchange/src/components/trading/CandlestickChart.tsx:1504-1520` |
| US-6 | Form | Không dùng chung `activeTradeBlock` → banner và form có thể khác nhau; số dư đang tải/lỗi hiện `0,00` | `ui/apps/exchange/src/components/trading/OrderForm.tsx:194-198,240,244,657-662` |
| US-7 | Futures | Banner chặn lệnh dùng cặp spot; nút Long/Short không bao giờ khóa; `futures:tickers` ghi đè danh sách bằng lô thay đổi | `ui/apps/exchange/src/pages/FuturesPage.tsx:89,274,694,1304,1314` |
| US-8 | Lệnh mở / Ví | Lỗi API hiện thành "không có lệnh" / "ví trống" | `ui/apps/exchange/src/components/trading/UserOrdersTabs.tsx:95,341`; `ui/apps/exchange/src/pages/WalletPage.tsx:109,456-457` |
| US-9 | Tất cả | Không tải lại phần không có snapshot (`user`, `trades`) khi `closed → open` | RT-2 |

## 7. Anti-patterns
- Hiện "Chưa có lệnh" khi request lỗi hoặc chưa xong.
- Dùng một cờ boolean `loading` chung cho nhiều cặp / không khóa theo cặp hiện tại.
- Lấy STALE chỉ từ payload cuối cùng của `ticker`; coi `open` của WebSocket là bằng chứng dữ liệu mới.
- Gọi trạng thái "đang tải" là "giá gián đoạn" (do `spotTradeBlock(null)` = PRICE_STALE) mà không phân biệt.
- Ẩn trạng thái quan trọng trên mobile (`hidden md:flex`).
- Viết số mặc định ("84.320,00", "10.000 USDT") khi chưa có dữ liệu.
- Sửa test e2e cho khớp UI sai; hoặc tự sửa component trong `ui/`.

## 8. Verification checklist
- [ ] Mỗi panel được xét có bảng trạng thái đủ dòng áp dụng, mỗi điều kiện gắn với tín hiệu hợp đồng thật hoặc ghi PROPOSED.
- [ ] Đã kiểm nhất quán header / sổ lệnh / chart / form cho cùng cặp (spot và futures riêng).
- [ ] Mỗi khoảng trống có file:dòng, phụ trách, nghiệm thu quan sát được, test id.
- [ ] Test mới đã chạy: `npx vitest run packages/contracts/src/helpers.test.ts` hoặc e2e qua `npm run ui-check -- --e2e` — ghi kết quả; chưa chạy thì ghi rõ.
- [ ] Không file nào trong `ui/` bị sửa (`git -C ui status --short` không đổi do mình).

## 9. Evidence and reporting format
```markdown
### US-x — <panel>: <trạng thái> sai/thiếu
- Điều kiện: <tín hiệu hợp đồng> · Hiện tại: <UI làm gì> (file:line) · Đúng: <hiển thị + tương tác theo bảng mục 5>
- Cần backend/hợp đồng? <không | có: …> · Phụ trách: Antigravity | Claude Code
- Nghiệm thu: <điều quan sát được> · Test: <e2e/tests/…spec.ts – data-testid> | <helpers.test.ts>
- Trạng thái: PROVEN | INFERRED | UNVERIFIED | PROPOSED
```

## 10. Escalation conditions
- **Quyết định sản phẩm**: khi client `closed` nhưng server vẫn LIVE, form đặt lệnh có khóa không? (REST vẫn chạy; dữ liệu trên màn hình có thể cũ.) Hỏi chủ dự án; đến khi có quyết định, ghi PROPOSED.
- Cần thêm tín hiệu hợp đồng (trạng thái reconnecting, `onClose`, đẩy STALE trên `tickers`, snapshot cho `user`) → qua `cex-contract-first-api`.
- Cần công cụ test-only để tạo STALE trong e2e (đổi server/sim) → đề xuất trước.
- Yêu cầu chỉnh thiết kế hình ảnh → chuyển chủ dự án/Antigravity.

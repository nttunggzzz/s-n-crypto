# Changelog — @cex/contracts

## Chưa phát hành — đợt AD3 (Back office: admin hủy lệnh, thu hồi phiên, điều chỉnh ví Futures)
Chỉ thêm. 4 endpoint mới. Không đổi số phiên bản (lead đánh số khi gộp). Hướng dẫn: README mục 18. Kế hoạch: `docs/plans/module-AD-admin-backoffice.md` mục 4.

**Thêm**
- Endpoint (cả bốn `auth: 'staff'`): `adminCancelUserOrder` POST `/api/v1/admin/users/:userId/orders/:orderId/cancel` và `adminCancelUserOrders` POST `/api/v1/admin/users/:userId/orders/cancel-all` (quyền mới `orders.manage`);
  `adminRevokeSession` POST `/api/v1/admin/users/:userId/sessions/:sessionId/revoke` và `adminRevokeAllSessions` POST `/api/v1/admin/users/:userId/sessions/revoke-all` (quyền `users.lock`).
- Quyền `orders.manage` (admin, owner). `AuditAction` thêm `ORDER_CANCEL`, `SESSION_REVOKE`.
- `admin.ts`: `AdminOrderMarket`, `UserOrderParam`, `UserSessionParam`, `AdminCancelOrderRequest/Result`, `AdminCancelOrdersRequest/Result`, `AdminRevokeSessionsResult`.
- `BalanceAdjustmentRequest.account` (`'SPOT' | 'FUTURES'`, mặc định `'SPOT'`: thân yêu cầu cũ vẫn hợp lệ). `FUTURES` chỉ nhận USDT (khác → `VALIDATION_ERROR`). Dòng audit `BALANCE_ADJUST` có thêm `account` trong `before/after`; `LedgerEntry.account` đã có sẵn.
- `closeReason` của lệnh bị admin hủy là `ADMIN` (đã có trong `CloseReason` và là chuỗi tự do ở Futures) — không thêm giá trị enum.
- Fixture `fixtures/adminActions.ts`, resolver mock `mocks/adminActions.ts` (cho cả bốn endpoint; mock `adminAdjustBalance` hiểu `account`), test `mocks/mocks-admin-actions.test.ts`.

**Hành vi (server)**
- Audit `ORDER_CANCEL` / `SESSION_REVOKE` nằm **trong cùng transaction** với việc hủy / thu hồi. Hủy lệnh bot lưới: bot chuyển STOPPED (`stopReason: 'ADMIN'`) trong cùng transaction với lệnh hủy.
- `adminCancelUserOrders` không có `market` → hủy Spot rồi Futures, mỗi sàn một transaction + một dòng audit.
- Thu hồi phiên đóng `/ws` của phiên đó ngay (mã 4401), không đợi nhịp kiểm 30 giây.

**Có thể ảnh hưởng UI:** `Permission` có thêm `orders.manage` (`Record<Permission, …>` phải bổ sung); `AuditAction` có thêm hai giá trị (nơi dùng `Record<AuditAction, …>` cần nhãn).

## 0.20.0 — 2026-10-17 (Hồ sơ: khối lượng giao dịch và thuế đã khấu trừ trong tháng — người dùng và admin)
Chỉ thêm một endpoint (tổng 154) và một trường bắt buộc trong phản hồi. Hướng dẫn: README mục 17.

**Thêm**
- `accountStats.ts` (file mới): `VolumeBucket` (`spot`, `futures`, `total`, `fills`), `TradingVolume` (`today`, `last7d`, `last30d`, `thisMonth`, `previousMonth`, `excludedNonUsdtFills`), `MonthTax` (`month` dạng `YYYY-MM`, `withheldCount`, `withheldAmount`), `AccountTradingStats` (`asOf`, `volume`, `tax: { taxMode, category, thisMonth, previousMonth }`).
- Endpoint `accountTradingStats` GET `/api/v1/account/stats` (`auth: 'user'`): số của chính người gọi, không nhận tham số.
- `AdminUserDetail.trading` (`AccountTradingStats`): cùng phép tính cho người dùng đang xem; quyền vẫn là `users.read` của `adminGetUser`. Trường `tax` của 0.18.0 giữ nguyên.
- Fixture `fixtureAccountTradingStats`, `fixtureEmptyTradingStats()`; `fixtureAdminUserDetail` có `trading`. Resolver mock `accountTradingStats` tính từ kho mock (lệnh Spot + Futures của người dùng demo, bản ghi thuế): người dùng không có lệnh khớp thì toàn số 0.

**Nghĩa của các con số (server tính, giao diện chỉ hiện)**
- Khối lượng = tổng `quoteQty` của các lần khớp **của chính người dùng** (kể cả lệnh do bot của người dùng đặt), cả MUA và BÁN, tính bằng USDT. Chỉ cộng cặp Spot quote USDT; lần khớp Spot của cặp quote khác (hoặc cặp sàn không còn niêm yết) trong 30 ngày gần nhất đếm vào `excludedNonUsdtFills`, **không** đổi bằng tỷ giá đoán. Futures (USDT-margined) cộng `quoteQty` của mọi lần khớp, cả mở và đóng.
- Ngày và tháng theo giờ Việt Nam (GMT+7): `today` từ 00:00 hôm nay; `last7d` = hôm nay + 6 ngày trước; `last30d` = hôm nay + 29 ngày trước; `thisMonth` từ 00:00 ngày 1; `previousMonth` = cả tháng dương lịch trước (từ 00:00 ngày 1 tháng trước đến trước 00:00 ngày 1 tháng này). Một lần khớp nằm trong mọi cửa sổ chứa nó.
- Thuế = thuế **đã khấu trừ** (đã trừ vào tiền bán ngay lúc khớp), **không** phải số còn phải nộp. `DOMESTIC_ORG` tự kê khai nên luôn 0; khi `taxMode = 'OFF'` các lần khớp mới không bị trích nhưng tháng có bản ghi cũ vẫn hiện số cũ.

**Có thể ảnh hưởng UI:** `AdminUserDetail.trading` là bắt buộc — ai tự dựng một `AdminUserDetail` (ngoài mock/fixture) phải thêm trường này.

## 0.19.0 — 2026-10-17 (Admin không cần 2FA trên server dev)
Chỉ thêm trường; không thêm endpoint.

**Thêm**
- `PublicConfig.staffTwoFactorRequired` (boolean). Server đặt bằng `STAFF_REQUIRE_2FA` (mặc định `true`). `false` = endpoint staff chỉ kiểm vai trò + quyền, không cần 2FA. Chỉ dùng ở dev (`npm run dev` bật mặc định cho tới khi làm lại phần bảo mật); production từ chối khởi động với `false`.
- App admin: thay kiểm tra `window.location.hostname === 'localhost'` bằng `publicConfig().staffTwoFactorRequired`.

## 0.18.0 — 2026-10-15 (Thuế — hiện thuế trong phân tích lãi lỗ và trong chi tiết người dùng của admin)
Chỉ thêm trường; không thêm endpoint (vẫn 153). Hướng dẫn: README mục 15.

**Thêm**
- `PnlAnalysis.spotTax` (P-03): tổng thuế đã trích trên chính các lần bán Spot nằm trong `spotRealized` (số dương, `"0.00000000"` khi thuế tắt). `spotRealized` đã trừ phí **và** thuế, nên `spotRealized + spotTax` = kết quả trước thuế. Chú thích "net of fees" sửa thành "net of fees and tax".
- `AdminUserDetail.tax` (`AdminUserTax`, P-04 / M-16): `category` (mặc định `INDIVIDUAL`), `categoryUpdatedAt` (null = chưa chọn), `withheldCount`, `withheldTotal` (USDT, cộng mọi lần). Cùng quyền `users.read` của `adminGetUser`; danh sách bản ghi vẫn là `adminTaxWithholdings`.

**Ảnh hưởng UI:** hai trường mới là bắt buộc trong phản hồi (server luôn trả); mã dựng tay một `PnlAnalysis` / `AdminUserDetail` (hiếm, ngoài mock/fixture) cần thêm chúng.

## 0.17.0 — 2026-10-14 (Module N — đợt N1: tin tức và sự kiện vĩ mô cho hệ phân tích)
Chỉ thêm. 3 endpoint Admin mới, tổng 153. Không có endpoint cho người dùng thường (C-D1). Hướng dẫn: README mục 16.
Trạng thái server: chưa có route cho `adminNewsItems`, `adminNewsSources`, `adminNewsMacroEvents` (đợt N2).

**Thêm**
- `analysis.ts`:
  - `NewsEventType` (10 giá trị, có `OTHER`), `NewsSourceKind`, `SnapshotNewsItem`, `SnapshotNewsSource`, `SnapshotNews`, `MacroEventCode`, `MacroEventImportance`, `SnapshotMacroEvent`, `NewsImpact`, `AnalysisNewsTilt`, `AnalysisNewsContext`.
  - `SnapshotNewsItem`: `firstSeenAt` bắt buộc; `publishedAt` và `tone` nullable; `url` chỉ http/https, tối đa 2048 ký tự; `eventTypes` ít nhất 1 giá trị (bộ phân loại trả `OTHER` khi không chắc).
  - `SnapshotNews.sources[]`: độ tươi từng nguồn đang BẬT tại `asOf` (tên, loại, `status`, `lastSuccessAt`). `sourcesTotal` = `sources.length`, `sourcesLive` = số nguồn LIVE (có kiểm); nguồn lịch tĩnh được tính, nguồn tắt thì không.
  - `SnapshotMacroEvent.actual`: chỉ có giá trị khi `actualKnownAt` ≤ `asOf`; người dựng snapshot bỏ giá trị chưa biết. Nghĩa và đơn vị chốt khi có FRED (N-D3); v0 luôn null.
  - `AnalysisNewsContext`: `itemsUsed` là tin đầy đủ (`SnapshotNewsItem`); `tilt` nullable (null khi `status` là UNAVAILABLE). `tilt` chỉ phân loại tin CÓ tone theo ngưỡng của `classifierVersion`; tin `tone: null` vào `unscored`, không bao giờ vào neutral; positive + negative + neutral + unscored = `itemsUsed.length` (có kiểm); `validated` chỉ nhận `false`. `impact` dùng enum `NewsImpact`: ít nhất 1 giá trị, không trùng, `CONTEXT_ONLY` và `UNAVAILABLE` đứng một mình.
- `CryptoMarketSnapshot.news`, `.macroEvents` và `CryptoMarketAnalysisReport.newsContext`: `.nullable().optional()` để snapshot/báo cáo đã lưu và mã dựng hiện có vẫn hợp lệ. `null` hoặc vắng = chưa có lớp tin tức (không phải "không có tin").
- `AnalysisDepartmentId` thêm `news_event_risk`. `SnapshotHeadline` giữ nguyên, ghi chú cũ (`@deprecated`).
- `news.ts`: `NewsSourceHealth` (`medianLagMs` là số nguyên ms, **cho phép âm**: nguồn ghi giờ đăng ở tương lai so với đồng hồ của mình, không kẹp về 0; null khi chưa đo được), `NewsItemAdmin` (thêm `sourceId`, `sourceKind`, `ingestedRunId`), `AdminNewsItemsQuery`, `AdminNewsSources`, `AdminNewsMacroEventsQuery`, `AdminNewsMacroEvents`, hằng `NEWS_MACRO_EVENTS_MAX_DAYS` (400).
- Endpoint (cả ba `auth: 'staff'`, quyền mới `news.view`):
  - `adminNewsItems` GET `/api/v1/admin/news/items`: lọc `symbol`/`eventType`/`sourceId`/`from`/`to` (theo `firstSeenAt`); thứ tự `(firstSeenAt DESC, id DESC)`; cursor mờ (base64url của `firstSeenAt|id`, trang sau = mọi tin đứng trước nó); cursor hỏng → 400 `VALIDATION_ERROR`; `from` > `to` → 400 `VALIDATION_ERROR`. Lọc `symbol` không trả tin vĩ mô chung (`symbols: []`).
  - `adminNewsSources` GET `/api/v1/admin/news/sources`: sức khỏe từng nguồn, kể cả nguồn tắt.
  - `adminNewsMacroEvents` GET `/api/v1/admin/news/macro-events`: lọc `code`/`importance`/`from`/`to` theo `scheduledAt`, sắp tăng dần, khoảng ≤ 400 ngày (quá → `VALIDATION_ERROR`; thiếu một đầu thì lấy 400 ngày từ đầu có sẵn; không có đầu nào thì 400 ngày từ lúc gọi).
- `news.view` gán cho support, admin, owner: chỉ đọc, không chứa dữ liệu cá nhân của người dùng.
- Fixture `fixtures/news.ts` (theo kết quả N0: tin GDELT `publishedAt: null`, nguồn GDELT `medianLagMs: null`, nguồn lịch tĩnh LIVE; 3 tin cùng `firstSeenAt`), resolver mock `mocks/news.ts` (cùng luật quyền, cursor và kiểm tra đầu vào như server), test `mocks/mocks-news.test.ts`.

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `AnalysisDepartmentId` có thêm giá trị `news_event_risk`: nơi nào dùng `Record<AnalysisDepartmentId, …>` hoặc `switch` đầy đủ sẽ báo lỗi typecheck và cần bổ sung nhãn.
- `Permission` có thêm `news.view`: `Record<Permission, …>` phải bổ sung. `me.permissions` của support/admin/owner có thêm `news.view`.

## 0.16.0 — 2026-10-14 (Thuế — đợt T3F: cài đặt thuế đi qua `exchange:status`)
Chỉ thêm trường; không thêm endpoint (vẫn 150). Hướng dẫn: README mục 15.

**Thêm**
- `ExchangeStatus.taxMode`, `taxRate`, `taxVndRate` (nullable) — cùng giá trị với `exchangeInfo.taxMode/taxRate/taxVndRate`. Kênh realtime `exchange:status`
  nay còn được đẩy khi admin đổi `taxMode`, `taxRate` hoặc `taxVndRate` (`adminUpdateTaxSettings`), nên form BÁN đang mở cập nhật thuế tạm tính ngay,
  không cần tải lại `exchangeInfo`. Không đẩy khi chỉ `taxVndRateUpdatedAt` đổi (trường đó không nằm trong `ExchangeStatus`; đọc ở `exchangeInfo`).
- Fixture `fixtureExchangeStatus`. Mock: `exchange:status` của realtime mock mang 3 trường thuế và được gửi khi `setMockTax()` hoặc
  `adminUpdateTaxSettings` (mock) đổi chúng (kiểm tra theo nhịp của mock realtime, mặc định 1 giây).

**Có thể ảnh hưởng UI**
- Ai tự dựng đối tượng `ExchangeStatus` (test, story) phải thêm 3 trường mới (typecheck sẽ báo).
- Server: `adminUpdateTaxSettings` từ chối bật `taxMode = 'WITHHOLD'` (400 `VALIDATION_ERROR`, field `taxMode`) khi đang bật cặp có quote khác USDT
  (báo cáo thuế cộng số của một đồng quote). Giao diện admin nên hiện lỗi này ở ô `taxMode`. Chiều ngược lại: khi thuế đang `WITHHOLD`, `adminUpdateSymbol` bật cặp quote khác USDT bị 400 `VALIDATION_ERROR` (field `enabled`).

## 0.15.0 — 2026-10-14 (Thuế crypto Việt Nam, thử nghiệm — Module T, đợt T1)
Chỉ thêm. 10 endpoint mới, tổng 150. Hướng dẫn: README mục 15.
Trạng thái server (cập nhật sau T3): đã có route cho cả 10 endpoint. 4 endpoint cài đặt/hồ sơ (`taxProfile`, `taxUpdateProfile`, `adminTaxSettings`,
`adminUpdateTaxSettings`) từ đợt T2; 6 endpoint báo cáo (`taxSummary`, `taxWithholdings`, `taxExport`, `adminTaxSummary`, `adminTaxWithholdings`,
`adminTaxExport`) từ đợt T3. Server đã trả `Trade.tax` và 4 trường thuế của `exchangeInfo` (T2).
Luật (module T §0, §3.2): chỉ lần khớp **BÁN Spot** bị trích khi `taxMode = 'WITHHOLD'` và người bán không phải `DOMESTIC_ORG`;
thuế = roundUp 8 chữ số của (quoteQty × taxRate) trên giá trị gộp, từng lần khớp, lãi hay lỗ đều trích. Mua, Futures, chuyển ví, faucet,
admin cộng/trừ, đặt lại tài khoản: không trích.

**Thêm**
- `tax.ts`: enum `TaxMode` (`OFF | WITHHOLD`), `TaxCategory` (`INDIVIDUAL | FOREIGN_ORG | DOMESTIC_ORG`, tự khai, **không** có trường giấy tờ);
  hằng `TAX_LIMITS` (tỷ lệ tối đa 0.01, mặc định 0.001, CSV ≤ 10.000 dòng); `VndAmount` (đồng, số nguyên); `TaxRateInput`, `VndRateInput`;
  schema `TaxSettings`, `UpdateTaxSettingsRequest`, `TaxProfile`, `UpdateTaxProfileRequest` (strict: chỉ `category`), `TaxWithholding`,
  `AdminTaxWithholding` (+ `userId`), `TaxWithholdingQuery`/`ListQuery`, `AdminTaxWithholdingQuery`/`ListQuery`, `TaxTotals`, `TaxSales`,
  `TaxMonth`, `TaxSummaryQuery`, `TaxSummary`, `TaxPeriod` (`YYYY-MM` | `YYYY-Qn`), `AdminTaxSummaryQuery`, `AdminTaxSummary`;
  cột CSV `TAX_EXPORT_COLUMNS`, `ADMIN_TAX_EXPORT_COLUMNS` (server và mock dùng chung).
- Endpoint người dùng (`auth: user`): `taxProfile`, `taxUpdateProfile` (PUT), `taxSummary`, `taxWithholdings` (phân trang), `taxExport` (CSV).
- Endpoint admin (`auth: staff`): `adminTaxSettings`, `adminTaxSummary`, `adminTaxWithholdings`, `adminTaxExport` (quyền `tax.read`);
  `adminUpdateTaxSettings` (PATCH, quyền `tax.manage`, ghi audit `TAX_SETTINGS_UPDATE`).
- Quyền `tax.read` (support, admin, owner — như `reconciliation.read`) và `tax.manage` (admin, owner — như `exchange.configure`).
- `Trade.tax: DecimalString` (luôn có, `"0.00000000"` khi không trích; tiền nhận về của lệnh bán = quoteQty − fee − tax).
- `ExchangeInfo.taxMode`, `taxRate`, `taxVndRate` (nullable), `taxVndRateUpdatedAt` (nullable) — cho form bán ước tính thuế.
- `LedgerEntryType` thêm `TAX_WITHHOLDING`; `AuditAction` thêm `TAX_SETTINGS_UPDATE`.
- (T2) `ReconciliationMismatch.kind` thêm `TAX_LEDGER_VS_WITHHOLDINGS` (−Σ sổ cái `TAX_WITHHOLDING` ≠ Σ bản ghi khấu trừ) và
  `TAX_TRADES_VS_WITHHOLDINGS` (Σ `Trade.tax` của lệnh bán ≠ Σ bản ghi), theo (người dùng, tài sản quote), `field: 'available'`.
  Màn đối soát admin nên có nhãn cho hai loại này.
- `JournalFill.tax`, `JournalFill.allocatedTax` (chia như `allocatedFee`: cả lần khớp → `tax`, một phần → roundUp8(tax × allocatedQty / quantity)).
- `exportUrl()` nhận thêm `'taxExport' | 'adminTaxExport'`.
- Mock: bắt đầu `WITHHOLD` 0.1%, tỷ giá 26350 (server thật bắt đầu `OFF`); lần khớp trong mock tính `quoteQty`, phí, thuế và `realizedPnl` bằng `@cex/core`
  đúng hướng làm tròn của server (giá vốn trung bình như `positions.ts`, khởi tạo từ fixture danh mục); có bản ghi khấu trừ cho mỗi lần bán bị trích;
  báo cáo, danh sách, CSV đọc cùng một nguồn. 2 lần bán cũ của người dùng demo (fixture `fixtureTaxedTrades`) + 2 bản ghi của người dùng khác.
  Hàm dev `setMockTax({ taxMode, taxRate, taxVndRate, category })`. Test `mocks/mocks-tax.test.ts` (12 ca).

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `realizedPnl` của `Trade` nay là sau phí **và** thuế (khi thuế tắt thì như cũ).
- Bảng nhãn loại dòng sổ cái nên thêm `TAX_WITHHOLDING`; bộ lọc nhật ký admin nên thêm `TAX_SETTINGS_UPDATE`; vai trò support có thêm quyền `tax.read`
  (`me.permissions`).
- Mock: phí lần khớp nay làm tròn lên 8 chữ số theo `feeRate` hiện hành (trước là float × 0.001); `realizedPnl` của lệnh bán trong mock là số thật
  theo giá vốn (trước là số giả 1% giá trị); `exchangeInfo.feeRate` của mock theo cấu hình admin; CSV `exportTrades` có thêm cột `tax` sau `feeAsset`;
  `myTrades` của mock có thêm 2 lệnh bán cũ (381, 382).
- (Đã xử lý ở T2) Server trả `Trade.tax` và 4 trường thuế của `exchangeInfo`; hợp đồng và T2 đã gộp cùng nhau vào `main`.

## 0.14.0 — 2026-10-14 (Nhật ký giao dịch — Module A, đợt A1)
Chỉ thêm. 12 endpoint mới, tổng 140. Server chưa có route cho chúng (A2–A4); giao diện làm trên mock ngay từ bản này. Hướng dẫn: README mục 14.

**Thêm**
- `stats.ts` (dùng chung với Module C): `StatsBasis` (`ACTUAL_FILLS | MODELED_CANDLES | BOT_FILLS`), `TradeOutcome`, `RSummary`, `RCurvePoint`, `PnlCurvePoint`.
  Tên trường giống hệt `summarizeR` của `@cex/core` (`countWithR`, `totalNetPnl`, `rCurve`, `pnlCurve`…); mọi thống kê có `rMetricsVersion`.
- `journal.ts`: enum `JournalMarket`, `JournalDirection`, `JournalStatus` (OPEN/CLOSED/VOID), `JournalOrigin`, `JournalMistake`, `JournalOutcome`,
  `JournalStatsRange`, `JournalFillSkipReason`, `JournalFillLeg` (SPOT/OPEN/CLOSE), `JournalCloseReason`, `JournalReconcileIssueType`, `JournalImageType`,
  `JournalConflictReason`; hằng `JOURNAL_LIMITS`; schema `JournalPlan`, `JournalResult` (= kết quả `computeEntryResult` / `futuresEntryResult`, có `rMetricsVersion`),
  `JournalFill`, `JournalEntry` (có `status`, `closeReason`, `needsReview`, `adjustedAt`, `adjustmentReason`), `JournalEntryDetail`, `JournalCreateRequest`,
  `JournalUpdateRequest` (`addOrderIds`), `JournalListQuery`, `JournalStatsQuery`, `JournalStats` (`basis`, `rMetricsVersion`, `excluded: { void, needsReview }`,
  nhóm theo setup / symbol / market / direction / weekday / mistake), `JournalSetupList`, `JournalSettings`, `JournalUpdateSettingsRequest`,
  `JournalAttachment`, `JournalAttachmentUpload`.
- Endpoint: `journalList`, `journalGet`, `journalCreate` (201), `journalUpdate`, `journalDelete`, `journalSetups`, `journalStats`, `journalSettings`,
  `journalUpdateSettings`, `journalUploadAttachment` (201), `journalAttachment` (ảnh nhị phân), `journalDeleteAttachment`.
- Bật/tắt tự ghi nhật ký ở `journalSettings` / `journalUpdateSettings` (chỉ nhận `{ autoJournal }`, gửi kèm mốc thời gian → 400). **Không** thêm gì vào `Preferences`.
- Mã lỗi `PAYLOAD_TOO_LARGE` (413, `details.reason`: `PayloadTooLargeReason`) và `UNSUPPORTED_MEDIA_TYPE` (415).
  `CONFLICT` của nhật ký có `details.reason` (`JournalConflictReason`), thứ tự kiểm ghi trong `journal.ts`.
- Khung hợp đồng: `format: 'binary'` + `BinaryFile`; kiểu `BinaryEndpointName`, `ClientEndpointName`; client có `journalAttachmentUrl(id)`.
- Server (`lib/http.ts`): endpoint `format: 'binary'` gửi bytes kèm `Content-Type` (không kiểm schema phản hồi; vẫn kiểm đăng nhập và tham số);
  body JSON vượt giới hạn → 413 `PAYLOAD_TOO_LARGE` (`BODY_TOO_LARGE`, `limitBytes`) thay cho 500, có ghi log cảnh báo (đường dẫn, IP).
  Test `server/src/lib/http.binary.test.ts` (route giả, không cần DB).
- Mock: 11 mục mẫu tính tay (test so khớp từng số với `@cex/core`); mọi phân bổ, kết quả, thống kê gọi `allocateSpotFill`, `replayAllocations`,
  `allocateFuturesLegs`, `computeEntryResult`, `futuresEntryResult`, `computeJournalStats` của `@cex/core` (`@cex/contracts` thêm phụ thuộc `@cex/core`).
  Luật tự ghi giống server (module A §2.1, §2.2, §2.4):
  - lần khớp được ghi khi nằm trong cửa sổ tự ghi **hoặc** cặp/vị thế đang có mục AUTO mở — tắt tự ghi chỉ dừng việc mở mục mới;
  - mục AUTO Futures chỉ mở bởi lần khớp mở vị thế (trong cửa sổ); vị thế mở lúc tắt thì các chân về sau ghi "không thuộc mục nào";
  - mục MANUAL lấy được lần khớp trống và lần khớp "không thuộc mục nào"; mục MANUAL Futures nhận các chân về sau của chính vị thế;
    `addOrderIds` với lệnh đã có trong mục chỉ thêm phần mới khớp;
  - dừng lỗ ban đầu tự lấy từ SL của lệnh mở (Futures: lệnh mở vị thế, không phải SL hiện tại), bỏ qua nếu SL sai phía;
  - lệnh bot lưới/DCA không bao giờ vào nhật ký;
  - ảnh thật (kiểm chữ ký file, 1 MB, 4 ảnh/mục, hạn mức 50 MB); sha256 có bản JS dự phòng khi trang không có `crypto.subtle` (http không an toàn).

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `format: 'binary'`: `ApiClient` **không** có hàm cho endpoint nhị phân (`api.journalAttachment` không tồn tại; dùng `journalAttachmentUrl`).
  Code duyệt mọi `EndpointName` để gọi client nên dùng `ClientEndpointName`.
- `ErrorCode` có thêm 2 mã: bảng dịch `Record<ErrorCode, string>` của app phải thêm câu cho `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`.
- Gửi body JSON quá lớn (> 32 KB) trước đây nhận 500 `INTERNAL_ERROR`, nay nhận 413 `PAYLOAD_TOO_LARGE`.

## 0.13.0 — 2026-10-13 (Kiểu dữ liệu hệ phân tích)
**Thêm: kiểu dữ liệu hệ phân tích (chỉ export, chưa có endpoint).** Không thêm, không đổi endpoint (vẫn 128). UI không cần làm gì.
- File mới `src/analysis.ts` (export từ `index.ts`): `CryptoMarketSnapshot`, `DepartmentFinding`, `EvidenceItem`, `RiskFlag`,
  `BullBearDebateResult`, `RiskExecutionReview`, `PositionSizingLadderOutput`, `InvalidationCondition`, `AdvisoryTradeProposal`
  (`advisoryOnly: true`, `liveExecutionEnabled: false`), `CryptoMarketAnalysisReport`, `WalkForwardFoldMetrics`, `BacktestEvaluationSummary`.
  Dùng nội bộ cho engine tín hiệu (Module C); C1 sẽ nhúng `CryptoMarketAnalysisReport` vào hợp đồng Admin.
- Chuẩn hóa so với bản chép `be/analysis` (bản đó chưa từng phát hành):
  - `audit.PriorLessonsUsed` → `audit.priorLessonsUsed`;
  - `SnapshotDerivativesState.nextFundingTime`: `EpochMs` → `IsoDateTime` (cùng kiểu `FuturesMarkPrice.nextFundingTime`);
  - `SnapshotDerivativesState.maxLeverage` / `maintenanceMarginRate` / `takerFeeRate` → `nullable` (không còn mặc định đoán 20 / 0.0050 / 0.0004);
  - `SnapshotPortfolioContext.equityUsdt` / `availableUsdt` / `currentDrawdownPct` / `dailyLossPct` / `weeklyLossPct` / `consecutiveLosses`
    → `nullable` (`NOT_PROVIDED` không còn ghi số 0);
  - `BacktestEvaluationSummary.sharpeRatio` / `sortinoRatio` / `calmarRatio` / `deflatedSharpeRatio` / `probabilityOfBacktestOverfitting` /
    `winRatePct` / `profitFactor` / `walkForwardEfficiencyRatio` và `WalkForwardFoldMetrics.inSampleSharpe` / `outOfSampleSharpe` → `nullable`
    (không xác định được thì `null`, không còn số giữ chỗ 0 / 0.5 / 9.99).
  - `CryptoMarketSnapshot.spot.orderBookSynthetic: boolean` (mới): `true` chỉ khi backtest dựng sổ lệnh từ spread/khối lượng của nến;
    bằng chứng lấy từ sổ lệnh đó là `INFERRED`, không phải `OBSERVED`.
  - `CircuitBreakerStatusSchema` thêm `NOT_APPLICABLE`: danh mục `NOT_PROVIDED` thì các cầu dao danh mục "không áp dụng" (trước đây ghi `NORMAL`).
  - Chú thích: `deflatedSharpeRatio` chỉ hiệu chỉnh nhiều lần thử (coi lợi nhuận là phân phối chuẩn);
    `probabilityOfBacktestOverfitting` là phép sàng lọc 4 khúc, không phải CSCV đầy đủ; `verdict = PASS_RESEARCH_GATE` **không phải** cổng M3.
- Nguồn: chuyển thể từ TauricResearch/TradingAgents v0.6.0 (Apache-2.0), xem `THIRD_PARTY_NOTICES.md` ở gốc repo.

## 0.12.0 — 2026-10-12 (Realtime `onClose`, `publicConfig.emailDelivery`)
Chỉ thêm, không đổi endpoint (vẫn 128). Hai việc UI đã xin ở `docs/parts/contract-requests.md` (R-16, N-13).
- **`RealtimeClient.onClose(cb)`** → hàm hủy đăng ký. `cb({ code, reason })` được gọi mỗi lần kết nối đóng (mạng rớt, server khởi động lại,
  server chủ động đóng). Client vẫn tự nối lại như trước.
  - `code === WS_SESSION_ENDED` (**4401**, hằng số mới export từ contracts) = phiên đăng nhập của kết nối đã hết (đăng xuất ở nơi khác,
    bị thu hồi, hết hạn, tài khoản bị khóa). Kết nối mới sẽ không còn phiên → app gọi `me`, nếu 401 thì hiện trạng thái đã đăng xuất.
  - **Không** gọi cho kết nối bị `reconnect()` thay thế, và không gọi sau `close()`.
  - Kiểu mới `RealtimeCloseInfo`. Mock `createMockRealtimeClient` gọi `onClose({ code: 1006 })` khi mô phỏng rớt mạng (`dropEveryMs`).
- **`publicConfig.emailDelivery`: `'sent' | 'log'`.** `'sent'` = server gửi email thật (`EMAIL_TRANSPORT=resend`); `'log'` = email chỉ ghi vào log
  hoặc hộp thư thử (dev, e2e, sàn kín chưa có tên miền gửi mail). Khi `'log'`, **đừng** báo "đã gửi email" — nói "máy chủ này chưa gửi email thật".
  Trường bắt buộc trong response (mọi server đã trả nó); mock trả `'log'`.
- **Thay đổi nhỏ có thể ảnh hưởng UI:** code tự cài đặt interface `RealtimeClient` (ngoài `createRealtimeClient` / mock) phải thêm `onClose`.
  `AuthContext` của app sàn đã dò `onClose` bằng `typeof === 'function'` nên chạy được ngay; có thể bỏ ép kiểu.
- Server (không đổi hợp đồng): Content-Security-Policy cho phép script / iframe / kết nối của Cloudflare Turnstile **chỉ khi** có `TURNSTILE_SITE_KEY` (R-04).

## 0.11.0 — 2026-10-10 (Web admin nối với web sàn)
Chỉ thêm, không đổi endpoint (vẫn 128). Hai web là **một sản phẩm trên một địa chỉ**: server phục vụ app sàn ở `/` và app admin ở `/admin/`
(cùng cookie đăng nhập, cùng `/ws`). Hướng dẫn đầy đủ: `docs/antigravity/PROMPT-08-web-admin-noi-web-san.md`.
- `ADMIN_BASE_PATH = '/admin'` — `apps/admin` build với Vite `base: '/admin/'`.
- `appLinks.exchange.*` (home, markets, trade, futures, register) và `appLinks.admin.*` (home, user, symbols, auditLogs):
  link giữa hai app lấy từ đây, không tự viết. Tham số `origin` tùy chọn: dev truyền `import.meta.env.VITE_EXCHANGE_ORIGIN` /
  `VITE_ADMIN_ORIGIN` (`npm run dev` đặt sẵn :5173 / :5174); bản deploy để trống (cùng địa chỉ).
- `canOpenAdmin(me)` — hiện nút "Quản trị" trên app sàn cho support / admin / owner (chỉ để ẩn/hiện; API admin vẫn tự kiểm tra quyền + 2FA).

## 0.10.0 — 2026-10-10 (Chạy kín: đăng ký bằng mã mời, cấu hình công khai)
Chuẩn bị đưa staging lên cloud: chỉ người được mời mới đăng ký được. Thêm 4 endpoint, tổng 128.

**Thêm**
- `publicConfig` (`GET /api/v1/config`, công khai) → `{ registration: 'OPEN' | 'INVITE_ONLY', captchaSiteKey, emailVerificationRequired, marketFeed }`.
  App đọc **một lần lúc khởi động** để:
  - hiện ô mã mời khi `INVITE_ONLY`;
  - hiện widget Cloudflare Turnstile khi có `captchaSiteKey`;
  - hiện banner "GIÁ GIẢ LẬP" khi `marketFeed === 'sim'`.
- `RegisterRequest.inviteCode` (tùy chọn; bắt buộc khi `INVITE_ONLY`). Trang đăng ký đọc `?invite=` trên URL để điền sẵn.
  Mã nhập không phân biệt hoa thường, khoảng trắng hay dấu gạch.
- Mã lỗi `INVALID_INVITE` (400), `details.reason`: `MISSING` | `UNKNOWN` | `EXPIRED` | `USED_UP` | `REVOKED`; `details.field = 'inviteCode'`.
- Admin (quyền mới `users.invite` — admin, owner):
  - `adminListInvites` (lọc `status`, phân trang);
  - `adminCreateInvite` (`note`, `maxUses` 1–100, `expiresInDays` 1–90) → `{ invite, code, link }`. **Mã chỉ hiện một lần**; server chỉ lưu bản băm.
  - `adminRevokeInvite` (`reason`).
- `AuditAction` thêm `INVITE_CREATE`, `INVITE_REVOKE`; `AuditTargetType` thêm `INVITE`.
- **Mock:** mặc định `OPEN`. `setMockRegistration('INVITE_ONLY', 'sim')` để xem trang đăng ký của server kín và banner giá giả lập; mã demo `DEMO-MOCK-2026`.

## 0.9.0 — 2026-10-10 (Hàm tiện ích cho giao diện)
Chỉ thêm. Các hàm không phụ thuộc React, có test, cho những chỗ REVIEW-03 thấy giao diện tự viết và dễ sai.
Hàm nào giữ trạng thái thì có `subscribe` + hàm đọc, dùng thẳng với `useSyncExternalStore`.
- `createTickerStore(rt, 'spot' | 'futures')`: một kênh `tickers` / `futures:tickers` cho cả app; `get(symbol)`, `all()`, `subscribe(cb, symbol?)`, `seed(restItems)`.
- `resolveFuturesSymbol(requested, contracts, spotPairs)` (PEPEUSDT → 1000PEPEUSDT), `spotSymbolFor(contract, …)`.
- `countdown(nextFundingTime)` → `"HH:MM:SS"` | `null`.
- `spotTradeBlock(symbol, exchangeStatus, ticker)`, `futuresTradeBlock(status, contract, mark)` → `'HALTED' | 'PAIR_DISABLED' | 'PRICE_STALE' | null`, nhãn `TRADE_BLOCK_LABELS`.
- `createPager(fetchPage)`: "Xem thêm" theo `nextCursor` (chặn bấm 2 lần, `reset()` khi đổi bộ lọc).
- `saveTextFile(text, filename)`: tải CSV từ `exportLedger` / `exportOrders` / `exportTrades`.

## 0.8.0 — 2026-10-10 (Realtime: một kênh cho giá mọi cặp)
Sửa lỗi tích hợp tìm thấy khi đối chiếu giao diện ([REVIEW-03](../../docs/antigravity/REVIEW-03-doi-chieu-giao-dien-tinh-nang.md)):
giao diện đăng ký 50 kênh `ticker:<SYMBOL>` cộng các kênh khác, vượt giới hạn 50 kênh mỗi kết nối, nên server từ chối 4–5 kênh và giá các cặp đó đứng im.

**Thêm (chỉ thêm, không phá code đang chạy)**
- Kênh `tickers` → `TickerBatch { items: Ticker[] }`: khi đăng ký nhận **giá mọi cặp**, sau đó tối đa 1 lần/giây chỉ các cặp vừa đổi.
  Dùng cho danh sách thị trường, thanh tìm kiếm, header — thay cho 50 kênh `ticker:<SYMBOL>`.
- Kênh `futures:tickers` → `FuturesTickerBatch` (mọi hợp đồng; cũng gửi khi mark/funding đổi).
- `REALTIME_MAX_CHANNELS = 100` (trước là 50, không công bố): vượt → sự kiện `error` mã `RATE_LIMITED` kèm `channel`, kênh đó **không** được đăng ký.
  Đăng ký lại kênh đang có không bị tính thêm. **Mock áp dụng cùng giới hạn** và hỗ trợ cả 2 kênh mới.
- `RealtimeClient.reconnect()`: mở kết nối mới, **giữ nguyên các kênh đã đăng ký**. Server chỉ đọc cookie phiên lúc mở kết nối,
  nên **UI phải gọi ngay sau khi đăng nhập (kể cả bước 2FA) và đăng xuất**. Nếu không, kênh `user` bị từ chối (`UNAUTHENTICATED`)
  hoặc vẫn gắn với tài khoản cũ cho tới khi tải lại trang. Lỗi này làm lệnh, số dư và thông báo không cập nhật realtime sau khi đăng ký.

**Bảo mật (server)**
- Kết nối realtime mở lúc đang đăng nhập sẽ bị **đóng (mã 4401)** khi phiên đó kết thúc: đăng xuất, bị thu hồi, đặt lại mật khẩu,
  tài khoản bị khóa, hết hạn. Server kiểm tra mỗi 30 giây. Client tự kết nối lại dưới dạng khách.

## 0.7.0 — 2026-10-10 (Admin cho Giai đoạn 2.6 + Futures)
Hỗ trợ khách hàng kiểu sàn lớn: tìm theo UID, xem Futures / bot / lịch sử đăng nhập của người dùng, dừng bot có ghi nhật ký.

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `AdminUserSummary` thêm `uid`. `adminListUsers({ query: { q } })` nhận thêm **UID 8 số** (khớp chính xác).
- `AdminUserDetail` thêm `futures` (`FuturesAccount`) và `bots: { runningGrid, activeDca }`.
- `AuditAction` thêm `GRID_BOT_STOP`, `DCA_PLAN_CANCEL` (tổng 20). Quyền mới `bots.manage` (admin, owner).

**Thêm (5 endpoint, tổng 124)**
- `adminUserFuturesPositions` (`open` true/false, phân trang): vị thế Futures của người dùng, lãi lỗ theo mark hiện tại.
- `adminUserBots`: mọi bot lưới + kế hoạch mua định kỳ (đang chạy lên đầu).
- `adminStopGridBot` (`reason`, `sellBase`): dừng bot với lý do `ADMIN`; nhật ký ghi **trong cùng giao dịch** dừng bot; người dùng nhận thông báo `GRID_BOT_STOPPED`. Bot không chạy → `CONFLICT`.
- `adminCancelDcaPlan` (`reason`): hủy kế hoạch; đã hủy rồi → `CONFLICT`.
- `adminUserLoginHistory` (phân trang): lịch sử đăng nhập của người dùng.
- **Mock:** đủ 5 endpoint. Mock đăng nhập bằng người dùng demo (UID 10000001), nên các màn admin này chỉ có dữ liệu với người dùng đó.

## 0.6.0 — 2026-10-10 (Giai đoạn 2.6: hồ sơ + bảo mật, phân tích lãi lỗ, mua định kỳ, bot lưới)
Chỉ **thêm**, không phá code đang chạy.

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `Order` thêm `source: 'USER' | 'GRID' | 'DCA'` và `sourceId` (id bot / kế hoạch; `null` với lệnh của người dùng).
  - Lệnh của bot hiện **badge** "Bot lưới" / "Mua định kỳ".
  - Người dùng **không hủy được** lệnh của bot (`ORDER_NOT_CANCELABLE`) — ẩn nút Hủy, thay bằng "Dừng bot". `cancelAll` của người dùng bỏ qua lệnh bot.
- `Me` thêm `uid` (chuỗi chữ số, từ "10000001" — hiển thị như "UID 10000001", có nút sao chép) và `avatar` (`AvatarId` hoặc `null`).
- `CloseReason` thêm `BOT_STOPPED` (lệnh bị hủy vì bot dừng).
- `Notification` thêm `NEW_DEVICE_LOGIN`, `DCA_EXECUTED`, `DCA_SKIPPED`, `GRID_BOT_STOPPED`.

**Thêm (16 endpoint, tổng 119)**
- **Hồ sơ + bảo mật** (kiểu OKX):
  - `updateProfile` (PATCH `/me/profile`): đổi tên hiển thị, avatar (12 avatar có sẵn: `AvatarId` — UI tự vẽ hình cho từng khóa).
  - `securityOverview`: 2FA, mã chống lừa đảo (đã che), email đã xác minh, lần đổi mật khẩu gần nhất, lần đăng nhập gần nhất, số phiên đang mở.
  - `setAntiPhishingCode`: 4–20 chữ/số, `null` để xóa. Cần mật khẩu, và mã 2FA nếu đã bật 2FA. Mã này được in ở đầu **mọi email** sàn gửi.
  - `loginHistory`: lịch sử đăng nhập 180 ngày (thành công, sai mật khẩu, sai 2FA, bị khóa; thiết bị "Chrome · Windows"; đánh dấu thiết bị mới).
  - Đăng nhập thành công từ **thiết bị mới** → email cảnh báo + thông báo `NEW_DEVICE_LOGIN`.
- **Phân tích lãi lỗ:** `pnlAnalysis({ query: { range: '7d' | '30d' | '90d' | 'all' } })`.
  - Chỉ lãi lỗ **đã chốt**: Spot (bán so với giá vốn, đã trừ phí) + Futures (đóng vị thế − phí + funding).
  - Theo ngày (GMT+7, đủ mọi ngày kể cả 0, có cộng dồn), theo cặp, tỷ lệ thắng, lãi/lỗ trung bình, lớn nhất, profit factor, sụt giảm tối đa.
- **Mua định kỳ (DCA)** trên ví Spot — mua Market bằng `quoteAmount` USDT mỗi kỳ:
  - `dcaPlans`, `createDcaPlan` (DAILY / WEEKLY + `dayOfWeek` 1–7 / MONTHLY + `dayOfMonth` 1–28, giờ theo GMT+7), `updateDcaPlan` (đổi số tiền, tạm dừng / chạy tiếp), `cancelDcaPlan`, `dcaRuns`.
  - Mỗi kỳ chạy **đúng một lần**. Không đủ tiền / sàn dừng → kỳ đó `SKIPPED` kèm lý do + thông báo `DCA_SKIPPED`. Kỳ bị lỡ (server tắt) **không** chạy bù.
  - Tối đa 20 kế hoạch đang chạy.
- **Bot lưới Spot:**
  - `gridBotPreview` (xem trước: các mức giá, khối lượng mỗi lưới, số lệnh mua/bán, lãi mỗi lưới sau phí, vốn tối thiểu), `createGridBot`, `gridBots`, `getGridBot`, `stopGridBot` (`sellBase`: bán số coin bot đang giữ), `gridBotOrders`.
  - Lưới số học (`ARITHMETIC`) hoặc hình học (`GEOMETRIC`), 2–100 lưới. Giá hiện tại phải nằm trong khoảng. Tối đa 5 bot chạy cùng lúc.
  - Khi bắt đầu, bot mua Market phần coin cho các lưới phía trên giá hiện tại.
  - Lỗi: `INVALID_GRID` (khoảng giá sai, quá dày so với bước giá, vốn quá nhỏ → `details.minInvestment`, khoảng cách lưới nhỏ hơn phí).
  - Bot đã dừng vẫn giữ `totalValue` / `totalPnl` (giá trị lúc dừng) để hiện trong lịch sử.
  - Admin hủy lệnh của bot hoặc reset tài khoản → bot dừng (`ERROR` / `STOPPED`, kèm `stopReason`) + thông báo `GRID_BOT_STOPPED`.
- **Realtime** (kênh `user`): `dcaPlan`, `gridBot` (bot đổi trạng thái / khớp lệnh).
- **Mã lỗi:** `INVALID_GRID`.
- **Mock:** đủ 16 endpoint. Mock không mô phỏng lưới khớp lệnh (lãi lưới luôn 0); khi tạo bot, giá trị = vốn đầu tư; khi dừng có bán, lỗ đúng bằng phí bán 0,1%.

## 0.5.0 — 2026-10-09 (Giai đoạn F: Futures mô phỏng)
Hợp đồng vĩnh cửu USDT-M mô phỏng: giá Binance USDⓈ-M, ký quỹ **cô lập**, **một chiều**, đòn bẩy **1–20×**.

**Thay đổi nhỏ có thể ảnh hưởng UI**
- `LedgerEntry` thêm `account: 'SPOT' | 'FUTURES'`. Các endpoint sổ cái cũ (`ledger`, export CSV) vẫn chỉ trả ví Spot.
- `LedgerEntryType` thêm `TRANSFER`, `REALIZED_PNL`, `FUNDING_FEE`, `LIQUIDATION`, `MARGIN_ADJUST`; `refType` thêm `TRANSFER`, `FUTURES_ORDER`, `FUTURES_POSITION`. Bảng dịch loại sổ cái của UI cần thêm các mục này.
- `ExchangeSettings` thêm `futures: { makerFee, takerFee, liquidationFee }`; `UpdateSettingsRequest` thêm `futuresMakerFee`, `futuresTakerFee`, `futuresLiquidationFee`.
- `ReconciliationMismatch` thêm `account` và loại `LOCKED_VS_FUTURES`.
- `Notification` thêm 3 loại: `FUTURES_ORDER_FILLED`, `POSITION_TPSL`, `POSITION_LIQUIDATED`.

**Thêm (26 endpoint, tổng 103)**
- **Thị trường** (công khai):
  - `futuresExchangeInfo`: 50 hợp đồng; `multiplier` = 1000 với 1000PEPE/SHIB/BONK/FLOKI; phí; `maxLeverage` 20.
  - `futuresTickers` (kèm mark/index/funding), `futuresMarkPrice`, `futuresDepth`, `futuresMarketTrades`, `futuresCandles`, `futuresFundingHistory`, `futuresMarketStatus`.
- **Ví:**
  - `futuresAccount`: walletBalance, available, positionMargin, orderMargin, unrealizedPnl, equity;
  - `futuresTransfer`: Spot ↔ Futures;
  - `futuresLedger`.
- **Đòn bẩy:** `futuresSymbolSettings`, `futuresSetLeverage` (`LEVERAGE_LOCKED` khi còn vị thế hoặc lệnh mở).
- **Lệnh:**
  - `futuresPlaceOrder` (MARKET, LIMIT GTC/IOC, `reduceOnly`, `tpsl` gắn vào vị thế);
  - `futuresOpenOrders`, `futuresOrderHistory`, `futuresCancelOrder`, `futuresCancelAll`, `futuresMyTrades`.
- **Vị thế:** `futuresPositions`, `futuresPositionHistory`, `futuresClosePosition` (đóng hết hoặc một phần), `futuresAdjustMargin` (+/−), `futuresSetTpSl`.
- **Admin:** `adminFuturesSymbols`, `adminUpdateFuturesSymbol` (bật/tắt, đòn bẩy tối đa, tỷ lệ ký quỹ duy trì; ghi nhật ký `FUTURES_SYMBOL_UPDATE`).
- **Realtime:**
  - kênh `futures:ticker|mark|depth|trades:<SYMBOL>`, `futures:candles:<SYMBOL>:<i>`, `futures:status`;
  - kênh `user` thêm `futuresOrder`, `futuresTrade`, `futuresPosition`, `futuresAccount`.
- **Mã lỗi:** `LEVERAGE_LOCKED`, `INVALID_LEVERAGE`, `REDUCE_ONLY_REJECTED`, `MARGIN_TOO_LOW`.
- **`@cex/core`:** `initialMargin`, `pnl`, `liquidationPrice`, `isLiquidatable`, `fundingPayment`, `averageEntry`, `returnOnMargin` — UI dùng để **hiển thị** lãi lỗ realtime theo kênh `futures:mark`.
- **Mock:** đủ 26 endpoint và realtime Futures. `setMockFuturesPrice('BTCUSDT', 70000)` để thử khớp Limit, TP/SL, thanh lý; `mockSettleFunding()` để thử thanh toán funding.

## 0.4.0 — 2026-10-09 (Giai đoạn 2.5: dữ liệu cho giao diện v2)
Chỉ **thêm**, không phá code đang chạy. Riêng mock: giờ **từ chối request sai hợp đồng** (`VALIDATION_ERROR`, 400) giống server — trước đây mock nhận mọi thứ.

**Thêm**
- **50 cặp USDT** (trước 10). Danh sách ở `server/src/config.ts` (`SYMBOLS`).
- `ExchangeInfo.assets`: thông tin coin — `name` (tên đầy đủ), `tags` (nhóm ngành), `description` (mô tả ngắn, văn bản thuần).
  - Nhóm ngành: `AssetTag` + nhãn vi/en `ASSET_TAG_LABELS`.
  - Dữ liệu mặc định: `ASSET_CATALOG`.
- `sparklines({ query: { range: '24h' | '7d' } })`: biểu đồ mini cho mọi cặp.
  - 24h = 25 điểm giá đóng nến 1h; 7d = 43 điểm nến 4h.
  - Server cache 60 giây. Cặp không có dữ liệu → `points: []` + `UNAVAILABLE`.
- `depth` nhận `limit` tới **500** (trước 100).
  - 20 mức đầu là realtime.
  - Phần sâu hơn lấy từ snapshot Binance, làm mới mỗi 1–3 giây, dùng để gom giá và vẽ biểu đồ độ sâu.
- Kênh realtime **`exchange:status`** → `ExchangeStatus { tradingHalted, disabledSymbols, updatedAt }`. Gửi ảnh chụp khi subscribe, sau đó gửi mỗi khi admin dừng/mở giao dịch hoặc bật/tắt cặp. **Thay cho việc gọi lại `exchangeInfo` mỗi 30 giây.**
- Thông báo của sàn: `announcements()` (công khai: đã đăng, chưa ẩn, chưa hết hạn; ghim lên đầu).
- Admin:
  - `adminUpdateAsset` (sửa tên/nhóm/mô tả coin, cần `reason`);
  - `adminListAnnouncements`, `adminCreateAnnouncement`, `adminUpdateAnnouncement` — bản nháp, đăng, ghim, ẩn, hết hạn.
  - Quyền mới: `content.manage` (admin, owner).
  - Nhật ký: `ASSET_UPDATE`, `ANNOUNCEMENT_CREATE`, `ANNOUNCEMENT_UPDATE`; `targetType` thêm `ASSET`, `ANNOUNCEMENT` (`AuditTargetType`).
- Mock: 50 cặp, sparkline giả, 5 thông báo mẫu (1 bản nháp, 1 đã hết hạn), `exchange:status` trong realtime mock.

## 0.3.0 — 2026-10-09 (Giai đoạn 3: Admin + 2FA)
**Một thay đổi cần sửa UI:** `login` giờ trả về **một trong hai** dạng: `{ user }` (đăng nhập xong) **hoặc** `{ twoFactorRequired: true, challengeToken, expiresAt }` → hiện ô nhập mã 6 số rồi gọi `loginTwoFactor({ body: { challengeToken, code } })`. Kiểm tra bằng `'user' in res`.

**Thêm**
- `Me` có `twoFactorEnabled` và `permissions` (danh sách quyền — chỉ để ẩn/hiện nút, server luôn tự kiểm tra).
- 2FA (TOTP, ứng dụng Google Authenticator/Authy…): `setupTwoFactor` → `enableTwoFactor` (trả 10 mã khôi phục, chỉ hiện 1 lần) → `disableTwoFactor`, `regenerateRecoveryCodes`, `loginTwoFactor`.
- Quyền: `Permission`, `ROLE_PERMISSIONS`, `STAFF_ROLES`, `hasPermission()` (`permissions.ts`).
- Admin API (`auth: 'staff'` + `permission`), 20 endpoint `admin*`: tổng quan, người dùng (tìm, xem, lệnh, sổ cái, khóa/mở, quyền tín hiệu, vai trò, cộng/trừ số dư, reset), cấu hình sàn, dừng/mở giao dịch, cặp giao dịch, nhật ký quản trị, đối soát.
- Mã lỗi: `TWO_FACTOR_REQUIRED`, `INVALID_TWO_FACTOR_CODE`, `BOT_ACCOUNT_PROTECTED`.
- Mock: `setMockRole('admin' | 'support' | 'owner' | 'user', twoFactorEnabled?)`; mã 2FA mock: mọi 6 chữ số trừ `000000`.

## 0.2.0 — 2026-10-09 (Giai đoạn 2)
Chỉ **thêm** — không phá vỡ code UI viết theo 0.1.0, trừ khi UI tự dựng object `Order`/`Trade` (mock riêng): khi đó cần thêm các trường mới.

**Lệnh**
- `OrderType` thêm `TRAILING_STOP_MARKET`. `placeOrder` nhận thêm `STOP_MARKET`, `STOP_LIMIT`, `TRAILING_STOP_MARKET`.
- `MARKET`/`LIMIT` **BUY** nhận `tpsl` (take-profit / stop-loss gắn kèm).
- `Order` thêm: `triggerState`, `triggerDirection`, `triggeredAt`, `trailingDeltaBips`, `activationPrice`, `trailingReferencePrice`, `orderListId`, `parentOrderId`, `tpsl`, `closeReason`.
- `Trade` thêm `realizedPnl` (lệnh SELL).
- OCO: `placeOco`, `openOrderLists`, `getOrderList`, `cancelOrderList` + kiểu `OrderList`.
- `orderHistory`, `myTrades`, `ledger` nhận thêm `from` / `to` (ISO).

**Mới**
- Danh mục: `portfolio`, `portfolioHistory` (`range`: 24h/7d/30d/90d/all).
- Xuất CSV: `exportOrders`, `exportTrades`, `exportLedger` + helper `exportUrl()`.
- Cảnh báo giá: `listAlerts`, `createAlert`, `deleteAlert`.
- Thông báo: `listNotifications`, `unreadNotifications`, `markNotificationsRead`.
- Cài đặt: `getPreferences`, `updatePreferences` (yêu thích, xác nhận lệnh, màu tăng/giảm, giao diện, ngôn ngữ, khung nến mặc định).
- Realtime kênh `user` thêm `kind`: `orderList`, `notification`, `alert`.
- Mã lỗi mới: `INVALID_STOP_PRICE`, `INVALID_OCO_PRICES`, `INVALID_TPSL`, `INVALID_TRAILING_DELTA`, `LIMIT_EXCEEDED`.
- `@cex/core`: `positionSizeForRisk()` cho máy tính khối lượng theo % rủi ro.
- Mock: `setMockPrice(symbol, price)` để kích hoạt stop/OCO/TP-SL/cảnh báo theo ý muốn.

## 0.1.0 — 2026-10-09 (Giai đoạn 0–1)
Auth, thị trường, ví, lệnh Market/Limit, realtime, mock MSW.

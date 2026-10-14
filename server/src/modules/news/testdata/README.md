# Test data for `server/src/modules/news` (Module N)

Real samples taken on 2026-10-14 during N0 ([report](../../../../../docs/reports/2026-10-14-module-N-nguon.md)), trimmed for tests that must not touch the network.

- `rss/*.xml` - first 12 items of each feed; only `title`, `link`, `guid`, `pubDate`/`dc:date`, `category` (no article text, per N-D5).
  Several feeds wrap values in CDATA (`fed.xml`: `<pubDate><![CDATA[Tue, 13 Oct 2026 18:00:00 GMT]]></pubDate>`, CoinDesk titles) - the parser must unwrap CDATA.
- `gdelt/20261014160000.sample.gkg.csv` - unchanged GKG 2.1 rows (tab-separated, latin1 as read) from the file stamped 2026-10-14 16:00 UTC:
  every crypto/macro-relevant row, 5 rows with zero positive and zero negative score (tone must become `null`) and a few unrelated rows.
  Data: GDELT Project, https://www.gdeltproject.org/ (attribution required).

# CEX Lightweight Charts Reference

Source: https://github.com/tradingview/lightweight-charts
Classification: framework/library reference, not an Agent Skill.
License: Apache-2.0.
Observed package version during audit: 5.2.1.
Purpose for this CEX UI: use as the default candidate for performant candlestick, line, area, volume, and overlay charts when building exchange, signal, portfolio, watchlist, and admin dashboards.

## Use When
- Building market chart panels, mini charts, watchlist sparklines, strategy equity curves, or signal context charts.
- A chart must be fast enough for realtime updates and dense crypto candles.
- The UI needs consistent crosshair, price scale, time scale, theme, loading, stale-data, and empty states.

## CEX Integration Rules
- Treat this as a frontend dependency decision, not trading logic.
- Keep calculation of balances, fees, PnL, liquidation, and risk on backend/contracts; UI only displays API data.
- For realtime charts, explicitly handle disconnected, stale, loading, and no-data states.
- Do not imply TradingView endorsement or use proprietary TradingView Charting Library features; this rule refers only to the open-source Lightweight Charts package.
- Test mobile width from 360px, dark/light themes, keyboard focus around chart controls, and reduced-motion behavior for transitions around the chart.

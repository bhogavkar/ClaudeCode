# Indian Market Swing + Intraday Trading System (Pine Script v6)

A confluence-based technical-analysis trading system for NSE/BSE stocks,
indices and ETFs. It combines trend, market structure, liquidity sweeps,
Fair Value Gaps, volume, momentum, volatility, VWAP, session/opening-range
logic and risk:reward filtering into a single 0–100 confluence score — and
is deliberately built to say **NO TRADE** whenever the evidence is weak,
rather than to maximize signal count.

**This is a technical-analysis tool. It does not promise profits, does not
claim a win rate, and the confluence score is not a probability of
winning.** See [`USER_GUIDE.md`](./USER_GUIDE.md) §0 and §15.

## What's in here

| File | What it is |
|---|---|
| [`IndianMarketSystem_Indicator.pine`](./IndianMarketSystem_Indicator.pine) | The chart tool — dashboard, live BUY/SELL/WAIT/NO-TRADE signals, structure/liquidity/FVG drawings, realtime alerts (incl. a webhook-ready JSON payload) |
| [`IndianMarketSystem_Strategy.pine`](./IndianMarketSystem_Strategy.pine) | The backtest engine — same signal logic, wired to real `strategy.entry`/`strategy.exit` orders with commission, slippage, position sizing off live equity, trailing/breakeven/partial exits, and a custom R-multiple/expectancy stats table |
| [`USER_GUIDE.md`](./USER_GUIDE.md) | Full documentation: settings reference, signal/volume/liquidity/FVG logic explained, swing vs. intraday usage, risk management, non-repainting design, alert & webhook setup, backtesting & robustness-testing instructions |

## Install

1. Open [TradingView](https://www.tradingview.com/), open the Pine Editor.
2. Paste the contents of `IndianMarketSystem_Indicator.pine` → **Add to Chart**.
3. Optionally repeat with `IndianMarketSystem_Strategy.pine` for backtesting.
4. Read [`USER_GUIDE.md`](./USER_GUIDE.md) — start with §0 (disclaimers) and
   §2 (Quick Start).

## Design principles

- **Confluence, not a single indicator.** No RSI-crosses-50 or EMA-crossover
  logic — nine independently-weighted components (trend, structure,
  liquidity, FVG, volume, momentum, location/VWAP, volatility, HTF) must
  agree before a signal fires.
- **Non-repainting by construction.** Final signals latch only on confirmed
  (closed) bars; higher-timeframe data uses the documented offset +
  `lookahead_on` technique so it never leaks an unclosed HTF candle.
- **Same core engine, indicator and strategy.** The analysis/scoring logic
  (Sections 1–25 in both files) is identical — what you see on the chart is
  what the strategy backtests. Position sizing (Section 26) intentionally
  uses live equity in the strategy instead of a static illustrative capital
  figure, and risk-limit bookkeeping/order execution differ by necessity —
  see `USER_GUIDE.md` for the exact, documented split.
- **Fewer, higher-quality setups over more signals.** Duplicate-signal
  control, an extension filter, a Risk:Reward filter, and an explicit
  No-Trade engine all exist to keep the system out of low-quality trades.

Full details, every formula, and every default value are documented in
[`USER_GUIDE.md`](./USER_GUIDE.md).

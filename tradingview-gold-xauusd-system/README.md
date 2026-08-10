# Gold (XAUUSD) Swing + Intraday Trading System (Pine Script v6)

A confluence-based technical-analysis trading system built specifically for
**Gold Spot / XAUUSD**, tuned for **5-minute intraday use**, with a
deliberate bias toward **fewer, stronger, verified signals** over signal
frequency.

This is a purpose-built adaptation of
[`tradingview-indian-market-system`](../tradingview-indian-market-system) —
same confluence engine (trend, structure, liquidity, FVGs, volume, momentum,
volatility, regime, scoring, risk/reward), rebuilt where it actually needed
to be: the session model, since Gold trades ~23 hours a day and has no
NSE-style single open/close window, plus two new gates that exist purely to
enforce "strong, verified" output.

**This is a technical-analysis tool. It does not promise profits, does not
claim a win rate, and the confluence score is not a probability of
winning.** See [`USER_GUIDE.md`](./USER_GUIDE.md) §0 and §11.

## What's in here

| File | What it is |
|---|---|
| [`GoldXAUUSD_Indicator.pine`](./GoldXAUUSD_Indicator.pine) | The chart tool — dashboard, BUY/SELL/WAIT/NO-TRADE signals, structure/liquidity/FVG drawings, realtime alerts + webhook JSON |
| [`GoldXAUUSD_Strategy.pine`](./GoldXAUUSD_Strategy.pine) | The backtest engine — same signal logic, real orders, commission/slippage, equity-based sizing, trailing/breakeven/partials, custom stats table |
| [`USER_GUIDE.md`](./USER_GUIDE.md) | Full documentation: the Gold-specific session model, the "strong/verified signal" gates, settings reference, risk management, non-repainting design, alerts, backtesting |

## Install

1. Open [TradingView](https://www.tradingview.com/) on a **Gold Spot /
   XAUUSD** chart (e.g. `OANDA:XAUUSD`), 5-minute timeframe.
2. Pine Editor → paste `GoldXAUUSD_Indicator.pine` → **Add to Chart**.
3. Optionally repeat with `GoldXAUUSD_Strategy.pine` for backtesting.
4. Read [`USER_GUIDE.md`](./USER_GUIDE.md), starting with §0 and §2.

## What's different from the Indian-market build, and why

| Concern | Indian build | This build |
|---|---|---|
| Session model | Fixed NSE window (`09:15–15:30 IST`) | UTC Daily Anchor (VWAP/gap reset) + optional Active Hours quality filter (default London+NY overlap) + Weekly Close Protection — because Gold trades ~23h/day, Sun evening–Fri evening |
| Minimum Tradable Class | n/a (any qualifying score could signal) | New: signals below `STRONG` (configurable) never fire, regardless of raw score |
| Confirmation | Confirmed-bar only (1 bar) | New: the winning side must hold for N (default 2) consecutive confirmed bars |
| Swing Sensitivity default | 5 | 7 (more noise filtering for a 5m chart) |
| Confluence weights | Volume 15, HTF 5, Structure/Liquidity 15/15 | Volume 8 (tick-volume caveat), HTF 3, Structure 18 / Liquidity 17 |
| Currency | ₹ | $ |

Everything else — the confluence-scoring formula, market structure
(BOS/CHoCH/MSS), the Liquidity Shift Engine, Fair Value Gap tracking,
candlestick/chart patterns, momentum, and the entry/stop/target math — is
the same engine, unchanged.

Full details and every default value are in [`USER_GUIDE.md`](./USER_GUIDE.md).

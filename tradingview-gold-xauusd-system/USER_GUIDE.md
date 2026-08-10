# Gold (XAUUSD) Swing + Intraday Trading System — User Guide

A confluence-based technical-analysis system built specifically for **Gold
Spot / XAUUSD** (and gold CFDs/futures), tuned for **5-minute intraday use**,
with a deliberate bias toward **fewer, stronger, verified signals** over
signal frequency. Two Pine Script v6 files share one signal engine:

| File | Purpose |
|---|---|
| `GoldXAUUSD_Indicator.pine` | Chart tool: dashboard, live signals, alerts, drawings |
| `GoldXAUUSD_Strategy.pine` | Backtest engine: real orders, commission/slippage, performance stats |

This is a direct adaptation of a system originally built for NSE/BSE Indian
equities. **Sections 1–25 (the confluence/signal engine itself) are
unchanged in substance** — trend, structure, liquidity, FVG, volume,
momentum, volatility, regime, scoring, entry/stop/target math. What was
rebuilt specifically for Gold: the session model (Section 3), the default
weights and a few sensitivity defaults, and two new gates that exist purely
to satisfy "strong, verified signals only."

---

## 0. Read This First

- **Technical analysis only. No promise of profit or win rate.** The 0–100
  score is a confluence score, not a probability. "Strong" and "verified"
  describe *how much independent technical evidence agreed, and for how
  long* — not a guarantee of the outcome.
- **Gold trades almost continuously** (roughly Sunday 22:00 UTC through
  Friday 22:00 UTC, exact times vary by broker). There is no single daily
  "market open" the way NSE has 09:15 IST — this build's session logic is
  built around that reality (see §3).
- **Weekend gap risk is real and larger than most instruments' overnight
  risk.** A stop order is a request, not a guarantee — Friday-to-Sunday
  gaps on Gold can be significant, especially around major news.
- **Non-repainting by design**, with the same disclosed exception as any
  live indicator: values can change while the current bar is still forming,
  never after it closes. See §12.
- **Broker/CFD "volume" is typically tick volume** (a count of price
  updates), not consolidated exchange volume. It's still a useful
  *relative*-activity proxy, which is why it's weighted down in this
  build's default weights (see §5) rather than removed outright.

---

## 1. Files in This Package

```
tradingview-gold-xauusd-system/
  GoldXAUUSD_Indicator.pine   — indicator (analysis, dashboard, alerts)
  GoldXAUUSD_Strategy.pine    — strategy (backtest engine)
  USER_GUIDE.md               — this document
```

## 2. Quick Start (5-Minute Chart)

1. Open **XAUUSD / Gold Spot** on your broker's feed (e.g. `OANDA:XAUUSD`),
   5-minute chart.
2. Add `GoldXAUUSD_Indicator.pine` to the chart.
3. Leave defaults for your first look:
   - **Trading Mode = AUTO** → on a 5m chart this resolves to **INTRADAY**.
   - **Minimum Tradable Class = STRONG** (score ≥ 70 required, not just ≥ 40).
   - **Consecutive Confirmed Bars Required = 2** (the winning side must hold
     for 2 full closed bars before it's allowed to fire).
4. The dashboard (top-right by default) shows Mode, Timeframe guidance, HTF
   Bias, Market Regime, Signal Quality, structural Bias, and the SIGNAL
   itself — BUY / SELL / WAIT — EXTENDED / GOOD SETUP — POOR R:R / NO TRADE
   — with Entry/Stop/Targets/R:R/Position size when a trade is proposed, or
   a plain-English `Reason` when it isn't.
5. Switch to **Display Style = ADVANCED** to see RVOL, ATR/ADX, VWAP,
   Liquidity, FVG, Momentum, and the confirmation-streak progress.
6. Expect **infrequent signals** — that is the point (see §5).

## 3. The Session Model (Why It's Different From an Equities Build)

There is no NSE-style single window here. Instead, three independent
mechanisms:

### 3.1 Daily Anchor (default `0000 UTC`)
Defines where each "trading day" resets for the **session VWAP**, the
**Daily Reference Range**, and gap detection (§9). `0000 UTC` is a simple,
DST-free default. If you know your broker's own daily rollover time (many
CFD/FX brokers roll at 21:00–22:00 UTC, aligned with the NY 5pm close), you
can set it there instead — it mainly changes *where the day's VWAP resets*,
not whether the system trades.

### 3.2 Active Hours (default `0600–1900 UTC`, ON by default)
A **signal-quality filter, not a market-hours filter.** Gold keeps trading
outside this window; the system simply won't propose *new* signals outside
it by default, because liquidity and follow-through are typically weaker in
the late-Asia/early-London "dead zone" and can make signals less reliable.
The default window covers the **London + New York session overlap**, widely
regarded as Gold's most liquid, most trending stretch of the day. Turn
**"Restrict New Signals to Active Hours"** off if you want signals around
the clock.

### 3.3 Weekly Close Protection (default: 2 hours before `2200 UTC` Friday)
Blocks *new* intraday entries in the final stretch before the weekly close,
so you don't open fresh risk right before the weekend gap window. Existing
positions are still managed normally.

### 3.4 Daily Rollover Protection (default: 10 minutes after the Daily Anchor)
A short pause after each daily reset, mirroring the old "opening
observation" concept — spreads/behaviour can be briefly erratic right at
rollover on many brokers.

## 4. "Strong Signals, All Verified" — How It's Implemented

Two independent gates exist specifically for this, on top of everything
else in §5–§11:

### 4.1 Minimum Tradable Class (default `STRONG`)
The score bands are unchanged (`0–39 NO TRADE · 40–54 WEAK · 55–69 MODERATE
· 70–84 STRONG · 85–100 HIGH CONVICTION`), but a **new, separate setting**
decides which of those bands are actually allowed to fire as BUY/SELL. With
the default `STRONG`, a read of 55/100 ("MODERATE") is still shown as its
true score if you inspect it, but it will **never** become a tradable
signal — it's reported as `NO TRADE` with the real reason. Set this to
`HIGH CONVICTION` for an even higher bar (≥85), or down to `MODERATE` if you
want the original, less restrictive behaviour back.

### 4.2 Consecutive Confirmed Bars Required (default `2`)
Even once the winning side clears the class floor, it must **keep clearing
it for this many consecutive CLOSED bars** before a signal fires. This
directly targets one-bar flukes, which are common on a fast 5-minute chart.
While a setup is building toward this, the dashboard reports `Building
confirmation (1/2 consecutive confirmed bars)` — genuinely informative,
not a generic "no trade." Set it to `1` to restore the original
single-bar-confirm behaviour; raise it to 3–5 for even more conservative,
slower, more-verified signals.

**Both gates apply identically to the confirmed BUY/SELL markers, the
alerts, and the JSON payload** — there is no separate "weak" alert channel
sneaking through underneath them.

## 5. How the Confluence Score Works

Nine independently-weighted components, scored 0–1 for "how strongly does
this support a BUY" and, separately, for SELL, then combined:

| Component | Weight (Gold default) | Notes |
|---|---|---|
| Trend | 16 | EMA stack + slope, corroborated by structure when EMAs compress |
| Market Structure | 18 | Raised vs. the equities default — HH/HL vs LH/LL bias and BOS/MSS carry more weight here |
| Liquidity | 17 | Raised — the Liquidity Shift Engine (sweep→reclaim→displacement→MSS→FVG, §7) |
| Fair Value Gap | 10 | Fresh, unmitigated FVG in the trade direction |
| Volume | 8 | **Lowered** — most Gold/CFD volume is tick volume, weaker evidence than true traded volume |
| Momentum | 13 | Raised to help offset the lower Volume weight |
| VWAP / Location | 10 | Price vs. the daily-anchored VWAP, its slope, and whether price is already extended |
| Volatility | 5 | Quality gate — normal/expansion favourable, extreme volatility penalised, symmetric |
| HTF Confirmation | 3 | Lowered slightly — still useful, but less central for a fast, near-continuous market |

All nine are configurable; the formula auto-renormalises if you change them,
so they never need to sum to exactly 100.

A signal only fires when: the winning score clears `max(regime floor,
STRONG/HIGH-CONVICTION floor)`, it beats the other side by the configured
margin, it survives §4's two confirmation gates, and it survives every gate
in §6.

## 6. The No-Trade Engine (Priority Order)

1. **Outside the backtest window** (strategy only).
2. **Session gate** — Active Hours / daily-rollover / weekly-close (§3).
3. **Choppy regime with no raw qualifying read at all** → *"Market is
   CHOPPY — insufficient evidence to trade."*
4. **A raw qualifying read exists but hasn't held long enough yet** →
   *"Building confirmation (x/y consecutive confirmed bars)."* (§4.2)
5. **Liquidity filter** — 20-bar average (tick) volume degraded vs. its
   100-bar average, or zero (→ `DATA LIMITATION`).
6. **Overtrading protection** — daily loss limit / max trades per day / max
   consecutive losses / post-loss cooldown.
7. **Duplicate signal** — the same setup is already open with no new
   structure/liquidity/FVG event.
8. **Extended** → `WAIT — EXTENDED` (price too far from EMA/VWAP).
9. **Poor Risk:Reward** → `GOOD SETUP — POOR R:R`.

Note the deliberate ordering of #3/#4: a genuinely choppy market (no
qualifying read on *either* side) is reported as choppy; a market that
*does* have a qualifying read but simply hasn't confirmed for long enough
yet is reported as "building confirmation" instead — a more specific,
more useful message than lumping both into "choppy."

## 7. Liquidity, Structure, FVG, Volume, Momentum, Risk Management

These modules are unchanged in logic from the original build — see the
formulas and definitions below; full worked examples are in the companion
Indian-market `USER_GUIDE.md` if you want the long-form version, but
everything needed to use this build is here:

- **Market structure**: BOS = continuation break in the direction structure
  already had. CHoCH = a break of the *opposite*-side swing point before
  the structure engine's bias has corroborated it (early warning). MSS = the
  bar the structure engine's bias actually flips (confirmed shift).
- **Liquidity Shift Engine** (5 stages, expire after 15 bars without
  progress): `SWEPT → RECLAIMED → DISPLACED → MSS CONFIRMED → FVG FORMED`.
  Reaching stage 3+ scores materially higher than a plain breakout; stage 5
  is the strongest read available.
- **Fair Value Gaps**: bullish = `low > high[2 bars ago]`; bearish = `high <
  low[2 bars ago]`; status Fresh → Partial → Full (mitigated) →
  **Invalidated** (an opposing MSS occurred before mitigation). Prioritised
  when formed after a liquidity sweep/rejection.
- **Volume**: RVOL bucketed `<0.7 LOW · 0.7–1.0 NORMAL · 1.0–1.5 ELEVATED ·
  1.5–2.0 STRONG · >2.0 EXTREME`; price/volume relationship classified in
  context (never "high volume = buy"); volume-price divergence flagged as a
  warning, not an automatic reversal signal.
- **Stops**: Structure / ATR / FVG Invalidation / Swing High-Low / **Structure
  + ATR Hybrid** (default — structural level, floored at 0.6×ATR so it's
  never unrealistically tight).
- **Targets & R:R**: Target 1 prefers the next real S/R/liquidity level if
  it already clears your minimum R:R, else falls back to exactly the
  minimum multiple; below that minimum, the system reports `GOOD SETUP —
  POOR R:R` instead of forcing a signal.
- **Position sizing**, shown with full arithmetic on every signal:
  `Max Risk = Account Capital × Risk% ; Risk/unit = |Entry − Stop| ; Qty =
  floor(Max Risk ÷ Risk per unit)`. (The indicator uses a static "Account
  Capital ($)" figure for illustration; the strategy sizes off live,
  compounding `strategy.equity`.)
- **Overtrading protection**: max trades/day, cooldown after a loss, max
  consecutive losses/day, max daily loss % — simulated/informational in the
  indicator, enforced against real equity and real trade history in the
  strategy.

## 8. Market Regime & Multi-Timeframe Bias

Unchanged: eight regimes (`STRONG/WEAK BULLISH/BEARISH TREND · RANGE · HIGH/
LOW VOLATILITY · CHOPPY/NO-TRADE`) from EMA structure + ADX + structure bias
+ a volatility percentile; one auto-selected higher timeframe (1m–15m chart
→ 1H, ≤1H → 4H, ≤4H → Daily, else → Weekly), read via the non-repainting
offset + `lookahead_on` technique so it always reflects the last **closed**
HTF bar.

## 9. Gap Analysis

Compares the daily-anchor "day open" against the previous trading day's
close (via a plain, non-repainting `[1]`-offset daily-bar reference) —
this naturally covers the **weekend gap** (Friday close → next trading
day's open) the same way it covers any other daily gap, with no special
casing needed. Classified Small/Moderate/Large relative to the prior day's
ATR, and combined with trend/VWAP context into Continuation / Fading /
plain Gap Up/Down.

## 10. Position Size Calculator, Trailing, Breakeven, Partials (Strategy)

Unchanged mechanics from the base build:
- **Breakeven** once open profit reaches a configurable R (default 1R).
- **Trailing** (ATR / EMA / Structure) activates after a configurable R
  (default 2R), only ever ratchets in your favour.
- **Partial exits**: a configurable % (default 50%) exits at Target 1, the
  remainder rides to Target 2 or the trailing stop — using the *same*
  Target 1/2 levels the dashboard displays.
- Commission/slippage/initial capital are all configurable in the
  **Backtest Engine** input group. For Gold/CFDs, spread and overnight
  swap/rollover fees are usually the bigger real-world cost, not a
  percentage commission — model that through **Slippage** and your own
  expectations, not just the Commission % field.

## 11. Confidence Score ≠ Win Probability

Worth repeating here specifically because this build biases toward higher
scores by design: an 85+ "HIGH CONVICTION, 2-bar-confirmed" signal means
*more independent technical conditions agreed, for longer* — not an 85%
chance of winning, and not a guarantee that the extra verification
eliminates losing trades. Use the Position Size Calculator (§7/§10) to size
risk, never the score itself.

## 12. Non-Repainting & Real-Time Behaviour

Identical mechanism to the base build: every score/event is computed every
tick, but only **latched** into the dashboard/alerts at `barstate.isconfirmed`
(bar close) unless you enable "Show Live/Unconfirmed Signals" (off by
default). Swing pivots confirm with an inherent lag equal to "Swing
Sensitivity" (default raised to 7 for Gold, to filter more 5m wick noise).
Nothing that has already printed on a closed historical bar is ever
rewritten — that would be true repainting, and this script does not do it.

## 13. Alerts & Webhook JSON

Identical mechanism to the base build — see the indicator's alert list
(`BUY/SELL SETUP`, `STRONG BUY/SELL`, `HIGH-CONVICTION BUY/SELL`, `LIQUIDITY
SWEEP`, `MSS`, `BULLISH/BEARISH FVG`, `BREAKOUT/BREAKDOWN`, `VWAP RECLAIM/
REJECTION`, `VOLUME SPIKE`, `TARGET/STOP HIT`, `NO-TRADE CONDITION`). Use
**"Any alert() function call"** when creating the alert for the full rich
message and JSON payload:

```json
{"symbol":"XAUUSD","exchange":"OANDA","timeframe":"5","mode":"INTRADAY","signal":"BUY","signal_status":"CONFIRMED","score":82,"entry":4337.50,"stop_loss":4329.20,"target_1":4354.10,"target_2":4361.40,"risk_reward":2.8,"volume_ratio":1.8,"market_regime":"STRONG BULLISH TREND","htf_bias":"BULLISH"}
```

Pine Script does not execute broker orders — treat this JSON as the input
to a separate webhook/execution bridge you control, never as proof an order
was placed.

## 14. Backtesting Instructions

Same workflow as the base build (Strategy Tester Overview/List of Trades +
this script's own bottom-right stats table with Avg R-multiple, Sharpe-like/
Sortino-like, long/short breakdown). Gold-specific notes:
- **Test across different volatility regimes** — Gold's character during a
  strong Fed-driven trend is very different from a quiet, range-bound
  summer stretch. The Market Regime field tells you which you're in.
- **The 5-minute chart needs a reasonable amount of history** for the
  ADX/percentile-based regime reads and pivot structure to stabilise — a
  few hundred bars minimum before trusting the early readings.
- Use **Backtest Window Start/End** to separate development / validation /
  out-of-sample periods, exactly as described for the base build — do not
  judge the system on one continuously-optimised window.
- Because the min-tradable-class and confirmation-bar gates are *stricter*
  than the base defaults, expect **materially fewer trades** in a backtest
  than an unfiltered confluence engine would produce. That is the intended
  trade-off for "strong, verified" signals — fewer trades, each with more
  agreement behind it, not a promise of a higher win rate.

## 15. Known Limitations (Read Honestly)

- **Tick volume, not exchange volume.** RVOL/volume-based evidence is
  weaker for Gold/CFDs than for a true consolidated-volume market; this is
  why the Volume weight is lowered by default, not removed — treat it as
  supporting evidence, not primary evidence.
- **Classic chart patterns** (double top/bottom, H&S, triangles, flags,
  rectangles) use the same conservative, pivot-based heuristics as the base
  build — `PATTERN: NONE` remains the most common output by design. Cup &
  Handle is not implemented.
- **The Active Hours default (London+NY overlap) is a reasonable, common
  convention, not a guarantee of good conditions** — major news releases
  can make even "active hours" briefly unreliable, and the system has no
  news awareness (§0).
- **"Weekly close" assumes a standard Friday-evening-UTC broker close.** If
  your broker's week ends at meaningfully different hours, adjust the
  Weekly Close Time input.
- **Backtests are bar-close/simulated-fill**, not tick-level — expect some
  difference from live fills, especially around rollovers and gaps.

---

*The two confirmation gates in §4 exist for one reason: you asked for
strong, verified signals on a fast chart. They make the system slower and
quieter, not smarter — they trade timeliness for confidence. If a signal
still feels too frequent or too rare after using it for a while, §4 is
exactly where to tune that, not the underlying confluence weights.*

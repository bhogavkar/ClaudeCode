# Indian Market Swing + Intraday Trading System — User Guide

A confluence-based technical-analysis system for NSE/BSE stocks, indices and
ETFs, delivered as two Pine Script v6 files that share one signal engine:

| File | Purpose |
|---|---|
| `IndianMarketSystem_Indicator.pine` | Chart tool: dashboard, live signals, alerts, drawings |
| `IndianMarketSystem_Strategy.pine` | Backtest engine: real orders, commission/slippage, performance stats |

Both files implement **Sections 1–25 identically** (trend, volatility,
structure, liquidity, FVG, volume, VWAP, patterns, regime, scoring,
entry/stop/target math). That is the "core signal engine." Section 26
(position sizing) intentionally sizes off live, compounding equity in the
strategy rather than the indicator's static, illustrative capital figure.
Beyond that, the risk-limit **enforcement bookkeeping** and **trade
execution** differ, because one is a live chart tool and the other places
real backtest orders — see
[Why the Indicator and Strategy Aren't Byte-Identical](#why-the-indicator-and-strategy-arent-byte-identical).

---

## 0. Read This First — What This System Is and Is Not

- **This is a technical-analysis decision-support tool, not a profit
  guarantee.** No component of this system promises or implies a win rate.
- **The "Score" (0–100) is a technical-confluence score.** It measures how
  many independent, pre-defined technical conditions currently agree — it is
  **not** a probability of the trade winning. An 84/100 score means
  "84 out of 100 confluence points were satisfied," never "84% chance of
  profit."
- **Technical analysis only.** The system has no access to earnings, news,
  corporate actions, management quality or fundamental valuation. Where the
  dashboard says "TECHNICAL ANALYSIS ONLY," take it literally.
- **Historical backtest performance does not guarantee future performance.**
  Markets change regime; a parameter set that worked on one stock, one
  period, or one volatility regime may not work on another. See
  [Robustness & Walk-Forward Testing](#20-robustness--walk-forward-testing).
- **Non-repainting by design, with one disclosed exception:** values shown
  while the current bar is still forming can change until that bar closes.
  That is normal, disclosed real-time behaviour — not repainting of already
  printed history. See [Non-Repainting & Real-Time Behaviour](#16-non-repainting--real-time-behaviour).
- **Swing trades carry overnight gap risk.** A stop-loss order is a request,
  not a guarantee — a gap can open beyond it.
- **This is a decision-support and backtesting tool, not a broker connection.**
  Nothing in these scripts places a real order at your broker. See
  [Webhook / Execution Bridge](#18-webhook-json-payload-format).

---

## 1. Files in This Package

```
tradingview-indian-market-system/
  IndianMarketSystem_Indicator.pine   — indicator (analysis, dashboard, alerts)
  IndianMarketSystem_Strategy.pine    — strategy (backtest engine)
  USER_GUIDE.md                       — this document
```

## 2. Quick Start

1. Open a liquid NSE/BSE symbol (index, large/mid-cap stock, or liquid ETF).
2. Add `IndianMarketSystem_Indicator.pine` to the chart (Pine Editor → paste →
   "Add to Chart").
3. Leave **Trading Mode = AUTO** and **Display Style = BEGINNER** for your
   first look. The dashboard (top-right by default) will show:
   - `MODE`, `TIMEFRAME`, `HTF BIAS`, `MARKET REGIME`, `SIGNAL QUALITY`
   - `SIGNAL` (BUY / SELL / WAIT — EXTENDED / GOOD SETUP — POOR R:R / NO TRADE)
   - If a trade is proposed: Entry, Stop, Target 1/2/3, R:R, position size,
     the detected pattern (if any), and CONFIRMED / LIVE status.
   - If not: a plain-English `Reason`.
4. Switch **Display Style = ADVANCED** to see RVOL, ATR/ADX, VWAP, Liquidity,
   FVG, Momentum, divergence, gap, opening-range and extension detail.
5. When you are ready to test the logic historically, add
   `IndianMarketSystem_Strategy.pine` on the same chart/timeframe and open
   TradingView's **Strategy Tester** tab. See [Backtesting Instructions](#19-backtesting-instructions).

Recommended charts for a first look: `NIFTY`, `BANKNIFTY`, `RELIANCE`,
`HDFCBANK`, `TCS`, `INFY` — or any liquid NSE symbol. Nothing is hard-coded to
a symbol; the system reads whatever OHLCV data TradingView provides for the
chart you open it on.

---

## 3. Modes: Intraday / Swing / Auto

- **AUTO** (default): the system inspects the chart's timeframe using
  `timeframe.in_seconds()`. Below 2 hours → **INTRADAY**. 2 hours and above →
  **SWING**. The dashboard always shows which mode is active, e.g.
  `INTRADAY (Auto)`.
- **INTRADAY** / **SWING**: manual override. You can force either mode on
  any timeframe; the dashboard's `Timeframe` row will tell you if the chosen
  timeframe is a poor match for the mode (e.g. *"Consider 4H/Daily for swing
  confirmation"* or *"Consider 5m/15m/30m for cleaner intraday signals"*).
  Nothing is blocked — you are always in control.
- The system does **not** treat any one timeframe as inherently superior. It
  evaluates market structure, volatility and regime dynamically on whatever
  chart you open.

Recommended (not enforced) timeframes:

| Style | Timeframes |
|---|---|
| Intraday | 5m, 15m, 30m, 1H |
| Swing | 1H, 4H, Daily |

---

## 4. Settings Reference

Group names below match the Pine "Settings" panel exactly.

### Mode & Style
- **Trading Mode** (AUTO/INTRADAY/SWING), **Display Style** (BEGINNER/ADVANCED).
- **Manual HTF Override**: leave blank for auto-selected higher timeframe
  (chart ≤15m → 1H; ≤1H → 4H; ≤4H → Daily; else → Weekly), or set your own.

### Session (India, IST)
- **Exchange Session** (default `0915-1530`), **Exchange Timezone** (default
  `Asia/Kolkata`), **Opening Observation Minutes** (default 5 — new intraday
  signals are suppressed this long after the open unless you enable
  **Allow Signals Immediately At Open**), **Opening Range Length** (5/15/30
  min, default 15), **No New Intraday Entries After** (HHMM IST, default
  `1500`).

### Trend Engine
- **Fast/Medium/Slow EMA** (default 20/50/200), **EMA Slope Lookback**
  (default 3), **ADX Length** (14), **ADX Weak/Strong thresholds** (18/25).

### Volatility Engine (ATR)
- **ATR Length** (14), **Volatility Percentile Lookback** (100), **Squeeze**
  (below 20th percentile) / **Extreme** (above 90th percentile) thresholds,
  **ATR Expansion/Contraction multiples** (1.2 / 0.8× its own 50-bar average).

### Market Structure
- **Swing Sensitivity** (default 5 = pivot left/right bars). Higher = fewer,
  more significant swing points. **Confirmed pivots always lag by this many
  bars** — that lag is inherent and non-repainting (see §16).

### Liquidity Engine
- **Equal High/Low Tolerance** (0.15×ATR), **Minimum Sweep Intrusion**
  (0.05×ATR — how far price must wick beyond a level to count as a
  meaningful sweep), **Liquidity Shift Max Bars Between Stages** (15),
  **Displacement Candle Body** (0.8×ATR, min 55% of range).

### Fair Value Gaps
- **Minimum FVG Size** (0.05×ATR), **Max FVGs Tracked** (40), **Full
  Mitigation Requires a CLOSE Through** (on by default — stricter than a
  mere wick touch).

### Volume Engine
- **RVOL Average Volume Lookback** (20 bars), and the RVOL bucket boundaries:
  `<0.7 LOW ACTIVITY · 0.7–1.0 NORMAL · 1.0–1.5 ELEVATED · 1.5–2.0 STRONG ·
  >2.0 EXTREME` (all boundaries configurable).

### VWAP (Intraday)
- **VWAP Bands** on/off, band multiples (1.0 / 2.0 std-dev), slope lookback.

### Gap Analysis
- **Small/Large Gap thresholds**, expressed in multiples of the **prior
  day's ATR** (0.3× / 1.0×) — deliberately relative, not a fixed rupee/percent
  value, so it scales sensibly across small and large stocks.

### Candlestick Patterns / Classic Chart Patterns / Support-Resistance / Momentum
- Shape thresholds (doji body %, marubozu body %, wick-to-body ratio),
  pattern-comparison tolerance (1.5%), and the classic RSI/MACD/Stochastic/ROC
  lengths. See §9–§11 below for how these feed the score (they mostly do
  **not** — patterns are informational, momentum is a weighted component).

### Confluence Score Weights
- Trend 15, Structure 15, Liquidity 15, FVG 10, Volume 15, Momentum 10,
  VWAP/Location 10, Volatility 5, HTF 5 (sums to 100, but the engine
  re-normalises automatically if you change these, so they never have to add
  up to exactly 100).

### Signal Thresholds & Risk:Reward
- Score bands: **0–39 NO TRADE · 40–54 WEAK · 55–69 MODERATE · 70–84 STRONG ·
  85–100 HIGH CONVICTION** (all four boundaries configurable).
- **Min Score Gap Between Bull/Bear** (10 — if bull and bear scores are too
  close, the system treats the picture as ambiguous and stays out).
- **Minimum Score Required In Choppy Regime** (85 — in a CHOPPY/NO-TRADE
  regime the bar to trade is raised sharply rather than removed outright).
- **Minimum Risk:Reward** dropdown (1:1.5 / 1:2 / 1:2.5 / 1:3 / 1:4, default
  1:2).

### Stops & Targets / Position Size Calculator / Overtrading Protection
See §14 and §15 below.

### Alerts / Display
See §17 and the dashboard description in §2.

---

## 5. How the Confluence Score Works (Signal Logic)

The system never lets one indicator decide. Nine components are each scored
0–1 for **"how strongly does this support a BUY"** and, independently, **"how
strongly does this support a SELL,"** then combined with the weights above:

| Component | Weight | What drives it |
|---|---|---|
| Trend | 15 | EMA stack alignment + EMA slope, boosted by structure when EMAs are compressed |
| Market Structure | 15 | Current HH/HL vs LH/LL bias, recent BOS/MSS in that direction |
| Liquidity | 15 | Liquidity Shift Engine stage (see §7) / a fresh sweep+reclaim |
| Fair Value Gap | 10 | A fresh, unmitigated FVG in that direction — extra credit if it formed after a liquidity sweep |
| Volume | 15 | Price/volume relationship + RVOL bucket, penalised by volume divergence |
| Momentum | 10 | Composite RSI/MACD/Stochastic/ROC direction and whether it is rising |
| VWAP / Location | 10 | Price vs VWAP, VWAP slope, and whether price is already extended |
| Volatility | 5 | A quality gate — normal/expansion is favourable, extreme volatility is penalised, both directions equally |
| HTF Confirmation | 5 | Does the higher-timeframe bias (§6) agree? |

`Score(BUY) = 100 × Σ(weight × bull-component) / Σ(weight)`, and the mirror
for SELL. A signal only fires when:

1. The winning score clears the required threshold (normally the WEAK
   floor of 40; raised to 85 in a CHOPPY regime), **and**
2. It beats the other side's score by the configured margin (default 10
   points), **and**
3. It survives every gate in §8 (session, liquidity, overtrading, R:R,
   extension, duplicate).

If any of that fails, the system says so explicitly rather than forcing a
signal — see §8.

## 6. Multi-Timeframe (HTF) Bias

One higher timeframe is auto-selected from the chart's own timeframe (or set
manually). On that HTF, the system computes EMA20/50/200 alignment and ADX,
combines them into a bias score, and classifies BULLISH / BEARISH / NEUTRAL.
This HTF read is fetched with the **offset + `lookahead_on`** technique (see
§16) so it reflects the **last fully closed** HTF bar — it does not leak
into the still-forming HTF candle.

## 7. Liquidity Logic Explanation

**Levels tracked:** the last confirmed swing high/low, previous day
high/low, previous week high/low, and (once formed) the opening range
high/low.

**A sweep** requires price to wick beyond one of those levels by at least
the configured intrusion (default 0.05×ATR) — a trivial one-tick poke does
not count. **A reclaim/rejection** is when the same bar (or a following one)
closes back on the other side of that level.

**The Liquidity Shift Engine** is a 5-stage state machine that only advances
one stage at a time, and expires (resets) if stages don't advance within
15 bars (configurable):

```
1. SWEPT          price wicks meaningfully beyond a liquidity level
2. RECLAIMED       close moves back across that level
3. DISPLACED       a strong-bodied candle (≥0.8×ATR body, ≥55% of range)
                    confirms the new direction
4. MSS CONFIRMED   the Market Structure Engine's bias actually flips
5. FVG FORMED      a fresh Fair Value Gap forms in the new direction
```

A sequence that reaches stage 3+ ("active") scores materially higher than a
plain, unconfirmed breakout; reaching stage 5 ("full") is the strongest
liquidity read the engine can produce, and is exactly the "sell-side swept →
reclaim → displacement → MSS → FVG" bullish chain (and its bearish mirror)
described in the original specification.

**Market Structure definitions used by this script** (SMC/ICT terminology is
not fully standardised across educators, so here is this build's exact,
consistent definition):
- **BOS** (Break of Structure): price closes beyond the last swing point *in
  the direction the structure already had*. A continuation signal.
- **CHoCH** (Change of Character): price closes beyond the *opposite-side*
  swing point while the structure engine's bias hasn't flipped yet — an
  early warning.
- **MSS** (Market Structure Shift): the bar on which the structure engine's
  bias variable actually changes (i.e., a fresh, corroborated Higher-High +
  Higher-Low sequence, or Lower-High + Lower-Low). This is the "confirmed"
  version of a CHoCH.

## 8. The No-Trade Engine (Why the System Stays Out)

Checked in this order; the **first** one that fails is the reason shown:

1. **Choppy regime** with insufficient score → *"Market is CHOPPY —
   insufficient evidence to trade."*
2. **Session filter** → opening-observation window, past the end-of-day
   cutoff, or simply outside the configured session (intraday mode only).
3. **Liquidity filter** → 20-bar average volume has degraded to less than
   30% of its 100-bar average (or is zero — see the "DATA LIMITATION" note
   below), or falls under your optional absolute floor.
4. **Overtrading protection** → daily loss limit / max trades per day / max
   consecutive losses / post-loss cooldown (see §15).
5. **Insufficient confluence** → score below threshold, or bull/bear scores
   too close to call.
6. **Duplicate signal** → the same setup is already open with no new
   structure/liquidity/FVG event since the last signal (see §8.1).
7. **Extended** → price is stretched too far (>2.5×ATR by default) from the
   fast EMA → the state becomes `WAIT — EXTENDED` rather than a hard "no
   trade," because the setup may become valid again after a pullback.
8. **Poor Risk:Reward** → confluence was otherwise acceptable but the
   available reward doesn't clear your minimum R:R → the state becomes
   `GOOD SETUP — POOR R:R` (Example 2 in the original brief: a low-volume
   breakout with no structural confirmation and a weak R:R would land here
   or in plain NO TRADE, never as a forced BUY).

**DATA LIMITATION:** if a symbol/feed reports zero volume across its last 20
bars (some indices, certain synthetic instruments), the system will not
fabricate a volume read — it reports `DATA LIMITATION — no volume feed
available` instead of silently scoring the Volume component as neutral.

### 8.1 Signal Duplication Control
A new BUY is only allowed once the previous one has been superseded by *new*
evidence: a fresh MSS, a fresh FVG, or a fresh liquidity-sweep rejection,
each timestamped by bar index and compared against the bar of the last
signal in that direction. Simply staying "still bullish" for 40 more bars
does not re-fire the alert.

### 8.2 The Trade Checklist (Part 60/53 of the brief)
Every BUY/SELL that does fire is accompanied by a short "why" list built
from whichever of these were actually true for that signal: HTF bias, BOS/
MSS, liquidity sweep+reclaim, fresh FVG, RVOL bucket, price vs VWAP, momentum
direction, and the achieved R:R. You will not see a checkmark for a
condition that wasn't actually met.

## 9. Volume Logic Explanation

Volume is never read mechanically ("high volume = buy"). The engine builds:

- **RVOL** = current volume ÷ 20-bar average volume, bucketed as shown in §4.
- **Price/Volume relationship**, re-evaluated every bar:
  - Price up + rising volume + RVOL≥1.0 → *Bullish participation*
  - Price up + falling volume → *Weak up-move (low vol)*
  - Price down + rising volume + RVOL≥1.0 → *Bearish participation*
  - Price down + falling volume → *Weakening selling (low vol)*
- **Volume Spike** (RVOL≥2.0) / **Volume Dry-up** (RVOL<0.7).
- **Volume-Price Divergence**: at a new pivot high, is the volume at that
  pivot lower than at the previous pivot high (bearish warning)? At a new
  pivot low, is volume lower than the prior pivot low (bullish warning)? These
  are surfaced as *"BEARISH/BULLISH WARNING"* — deliberately not as an
  automatic SELL/BUY, exactly as specified.
- **Breakout quality**: an ORB or structural breakout with RVOL below 1.0
  is explicitly labelled `LOW-VOLUME BREAKOUT — CAUTION`, and it also pulls
  down the Volume score component so it cannot pass as a `CONFIRMED
  BREAKOUT` (which additionally requires RVOL≥1.0 *and* a structural
  BOS/bias in the same direction).

## 10. Fair Value Gap (FVG) Logic Explanation

- **Bullish FVG**: `low[current] > high[2 bars ago]`, gap size ≥0.05×ATR.
- **Bearish FVG**: `high[current] < low[2 bars ago]`, gap size ≥0.05×ATR.
- **Status**: `Fresh` (0% touched) → `Partial` (price has traded into the
  zone) → `Full` (price has closed — or wicked, if you disable the stricter
  close-through requirement — through the far edge) → `Invalidated` (an
  opposing Market Structure Shift occurred before the gap was ever
  mitigated — its bullish/bearish premise no longer applies).
- **Location/context is tracked**, not just existence: a fresh FVG that
  formed after a liquidity sweep/rejection (or within 3 bars of an MSS in the
  same direction) is flagged `fvgAfterSweep = true` and scores materially
  higher — directly implementing *"prioritise FVGs formed after liquidity
  sweeps and displacement."*
- Up to 40 FVGs are tracked and drawn as boxes at a time (oldest pruned
  first) to avoid chart clutter and respect Pine's drawing-object limits.

## 11. Market Regime Detection

Classified every bar into exactly one of eight states, using EMA structure +
ADX + structure bias + a volatility percentile:

`STRONG BULLISH TREND` · `WEAK BULLISH TREND` · `STRONG BEARISH TREND` ·
`WEAK BEARISH TREND` · `RANGE` · `HIGH VOLATILITY` · `LOW VOLATILITY` ·
`CHOPPY / NO-TRADE`

`CHOPPY / NO-TRADE` does not disable signals outright — it raises the
required score to 85 (configurable), which in practice means only a
`HIGH CONVICTION` read can still trade through chop, exactly as requested
("significantly reduce ... signals").

## 12. Swing Trading Explanation

Swing mode targets 1H/4H/Daily structure. A textbook bullish example the
engine is built to recognise:

```
HTF bullish  +  price pulls into a discount/support level  +  sell-side
liquidity swept  +  bullish MSS  +  bullish displacement  +  bullish FVG
+  volume confirmation  +  acceptable R:R   →   BUY (swing)
```

Because swing positions are held overnight (and over weekends), the
dashboard's footer always reminds you: **"Swing trades carry overnight GAP
RISK."** A stop order cannot fill at a price the market never traded at
during a gap — plan position size accordingly (§14).

Swing-only mechanics: the session/opening-range/EOD-cutoff filters in §8 are
**skipped** in SWING mode (`sessionOk = true` unconditionally) — those exist
to protect *intraday* entries around the open/close of the Indian trading
day, not multi-day holds.

## 13. Intraday Trading Explanation

Intraday mode adds three India-specific layers on top of the same core
engine:

- **Session logic**: session window defaults to `09:15–15:30 IST`; the
  first 5 minutes (configurable) are an "opening observation" period during
  which new signals are suppressed by default (Part 61 of the brief);
  after that, the Opening Range (default first 15 minutes) forms.
- **Opening Range Breakout**: a raw ORB break only becomes a `CONFIRMED
  BREAKOUT` with RVOL≥1.0 **and** structural confirmation (BOS or matching
  structure bias); otherwise it is flagged `LOW-VOLUME BREAKOUT — CAUTION`.
  A pullback that re-tests the ORH and closes back above it within 20 bars
  is labelled a retest; a poke above the ORH that closes back inside on low
  volume is labelled a false breakout.
- **VWAP**: session-anchored (manually accumulated, resets every new
  session — not the chart's calendar day, the *configured session*), with
  ±1/±2 standard-deviation bands. Price-above/below, slope, reclaim and
  rejection all feed the "VWAP/Location" score component.
- **End-of-day protection**: no *new* intraday entries after the configured
  cutoff (default `15:00 IST`); existing simulated/real positions are still
  managed normally.

## 14. Risk Management Instructions

### Stops
Four selectable methods, or the default **Structure + ATR Hybrid**:
- *Structure*: the last confirmed swing low (long) / high (short).
- *ATR*: `close ± 1.5×ATR` (multiple configurable).
- *FVG Invalidation*: the far edge of the triggering Fair Value Gap.
- *Swing High/Low*: same as Structure (kept separate for clarity/labelling).
- *Structure + ATR Hybrid* (default): the structural level, but never
  tighter than 0.6×ATR from entry — avoids placing a stop so close that
  ordinary noise takes you out.

### Targets
Target 1 prefers the next real Support/Resistance or opposing-liquidity
level **if** it already clears your minimum R:R; otherwise it falls back to
exactly your minimum R:R multiple. Target 2 and Target 3 add configurable
extra R on top of Target 1's multiple.

### Risk:Reward filter
`R:R = (Target1 − Entry) / (Entry − Stop)`. If it's below your configured
minimum, the system will **not** issue a BUY/SELL — it shows `GOOD SETUP —
POOR R:R` instead (Part 30 of the brief, implemented exactly as specified).

### Position Size Calculator
Shown on every BUY/SELL row, with the full arithmetic, never just a number:

```
Max Rupee Risk   = Account Capital × Risk % per trade
Risk per Share   = |Entry − Stop|
Quantity         = floor(Max Rupee Risk ÷ Risk per Share)
```
Example straight from the brief: Capital ₹10,00,000, Risk 1% → Max Rupee
Risk ₹10,000; Entry ₹500, Stop ₹480 → Risk/share ₹20 → Quantity ≈ 500 shares.
*(The indicator uses the "Account Capital" input for this illustration; the
strategy uses your live, compounding `strategy.equity` instead — see §19.)*

### Overtrading & Daily Loss Protection
Configurable, conservative by default: max trades/day (3), cooldown bars
after a loss (5), max consecutive losses/day (2), max daily loss (2%). In
the **indicator** these are tracked against a single simulated "what-if"
trade (informational only — clearly labelled as simulated). In the
**strategy** they are enforced against your real, compounding equity and
real `strategy.closedtrades` history, and will genuinely block new entries
once triggered, showing *"Daily risk limit reached — no new trades."*

### Trailing / Breakeven / Partial Exits (strategy only)
- **Breakeven**: once open profit reaches the configured R (default 1R),
  the stop is moved to entry (never loosened afterwards).
- **Trailing**: activates after a configurable R (default 2R); choose
  ATR / EMA / Structure trailing, or turn it off. The stop only ever
  ratchets in your favour, never against you.
- **Partial exits**: by default, a configurable % (default 50%) exits at
  Target 1, the remainder rides toward Target 2 (or the trailing stop,
  whichever comes first) — using the *same* Target 1/2 levels the dashboard
  displays, so the backtest matches what the indicator showed.

---

## 15. Confidence Score ≠ Win Probability (please read)

An 85/100 "HIGH CONVICTION" read means **more independent technical
conditions agreed**, based on the weights you configured. It does **not**
mean an 85% chance of the trade working, and it is not calibrated against
any historical win-rate. The dashboard and every alert message reiterate
this. Please do not size a position based on the score value itself — size
it based on the Position Size Calculator in §14, which is based on your
actual risk percentage and stop distance.

---

## 16. Non-Repainting & Real-Time Behaviour

**What "confirmed" means here.** Every score, structure/liquidity/FVG event
and BUY/SELL decision is computed every tick (so you can watch it develop),
but is only **latched** into the dashboard/alerts at `barstate.isconfirmed`
— i.e. the moment the bar actually closes — unless you explicitly enable
**"Show Live/Unconfirmed Signals"** (off by default). With it off, what you
see is frozen at the last confirmed bar's read until the next bar closes;
with it on, you may see the score/label change intrabar as new ticks arrive.
Neither mode ever rewrites a value that was already printed on a *closed*
historical bar — that would be true repainting, and this script does not do
it.

**Higher-timeframe data** is fetched with `request.security(..., src[1],
lookahead = barmerge.lookahead_on)` — the well-documented PineCoders
technique for retrieving the value of the **last fully closed** HTF bar,
consistently, in both historical replay and live trading. Daily/weekly
levels (PDH/PDL/PWH/PWL, gap open/close) use plain `[1]` offsets with
`lookahead_off`, which is simplest and correct because they always reference
an already-closed prior bar.

**Swing pivots** (`ta.pivothigh`/`ta.pivotlow`) only confirm a pivot after
the configured number of *right-side* bars have printed — meaning the very
latest swing point on your chart is always at least `Swing Sensitivity` bars
old by construction. This lag is inherent to any non-repainting pivot
detector and is not a bug.

**What this script does not claim:** it does not claim "100% non-repainting"
in the sense that nothing ever changes before a bar closes — of course it
does, that is simply what a live, forming candle is. What it claims, and
delivers, is that nothing changes **after** a bar has closed, and that
higher-timeframe reads never leak information from a bar that hasn't
happened yet.

---

## 17. Alert Setup Instructions

1. Add the indicator (or strategy) to your chart with the settings you want.
2. Click **Alert** (clock icon) → **Condition** → select this script.
3. You have two options:
   - **Any alert() function call** — recommended. This fires the fully
     dynamic, multi-line message (symbol, mode, direction, entry, stop,
     targets, R:R, score, regime, RVOL, liquidity, pattern, HTF bias, status)
     built by the script, plus the JSON payload described in §18. This is
     how `BUY SETUP`, `SELL SETUP`, `STRONG BUY/SELL`,
     `HIGH-CONVICTION BUY/SELL`, `LIQUIDITY SWEEP`, `MSS`, `BULLISH/BEARISH
     FVG`, `BREAKOUT`/`BREAKDOWN`, `ORB BREAKOUT/BREAKDOWN`, `VWAP
     RECLAIM/REJECTION`, `VOLUME SPIKE`, `TARGET/STOP HIT` (indicator) and
     `NO-TRADE CONDITION` are all delivered.
   - **A specific named condition** (e.g. "BUY SETUP", "HIGH-CONVICTION
     SELL", "NO-TRADE CONDITION") — a smaller, fixed set exposed as classic
     `alertcondition()` triggers for users who prefer the simple dropdown
     over "Any alert() function call."
4. Set **Alert actions** (webhook URL / app / email / pop-up) as needed.
5. **Alert priority** (Part 59 of the brief): treat Level 1 (informational —
   liquidity sweep, FVG formed, volume spike) and Level 2 (potential setup —
   raw breakout, MSS alone) as *awareness* alerts. Only Level 3 (`BUY/SELL
   SETUP`, confirmed) and Level 4 (`STRONG`/`HIGH-CONVICTION`) are intended
   as actual trading triggers.
6. Alerts respect the **"Enable Alert Firing"** master switch and are gated
   to confirmed bars only — they will not fire repeatedly intrabar.

## 18. Webhook JSON Payload Format

Every rich alert also includes a single-line JSON payload suitable for a
downstream webhook/automation bridge:

```json
{"symbol":"RELIANCE","exchange":"NSE","timeframe":"15","mode":"INTRADAY","signal":"BUY","signal_status":"CONFIRMED","score":82,"entry":1402.50,"stop_loss":1389.20,"target_1":1429.10,"target_2":1442.40,"risk_reward":2.8,"volume_ratio":1.8,"market_regime":"STRONG BULLISH TREND","htf_bias":"BULLISH"}
```

**Pine Script does not execute broker orders.** This JSON is designed to be
consumed by a separate execution bridge you control (a webhook receiver, a
serverless function, a broker API integration). Treat the boundary as:

```
Analysis Engine → Signal Engine → Alert Engine  (all inside this Pine script)
        ↓
   structured JSON alert
        ↓
[[ YOUR webhook / execution bridge — outside this script ]]
        ↓
   broker order (only if YOU build and authorise this layer)
```

Never assume an order has been placed just because an alert fired — confirm
fills through your broker/execution layer.

## 19. Backtesting Instructions

1. Add `IndianMarketSystem_Strategy.pine` to the chart you want to test
   (same symbol/timeframe conventions as the indicator).
2. Open **Strategy Tester** (bottom panel) → **Overview** for the native
   TradingView metrics (Net Profit, Max Drawdown, Total Trades, Percent
   Profitable, Profit Factor) and **List of Trades** for a per-trade
   breakdown.
3. This script additionally draws its **own** stats table (bottom-right by
   default) with figures the native tester doesn't show natively: **Avg R
   multiple (expectancy in R)**, a **Sharpe-like** ratio (mean R ÷ stdev of
   R — explicitly *not* a textbook annualised Sharpe ratio, just a
   same-units dispersion measure you can use to compare parameter sets),
   a **Sortino-like** ratio (mean R ÷ downside-deviation of R), **long vs
   short trade counts and win-rates**, and **largest win/loss**.
4. **Backtest Window Start/End** (Backtest Engine group) let you separate
   development, validation, and out-of-sample periods without touching any
   other setting — see §20.
5. **Position sizing** in the strategy is driven by your live, compounding
   `strategy.equity`, your **Max Risk per Trade (%)**, and the *same*
   stop-distance math the indicator displays — not a separate, static number.
6. **Commission, slippage, initial capital and per-trade risk %** are all
   configurable inputs (Backtest Engine / Position Size Calculator groups).
   Indian brokerage/STT/stamp-duty/exchange charges vary a lot by segment
   (equity delivery vs. intraday vs. F&O) — the default 0.03% commission is
   a starting point, not a claim about any specific broker.
7. This is a **bar-close, simulated-stop/limit** backtest (standard for
   Pine Script), not a tick-level order-book replay. `calc_on_order_fills`
   is enabled so trailing/partial exits react within the same bar a fill
   occurs, which is more realistic than waiting a full extra bar, but it is
   still not equivalent to real intrabar execution — expect some difference
   from live fills, especially on gaps and in illiquid names.
8. The strategy enforces the **same** session/overtrading/liquidity/R:R
   gates as the indicator, using real equity and real trade history instead
   of the indicator's single simulated "what-if" position (see the note at
   the top of the strategy file, and the summary table below).

### Why the Indicator and Strategy Aren't Byte-Identical
Sections 1–25 (the actual *signal engine* — regime, structure, liquidity,
FVG, volume, momentum, scoring, entry/stop/target math) are line-for-line
identical between the two files. What legitimately differs:

| Concern | Indicator | Strategy |
|---|---|---|
| Position sizing (Section 26) | Static "Account Capital" input, illustrative | Live, compounding `strategy.equity` |
| Overtrading limits | Simulated, informational | Enforced against real equity/trades |
| Duplicate-signal check | Based on a simulated open position | Based on `strategy.position_size` |
| Trade tracking | One hypothetical trade at a time, on-chart | Real `strategy.entry`/`strategy.exit` orders, commission, slippage |
| Trailing / breakeven / partials | Not modelled (out of scope for a chart overlay) | Fully modelled |
| Performance stats | None (that's what the strategy is for) | Custom R-multiple/expectancy table + native Strategy Tester |

This mirrors Part 65 of the specification: Analysis Engine, Signal Engine,
Strategy/Backtest Engine and Alert Engine are meant to be distinct layers —
"what the indicator shows" and "what the strategy tests" use the *same
rules*, with appropriately different, and appropriately real, execution
bookkeeping.

## 20. Robustness & Walk-Forward Testing

This system was **not** curve-fit to one stock's historical chart, and you
should not let it become curve-fit in your hands either:

- Test across **large-cap, mid-cap, and index** charts, not just one name.
- Test across **bull, bear, and sideways** stretches of history, and across
  **high-** and **low-volatility** periods — the Market Regime dashboard
  field tells you which you're looking at.
- Test across **multiple timeframes** within the recommended ranges for
  each mode (§3).
- Use the **Backtest Window Start/End** inputs to separate:
  - a **development** window (where you're allowed to look at results and
    adjust settings),
  - a **validation** window (settings frozen; you're checking, not tuning),
  - and a genuinely **out-of-sample** window (data your settings never saw
    at all until the final check).
- Treat a great backtest number on one instrument/period as a hypothesis to
  re-test elsewhere, not as proof. **Historical performance does not
  guarantee future performance** — full stop.

## 21. Beginner vs. Advanced Mode

**Beginner** (default) shows only: Mode, Timeframe guidance, HTF Bias,
Market Regime, Signal Quality, structural Bias, the SIGNAL itself, and — if
a trade is proposed — Entry/Stop/Targets/R:R/Position size/Pattern/Status,
or — if not — a plain-English Reason. No RSI/MACD/ATR/FVG/MSS/VWAP/RVOL
jargon is required to use it.

**Advanced** adds RVOL, ATR/ATR%, ADX, VWAP relation, Liquidity status,
Liquidity Shift stage, FVG, Momentum, Volume divergence, Gap, Opening Range
status, and the Extension read — for users who want to see the mechanics
behind the conclusion.

## 22. Known Limitations (Read Honestly)

- **Classic chart patterns** (double top/bottom, head & shoulders, triangles,
  flags, rectangles) are detected with conservative, pivot-based heuristics
  reusing the same swing-pivot data as the Market Structure engine. They are
  intentionally cautious — *"PATTERN: NONE"* is the default and by far the
  most common output. Treat any detected classic pattern as a supporting
  observation, not a standalone signal; this is the least rigorously
  standardised part of technical analysis and the most approximate part of
  this build. Cup & Handle is deliberately **not** implemented — a reliable,
  honest heuristic for it (as opposed to an inventive one) was judged out of
  scope.
- **The liquidity filter is a volume-based proxy**, not real market-depth or
  order-book data — Pine Script has no access to Level 2 data. A thinly
  traded stock with visually adequate volume can still have poor real-world
  fills.
- **The R-multiple/Sharpe-like/Sortino-like statistics assume the
  conservative default of one position at a time** (no pyramiding). If you
  modify the code to stack entries, extend the R-multiple bookkeeping in
  Section 30 of the strategy accordingly.
- **Position sizing assumes whole-share quantities** and NSE/BSE-style cash
  equities; it was not built with F&O lot-size rounding in mind.
- **This backtest is bar-close/simulated-fill, not tick-level.** Expect
  some difference between backtest and live fills, especially around gaps.

---

*Built as a disciplined, evidence-gated system: the most important output is
not BUY or SELL — it is "trade only when the evidence is strong enough,"
and to say NO TRADE, clearly and often, when it isn't.*

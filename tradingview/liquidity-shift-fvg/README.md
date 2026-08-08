# Liquidity Shift + FVG [ICT/SMC]

A Pine Script v6 TradingView indicator that identifies **Fair Value Gaps (FVGs) formed in the
context of a liquidity event** — a swept swing high/low, equal highs/lows, or a prior
day/week/session extreme — followed by a Market Structure Shift (MSS) and displacement. It does
**not** mark every 3-candle imbalance; it scores each FVG 0–100 on how strongly it is tied to that
liquidity context and classifies it accordingly.

File: [`Liquidity_Shift_FVG.pine`](./Liquidity_Shift_FVG.pine)

---

## A. What's in the script

One self-contained file, no imports, organized top-to-bottom exactly as the logic pipeline runs:

1. Inputs (groups A–J) and user-defined types (`FVG`, `LiqLevel`, `Sequence`)
2. Global state + generic helpers (formatting, pruning, quality labels)
3. Displacement detection, swing-based liquidity pools, day/week/session extremes
4. Liquidity sweep detection + classification, Market Structure Shift, liquidity-shift sequencing
5. Current-timeframe FVG detection, scoring, classification, drawing
6. FVG mitigation / invalidation tracking
7. Higher-timeframe FVGs, Premium/Discount range, target liquidity, entry-zone annotations
8. Dashboard + 13 alert conditions

Compiles under `//@version=6`, `overlay=true`, with `max_boxes_count`, `max_lines_count` and
`max_labels_count` all set to 500. Every drawing-object category (FVG boxes/labels/midlines,
liquidity levels, sweep/MSS/displacement markers, setup annotations) is stored in an array or a
single reusable slot and explicitly pruned — nothing grows without bound, even on a multi-year
intraday history.

---

## B. The liquidity-shift methodology

The core pipeline the script looks for is:

```
LIQUIDITY  →  LIQUIDITY SWEEP  →  STRUCTURE SHIFT (MSS)  →  DISPLACEMENT  →  FVG  →  RETEST
```

**1. Liquidity** — resting orders cluster at obvious reference points: swing highs/lows, equal
highs/lows (multiple touches at the same level), and previous day/week/session
highs/lows. The script tracks these as **buy-side liquidity** (above price, from highs) and
**sell-side liquidity** (below price, from lows), each built independently from the chart's own
bars (the daily/weekly/session levels use no `request.security()` call at all — they're rolled
forward from `high`/`low` and reset on `ta.change(time("D"))` / `time("W")` / `session.isfirstbar`,
so they're identical on every symbol and inherently non-repainting).

**2. Liquidity sweep** — a *sweep* is a wick through a level followed by a **confirmed-bar close
back on the other side** (reclaim). A close that stays beyond the level is logged as a **simple
break**, not a sweep — it does not feed the rest of the pipeline, because it represents
continuation, not a liquidity grab. Every sweep is classified by strength:

| Marker | Meaning |
|---|---|
| `SWEEP` | Wick through + reclaim, no other confirmation yet |
| `SWEEP + REJ` | Reclaim with a strong close-location-value (configurable threshold) |
| `SWEEP + DISP` | A displacement candle occurred at/around the sweep |
| `SWEEP + MSS` | Structure has also broken — the marker text upgrades in place when this happens |

**3. Structure Shift (MSS)** — once a sweep is registered, the script snapshots the most recent
*opposing* structural swing (the swing high before a sell-side sweep, or the swing low before a
buy-side sweep) and watches for a **confirmed close** beyond it, within a configurable window
(`Max bars after sweep for MSS to confirm`). Breaking that snapshot — not a swing that forms later
— is what makes this an MSS rather than an ordinary break of structure: the level being broken had
to already exist at the time liquidity was taken.

**4. Displacement** — a strong, decisive candle (by ATR multiple, body %, or both, optionally with
volume and consecutive-candle confirmation) that actually creates the imbalance between candle 1
and candle 3 of the FVG.

**5. FVG** — standard 3-candle definition (see section C), but every FVG carries flags for whether
a sweep/MSS/displacement happened immediately before it formed.

**6. Retest** — tracked continuously after formation (see Mitigation, below).

A **Liquidity Shift** / **Liquidity-Driven FVG** is the case where all of steps 1–5 line up: sweep
→ MSS → displacement → FVG, in that order, within the configured windows. This is the highest
classification tier and the only case where the compact "SELL-SIDE LIQUIDITY SWEPT → BULLISH MSS →
BULLISH DISPLACEMENT → BULLISH FVG" chain (or the bearish mirror) appears — it's shown in the FVG
label's tooltip rather than as a separate on-chart object, to keep the chart uncluttered.

---

## C. How the FVG quality score (0–100) is calculated

Every FVG is scored using seven independent, configurable-weight criteria (Settings group **G**):

| Criterion | Default weight | What it checks |
|---|---|---|
| Liquidity sweep before FVG | 20 | A sweep sequence was active when the FVG formed |
| MSS before FVG | 20 | That sequence had also confirmed a Market Structure Shift |
| Strong displacement | 20 | The FVG's middle candle qualifies as a displacement candle |
| HTF alignment | 15 | Higher-timeframe close is above (bullish) / below (bearish) its EMA |
| Strong relative size | 10 | Gap size ≥ a configurable ATR multiple |
| Near important liquidity | 10 | The gap's midpoint sits within a configurable ATR distance of a tracked liquidity level |
| Volume confirmation | 5 | The middle candle's volume exceeds its average by a configurable multiple |

The weights sum to 100 by default; the script clamps the total at 100 regardless of how the
weights are edited. Score → classification:

- **80–100 → VERY HIGH QUALITY**
- **65–79 → HIGH QUALITY**
- **50–64 → MEDIUM QUALITY**
- **below 50 → LOW QUALITY**

(thresholds are inputs, not hard-coded). Independently of the numeric score, every FVG also gets a
**type classification**, most-important first:

1. **Liquidity-Driven FVG** — sweep *and* MSS *and* displacement all present (the full chain)
2. **MSS FVG** — formed after a confirmed structure shift, without the full chain
3. **Displacement FVG** — formed by a qualifying displacement candle, without a preceding MSS
4. **High-Probability FVG** — no single dominant reason, but the score still clears the "High
   Quality" bar on the strength of several smaller factors (HTF alignment, size, proximity to
   liquidity, volume)
5. **Standard FVG** — a plain imbalance with none of the above

Premium/Discount alignment (section 16 of the spec) is deliberately **not** part of the 0–100
score — it's a separate optional display filter (Settings group A: *Prefer FVGs aligned with
Premium/Discount*) that hides bullish FVGs sitting above the equilibrium band and bearish FVGs
sitting below it, so it doesn't double up with the scoring model.

---

## D. Settings reference

**A. General** — `Show real-time developing FVG` toggles the dashed, unconfirmed preview (see
Section 19 in the code header on non-repainting); `Max active FVGs / historical FVGs / liquidity
levels` are the object-count caps that keep the script fast on long histories; `Prefer FVGs
aligned with Premium/Discount` + its range lookback / equilibrium band width control the optional
premium/discount display filter.

**B. Fair Value Gap Settings** — show/hide bullish or bearish FVGs independently; minimum gap size
(by ATR multiple and/or % of price) filters out negligible gaps; `Extend mitigated/invalidated
boxes by` controls how long a box's tail is drawn once it stops being active; the FVG midline
(consequent-encroachment / 50% level) can be toggled.

**C. Liquidity Settings** — swing sensitivity (bars left/right) for the swing-based liquidity
pools; independent toggles for swing highs/lows, equal highs/lows (with an ATR-based tolerance),
previous day/week/session highs and lows.

**D. Market Structure Shift** — a *separate* swing sensitivity for the structural swing MSS must
break (deliberately independent from the liquidity-pool sensitivity in group C); the MSS
confirmation window and the overall sequence-expiry window (how long a sweep stays "live" waiting
for an MSS before it's discarded); the rejection-strength threshold used for the `SWEEP + REJ`
classification.

**E. Displacement Settings** — method (ATR multiple / body % / either), the ATR length and
multiple (0.5–2.5x are the typical range called out in the brief), minimum body %, how many
consecutive same-direction candles are required, and optional volume confirmation with its own
multiple/average length.

**F. Multi-Timeframe Analysis** — a single HTF mode (`OFF` / `15m` / `30m` / `1H` / `4H` / `1D` /
`Custom`) used both for higher-timeframe FVGs and the HTF bias used in scoring; a custom timeframe
input for when mode = Custom; a toggle to draw HTF FVGs; the EMA length used to derive HTF bias.

**G. Quality Score** — the seven weights described in section C, the relative-size and
near-liquidity ATR thresholds, the three quality-tier cutoffs, and a minimum score below which an
FVG isn't displayed at all.

**H. Mitigation & Invalidation** — which milestone counts as "mitigated" for display/dashboard
purposes (First Touch / 50% Fill / Full Fill — all three are still tracked and alertable
regardless of this choice); whether a confirmed close through the *far* boundary invalidates the
FVG; the historical display filter (Keep All / Hide Mitigated / Hide Invalidated / Active Only);
an optional auto-hide timer after mitigation.

**I. Alerts** — the minimum score required for a "High-Quality Setup" alert.

**J. Visual Settings** — per-category show/hide toggles (FVGs, liquidity, sweeps, MSS,
displacement, premium/discount, targets, score label, mitigation status, dashboard + its corner),
and the five colors used throughout (bullish FVG, bearish FVG, HTF FVG, buy-side liquidity,
sell-side liquidity — note buy-side/sell-side colors double as the bullish/bearish sweep-and-MSS
marker colors, since a sell-side sweep is a bullish-implication event and vice versa).

---

## E. Adding it to TradingView

1. Open any chart on [tradingview.com](https://www.tradingview.com), open **Pine Editor** (bottom
   panel), click **Open** → **New blank indicator** (or just clear the default template).
2. Copy the entire contents of `Liquidity_Shift_FVG.pine` and paste it in, replacing everything.
3. Click **Add to Chart**. Open the gear icon on the indicator's name to reach the Inputs/Style
   tabs and the settings groups A–J described above.
4. To set an alert: **Alert** → **Condition** → select **"Liquidity Shift + FVG [ICT/SMC]"**, then
   either pick one of the 13 named conditions (e.g. *"Bullish MSS"*) for a simple templated
   message, or pick **"Any alert() function call"** to receive the fully dynamic message (symbol,
   timeframe, direction, price range, score, liquidity/MSS/displacement status) for every event
   type in one alert.
5. Works on any symbol and timeframe (stocks, indices, FX, commodities, crypto) since nothing in
   the core detection logic is instrument-specific; disable *Require volume confirmation* on
   symbols without reliable volume (many FX/CFD feeds).

---

## F. How to read it

**Bullish setup.** Price wicks below a tracked sell-side level and closes back above it (`SWEEP`
marker, colored with the sell-side liquidity color). Within the MSS window, price closes back
above the swing high that existed at the time of the sweep (`BULLISH MSS` label; the sweep marker
upgrades to `SWEEP + MSS`). A bullish FVG then forms during/after the move. If its middle candle
also clears the displacement threshold, it's classified **Liquidity-Driven FVG**, scores highly,
and (above the alert-quality threshold) gets a `BULLISH FVG SETUP` annotation with a target
(nearest untouched buy-side liquidity) and an SL reference (just beyond the sweep's low). This is
the "high-quality liquidity-driven FVG" scenario end to end.

**Bearish setup** is the exact mirror: buy-side liquidity swept → `BEARISH MSS` → bearish
displacement → bearish FVG → `BEARISH FVG SETUP` with a downside target and an SL reference just
beyond the sweep's high.

**Liquidity sweep without FVG.** A `SWEEP` (or `SWEEP + REJ` / `SWEEP + DISP`) marker can appear
with no FVG anywhere nearby — price took the liquidity but never left a 3-candle imbalance, or the
imbalance that did form was too small to pass the minimum-size filters. That's expected: not every
liquidity event produces a tradable gap, and the indicator does not force one to appear.

**FVG without liquidity sweep.** A plain gap with no sweep/MSS context still gets a box (if
`Show bullish/bearish FVGs` is on and it's above the minimum score to display), but its tooltip
will show `Standard FVG`, `Liquidity swept before: No`, `MSS before: No`, and a correspondingly low
score — this is exactly the "basic 3-candle imbalance" the brief asked *not* to treat the same as a
liquidity-driven one, and the score/classification make that distinction explicit rather than
implicit.

**Mitigation.** Hover any FVG for its live status (`Fresh` / `Partial` / `Filled` / `Invalid`).
The compact on-chart text is just direction + score + status (e.g. `B 78 Partial`); everything else
— size, %, timeframe, all four context flags, full status — is in the tooltip.

---

## G. Limitations — read before using this for anything real

- **This is an analytical/context tool, not a signal generator.** It never prints "buy" or "sell";
  the strongest label it produces is `BULLISH/BEARISH FVG SETUP`, explicitly annotated in the code
  and in its own tooltip as analytical context, not a guaranteed outcome.
- **Non-repainting, but not zero-latency.** Every FVG, sweep, MSS and mitigation event is only
  finalized on `barstate.isconfirmed` — the current, still-forming bar only ever shows an optional
  dashed *preview* that can disappear or change before it closes. That is a deliberate trade-off
  for reliability: nothing you see confirmed on a closed bar will later move or vanish, but you
  will always be at least one bar "behind" the most aggressive interpretation of live price action.
- **Pivot-based swing detection is inherently lagging.** A swing high/low is only known
  `left/right`-bars sensitivity bars after it happened — by construction, not a bug — so both the
  liquidity pools and the MSS structure reference always reflect what was knowable *after* the
  fact, never a same-bar judgment call.
- **Scoring is a heuristic, not a statistically validated edge.** The weights in Settings group G
  encode one reasonable reading of ICT/SMC concepts; they are not fit to any dataset, and a
  different market, timeframe, or session can easily warrant different weights or thresholds.
  Treat the 0–100 number as a consistent way to *rank and compare* the FVGs the script finds on one
  chart, not as a probability of anything.
- **Higher-timeframe and volume features depend on data availability.** HTF alignment silently
  contributes nothing when the selected HTF resolves to an invalid/lower timeframe than the chart;
  volume confirmation contributes nothing on feeds with no real volume. Both fail *safe* (score
  simply doesn't get the bonus) rather than erroring, but that also means the score can look lower
  than expected on instruments where those data sources are absent.
- **Object caps mean very old history can quietly drop from view.** With the default settings the
  last ~80 FVGs and ~15 liquidity levels per side are kept; raise the caps in Settings group A if
  you need a longer visible history, but doing so uses more of TradingView's 500-object-per-type
  budget (still bounded — see Section A above — but less headroom).
- **No backtest, no performance claim, no risk management.** The SL/target annotations are
  reference lines derived from the same sweep and liquidity data the script already tracks, not a
  position-sizing or risk-management system. Always combine this with your own analysis, other
  confirmation, and a defined risk process before acting on anything it shows.

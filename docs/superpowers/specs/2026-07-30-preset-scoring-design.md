> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Presets get their own scoring function — Easy

**Date:** 2026-07-30
**Status:** Approved design, pending an implementation plan
**Size:** Medium — a new `score.ts` owning the pipeline, `presets.ts` loses two Easy bounds and
gains a sort key, `ViewState` gains one boolean, and the table gains a column plus a per-term
breakdown. Tempo and Race are **not** designed here.

## 1. What is actually wrong

Easy sorts by `score desc` — RunRepeat's editorial 0–100. Two problems, and only the second is
the one that matters.

**The known one: the score drifts.** Median by release year runs 2023 → **80**, 2024 → 81,
2025 → 83, 2026 → **85**; `spearman(year, score) = 0.31`. Of 179 superseded models, 137 score
below their successor and only 27 above.

But drift alone is not an argument, because **shoes genuinely improve** — a rising score is the
expected shape, and nothing in the data separates improvement from inflation.

**The real one: the score is the wrong question.** The top 30 of the fleet by RunRepeat score is
**53% `competition`-labelled against a 14% fleet base rate.** Sorting Easy by it pulls race-day
shoes to the top of a list about accumulating weekly mileage. That is true regardless of drift,
and it is what this design fixes.

The fix also disposes of the drift question rather than solving it: **a function reading only lab
measurements is time-blind by construction.** A 2024 shoe posting 2026-grade numbers ranks with
2026 shoes, so "is the drift real?" never has to be answered.

## 2. The base premise: a three-year horizon

Two overlapping buyers — *latest and greatest*, and *great value* (often but not only last-gen).
**Both shop inside roughly three years.** This is the premise the data work rests on, not a filter
in any preset.

It is why a metric's viability is judged by **coverage since 2024-01-01** rather than fleet-wide:
coverage in this repo is era-shaped, so a fleet-wide figure understates an arriving metric and
flatters a retiring one. Shock absorption reads 85% fleet-wide but **94% over the window**;
outsole durability 86% against **100%**.

docs/shoe-stories.md currently states the horizon nowhere while forbidding date filters on its
strength. §12 records the correction.

## 3. The pipeline

Four stages, each doing exactly one job. The separation is the design.

| stage | job | why it exists |
|---|---|---|
| 1. **physical map** | raw reading → 0–1, **linear in goodness**, true zero preserved | what the measurement *means*. Reaching for percentiles by default hides this |
| 2. **divide by that term's sd** | equalise spread across terms | without it, weights control nothing (§5) |
| 3. **weight** | how much we care | editorial, and now actually effective |
| 4. **rescale total to 0–100** | display | cosmetic; ranking is fixed by stage 3 |

Stage 2 divides **without centring**, so the true zero survives and the differing means add a
constant to every shoe — which cannot change an ordering.

## 4. Easy's terms

The session is 5–7 h/week at conversational pace, often on tired legs, on consecutive days. Peak
force per step is *lower* than at speed but weekly impulse is far higher, so the shoe's job is
**repetition tolerance**, not performance.

| term | mechanism | weight | 2024+ cov |
|---|---|---|---|
| shock absorption | attenuate repeated impact | **2** | 94% |
| outsole durability | cost per mile | **1** | 100% |
| energy return | free efficiency; not the point of the session | **1** | 93% |
| *midsole width / stack* | stability on fatigued legs — **opt-in** | *1* | 100% |
| *heel counter stiffness* | stability on fatigued legs — **opt-in** | *1* | 100% |

### The mappings, and why each is not a percentile

- **Shock absorption → `SA / 200`.** A ratio scale with a credible true zero: forcing a fit
  through the origin gives **≈3.6 SA per mm of stack**, which predicts the barefoot shoes closely
  (Vapor Glove, 7.6 mm → 27.4 predicted vs 23.6 actual; Vibram, 7.8 mm → 28.1 vs 26.1). So 0 SA ≈
  bare ground. **Linear, no cap** — the one argument for bending it was instability at extreme
  stack, and stability is now its own opt-in term, so this curve no longer carries a hidden penalty.
- **Energy return → `ER / 100`.** Already a true percentage (`type=percent`, observed 39.3–80.6).
  The term only ever uses the top 60% of its scale, which is *correct*: a shoe returning 40% is
  returning 40%.
- **Outsole durability → `min(1, (thickness / wear) / L_OK)`.** Wear is Dremel depth in mm and
  `outsole-thickness` has 99% coverage, so `thickness / wear` is Dremel-units-until-through — a
  real proxy for outsole life. Goodness is therefore **reciprocal, not negated**: a shoe wearing
  half as fast lasts twice as long. And because the outsole is rarely what retires a shoe (the
  midsole packing out is, and **that is unmeasured**), the term is capped: past `L_OK` the outsole
  is not the binding constraint. **The saturation falls out of the physics rather than from a bent
  curve.**
- **Midsole width → `min(1, (width / stack) / cap)`.** Stability is a lever from foot to ground, so
  the dimensionless ratio is the physical quantity. It also removes a confound: `rho(ratio, weight)
  = 0.15` against `rho(raw width, weight) = 0.56`, so "stability" stops covertly selecting heavy
  shoes. Capped because the top end is degenerate — Vapor Glove scores 10.13, and a flat sandal
  genuinely *is* stable. The cap is **the p90 of that side's own ratio distribution across the pool**
  (heel 3.04, forefoot 5.37), so the minimalist tail caps out while the real fleet stays spread. It
  must be per side: the two halves are not on one scale (docs/shoe-stories.md §Which half a story
  uses).
- **Heel counter stiffness → `(x − 1) / 4`.** Five integer buckets (counts 62/87/153/91/51).
  Percentiles here would invent resolution the measurement does not have.

### Constants: only one is load-bearing

`SA_REF = 200` and energy return's `/100` are **uncapped linear factors, so stage 2 cancels them
entirely** — they set the displayed term and never the ranking. Pick them for readability.

**`L_OK = 3.0` is the only number that changes an ordering**, because its cap is the whole point.
At 3.0, 206 of 283 shoes tie at full marks, matching "the outsole is rarely what retires the
shoe"; at 4.0 only 130 do, which reads as a gradient the mechanism denies. Sensitivity is mild —
sweeping 1.5→4.0 moves the Novablast 5 between #41 and #32.

## 5. Why stage 2 is not optional

Without it, a term's influence is set by its **standard deviation on the mapped scale**, not by its
weight. Measured across the Easy pool at nominal weights 50/25/25:

| transform | shock absorb | outsole dur | energy return | heel counter *(stab. on)* |
|---|---|---|---|---|
| physical map alone | 39% | **45%** | 16% | **33%** |
| min-max | 41% | 26% | **33%** | 29% |
| **divide by sd** | **50%** | **25%** | **25%** | 17% |
| rank | 50% | 25% | 25% | 16% |

Left alone, outsole durability at weight 1 outweighs shock absorption at weight 2, and heel counter
stiffness — five subjective buckets — becomes the single most influential term in the function. The
coarsest metric wins *because* it is coarse.

**Min-max does not fix this.** It and `÷sd` are both linear and neither reshapes the distribution;
they differ only in what they set to 1 — min-max the **range**, `÷sd` the **spread**. Influence
comes from spread. Min-max is also fragile: 80% of shoes sit between 0.58 and 0.83 of the min-max
shock-absorption scale, the rest held open by one barefoot outlier, so a new extreme shoe moves
every score.

**Rank works equally well and was rejected**, because it discards magnitude — the gap between 1st
and 2nd becomes the gap between 200th and 201st, throwing away exactly what the stage-1 mappings
exist to capture.

Verified on final scores: nominal 50/25/25 → effective **51/25/25**; with stability on, nominal
33/17/17/17/17 → effective **34/16/17/17/16**.

## 6. Missing readings: all-terms-required, N/A ranks last

A shoe missing any weighted term **is not scored** and sorts below every scored shoe. No
imputation, no shrinkage, no renormalising over present terms.

Renormalising was tried and is wrong: fewer measurements means less regression to the mean, so
sparse shoes take over both ends. Under it, Brooks Adrenaline GTS 22 ranked **#1 on a single
measured term**.

This also removes any need for a date filter. Of 95 unscoreable shoes in the pool, **75 are
pre-2024 or undated and only 20 are 2024+** — the rule self-selects the horizon without naming it,
so docs/shoe-stories.md's no-date-filter rule survives on better grounds than it had.

## 7. The stability toggle

One boolean. On, it adds both stability terms at weight 1 each.

It is cheap because **the opt-in metrics are the three best-covered in the fleet**, so toggling
cannot change eligibility: **283 shoes scoreable either way.** Under all-terms-required that is the
property that makes it safe.

It works: only **3 of the top 10** survive the toggle, median shift **25 places** across 283 shoes.
On, it surfaces Hurricane 25, Triumph 23, 1080 v13 and v15, Ride 19, Ghost 17, Supernova Rise —
stability-flavoured daily trainers, unprompted. The biggest movers are mechanistically coherent in
both directions: Fresh Foam X Evoz v4 gains 130 places and Cloudrunner 2 gains 102, while the
tall-narrow speed trainers fall — Mach X 2 from 25th to 189th, Sonicblast from 50th to 209th,
Adizero Boston 12 from 87th to 220th.

**Honest caveat for the receipt:** midsole width correlates 0.56 with weight and heel counter
stiffness 0.44, so turning stability on selects heavier shoes. Defensible — that is what stable
trainers are — but say it rather than surprise someone.

### The general metric picker is rejected

Letting the user select *any* metric fails for reasons that are not effort:

1. Most metrics have **no defensible direction**, so selecting one asserts a better end — the
   unsolved problem in BACKLOG.md item 3.
2. Swapping a well-covered term for a thin one **does** move the eligible set, so list length and
   composition would shift confusingly. The stability pair is the lucky exception.
3. 2^N score variants to serialise, test and explain — for what is **one real preference**.

## 8. Terms considered and rejected

| term | why not |
|---|---|
| **flexibility-stiffness** | `rho(stiffness, heel stack) = +0.58` in the pool, so rewarding flexibility pulls **against** the shock-absorption term rather than adding to it. Its flexible end is exactly the minimalist shoes the design rejects (Vibram 0.8 N/SA 26, Xero Prio 4.0 N/SA 25). Bending stiffness scales with midsole thickness, so it measures how thick the shoe is, not whether foam responds at low load. The stiff tail it was meant to catch is carbon-plated and already excluded. Its removal is why the base weights are 2:1:1 rather than the 3:2:1:1 first proposed |
| **midsole softness** | redundant with shock absorption (`rho = −0.49`), which measures the outcome rather than the material cause. Also the worse-covered lineage pair (83% retiring / 51% arriving) |
| **torsional rigidity** | the only metric in the set whose coverage **decays going forward**: retired method 88% over the window but falling (37/72 in 2026), replacement at 42% and not yet arrived. Midsole width and heel counter stiffness cover the same mechanism at ~100% |
| **price** | excluded by intent — the user picks value within budget. Cheap to drop: it is the best single proxy for spec (`rho` 0.53 stack, 0.56 shock absorption), so it carries little the real metrics don't |
| **weight** | barely matters at easy pace, and the most cushioned durable trainers are heavy |
| **breathability, toebox, tongue padding** | breathability assumes a temperature, toebox is personal, tongue padding is not load-bearing. Fit, price and availability are the user's final filter; the tool's job is the candidate list |

**Two mechanisms we agreed matter and cannot measure: midsole/foam durability, and compliance at
low load.** Both should be stated in docs/shoe-stories.md rather than silently absent.

## 9. What Easy's view becomes

```
pool   = plate ≠ carbon
sort   = easyScore desc
```

- **Plate gate kept**, on precautionary injury-risk grounds — some research links carbon plates to
  higher injury risk, plausibly because unfamiliar stiffness and reduced toe-off bend shift calf
  loading. This is *separate* footing from any stiffness term, not a duplicate of one.
- **Stack floor dropped** (`EASY_STACK_PERCENTILE`): the score rewards cushioning directly through
  shock absorption, so a floor is redundant machinery.
- **Price cap dropped** (`PRICE_PERCENTILE` for Easy): it contradicts the premise that the runner
  judges value themselves. Tempo's cap is untouched here — Tempo is not designed yet.
- **Sides:** every side-bearing term reads the selected side, and per-side constants are computed
  per side. Weight has no sides and is not a term here.

## 10. Display, and why it comes first

The immediate purpose of shipping this is **an experimentation surface** — tweak the scoring and
see the fleet reorder at once. So the breakdown is not a nice-to-have:

- **A score column**, sortable, rendered like any numeric metric.
- **A per-term breakdown on row expansion**: raw reading → mapped term → weighted contribution,
  per term. This is what makes a surprising rank diagnosable rather than arguable. It answered
  "why is the Novablast 5 at #35?" in one table (§11).
- **Unscored shoes read as unscored**, never as 0.

### The scale is anchored once and then frozen

Stage 4 is `(weightedMean − r0) / (r100 − r0) × 100`, where **`r0` and `r100` are constants derived
from the fleet as of 2026-07-30 and then never recomputed**. Consequences, all intended:

- **Scores are comparable across time.** A shoe's score never moves because the catalogue grew.
- **Future scores exceed 100.** A shoe 10% better than the Vomero Premium on the weighted mean reads
  **118**. The scale records that shoes improve rather than hiding it by renormalising — which is the
  same premise as §2.
- **The sd divisors must be frozen too.** This is the part that is easy to miss: if stage 2 recomputes
  sd from the live fleet, every score shifts on refresh and the point of freezing `r100` is lost. All
  divisors are constants (§14).
- `r0` cannot be dropped in favour of the physical zero. Preserving true zeros through stage 2 leaves
  every shoe carrying a large common baseline, so an unanchored scale compresses the whole fleet into
  44–100 with a median of 82 — Vapor Glove, genuinely wrong for the session, would read 44. Anchoring
  both ends gives a median of 67 with quartiles at 59 and 75.
- Anchors are frozen **per (side, stability)** — four pairs. The toggle changes what the score means,
  so putting both states on one scale invites a comparison that isn't meaningful; with shared anchors
  the stability-on list would top out at 77.6 purely because the best shoe overall is not the most
  stable.

Because the anchors are today's observed min and max, **displayed scores are unchanged today** — the
freezing only takes effect on future refreshes.

## 11. Where it lands

283 scoreable of a 378 pool. Top 10, heel, stability off:

```
 1 Nike Vomero Premium      100.0   6 Nike Pegasus Premium      92.2
 2 ASICS Megablast           99.0   7 ASICS Superblast 3        92.0
 3 adidas Hyperboost Edge    95.7   8 ANTA Zone 2 90            91.7
 4 Mizuno Neo Vista 2        95.6   9 adidas Adizero EVO SL ATR 91.3
 5 Mizuno Neo Zen            95.3  10 adidas Adizero EVO SL     91.1
```

Stability on surfaces Frequenza 2, Vomero Premium, Hurricane 25, Triumph 23, Pegasus Premium,
Balos, 1080 v13.

The Novablast family: **5 at #35, 6 at #64, 4 at #90**, 3 unscoreable. The 5 beating the 6 despite
identical RunRepeat scores of 93 is the design working — it returns 63.6% energy against 55.4%.
Its #35 is a **fleet fact, not an artefact**: it ranks 59th of 283 on shock absorption and 53rd on
energy return, with its outsole term at full marks. Read as "strong, not exceptional", with the
value call left to the runner — which is what removing price commits us to.

**One-sided sanity check** (docs/shoe-stories.md §Checking a threshold set): 28/30 and 29/30 of the
top shoes carry `daily-running` against a 79% base rate. The `pace` fact must **never** be an
objective — divergence from it is the point of this project — so this checks only that we have not
*completely* disagreed.

## 12. Docs corrections required

| doc | change |
|---|---|
| docs/shoe-stories.md | state the **three-year horizon** premise, and re-ground the no-date-filter rule on §6 rather than on protecting last-gen buyers. Rewrite §Easy around the four terms and their mechanisms. Record the two unmeasurable mechanisms. Record `pace` as **one-sided** |
| docs/app.md | §Presets — Easy resolves to a sort not two bounds; new score column and breakdown; `ViewState` gains the stability boolean and it serialises |
| docs/decisions.md | new decision: **scores use fixed physical references, thresholds use live-fleet percentiles.** The existing market-relative convention is right for a *bound* ("as much stack as most of the fleet") and wrong for a *score*, where drift is a bug |
| `direction.ts` | Easy asserts directions on metrics marked `neutral`. Per-story direction is not fleet-wide direction — the score owns the former, `direction.ts` keeps the latter |
| BACKLOG.md | item 3 partly superseded; note the general metric picker as rejected with reasons |

## 13. Testing

- **Pipeline unit tests** per stage: mapping monotonicity and true zeros; `÷sd` leaves ordering
  unchanged; weights land within a tolerance of nominal effective influence (§5 is a regression
  test, not a one-off measurement).
- **All-terms-required**: a shoe missing one term is unscored, not zero, and sorts last.
- **Toggle invariant**: scoreable count is identical with stability on and off. This is the property
  the whole toggle rests on and it should fail the build if upstream coverage moves.
- **Per-side**: constants differ per side; no absolute number transfers between halves.
- **Frozen constants are asserted**, not recomputed. A test pins each one, so an upstream change that
  would silently move every score fails the build instead (the same reasoning as
  docs/operations.md §Contract-drift runbook).
- **No determinism gate needed**: the score is computed client-side (§14), so nothing enters `data/`
  and docs/scraping.md §Determinism does not apply.

## 14. Computed client-side

The score resolves in the app at render time, like today's percentile bounds — **not** precomputed
into `data/`. While the weights and constants are still moving, a dataset rebuild between every
experiment would defeat the purpose of shipping it (§10). Moving it to build time later is a
performance decision, not a correctness one.

### The frozen constant set

```
SA_REF            = 200      cosmetic — cancels at stage 2
L_OK              = 3.0      the only constant that changes an ordering
WID_CAP  heel     = 3.04     p90 of that side's width/stack ratio
         forefoot = 5.37

sd  (heel / forefoot)
  shock absorption       0.0896 / 0.0961
  outsole durability     0.1614 / 0.1614
  energy return          0.0758 / 0.0790
  midsole width/stack    0.0872 / 0.1133
  heel counter stiffness 0.2712 / 0.2712     (no sides)

anchors (r0, r100) per side per stability state — four pairs
  heel,     stability off   3.7277 / 8.4742
  heel,     stability on    4.3967 / 7.4117
  forefoot, stability off   3.7118 / 7.6761
  forefoot, stability on    3.9452 / 6.5653
```

Every figure above is derived from the fleet at `data/` commit `baed23b` (450 shoes, 378 after the
plate gate, 283 scoreable). Rederiving them is a deliberate act, not a refresh side effect.

## 15. Out of scope

Tempo and Race — same pipeline, different terms and weights, designed next. Foam durability and
low-load compliance are unmeasurable today. Price/value ranking waits on real pricing data
(BACKLOG.md item 13).

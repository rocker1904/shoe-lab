> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Tempo gets a score

**Date:** 2026-07-30
**Status:** Approved design, pending an implementation plan
**Size:** Small–medium — the pipeline, the plumbing and the toggle already exist for Easy
(docs/app.md §The Easy score). Tempo adds a second entry to `DERIVED_SIDE_PAIRS`, a second
constant set, and its own terms. Race is **not** designed here.

## 1. What this replaces

Tempo bounds weight at the fleet's 40th percentile, energy return at the 50th and price at the
80th, then sorts by energy return — 54 of 450 survive. docs/shoe-stories.md calls Tempo "the widest
of the three by intent", so the second-narrowest shortlist was already evidence against the
thresholds (BACKLOG.md item 1).

The same four-stage pipeline Easy uses replaces all of it: physical map → divide by frozen sd →
weight → rescale between frozen anchors. Everything structural is inherited — the three-year
horizon premise, all-terms-required with N/A ranking last, client-side computation, frozen
constants, and the `pace` fact as a **one-sided** check that is never an objective.

## 2. The pool: no carbon

Tempo excludes carbon, as Easy does. docs/shoe-stories.md currently says the opposite — "carbon is
deliberately left open" — and that is superseded by two independent reasons.

**The precautionary one**, which is the same line drawn for Easy: some research links carbon plates
to higher injury risk, plausibly through unfamiliar stiffness and reduced toe-off bend shifting calf
loading. A session run **two or three times a week** is more cumulative exposure than race day, not
less, so the argument applies here with more force rather than less.

**The structural one, which the data produced and I did not expect.** Measured against a pure speed
ranking — which is what Race will be — a carbon-inclusive Tempo shares **11 of its top 20**; without
carbon it shares **2**. Including carbon does not make Tempo fast, it makes Tempo **collapse into
Race**, and the two stories stop being two. The same comparison kills the idea of shipping separate
Tempo (carbon) and Tempo (no-carbon) presets: the carbon one would be a duplicate of Race rather
than a second opinion about tempo.

The one-sided check agrees and is not close:

| pool | carries `tempo` | `competition`-only | median price | carbon |
|---|---|---|---|---|
| carbon in | 10/30 | **20/30** | £250 | 24/30 |
| carbon out | **25/30** | **0/30** | £160 | 0/30 |

**Overlap with Easy is not a defect.** The no-carbon Tempo shares 10 of its top 20 with Easy's, and
that is correct: a plateless super-trainer genuinely serves both sessions. Chasing distinctness
would mean recommending worse shoes in both categories to make a taxonomy look tidier — the same
error as optimising against the `pace` label. Overlap with **Race** is the failure mode, because
Race is defined by not caring about durability or repeatability at all.

## 3. Terms

The session pushes the cardiovascular system toward its ceiling and trains power output at speed,
**two or three times a week**. That frequency is what separates a tempo shoe from a race shoe.

| term | mechanism | weight | share | 2024+ cov |
|---|---|---|---|---|
| energy return | at tempo pace you generate enough force to actually compress and rebound the foam | **3** | 38% | 93% |
| weight | metabolic cost scales with shoe mass, and the penalty grows with cadence | **2** | 25% | 100% |
| outsole durability | a repeated session, so cost per mile is real — unlike Race | **2** | 25% | 100% |
| shock absorption | **the floor, not the point** — see below | **1** | 12% | 94% |
| *midsole width / stack* | stability — **opt-in**, 1 each | *1* | *20% of 10* | 100% |
| *heel counter stiffness* | stability — **opt-in** | *1* | | 100% |

Energy return leads because it is the direct measure of a fast shoe and the mechanism supports the
ordering: over a 20–40 minute session a 40 g difference is roughly 0.4% metabolic cost, where ten
points of energy return is a larger effect. Weight leading is *Race's* argument, where a fragile
ultralight is worth it for one day.

### Shock absorption is a floor, and dropping it breaks the score

This is the finding that matters most, because the convenient move was wrong. Removing shock
absorption separates Tempo from Easy nicely — and produces this:

| shoe | with SA | without SA |
|---|---|---|
| Vibram FiveFingers V-Run | #180 | **#11** |
| Merrell Vapor Glove 6 | #170 | #21 |
| Nike Free RN NN | #60 | #27 |
| Topo ST-5 | #222 | #68 |

With weight at 2 and no impact term, **lightness runs away** and "barely a shoe" ranks as a tempo
pick — a barefoot shoe at #11 on 46.8% energy return. So shock absorption earns its place for a
completely different reason than in Easy, where it is the primary comfort measure at 50%: here it is
small **because** it is a floor, and it must exist **because** weight is large.

### Terms considered and rejected

| term | why not |
|---|---|
| **flexibility-stiffness** | tested on the hypothesis that Easy's rejection would invert at speed — that a stiffer shoe is efficient under high force. It does not: `rho(stiffness, energy return) = −0.02` on **both** sides. It tracks weight (0.31) and nothing about speed |
| **price** | excluded by intent, as everywhere. Tempo's 80th-percentile cap is the last place price still filtered and it goes |
| **stack, softness, torsional rigidity** | rejected for Easy and the reasons carry (docs/shoe-stories.md §Easy) |

## 4. Constants

Everything Easy already froze is shared unchanged: `SA_REF = 200`, `L_OK = 3.0`, and the per-side
`WID_CAP` (heel 3.04, forefoot 5.37).

Exactly one constant is new: **`W_REF = 450`**, above the fleet's heaviest shoe (424 g), so
`1 − w/450` is linear in grams and never clips. Like `SA_REF` it is an uncapped linear factor, so
stage 2 cancels it — cosmetic, never a ranking.

### `L_OK` stays at 3.0, and the durability *weight* does the work

Tempo does fewer miles per week than Easy, which invites the conclusion that its outsole cap should
be lower. It does not follow. A shoe is retired when the **midsole** packs out, which is a function
of *total* miles — and both shoes reach that total. The easy shoe simply gets there sooner in
calendar time and is replaced more often. Miles-before-retirement is the quantity the cap depends
on, and it is similar for both, so **the cap is the same for both.**

What actually demotes the fragile flats is the durability **weight**, isolated:

| durability weight | `L_OK` | Takumi Sen 11 (outsole life 1.0) |
|---|---|---|
| 1 | 3.0 | #10 |
| **2** | **3.0** | **#42** |
| 2 | 2.0 | #62 |

Weight 1 → 2 moves it 32 places; the cap change adds 20 more and costs a second constant with no
mechanism behind it.

**A counter-intuitive property worth recording anyway, because it will mislead someone:** a
*tighter* cap punishes the bad tail *harder*, not softer — Takumi Sen 11 sits at #42 with `L_OK`
3.0, #62 at 2.0, and climbs to **#13** at 6.0. When most shoes cap, the surviving spread is small,
so stage 2's division amplifies the gap for the few below. **The cap sets two things at once: where
"enough" is, and how hard falling short hurts.** Do not reason about it as if it only did the first.

Evidence the curve does what it is for: at 3.0, **206 of 283 read exactly 1.00**, so Superblast 3
(life 4.4), Endorphin Azura (4.6) and Infinite Elite 2 (5.7) earn nothing over Megablast at 3.3; and
the 77 it does grade are adidas Supernova 2 (0.5), Supernova 3 (0.7), Solarboost 5 (0.8), Takumi Sen
10 and 11 (0.9, 1.0), HOKA Rincon 4 (1.0) — thin outsoles and fragile flats, exactly the failure the
term exists to catch.

### The frozen set — and it is almost entirely Easy's

```
W_REF = 450 (new)     SA_REF = 200, L_OK = 3.0, WID_CAP — all shared with Easy

sd                        heel      forefoot     vs Easy
  energyReturn            0.0758    0.0790       identical
  outsoleDurability       0.1614    0.1614       identical
  shockAbsorption         0.0896    0.0961       identical
  midsoleWidth            0.0872    0.1133       identical
  heelCounter             0.2712    0.2712       identical
  weight                  0.0776    0.0776       new, and sideless

anchors (r0, r100)
  heel     stability off  4.7625 / 7.9385
  heel     stability on   5.0514 / 7.3590
  forefoot stability off  4.5415 / 7.6499
  forefoot stability on   4.7002 / 6.8820
```

**Every divisor Tempo shares with Easy is the same number**, because a divisor is a property of
`(metric, mapping, pool)` — never of the story. Easy and Tempo share all three for their common
terms, so they must share the constants: keeping two copies would be two homes for one fact
(docs/README.md §Rules, rule 1). Only the *anchors* are per score, because those depend on weights.

**The pool is load-bearing in that sentence and Race will prove it.** Race ranks the whole fleet
rather than the plate-filtered pool, and carbon shoes widen the spread — its energy-return divisor is
0.0902 against the 0.0758 here. So the shared set is keyed by *pool*, not simply by term, and Race
carries its own. Do not "simplify" this into one global table.

The same property is the strongest practical argument against the `L_OK = 2.0` I first proposed: a
per-story cap would have been the only thing making two scores over the *same* pool disagree about
the same measurement.

Derived from the fleet at `data/` commit `baed23b` (450 shoes, 378 after the plate gate, **283
scoreable**), dividing by the sds **as published above** rather than unrounded ones — the reasoning
is docs/decisions.md §Frozen scores and live thresholds.

## 5. The stability toggle applies, at weight 1

One toggle, one preference, applying to whichever score is on screen — it is a property of the
runner, not of the session, which is why it already survives a story click.

The eligibility invariant holds: **283 scoreable either way**, because the opt-in metrics are the
best-covered in the fleet. Measured on Tempo it does real work — top-15 shares 11/15, median shift
14 places — demoting the tall-narrow shoes (Mizuno Neo Vista 38→108) and promoting
stability-flavoured ones including **Saucony Tempus 2**, Saucony's actual stability tempo shoe,
found unprompted.

**Weight 1 each, not 2.** Easy has four terms so the pair is 33% of it; Tempo has eight, so the same
absolute weight is 20%. At 2 each (33%) Tempo degrades badly: top-15 shares only 6/15 and the
biggest gainers become ASICS Jolt 4 (246→94) and Gel Pulse 15 (205→87) — budget entry-level trainers
with no business in a tempo list. Stability swamps speed.

## 6. What Tempo's view becomes

```
pool   = plate ≠ carbon
sort   = tempoScore desc, on the runner's side
```

- **All three bounds dropped** — weight, energy return and price. The score reads all three of those
  qualities directly, so bounding them restates the ranking and truncates the list.
- **Two new synthetic keys**, `tempo-score-heel` and `tempo-score-forefoot`, added to
  `DERIVED_SIDE_PAIRS` — which is the extension point built for exactly this, so they follow a side
  click and name a side with no further machinery (docs/app.md §The Easy score).
- **Columns** show the score's terms, as Easy's do: `releasedAt`, the Tempo score, RunRepeat Score,
  price, energy return, weight, outsole durability, plate. Six numeric, the phone bound
  (docs/app.md §Columns and sorting). Shock absorption is the term not shown — it is the floor
  rather than the point, and the seventh slot does not exist.

## 7. Where it lands

283 scoreable of a 378 pool, on all four (side, stability) combinations.

```
heel, stability off
 1 ASICS Megablast          £225 218g      6 Mizuno Neo Zen             £150 234g
 2 adidas Adizero EVO SL    £150 223g      7 ASICS Superblast 3         £200 235g
 3 ANTA Zone 2 90           £115 196g      8 Saucony Endorphin Azura    £150 241g
 4 adidas Hyperboost Edge   £200 247g      9 adidas Adizero Adios 9     £140 176g
 5 Skechers Aero Razor      £140 190g     10 PUMA Velocity Nitro 4      £140 224g
```

Saucony Endorphin Speed 5 sits at #13 and Speed 4 at #16 — the archetypal tempo shoes, and both
above the fragile flats they resemble. Takumi Sen 11 is #42 on an outsole life of 1.0.

**One-sided sanity check** (docs/shoe-stories.md §Checking a threshold set): `competition`-only is
**0/30 in every one of the four combinations**, and `tempo` is carried by 20–24 of 30. Median price
£150–160 against the old preset's cap-driven list. This checks only that we have not *completely*
disagreed with RunRepeat; it is never an objective.

## 8. Docs corrections required

| doc | change |
|---|---|
| docs/shoe-stories.md | rewrite §Tempo around the four terms. **Replace "carbon is deliberately left open"** with the two reasons in §2. Record shock absorption as a floor rather than a comfort term, and why `L_OK` differs from Easy's |
| docs/app.md | §Presets — Tempo resolves to a plate filter and a sort; the new score keys; Tempo's columns; that each score owns its own divisors and anchors |
| docs/decisions.md | no new decision — §Frozen scores and live thresholds already covers it |
| BACKLOG.md | item 1 narrows to Race alone; item 11 is done for Tempo; **item 13 (story-card text) is settled for Easy and Tempo here** and narrows to Race |
| `PRESETS[].describe` | Easy's and Tempo's cards both describe behaviour a generation old (BACKLOG.md item 13). Rewrite both in this change — Tempo's promises "at a price you can repeat", and there is no longer a price cap |

## 9. Out of scope

Race. It will want a third answer on durability — plausibly no durability term at all, since it is
one day — and it is the one story where carbon belongs. The versatility score (BACKLOG.md item 12)
waits on Race.

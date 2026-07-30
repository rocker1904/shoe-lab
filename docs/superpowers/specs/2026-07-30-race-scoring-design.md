> **Design artifact.** Where this disagrees with the docs/ set, docs/ wins.

# Race gets a score

**Date:** 2026-07-30
**Status:** Approved design, pending an implementation plan
**Size:** Small — the pipeline, plumbing and toggle all exist. Race adds a third entry to
`DERIVED_SIDE_PAIRS`, its own constant set, and three terms. Designed alongside
docs/superpowers/specs/2026-07-30-tempo-scoring-design.md and meant to land with it.

## 1. What this replaces

Race bounds weight at an absolute 230 g and energy return at the 85th percentile of the runner's
side, then sorts by energy return — 39 of 450 survive. Same four-stage pipeline as Easy and Tempo
replaces it, and everything structural is inherited: the three-year horizon, all-terms-required with
N/A ranking last, client-side computation, frozen constants, and the `pace` fact as a **one-sided**
check that is never an objective.

## 2. The pool: everything

**No gate at all.** Race is the one story where carbon belongs — it is a race-day tool used a
handful of times, which is the context where the trade is clearly worth it, and it is where the
precautionary line drawn for Easy and Tempo stops applying.

**Carbon is still not *required*.** docs/shoe-stories.md already argues this and the measurement
vindicates it: with no plate gate and no plate term, **the top twelve are carbon anyway**. They win
on merit rather than by decree, and gating would be both less accurate and less honest — it admits
heavy carbon max-cushion trainers and excludes genuinely fast unplated flats.

**The absolute 230 g weight ceiling goes.** The score reads weight directly at 25% effective
influence, so a ceiling would only truncate the list at an arbitrary point while the score was
already ranking by the same quantity. This removes the last absolute number in any preset — every
remaining constant is either physical (a reference above the observed range) or a frozen divisor.

## 3. Terms

One day, one goal, a handful of uses.

| term | mechanism | weight | share |
|---|---|---|---|
| energy return | the direct measure of a fast shoe | **3** | 43% |
| weight | metabolic cost scales with mass, and at race effort you carry it for the whole distance | **2** | 28% |
| shock absorption | the floor — and at marathon distance, three hours of loading at speed | **1** | 15% |

**No durability term.** This is the sharpest difference between Race and the other two, and it comes
straight from the story: a race shoe is used a handful of times, so cost per mile is irrelevant. The
argument that earns Tempo a durability weight of 2 goes to exactly zero here. It is also what makes
the three stories three — Easy and Tempo both care about repeatability, Race does not care at all.

**No stability terms** — see §5.

### Energy return leads weight

Energy return outranks weight for the same reason it does in Tempo, and the evidence is in the
fleet: the fastest shoes are not the lightest. Alphafly 3 is 201 g, Endorphin Elite 3 is 210 g, and
both beat lighter shoes on the strength of foam and plate. Raising energy return from 2 to 3 moves
PUMA Fast-R Nitro Elite 3 (80.4% return, 173 g) to #3 and drops the 139 g Adios Pro Evo 2 to #6 —
the ordering doing what it claims.

### Shock absorption is still the floor

Dropping it does not break Race the way it breaks Tempo — Vapor Glove sits at #267 with the floor
and only rises to #57 without, because carbon supershoes dominate energy return so decisively that
minimalist shoes cannot reach the top regardless. But it earns its place on mechanism rather than on
rescue: a marathon is two to four hours of loading at speed, and impact attenuation over that
duration is real. It stays small **because** it is a floor.

## 4. Constants

Shared and unchanged: `SA_REF = 200`, `W_REF = 450` (introduced by Tempo). `L_OK` and `WID_CAP` are
not used — Race has neither term.

**Race needs its own divisors, and this is the part to get right.** A divisor is a property of
`(metric, mapping, pool)`. Easy and Tempo share a pool — the plate-filtered 378 — so they share
constants for every common term. Race ranks the **whole fleet**, and carbon shoes widen every
spread:

| | Race (450) | Easy/Tempo (378 pool) |
|---|---|---|
| energyReturn heel | **0.0902** | 0.0758 |
| energyReturn forefoot | **0.0900** | 0.0790 |
| shockAbsorption heel | **0.0902** | 0.0896 |

So the frozen sets are keyed by pool, not globally by term. Do not collapse them.

```
sd                        heel      forefoot
  energyReturn            0.0902    0.0900
  weight                  0.0904    0.0904
  shockAbsorption         0.0902    0.0930

anchors (r0, r100)
  heel      3.7787 / 8.5477
  forefoot  3.9800 / 8.6001
```

Derived from the fleet at `data/` commit `baed23b`, dividing by the sds **as published above**
rather than unrounded ones (docs/decisions.md §Frozen scores and live thresholds). Only two anchor
pairs rather than four, because there is no stability state.

**378 of 450 are scoreable.** That number coincidentally equals the size of Easy's and Tempo's
*pool*, and it is a different set — Race's 378 includes carbon and excludes shoes missing a reading.
Do not read the two as the same.

## 5. No stability toggle on Race

The toggle applies to Easy and Tempo only. This is measured rather than assumed:

| | top-15 shared | median shift | what it promotes |
|---|---|---|---|
| Easy, 1 each | 3/10 of the top 10 | 47 | Guide, Hurricane, Kayano, Beast GTS |
| Tempo, 1 each | 11/15 | 14 | Saucony Tempus 2 into the top 8 |
| **Race, 0.5 each** | **14/15** | 9 | Clifton 9 #210→#162, Arahi 7 #303→#256 |
| **Race, 1 each** | **14/15** | 19 | Clifton 9 #210→#119, Arahi 7 #303→#202 |
| Race, 2 each | 5/15 | 44 | ASICS Jolt 4 #354→#166 — breaks |

At every usable weight it moves **one shoe in fifteen** at the top; all the movement is in the middle
and deep field, and what it promotes there is daily trainers. Push it hard enough to matter and slow
budget shoes climb.

The cause is structural rather than a tuning failure: **race shoes are uniformly tall and narrow, so
the category has no stable variant to surface.** There is no Race equivalent of Hurricane or Tempus.
docs/shoe-stories.md reached the same conclusion from the other direction — "Stability is not baked
in… there is no fleet-wide answer, so it stays a filter rather than a preset rule."

**Consequence for the UI:** the stability control is inert while Race is selected, and that must be
*said* rather than hidden. The score's help popover names which stories it affects and why. An
unexplained dead control is worse than either applying it or removing it.

It also means Easy's and Tempo's eligibility invariant — identical scoreable count with the toggle
on or off — stays exactly true for the two scores that assert it, and is simply not a claim Race
makes.

## 6. What Race's view becomes

```
pool   = everything
sort   = raceScore desc, on the runner's side
```

- **Both bounds dropped** — the 230 g ceiling and the 85th-percentile energy-return floor. The score
  reads both directly.
- **Two new synthetic keys**, `race-score-heel` and `race-score-forefoot`, in `DERIVED_SIDE_PAIRS`.
- **Columns**: `releasedAt`, the Race score, RunRepeat Score, price, energy return, weight, shock
  absorption, plate. Six numeric — the phone bound (docs/app.md §Columns and sorting) — and every
  scoring term is on screen, which no other story manages because Race has only three.

## 7. Where it lands

```
heel, top 12                                                  ER      g   plate     £
 1 adidas Adizero Adios Pro Evo 3                            76.8    99   carbon  500
 2 ASICS Metaspeed Ray                                       78.0   129   carbon  300
 3 PUMA Fast-R Nitro Elite 3                                 80.4   173   carbon  300
 4 ASICS Metaspeed Edge Tokyo                                78.3   159   carbon  270
 5 ASICS Metaspeed Sky Tokyo                                 78.5   163   carbon  270
 6 adidas Adizero Adios Pro Evo 2                            73.5   139   carbon  500
 7 Saucony Endorphin Elite 2                                 80.6   197   carbon  290
 8 PUMA Deviate Nitro Elite 4                                77.4   173   carbon  250
 9 Nike Vaporfly 4                                           78.1   166   carbon  260
10 Saucony Endorphin Elite 3                                 80.6   210   carbon  290
11 Nike Streakfly 2                                          76.3   128   carbon  180
12 HOKA Cielo X1 3.0                                         75.3   193   carbon  275
```

Alphafly 3 at #22 (201 g, lower return than the leaders), adidas Adizero EVO SL at #33 — a
super-trainer correctly below the racers but respectable — and Vapor Glove at #267.

**One-sided sanity check** (docs/shoe-stories.md §Checking a threshold set): `competition` is carried
by **27/30 on heel and 28/30 on forefoot**, median £255–268, median 194–198 g. Carbon is 24–25 of 30
without being required or rewarded. This checks only that we have not *completely* disagreed with
RunRepeat; it is never an objective.

## 8. Docs corrections required

| doc | change |
|---|---|
| docs/shoe-stories.md | rewrite §Race around the three terms. Record that carbon is admitted but never required, and that the absolute weight ceiling is gone. Keep and strengthen the existing stability position with §5's measurement |
| docs/app.md | §Presets — Race resolves to a sort with no filter at all; the new score keys; Race's columns; that divisors are keyed by pool and Race's differ; that the stability control does not affect Race |
| BACKLOG.md | item 1 (threshold tuning) is fully closed — no preset has thresholds left. Item 11 done. Item 13 (story cards) closes with Race's rewrite |
| `PRESETS[].describe` | Race's card promises "the lightest, liveliest shoes in the fleet", which was a weight ceiling and an energy floor. Rewrite for a score |

## 9. What this unlocks, and one trap in it

With all three scores live, the versatility score (BACKLOG.md item 12) becomes buildable — but the
three scores **cover different shoe sets**. Easy and Tempo score 283 shoes; Race scores 378, and
neither is a subset of the other in the way it looks. A shoe can have a Race score and no Easy score,
because Race needs no outsole reading.

So a versatility measure cannot assume all three exist, and averaging over "the ones that are there"
would reintroduce exactly the renormalisation flaw rejected for Easy — fewer terms meaning less
regression to the mean, so sparsely-measured shoes take both ends. Whatever form it takes, it needs
all three present or it needs to say it is not versatile-scored.

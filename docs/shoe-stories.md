# Shoe stories

What a runner means by **Easy**, **Tempo** and **Race**, and why. The presets in
`app/src/lib/presets.ts` implement these; docs/app.md §Presets owns the mechanism —
where thresholds live, and that a preset replaces the view rather than layering on it.

This is domain reasoning, not a lab fact. It is recorded because it is expensive to
reconstruct and because every threshold in the app is downstream of it. When a
threshold looks arbitrary, the answer is here.

## The shared rules

- **Both buyers shop inside roughly three years.** There are two overlapping ones —
  *latest and greatest*, and *great value*, often but not only last-gen — and neither
  looks much further back than that. This is a premise about the reader, not a filter
  in any preset, and its job is to decide which evidence counts: **a metric's
  viability is judged by its coverage since 2024**, not fleet-wide. Coverage here is
  era-shaped (docs/app.md §There is no sparse warning), so a fleet-wide figure
  understates an arriving metric and flatters a retiring one. Shock absorption reads
  85% fleet-wide against 94% over the window; outsole durability 86% against 100%.
- **Thresholds come from the market, not from assumptions about the user.** A price
  cap is a percentile of the live fleet computed at click time, not a number someone
  liked. As the catalogue moves, the preset moves with it. A **score** is the
  opposite case and freezes its constants
  (docs/decisions.md §Frozen scores and live thresholds).
- **No preset filters by release date.** Recency is a strategy, not a story: buying
  last season's model at a discount and buying the newest thing are both valid, and
  which one you want is not implied by whether you are running easy or racing. The
  rule needs no protective argument either: a score reading only lab measurements is
  time-blind by construction, and requiring every term sinks a thinly-measured old
  shoe on its own (see Easy). A date filter would be machinery for a job the shape of
  the data already does.
- **Anything that is genuinely a user decision stays with the user.** Where the
  evidence does not settle a question, the preset takes no position and leaves the
  filter free. Carbon plates in a tempo shoe are the standing example.

## How a story becomes a threshold

Each story names a quality; the fleet only measures metrics. The mapping is a
judgement, so it is recorded here rather than left implicit in
`app/src/lib/presets.ts`.

| quality | metric | why this one |
|---|---|---|
| repetition tolerance | shock absorption, outsole durability, energy return | Easy ranks rather than bounds; the mechanisms are below |
| speed | weight **and** energy return | the two things a fast shoe is; measured directly rather than inferred from a plate |
| repeatability | price | cost per mile, on the stories that still cap it |
| plate character | plate | only ever to exclude carbon, never to require it |

**Softness is bounded by nothing and read by nothing.** It is redundant with shock
absorption, which measures the outcome rather than the material cause and correlates
−0.49 with it, and it is the worse-covered of its lineage pair (83% retiring against
51% arriving). Shock absorption does the work instead.

**A plate is never a requirement.** Requiring carbon for Race is *measurably worse*
than defining Race by weight and energy return: it lets in heavy carbon max-cushion
trainers and shuts out genuinely fast unplated flats. Plate earns its place in Easy
only as an exclusion.

**Two mechanisms matter here and cannot be measured at all.** Midsole/foam
durability — the midsole packing out is what actually retires most trainers, and
nothing in the fleet reads it — and compliance at low load, how a foam responds under
the soft landings of an easy run rather than under a test rig's impact. Both are
absent from every story on this page, and neither is approximated: the closest
candidates measure something else (bending stiffness scales with midsole thickness,
so it reports how thick a shoe is). Where a term below stops short of a mechanism, one
of these is usually why.

## Which half a story uses

Four metrics are measured at both ends of the shoe — stack, energy return,
shock absorption, midsole width. Which half a story bounds, sorts by and shows
as a column follows the **side the runner picked**, because for most runners
that is the half describing their landing. The side is a selection rather than
an identity: it is one of the two preset groups above the table, and it is
derived from the view rather than stored on it (docs/app.md §Presets). A table
that uses both halves or neither has no side, which is a shape of table and not
a runner without a strike. Nothing about a story changes with it; only which
number it reads.

The two halves are not on one scale, so a threshold cannot simply move between
them. 36 mm is the median heel stack and the **98th** percentile of forefoot
stack; shock absorption runs a heel median of 131.6 against a forefoot median
of 108.8. So **every bound that can swap sides is a percentile of that side's
own distribution**, never a number — "as much stack as most of the fleet"
transfers between sides, "36 mm" does not. It is the same rule as the shared
one above, applied to a second axis.

A bound on a metric with no sides may stay absolute. Race's weight ceiling is
the only one left.

The same rule governs a score's constants, for the same reason: every per-side
figure in Easy's pipeline is derived per side, and no absolute number transfers
between halves (docs/app.md §The Easy score).

**The interface never asks the runner to declare what they are.** This doc
reasons in strikes, because a runner's strike is what makes one half the right
one to read — but nothing on screen names a runner: the question is
"Measurements from: Heel | Forefoot", which asks which number to read rather
than asserting a gait. Many runners do not know their strike and most change it
with pace, so a tool whose first act is to demand a self-diagnosis it cannot
check has claimed something it has no standing to claim. The distinction costs
nothing — same two values, worded as a preference — so do not "clarify" the
label into "I am a heel striker".

## Checking a threshold set

RunRepeat labels each shoe with a `pace` fact — daily, tempo, competition, or a
combination (docs/scraping.md §Editorial facts). It is one editor's judgement, not a
lab reading, so it is **never a filter**. As a scoring function for a candidate
threshold set it is useful: apply the thresholds, then look at what fraction of the
shortlist carries the label you would expect.

**The check is one-sided.** Disagreeing with the label is the point of this project —
if the tool only ever reproduced RunRepeat's editorial judgement it would have nothing
to add — so a low agreement figure is evidence to *read*, never a number to optimise.
What it can do is catch a threshold set that has gone completely orthogonal to the
session it names. Easy's top 30 carry `daily-running` 28 and 29 times out of 30
against a 79% base rate, which is that check passing, not a target being hit.

Easy and Race both agree closely this way. Tempo does not yet, which is the evidence
behind its open question below. A change to any threshold should be scored this way
before it lands, and a change that drops the figure sharply needs an argument.

## Easy

The bulk of the training week: 5–7 hours a week at conversational pace, often on
tired legs, on consecutive days. The point is time on feet — building the aerobic
adaptations (heart, lungs, mitochondrial density, blood volume) and running economy —
not teaching the legs to move fast.

Peak force per step is *lower* than at speed, but weekly impulse is far higher. So the
shoe's job is **repetition tolerance**, not performance — which is a question about
degree rather than about eligibility, and Easy therefore **ranks** rather than bounds.
It resolves to one filter and a sort: the plate gate, and `easyScore` descending. The
pipeline, the constants and where they came from are docs/app.md §The Easy score;
this section owns what each term is *for*.

| term | mechanism | weight |
|---|---|---|
| shock absorption | attenuate repeated impact — the session's defining load | **2** |
| outsole durability | cost per mile | 1 |
| energy return | free efficiency; pleasant, but not what the session is for | 1 |
| midsole width / stack | stability on fatigued legs — **opt-in** | 1 |
| heel counter stiffness | stability on fatigued legs — **opt-in** | 1 |

- **No stack floor.** The score rewards cushioning directly through shock absorption,
  which measures the outcome; a stack bound would restate its cause and shorten the
  list for nothing.
- **No price cap.** This story is where the miles go, so cost per mile does bite — but
  the runner is the only one who knows their budget, and removing the cap commits the
  tool to reporting a shoe as strong and leaving the value call to them.
- **No carbon plate**, on precautionary injury-risk grounds: some research links
  carbon plates to higher injury risk, plausibly because unfamiliar stiffness and
  reduced toe-off bend shift calf loading. This is separate footing from any stiffness
  term and not a duplicate of one. Nylon and plastic plates are fine and often appear
  in stability trainers, so the rule is *not carbon* rather than *no plate at all* —
  excluding every plated shoe would throw out a stack of ordinary daily trainers.
- **A shoe missing any weighted term is not scored**, and sorts below every scored
  shoe as an em dash rather than as a zero. Renormalising over the terms present was
  tried and is wrong: fewer measurements means less regression to the mean, so sparse
  shoes take over both ends of the list.
- **Stability is opt-in, not assumed.** It matters to some runners a great deal and to
  others not at all, and there is no fleet-wide answer, so it is the runner's own
  switch. Turning it on does not quietly select heavy shoes — the width term is a ratio
  for exactly that reason (docs/app.md §The Easy score).

**Flexibility, torsional rigidity and weight are deliberately absent.** Flexibility
correlates +0.58 with heel stack in this pool, so rewarding it pulls *against* the
shock-absorption term, and its flexible end is the minimalist shoes this story
rejects. Torsional rigidity is the one metric whose coverage decays going forward —
the retired method is falling and its replacement has not arrived — and the two
stability terms cover the same mechanism at near-full coverage. Weight barely matters
at easy pace, and the most cushioned durable trainers are heavy.

## Tempo

The hardest of the three to pin down, because runners want different things from it.

The session pushes the cardiovascular system toward its ceiling and trains power
output and running economy at speed. Crucially it happens **two or three times a
week**, and that frequency is what separates a tempo shoe from a race shoe:

- **Speed is the priority**, as with racing.
- **But comfort and durability matter too**, because the shoe is used repeatedly
  rather than saved for one day. Cost per mile is a real consideration, so price is
  capped at the same 80th percentile.
- **Carbon is deliberately left open.** The evidence genuinely does not settle it:
  carbon plates are argued to be more mechanically damaging, and argued to impose a
  different movement pattern — notably a different calf stretch at toe-off, because
  the shoe does not bend as much — which is itself something a runner has to adapt to.
  Shipping separate carbon and non-carbon tempo presets would assert a distinction the
  science does not support and would force the user to make the call anyway. One
  preset, plate unconstrained, and a runner with a view filters on it.

**Both of Tempo's bounds are percentiles**, resolved at click time: weight at the 40th and
energy return at the 50th. Neither is a number about shoes in general — "light" and
"lively" are claims about *this* fleet, and the moment one is written as a constant the
story stops tracking the catalogue.

That is not a stylistic point. Energy return was once bounded at an absolute 65, which
happens to sit around the **74th percentile** of the fleet — so a story meant to describe
the broad middle of the training week was quietly keeping only its liveliest quarter, and
returned a fifth of what it should. Tempo is the widest of the three stories by intent:
it is where most weeks' hard running happens.

Both numbers remain provisional and are the first thing to score against the `pace` fact
after real use (BACKLOG.md item 1). Note that any energy-return bound also drops every
shoe with no reading — a real cost on this metric, which the receipt reports plainly.

## Race

One day, one goal. Everything is subordinate to speed.

- **No price cap.** Absolute performance is the point and cost per mile is irrelevant
  over a handful of race days.
- **Energy return floors at the 85th percentile** of the runner's side, and
  weight at an absolute 230 g. The energy-return floor was once 70, which sits
  at the 85th percentile on heel and the 80th on forefoot — one number meaning
  two different things, which is precisely what a side-swappable bound must not
  do. Weight has no sides, so it stays a number.
- **Carbon is not required.** A plate is a means to an end, and the end is speed —
  measured directly by weight and energy return. Gating on carbon is both less
  accurate and less honest: it admits heavy carbon max-cushion trainers while
  excluding genuinely fast unplated flats.
- **Stability is not baked in.** It matters to some runners a great deal and to others
  not at all, and there is no fleet-wide answer, so it stays the runner's — a filter
  here, and a toggle on the one story that ranks (see Easy).

# Shoe stories

What a runner means by **Easy**, **Tempo** and **Race**, and why. The presets in
`app/src/lib/presets.ts` implement these; docs/app.md §Presets owns the mechanism —
that a story is a pool and a ranking, and that a preset replaces the view rather than
layering on it. The constants each score is built from live in
`app/src/lib/score-defs.ts` and are explained by docs/app.md §The story scores.

This is domain reasoning, not a lab fact. It is recorded because it is expensive to
reconstruct and because every term weight in the app is downstream of it. When a weight
looks arbitrary, the answer is here.

## The shared rules

- **Both buyers shop inside roughly three years.** There are two overlapping ones —
  *latest and greatest*, and *great value*, often but not only last-gen — and neither
  looks much further back than that. This is a premise about the reader, not a filter
  in any preset, and its job is to decide which evidence counts: **a metric's
  viability is judged by its coverage since 2024**, not fleet-wide. Coverage here is
  era-shaped (docs/app.md §There is no sparse warning), so a fleet-wide figure
  understates an arriving metric and flatters a retiring one. Shock absorption reads
  85% fleet-wide against 94% over the window; outsole durability 86% against 100%.
- **No story bounds a metric.** All three rank instead, each by its own score over its
  own pool, so there is no threshold left anywhere to tune. A score **freezes** its
  constants rather than tracking the fleet, which is the opposite of what the old
  percentile bounds did and is deliberate
  (docs/decisions.md §Frozen scores and live thresholds).
- **No preset filters by release date.** Recency is a strategy, not a story: buying
  last season's model at a discount and buying the newest thing are both valid, and
  which one you want is not implied by whether you are running easy or racing. The
  rule needs no protective argument either: a score reading only lab measurements is
  time-blind by construction, and requiring every term sinks a thinly-measured old
  shoe on its own (see Easy). A date filter would be machinery for a job the shape of
  the data already does.
- **Anything that is genuinely a user decision stays with the user.** Where the
  evidence does not settle a question, the story takes no position and leaves the
  filter free. Price is the standing example: every score reads lab measurements only,
  so the value call is never made for the runner. Stability is the same decision taken
  one step further — a preference the runner sets, on the two stories that carry it.

## How a story becomes a term

Each story names a quality; the fleet only measures metrics. The mapping is a
judgement, so it is recorded here rather than left implicit in
`app/src/lib/score-defs.ts`.

| quality | metric | why this one |
|---|---|---|
| repetition tolerance | shock absorption, outsole durability, energy return | the mechanisms are below, per story |
| speed | weight **and** energy return | the two things a fast shoe is; measured directly rather than inferred from a plate |
| stability | midsole width / stack, heel counter stiffness | opt-in, and only where the category has a stable variant to surface |
| plate character | plate | a **pool gate**, never a term, and only ever to exclude carbon |

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
shock absorption, midsole width. Which half a story reads, sorts by and shows
as a column follows the **side the runner picked**, because for most runners
that is the half describing their landing. The side is a selection rather than
an identity: it is one of the two preset groups above the table, and it is
derived from the view rather than stored on it (docs/app.md §Presets). A table
that uses both halves or neither has no side, which is a shape of table and not
a runner without a strike. Nothing about a story changes with it; only which
number it reads.

The two halves are not on one scale, so no number can simply move between
them. 36 mm is the median heel stack and the **98th** percentile of forefoot
stack; shock absorption runs a heel median of 131.6 against a forefoot median
of 108.8.

That is what governs a score's constants: **every per-side figure in every
story's pipeline is derived per side**, and no absolute number transfers
between halves (docs/app.md §The story scores). A term with no sides — weight,
outsole life, heel counter stiffness — carries one figure for both, which is a
property of the measurement rather than a shortcut.

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
lab reading, so it is **never a filter**. As a check on a candidate set of terms and
weights it is useful: rank with them, then look at what fraction of the top of the list
carries the label you would expect.

**The check is one-sided.** Disagreeing with the label is the point of this project —
if the tool only ever reproduced RunRepeat's editorial judgement it would have nothing
to add — so a low agreement figure is evidence to *read*, never a number to optimise.
What it can do is catch a set of weights that has gone completely orthogonal to the
session it names. Easy's top 30 carry `daily-running` 28 and 29 times out of 30
against a 79% base rate, which is that check passing, not a target being hit.

All three agree closely this way now. Tempo's top 30 carry `tempo` 19–23 times out of
30 with `competition`-only at **0 of 30** on every side and toggle state, and Race's
carry `competition` 27–28 times. A change to any weight should be scored this way
before it lands, and a change that drops the figure sharply needs an argument.

## Easy

The bulk of the training week: 5–7 hours a week at conversational pace, often on
tired legs, on consecutive days. The point is time on feet — building the aerobic
adaptations (heart, lungs, mitochondrial density, blood volume) and running economy —
not teaching the legs to move fast.

Peak force per step is *lower* than at speed, but weekly impulse is far higher. So the
shoe's job is **repetition tolerance**, not performance — which is a question about
degree rather than about eligibility, and Easy therefore **ranks** rather than bounds.
It resolves to one filter and a sort: the plate gate, and the Easy score descending.
The pipeline, the constants and where they came from are docs/app.md §The story scores;
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
  for exactly that reason (docs/app.md §The story scores).

**Flexibility, torsional rigidity and weight are deliberately absent.** Flexibility
correlates +0.58 with heel stack in this pool, so rewarding it pulls *against* the
shock-absorption term, and its flexible end is the minimalist shoes this story
rejects. Torsional rigidity is the one metric whose coverage decays going forward —
the retired method is falling and its replacement has not arrived — and the two
stability terms cover the same mechanism at near-full coverage. Weight barely matters
at easy pace, and the most cushioned durable trainers are heavy.

## Tempo

The session pushes the cardiovascular system toward its ceiling and trains power output
at speed. Crucially it happens **two or three times a week**, and that frequency is what
separates a tempo shoe from a race shoe: the shoe is used repeatedly rather than saved
for one day, so cost per mile is real.

Tempo bounds nothing. It resolves to the plate gate and the Tempo score descending.

| term | mechanism | weight |
|---|---|---|
| energy return | at tempo pace you generate enough force to actually compress and rebound the foam | **3** |
| weight | metabolic cost scales with shoe mass, and the penalty grows with cadence | **2** |
| outsole durability | a repeated session, so cost per mile is real — unlike Race | **2** |
| shock absorption | **the floor, not the point** — see below | 1 |
| midsole width / stack | stability — **opt-in** | 1 |
| heel counter stiffness | stability — **opt-in** | 1 |

- **Energy return leads, not weight.** It is the direct measure of a fast shoe and the
  mechanism supports the ordering: over a 20–40 minute session a 40 g difference is
  roughly 0.4% metabolic cost, where ten points of energy return is a larger effect.
  Weight leading is *Race's* argument, where a fragile ultralight is worth it for one day.
- **Shock absorption is a floor, and dropping it breaks the score.** Removing it
  separates Tempo from Easy nicely and then ranks barefoot shoes as tempo picks: with
  weight at 2 and no impact term, lightness runs away, and the Vibram FiveFingers V-Run
  climbs 126 places, from #157 to #31 on heel. So it earns its place for a completely different reason than
  in Easy, where it is the primary comfort measure: here it is small **because** it is a
  floor, and it must exist **because** weight is large.
- **The outsole cap is Easy's, and the durability *weight* does the work.** Tempo does
  fewer miles per week, which invites a lower cap. It does not follow: a shoe is retired
  when the **midsole** packs out, which is a function of *total* miles, and both shoes
  reach that total — the easy shoe simply gets there sooner in calendar time. Miles
  before retirement is the quantity the cap depends on, so the cap is shared. What
  demotes the fragile flats is the weight of 2 rather than a second constant.
  A counter-intuitive property worth recording because it will mislead someone: a
  *tighter* cap punishes the bad tail **harder**, not softer, because when most shoes cap
  the surviving spread is small and stage 2's division amplifies the gap for the few
  below. The cap sets two things at once — where "enough" is, and how hard falling short
  hurts.
- **No carbon plate**, on the same precautionary grounds as Easy, and with more force
  rather than less: a session run two or three times a week is more cumulative exposure
  than race day. There is a second, structural reason the data produced. Measured against
  a pure speed ranking — which is what Race is — a carbon-inclusive Tempo shares **11 of
  its top 20**; without carbon it shares **2**. Including carbon does not make Tempo fast,
  it makes Tempo **collapse into Race**, and the two stories stop being two. The same
  comparison rules out shipping separate carbon and non-carbon tempo presets: the carbon
  one would be a duplicate of Race rather than a second opinion about tempo.
- **Overlap with Easy is not a defect.** The no-carbon Tempo shares 10 of its top 20 with
  Easy's, and that is correct: a plateless super-trainer genuinely serves both sessions.
  Chasing distinctness would mean recommending worse shoes in both categories to make a
  taxonomy look tidier. Overlap with **Race** is the failure mode, because Race is defined
  by not caring about durability or repeatability at all.
- **No price cap.** As Easy: the value call is the runner's.
- **Stability is opt-in at weight 1 each, not 2.** Easy has four terms so the pair is a
  third of it; Tempo has eight, so the same absolute weight is a fifth. At 2 each Tempo
  degrades badly — stability swamps speed and budget entry-level trainers take the top of
  the list. At 1 it does real work, demoting the tall-narrow shoes and promoting
  stability-flavoured ones.

**Flexibility-stiffness is rejected here too**, and it was tested on the hypothesis that
Easy's rejection would invert at speed — that a stiffer shoe is efficient under high
force. It does not: ρ(stiffness, energy return) is −0.02 on **both** sides. It tracks
weight (0.31) and nothing about speed. Stack, softness and torsional rigidity are
rejected for Easy's reasons, which carry.

## Race

One day, one goal. Everything is subordinate to speed.

Race bounds nothing and gates nothing — it is the one story with **no filter at all**,
resolving to the Race score descending over the whole fleet.

| term | mechanism | weight |
|---|---|---|
| energy return | the direct measure of a fast shoe | **3** |
| weight | metabolic cost scales with mass, and at race effort you carry it for the whole distance | **2** |
| shock absorption | the floor — and at marathon distance, three hours of loading at speed | 1 |

- **No durability term at all.** This is the sharpest difference between Race and the
  other two, and it comes straight from the story: a race shoe is used a handful of
  times, so cost per mile is irrelevant. The argument that earns Tempo a durability
  weight of 2 goes to exactly zero here, and it is what makes the three stories three.
- **Carbon is admitted, and never required.** Race is where the precautionary line drawn
  for Easy and Tempo stops applying: race day is a handful of uses, which is the context
  where the trade is clearly worth it. But a plate is a means to an end, and the end is
  speed — with no plate gate and no plate term, **the top twelve are carbon anyway**.
  They win on merit rather than by decree, and gating would be both less accurate and
  less honest: it admits heavy carbon max-cushion trainers and excludes genuinely fast
  unplated flats.
- **No weight ceiling.** The score reads weight directly, so an absolute 230 g cut would
  only truncate the list at an arbitrary point while the score was already ranking by the
  same quantity. This was the last absolute number in any story.
- **Energy return leads weight**, for Tempo's reason, and the fleet shows it: the fastest
  shoes are not the lightest. Alphafly 3 is 201 g and Endorphin Elite 3 is 210 g, and both
  beat lighter shoes on the strength of foam and plate.
- **Shock absorption is still the floor**, but it earns its place on mechanism rather than
  on rescue. Dropping it does not break Race the way it breaks Tempo — carbon supershoes
  dominate energy return so decisively that minimalist shoes cannot reach the top either
  way — yet a marathon is two to four hours of loading at speed, and impact attenuation
  over that duration is real.
- **Stability is not baked in, and the toggle does not reach Race at all.** This is
  measured rather than assumed: at every usable weight the preference moves **one to three
  shoes in fifteen** at the top, all the movement is in the middle and deep field, and what it
  promotes there is daily trainers; push it hard enough to matter and slow budget shoes
  climb. The cause is structural rather than a tuning failure — **race shoes are uniformly
  tall and narrow, so the category has no stable variant to surface.** There is no Race
  equivalent of the Hurricane or the Tempus. The control is therefore inert while Race is
  selected, and the toolbar **says so**: an unexplained dead control is worse than either
  applying it or removing it.

A consequence worth stating: Easy's and Tempo's eligibility invariant — the same shoes
scoreable with the preference on or off — stays exactly true for the two scores that
assert it, and is simply not a claim Race makes.

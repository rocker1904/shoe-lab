# Shoe stories

What a runner means by **Easy**, **Tempo** and **Race**, and why. The presets in
`app/src/lib/presets.ts` implement these; docs/app.md §Presets owns the mechanism —
that a story is a pool and a ranking, and that a preset replaces the view rather than
layering on it. The constants each score is built from live in
`app/src/lib/score-defs.ts` and are explained by docs/app.md §The story scores.

This is domain reasoning, not a lab fact. It is recorded because it is expensive to
reconstruct and because every term weight in the app is downstream of it. When a weight
looks arbitrary, the answer is here.

**Figures here are shape, not state.** A fleet statistic — a coverage share, a
correlation, an overlap between two top-20s — moves with every refresh, so where one is
quoted at all it is rounded and stands for the size of an effect rather than for a
current reading. Nothing on this page is a number to check against the data: what must
not drift is a frozen constant or a test assertion instead
(docs/app.md §The story scores).

## The shared rules

- **Both buyers shop inside roughly three years.** There are two overlapping ones —
  *latest and greatest*, and *great value*, often but not only last-gen — and neither
  looks much further back than that. This is a premise about the reader, not a filter
  in any preset, and its job is to decide which evidence counts: **a metric's
  viability is judged by its coverage since 2024**, not fleet-wide. Coverage here is
  era-shaped (docs/app.md §There is no sparse warning), so a fleet-wide figure
  understates an arriving metric and flatters a retiring one — shock absorption and
  outsole durability both read several points thinner fleet-wide than over the window,
  purely because they are still filling in. The window judges **one generation of a
  test**, never a supersession pooled together: a score reads a single column, and
  readings are not comparable across the chain (docs/scraping.md §Test lineage), so a
  pair covering the whole window between them can still leave every score that reads it
  short.
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

**Softness is read by nothing.** It is redundant with shock absorption, which measures
the outcome rather than the material cause and correlates about −0.5 with it, and it is
the worse-covered half of its lineage pair. Shock absorption does the work instead.

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
as a column follows the **zone the runner picked** — where the reading was
taken, heel or forefoot — because for most runners that is the half describing
their landing. The zone is a selection rather than an identity: it is one of the
two preset groups above the table, and it is derived from the view rather than
stored on it (docs/app.md §Presets). A table that uses both halves or neither
has no zone, which is a shape of table and not a runner without a landing.
Nothing about a story changes with it; only which number it reads.

The two halves are not on one scale, so no number can simply move between
them. The median heel stack sits in the top few percent of forefoot stacks, and
shock absorption's heel median runs about a fifth above its forefoot median.

That is what governs a score's constants: **every figure that describes a
distribution is derived per zone** — the divisors, the width caps, the anchors
(docs/app.md §The story scores). A term with no zones — weight, outsole life,
heel counter stiffness — carries one figure for both, which is a property of the
measurement rather than a shortcut. The two shared reference constants are the
exception that proves it: they are uncapped linear factors that cancel in the
divisor, so they describe no distribution and nothing turns on their being one
number.

**The interface never asks the runner to declare what they are.** This doc
reasons in strikes, because a runner's strike is what makes one half the right
one to read — but nothing on screen names a runner: the question is
"Measured at: Heel | Forefoot", which asks which number to read rather
than asserting a gait. Many runners do not know their strike and most change it
with pace, so a tool whose first act is to demand a self-diagnosis it cannot
check has claimed something it has no standing to claim. The distinction costs
nothing — same two values, worded as a preference — so do not "clarify" the
label into "I am a heel striker".

## Checking a set of weights

RunRepeat labels each shoe with a `pace` fact — daily, tempo, competition, or a
combination (docs/scraping.md §Editorial facts). It is one editor's judgement, not a
lab reading, so it is **never a filter**. As a check on a candidate set of terms and
weights it is useful: rank with them, then look at what fraction of the top of the list
carries the label you would expect.

**The check is one-sided.** Disagreeing with the label is the point of this project —
if the tool only ever reproduced RunRepeat's editorial judgement it would have nothing
to add — so a low agreement figure is evidence to *read*, never a number to optimise.
What it can do is catch a set of weights that has gone completely orthogonal to the
session it names. Easy's top 30 is almost entirely `daily-running`, against a base rate
of roughly four shoes in five — which is that check passing, not a target being hit.

All three agree this way now. Tempo's top 30 carries `tempo` on most of the list and
`competition`-only on **none** of it, in every zone and toggle state, and Race's is
nearly all `competition`. A change to any weight should be scored this way before it
lands, and a change that collapses one of those needs an argument.

## Easy

The bulk of the training week: several hours at conversational pace, often on
tired legs, on consecutive days. The point is time on feet — building the aerobic
adaptations (stroke volume, plasma volume, capillary and mitochondrial density) and
running economy — not teaching the legs to move fast.

Peak force per step is *lower* than at speed, but the number of loading cycles a week
is far higher. So the
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
  carbon plates to bone stress injury, the navicular and the metatarsals in particular,
  plausibly because a stiff plate limits how far the toe joints bend and redistributes
  load through the midfoot. This is separate footing from any stiffness term and not a
  duplicate of one. The rule is *not carbon* rather than *no plate at all*, because
  most non-carbon plated shoes in the fleet are ordinary daily trainers and excluding
  every plated shoe would throw out a stack of them.
- **A shoe missing any weighted term is not scored**, and sorts below every scored
  shoe as an em dash rather than as a zero. Renormalising over the terms present was
  tried and is wrong: fewer measurements means less regression to the mean, so sparse
  shoes take over both ends of the list.
- **Stability is opt-in, not assumed.** It matters to some runners a great deal and to
  others not at all, and there is no fleet-wide answer, so it is the runner's own
  switch. Turning it on does not quietly select heavy shoes — the width term is a ratio
  for exactly that reason (docs/app.md §The story scores).

**Flexibility, torsional rigidity and weight are deliberately absent.** The metric
behind flexibility is bending stiffness in newtons, and it tracks heel stack strongly
and positively: taller shoes are stiffer. So rewarding flexibility pulls *against* the
shock-absorption term, and its flexible end is the minimalist shoes this story rejects.
Torsional rigidity is mid-handover, and the generations are not comparable, so neither
column is a stable thing to read: the retired method still covers most of the window but
is falling away fast, and its replacement has taken over the newest shoes without yet
reaching back across it. Meanwhile the two stability terms cover the same mechanism on
single readings at near-full coverage.
Weight barely matters at easy pace, and the most cushioned durable trainers are heavy.

## Tempo

A sustained effort at around the lactate threshold — comfortably hard, holdable for
twenty to sixty minutes — training the pace the runner can hold before lactate outruns
clearance. Crucially it recurs, **one to three times a week**, and that frequency is what
separates a tempo shoe from a race shoe: the shoe is used repeatedly rather than saved
for one day, so cost per mile is real.

Tempo bounds nothing. It resolves to the plate gate and the Tempo score descending.

| term | mechanism | weight |
|---|---|---|
| energy return | at tempo pace you generate enough force to actually compress and rebound the foam | **3** |
| weight | metabolic cost scales with shoe mass, at roughly a fixed share of it whatever the pace | **2** |
| outsole durability | a repeated session, so cost per mile is real — unlike Race | **2** |
| shock absorption | **the floor, not the point** — see below | 1 |
| midsole width / stack | stability — **opt-in** | 1 |
| heel counter stiffness | stability — **opt-in** | 1 |

- **Energy return leads, not weight**, and the argument is that weight's effect is both
  small and well bounded while energy return's is neither. Shoe mass costs roughly 1% of
  metabolic cost per 100 g per shoe, and that share holds about steady across running
  speeds rather than growing with pace — so a realistic difference between two tempo
  shoes is a few tenths of a percent, and there is no headroom above it. Energy return
  cannot be put on that scale at all: it is a rebound reading from an impact rig, not a
  measure of running economy, so no arithmetic converts one into the other. What settles
  the ordering is the fleet, not the units — the fastest shoes in it are not the lightest
  (see Race). Weight leading is *Race's* argument, where a fragile ultralight is worth it
  for one day.
- **Shock absorption is a floor, and dropping it breaks the score.** Removing it
  separates Tempo from Easy nicely and then ranks barefoot shoes as tempo picks: with
  weight at 2 and no impact term, lightness runs away, and the Vibram FiveFingers V-Run
  climbs over a hundred places into the top forty. So it earns its place for a completely different reason than
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
  rather than less: a session run weekly or oftener is far more cumulative exposure than
  race day. There is a second, structural reason the data produced. Measured against a
  pure speed ranking — which is what Race is — a carbon-inclusive Tempo's top 20 overlaps
  Race's several shoes deep, where the no-carbon one overlaps it two or three. Including
  carbon does not make Tempo fast, it makes Tempo **collapse into Race**, and the two
  stories stop being two. The same comparison rules out shipping separate carbon and non-carbon tempo
  presets: the carbon one would be a duplicate of Race rather than a second opinion
  about tempo.
- **Overlap with Easy is not a defect.** The no-carbon Tempo shares about half its top 20
  with Easy's, and that is correct: a plateless super-trainer genuinely serves both.
  Chasing distinctness would mean recommending worse shoes in both categories to make a
  taxonomy look tidier. Overlap with **Race** is the failure mode, because Race is defined
  by not caring about durability or repeatability at all.
- **No price cap.** As Easy: the value call is the runner's.
- **Stability is opt-in at weight 1 each, not 2.** Weights, not term counts, are what
  matter here: Easy's base weights sum to four, so the pair is a third of the total;
  Tempo's sum to eight, so the same absolute weight is a fifth. At 2 each Tempo degrades
  badly — stability swamps speed and budget entry-level trainers take the top of the
  list. At 1 it does real work, demoting the tall-narrow shoes and promoting
  stability-flavoured ones.

**Flexibility-stiffness is rejected here too**, and it was tested on the hypothesis that
Easy's rejection would invert at speed — that a stiffer shoe is efficient under high
force. It does not: bending stiffness is essentially uncorrelated with energy return on
**both** zones. What it tracks is weight, and nothing about speed. Stack, softness and
torsional rigidity are rejected for Easy's reasons, which carry.

## Race

One day, one goal. Everything is subordinate to speed.

Race bounds nothing and gates nothing — it is the one story with **no filter at all**,
resolving to the Race score descending over the whole fleet.

| term | mechanism | weight |
|---|---|---|
| energy return | the direct measure of a fast shoe | **3** |
| weight | metabolic cost scales with mass, and at race effort you carry it for the whole distance | **2** |
| shock absorption | the floor — and at marathon distance, upwards of two hours of loading at speed | 1 |

- **No durability term at all.** This is the sharpest difference between Race and the
  other two, and it comes straight from the story: a race shoe is used a handful of
  times, so cost per mile is irrelevant. The argument that earns Tempo a durability
  weight of 2 goes to exactly zero here, and it is what makes the three stories three.
- **Carbon is admitted, and never required.** Race is where the precautionary line drawn
  for Easy and Tempo stops applying: race day is a handful of uses, which is the context
  where the trade is clearly worth it. But a plate is a means to an end, and the end is
  speed — with no plate gate and no plate term, **the top of the list is carbon anyway**.
  They win on merit rather than by decree, and gating would be both less accurate and
  less honest: it admits heavy carbon max-cushion trainers and excludes genuinely fast
  unplated flats.
- **No weight ceiling.** The score reads weight directly, so an absolute 230 g cut would
  only truncate the list at an arbitrary point while the score was already ranking by the
  same quantity. This was the last absolute number in any story.
- **Energy return leads weight**, for Tempo's reason, and the fleet is what shows it: the
  fastest shoes are not the lightest. The Alphafly 3 and the Endorphin Elite 3 are both
  over 200 g and both beat lighter shoes on the strength of foam and plate. This is the
  measured half of the argument Tempo's arithmetic cannot supply.
- **Shock absorption is still the floor**, but it earns its place on mechanism rather than
  on rescue. Dropping it does not break Race the way it breaks Tempo — carbon supershoes
  dominate energy return so decisively that minimalist shoes cannot reach the top either
  way — yet a marathon is upwards of two hours of loading at speed, and impact attenuation
  over that duration is real.
- **Stability is not baked in, and the toggle does not reach Race at all.** This is
  measured rather than assumed: at every usable weight the preference **barely disturbs
  the top of the list**, all the movement is in the middle and deep field, and what it
  promotes there is daily trainers; push it hard enough to matter and slow budget shoes
  climb. The cause is structural rather than a tuning failure — **race shoes are uniformly
  tall and narrow, so the category has no stable variant to surface.** There is no Race
  equivalent of the Hurricane or the Tempus. The control is therefore inert while Race is
  selected, and the About panel **says so**: an unexplained dead control is worse than either
  applying it or removing it.

A consequence worth stating: Easy's and Tempo's eligibility invariant — the same shoes
scoreable with the preference on or off — stays exactly true for the two scores that
assert it, and is simply not a claim Race makes.

## Decisions

### No composite over the three stories
A fourth score built *from* Easy, Tempo and Race — their mean, their spread, their
worst-of-three — is rejected on measurement, over the shoes all three score, in both
zones and with stability off.

- **The three are not on one scale.** Their raw means sit at visibly different levels,
  roughly twenty points between the extremes, because each story anchors on its own pool. Arithmetic across raw scores therefore
  reports the anchors: the raw Easy−Race gap correlates strongly **with weight**. The
  repair — rank each story within the loaded fleet and average the percentiles — is
  exactly the live recomputation a frozen score may not do
  (docs/decisions.md §Frozen scores and live thresholds).
- **Normalised, the three stories are one axis.** Spread across the three correlates
  almost perfectly with `|Easy − Race|`, and Tempo sits close to their midpoint. A
  dispersion over three numbers reports a two-point quantity.
- **A composite can only re-weight what the three already share.** All three weight
  energy return and two weight weight, so the mean of percentiles tracks energy return
  hard, with price and carbon plate behind it — its top 20 is mostly carbon at a median
  price well above the fleet's, while the mainstream cushioned and stability trainers sit
  in the bottom third. It ranks *bouncy and light*, which is not the claim
  "best" makes.

RunRepeat's own `score` is a one-sided check here for §Checking a set of weights'
reason, and it neither endorses nor arbitrates: the mean of percentiles agrees with it
a little better than worst-of-three does, but **each story alone agrees about as well**,
so combining them buys no agreement — and RR's score cannot rank a shortlist anyway,
since those shoes take barely thirty distinct values with two fifths of them on five
integers. Do not treat a higher agreement figure as a better composite.

The limit is structural, so do not reintroduce a composite in another form: a score
built over these three can express no term they do not already carry.

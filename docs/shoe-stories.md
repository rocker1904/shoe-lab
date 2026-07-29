# Shoe stories

What a runner means by **Easy**, **Tempo** and **Race**, and why. The presets in
`app/src/lib/presets.ts` implement these; docs/app.md §Presets owns the mechanism —
where thresholds live, and that a preset replaces the view rather than layering on it.

This is domain reasoning, not a lab fact. It is recorded because it is expensive to
reconstruct and because every threshold in the app is downstream of it. When a
threshold looks arbitrary, the answer is here.

## The shared rules

- **Thresholds come from the market, not from assumptions about the user.** A price
  cap is a percentile of the live fleet computed at click time, not a number someone
  liked. As the catalogue moves, the preset moves with it.
- **No preset filters by release date.** Recency is a strategy, not a story: buying
  last season's model at a discount and buying the newest thing are both valid, and
  which one you want is not implied by whether you are running easy or racing.
- **Anything that is genuinely a user decision stays with the user.** Where the
  evidence does not settle a question, the preset takes no position and leaves the
  filter free. Carbon plates in a tempo shoe are the standing example.

## How a story becomes a threshold

Each story names a quality; the fleet only measures metrics. The mapping is a
judgement, so it is recorded here rather than left implicit in
`app/src/lib/presets.ts`.

| quality | metric | why this one |
|---|---|---|
| comfort for long miles | stack | the best-covered cushioning proxy the fleet has, and it separates cleanly |
| softness | *nothing* | see below — deliberately unbounded |
| speed | weight **and** energy return | the two things a fast shoe is; measured directly rather than inferred from a plate |
| repeatability | price | cost per mile, with a real durability metric available but unused (see Easy) |
| plate character | plate | only ever to exclude carbon, never to require it |

**Softness is deliberately not bounded**, even in Easy, where comfort is the whole
point. The current softness method covers a hair over half the fleet, so bounding it
silently discards nearly half the candidates — and it does not measurably improve the
shortlist in return: the shoes it removes are not the ones a runner would call wrong
for the session. Stack does that work instead, at full coverage.

Its coverage also sits a whisker above the threshold that triggers the app's sparse
warning (docs/app.md §Coverage), so a preset bounding it is one quiet refresh away from
recommending against itself.

**A plate is never a requirement.** Requiring carbon for Race is *measurably worse*
than defining Race by weight and energy return: it lets in heavy carbon max-cushion
trainers and shuts out genuinely fast unplated flats. Plate earns its place in Easy
only as an exclusion.

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
threshold set it is excellent: apply the thresholds, then look at what fraction of the
shortlist carries the label you would expect.

Easy and Race both score highly this way. Tempo does not yet, which is the evidence
behind its open question below. A change to any threshold should be scored this way
before it lands, and a change that lowers the score needs an argument.

## Easy

The bulk of the training week. The point is time on feet — building the aerobic
adaptations (heart, lungs, mitochondrial density, blood volume) and running economy —
not teaching the legs to move fast. So:

- **Comfort is the priority**, because the goal is to accumulate a lot of miles
  without accumulating damage. Stack is floored at the **median** of the
  fleet's readings on the runner's side — "as much cushioning as most of the
  catalogue" — and nothing else about the ride is bounded.
- **Explosiveness is a bonus, not a requirement.** A lively ride is fun and fun keeps
  you running, but it is not what the session is for.
- **No carbon plate.** Not because plates are bad, but because a carbon racing plate
  is the signature of a shoe built for a different job. Nylon and plastic plates are
  fine and often appear in stability trainers, so the rule is *not carbon* rather than
  *no plate at all* — excluding every plated shoe would throw out a stack of ordinary
  daily trainers.
- **Price matters**, because this is where the miles go and therefore where cost per
  mile bites. Capped at the 80th percentile of the fleet.

Durability ought to matter here for the same reason. It is not currently part of the
preset, but `outsole-durability` is a real continuous measurement with good coverage
if it is ever wanted; the two rating-based durability tests are 1–5 buckets and too
coarse to bound on.

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
  not at all, and there is no fleet-wide answer, so it stays a filter rather than a
  preset rule.

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

## Easy

The bulk of the training week. The point is time on feet — building the aerobic
adaptations (heart, lungs, mitochondrial density, blood volume) and running economy —
not teaching the legs to move fast. So:

- **Comfort is the priority**, because the goal is to accumulate a lot of miles
  without accumulating damage. High stack, nothing harsh.
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

**Open:** the current threshold set does not express "light", which the session
implies. Energy return and a price cap alone admit too many ordinary daily trainers.

## Race

One day, one goal. Everything is subordinate to speed.

- **No price cap.** Absolute performance is the point and cost per mile is irrelevant
  over a handful of race days.
- **Carbon is not required.** A plate is a means to an end, and the end is speed —
  measured directly by weight and energy return. Gating on carbon is both less
  accurate and less honest: it admits heavy carbon max-cushion trainers while
  excluding genuinely fast unplated flats.
- **Stability is not baked in.** It matters to some runners a great deal and to others
  not at all, and there is no fleet-wide answer, so it stays a filter rather than a
  preset rule.

export type Direction = 'higher' | 'lower' | 'neutral';

/**
 * Declared per metric, never inferred from a slug or a name: `outsole-durability` is Dremel
 * dent depth in mm, so more is worse despite the name, and `size-rating` is a runs-small /
 * true / runs-large scale where 3 is correct rather than a five-point quality score.
 * Stability and softness are neutral because docs/shoe-stories.md argues there is no
 * fleet-wide answer to either. An unlisted key reads `neutral`, so a new upstream test is
 * unmarked rather than mis-marked, and direction.test.ts fails the build when one appears
 * (docs/operations.md §Contract-drift runbook).
 */
export const DIRECTION: Record<string, Direction> = {
  breathability: 'higher', 'breathability-25': 'higher', 'drying-potential': 'higher',
  'sweat-evaporated': 'higher', 'toebox-durability': 'higher', 'heel-padding-durability': 'higher',
  'toe-guard-durability': 'higher',
  'energy-return-heel': 'higher', 'energy-return-forefoot': 'higher',
  'shock-absorption-heel': 'higher', 'shock-absorption-forefoot': 'higher',
  'forefoot-traction': 'higher', 'heel-traction': 'higher', 'forefoot-traction-stop': 'higher',
  score: 'higher',

  weight: 'lower', price: 'lower', msrpGbp: 'lower', 'outsole-durability': 'lower',
  'difference-in-midsole-softness-in-cold': 'lower', 'difference-in-stiffness-in-cold': 'lower',
  'sweat-on-skin': 'lower', 'sweat-in-shoe': 'lower',

  'forefoot-stack': 'neutral', 'heel-stack': 'neutral', drop: 'neutral', rocker: 'neutral',
  'outsole-thickness': 'neutral', 'outsole-hardness': 'neutral', 'lug-depth': 'neutral',
  'midsole-softness': 'neutral', 'midsole-softness-22': 'neutral',
  'midsole-softness-in-cold': 'neutral', 'midsole-softness-in-cold-22': 'neutral',
  'midsole-softness-in-the-forefoot': 'neutral', 'midsole-softness-in-the-forefoot-22': 'neutral',
  'secondary-foam-softness': 'neutral', 'secondary-foam-softness-22': 'neutral',
  stiffness: 'neutral', 'stiffness-in-cold': 'neutral', 'flexibility-stiffness': 'neutral',
  'torsional-rigidity': 'neutral', 'torsional-rigidity-23': 'neutral',
  'heel-counter-stiffness': 'neutral', 'lateral-stability-test': 'neutral',
  'midsole-width-in-the-forefoot': 'neutral', 'midsole-width-in-the-heel': 'neutral',
  'toebox-width-at-the-widest-part': 'neutral', 'toebox-width-widest-part': 'neutral',
  'toebox-width-at-the-big-toe': 'neutral', 'toebox-width-big-toe': 'neutral',
  'toebox-height': 'neutral', 'internal-length': 'neutral',
  'insole-thickness': 'neutral', 'tongue-padding': 'neutral', 'size-rating': 'neutral',
  insulation: 'neutral',
  releasedAt: 'neutral',
};

export function directionOf(key: string): Direction {
  return DIRECTION[key] ?? 'neutral';
}

/** Blue means "better", so a metric with no direction gets the neutral grey ramp instead. */
export function washOf(key: string): 'blue' | 'grey' {
  return directionOf(key) === 'neutral' ? 'grey' : 'blue';
}

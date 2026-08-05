import { directionOf, type Direction } from './direction';

export interface MetricHelpFact {
  text: string;
  source?: { label: string; href: string };
}

const METHOD = { label: 'RunRepeat method', href: 'https://runrepeat.com/testing-methodology' };
const FIT_POLL = { label: 'RunRepeat owner-vote example', href: 'https://runrepeat.com/uk/nike-initiator' };
const PRICE_METHOD = {
  label: 'RunRepeat price guide',
  href: 'https://runrepeat.com/guides/behind-the-price-tag-of-running-shoes',
};
const method = (text: string): MetricHelpFact => ({ text, source: METHOD });

const stack = method('RunRepeat cuts the shoe lengthwise and measures stack at its centre: heel at 12% and forefoot at 75% of the internal length, with the insole included.');
const energyReturn = method('RunRepeat drops an 8.5 kg mass onto the heel or forefoot and reports the percentage of the input energy returned after conditioning repetitions.');
const shockAbsorption = method('RunRepeat drops an 8.5 kg mass onto the heel or forefoot and reports the impact energy absorbed under its ASTM-based test in SA.');
const midsoleWidth = method('RunRepeat uses a caliper to measure the widest part of the shoe’s external midsole platform at the heel or forefoot.');
const oldSoftness = method('RunRepeat presses a Shore A durometer into the exposed midsole foam at room temperature; a higher HA reading means firmer foam.');
const currentSoftness = method('RunRepeat presses an Asker C durometer into the exposed midsole foam at room temperature; a higher AC reading means firmer foam.');
const oldColdSoftness = method('After 20 minutes in a freezer, RunRepeat measures the exposed midsole foam with a Shore A durometer; a higher HA reading means firmer foam.');
const currentColdSoftness = method('After 20 minutes in a freezer, RunRepeat measures the exposed midsole foam with an Asker C durometer; a higher AC reading means firmer foam.');

/**
 * App-authored facts about RunRepeat fields. This is intentionally sparse with respect to future
 * catalogues: a new upstream metric must remain usable while its methodology is researched.
 */
const metricHelp: Record<string, MetricHelpFact> = {
  breathability: method('RunRepeat pumps smoke through the toebox and visually rates the airflow from 1 to 5, supported by light and microscope inspection of the upper.'),
  'breathability-25': method('RunRepeat’s SATRA TM376-based test uses a heated sweating footform for 3 hours and reports how effectively the shoe moves moisture away from the simulated skin in BR.'),
  'sweat-on-skin': method('The percentage of artificial sweat remaining on the simulated skin after RunRepeat’s 3-hour heated-footform breathability test.'),
  'sweat-in-shoe': method('The percentage of artificial sweat retained by the shoe after RunRepeat’s 3-hour heated-footform breathability test.'),
  'sweat-evaporated': method('The percentage of artificial sweat that evaporates during RunRepeat’s 3-hour heated-footform breathability test.'),
  'drying-potential': method('The percentage of moisture that evaporates from the whole shoe during RunRepeat’s 3-hour heated-footform test.'),

  'toebox-durability': method('RunRepeat applies a standardised Dremel abrasion to the toebox material and visually rates the resulting damage from 1 to 5.'),
  'heel-padding-durability': method('RunRepeat applies a standardised Dremel abrasion to the heel-collar lining and visually rates the resulting damage from 1 to 5.'),
  'outsole-durability': method('RunRepeat applies a standardised Dremel abrasion to the outsole and measures the resulting dent depth with a tread gauge.'),
  'outsole-thickness': method('RunRepeat cuts the shoe in half and measures the rubber outsole’s thickness with a caliper, excluding any separate lug height.'),
  'outsole-hardness': method('RunRepeat measures the outsole rubber at room temperature with a Shore C durometer; a higher HC reading means harder rubber.'),

  'forefoot-stack': stack,
  'heel-stack': stack,
  drop: method('Heel-to-toe drop is calculated from RunRepeat’s lab measurements: heel stack minus forefoot stack.'),
  'midsole-softness': oldSoftness,
  'midsole-softness-22': currentSoftness,
  'midsole-softness-in-cold': oldColdSoftness,
  'midsole-softness-in-cold-22': currentColdSoftness,
  'difference-in-midsole-softness-in-cold': method('The percentage change between the midsole’s room-temperature durometer reading and its reading after 20 minutes in a freezer.'),
  'secondary-foam-softness': oldSoftness,
  'secondary-foam-softness-22': currentSoftness,
  'energy-return-heel': energyReturn,
  'energy-return-forefoot': energyReturn,
  'shock-absorption-heel': shockAbsorption,
  'shock-absorption-forefoot': shockAbsorption,

  stiffness: method('RunRepeat’s original flex test uses a force gauge to measure the resistance while bending the shoe from 0° towards 90°, reported in newtons.'),
  'flexibility-stiffness': method('RunRepeat fixes the forefoot and measures the force in newtons needed to bend the shoe to 30° from its rocker-adjusted starting position.'),
  'stiffness-in-cold': method('RunRepeat measures the shoe’s bending force after it has spent 20 minutes in a freezer, using the original force-gauge flex method.'),
  'difference-in-stiffness-in-cold': method('The percentage change between the shoe’s room-temperature bending force and its bending force after 20 minutes in a freezer.'),
  'torsional-rigidity': method('RunRepeat manually twists the shoe and rates its resistance from 1 to 5, where 5 is the most rigid.'),
  'torsional-rigidity-23': method('RunRepeat measures the torque needed to twist the fixed shoe by 10° medially and laterally, then sums the two sixth readings in Nm.'),
  'heel-counter-stiffness': method('RunRepeat squeezes the heel counter from the sides and pushes it from the rear, rating its stiffness from 1 to 5.'),

  weight: method('RunRepeat weighs the whole shoe before wear testing and reports a men’s US size 9 or its size-adjusted equivalent in grams.'),
  'midsole-width-in-the-forefoot': midsoleWidth,
  'midsole-width-in-the-heel': midsoleWidth,
  'toebox-width-at-the-widest-part': method('RunRepeat’s original fit method uses a caliper to measure the upper at its widest forefoot point.'),
  'toebox-width-widest-part': {
    text: 'RunRepeat makes a gel mould of the shoe interior and measures its widest forefoot point between the first and fifth metatarsal joints.',
    source: METHOD,
  },
  'toebox-width-at-the-big-toe': method('RunRepeat’s original fit method uses a caliper to measure the upper near the big-toe area.'),
  'toebox-width-big-toe': {
    text: 'RunRepeat measures the internal gel mould 28.3 mm from its tip to capture width around the big-toe area and the toebox taper.',
    source: METHOD,
  },
  'toebox-height': {
    text: 'RunRepeat measures the vertical space in the internal gel mould 28.3 mm from its tip.',
    source: METHOD,
  },
  'internal-length': {
    text: 'RunRepeat flattens the shoe and uses a caliper to measure its internal length from the heel to the toe bumper in millimetres.',
    source: METHOD,
  },
  'size-rating': {
    text: 'The average of RunRepeat owner votes on a five-point length scale: 3 is true to size, with lower values smaller and higher values larger.',
    source: FIT_POLL,
  },
  'insole-thickness': method('RunRepeat removes the insole and measures its thickness at the centre of the heel with a caliper.'),
  'tongue-padding': method('RunRepeat measures the thickest part of the tongue with a caliper.'),

  'forefoot-traction': method('RunRepeat presses the shoe against wet concrete with 500 N of force at a 7° angle and reports the forefoot’s dynamic coefficient of friction.'),

  msrpGbp: {
    text: 'The manufacturer’s suggested retail price recorded by RunRepeat in GBP: the list price at release, not a current offer or a price for the user’s region.',
    source: PRICE_METHOD,
  },
  score: {
    text: 'RunRepeat’s own 0–100 verdict from its review, not a score calculated by Shoe Lab.',
  },
};

// The catalogue's `price` test and the app's `msrpGbp` field are one resolved filter
// (docs/app.md §Resolved price), so their provenance must be one object as well.
metricHelp.price = metricHelp.msrpGbp!;

export const METRIC_HELP: Readonly<Record<string, MetricHelpFact>> = metricHelp;

export function metricHelpOf(key: string): MetricHelpFact | undefined {
  return METRIC_HELP[key];
}

const INTERPRETATION: Record<Direction, string> = {
  higher: 'Higher readings are better.',
  lower: 'Lower readings are better.',
  neutral: 'Neither end is universally better.',
};

export function metricInterpretation(key: string): string {
  return INTERPRETATION[directionOf(key)];
}

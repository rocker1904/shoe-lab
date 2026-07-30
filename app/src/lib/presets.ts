import { sideKey, type Side } from './lineage';
import { EASY, RACE, TEMPO } from './score-defs';
import { defaultView, type ViewState } from './urlstate';

/**
 * A story is a pool and a ranking, and nothing else — no story bounds a metric any more
 * (docs/app.md §Presets). Which is why nothing here reads the fleet: a threshold resolved against
 * the loaded catalogue was the only thing that ever needed it. What each score measures is owned by
 * docs/shoe-stories.md and the constants behind it by `score-defs.ts`, so a number here would be a
 * second home for one of them.
 */

/** Six numeric columns is the phone bound (docs/app.md §Columns and sorting), spent on the story's
 *  score and the terms behind it — but not uniformly, and the exceptions are deliberate. Race shows
 *  all three of its terms. Tempo shows three of four, leaving out shock absorption, which is its
 *  floor rather than its point. Easy shows two of three: it drops outsole durability and spends the
 *  slot on weight, which is **not** an Easy term at all but is the number a runner compares trainers
 *  by. Toebox width and stack are what every story gives up — neither is a term anywhere, and fit is
 *  the runner's own final filter rather than something a score can speak to. */
const easyColumns = (strike: Side) =>
  ['releasedAt', EASY.keys[strike], 'score', 'msrpGbp', sideKey('Shock absorption', strike),
    sideKey('Energy return', strike), 'weight', 'plate'];
const tempoColumns = (strike: Side) =>
  ['releasedAt', TEMPO.keys[strike], 'score', 'msrpGbp',
    sideKey('Energy return', strike), 'weight', 'outsole-durability', 'plate'];
const raceColumns = (strike: Side) =>
  ['releasedAt', RACE.keys[strike], 'score', 'msrpGbp',
    sideKey('Energy return', strike), 'weight', sideKey('Shock absorption', strike), 'plate'];

/** No description here: the setup cards carry the only story copy a runner reads, and a second
 *  wording nothing renders is a second home for one fact (docs/README.md §Rules). */
export interface Preset { id: string; label: string }

export const PRESETS: Preset[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'race', label: 'Race' },
];

/** The mapping `(story, strike) -> view`, with nothing special-cased. */
export function applyPreset(id: string, strike: Side, stability: boolean): ViewState {
  const v = defaultView();
  // A preference, not part of what a story is: the marks compare whole views, so rebuilding this
  // from the default would unmark the story the moment the runner set it (docs/app.md §Presets).
  v.stability = stability;
  switch (id) {
    case 'easy': {
      // The precautionary line on carbon plates, drawn for the two stories a runner repeats
      // (docs/shoe-stories.md §Easy).
      v.filters.plate = ['none', 'plated-other'];
      v.sort = { key: EASY.keys[strike], dir: 'desc' };
      v.columns = easyColumns(strike);
      return v;
    }
    case 'tempo': {
      // The same gate, and for a second reason as well: with carbon in, Tempo shares 11 of its top
      // 20 with a pure speed ranking and stops being a second opinion about tempo at all
      // (docs/shoe-stories.md §Tempo).
      v.filters.plate = ['none', 'plated-other'];
      v.sort = { key: TEMPO.keys[strike], dir: 'desc' };
      v.columns = tempoColumns(strike);
      return v;
    }
    case 'race': {
      // No gate at all. Carbon is admitted because race day is where the trade is worth it, and
      // never required — with no plate gate and no plate term the top twelve are carbon anyway
      // (docs/shoe-stories.md §Race).
      v.sort = { key: RACE.keys[strike], dir: 'desc' };
      v.columns = raceColumns(strike);
      return v;
    }
    default:
      throw new Error(`unknown preset: ${id}`);
  }
}

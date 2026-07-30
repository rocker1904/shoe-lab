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

/** Six numeric columns is the phone bound (docs/app.md §Columns and sorting), and each story spends
 *  them on its score and the terms behind it. Toebox width and stack are what the stories give up:
 *  neither is a term, and fit is the runner\'s own final filter rather than something a score speaks
 *  to. Easy and Tempo each leave one term out for want of a seventh slot — Easy outsole durability,
 *  Tempo shock absorption, which is the floor rather than the point. Race shows all three of its. */
const easyColumns = (strike: Side) =>
  ['releasedAt', EASY.keys[strike], 'score', 'msrpGbp', sideKey('Shock absorption', strike),
    sideKey('Energy return', strike), 'weight', 'plate'];
const tempoColumns = (strike: Side) =>
  ['releasedAt', TEMPO.keys[strike], 'score', 'msrpGbp',
    sideKey('Energy return', strike), 'weight', 'outsole-durability', 'plate'];
const raceColumns = (strike: Side) =>
  ['releasedAt', RACE.keys[strike], 'score', 'msrpGbp',
    sideKey('Energy return', strike), 'weight', sideKey('Shock absorption', strike), 'plate'];

export interface Preset { id: string; label: string; describe: string }

export const PRESETS: Preset[] = [
  { id: 'easy', label: 'Easy', describe: 'The bulk of the week — ranked on cushioning, durability and how much the shoe gives back' },
  { id: 'tempo', label: 'Tempo', describe: 'Fast twice a week — ranked on how much the shoe gives back, how little it weighs and how long the outsole lasts' },
  { id: 'race', label: 'Race', describe: 'One day, one goal — ranked on how much the shoe gives back and how little it weighs, with nothing asked of durability' },
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

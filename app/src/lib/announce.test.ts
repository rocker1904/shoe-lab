import { describe, expect, it } from 'vitest';
import { viewAnnouncement } from './announce';
import { indexTests } from './dataset';
import { applyPreset } from './presets';
import { EASY } from './score-defs';
import { TESTS, labTest } from './test-fixtures';
import { defaultColumns, defaultView, type ViewState } from './view';
import { projectZone } from './zone';

const idx = indexTests([...TESTS, labTest({ id: 99, slug: 'stiffness', name: 'Stiffness', units: 'N' })]);
const base = () => defaultView();
const say = (mutate: (v: ViewState) => void, from: ViewState = base()) => {
  const next = structuredClone(from) as ViewState;
  mutate(next);
  return viewAnnouncement(from, next, idx);
};

/**
 * One sentence per control, and the exemptions are as much the policy as the announcements — a
 * control whose own `aria-checked`/`aria-expanded` already says the thing must not be told twice.
 * docs/app.md §What a control says it did
 */
describe('viewAnnouncement announces', () => {
  it('a zone switch, because a radio saying "Forefoot" says nothing about a table', () => {
    expect(viewAnnouncement(base(), projectZone(base(), 'forefoot'), idx))
      .toBe('Measured at the forefoot: columns and scores updated');
    expect(viewAnnouncement(projectZone(base(), 'forefoot'), base(), idx))
      .toBe('Measured at the heel: columns and scores updated');
  });
  it('the stability preference, because the scores behind every value move with it', () => {
    expect(say((v) => { v.stability = true; })).toBe('Stability on: story scores updated');
    const on = { ...base(), stability: true };
    expect(say((v) => { v.stability = false; }, on)).toBe('Stability off: story scores updated');
  });
  it('a filter row arriving, which lands two thousand pixels down a closed drawer', () => {
    expect(say((v) => { v.rows.push('stiffness'); })).toBe('Filter added: Stiffness');
  });
  it('a filter row leaving, and takes its own bound with it', () => {
    const held: ViewState = { ...base(), rows: ['stiffness'], filters: { categorical: {}, ranges: { stiffness: { min: 3 } } } };
    expect(say((v) => { v.rows = []; v.filters.ranges = {}; }, held)).toBe('Filter removed: Stiffness');
  });
  it('a header press, in the words the ordering line uses', () => {
    expect(say((v) => { v.sort = { key: 'weight', dir: 'asc' }; })).toBe('Sorted by Weight, lowest first');
    expect(say((v) => { v.sort = { key: 'name', dir: 'asc' }; })).toBe('Sorted by shoe name, A to Z');
  });
});

describe('viewAnnouncement is silent for', () => {
  // The checkbox IS the column: its `aria-checked` on the control the runner is standing on says
  // "Drop is a column", which is the whole outcome. Saying it again is the double-speak the policy
  // exists to prevent.
  it('the column picker', () => {
    expect(say((v) => { v.columns = [...v.columns, 'stiffness']; })).toBeNull();
    expect(say((v) => { v.columns = v.columns.filter((c) => c !== 'plate'); })).toBeNull();
  });
  // Every one of these moves the row count, and the receipt is the row count's home.
  it('every filter the receipt already reports', () => {
    expect(say((v) => { v.filters.search = 'nimbus'; })).toBeNull();
    expect(say((v) => { v.filters.brands = ['Nike']; })).toBeNull();
    expect(say((v) => { v.filters.discontinued = 'hide'; })).toBeNull();
    expect(say((v) => { v.filters.plate = ['carbon']; })).toBeNull();
    expect(say((v) => { v.filters.ranges['weight'] = { max: 250 }; })).toBeNull();
    expect(say((v) => { v.filters.releasedAfter = '2025-01-01'; })).toBeNull();
  });
  // A feature selection is a filter value like the six above it: the checkbox's own `checked` says
  // it is selected, and what changed on the table is a row count, which is the receipt's. Nothing in
  // `announce.ts` speaks for these today — this is what stops a later rule quietly starting to.
  it('a feature selection arriving, narrowing and going away', () => {
    expect(say((v) => { v.filters.categorical['tongue-gusset-type'] = ['both-sides-semi']; })).toBeNull();
    const held: ViewState = { ...base(),
      filters: { categorical: { 'tongue-gusset-type': ['both-sides-semi', 'none'] }, ranges: {} } };
    expect(say((v) => { v.filters.categorical['tongue-gusset-type'] = ['none']; }, held)).toBeNull();
    expect(say((v) => { delete v.filters.categorical['tongue-gusset-type']; }, held)).toBeNull();
  });
  // The tri-state is a radiogroup, so `aria-checked` already says Yes on the control being pressed;
  // the only other outcome is the count, and that is the receipt's side of the line.
  it('a tri-state being set, switched and cleared', () => {
    expect(say((v) => { v.filters.categorical['removable-insole'] = ['true']; })).toBeNull();
    const on: ViewState = { ...base(), filters: { categorical: { 'removable-insole': ['true'] }, ranges: {} } };
    expect(say((v) => { v.filters.categorical['removable-insole'] = ['false']; }, on)).toBeNull();
    expect(say((v) => { delete v.filters.categorical['removable-insole']; }, on)).toBeNull();
  });
  it('a story, which rewrites the sort and the columns together and moves the count', () => {
    for (const id of ['easy', 'tempo', 'race']) {
      expect(viewAnnouncement(base(), applyPreset(id, 'heel', false), idx), id).toBeNull();
    }
  });
  it('a generation switch, which swaps one row key for another rather than adding one', () => {
    const from: ViewState = { ...base(), rows: ['stiffness'] };
    expect(say((v) => { v.rows = ['weight']; }, from)).toBeNull();
  });
  // Several rows and every bound at once: naming one of them would be a partial account of a
  // whole-surface action the receipt reports honestly.
  it('Clear filters over more than one bound', () => {
    const from: ViewState = { ...base(), rows: ['stiffness'],
      filters: { categorical: {}, ranges: { stiffness: { min: 3 }, weight: { max: 250 } } } };
    expect(say((v) => { v.rows = []; v.filters = { categorical: {}, ranges: {} }; }, from)).toBeNull();
  });
  // The reachable composition rather than a contrived one: `Clear filters` over a SINGLE hand-added
  // row takes that row, its own bound and a held feature selection in one press — the shape where
  // `rowNote` is otherwise happy to report the row alone, which would be a partial account of a
  // whole-surface action. The facet going with it is what makes "nothing else changed" false.
  it('Clear filters over one row while a feature selection is held', () => {
    const from: ViewState = { ...base(), rows: ['stiffness'],
      filters: { categorical: { 'tongue-gusset-type': ['none'] }, ranges: { stiffness: { min: 3 } } } };
    expect(say((v) => { v.rows = []; v.filters = { ranges: {}, categorical: {} }; }, from)).toBeNull();
  });
  it('a view that did not change at all', () => {
    expect(viewAnnouncement(base(), base(), idx)).toBeNull();
  });
  // Unticking both measurement columns leaves the view naming neither half. That is a column
  // change, and column changes are exempt.
  it('a view that stops naming a zone', () => {
    const bare = { ...base(), columns: defaultColumns('heel').filter((c) => !/stack|energy/.test(c)) };
    expect(viewAnnouncement(base(), bare, idx)).toBeNull();
  });
});

describe('viewAnnouncement precedence', () => {
  // A zone click on a story view rebuilds the whole view — sort, columns and the story's plate
  // gate — and the one thing a runner needs told is which half they are now looking at.
  it('names the zone when a story moves with it', () => {
    const easy = applyPreset('easy', 'heel', false);
    expect(viewAnnouncement(easy, applyPreset('easy', 'forefoot', false), idx))
      .toBe('Measured at the forefoot: columns and scores updated');
  });
  // `All` from a story resets the sort and the columns together, so nothing claims the sort.
  it('leaves All to the receipt', () => {
    expect(viewAnnouncement(applyPreset('easy', 'heel', false), base(), idx)).toBeNull();
  });
  // One action, one sentence: a row arriving *while* a facet moves is not the row's story to tell,
  // and `rowNote`'s "nothing else changed" guard is what refuses it — `nonRangeFilters` carries
  // `categorical`, so the guard sees the facet without a line of its own.
  it('leaves a row arrival unannounced when a facet moved in the same view', () => {
    expect(say((v) => { v.rows.push('stiffness'); v.filters.categorical['heel-tab'] = ['pull-tab']; })).toBeNull();
  });
  it('reads a score sort through the score label', () => {
    expect(say((v) => { v.sort = { key: EASY.keys.heel, dir: 'desc' }; }))
      .toBe('Sorted by Easy heel score, highest first');
  });
});

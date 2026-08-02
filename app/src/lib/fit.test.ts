import { describe, expect, it } from 'vitest';
import type { ShoesFile } from '../../../shared/types.js';
import { indexTests } from './dataset';
import {
  availableForTable, cellMaxPx, DESKTOP_FLOOR_PX, desktopMinWidth, FIT_SLACK_PX, fitModel,
  fitsDesktop, headerMinPx, rendersPhone, SIDEBAR_PERMANENT_PX,
} from './fit';
import { FLEET, labTest, shoe, TESTS } from './test-fixtures';

const data = (over: Partial<ShoesFile> = {}): ShoesFile => ({
  builtAt: '2026-01-01T00:00:00.000Z', source: 'test', groups: [], tests: TESTS, shoes: FLEET,
  ...over,
} as ShoesFile);

const model = (over: Partial<ShoesFile> = {}) => {
  const d = data(over);
  return fitModel(d, indexTests(d.tests));
};

/**
 * The model is arithmetic over generated font tables, so these are value assertions and the numbers
 * move whenever the tables are regenerated. What holds them honest against a real browser is not
 * this file — it is `cross-browser.spec.ts`, which mounts the real table and compares the model to
 * the min-content the engine actually chooses. These assert the SHAPE: which term wins in a column,
 * what a phrase costs against a figure, and that the decision reacts to what it is supposed to.
 */
describe('the desktop table\'s min-content model', () => {
  it('reserves the sort caret in every column, sorted or not', () => {
    // `Plate` carries no units, so its header is the label plus the mark and nothing else. The
    // caret is drawn in every sortable column, which is why it is in every column's minimum.
    const withCaret = headerMinPx('plate', undefined);
    const label = headerMinPx('plate', undefined) - 12;
    expect(withCaret).toBeGreaterThan(label);
    expect(withCaret - label).toBe(12);
  });

  it('takes a header\'s longest word, not its whole label — the headers wrap', () => {
    const long = labTest({ id: 900, slug: 'x', name: 'Shock absorption in the heel of the shoe' });
    const short = labTest({ id: 901, slug: 'y', name: 'absorption' });
    expect(headerMinPx('x', long)).toBe(headerMinPx('y', short));
  });

  it('breaks an unmeasured slug after its hyphens, as the engines do', () => {
    // A column a URL may still name after the catalogue has dropped it renders as its raw slug
    // (docs/app.md §Columns are permissive, ranges and sorts are strict). Treated as one word it
    // measured 150px against a rendered 76px.
    const whole = headerMinPx('stack-height-heel', undefined);
    const widest = headerMinPx('height-', undefined);
    expect(whole).toBe(widest);
  });

  it('sizes a phrase column by the widest string the loaded fleet renders', () => {
    // `nowrap` on the cell, so the whole string is the minimum — and it is the FLEET's string, which
    // no constant can state (docs/app.md §Table presentation).
    const narrow = model({ shoes: FLEET.map((s) => ({ ...s, plate: 'none' as const })) });
    const wide = model({ shoes: FLEET.map((s) => ({ ...s, plate: 'plated-other' as const })) });
    expect(wide.columnPx('plate')).toBeGreaterThan(narrow.columnPx('plate'));
  });

  it('sizes a figure column by its longest number, in one mono advance', () => {
    const idx = indexTests(TESTS);
    const of = (v: number) => cellMaxPx('weight', [shoe({ slug: 'a', values: { '24': v } })], idx,
      new Set());
    // `tabular-nums` makes every character the same width, so three more of them is exactly three
    // advances more.
    expect(of(200.25) - of(200)).toBeCloseTo(3 * 8.71, 2);
  });

  it('lets the header win where the header is wider than every figure under it', () => {
    // `Removable insole` reads Yes / No in its cells and the label is what the column has to hold.
    const m = model();
    expect(m.columnPx('removable-insole')).toBe(headerMinPx('removable-insole',
      indexTests(TESTS).bySlug.get('removable-insole')) + 16);
  });

  it('bounds a score column, whose values are the view\'s rather than the dataset\'s', () => {
    // No shoe in the fixture carries a resolved score, so a model that read the data would report
    // an em dash's width and lose the column the moment a story was picked
    // (docs/app.md §The story scores).
    const m = model();
    expect(m.columnPx('easy-score-heel')).toBeGreaterThan(6 * 8.71);
  });

  it('sums the columns onto the name column and the panel\'s own borders', () => {
    const m = model();
    const two = desktopMinWidth(['weight', 'plate'], m);
    expect(two).toBe(224 + 16 + 2 + m.columnPx('weight') + m.columnPx('plate'));
    expect(desktopMinWidth([], m)).toBe(242);
  });

  it('answers the same width twice without recomputing the fleet', () => {
    const m = model();
    expect(m.columnPx('plate')).toBe(m.columnPx('plate'));
  });
});

describe('which rendering the width and the columns choose', () => {
  it('drops the sidebar\'s track from the available width exactly where the sidebar takes one', () => {
    expect(availableForTable(SIDEBAR_PERMANENT_PX - 1)).toBe(SIDEBAR_PERMANENT_PX - 1 - 16);
    expect(availableForTable(SIDEBAR_PERMANENT_PX)).toBe(SIDEBAR_PERMANENT_PX - 16 - 260);
  });

  it('holds the desktop table to the slack, not merely to the width', () => {
    const m = model();
    const need = desktopMinWidth(['weight', 'plate'], m);
    expect(fitsDesktop(['weight', 'plate'], need + FIT_SLACK_PX, m)).toBe(true);
    expect(fitsDesktop(['weight', 'plate'], need + FIT_SLACK_PX - 1, m)).toBe(false);
  });

  it('renders the phone list below the floor whatever the arithmetic says', () => {
    const m = model();
    // Two columns fit inside 690px of window several times over; the floor is what stops a
    // two-column desktop table being offered as a phone design.
    expect(fitsDesktop(['weight'], availableForTable(DESKTOP_FLOOR_PX - 1), m)).toBe(true);
    expect(rendersPhone(['weight'], DESKTOP_FLOOR_PX - 1, m)).toBe(true);
    expect(rendersPhone(['weight'], DESKTOP_FLOOR_PX, m)).toBe(false);
  });

  it('changes its mind when a column is ticked, at a width that has not moved', () => {
    const m = model();
    const cols = ['plate', 'weight', 'heel-stack', 'energy-return-heel', 'releasedAt',
      'removable-insole', 'heel-tab'];
    const width = desktopMinWidth(cols, m) + FIT_SLACK_PX + 16;
    expect(rendersPhone(cols, width, m)).toBe(false);
    expect(rendersPhone([...cols, 'tongue-gusset-type'], width, m)).toBe(true);
  });

  it('hands the phone rendering a window the table cannot fit, sidebar or no sidebar', () => {
    const m = model();
    const many = [...TESTS.map((t) => t.slug), 'releasedAt', 'msrpGbp'];
    expect(rendersPhone(many, 1400, m)).toBe(true);
    expect(rendersPhone(many, 1024, m)).toBe(true);
  });
});

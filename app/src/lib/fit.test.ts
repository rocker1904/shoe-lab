import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The e2e column sets, imported into the unit run on purpose: `FIT_SETS.phrases` is a claim about
// the committed fleet that only this file can check, and a claim two files assert in prose and
// neither enforces is the drift docs/policies.md §Vocabulary exists to stop. Nothing else crosses
// the boundary — `fit-support.ts`'s Playwright import is a type and erases.
import { FIT_SETS } from '../../e2e/fit-support';
import type { ShoesFile } from '../../../shared/types.js';
import { indexTests } from './dataset';
import {
  availableForTable, cellMaxPx, columnWidths, DESKTOP_FLOOR_PX, desktopMinWidth, FIT_SLACK_PX,
  type FitModel, fitModel, fitsDesktop, headerMaxPx, headerMinPx, nameCellMaxPx, nameCellMinPx,
  rendersPhone, sidebarPermanent, sidebarPermanentAt, SIDEBAR_PERMANENT_PX,
} from './fit';
import { DERIVED_ZONE_PAIRS } from './lineage';
import { FLEET, labTest, shoe, TESTS } from './test-fixtures';
import { isFigure } from './units';

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

  it('treats no hyphen as a break opportunity, whatever sits either side of it', () => {
    // **Over-reservation, not a model of any engine.** Every engine breaks at SOME hyphens and no
    // two agree on which: Chromium and WebKit break `10-12`, `abc-12` and `breathability-25` alike
    // while Firefox leaves all three whole, so a rule tuned to either puts the model UNDER the
    // other engine's min-content — a header hanging out of a declared column. The whole token is
    // the widest answer any engine can give, so a model built on it can only be too wide, and the
    // price is a raw-slug header (docs/app.md §Table presentation).
    //
    // Stated as min == max: an unbreakable string has one width, and only a splitter that leaves
    // the hyphen alone makes the two agree.
    for (const slug of ['10-12', '2024-2025', 'abc-12', '10-abc', 'a-1',
      'breathability-26', 'stack-height-heel']) {
      expect(headerMinPx(slug, undefined), slug).toBe(headerMaxPx(slug, undefined));
    }
  });

  it('breaks at whitespace, which is the whole of the rule', () => {
    // The other half: a splitter that broke nowhere would make every header's minimum its whole
    // label, which is what `nowrap` on a `th` used to do and what pushed the document sideways.
    expect(headerMinPx('Shock absorption heel', undefined))
      .toBeLessThan(headerMaxPx('Shock absorption heel', undefined));
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

/**
 * The other half of the same arithmetic, and it exists for a different consumer: the min-content is
 * what decides which rendering mounts, and the max-content is what decides how a fixed table shares
 * the width it has been given (docs/app.md §Table presentation). These assert the SHAPE too — which
 * columns have two widths and which have one, and what the second one is made of.
 *
 * **Nothing committed yet holds these numbers to a browser, and that is the one place the two halves
 * differ.** `fit-support.ts`'s `measureFit` asks a mounted table for `min-content` alone, so
 * `cross-browser.spec.ts` guards the minimum in three engines and says nothing about the maximum.
 * Giving it a measurement path of its own belongs with the declared widths that will consume it;
 * until then this file is the whole of the committed guard.
 */
describe('the desktop table\'s max-content model', () => {
  it('takes a header\'s whole label where the minimum takes its longest word', () => {
    const long = labTest({ id: 900, slug: 'x', name: 'Shock absorption in the heel of the shoe' });
    expect(headerMaxPx('x', long)).toBeGreaterThan(headerMinPx('x', long));
  });

  it('reserves the caret once, exactly as the minimum does', () => {
    // `Plate` is one word carrying no units, so its whole label IS its longest word — which makes
    // the two widths equal, and equal only if both count the mark the same way.
    expect(headerMaxPx('plate', undefined)).toBe(headerMinPx('plate', undefined));
  });

  it('lets the units line win where it is wider than the whole label', () => {
    // The units line cannot wrap at all, so it is the same term in both widths rather than a
    // second measurement (docs/app.md §Table presentation).
    const wordy = labTest({ id: 901, slug: 'u', name: 'A', units: 'mmmmmm' });
    expect(headerMaxPx('u', wordy)).toBe(headerMinPx('u', wordy));
    expect(headerMaxPx('u', wordy)).toBe(6 * 7);
  });

  it('gives a column of nowrap phrases one width rather than two', () => {
    // The premise the distribution rule is built on: `Released` and `Plate` carry unbreakable
    // phrases under one-word headers, so extra width buys them nothing at all.
    const m = model();
    expect(m.columnMaxPx('releasedAt')).toBe(m.columnPx('releasedAt'));
    expect(m.columnMaxPx('plate')).toBe(m.columnPx('plate'));
  });

  it('separates the two widths exactly where the header wraps', () => {
    const m = model();
    expect(m.columnMaxPx('score')).toBeGreaterThan(m.columnPx('score'));
  });

  it('shares the cell measurement with the minimum rather than taking it twice', () => {
    // A wider phrase in the fleet moves both widths by the same amount, which it can only do if
    // `cellMaxPx` is the one term under both.
    const narrow = model({ shoes: FLEET.map((s) => ({ ...s, plate: 'none' as const })) });
    const wide = model({ shoes: FLEET.map((s) => ({ ...s, plate: 'plated-other' as const })) });
    expect(wide.columnMaxPx('plate') - narrow.columnMaxPx('plate'))
      .toBe(wide.columnPx('plate') - narrow.columnPx('plate'));
  });

  it('bounds a score column, which has no cells in any dataset', () => {
    const m = model();
    expect(m.columnMaxPx('easy-score-heel'))
      .toBe(16 + headerMaxPx('easy-score-heel', undefined));
    expect(m.columnMaxPx('easy-score-heel')).toBeGreaterThan(m.columnPx('easy-score-heel'));
  });

  it('answers for the name column, which no column set ever names', () => {
    // `columnMaxPx` is total where `columnPx` is not asked for the name: the name column is the
    // table's first, so the rule that shares a track has to be able to ask about it.
    const m = model();
    expect(m.columnMaxPx('name')).toBe(16 + nameCellMaxPx(FLEET));
  });

  it('measures the name cell as the chevron, the widest name and the gap between them', () => {
    const long = shoe({ slug: 'a', name: 'mmmmmmmmmm' });
    const short = shoe({ slug: 'b', name: 'm' });
    expect(nameCellMaxPx([long, short])).toBe(nameCellMaxPx([long]));
    // The name is set in the bold face, which is a table of its own: `m` is 13px there against the
    // phrase face's 12.
    expect(nameCellMaxPx([long]) - nameCellMaxPx([short])).toBe(9 * 13);
  });

  it('counts the discontinued chip only on the shoes that carry one', () => {
    const plain = shoe({ slug: 'a', name: 'Racer' });
    const gone = shoe({ slug: 'b', name: 'Racer', discontinued: true });
    expect(nameCellMaxPx([plain])).toBeLessThan(nameCellMaxPx([gone]));
    // The chip is a fixed string in a fixed box, so it is one measured token rather than a fourth
    // font table (`DiscontinuedTag.svelte`).
    expect(nameCellMaxPx([gone]) - nameCellMaxPx([plain])).toBeCloseTo(110.64, 2);
  });

  it('keeps the name column\'s MINIMUM the DECLARED floor while the fleet fits inside it', () => {
    // `min-width: 14rem` is what the engine floors that column at, and every word in this fleet is
    // narrower — so the name is the one column whose two widths come from two different kinds of
    // fact, and while the floor binds only the max one moves with the fleet.
    const short = model();
    const long = model({ shoes: [shoe({ slug: 'a', name: 'New Balance FuelCell SuperComp Elite' })] });
    expect(short.columnPx('name')).toBe(224 + 16);
    expect(long.columnPx('name')).toBe(short.columnPx('name'));
    expect(long.columnMaxPx('name')).toBeGreaterThan(short.columnMaxPx('name'));
    expect(long.columnMaxPx('name')).toBeGreaterThan(long.columnPx('name'));
  });
});

/**
 * The name column's floor, which is the one minimum in the table that is a CSS declaration rather
 * than a measurement — and therefore the one that can be crossed by a name nobody here chose. A
 * declared column width turns that from "the column widens" into "the cell overflows", so the floor
 * takes the fleet's own longest unbreakable token wherever that is wider
 * (docs/app.md §Table presentation).
 */
describe('the name column\'s floor under the fleet\'s longest unbreakable token', () => {
  it('measures the cell\'s minimum as the chevron, the gap and the longest WORD', () => {
    // Not the longest name: the name cell is the one cell in the table that wraps, so its minimum
    // is a word rather than a string. The chevron and the gap are flex furniture and cannot break
    // away from it, which is why they are in the minimum too.
    const one = shoe({ slug: 'a', name: 'mmmm mmmmmmmmmm mmm' });
    const two = shoe({ slug: 'b', name: 'mmmmmmmmmm' });
    expect(nameCellMinPx([one])).toBe(nameCellMinPx([two]));
    expect(nameCellMinPx([two]) - nameCellMinPx([shoe({ slug: 'c', name: 'm' })])).toBe(9 * 13);
  });

  it('glues the discontinued chip to the name\'s LAST word, where the markup glues it', () => {
    // `<strong>{name}</strong><DiscontinuedTag/>` with no whitespace between, so the chip's
    // `margin-left` is CSS rather than a break opportunity and no engine breaks there. Measured on
    // the real fleet: `On Cloudmonster` takes 223.64px in Chromium, of which 110.64 is the chip.
    const last = 'm mmmmmmmmmm';
    expect(nameCellMinPx([shoe({ slug: 'a', name: last, discontinued: true })])
      - nameCellMinPx([shoe({ slug: 'b', name: last })])).toBeCloseTo(110.64, 2);
    // The LAST word, not the widest: a chip behind a short final word can break onto its own line
    // and costs the column nothing, which is why the term is per word rather than per name.
    const first = 'mmmmmmmmmm m';
    expect(nameCellMinPx([shoe({ slug: 'c', name: first, discontinued: true })]))
      .toBe(nameCellMinPx([shoe({ slug: 'd', name: first })]));
  });

  it('keeps a hyphenated name whole, which is where this floor is actually reached', () => {
    // The shape that crosses `14rem` in practice is not a 33-character invention: it is an ordinary
    // name with a year or a code hyphenated onto it, and the chip behind it. Measured, a
    // `Speedgoat-2024` cell is 239.82px in Firefox against a 224px content box — so a model that
    // broke the hyphen would declare a width 78px under what that engine needs.
    const gone = shoe({ slug: 'a', name: 'Hoka Speedgoat-2024', discontinued: true });
    expect(nameCellMinPx([gone])).toBeGreaterThan(224);
    expect(model({ shoes: [gone] }).columnPx('name')).toBe(nameCellMinPx([gone]) + 16);
    // The token is the whole of `Speedgoat-2024`, so it is wider than either half of it.
    expect(nameCellMinPx([shoe({ slug: 'b', name: 'Hoka Speedgoat-2024' })]))
      .toBeGreaterThan(nameCellMinPx([shoe({ slug: 'c', name: 'Hoka Speedgoat' })]));
  });

  it('raises the column\'s minimum above the declared floor where a token crosses it', () => {
    // The failure this guard exists for: under a declared width a token wider than `14rem` is an
    // overflowing cell, not a widening column. It takes a name of one long word to reach, which is
    // a shape the fleet already carries — `Cloudmonster`, `Alphabounce+` — at half the length.
    const token = 'Superlightweightcarbonplatedracer';
    const over = model({ shoes: [shoe({ slug: 'a', name: token })] });
    expect(nameCellMinPx([shoe({ slug: 'a', name: token })])).toBeGreaterThan(224);
    expect(over.columnPx('name')).toBe(nameCellMinPx([shoe({ slug: 'a', name: token })]) + 16);
    expect(over.columnPx('name')).toBeGreaterThan(224 + 16);
  });

  it('takes the floor with it into the mount decision', () => {
    // `desktopMinWidth` reads the same width, so a fleet whose names widen the column moves the
    // width at which the desktop table is offered rather than overflowing inside it. Asserted with
    // no columns ticked, because any column set makes the two models differ by their cells too.
    const token = 'Superlightweightcarbonplatedracer';
    const over = model({ shoes: [shoe({ slug: 'a', name: token })] });
    expect(desktopMinWidth([], over)).toBe(over.columnPx('name') + 2);
    expect(desktopMinWidth([], over)).toBeGreaterThan(desktopMinWidth([], model()));
  });
});

/**
 * The rule that turns those two widths into a `<colgroup>`: how a table handed a declared track
 * shares it out. These are arithmetic assertions over the fixture and they are deliberately written
 * against the model rather than against constants, because the font tables move and the SHAPE of
 * the distribution is what is being claimed (docs/app.md §Table presentation).
 *
 * **Nothing here pins the rule to what a browser would have done, and that is the spec's call**
 * (docs/specs/2026-08-03-virtualising-the-table.md §Decisions): the model is the authority, the
 * agreement with CSS auto layout is a convenience, and an assertion that pinned one to the other
 * would make an engine's tie-breaking a requirement of this app.
 */
describe('sharing a declared track between the columns', () => {
  /** Every expectation is over `['name', ...cols]`: the name column is the table's first and is in
   *  no column set, so `columnWidths` prepends it. */
  const keys = (cols: readonly string[]) => ['name', ...cols];
  const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);
  const mins = (cols: readonly string[], m: FitModel) => keys(cols).map((k) => m.columnPx(k));
  /** Floored at the minimum, exactly as the rule floors it: a column's max-content can sit UNDER
   *  its min-content wherever the minimum is a declared floor rather than content — the name
   *  column, on any fleet whose names are shorter than `14rem`. */
  const maxes = (cols: readonly string[], m: FitModel) =>
    keys(cols).map((k) => Math.max(m.columnPx(k), m.columnMaxPx(k)));

  it('prepends the name column, which no column set ever names', () => {
    const m = model();
    const cols = ['weight', 'plate'];
    const w = columnWidths(cols, 900, m);
    expect(w).toHaveLength(cols.length + 1);
    expect(w[0]).toBeGreaterThanOrEqual(m.columnPx('name'));
  });

  it('fills the track exactly, under either clause and at every set', () => {
    // The global constraint the expanded row is the reason for: a table that does not fill its
    // track lays the panel out in a narrower box than the window offers.
    const m = model();
    const sets = [['score'], ['msrpGbp', 'weight', 'plate'],
      ['releasedAt', 'score', 'msrpGbp', 'weight', 'plate', 'removable-insole']];
    for (const cols of sets) {
      for (const trackPx of [sum(mins(cols, m)), 900, 1146, 1440, 2560]) {
        expect(sum(columnWidths(cols, trackPx, m)), `${cols.length} columns at ${trackPx}px`)
          .toBeCloseTo(trackPx, 6);
      }
    }
  });

  it('gives a column that cannot use width nothing at all, while anything still wants some', () => {
    // Clause one, and it is the clause that is right rather than merely conventional: `Plate` is a
    // nowrap phrase under a one-word header and extra width buys it exactly nothing.
    const m = model();
    const cols = ['score', 'plate'];
    const min = mins(cols, m);
    const want = sum(maxes(cols, m)) - sum(min);
    expect(want).toBeGreaterThan(0);
    const w = columnWidths(cols, sum(min) + want / 2, m);
    expect(w[0]).toBeCloseTo(min[0]!, 6);
    expect(w[2]).toBeCloseTo(min[2]!, 6);
    expect(w[1]! - min[1]!).toBeCloseTo(want / 2, 6);
  });

  it('splits the slack in proportion to what each column still needs', () => {
    const m = model();
    const cols = ['score', 'removable-insole'];
    const min = mins(cols, m);
    const max = maxes(cols, m);
    const wants = max.map((v, i) => v - min[i]!);
    expect(wants[1]).toBeGreaterThan(0);
    expect(wants[2]).toBeGreaterThan(0);
    const w = columnWidths(cols, sum(min) + sum(wants) / 2, m);
    w.forEach((v, i) => expect(v - min[i]!).toBeCloseTo(wants[i]! / 2, 6));
  });

  it('puts every column at its max exactly where the columns stop wanting more', () => {
    const m = model();
    const cols = ['score', 'removable-insole', 'plate'];
    const max = maxes(cols, m);
    columnWidths(cols, sum(max), m).forEach((v, i) => expect(v).toBeCloseTo(max[i]!, 6));
  });

  it('shares the excess by max-content once nothing wants more — three columns of figures', () => {
    // The case the second clause exists for, and the one a clause-one-only rule gets wrong: at
    // `?cols=msrpGbp,weight,plate` every column is a nowrap phrase or an unbreakable mono figure,
    // so `want` is zero across the whole table and `slack × want / Σwant` is 0/0. The table would
    // be left short of its track by the whole excess.
    const m = model();
    const cols = ['msrpGbp', 'weight', 'plate'];
    const max = maxes(cols, m);
    expect(sum(max) - sum(mins(cols, m))).toBe(0);
    const trackPx = 1146;
    const w = columnWidths(cols, trackPx, m);
    expect(sum(w)).toBeCloseTo(trackPx, 6);
    const excess = trackPx - sum(max);
    w.forEach((v, i) => expect(v).toBeCloseTo(max[i]! + excess * (max[i]! / sum(max)), 6));
    // Each of them ends WIDER than it asked for. That is the whole claim: a column that cannot use
    // width still has to take some, because the alternative is a table narrower than its track.
    w.forEach((v, i) => expect(v).toBeGreaterThan(max[i]!));
  });

  it('reaches the second clause with the first one still having done work', () => {
    // Σwant is non-zero here, so both clauses run: `score` unwraps its header first, and only the
    // excess beyond that is shared by max-content.
    const m = model();
    const cols = ['score', 'msrpGbp', 'weight', 'plate'];
    const max = maxes(cols, m);
    expect(sum(max) - sum(mins(cols, m))).toBeGreaterThan(0);
    const trackPx = sum(max) + 400;
    const w = columnWidths(cols, trackPx, m);
    w.forEach((v, i) => expect(v).toBeCloseTo(max[i]! + 400 * (max[i]! / sum(max)), 6));
  });

  it('never puts a column under its min-content, at a track that cannot hold them all', () => {
    // The risk is one-sided: too narrow clips a cell, too wide only overruns the panel, and this
    // model errs the second way by construction — every width is `min + share`, share never
    // negative (spec §Failure behaviour).
    const m = model();
    const cols = ['releasedAt', 'score', 'msrpGbp', 'plate'];
    const min = mins(cols, m);
    const w = columnWidths(cols, 10, m);
    w.forEach((v, i) => expect(v).toBeCloseTo(min[i]!, 6));
    expect(sum(w)).toBeGreaterThan(10);
  });

  it('holds the name column at its declared floor where the fleet\'s names are narrower', () => {
    // The fixture's names are one short word, so the name column is the case where max-content
    // sits UNDER min-content — and a share taken in proportion to a max that small would hand the
    // column less than the `14rem` the engine floors it at.
    const m = model();
    expect(m.columnMaxPx('name')).toBeLessThan(m.columnPx('name'));
    const w = columnWidths(['msrpGbp', 'weight', 'plate'], 1146, m);
    expect(w[0]).toBeGreaterThan(m.columnPx('name'));
  });
});

/**
 * The **committed fleet**, not `test-fixtures.ts`: both claims below quantify over strings and
 * figures that arrive from upstream, and a hand-written fixture can never fail on data nobody here
 * chose (`lib/filters.test.ts` says the same). Resolved through `fileURLToPath` because the jsdom
 * environment replaces the global `URL` with one `readFileSync` rejects.
 *
 * **The numbers are pinned rather than bounded, and that is the point.** Each is the headroom under
 * a claim the width model rests on, and a refresh that moves one has to be re-read rather than
 * re-pinned: crossing the first changes which rendering mounts, and crossing the second makes a
 * column's declared width a runner's figure rather than our own header.
 */
const fleet = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8'),
) as ShoesFile;
const fleetIdx = indexTests(fleet.tests);
const SCORE_KEYS: ReadonlySet<string> = new Set(
  DERIVED_ZONE_PAIRS.flatMap((p) => [p.heel, p.forefoot]));

describe('the width guards against the fleet that is actually shipped', () => {
  it('leaves the name column on its declared floor, and says by how little', () => {
    // 0.36px of it, all of which is the discontinued chip's: the widest name cell in the fleet is
    // `On Cloudmonster` — one 12-character word with the chip glued behind it — and it is a third
    // of a pixel under the 14rem the column is declared at. Measured against the engines' own
    // min-content the model is exact in Chromium and 3.1–3.2px wide of Firefox and WebKit, which
    // is the `NAME_PX` table being one engine's (`fit.ts`).
    expect(nameCellMinPx(fleet.shoes)).toBeCloseTo(223.64, 2);
    expect(fitModel(fleet, fleetIdx).columnPx('name')).toBe(224 + 16);
  });

  it('keeps every figure column header-bound, and states the tightest margin', () => {
    // The claim the width model's failure behaviour rests on: a sub-pixel shortfall lands in a
    // header's longest word rather than in a runner's figure, and therefore in the `--s2` padding
    // the cell already carries (docs/app.md §Table presentation). It is a margin and not a law,
    // so the margin is what is asserted.
    const keys = [...fleet.tests.map((t) => t.slug), 'msrpGbp', 'score'];
    const margins = keys.filter((k) => isFigure(k, fleetIdx.bySlug.get(k))).map((k) => ({
      key: k,
      px: headerMinPx(k, fleetIdx.bySlug.get(k))
        - cellMaxPx(k, fleet.shoes, fleetIdx, SCORE_KEYS),
    }));
    expect(margins.filter((m) => m.px <= 0).map((m) => m.key)).toEqual([]);
    // Both of the two tightest are under one mono advance (8.71px), so one more rendered character
    // in either flips that column cell-bound. Nothing breaks the day it does — it is the reasoning
    // above that stops holding, and this is what says so. `Size` is the tightest of all and is in
    // no default view, which is why the wide-set reading missed it.
    const tightest = Math.min(...margins.map((m) => m.px));
    expect(tightest).toBeCloseTo(5.16, 2);
    expect(margins.filter((m) => m.px === tightest).map((m) => m.key)).toEqual(['size-rating']);
    // Both slugs of a superseded pair render the same `Width / Fit` header over the same figures.
    expect(margins.filter((m) => m.key.startsWith('toebox-width-at-the-widest')
      || m.key === 'toebox-width-widest-part').map((m) => m.px))
      .toEqual([expect.closeTo(8.45, 2), expect.closeTo(8.45, 2)]);
  });

  it('names every cell-bound column there is, and the worst excursion among them', () => {
    // The other side of the same claim, and the one a declared width has to be checked hardest
    // against: these are the columns whose minimum is a runner's phrase rather than a header we
    // wrote, so what leaves the box under a model error is upstream's string. `FIT_SETS.phrases`
    // in `app/e2e/fit-support.ts` is the set the three engines mount it against, and comparing the
    // two here is what stops them drifting — in BOTH directions, which the sentence each file used
    // to carry could not do: a fifth cell-bound column in the fleet reddens this, and so does an
    // edit to that array.
    // De-duplicated: the catalogue carries a `plate` test of its own beside the shoe field, and
    // both render the one column.
    const keys = [...new Set([...fleet.tests.map((t) => t.slug), 'releasedAt', 'plate'])];
    const bound = keys.map((k) => ({
      key: k,
      px: cellMaxPx(k, fleet.shoes, fleetIdx, SCORE_KEYS) - headerMinPx(k, fleetIdx.bySlug.get(k)),
    })).filter((m) => m.px > 0 && !isFigure(m.key, fleetIdx.bySlug.get(m.key)));
    expect(bound.map((m) => m.key).sort())
      .toEqual(['heel-tab', 'plate', 'releasedAt', 'tongue-gusset-type']);
    expect(bound.map((m) => m.key).sort()).toEqual([...FIT_SETS['phrases']!].sort());
    // `Extended heel collar` against a `Heel tab` header — twice the next worst, and the widest
    // thing any cell in this table puts past a model that under-measures.
    expect(Math.max(...bound.map((m) => m.px))).toBeCloseTo(87, 2);
  });

  it('excepts the story scores, whose cells are a declared bound rather than data', () => {
    // `SCORE_CELL_CHARS` reserves six characters because a score is the view's rather than the
    // dataset's (`fit.ts`), and the two shortest-labelled heel columns come out cell-bound against
    // it. The model over-reserves there — every score `displayNumber` can emit is narrower — so
    // the exception runs in the safe direction, and naming it is what keeps the claim above from
    // reading wider than it is.
    const cellBound = [...SCORE_KEYS].filter((k) =>
      headerMinPx(k, undefined) < cellMaxPx(k, fleet.shoes, fleetIdx, SCORE_KEYS));
    expect(cellBound.sort()).toEqual(['easy-score-heel', 'race-score-heel']);
  });
});

describe('which rendering the width and the columns choose', () => {
  it('drops the sidebar\'s track from the available width exactly where the sidebar takes one', () => {
    const m = model();
    const narrow = ['plate'];
    expect(availableForTable(narrow, SIDEBAR_PERMANENT_PX - 1, m))
      .toBe(SIDEBAR_PERMANENT_PX - 1 - 16);
    expect(availableForTable(narrow, SIDEBAR_PERMANENT_PX, m))
      .toBe(SIDEBAR_PERMANENT_PX - 16 - 260);
  });

  it('holds the sidebar off until the columns on screen can be seen beside it', () => {
    const m = model();
    // A set the floor is the binding term for, and one wide enough to push its own boundary out:
    // the track is 260px whatever is on screen, so the width that affords it is the set's.
    // Six tests rather than five: a figure column's minimum lost the caret when the mark went out
    // of flow (`headerMinPx`), and at five this set derived 1182px — under the floor, which left
    // the assertions below comparing the floor against itself.
    const narrow = ['plate'];
    const wide = ['releasedAt', 'score', 'msrpGbp', 'plate', ...TESTS.slice(0, 6).map((t) => t.slug)];
    expect(sidebarPermanentAt(narrow, m)).toBe(SIDEBAR_PERMANENT_PX);
    expect(sidebarPermanentAt(wide, m))
      .toBe(desktopMinWidth(wide, m) + FIT_SLACK_PX + 16 + 260);
    expect(sidebarPermanentAt(wide, m)).toBeGreaterThan(SIDEBAR_PERMANENT_PX);
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
    expect(fitsDesktop(['weight'], availableForTable(['weight'], DESKTOP_FLOOR_PX - 1, m), m))
      .toBe(true);
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

/**
 * The property both boundaries answer to, walked rather than argued: **as a window is dragged wider
 * the rendering never goes back**. It is one assertion because it is one decision — the sidebar's
 * track is a 260px step in what the table is laid out in, so a permanence boundary that does not
 * consult the fit model hands the width back to the stacked list at the pixel it claims its column
 * (docs/app.md §Two renderings, and only one of them mounted).
 *
 * Per pixel and per column set, because the defect is a band a few pixels wide for one set and two
 * hundred for another, and a ladder of round widths steps straight over it.
 */
describe('widening the window never takes the table away', () => {
  const SLUGS = TESTS.map((t) => t.slug);
  /** Sized rather than named: what matters is the min-content each set asks for, and the fixture's
   *  own columns are what state it. `nine` and `eleven` straddle the sidebar's boundary — the band
   *  the fit rule and the sidebar used to disagree over. */
  const SETS: Record<string, string[]> = {
    two: ['score', 'msrpGbp'],
    eight: ['releasedAt', 'score', 'msrpGbp', 'plate', ...SLUGS.slice(0, 4)],
    nine: ['releasedAt', 'score', 'msrpGbp', 'plate', ...SLUGS.slice(0, 5)],
    eleven: ['releasedAt', 'score', 'msrpGbp', 'plate', ...SLUGS.slice(0, 7)],
    fourteen: ['releasedAt', 'score', 'msrpGbp', 'plate', ...SLUGS.slice(0, 10)],
  };
  /** Wide enough that every set above reaches its desktop rendering inside it, so no case passes by
   *  never getting there. */
  const TOP_PX = 2400;

  for (const [name, columns] of Object.entries(SETS)) {
    it(`mounts one rendering, then keeps it, across ${name} columns`, () => {
      const m = model();
      const walk: { width: number; phone: boolean; permanent: boolean }[] = [];
      for (let width = DESKTOP_FLOOR_PX; width <= TOP_PX; width++) {
        walk.push({
          width,
          phone: rendersPhone(columns, width, m),
          permanent: sidebarPermanent(columns, width, m),
        });
      }
      const reverts = walk.filter((r, i) => i > 0 && r.phone && !walk[i - 1]!.phone);
      expect(reverts.map((r) => r.width),
        'the stacked list takes back a width where the table was already up').toEqual([]);
      // The sidebar's half of the same property: a drawer that had become a column and goes back to
      // being a drawer is the same defect wearing the other rendering.
      const withdrawn = walk.filter((r, i) => i > 0 && !r.permanent && walk[i - 1]!.permanent);
      expect(withdrawn.map((r) => r.width),
        'the sidebar gives its column back at a wider window').toEqual([]);
      // The stronger claim the `max` buys: the sidebar never stands beside the stacked list, which
      // is the layout it was always documented never to produce (docs/app.md §Filters).
      expect(walk.filter((r) => r.permanent && r.phone).map((r) => r.width),
        'a permanent sidebar beside a stacked list').toEqual([]);
      // Non-vacuous: the table is up by the top of the walk, so a set that simply never fits cannot
      // pass this by never changing its mind.
      expect(walk.at(-1)!.phone, `${name} columns never reach a desktop rendering`).toBe(false);
    });
  }
});

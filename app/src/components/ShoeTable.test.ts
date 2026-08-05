import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShoeTable from './ShoeTable.svelte';
import { indexTests } from '../lib/dataset';
import { washOf } from '../lib/direction';
import { columnWidths, fitModel } from '../lib/fit';
import { columnLabel } from '../lib/labels';
import { type ScoreColumns } from '../lib/score';
import { EASY } from '../lib/score-defs';
import { percentileMap } from '../lib/stats';
import { defaultView, type ViewState } from '../lib/view';
import { DEFAULT_PAINT, washCellClass } from '../lib/wash';
import { FLEET, TESTS, shoe } from '../lib/test-fixtures';
import type { Shoe, ShoesFile } from '../../../shared/types.js';

/**
 * **The row measurement is stubbed, and its default is exactly what the real module already does
 * here.** jsdom lays nothing out, so `measureDesktopRowHeights` can only ever decline — which meant
 * this file could reach the plan in one state only, the *cannot measure* one that renders every
 * shoe. The whole windowed half of the component was therefore unreachable from any committed
 * suite, and ten mutations at the seam between the plan and the DOM survived it.
 *
 * The stub answers `null` until a test says otherwise, which is the real module's answer under
 * jsdom, so nothing above changes behaviour. It replaces `createRowHeights` rather than adding a
 * seam to the component: the cache's own rules are held against the real thing in
 * `row-height.test.ts`, and what a browser actually measures is held in `app/e2e/`.
 */
const rig = vi.hoisted(() => ({
  /** What `heights` answers. `null` — cannot measure — until a test hands over a fleet's worth. */
  measure: null as ((names: readonly unknown[]) => number[] | null) | null,
  /** Every array `heights` was handed, in call order: the caller's identity contract lives here. */
  seen: [] as readonly (readonly unknown[])[],
  /** The component's own invalidation callback, so a test can make a settled face re-measure. */
  invalidate: (() => {}) as () => void,
}));
vi.mock('../lib/row-height', () => ({
  measureDesktopRowHeights: () => null,
  createRowHeights: (onInvalidate: () => void) => {
    rig.invalidate = onInvalidate;
    return {
      heights: (names: readonly unknown[]) => {
        rig.seen = [...rig.seen, names];
        return rig.measure?.(names) ?? null;
      },
      destroy: () => {},
    };
  },
}));
beforeEach(() => { rig.measure = null; rig.seen = []; });

const data: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

function setup(over: { shoes?: Shoe[]; data?: ShoesFile; view?: Partial<ViewState>;
  scores?: ScoreColumns; open?: string[] } = {}) {
  const onchange = vi.fn();
  const view = { ...defaultView(), ...over.view };
  view.columns = over.view?.columns ?? ['score', 'heel-stack', 'plate'];
  const file = over.data ?? data;
  // The set lives in Page.svelte now, so this helper plays the parent. A `SvelteSet` mutated in
  // place is what the component actually receives, so no re-render plumbing is needed here either.
  const open = new SvelteSet<string>(over.open ?? []);
  const rendered = render(ShoeTable, { props: { shoes: over.shoes ?? file.shoes, data: file, view,
    onchange, scores: over.scores ?? new Map(), stability: false, open,
    ontoggle: (slug: string) => { if (!open.delete(slug)) open.add(slug); } } });
  return Object.assign(onchange, { rendered });
}

describe('ShoeTable', () => {
  it('renders a row per shoe and headers for chosen columns', () => {
    setup();
    expect(screen.getAllByRole('row')).toHaveLength(1 + FLEET.length);
    expect(screen.getByRole('columnheader', { name: /Heel stack/ })).toBeInTheDocument();
  });
  it('clicking a header emits sort change, clicking again flips direction', async () => {
    const onchange = setup();
    const th = screen.getByRole('columnheader', { name: /Heel stack/ });
    await fireEvent.click(th.querySelector('button')!);
    expect(onchange.mock.lastCall![0].sort).toEqual({ key: 'heel-stack', dir: 'desc' });
  });
  it('flips an already-descending column to ascending', async () => {
    const onchange = setup({ view: { sort: { key: 'heel-stack', dir: 'desc' } } });
    await fireEvent.click(screen.getByRole('columnheader', { name: /Heel stack/ }).querySelector('button')!);
    expect(onchange.mock.lastCall![0].sort).toEqual({ key: 'heel-stack', dir: 'asc' });
    expect(onchange.mock.lastCall![0].columns).toEqual(['score', 'heel-stack', 'plate']);
  });
  it('marks the sorted column with an indicator and aria-sort', () => {
    setup({ view: { sort: { key: 'heel-stack', dir: 'asc' } } });
    const th = screen.getByRole('columnheader', { name: /Heel stack/ });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });

  it('drops the row thumbnail, which carried nothing at 40px', () => {
    // A shoe that CARRIES an image, because `shoe()` defaults `imageUrl` to null and the assertion
    // would otherwise pass against markup that still renders one.
    const { rendered } = setup({ shoes: [shoe({ slug: 'shot', imageUrl: 'https://x/y.jpg' })] });
    expect(rendered.container.querySelector('td.name img')).toBeNull();
  });

  it('names the bucket its ramp puts the cell in, and carries no value at all', () => {
    const { rendered } = setup();
    const tinted = rendered.container.querySelector('td.num.tinted.blue')!;
    // Exactly one, from `wash.ts`'s own grammar: the generated stylesheet declares what that
    // bucket paints, so a second class on one cell would be a second colour (docs/app.md §Theming).
    expect([...tinted.classList].filter((c) => /^w-[bmg]-\d+$/.test(c)))
      .toEqual([expect.stringMatching(/^w-b-\d+$/)]);
    // `getAttribute('style')` rather than `.style.getPropertyValue`: it is the idiom this file
    // already proves works for a custom property under this jsdom. Writing one of these per cell
    // per frame is exactly what the class replaced.
    const style = tinted.getAttribute('style') ?? '';
    expect(style).not.toContain('--a:');
    expect(style).not.toContain('--w:');
    expect(style).not.toContain('--p:');
  });
  // The set is the parent's now, so a row opened before the component remounts is still open after
  // — which is what makes a rendering swap stop dropping every panel.
  it('renders a panel for a row the parent already has open', () => {
    setup({ open: ['cushy'] });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });
  it('row click expands the detail panel', async () => {
    setup();
    const row = screen.getByText('cushy').closest('tr')!;
    await fireEvent.click(row);
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });
  it('expands and collapses a row from the keyboard', async () => {
    setup();
    const row = screen.getByText('cushy').closest('tr')!;
    expect(row).toHaveAttribute('tabindex', '0');
    await fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });
  // `aria-expanded` says a row controls something; without `aria-controls` it never says what. The
  // panel exists only while the row is open, and an IDREF naming a node that is not in the document
  // is an unresolvable reference rather than a promise of one.
  it('points the expanded row at the panel it opened, and at nothing while it is closed', async () => {
    setup();
    const row = screen.getByText('cushy').closest('tr')!;
    expect(row).not.toHaveAttribute('aria-controls');
    await fireEvent.click(row);
    const panelId = row.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });
  it('hides the detail panel when the expanded shoe leaves the list', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByText('cushy').closest('tr')!);
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
    await onchange.rendered.rerender({ shoes: FLEET.filter((s) => s.slug !== 'cushy') });
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });
  it('tints numeric cells by percentile and leaves non-numeric cells untinted', () => {
    const { container } = setup().rendered;
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];
    const heel = cells[2]!; // name, score, heel-stack, plate
    expect(heel.className).toContain('tinted');
    // Heel stack has no better end, so it is the neutral ramp's own class rather than the ranked
    // one's — the grammar carries which ramp as well as how much (docs/app.md §Theming).
    expect(heel.className).toMatch(/\bw-g-\d+\b/);
    expect(cells[3]!.className).not.toContain('tinted'); // plate is not numeric
    expect(cells[3]!.className).not.toMatch(/\bw-[bmg]-\d+\b/);
  });
  it('does not print the brand, which every shoe name already starts with', () => {
    setup();
    // Four of the five FLEET shoes carry brand 'Brand', so queryByText would throw on multiples.
    expect(screen.queryAllByText('Brand')).toHaveLength(0);
  });
  it('carries units in the header', () => {
    setup({ view: { columns: ['weight'] } });
    expect(screen.getByText('g')).toBeInTheDocument();
  });
  it('expands more than one row at a time', async () => {
    setup();
    const rows = screen.getAllByRole('row').filter((r) => r.classList.contains('shoe'));
    await fireEvent.click(rows[0]!);
    await fireEvent.click(rows[1]!);
    expect(rows[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(rows[1]!.getAttribute('aria-expanded')).toBe('true');
  });
  it('washes a directional column blue and a neutral one grey', () => {
    const { container } = setup().rendered;
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];
    expect(cells[1]!.className).toContain('blue'); // score — higher is better
    expect(cells[2]!.className).toContain('grey'); // heel stack — a preference, not a quality
  });
  // `none` is a reading the scraper derives deliberately and most of the fleet carries it, so the cell
  // names it the way the filter beside it does. The em dash is this app's glyph for *no* reading,
  // and a column that spent it on a value made one glyph mean two things in one table: plate
  // ascending sent its em dashes to the top as a value, width ascending sent its to the bottom as
  // an absence (docs/app.md §Categorical columns).
  it('maps each plate value in the plate column, none included', () => {
    setup();
    // index 3 of [name, score, heel-stack, plate]
    const plateCell = (name: string) => screen.getByText(name).closest('tr')!.querySelectorAll('td')[3]!;
    expect(plateCell('racer').textContent).toBe('Carbon');
    expect(plateCell('trainer').textContent).toBe('Non-carbon');
    expect(plateCell('cushy').textContent).toBe('None');
  });
  it('never spends the no-reading em dash on the plate column', () => {
    const { container } = setup().rendered;
    const plates = [...container.querySelectorAll('tbody tr')]
      .map((r) => r.querySelectorAll('td')[3]?.textContent);
    expect(plates.length).toBeGreaterThan(0);
    expect(plates).not.toContain('—');
  });
  // The catalogue's own `plate` test would otherwise answer for the column and render "Yes".
  it('keeps the derived plate label for a shoe carrying the catalogue plate reading', () => {
    setup({ shoes: [shoe({ slug: 'plated', plate: 'plated-other', values: { '69': true } })] });
    expect(screen.getByText('plated').closest('tr')!.querySelectorAll('td')[3]!.textContent)
      .toBe('Non-carbon');
  });
  /**
   * A regression guard rather than a red-first test: the lookups were already tolerant, and this is
   * what makes `parseView` keeping an unknown slug safe to rely on. A link is allowed to name a
   * column the catalogue has since dropped, and the table has to render it rather than throw
   * (docs/app.md §Columns are permissive, ranges and sorts are strict). Every
   * lookup the header and the cell make has to tolerate a key with no test behind it: the label
   * falls back to the visibly unchanged slug with authored breaks, the units line is empty, the
   * direction and the wash read neutral, and every cell prints the no-reading em dash.
   */
  it('renders a column the catalogue no longer holds without crashing', () => {
    const { container } = setup({ view: { columns: ['score', 'gone-metric-slug'] } }).rendered;
    const head = screen.getByRole('columnheader', {
      name: columnLabel('gone-metric-slug', undefined),
    });
    expect(head.querySelector('.h-units')!.textContent).toBe('');
    // `table:not(.proto)`: the hidden prototype row beside the table carries a cell per column too,
    // and its figures are placeholders rather than this fleet's (`lib/row-height.ts`).
    const cells = [...container.querySelectorAll('table:not(.proto) tbody tr')]
      .map((r) => r.querySelectorAll('td')[2]!.textContent);
    expect(new Set(cells)).toEqual(new Set(['—']));
    // neutral, because `directionOf` has no entry for it — never blue, which would claim a better end
    expect(container.querySelector('tbody td:nth-child(3)')!.className).toContain('grey');
  });
  it('missing values render as em dash', () => {
    setup();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
  it('shows a bare year for a listing date and a month for a page date, never the day', () => {
    setup({
      shoes: [
        shoe({ slug: 'yearly', releasedAt: '2024-01-01', releaseDateSource: 'listing' }),
        shoe({ slug: 'exact', releasedAt: '2025-03-14' }),
      ],
      view: { columns: ['releasedAt'] },
    });
    expect(screen.getByText('2024')).toBeInTheDocument();
    // The day is deliberately dropped; `lib/release-date.ts` owns why.
    expect(screen.getByText('March 2025')).toBeInTheDocument();
  });
});

describe('ShoeTable and the Easy score', () => {
  it('renders each score column from its own map, and a dash where it is unscored', () => {
    const view = { ...defaultView(), columns: [EASY.keys.heel, EASY.keys.forefoot] };
    const { container } = render(ShoeTable, {
      props: { shoes: FLEET, data, view,
               scores: new Map([[EASY.keys.heel, new Map([['cushy', 87.412]])],
                                [EASY.keys.forefoot, new Map([['cushy', 71.238]])]]),
               stability: false, onchange: () => {},
               open: new SvelteSet<string>(), ontoggle: () => {} },
    });
    const cells = [...container.querySelectorAll('tbody tr td')].map((c) => c.textContent?.trim());
    expect(cells).toContain('87.41'); // two decimals, like every other figure
    expect(cells).toContain('71.24');
    expect(cells).toContain('—');
  });
});

/**
 * `SORT_FIELDS` accepts `name` and `brand`, so a link could reorder every row alphabetically while
 * the Shoe header was a plain `<th>` — no button, no caret, and the table's ONLY `aria-sort` gone
 * with the score column that no longer held it (docs/app.md §Columns and sorting).
 */
describe('ShoeTable sorts by shoe name', () => {
  it('offers the Shoe header as a sort control like every other header', () => {
    setup();
    const th = screen.getByRole('columnheader', { name: /Shoe/ });
    expect(th.querySelector('button')).not.toBeNull();
  });
  it('marks a name-sorted table on the header that owns the key', () => {
    const { rendered } = setup({ view: { sort: { key: 'name', dir: 'asc' } } });
    const th = screen.getByRole('columnheader', { name: /Shoe/ });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(th.querySelector('.caret.on')).not.toBeNull();
    // And no other header claims the sort at the same time.
    expect(rendered.container.querySelectorAll('thead th[aria-sort]')).toHaveLength(1);
  });
  it('marks the descending half too', () => {
    setup({ view: { sort: { key: 'name', dir: 'desc' } } });
    expect(screen.getByRole('columnheader', { name: /Shoe/ })).toHaveAttribute('aria-sort', 'descending');
  });
  // A to Z is what "sort by shoe" means; every figure column still opens descending, because there
  // the interesting end is the big number (docs/app.md §Columns and sorting).
  it('opens A to Z and reverses on a second press', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByRole('columnheader', { name: /Shoe/ }).querySelector('button')!);
    expect(onchange.mock.lastCall![0].sort).toEqual({ key: 'name', dir: 'asc' });

    const back = setup({ view: { sort: { key: 'name', dir: 'asc' } } });
    await fireEvent.click(screen.getAllByRole('columnheader', { name: /Shoe/ }).at(-1)!.querySelector('button')!);
    expect(back.mock.lastCall![0].sort).toEqual({ key: 'name', dir: 'desc' });
  });
  it('leaves the column set alone, the Shoe header never being a column', async () => {
    const onchange = setup();
    await fireEvent.click(screen.getByRole('columnheader', { name: /Shoe/ }).querySelector('button')!);
    expect(onchange.mock.lastCall![0].columns).toEqual(['score', 'heel-stack', 'plate']);
  });
});

/**
 * The body renders a plan, and this is the half that needs no measurement at all: the
 * **render-everything fallback**.
 *
 * jsdom lays nothing out, so the real `measureDesktopRowHeights` declines — which is the same answer
 * the app gives before its first measured frame — and a caller that cannot measure renders every
 * shoe with no spacer at all (spec §Failure behaviour). The stub at the top of this file answers the
 * same `null` unless a test hands it a fleet, so every case here is the untouched one; the windowed
 * cases are the describe below.
 */
describe('ShoeTable renders a plan', () => {
  it('renders every shoe and no spacer where nothing can be measured', () => {
    const { container } = setup().rendered;
    expect(container.querySelectorAll('table:not(.proto) tbody tr.shoe')).toHaveLength(FLEET.length);
    expect(container.querySelectorAll('tr.spacer')).toHaveLength(0);
  });

  it('numbers the rows the table would have, panels included', async () => {
    const { container } = setup().rendered;
    const table = container.querySelector('table:not(.proto)')!;
    expect(table.getAttribute('aria-rowcount')).toBe(String(1 + FLEET.length));
    expect(table.querySelector('thead tr')!.getAttribute('aria-rowindex')).toBe('1');
    const indices = () => [...table.querySelectorAll('tbody tr.shoe')]
      .map((r) => r.getAttribute('aria-rowindex'));
    expect(indices()).toEqual(FLEET.map((_, i) => String(i + 2)));

    // An open panel is a row of the table, so it takes a number and everything below it moves down.
    await fireEvent.click(screen.getByText('cushy').closest('tr')!);
    expect(table.getAttribute('aria-rowcount')).toBe(String(2 + FLEET.length));
    expect(table.querySelector('tr.expand')!.getAttribute('aria-rowindex'))
      .toBe(String(Number(indices()[0]) + 1));
  });

  /**
   * The prototype the height measurement is cloned from, which exists so that the measurement never
   * depends on which shoes are on screen (`lib/row-height.ts`). One row, always carrying a chip,
   * a cell per rendered column, and out of the accessibility tree.
   */
  it('renders a prototype row the window can never take away', () => {
    const { container } = setup().rendered;
    const proto = container.querySelector('table.proto')!;
    expect(proto.getAttribute('aria-hidden')).toBe('true');
    expect(proto.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(proto.querySelectorAll('tbody tr td')).toHaveLength(1 + 3);
    expect(proto.querySelector('td.name .name-row > div > span')).not.toBeNull();
    // And it is not a shoe: nothing that quantifies over the runner's rows may pick it up.
    expect(container.querySelectorAll('tr.shoe')).toHaveLength(FLEET.length);
    expect(screen.getAllByRole('row')).toHaveLength(1 + FLEET.length);
  });
});

/**
 * **The other half: a body that really is windowed.** Nothing committed had ever run against one —
 * the e2e fixture is five shoes against 1,280px of overscan at each end, so no viewport and no
 * arrangement of open panels can window it, and this file could not measure at all. Ten mutations at
 * the seam between the plan and the DOM survived the whole suite as a result.
 *
 * What is stubbed is the row measurement and nothing else. The plan's own arithmetic is `virtual.ts`
 * and is asserted entry by entry in `virtual.test.ts`; what these hold is the seam — that the plan
 * reaches the DOM as spacers of the right height, out of the accessibility tree, with the fleet's own
 * row numbers on rows the DOM no longer counts, and that the three things which survive scrolling
 * past them do. The real engine's half — a spacer's own box, a real focus ring surviving a real
 * scroll, the tint under a real repaint — is `app/e2e/virtual.spec.ts`.
 *
 * **No geometry is faked.** jsdom's viewport is a number a test can plant (`window.innerHeight`),
 * so the window has a size; the body's scroll offset is a rect, so it is zero and stays zero, and
 * the plan's window therefore always starts at the top of the fleet. That is why the shoe kept from
 * the far end is reached through `revealRow` rather than by scrolling to it (`src/test-setup.ts`
 * says why nothing here reports a size it does not have).
 */
describe('ShoeTable windows the body', () => {
  /** A row height a fleet can be measured at. Nothing in jsdom lays out, so this is the stub's
   *  answer rather than a reading — the number matters only in that it is uniform, which is what
   *  makes a spacer's px readable as a count of shoes. */
  const ROW_PX = 36;
  /** Big enough to window: 768px of viewport plus 1,280px of overscan at each end reaches about 57
   *  rows of 36px, so the great majority of these are spaced for rather than rendered. */
  const BIG: Shoe[] = Array.from({ length: 400 }, (_, i) =>
    shoe({ slug: `w${i}`, name: `Windowed shoe ${i}`, score: i }));
  const bigData: ShoesFile = { ...data, shoes: BIG };

  async function windowed(over: Parameters<typeof setup>[0] = {}) {
    rig.measure = () => BIG.map(() => ROW_PX);
    const rendered = setup({ data: bigData, shoes: BIG, ...over }).rendered;
    const table = rendered.container.querySelector<HTMLElement>('table:not(.proto)')!;
    // The measurement lands after a `tick`, so the first plan is the unmeasured one.
    await waitFor(() => expect(table.querySelectorAll('tr.spacer').length).toBeGreaterThan(0));
    return { rendered, table };
  }
  const shoeRows = (table: HTMLElement) => [...table.querySelectorAll<HTMLElement>('tbody tr.shoe')];
  const spacerPx = (table: HTMLElement) =>
    [...table.querySelectorAll<HTMLElement>('tr.spacer > td')]
      .reduce((total, td) => total + parseFloat(td.style.height), 0);

  /**
   * **Every spacer's OWN height, against the shoes that spacer stands for — and the total is not
   * that claim.** Move 500px from the first spacer to the last and the sum above is unmoved while
   * every rendered row sits half a screenful from where the scrollbar says it is, which is the one
   * property this whole design is justified by. That mutation passed the whole unit suite and the
   * whole windowed e2e — an assertion over an AGGREGATE surviving a REDISTRIBUTION, which this
   * table produced often enough to earn a rule of its own
   * (docs/decisions.md §Testing bar: adversarial, no live network).
   *
   * Derived from the DOM rather than from the plan, so it is not a second copy of `virtualPlan`: a
   * spacer stands for the fleet positions between the rendered rows either side of it, and
   * `aria-rowindex` is where those positions are written. A skipped shoe is always closed — an open
   * one is never spaced for — so each is one row of `ROW_PX`, where a RENDERED open shoe advances
   * the index by two.
   */
  function spacerRuns(table: HTMLElement): { at: string; px: number; want: number }[] {
    const rowCount = Number(table.getAttribute('aria-rowcount'));
    const body = [...table.querySelectorAll<HTMLElement>('tbody > tr')];
    const indexOf = (tr: HTMLElement) => Number(tr.getAttribute('aria-rowindex'));
    return body.flatMap((tr, i) => {
      if (!tr.classList.contains('spacer')) return [];
      const before = body.slice(0, i).reverse().find((t) => t.classList.contains('shoe'));
      const after = body.slice(i + 1).find((t) => t.classList.contains('shoe'));
      // The first body row is index 2, the header being 1; a trailing spacer runs to the last row
      // the fleet would have, which is `aria-rowcount` itself.
      const span = before?.nextElementSibling?.className.includes('expand') ? 2 : 1;
      const from = before ? indexOf(before) + span : 2;
      const to = after ? indexOf(after) : rowCount + 1;
      return [{
        at: `the spacer standing for rows ${from}–${to - 1}`,
        px: parseFloat(tr.querySelector<HTMLElement>('td')!.style.height),
        want: (to - from) * ROW_PX,
      }];
    });
  }

  /** Both halves of the same claim: every spacer individually, and nothing left over. */
  function expectSpacersStandForTheirOwnRuns(table: HTMLElement): void {
    const runs = spacerRuns(table);
    expect(runs.length, 'no spacer exists here, so nothing below is a claim about one')
      .toBeGreaterThan(0);
    for (const run of runs) expect(run.px, `${run.at} is the wrong height`).toBe(run.want);
    expect(spacerPx(table), 'the spacers do not add up to the shoes they replace')
      .toBe((BIG.length - shoeRows(table).length) * ROW_PX);
  }

  it('renders the shoes on screen and spaces for exactly the ones it left out', async () => {
    const { table } = await windowed();
    const rows = shoeRows(table);
    expect(rows.length, 'the body is not windowed, so nothing below is a claim about a window')
      .toBeLessThan(BIG.length);
    expect(rows.length).toBeGreaterThan(0);
    // **The whole contract of a spacer**: each stands for the shoes that are not there and for
    // nothing else, so the scrollbar means the same thing windowed as it did rendering all 400.
    expectSpacersStandForTheirOwnRuns(table);
  });

  it('keeps the spacers out of the accessibility tree and the fleet in aria-rowcount', async () => {
    const { table } = await windowed();
    const rows = shoeRows(table);
    expect(table.querySelectorAll('tr.spacer').length,
      'no spacer exists, so its absence from the tree proves nothing').toBeGreaterThan(0);
    // A row that stands for rows is not one. Without `aria-hidden` the tree gains a row per spacer,
    // and the accessibility argument for keeping a real `<table>` partly defeats itself.
    expect(screen.getAllByRole('row'), 'a spacer reached the accessibility tree')
      .toHaveLength(1 + rows.length);
    // And the positions the tree lost with them ride here instead: the count is the rows the table
    // WOULD have, which is a fleet the DOM no longer holds.
    expect(table.getAttribute('aria-rowcount')).toBe(String(1 + BIG.length));
  });

  it('keeps a revealed row in the plan, at its own place in the fleet', async () => {
    // `revealRow` is asked for a fleet POSITION rather than a slug precisely because the row may not
    // be in the DOM to be found — the ask has to put it there first (`ShoeTable.svelte`). The one
    // asked for here is 390 of 400, hundreds of rows past the end of the window.
    const { table, rendered } = await windowed();
    const revealed = rendered.component as { revealRow: (i: number) => Promise<void> };
    await revealed.revealRow(390);
    await tick();
    const row = table.querySelector<HTMLElement>('tbody tr.shoe[data-slug="w390"]');
    expect(row, 'the row a reveal was asked for is not in the plan').not.toBeNull();
    // In document order between two spacers rather than hoisted to the end of the window, and
    // carrying the fleet's own row number: a `<tr>` cannot be taken out of flow, so where a row sits
    // is what the spacer above it says, and its DOM position says nothing about its fleet position.
    expect(row!.getAttribute('aria-rowindex')).toBe('392');
    expect(row!.previousElementSibling?.className).toContain('spacer');
    // The split-spacer case, and the one that can tell a redistribution from a total: the run above
    // the kept row and the run below it are each held to their own shoes.
    expectSpacersStandForTheirOwnRuns(table);
  });

  it('keeps an open row in the plan wherever it sits in the fleet', async () => {
    // *Open rows are always rendered* — the other half of the rule the focused row obeys
    // (spec §Decisions, *The window is what is on screen, plus what the runner has claimed*). It was
    // held only where `kept` is an ARGUMENT, in `virtual.test.ts`, and nothing said the component
    // puts `open` into it: dropping `open` from `kept` survived the whole suite. A panel is
    // 843–1005px, so estimating one instead costs 25 rows of scrollbar error — by far the worst
    // estimate available, and the reason the rule exists at all.
    const { table } = await windowed({ open: ['w390'] });
    const row = table.querySelector<HTMLElement>('tbody tr.shoe[data-slug="w390"]');
    expect(row, 'an open row 390 of 400 into the fleet was left out of the plan').not.toBeNull();
    expect(row!.getAttribute('aria-expanded')).toBe('true');
    expect(table.querySelector('tr.expand[data-slug="w390"]'),
      'the row is in the plan but the panel it controls is not').not.toBeNull();
    // And it is KEPT rather than merely inside the window, which is what makes that mean anything.
    expect(row!.previousElementSibling?.className).toContain('spacer');
    // The runs either side of it, each against its own shoes — and this is the case where an open
    // shoe advances `aria-rowindex` by two while the spacer below it still stands for one row per
    // shoe, since an open shoe is never spaced for.
    expectSpacersStandForTheirOwnRuns(table);
  });

  it('holds the last measurement rather than falling back when one declines', async () => {
    // *Cannot measure* is render-everything on the way up and a held answer after that. A resize
    // drag misses the cache on every frame, so a body that dropped back to all 400 rows on a decline
    // would re-render the fleet every other frame for the length of the gesture — an oscillation
    // rather than a fallback.
    const { table } = await windowed();
    const windowedRows = shoeRows(table).length;
    const calls = rig.seen.length;
    rig.measure = null;
    rig.invalidate();
    await waitFor(() => expect(rig.seen.length).toBeGreaterThan(calls));
    await tick();
    expect(shoeRows(table), 'a declined measurement dropped the last one and re-rendered the fleet')
      .toHaveLength(windowedRows);
  });

  it('hands the measurement the fleet, as one array for the life of the dataset', async () => {
    // `RowHeights.heights` compares `names` by IDENTITY, so a caller that rebuilds the array per
    // render misses the cache every time and pays the whole fleet's measurement per keystroke — the
    // exact cost the cache exists to remove (`lib/row-height.ts`). It is a precondition on the
    // caller and this is the only place that can hold it: the answer cannot discriminate under
    // jsdom, so what is asserted is the ARGUMENT.
    //
    // **Two claims, because there are two ways to break it.** What is measured is the FLEET and not
    // the filtered list — so the fixture mounts with a filter already on, and the array handed over
    // is still 400 long. And it is the SAME array on the next call, so a `names` rebuilt per effect
    // run rather than derived once from the dataset misses the cache for ever.
    //
    // The filter is applied at mount rather than driven through `rerender`, and that is the
    // harness's doing rather than a gap: `rerender` replaces the whole props object
    // (`@testing-library/svelte-core`), so `data` reads as changed too and every `$derived` over it
    // recomputes whatever the component does. What a real filter drag costs is measured in the
    // engine instead — 0 measurements over six steps that empty and refill the fleet, driving the
    // price filter on the real fleet at 1440px in Chromium and Firefox and counting every call into
    // `heights`.
    await windowed({ shoes: BIG.filter((_, i) => i % 2 === 0) });
    expect(rig.seen[0], 'the filtered list was measured rather than the fleet')
      .toHaveLength(BIG.length);
    rig.invalidate();
    await waitFor(() => expect(rig.seen.length).toBeGreaterThan(1));
    expect(rig.seen.at(-1), 'a second array was built, so every later call is a cache miss')
      .toBe(rig.seen[0]);
  });

  it('ranks the wash over the whole filtered set, never over the plan', async () => {
    // The tint has to mean the same thing as its neighbours' in the same row and the same thing at
    // every scroll position (spec §Non-goals). These 400 shoes score 0…399 in order, so the window
    // is the fleet's lowest-scoring ~14% — ranked over the plan they would be painted across the
    // whole ramp, with the last row on screen coming out as the best shoe there is.
    const { table } = await windowed();
    const overFleet = percentileMap(BIG, 'score', indexTests(bigData.tests));
    const blue = washOf('score') === 'blue';
    const classes = shoeRows(table).map((row) => {
      const cell = row.querySelectorAll<HTMLElement>('td.num')[0]!;
      return { slug: row.dataset['slug']!, cls: [...cell.classList] };
    });
    expect(classes.length).toBeGreaterThan(1);
    for (const { slug, cls } of classes) {
      expect(cls, `${slug} is not painted at its place in the fleet`)
        .toContain(washCellClass(blue, overFleet.get(slug)!, DEFAULT_PAINT));
    }
    // Independently of the arithmetic above: nothing on screen is the fleet's best shoe, so nothing
    // on screen may wear the top of the ramp.
    expect(classes.flatMap((c) => c.cls), 'a shoe on screen is painted as the best in the fleet')
      .not.toContain(washCellClass(blue, 1, DEFAULT_PAINT));
  });
});

/**
 * Where the model and the markup meet: `columnWidths` decides and the `<colgroup>` declares, so a
 * column's width stops being a function of which rows happen to be in the DOM
 * (docs/app.md §Table presentation).
 *
 * jsdom lays nothing out, so the track reads 0 here — which is the fallback itself rather than a
 * test affordance: with no measurable track every column takes its own minimum, the same posture
 * `fit.ts` already falls back to under jsdom. What a real browser is handed is held by
 * `smoke.spec.ts` and `cross-browser.spec.ts`, a track being a thing only an engine can measure.
 */
describe('ShoeTable declares its column widths', () => {
  const cols = ['score', 'heel-stack', 'plate'];
  // `:not(.proto)`, because the wrapper holds two tables: the one the runner reads and the hidden
  // one-row prototype the height measurement is taken off, which declares the same columns so that
  // it is a copy of the table rather than a second model of it (`lib/row-height.ts`).
  const declared = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('table:not(.proto) colgroup col')]
      .map((c) => parseFloat(c.style.width));

  it('emits one col per rendered column, the name column first', () => {
    const { container } = setup().rendered;
    const widths = declared(container);
    expect(widths).toHaveLength(1 + cols.length);
    expect(widths[0]).toBeCloseTo(fitModel(data).columnPx('name'), 6);
  });

  it('falls back to every column\'s own minimum where no track can be measured', () => {
    const { container } = setup().rendered;
    const want = columnWidths(cols, 0, fitModel(data));
    const got = declared(container);
    expect(got).toHaveLength(want.length);
    got.forEach((w, i) => expect(w).toBeCloseTo(want[i]!, 6));
  });
});

import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ShoesFile } from '../../shared/types.js';
import Page from './Page.svelte';
import { FLEET, TESTS } from './lib/test-fixtures';

/**
 * A dragged grip emits about sixty view updates a second, and every one of them replaces the whole
 * `ViewState` object — so anything derived from the view re-runs sixty times a second whether or
 * not the bound it reads moved (docs/app.md §What a drag may recompute). These spies are the rig
 * for that: they count fleet-wide passes per update, which is what actually costs frames. The
 * counts below are per **one** bound change and are independent of fleet size, so they hold on the
 * real dataset exactly as they do on this five-shoe fixture.
 */
vi.mock('./lib/coverage', async (orig) => {
  const actual = await orig<typeof import('./lib/coverage')>();
  return { ...actual, coverageOf: vi.fn(actual.coverageOf) };
});
vi.mock('./lib/score', async (orig) => {
  const actual = await orig<typeof import('./lib/score')>();
  return { ...actual, scoreMap: vi.fn(actual.scoreMap) };
});
vi.mock('./lib/stats', async (orig) => {
  const actual = await orig<typeof import('./lib/stats')>();
  return { ...actual, percentileMap: vi.fn(actual.percentileMap) };
});
vi.mock('./lib/wash', async (orig) => {
  const actual = await orig<typeof import('./lib/wash')>();
  return { ...actual, resolveWash: vi.fn(actual.resolveWash) };
});
vi.mock('./lib/filters', async (orig) => {
  const actual = await orig<typeof import('./lib/filters')>();
  return { ...actual, applyFilters: vi.fn(actual.applyFilters) };
});

const { coverageOf } = await import('./lib/coverage');
const { scoreMap } = await import('./lib/score');
const { percentileMap } = await import('./lib/stats');
const { applyFilters } = await import('./lib/filters');
const { resolveWash } = await import('./lib/wash');

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };

beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
});

/** One bound change through the same path a drag takes: `RangeFilter` → `setRange` → `setView`. */
async function changeOneBound(): Promise<void> {
  vi.mocked(coverageOf).mockClear();
  vi.mocked(scoreMap).mockClear();
  vi.mocked(percentileMap).mockClear();
  vi.mocked(applyFilters).mockClear();
  await fireEvent.input(screen.getByLabelText('Weight (g) maximum'), { target: { value: '250' } });
  await tick();
}

it('recomputes no score map when a range bound moves', async () => {
  render(Page, { props: { data } });
  await changeOneBound();
  // The scores read `view.stability` and nothing else from the view, and a drag cannot change it.
  expect(scoreMap).not.toHaveBeenCalled();
});

it('reads no coverage at all while a bound moves', async () => {
  render(Page, { props: { data } });
  await changeOneBound();
  // One `coverageOf` is a full pass over the population, and a range cannot move the population
  // (docs/app.md §Coverage) — so the sidebar's dozen headings are answered from the figures they
  // already have. The column picker is closed and the add-filter dialog is not mounted, and
  // neither may pay for a figure nobody can see either.
  expect(coverageOf).not.toHaveBeenCalled();
});

it('filters the fleet a bounded number of times per bound change', async () => {
  render(Page, { props: { data } });
  await changeOneBound();
  // The table's own pass and two per bounded row for its `excluded` count. Every *facet* reader —
  // the brand counts and each feature checklist's — is outside that number, because each counts over
  // `considered`, which a range leaves alone, and each is built once and kept.
  //
  // So this bound is what holds their build-once property: rebuild any of them per render and this
  // fails rather than the drag quietly costing a fleet pass per facet
  // (docs/app.md §What a drag may recompute). Raise it only for a cause you can name here, and only
  // after checking the readers are still held — the readers scale with the catalogue's categorical
  // tests, so the number they add is not a number this comment can carry.
  expect(vi.mocked(applyFilters).mock.calls.length).toBeLessThanOrEqual(3);
});

it('ranks each rendered column once per bound change', async () => {
  render(Page, { props: { data } });
  await changeOneBound();
  expect(vi.mocked(percentileMap).mock.calls.length).toBeLessThanOrEqual(8);
});

/**
 * The wash solver is thousands of contrast evaluations, and the menu's whole promise is a live
 * preview — so a dragged grip repaints the table sixty times a second. It may do that only because
 * the solver runs **once per change** and the cell reads four resolved numbers
 * (docs/app.md §The display preferences). Both halves are asserted: nothing fleet-wide is
 * recomputed, and the solver is not called per cell or per row.
 */
it('runs the wash solver once per preference change and ranks nothing again', async () => {
  render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('button', { name: 'Display' }));
  for (const spy of [coverageOf, scoreMap, percentileMap, applyFilters, resolveWash]) vi.mocked(spy).mockClear();

  await fireEvent.input(screen.getByLabelText('Strength'), { target: { value: '0.5' } });
  await tick();

  // The rows on screen have not changed, only their colour: none of the fleet-wide passes is a
  // legitimate reader of a preference.
  expect(scoreMap).not.toHaveBeenCalled();
  expect(percentileMap).not.toHaveBeenCalled();
  expect(applyFilters).not.toHaveBeenCalled();
  expect(coverageOf).not.toHaveBeenCalled();
  // One, and independent of how many cells are painted — this fixture paints sixteen.
  expect(vi.mocked(resolveWash).mock.calls.length).toBe(1);
});

/** And a filter drag does not resolve the wash either: the two states are held apart on purpose. */
it('resolves no wash when a range bound moves', async () => {
  render(Page, { props: { data } });
  vi.mocked(resolveWash).mockClear();
  await changeOneBound();
  expect(resolveWash).not.toHaveBeenCalled();
});

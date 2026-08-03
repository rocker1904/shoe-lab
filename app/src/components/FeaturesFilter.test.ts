import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { LabTest } from '../../../shared/types.js';
import { isCategorical } from '../lib/categorical';
import { labTest } from '../lib/test-fixtures';
import FeaturesFilter from './FeaturesFilter.svelte';

const gusset = labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option', groupId: '3',
  options: [
    { value: 'both-sides-semi', name: 'Both sides (semi)' }, { value: 'none', name: 'None' },
    { value: 'bootie', name: 'Bootie' },
  ] });
const insole = labTest({ id: 41, slug: 'removable-insole', name: 'Removable insole', type: 'bool', groupId: '3' });
// Two bools, as the catalogue carries: one tri-state cannot show that each group moves on its own.
const reflective = labTest({ id: 42, slug: 'reflective-elements', name: 'Reflective elements', type: 'bool', groupId: '3' });
const TESTS: LabTest[] = [gusset, insole, reflective];

const triGroup = (name: string) => within(screen.getByRole('radiogroup', { name }));

/** What `stableFacetCounts` hands over: declared values, plus any stale or undeclared one. */
const COUNTS: Record<string, Map<string, number>> = {
  'tongue-gusset-type': new Map([['both-sides-semi', 12], ['none', 0], ['bootie', 3]]),
  'removable-insole': new Map([['true', 9], ['false', 4]]),
};
const countsFor = (slug: string) => COUNTS[slug] ?? new Map<string, number>();

function mount(selections: Record<string, string[]> = {}, onchange = vi.fn()) {
  const r = render(FeaturesFilter, { props: { tests: TESTS, selections, countsFor, onchange } });
  return { ...r, onchange };
}

const rowText = (container: HTMLElement) =>
  [...container.querySelectorAll('li')].map((li) => li.textContent?.trim());

describe('FeaturesFilter', () => {
  it('is one collapsed section named for what it holds', () => {
    const { container } = mount();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details).toHaveAttribute('aria-label', 'Features');
    expect(screen.getByText('Any feature')).toBeInTheDocument();
  });

  it('counts every selected value in the summary, a bool among them', () => {
    mount({ 'tongue-gusset-type': ['both-sides-semi', 'none'], 'removable-insole': ['true'] });
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('draws an option facet in display order, none sunk, with its counts', () => {
    const { container } = mount();
    expect(rowText(container)).toEqual(['Both sides (semi) (12)', 'Bootie (3)', 'None (0)']);
  });

  it('keeps a zero row greyed and still clickable, so the list cannot reflow', () => {
    mount();
    expect(screen.getByLabelText(/None \(0\)/)).toBeEnabled();
  });

  it('gives a value the catalogue no longer declares a row, from the counts map', () => {
    const stale = new Map([['both-sides-semi', 12], ['none', 0], ['sock-like', 0]]);
    const { container } = render(FeaturesFilter, { props: {
      tests: [gusset], selections: { 'tongue-gusset-type': ['sock-like'] },
      countsFor: () => stale, onchange: vi.fn(),
    } });
    // Declared rows first in their own order, the stale one after, labelled as itself.
    expect(rowText(container)).toEqual(['Both sides (semi) (12)', 'Bootie (0)', 'None (0)', 'sock-like (0)']);
  });

  it('emits in display order whatever order the values were clicked', async () => {
    const { onchange } = mount({ 'tongue-gusset-type': ['none'] });
    await fireEvent.click(screen.getByLabelText(/Both sides \(semi\)/));
    // Clicked second, emitted first: the URL then reads the same whoever clicked what first.
    expect(onchange).toHaveBeenCalledWith('tongue-gusset-type', ['both-sides-semi', 'none']);
  });

  it('deletes the key when the last value is unticked', async () => {
    const { onchange } = mount({ 'tongue-gusset-type': ['none'] });
    await fireEvent.click(screen.getByLabelText(/None \(0\)/));
    expect(onchange).toHaveBeenCalledWith('tongue-gusset-type', undefined);
  });

  it('offers a bool as three exclusive states rather than two checkboxes', () => {
    mount({ 'removable-insole': ['true'] });
    const group = screen.getByRole('radiogroup', { name: 'Removable insole' });
    expect([...group.querySelectorAll('[role=radio]')].map((b) => b.getAttribute('aria-checked')))
      .toEqual(['false', 'true', 'false']);
  });

  it('emits one value or none from a tri-state, never both', async () => {
    const { onchange } = mount({ 'removable-insole': ['true'] });
    for (const name of ['Yes', 'No', 'Any']) {
      await fireEvent.click(triGroup('Removable insole').getByRole('radio', { name }));
    }
    expect(onchange.mock.calls.map(([, v]) => v)).toEqual([['true'], ['false'], undefined]);
    // The invariant, stated over every call: a link carrying both loses the filter at the far end,
    // because `parseView` refuses a state no tri-state can show (docs/app.md §URL encoding).
    for (const [, values] of onchange.mock.calls) {
      expect(values === undefined || values.length === 1).toBe(true);
    }
  });

  it('shows Any for a stored selection no tri-state could display', () => {
    mount({ 'removable-insole': ['true', 'false'] });
    expect(triGroup('Removable insole').getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
  });

  // Without this the `use:roving` action could be deleted and every other test would still pass,
  // although `role=radiogroup` promises the arrows move the selection (lib/roving.ts).
  it('moves within each tri-state with an arrow key, one group at a time', async () => {
    const { onchange } = mount();
    for (const [slug, name] of [['removable-insole', 'Removable insole'],
                                ['reflective-elements', 'Reflective elements']]) {
      const any = triGroup(name!).getByRole('radio', { name: 'Any' });
      any.focus();
      await fireEvent.keyDown(any, { key: 'ArrowRight' });
      expect(onchange, name).toHaveBeenCalledWith(slug, ['true']);
    }
  });

  // A deliberate decision with no other guard: ticking both boxes of a bool would be a near-no-op
  // whose only effect is excluding the unread shoes, so a tri-state is not a distribution to browse
  // and carries no figures — Discontinued's rule (docs/app.md §Filters).
  it('puts no count on a tri-state, whatever the counts map holds for it', () => {
    mount();
    expect(COUNTS['removable-insole']!.get('true')).toBe(9);   // the figures exist and are not drawn
    for (const name of ['Any', 'Yes', 'No']) {
      expect(triGroup('Removable insole').getByRole('radio', { name }).textContent, name).not.toMatch(/\d/);
    }
  });

  it('draws a restored selection as ticked, so a narrowed fleet never shows empty boxes', () => {
    // The untickable state: a link filters the table and every control reads as unset.
    mount({ 'tongue-gusset-type': ['none'] });
    expect(screen.getByLabelText(/None \(0\)/)).toBeChecked();
    expect(screen.getByLabelText(/Both sides \(semi\)/)).not.toBeChecked();
  });

  it('unticks one value and keeps the rest of the facet', async () => {
    const { onchange } = mount({ 'tongue-gusset-type': ['both-sides-semi', 'none'] });
    await fireEvent.click(screen.getByLabelText(/None \(0\)/));
    expect(onchange).toHaveBeenCalledWith('tongue-gusset-type', ['both-sides-semi']);
  });

  it('names each facet group with the noun the rest of the app uses', () => {
    mount();
    expect(screen.getByRole('group', { name: 'Gusset' })).toBeInTheDocument();
  });

  // The sidebar's own convention, one level down: `h3` names a section and `h4` a named control
  // under it (docs/app.md §Filters), so heading navigation stops at each facet rather than stepping
  // from Features straight past all of them.
  it('titles every facet with a heading, one level under the section that holds them', () => {
    mount();
    for (const noun of ['Gusset', 'Removable insole', 'Reflective elements']) {
      expect(screen.getByRole('heading', { level: 4, name: noun }), noun).toBeInTheDocument();
    }
  });

  // Named by the visible heading rather than by a second copy of the noun. The name-based query is
  // the whole check: an id that collided between two facets would resolve both groups to the first
  // heading, so this fails on the axis that can actually collide — one group per test.
  it('names each group from its own heading, not from a duplicated string', () => {
    mount();
    const groups: [string, string][] = [['group', 'Gusset'], ['radiogroup', 'Removable insole'],
                                        ['radiogroup', 'Reflective elements']];
    for (const [role, noun] of groups) {
      const group = screen.getByRole(role, { name: noun });
      expect(group, noun).not.toHaveAttribute('aria-label');
      expect(group.getAttribute('aria-labelledby'), noun)
        .toBe(screen.getByRole('heading', { level: 4, name: noun }).id);
    }
  });

  it('adds no text input, so the drawer\'s iOS zoom guard still enumerates them all', () => {
    const { container } = mount();
    expect(container.querySelectorAll('input:not([type=checkbox])')).toHaveLength(0);
  });
});

/**
 * `aria-labelledby` is an ID-reference *list*, so a slug carrying whitespace names two ids that do
 * not exist and the group loses its name with nothing failing and nothing on screen. The slug comes
 * straight off the upstream payload (`scraper/src/test-catalogue.ts`), which is why the guard runs
 * over the **published** catalogue rather than a fixture — `labels.test.ts`'s rule, for its reason.
 */
describe('the id each facet mints', () => {
  const catalogue = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../data/tests.json'), 'utf8'),
  ) as { tests: LabTest[] };
  const ID_TOKEN = /^[a-z0-9-]+$/;

  it('is one id token, whatever the catalogue calls a categorical test', () => {
    expect(ID_TOKEN.test('tongue-gusset-type')).toBe(true);
    // The shape that breaks it, and the one upstream is free to send tomorrow.
    expect(ID_TOKEN.test('tongue gusset type')).toBe(false);
    const facets = catalogue.tests.filter(isCategorical);
    expect(facets.length).toBeGreaterThan(0); // or the filter below asserts nothing
    expect(facets.map((t) => t.slug).filter((slug) => !ID_TOKEN.test(slug))).toEqual([]);
  });
});

import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page, { VIEW_WRITE_MS } from './Page.svelte';
import { TABLE_ANCHOR_ID } from './lib/anchor';
import { indexTests } from './lib/dataset';
import { VIEW_STORAGE_KEY } from './lib/persist';
import { PRESETS } from './lib/presets';
import { FLEET, TESTS, labTest } from './lib/test-fixtures';
import { defaultColumns, parseView } from './lib/urlstate';
import type { LabTest, ShoesFile } from '../../shared/types.js';

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
const idx = indexTests(TESTS);
// An extra numeric test that is not in the sidebar's curated list, so the "Add filter…" select renders.
const EXTRA: LabTest = labTest({ id: 99, slug: 'stiffness', name: 'Stiffness', units: 'N' });
const dataPlus: ShoesFile = { ...data, tests: [...TESTS, EXTRA] };

/** jsdom's Blob has no `.text()`, so read it the long way round. */
const readBlob = (b: Blob) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result));
  fr.onerror = () => reject(fr.error);
  fr.readAsText(b);
});

/**
 * jsdom implements neither `URL.createObjectURL` nor `URL.revokeObjectURL`, so they have to be planted
 * rather than spied on. Restore whatever was there (usually nothing) so test order cannot matter.
 */
function stubObjectUrls(stubs: Partial<typeof URL>): () => void {
  const saved = Object.keys(stubs).map((k) => [k, Object.getOwnPropertyDescriptor(URL, k)] as const);
  Object.assign(URL, stubs);
  return () => {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(URL, k, desc);
      else delete (URL as unknown as Record<string, unknown>)[k];
    }
  };
}

let restoreUrls: (() => void) | null = null;

/**
 * The URL and storage write is trailing-debounced, so every assertion about `location.search` or
 * `localStorage` here is 200ms late (docs/app.md §View and URL ownership). Only the two timer
 * functions are faked: the transition stubs in `test-setup.ts` finish on a microtask and jsdom's
 * `FileReader` schedules its own work, both of which a blanket `useFakeTimers()` would freeze.
 */
const settle = () => vi.advanceTimersByTime(VIEW_WRITE_MS);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  history.replaceState(null, '', '/');
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  // jsdom implements no layout, so Element.prototype has no scrollIntoView and the skip link would
  // throw. Planted rather than guarded at the call site.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  restoreUrls?.();
  restoreUrls = null;
  delete (Element.prototype as Partial<Element>).scrollIntoView;
  vi.restoreAllMocks();
  // `restoreAllMocks` does not reset timers, and the export case's deferred revoke stalls forever
  // under a fake clock that no later test advances.
  vi.useRealTimers();
});

/** jsdom's synthetic click does not move focus the way a real one does, and the dialog hands focus
 *  back to whatever held it — so the trigger has to actually hold it first. */
async function openAddFilter() {
  const trigger = screen.getByRole('button', { name: 'Add filter' });
  trigger.focus();
  await fireEvent.click(trigger);
  return trigger;
}
async function addFilter(name: string) {
  await openAddFilter();
  await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(name) }));
}

describe('Page', () => {
  it('renders count, attribution and table', () => {
    render(Page, { props: { data } });
    expect(screen.getByText(/5 of 5 shoes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /RunRepeat/ })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
  it('restores state from the URL', () => {
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByText(/1 of 5 shoes/)).toBeInTheDocument();
  });
  it('applying a preset filters the table and updates the URL', async () => {
    render(Page, { props: { data } });
    // the band's card, not the toolbar pill: one is a button, the other a radio
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(screen.getByText(/2 of 5 shoes/)).toBeInTheDocument(); // cushy and trainer pass on the fixture fleet
    settle();
    expect(location.search).toContain('plate=none%2Cplated-other');
    expect(location.search).toContain('r.heel-stack=35%7E');
  });
  it('changing a filter updates the URL; resetting clears it', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    settle();
    expect(location.search).toContain('plate=carbon');
    await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    settle();
    expect(location.search).toBe('');
  });
  it('round-trips a multi-value plate filter from URL to filtered rows', () => {
    // "any plate at all" is now chosen directly, as both plated values, rather than named by a token.
    history.replaceState(null, '', '/?plate=carbon,plated-other');
    render(Page, { props: { data } });
    expect(screen.getByText(/2 of 5 shoes/)).toBeInTheDocument();
    const names = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(names.join(' ')).toMatch(/racer/);
    expect(names.join(' ')).toMatch(/trainer/);
  });
  it('sorting by a column writes the sort to the URL', async () => {
    render(Page, { props: { data } });
    const th = screen.getByRole('columnheader', { name: /Heel stack/ });
    await fireEvent.click(th.querySelector('button')!);
    settle();
    expect(location.search).toContain('sort=-heel-stack');
  });
  it('keeps an added row with no bound, and carries it in the URL', async () => {
    render(Page, { props: { data: dataPlus } });
    await addFilter('Stiffness');
    // which rows are shown is its own state now, so a shared link shows the same controls
    settle();
    expect(location.search).toContain('rows=stiffness');
    // the fieldset's aria-label names the group, so this is the slider row rather than the column-picker entry
    expect(screen.getByRole('group', { name: /^Stiffness/ })).toBeInTheDocument();
  });
  it('accounts for hidden shoes in the receipt and can admit the ones missing data', async () => {
    history.replaceState(null, '', '/?r.heel-stack=36~');
    render(Page, { props: { data } });
    // cushy and racer pass, trainer and oldie are out of bounds, mystery has no reading at all
    expect(screen.getByTestId('receipt')).toHaveTextContent('2 outside your bounds');
    expect(screen.getByTestId('receipt')).toHaveTextContent('1 shoe has no data for the active filters');

    await fireEvent.click(screen.getByRole('button', { name: /show them anyway/i }));
    settle();
    expect(location.search).toContain('missing=1');
    expect(screen.getByText(/3 of 5 shoes/)).toBeInTheDocument();
    expect(screen.getByTestId('receipt')).toHaveTextContent(/no data for the active filters are included/);
  });
  it('exports the visible rows as a CSV download', async () => {
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    restoreUrls = stubObjectUrls({
      createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return 'blob:mock'; }) as typeof URL.createObjectURL,
      revokeObjectURL: revoke,
    });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));

    expect(clicked[0]?.download).toBe('shoe-lab-export.csv');
    expect(clicked[0]?.href).toBe('blob:mock');
    // the revoke is deferred a tick so the browser can take its own reference to the blob first
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
    const text = await readBlob(blobs[0]!);
    expect(text).toMatch(/^slug,name,brand,/);
    expect(text).toContain('racer');
    expect(text).not.toContain('cushy'); // filtered out, so not exported
  });
  it('cycles the theme and remembers the choice', async () => {
    render(Page, { props: { data } });
    const toggle = screen.getByRole('button', { name: /theme/i });
    await fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    await fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBe('auto');
  });
  it('names the active theme on the toggle', async () => {
    render(Page, { props: { data } });
    const toggle = screen.getByRole('button', { name: /theme/i });
    expect(toggle).toHaveAccessibleName(/currently auto/);
    await fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName(/currently light/);
  });
  it('explains an empty result instead of showing a bare header row', () => {
    history.replaceState(null, '', '/?q=nothing-matches-this');
    render(Page, { props: { data } });
    expect(screen.getByText(/0 of 5 shoes/)).toBeInTheDocument();
    expect(screen.getByText(/No shoes match/)).toBeInTheDocument();
  });
  it('toggles the mobile filter drawer', async () => {
    render(Page, { props: { data } });
    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
  // 49 tab stops from the top of the page to the first row, and the skip link is the way past them.
  it('sends the keyboard straight to the table, without touching the URL', async () => {
    render(Page, { props: { data } });
    const link = screen.getByRole('link', { name: /Skip to results/ });
    await fireEvent.click(link);
    expect(document.getElementById(TABLE_ANCHOR_ID)).toHaveFocus();
    // The view owns the query string; a fragment left behind would ride along in every shared link.
    expect(location.hash).toBe('');
  });
  it('traps focus in the open drawer and hands it back on Escape', async () => {
    render(Page, { props: { data } });
    const toggle = screen.getByRole('button', { name: 'Filters' });
    toggle.focus();
    await fireEvent.click(toggle);
    await tick();
    const drawer = screen.getByTestId('filter-drawer');
    expect(drawer.contains(document.activeElement)).toBe(true);

    const focusable = [...drawer.querySelectorAll<HTMLElement>('input, button, select, a[href]')];
    const last = focusable.at(-1)!;
    last.focus();
    await fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
    await fireEvent.keyDown(focusable[0]!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    await fireEvent.keyDown(last, { key: 'Escape' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  // Under 800px the sidebar is itself the drawer, so one Escape must not dismiss both.
  it('closes the Add-filter dialog on Escape and leaves the drawer open', async () => {
    render(Page, { props: { data: dataPlus } });
    const drawer = screen.getByRole('button', { name: 'Filters' });
    await fireEvent.click(drawer);
    const trigger = await openAddFilter();

    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(drawer).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveFocus();
  });
});

/** The setup strip on a first arrival; `SetupStrip.test.ts` owns when it shows and when it goes. */
const strip = () => screen.queryByTestId('setup-strip');
/**
 * The mark, wherever the questions are being asked: the strip's pressed card on a first arrival,
 * the toolbar's checked pill once the strip has handed over. Either way a hand-edited view matches
 * no story, so nothing is marked (docs/app.md §Presets).
 */
const markedStory = () => [
  ...screen.queryAllByRole('radio', { name: /All|Easy|Tempo|Race/, checked: true }),
  ...screen.queryAllByRole('button', { name: /All|Easy|Tempo|Race/, pressed: true }),
].map((r) => r.textContent?.trim().split(/\s/)[0]);
/** The side control, which is on the strip until a story is picked and in the toolbar after. */
const clickForefoot = () => fireEvent.click([
  ...screen.queryAllByRole('radio', { name: 'Forefoot' }),
  ...screen.queryAllByRole('button', { name: /^Forefoot/ }),
][0]!);

describe('Page story selection', () => {
  it('opens on the strip, with the live count of each story', () => {
    render(Page, { props: { data } });
    expect(strip()).toBeInTheDocument();
    expect(markedStory()).toEqual(['All']);
    expect(screen.getByRole('button', { name: /Easy/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Race/ })).toHaveTextContent('2');
  });
  it('marks exactly the story that was applied', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(markedStory()).toEqual(['Easy']);
  });
  it('drops the mark once a bound is edited past what any story describes', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    await fireEvent.input(screen.getByRole('group', { name: 'Stack — Heel' }).querySelector('input')!,
      { target: { value: '20' } });
    expect(markedStory()).toEqual([]);
  });
  it('drops the mark when a filter is added even though nothing is bounded yet', async () => {
    render(Page, { props: { data: dataPlus } });
    await addFilter('Stiffness');
    expect(markedStory()).toEqual([]);
  });
  it('marks nothing when the link carries filters', () => {
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(markedStory()).toEqual([]);
  });
  // The strip asks both questions once and hands over for good: while it is up, the bar carries no
  // second copy of the same four stories (docs/app.md §Presets).
  it('asks the questions on one surface at a time', async () => {
    render(Page, { props: { data } });
    expect(strip()).toBeInTheDocument();
    expect(screen.queryAllByRole('radio', { name: /All|Easy|Tempo|Race/ })).toHaveLength(0);

    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(screen.getAllByRole('radio', { name: /All|Easy|Tempo|Race/ })).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Heel' })).toBeInTheDocument();
  });
  // A regression guard rather than a red-first test: the heel baseline already marks Heel.
  it('marks both groups when the view is a story on a side', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));   // the strip's card
    expect(markedStory()).toEqual(['Easy']);
    expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
  });

  it('marks neither side when the view mixes them, and All when nothing is filtered', () => {
    history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack');
    render(Page, { props: { data } });
    expect(screen.getByRole('radio', { name: 'Heel' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Forefoot' })).not.toBeChecked();
    // A view showing everything is an All view whether or not it commits to a side; the mark is
    // `sameValue(v, allView(v))`, so it is lit exactly when pressing it would do nothing.
    expect(markedStory()).toEqual(['All']);
  });

  it('All restores the derived side\'s own plain table, and stays marked on it', async () => {
    history.replaceState(null, '', `/?cols=${defaultColumns('forefoot').join(',')}&r.weight=~250`);
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
    expect(markedStory()).toEqual(['All']);
    expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
    settle();
    expect(location.search).not.toContain('r.weight');
    expect(parseView(location.search.slice(1), idx).columns).toEqual(defaultColumns('forefoot'));
  });

  it('All on a mixed view clears the filters, leaves the table\'s shape, and then marks itself', async () => {
    history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack&sort=-forefoot-stack&r.weight=~250');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
    expect(markedStory()).toEqual(['All']);   // nothing left for it to do
    settle();
    expect(location.search).not.toContain('r.weight');
    expect(location.search).toContain('cols=score%2Cheel-stack%2Cforefoot-stack');
    expect(location.search).toContain('sort=-forefoot-stack');   // the sort is left exactly as it was
  });

  // Mixed *only* because of the bound, so clearing it is what gives the view a side — and the view
  // it leaves is not that side's plain table.
  it('All takes two presses when clearing the bound is what makes the view sided', async () => {
    history.replaceState(null, '', '/?cols=score,heel-stack&r.forefoot-stack=20~');
    render(Page, { props: { data } });

    await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
    expect(markedStory()).toEqual([]);        // honestly unlit: there is still something All can do
    expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
    settle();
    expect(location.search).not.toContain('r.forefoot-stack');
    expect(location.search).toContain('cols=score%2Cheel-stack');

    await fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
    expect(markedStory()).toEqual(['All']);
    settle();
    expect(location.search).toBe('');
  });

  // `workingSide`'s only reason to exist: the stories each bind one half, so one has to be picked.
  // A regression guard rather than a red-first test.
  it('a story picked from a mixed view lands on the baseline side', async () => {
    history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: /Easy/ }));
    expect(markedStory()).toEqual(['Easy']);
    expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
  });

  // A regression guard rather than a red-first test: All has always rebuilt the baseline wholesale.
  it('All clears a filter the user set by hand, not only a preset\'s', async () => {
    render(Page, { props: { data } });
    await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'nova' } });
    await fireEvent.click(screen.getByRole('button', { name: /^All/ }));   // strip is still up
    settle();
    expect(location.search).not.toContain('q=');
  });
  // The skip link (BACKLOG.md) is its next consumer; the id and the tabindex are what it needs.
  it('wraps the table in a focusable anchor', () => {
    render(Page, { props: { data } });
    expect(document.getElementById(TABLE_ANCHOR_ID)).toHaveAttribute('tabindex', '-1');
  });
});

// First line only: a header is name over units-and-direction now, and it is the name these cases
// are about (docs/app.md §Columns and sorting).
const columnHeaders = () => screen.getAllByRole('columnheader')
  .map((th) => (th.querySelector('.h-name') ?? th).textContent?.trim());

describe('Page side toggle', () => {
  it('changes the columns without collapsing the band', async () => {
    render(Page, { props: { data } });
    expect(columnHeaders()).toContain('Heel stack');
    await clickForefoot();

    expect(markedStory()).toEqual(['All']);     // forefoot's own plain table is an All view too
    expect(columnHeaders()).toContain('Forefoot stack');
    expect(columnHeaders()).not.toContain('Heel stack');
    settle();
    expect(parseView(location.search.slice(1), idx).columns).toEqual(defaultColumns('forefoot'));
  });
  it('re-derives a story rather than only setting the field, and flips back to the same view', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    settle();
    const before = location.search;

    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
    expect(markedStory()).toEqual(['Easy']);
    settle();
    expect(location.search).toContain('r.forefoot-stack=');
    expect(location.search).not.toContain('r.heel-stack=');

    await fireEvent.click(screen.getByRole('radio', { name: 'Heel' }));
    settle();
    expect(location.search).toBe(before);
  });
  it('picking a side drops the other half\'s bound, keeps the rest, and moves the columns', async () => {
    history.replaceState(null, '', '/?cols=score,heel-stack&sort=-heel-stack&r.heel-stack=36~&r.weight=~250&q=nova');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));

    // An escaped nbsp, not a space: the sort arrow is nbsp-joined inside `.h-name` and
    // `columnHeaders()` reads that span, so a copy-paste must not silently lose it.
    expect(columnHeaders()).toEqual(['Shoe', 'Score', 'Forefoot stack\u00a0▼']);
    expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
    settle();
    expect(location.search).not.toContain('r.heel-stack');   // the number does not transfer
    expect(location.search).toContain('r.weight=%7E250');    // no side, so not this control's business
    expect(location.search).toContain('q=nova');
    expect(location.search).toContain('sort=-forefoot-stack');
  });
  it('gives a side-free view that side\'s measurements rather than doing nothing', async () => {
    history.replaceState(null, '', '/?cols=score,weight');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
    expect(columnHeaders()).toContain('Forefoot stack');
    expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
  });
  it('recounts the stories on the other side', async () => {
    render(Page, { props: { data } });
    const countOf = (label: RegExp) => screen.getByRole('button', { name: label }).textContent;
    const before = PRESETS.map((p) => countOf(new RegExp(p.label)));
    await clickForefoot();
    // the fixture's two sides sit on different scales, so at least one story must move
    expect(PRESETS.map((p) => countOf(new RegExp(p.label)))).not.toEqual(before);
  });
});

describe('Page persistence', () => {
  it('lets a shared link beat a previous session', () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'plate=carbon,plated-other'); // would show 2 shoes
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByText(/1 of 5 shoes/)).toBeInTheDocument();
    expect(location.search).toContain('plate=carbon');
  });
  it('restores a stored view on a bare URL and writes it back to the URL', () => {
    // without the write-back a returning visitor sees a filtered table behind a bare URL, and
    // copying the link shares the default view instead of what is on screen
    localStorage.setItem(VIEW_STORAGE_KEY, 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByText(/1 of 5 shoes/)).toBeInTheDocument();
    // No `settle()`, deliberately: the restore is a one-off at init rather than part of a burst,
    // so it flushes rather than waiting out the debounce (docs/app.md §View and URL ownership).
    expect(location.search).toContain('plate=carbon');
    expect(strip()).not.toBeInTheDocument();
  });
  it('stores the view on every change', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    settle();
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toContain('plate=carbon');
  });
  it('opens at defaults when the stored value is under another schema version', () => {
    localStorage.setItem(VIEW_STORAGE_KEY.replace(/\d+$/, (n) => String(Number(n) - 1)), 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByText(/5 of 5 shoes/)).toBeInTheDocument();
    expect(location.search).toBe('');
    expect(strip()).toBeInTheDocument();
  });
  it('does not write the URL once per keystroke', async () => {
    render(Page, { props: { data } });
    const spy = vi.spyOn(history, 'replaceState');
    const search = screen.getByLabelText('Search');
    for (const q of ['n', 'no', 'nov', 'nova', 'novab', 'novabl', 'novabla', 'novablas', 'novablast']) {
      await fireEvent.input(search, { target: { value: q } });
    }
    // Nine keystrokes, and today's write path would have made nine calls.
    expect(spy).not.toHaveBeenCalled();
    settle();
    expect(spy).toHaveBeenCalledOnce();
    expect(location.search).toContain('q=novablast');
  });
  it('flushes the pending write on pagehide', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    const spy = vi.spyOn(history, 'replaceState');
    window.dispatchEvent(new Event('pagehide'));
    expect(spy).toHaveBeenCalledOnce();
    expect(location.search).toContain('plate=carbon');
  });
  it('opens normally when storage is blocked in both directions', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(Page, { props: { data } });
    expect(strip()).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(screen.getByText(/2 of 5 shoes/)).toBeInTheDocument();
  });
});

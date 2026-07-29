import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page, { VIEW_WRITE_MS } from './Page.svelte';
import { TABLE_ANCHOR_ID } from './lib/anchor';
import { VIEW_STORAGE_KEY } from './lib/persist';
import { PRESETS } from './lib/presets';
import { FLEET, TESTS, labTest } from './lib/test-fixtures';
import type { LabTest, ShoesFile } from '../../shared/types.js';

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
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
  // jsdom implements no layout, so Element.prototype has no scrollIntoView and Browse all would
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
/** The toolbar's story pills, which replaced both the chip row and the Clear button: a hand-edited
 *  view matches no story, so nothing is marked (docs/app.md §Presets). */
const markedStory = () => screen.queryAllByRole('radio', { name: /All|Easy|Tempo|Race/, checked: true })
  .map((r) => r.textContent?.trim().split(/\s/)[0]);

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
  it('All returns to this runner\'s own default, keeping who they are', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));

    settle();
    expect(location.search).toBe('?strike=forefoot');    // strike survives; everything else goes
    expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
    expect(markedStory()).toEqual(['All']);
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

describe('Page strike toggle', () => {
  it('changes the columns without collapsing the band', async () => {
    render(Page, { props: { data } });
    expect(columnHeaders()).toContain('Heel stack');
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));

    expect(markedStory()).toEqual(['All']);     // still this runner's own default view
    expect(columnHeaders()).toContain('Forefoot stack');
    expect(columnHeaders()).not.toContain('Heel stack');
    settle();
    expect(location.search).toContain('strike=forefoot');
    expect(location.search).not.toContain('cols=');
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
  it('swaps a hand-edited view\'s columns and sort, and leaves its bounds alone', async () => {
    history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack&sort=-heel-stack&r.heel-stack=36~');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));

    // a map onto the new side, not an exchange: both halves were shown, one column comes out
    expect(columnHeaders()).toEqual(['Shoe', 'Score', 'Forefoot stack\u00a0▼']);
    settle();
    expect(location.search).toContain('sort=-forefoot-stack');
    expect(location.search).toContain('r.heel-stack=36%7E');   // the number was never the runner's to move
  });
  it('recounts the stories on the other side', async () => {
    render(Page, { props: { data } });
    const countOf = (label: RegExp) => screen.getByRole('button', { name: label }).textContent;
    const before = PRESETS.map((p) => countOf(new RegExp(p.label)));
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
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

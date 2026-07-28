import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './Page.svelte';
import { TABLE_ANCHOR_ID } from './components/EntryBand.svelte';
import { VIEW_STORAGE_KEY } from './lib/persist';
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

beforeEach(() => {
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
});

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
    // on a default view the band renders and PresetChips does not, so the card carries the description too
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(screen.getByText(/2 of 5 shoes/)).toBeInTheDocument(); // cushy and trainer pass on the fixture fleet
    expect(location.search).toContain('plate=none%2Cplated-other');
    expect(location.search).toContain('r.heel-stack=35%7E');
  });
  it('changing a filter updates the URL; resetting clears it', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    expect(location.search).toContain('plate=carbon');
    await fireEvent.click(screen.getByRole('button', { name: /reset/i }));
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
    expect(location.search).toContain('sort=-heel-stack');
  });
  it('keeps an added row with no bound, and carries it in the URL', async () => {
    render(Page, { props: { data: dataPlus } });
    await fireEvent.change(screen.getByLabelText('Add filter'), { target: { value: 'stiffness' } });
    // which rows are shown is its own state now, so a shared link shows the same controls
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
    await new Promise((r) => setTimeout(r, 0));
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
});

const band = () => screen.queryByTestId('entry-band');
const chips = () => screen.queryByRole('group', { name: 'Presets' });

describe('Page entry band', () => {
  it('opens on the band, with the live count of each story', () => {
    render(Page, { props: { data } });
    expect(band()).toBeInTheDocument();
    expect(chips()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Easy/ })).toHaveTextContent('2 shoes');
    expect(screen.getByRole('button', { name: /Race/ })).toHaveTextContent('2 shoes');
    expect(screen.getByRole('button', { name: /Browse all/ })).toHaveTextContent('5 shoes');
  });
  it('collapses to the chip row once a story is applied', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(band()).not.toBeInTheDocument();
    expect(chips()).toBeInTheDocument();
  });
  it('collapses when a filter is added even though nothing is bounded yet', async () => {
    render(Page, { props: { data: dataPlus } });
    expect(band()).toBeInTheDocument();
    await fireEvent.change(screen.getByLabelText('Add filter'), { target: { value: 'stiffness' } });
    expect(band()).not.toBeInTheDocument();
    expect(chips()).toBeInTheDocument();
  });
  it('opens collapsed when the link carries filters', () => {
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(band()).not.toBeInTheDocument();
    expect(chips()).toBeInTheDocument();
  });
  it('Browse all leaves the view exactly as it was', async () => {
    render(Page, { props: { data } });
    const rows = screen.getAllByRole('row').length;
    await fireEvent.click(screen.getByRole('button', { name: /Browse all/ }));
    expect(location.search).toBe('');
    expect(screen.getAllByRole('row').length).toBe(rows);
    // deliberately does not collapse: the collapse is derived from view state, which is unchanged
    expect(band()).toBeInTheDocument();
    expect(document.getElementById(TABLE_ANCHOR_ID)).toBe(document.activeElement);
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
    expect(location.search).toContain('plate=carbon');
    expect(band()).not.toBeInTheDocument();
  });
  it('stores the view on every change', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toContain('plate=carbon');
  });
  it('opens at defaults when the stored value is under another schema version', () => {
    localStorage.setItem(VIEW_STORAGE_KEY.replace(/\d+$/, (n) => String(Number(n) - 1)), 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByText(/5 of 5 shoes/)).toBeInTheDocument();
    expect(location.search).toBe('');
    expect(band()).toBeInTheDocument();
  });
  it('opens normally when storage is blocked in both directions', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(Page, { props: { data } });
    expect(band()).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    expect(screen.getByText(/2 of 5 shoes/)).toBeInTheDocument();
  });
});

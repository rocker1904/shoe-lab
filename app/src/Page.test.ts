import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './Page.svelte';
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
});
afterEach(() => {
  restoreUrls?.();
  restoreUrls = null;
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
    await fireEvent.click(screen.getByRole('button', { name: 'Easy-day cruiser' }));
    expect(screen.getByText(/1 of 5 shoes/)).toBeInTheDocument(); // only 'cushy' passes on fixture fleet
    expect(location.search).toContain('plate=none');
    expect(location.search).toContain('sort=-energy-return-heel');
  });
  it('changing a filter updates the URL; resetting clears it', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: 'Carbon' }));
    expect(location.search).toContain('plate=carbon');
    await fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(location.search).toBe('');
  });
  it('round-trips the "any plate" filter from URL to filtered rows', () => {
    // 'plated' in the URL means "any plate at all": carbon and plated-other both qualify.
    history.replaceState(null, '', '/?plate=plated');
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
  it('keeps an empty added range in the view even though it never reaches the URL', async () => {
    render(Page, { props: { data: dataPlus } });
    await fireEvent.change(screen.getByLabelText('Add filter'), { target: { value: 'stiffness' } });
    expect(location.search).toBe(''); // an open-ended range has nothing to serialise
    // the fieldset's legend names the group, so this is the slider row rather than the column-picker entry
    expect(screen.getByRole('group', { name: /Stiffness/ })).toBeInTheDocument();
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

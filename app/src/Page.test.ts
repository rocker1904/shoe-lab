import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page, { VIEW_WRITE_MS } from './Page.svelte';
import { fireResizeObservers } from './test-setup';
import { TABLE_ANCHOR_ID } from './lib/anchor';
import { indexTests } from './lib/dataset';
import { FLEET, TESTS, labTest } from './lib/test-fixtures';
import { defaultColumns, parseView } from './lib/urlstate';
import { DISPLAY_DEFAULTS, washAlpha } from './lib/wash';
import type { LabTest, ShoesFile } from '../../shared/types.js';

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
const idx = indexTests(TESTS);
/** The key view state lived under until the URL became its only home. Nothing in the app writes it
 *  any more, so it is planted by hand: these tests are about a browser still carrying one. */
const DEAD_VIEW_KEY = 'shoe-lab.view.v4';
/**
 * The invariant is **no view in storage**, not an empty storage: preferences legitimately live
 * there (docs/app.md §View and URL ownership), and the display preference is one of them. Stated
 * as an allowlist rather than a count, so a sixth key has to be declared here — and a view smuggled
 * in under a name of its own fails on the day it is written.
 */
const PREFERENCE_KEYS = ['theme', 'display'];
const strayStorageKeys = () => Object.keys(localStorage).filter((k) => !PREFERENCE_KEYS.includes(k));
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

/** jsdom implements no clipboard at all, so it has to be planted rather than spied on. */
function stubClipboard(writeText = vi.fn(async () => {})) {
  const saved = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return { writeText, restore: () => {
    if (saved) Object.defineProperty(navigator, 'clipboard', saved);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  } };
}
let restoreClipboard: (() => void) | null = null;

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
  restoreClipboard?.();
  restoreClipboard = null;
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

it('lays a scrim behind the drawer, so the page reads as inert as well as being it', async () => {
  const { container } = render(Page, { props: { data } });
  await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(container.querySelector('.scrim')).not.toBeNull();
});

describe('Page', () => {
  it('renders count, attribution and table', () => {
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 5 of the 5 shoes');
    expect(screen.getByRole('link', { name: /RunRepeat/ })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
  it('restores state from the URL', () => {
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 1 of the 1 shoes');
  });
  it('applying a preset filters the table and updates the URL', async () => {
    render(Page, { props: { data } });
    // the band's card, not the toolbar pill: one is a button, the other a radio
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    // Easy's only filter is the plate gate, so its pool is everything but the carbon racer; the
    // ranking is what the story now does (docs/app.md §Presets).
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 4 of the 4 shoes');
    settle();
    expect(location.search).toContain('plate=none%2Cplated-other');
    expect(location.search).toContain('sort=-easy-score-heel');
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
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 2 of the 2 shoes');
    const names = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(names.join(' ')).toMatch(/racer/);
    expect(names.join(' ')).toMatch(/trainer/);
  });
  it('resolves every story\'s score, and leaves Race alone when stability is ticked', async () => {
    // Race declares no stable variant, so the preference is inert on it — but `Page` resolves the
    // scores, so nothing else in the suite would catch it resolving only the two that do.
    history.replaceState(null, '', '/?cols=race-score-heel&sort=-race-score-heel');
    render(Page, { props: { data } });
    const cells = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    const before = cells();
    expect(before.join(' ')).toMatch(/\d/);   // the column resolves at all
    await fireEvent.click(screen.getByRole('button', { name: 'Stability' }));
    expect(cells()).toEqual(before);
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
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 3 of the 5 shoes');
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
  /**
   * The band owns the host, and only one host is mounted. The suite's `matchMedia` stub never
   * matches, so it always renders the desktop band — a mobile one has to be asked for outright.
   */
  it('hands the utilities to the bar below 800px, and to nothing else', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => ({
      matches: q.includes('max-width: 800px'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      addListener: () => {}, removeListener: () => {},
    })) as typeof window.matchMedia);
    const { container } = render(Page, { props: { data } });
    const toolbar = container.querySelector<HTMLElement>('[data-testid="toolbar"]')!;
    for (const name of ['Copy link', 'Export CSV']) {
      expect(screen.getAllByRole('button', { name }), `${name} is mounted twice`).toHaveLength(1);
      expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Display' })).toHaveLength(1);
    // One live region, or the confirmation is announced twice or by the hidden copy.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  /**
   * Two boundaries with two different jobs, so a band has to be able to answer them separately —
   * and a resize has to reach the runes, which the flat stub above cannot do
   * (docs/app.md §The chrome bands).
   *
   * It moves the window BOTH ways the app asks about it, because the two boundaries no longer ask
   * the same way: the chrome's is still a `matchMedia`, so each call gets a live `matches` getter
   * and keeps its listener, while the sidebar's reads the layout width off a `resize` — which is
   * the change that let it start answering about the column set (docs/app.md §Filters). jsdom lays
   * nothing out, so `documentElement.clientWidth` is 0 there and `innerWidth` is what the app falls
   * back to.
   */
  function stubViewport(width: number) {
    let now = width;
    const listeners: (() => void)[] = [];
    const limit = (q: string) => Number(/max-width:\s*([\d.]+)px/.exec(q)?.[1] ?? NaN);
    vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => ({
      get matches() { return now <= limit(q); },
      media: q, onchange: null,
      addEventListener: (_: string, fn: EventListener) => { listeners.push(() => fn(new Event('change'))); },
      removeEventListener: () => {}, dispatchEvent: () => false,
      addListener: () => {}, removeListener: () => {},
    })) as unknown as typeof window.matchMedia);
    window.innerWidth = now;
    return async (next: number) => {
      now = next;
      window.innerWidth = next;
      window.dispatchEvent(new Event('resize'));
      for (const fn of [...listeners]) fn();
      await tick();
    };
  }

  /**
   * The sidebar is a drawer wherever the table cannot be seen beside it, which reaches far past the
   * width where the chrome stops being a phone's. A window dragged from a phone to a laptop used to
   * close the drawer at 800px and leave the runner facing a permanent sidebar with the table
   * pushed off the right of the screen (docs/app.md §Filters).
   */
  it('keeps the drawer open above the chrome boundary, where the sidebar is still a drawer', async () => {
    const at = stubViewport(390);
    render(Page, { props: { data } });
    const toggle = screen.getByRole('button', { name: 'Filters' });
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await at(1000);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the drawer at the width where the sidebar becomes permanent', async () => {
    const at = stubViewport(390);
    const { container } = render(Page, { props: { data } });
    const toggle = screen.getByRole('button', { name: 'Filters' });
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await at(1400);
    // The trigger goes with the drawer it opened: above the boundary there is nothing to toggle,
    // so the button is not there to be pressed (docs/app.md §Filters).
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(container.querySelector('.layout')!.classList).not.toContain('show-filters');
  });

  /**
   * The boundary is a question about the columns on screen, not only about the width — which is why
   * it is a rune over the fit model and not the media query it used to be. Ticking past what fits
   * beside a 260px track at a width that has not moved leaves the sidebar a drawer, and that is what
   * stops the track arriving at a width where the table would have to go back to the stacked list
   * (docs/app.md §Filters).
   */
  it('keeps the sidebar a drawer where the columns on screen cannot afford its track', async () => {
    const wide = ['releasedAt', 'score', 'msrpGbp', 'plate', ...TESTS.slice(0, 7).map((t) => t.slug)];
    history.replaceState(null, '', `/?cols=${wide.join(',')}`);
    const at = stubViewport(390);
    render(Page, { props: { data } });
    await at(1250);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();

    // The same width, the default columns: the track fits beside them, so it is a column again.
    cleanup();
    history.replaceState(null, '', '/');
    const at2 = stubViewport(390);
    render(Page, { props: { data } });
    await at2(1250);
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
  });

  /**
   * The two boundaries do not move together: the utilities answer the chrome's, not the sidebar's, so a 1000px window draws them worded in the masthead while the
   * drawer behind it is still a drawer (docs/app.md §Where the utilities live).
   */
  it('leaves the utilities in the masthead at a width where the sidebar is still a drawer', async () => {
    const at = stubViewport(390);
    const { container } = render(Page, { props: { data } });
    const toolbar = container.querySelector<HTMLElement>('[data-testid="toolbar"]')!;
    expect(within(toolbar).getByRole('button', { name: 'Copy link' })).toBeInTheDocument();

    await at(1000);
    expect(within(container.querySelector('header')!)
      .getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  /**
   * The clipboard cases moved here with `copyLink` itself. Two of the mechanisms they were written
   * on did not survive the move, because this file runs under
   * `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` and `Header.test.ts` did not:
   * a `setTimeout(0)` settle never resolves under a faked clock, and what is actually being waited
   * for is the `writeText` promise settling, which is a microtask. `copyLink`'s own 2000ms
   * confirmation timer is left unadvanced — none of the three cases is about it expiring.
   */
  // Shareable URLs are a stated goal of the project with no affordance at all until now.
  it('copies the current view, and says so', async () => {
    const clip = stubClipboard();
    restoreClipboard = clip.restore;
    render(Page, { props: { data } });
    // The region is on the page before there is anything to say: a live region created together
    // with its text is not reliably announced, so only the text may arrive late.
    expect(screen.getByRole('status').textContent).toBe('');
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(clip.writeText).toHaveBeenCalledWith(location.href);
    await Promise.resolve();
    // The confirmation is its own live region, so the button keeps one accessible name and the
    // outcome is announced rather than swapped in under it.
    expect(screen.getByRole('status')).toHaveTextContent(/copied/i);
  });

  /**
   * The write path is debounced at 200ms, and a runner who changes a filter and reaches straight
   * for `Copy link` is inside that window: measured cold in Firefox, a copy 52ms after a story
   * click put the *previous* address on the clipboard while the new table was on screen, with the
   * status region saying `Copied`. The flush belongs in the copy path rather than in a shortened
   * debounce — the interval exists for the drag (docs/app.md §View and URL ownership).
   */
  it('copies the view that is on screen, not the one the debounce has yet to write', async () => {
    const clip = stubClipboard();
    restoreClipboard = clip.restore;
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    // No `settle()`: this is the race, so the pending write is deliberately still pending.
    expect(location.search).toBe('');
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    // The flush is what makes these two the same string: without it the clipboard holds the bare
    // address the URL still carried a line above.
    expect(location.search).toContain('plate=carbon');
    expect(clip.writeText).toHaveBeenCalledWith(location.href);
  });

  it('claims nothing when the clipboard refuses', async () => {
    const clip = stubClipboard(vi.fn(async () => { throw new Error('denied'); }));
    restoreClipboard = clip.restore;
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await Promise.resolve();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('copies nothing where there is no clipboard, rather than throwing', async () => {
    const saved = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    restoreClipboard = () => { if (saved) Object.defineProperty(navigator, 'clipboard', saved); };
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await Promise.resolve();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  // A regression guard rather than a red-first test: the masthead already draws them here, and this
  // is what says the rune did not quietly move them to the bar at every width.
  it('leaves the utilities in the masthead above 800px', () => {
    const { container } = render(Page, { props: { data } });
    expect(within(container.querySelector('header')!)
      .getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(within(container.querySelector<HTMLElement>('[data-testid="toolbar"]')!)
      .queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  /**
   * The theme control is a three-pill segmented group inside the Display panel now, rather than a
   * cycling utility of its own (docs/app.md §Where the utilities live, §Theming). What it applies
   * and what it persists are unchanged, which is what these two check.
   */
  async function openTheme() {
    await fireEvent.click(screen.getByRole('button', { name: 'Display' }));
    return screen.getByRole('radiogroup', { name: 'Theme' });
  }
  const pill = (name: string) => screen.getByRole('radio', { name });
  it('applies a named theme and remembers the choice', async () => {
    render(Page, { props: { data } });
    await openTheme();
    // Straight to Dark, in one press: no state on this control is more than one press away.
    await fireEvent.click(pill('Dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    await fireEvent.click(pill('Light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    await fireEvent.click(pill('Auto'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('theme')).toBe('auto');
  });
  it('marks the theme in force on the group', async () => {
    render(Page, { props: { data } });
    await openTheme();
    expect(pill('Auto')).toBeChecked();
    await fireEvent.click(pill('Light'));
    expect(pill('Light')).toBeChecked();
    expect(pill('Auto')).not.toBeChecked();
  });
  /**
   * The wave's load-bearing claim, checked where it is actually painted: a runner who never opens
   * the menu gets the alphas the app shipped before there was a menu, and nothing is written to the
   * document to make that true (docs/app.md §The display preferences).
   */
  describe('the display preferences', () => {
    const alphas = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('td.num.tinted.blue')]
      .map((td) => td.style.getPropertyValue('--a'));

    it('paints the shipped ramp and writes nothing until the menu is touched', () => {
      const { container } = render(Page, { props: { data } });
      const before = alphas(container).map(Number);
      expect(before.length).toBeGreaterThan(0);
      // The top of a ranked column is p = 1, so the frozen peak is what it paints — to the bit.
      // `wash.test.ts` holds the other 400 steps of the same curve.
      // The five-shoe fixture ranks at p = 0.875, 0.625, 0.375 and 0.125, the last of which is
      // under the floor and bare. Compared against `washAlpha` — the frozen closed form, which the
      // preference engine never touches — so this is the painted table measured against the ramp
      // that shipped, through the real render path.
      expect(new Set(before)).toEqual(new Set([0.875, 0.625, 0.375, 0.125].map(washAlpha)));
      expect(document.getElementById('wash-prefs')).toBeNull();
      expect(document.documentElement.dataset['wash']).toBeUndefined();
      expect(localStorage.getItem('display')).toBeNull();
    });

    it('repaints the table live as a grip moves, and stores the choice off the URL', async () => {
      const { container } = render(Page, { props: { data } });
      const before = alphas(container).map(Number);
      await fireEvent.click(screen.getByRole('button', { name: 'Display' }));
      await fireEvent.input(screen.getByLabelText('Strength'), { target: { value: '0.3' } });

      const after = alphas(container).map(Number);
      expect(after).not.toEqual(before);
      // Every cell that is still painted moved by the same ratio: the strength scales the ramp, it
      // does not reshape it. A cell whose scaled alpha falls under `WASH_MIN_PAINT` goes bare
      // instead, which at the shipped emphasis of 4 takes the fixture's middle rank with it — so
      // the comparison is over the cells that survive, and it asserts that some did.
      let compared = 0;
      for (let i = 0; i < before.length; i++) {
        if (!before[i] || !after[i]) continue;
        expect(after[i]! / before[i]!).toBeCloseTo(0.3 / 0.94, 6);
        compared++;
      }
      expect(compared, 'the whole ramp went bare — nothing was compared').toBeGreaterThan(0);
      // Storage holds preferences; the URL holds the view, and neither borrows the other's job.
      vi.advanceTimersByTime(500);
      expect(JSON.parse(localStorage.getItem('display')!).strength).toBe(0.3);
      expect(location.search).not.toContain('strength');
      expect(location.href).not.toMatch(/0\.3/);
    });

    it('applies a stored preference at first paint', () => {
      localStorage.setItem('display', JSON.stringify({ v: 2, ...DISPLAY_DEFAULTS, primaryHue: 145 }));
      const { container } = render(Page, { props: { data } });
      // The colour is an override on the document; the alphas are untouched by a hue change.
      expect(document.getElementById('wash-prefs')?.textContent).toContain('--wash-blue');
      expect(alphas(container).some((a) => Number(a) > 0)).toBe(true);
    });
  });

  // `getBy`, not `findBy`: `Page` renders synchronously here and the suite runs under fake timers,
  // so a `waitFor` would be an unnecessary dance with the clock. Every test in this file does the same.
  it('opens the About panel from the toolbar and hands focus back on close', async () => {
    render(Page, { props: { data } });
    const about = screen.getByRole('button', { name: 'About' });
    // jsdom's synthetic click does not move focus the way a real one does, and the dialog hands
    // focus back to whatever held it — so the trigger has to actually hold it first.
    about.focus();
    await fireEvent.click(about);
    expect(screen.getByRole('dialog', { name: 'About this table' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'About this table' })).toBeNull();
    expect(about).toHaveFocus();
  });
  // Both openers, not just the bar's: the panel hands focus back to whatever held it, and an opener
  // that is unmounted by the time it closes — the strip collapses on the first story click — is the
  // one that would strand focus on `<body>`.
  it('opens the About panel from the setup strip too, and hands focus back', async () => {
    render(Page, { props: { data } });
    const invite = screen.getByRole('button', { name: /Read about this table/ });
    invite.focus();
    await fireEvent.click(invite);
    expect(screen.getByRole('dialog', { name: 'About this table' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'About this table' })).toBeNull();
    expect(invite).toHaveFocus();
  });
  it('explains an empty result instead of showing a bare header row', () => {
    history.replaceState(null, '', '/?q=nothing-matches-this');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 0 of the 0 shoes');
    expect(screen.getByText(/No shoes match/)).toBeInTheDocument();
  });
  /**
   * The guidance used to be one unconditional sentence written for a range bound and rendered for
   * every cause, so a link emptied by a brand or a search advised clearing a bound one line under a
   * receipt reading "0 outside your bounds", on a screen with no bound set at all.
   */
  it.each([
    ['q=nothing-matches-this', 'the search'],
    ['brands=Nonesuch', 'the brand selection'],
    ['after=2099-01', 'the release-date bound'],
    ['r.weight=9000~', 'the bounds'],
  ])('names what is actually narrowing an empty result (%s)', (qs, named) => {
    history.replaceState(null, '', `/?${qs}`);
    render(Page, { props: { data } });
    const advice = screen.getByText(/No shoes match/).closest('p')!.textContent!;
    expect(advice).toContain(named);
    // the clause that was being printed with nothing on screen to act on
    // the separator rides with the clause: an `{#if}` in the markup had its leading space trimmed
    if (named === 'the bounds') expect(advice).toContain('shoes — each bound says');
    else expect(advice).not.toContain('bound says');
  });
  it('names every class that is narrowing, not only the first', () => {
    history.replaceState(null, '', '/?q=nothing-matches-this&brands=Nonesuch&disc=only');
    render(Page, { props: { data } });
    const advice = screen.getByText(/No shoes match/).closest('p')!.textContent!;
    expect(advice).toContain('the search');
    expect(advice).toContain('the brand selection');
    expect(advice).toContain('discontinued');
    expect(advice).not.toContain('the plate selection');
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
  /**
   * The PANEL takes focus, never its search box. Focusing a text input on a phone raises the
   * keyboard over the filters the runner has just asked to see, so every tap of `Filters` cost a
   * dismissal before anything could be read (docs/app.md §Filters).
   */
  it('puts focus on the drawer itself rather than in its search box', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await tick();
    const drawer = screen.getByTestId('filter-drawer');
    expect(document.activeElement).toBe(drawer);
    expect(screen.getByLabelText('Search')).not.toHaveFocus();
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
    // Backwards off the panel itself is the way out the trap has to answer now: the container is
    // not a tab stop and precedes every one of them, so an unanswered Shift+Tab walks straight out
    // of a drawer that is covering the page.
    await fireEvent.keyDown(drawer, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    last.focus();
    await fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
    await fireEvent.keyDown(focusable[0]!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    await fireEvent.keyDown(last, { key: 'Escape' });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  // Under the sidebar boundary the sidebar is itself the drawer, so one Escape must not dismiss both.
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
/** The zone control, which is on the strip until a story is picked and in the toolbar after. */
const clickForefoot = () => fireEvent.click([
  ...screen.queryAllByRole('radio', { name: 'Forefoot' }),
  ...screen.queryAllByRole('button', { name: /^Forefoot/ }),
][0]!);

describe('Page story selection', () => {
  it('opens on the strip, with the baseline marked', () => {
    render(Page, { props: { data } });
    expect(strip()).toBeInTheDocument();
    expect(markedStory()).toEqual(['All']);
  });
  it('marks exactly the story that was applied', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    expect(markedStory()).toEqual(['Easy']);
  });
  it('drops the mark once a bound is edited past what any story describes', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
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

    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    expect(screen.getAllByRole('radio', { name: /All|Easy|Tempo|Race/ })).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Heel' })).toBeInTheDocument();
  });
  // A regression guard rather than a red-first test: the heel baseline already marks Heel.
  it('marks both groups when the view is a story on a zone', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));   // the strip's card
    expect(markedStory()).toEqual(['Easy']);
    expect(screen.getByRole('radio', { name: 'Heel' })).toBeChecked();
  });

  /**
   * The strip unmounts on the first story click and nothing caught the focus the removed card was
   * holding: `document.activeElement` became `<body>`, no ring was drawn anywhere on the page, and
   * the control that replaced the card — the toolbar's pill for the same story — was 4 to 10
   * Shift+Tabs *behind* the runner, because in the DOM the bar sits above where the strip was
   * (docs/app.md §Presets).
   */
  it('hands focus to the toolbar pill the strip is replaced by', async () => {
    render(Page, { props: { data } });
    const card = screen.getByRole('button', { name: /^Easy/ });
    card.focus();
    await fireEvent.click(card);
    await tick();

    const pill = screen.getByRole('radio', { name: 'Easy' });
    expect(document.activeElement, 'focus fell to the document body').toBe(pill);
    expect(pill).toBeChecked();
  });

  /** A zone card does not unmount the strip, so the card pressed is still the control that answers
   *  the question: moving focus off it would be the same defect from the other side. */
  it('leaves focus on the zone card, which the strip does not replace', async () => {
    render(Page, { props: { data } });
    const card = screen.getByRole('button', { name: /^Forefoot/ });
    card.focus();
    await fireEvent.click(card);
    await tick();
    expect(document.activeElement).toBe(card);
  });

  it('marks neither zone when the view mixes them, and All when nothing is filtered', () => {
    history.replaceState(null, '', '/?cols=score,heel-stack,forefoot-stack');
    render(Page, { props: { data } });
    expect(screen.getByRole('radio', { name: 'Heel' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Forefoot' })).not.toBeChecked();
    // A view showing everything is an All view whether or not it commits to a zone; the mark is
    // `sameValue(v, allView(v, zone))`, so it is lit exactly when pressing it would do nothing.
    expect(markedStory()).toEqual(['All']);
  });

  it('All restores the derived zone\'s own plain table, and stays marked on it', async () => {
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

  // Mixed *only* because of the bound, so clearing it is what gives the view a zone — and the view
  // it leaves is not that zone's plain table.
  it('All takes two presses when clearing the bound is what makes the view zoned', async () => {
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

  // `workingZone`'s only reason to exist: the stories each bind one half, so one has to be picked.
  // A regression guard rather than a red-first test.
  it('a story picked from a mixed view lands on the baseline zone', async () => {
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

describe('Page zone toggle', () => {
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
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    settle();
    const before = location.search;

    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
    expect(markedStory()).toEqual(['Easy']);
    settle();
    // Easy bounds nothing, so the re-derivation shows in its columns rather than in a bound.
    expect(location.search).toContain('energy-return-forefoot');
    expect(location.search).not.toContain('energy-return-heel');

    await fireEvent.click(screen.getByRole('radio', { name: 'Heel' }));
    settle();
    expect(location.search).toBe(before);
  });
  it('picking a zone drops the other half\'s bound, keeps the rest, and moves the columns', async () => {
    history.replaceState(null, '', '/?cols=score,heel-stack&sort=-heel-stack&r.heel-stack=36~&r.weight=~250&q=nova');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));

    expect(columnHeaders()).toEqual(['Shoe', 'RunRepeat Score', 'Forefoot stack']);
    expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
    settle();
    expect(location.search).not.toContain('r.heel-stack');   // the number does not transfer
    expect(location.search).toContain('r.weight=%7E250');    // no zone, so not this control's business
    expect(location.search).toContain('q=nova');
    expect(location.search).toContain('sort=-forefoot-stack');
  });
  it('gives a zone-free view that zone\'s measurements rather than doing nothing', async () => {
    history.replaceState(null, '', '/?cols=score,weight');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
    expect(columnHeaders()).toContain('Forefoot stack');
    expect(screen.getByRole('radio', { name: 'Forefoot' })).toBeChecked();
  });
});

/**
 * The URL is the only home for view state, and a bookmark is how a runner keeps one. Nothing here
 * reads or writes storage, so a bare address is a fresh start whatever a previous session left in
 * the browser (docs/app.md §View and URL ownership).
 */
describe('Page keeps the view in the URL alone', () => {
  it('lets a shared link beat anything a previous session left behind', () => {
    localStorage.setItem(DEAD_VIEW_KEY, 'plate=carbon,plated-other'); // would show 2 shoes
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 1 of the 1 shoes');
    expect(location.search).toContain('plate=carbon');
  });
  it('opens a bare arrival on the defaults, ignoring a view left in storage', () => {
    localStorage.setItem(DEAD_VIEW_KEY, 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 5 of the 5 shoes');
    expect(location.search).toBe('');
    expect(strip()).toBeInTheDocument();
  });
  it('writes no view to storage when the view changes', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    settle();
    expect(location.search).toContain('plate=carbon');
    expect(strayStorageKeys()).toEqual([]);
  });

  /**
   * The address bar is reconciled to the parsed view once, at init. `parseView` drops what it
   * cannot vouch for (§URL encoding) — but only from the VIEW, so a link shared through a
   * newsletter kept its `utm_source` in the bar all session and the runner's own `Copy link`
   * forwarded someone else's analytics with it (docs/app.md §View and URL ownership).
   */
  it('scrubs a link\'s inert tokens at init and keeps the view it did carry', () => {
    history.replaceState(null, '', '/?utm_source=newsletter&plate=carbon&fbclid=xyz');
    render(Page, { props: { data } });
    expect(location.search).toBe('?plate=carbon');
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 1 of the 1 shoes');
  });
  /**
   * A link of nothing but inert tokens IS a bare arrival: junk changes no behaviour at all, so the
   * runner gets the table and the strip the bare address would have given them, with the junk gone
   * from the bar (docs/app.md §View and URL ownership).
   */
  it('treats a link of nothing but inert tokens exactly as the bare address', () => {
    history.replaceState(null, '', '/?utm_source=newsletter&fbclid=xyz');
    const { container } = render(Page, { props: { data } });
    expect(location.search).toBe('');
    expect(strip()).toBeInTheDocument();
    // Read before the unmount, or the container is emptied along with it. The histogram's hatch
    // pattern carries a per-instance counter that keeps rising across renders, so it is normalised
    // away: it is an id, not a rendering.
    const shape = (html: string) => html.replace(/hatch-\d+/g, 'hatch');
    const withJunk = shape(container.innerHTML);
    cleanup();

    // The whole rendered page, not merely a similar one.
    history.replaceState(null, '', '/');
    const plain = render(Page, { props: { data } });
    expect(withJunk).toBe(shape(plain.container.innerHTML));
  });
  /** And a link that carried something the app owns is still not bare, junk beside it or not. */
  it('keeps the strip away where a real token arrived among the junk', () => {
    history.replaceState(null, '', '/?utm_source=newsletter&plate=carbon');
    render(Page, { props: { data } });
    expect(location.search).toBe('?plate=carbon');
    expect(strip()).not.toBeInTheDocument();
  });
  it('gives a filtered visitor the default table on their next bare arrival', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Carbon' }));
    settle();
    expect(location.search).toContain('plate=carbon');
    // The second visit, with nothing but the address bar between the two.
    cleanup();
    history.replaceState(null, '', '/');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 5 of the 5 shoes');
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
});

/**
 * Which rendering mounts, now that it is a fit question rather than a viewport constant. The model
 * itself is `lib/fit.test.ts`'s and its agreement with a real browser is `cross-browser.spec.ts`'s;
 * this owns the wiring — that the decision reads the live width, reacts to a resize and to a column
 * being ticked, and that only one table is ever in the DOM.
 * docs/app.md §Two renderings, and only one of them mounted
 */
describe('Page mounts the rendering that fits', () => {
  /**
   * jsdom defines `innerWidth` as a getter and lays nothing out, so `documentElement.clientWidth`
   * is 0 and the width has to be planted. Returns a setter that also tells the page.
   *
   * `windowMoved: false` is the case a `resize` listener could never have seen: the layout width
   * changing while the window stands still (`lib/layout-width.ts`).
   */
  function stubWidth(width: number) {
    let now = width;
    Object.defineProperty(window, 'innerWidth', { get: () => now, configurable: true });
    return async (next: number, { windowMoved = true } = {}) => {
      now = next;
      if (windowMoved) window.dispatchEvent(new Event('resize'));
      else fireResizeObservers();
      await tick();
    };
  }
  const everyColumn = [...TESTS.map((t) => t.slug), 'releasedAt'].join(',');
  const mobile = () => screen.queryByTestId('shoe-table-mobile');
  const desktop = () => screen.queryByRole('button', { name: 'Shoe' });

  it('mounts the desktop table where the columns fit the window', () => {
    stubWidth(1400);
    render(Page, { props: { data } });
    expect(desktop()).not.toBeNull();
    expect(mobile()).toBeNull();
  });

  it('mounts the phone list where they do not, above the phone floor', () => {
    // Every test in the fixture at once, at a laptop width: the fit question has an answer a
    // viewport constant could never give, because the width has not moved and the table has.
    history.replaceState(null, '', `/?cols=${everyColumn}`);
    stubWidth(1000);
    render(Page, { props: { data } });
    expect(mobile()).not.toBeNull();
    expect(desktop()).toBeNull();
  });

  it('swaps the rendering on a resize, both ways', async () => {
    history.replaceState(null, '', `/?cols=${everyColumn}`);
    const at = stubWidth(2400);
    render(Page, { props: { data } });
    expect(desktop()).not.toBeNull();

    await at(900);
    expect(mobile()).not.toBeNull();
    expect(desktop()).toBeNull();

    await at(2400);
    expect(desktop()).not.toBeNull();
    expect(mobile()).toBeNull();
  });

  /**
   * The width is OBSERVED, never inferred from window events. A filter cleared or a row opened
   * makes the document tall enough for a classic scrollbar, which takes 12–15px out of the layout
   * with no `resize` anywhere — and near the fit threshold the table already up stops fitting.
   * Measured headed at a 931px window on the real fleet: the document scrolled sideways by 1px and
   * stayed that way until something moved the window.
   * docs/app.md §Two renderings, and only one of them mounted
   *
   * jsdom lays nothing out, so the phone floor is the boundary a planted width can cross; the
   * mechanism under test is the same one.
   */
  it('follows the layout width when the document resizes and the window does not', async () => {
    history.replaceState(null, '', '/?cols=weight');
    const at = stubWidth(760);
    render(Page, { props: { data } });
    expect(desktop()).not.toBeNull();

    await at(690, { windowMoved: false });
    expect(mobile()).not.toBeNull();
    expect(desktop()).toBeNull();
  });

  it('mounts the phone list below the floor whatever fits, and never both tables', () => {
    history.replaceState(null, '', '/?cols=weight');
    stubWidth(690);
    const { container } = render(Page, { props: { data } });
    expect(mobile()).not.toBeNull();
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  /**
   * The reason the open set is `Page.svelte`'s and not a table's — see
   * docs/app.md §Two renderings, and only one of them mounted. Crossing the boundary used to take a
   * rotation; it now takes a tick of the column picker, which a runner does while reading a row.
   */
  it('keeps an open row open when a ticked column flips the rendering', async () => {
    history.replaceState(null, '', '/?cols=weight&open=cushy');
    const at = stubWidth(760);
    const { container } = render(Page, { props: { data } });
    const open = () => [...container.querySelectorAll('tr[aria-expanded="true"]')]
      .map((r) => r.getAttribute('aria-controls'));
    expect(desktop()).not.toBeNull();
    expect(open()).toEqual(['detail-cushy']);

    await at(690);
    // Same open row, other rendering: the set is the Page's and both tables hold the same object.
    expect(mobile()).not.toBeNull();
    expect(open()).toEqual(['detail-cushy']);
    expect(location.search).toContain('open=cushy');
  });
});

/**
 * The desktop half of it. jsdom's `matchMedia` stub never matches, so the phone half is measured
 * at real widths by the rig and asserted in `cross-browser.spec.ts` — `lib/ordering.test.ts` holds
 * the decision itself for both renderings.
 * docs/app.md §The ordering is stated when no header can carry it
 */
describe('Page states an ordering no header can carry', () => {
  it('says nothing on the default sort', () => {
    render(Page, { props: { data } });
    expect(screen.queryByTestId('ordering-note')).toBeNull();
  });
  it('says nothing when the sorted column has a header', () => {
    history.replaceState(null, '', '/?sort=-msrpGbp');
    render(Page, { props: { data } });
    expect(screen.queryByTestId('ordering-note')).toBeNull();
  });
  it('states a brand-sorted link, which has a header on neither rendering', () => {
    history.replaceState(null, '', '/?sort=-brand');
    render(Page, { props: { data } });
    expect(screen.getByTestId('ordering-note')).toHaveTextContent('Sorted by brand, Z to A');
  });
  // Derived display, never state: the link a recipient forwards must be the link they were sent.
  it('serialises nothing for it', () => {
    history.replaceState(null, '', '/?sort=-brand');
    render(Page, { props: { data } });
    settle();
    // A visit that only READS a query string writes nothing, so the assertion is that the address
    // bar is unchanged — the line added nothing to it.
    expect(location.search).toBe('?sort=-brand');
  });
});

/**
 * The announcement policy, at the seam where the controls meet it. `lib/announce.test.ts` owns
 * which control says what; this owns that there is exactly ONE region, that it is in the DOM
 * before it has anything to say, and that the two actions which change no view state reach it.
 * docs/app.md §What a control says it did
 */
describe('Page announces what a control did', () => {
  const region = () => screen.getByTestId('announcer');

  it('renders one status region, empty, before anything has happened', () => {
    render(Page, { props: { data } });
    expect(region()).toHaveTextContent('');
    // A live region created together with its text is not reliably announced, so it may never be
    // conditional — and a second one would let two actions be spoken in either order.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
  it('says what Export CSV did, where the button beside it used to be the only one heard', async () => {
    restoreUrls = stubObjectUrls({ createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(region()).toHaveTextContent('CSV exported');
  });
  it('routes the Copy link confirmation through the same region', async () => {
    const clip = stubClipboard();
    restoreClipboard = clip.restore;
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await tick();
    expect(region()).toHaveTextContent('Copied');
    // The visible confirmation stays where it is; it is simply no longer a region of its own.
    expect(screen.getByText('Copied', { selector: '.copied' })).toBeInTheDocument();
  });
  it('says what a header press did', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('columnheader', { name: /Weight/ }).querySelector('button')!);
    expect(region()).toHaveTextContent('Sorted by Weight, highest first');
  });
  it('says what the zone did, which the receipt cannot', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Forefoot' }));
    expect(region()).toHaveTextContent('Measured at the forefoot');
  });
  // The two exemptions a wiring test can see: both controls carry the state on themselves.
  it('leaves a column tick and an expanded row to their own semantics', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getAllByRole('row')[1]!);
    expect(region()).toHaveTextContent('');
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Price' }));
    expect(region()).toHaveTextContent('');
  });
});

/**
 * A history entry records which rows are open and nothing else. Back is a navigation gesture rather
 * than an undo, so a filter never spends an entry and `popstate` takes only the open set from the
 * one it lands on.
 * docs/app.md §View and URL ownership
 */
describe('history is row-based', () => {
  /** The row strip is the click target in both renderings; jsdom always mounts the desktop one. */
  const rowFor = (name: string) => screen.getByText(name).closest('tr')!;

  it('opens a row with a history entry rather than a replacement', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    expect(push).toHaveBeenCalledOnce();
    expect(location.search).toContain('open=cushy');
  });

  it('closing a row is its own entry, never a history.back()', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    await fireEvent.click(rowFor('cushy'));
    expect(push).toHaveBeenCalledTimes(2);
    expect(location.search).not.toContain('open=');
  });

  // The bound that keeps the debounce safe: a dragged handle fires about sixty view updates a
  // second, and none of them may reach the history stack.
  it('a filter change never pushes', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    settle();
    expect(push).not.toHaveBeenCalled();
    expect(location.search).not.toBe('');
  });

  // Without the flush, the pending replace lands on the NEW entry 200ms later and closes in the URL
  // a row that is open on screen.
  it('flushes the pending view write before pushing', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    await fireEvent.click(rowFor('cushy'));
    settle();
    expect(location.search).toContain('open=cushy');
    expect(location.search).toContain('sort=');
  });

  it('Back closes the row and keeps a filter changed while it was open', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    settle();
    expect(location.search).toContain('open=cushy');
    // jsdom's own history traversal is asynchronous and this suite runs on a fake clock, so the
    // entry Back lands on is put in place directly and the event a browser would fire is dispatched.
    history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();
    expect(location.search).not.toContain('open=');
    expect(location.search).toContain('sort=');
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });

  // Cancelled, not flushed. A flush would land the pre-Back address on the entry Back arrived at
  // before the reconciling write overwrote it — invisible in the final URL, so the call count is
  // what distinguishes the two.
  it('Back cancels the pending write rather than landing it', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(rowFor('cushy'));
    await fireEvent.click(screen.getByRole('button', { name: /^Race/ }));
    const replace = vi.spyOn(history, 'replaceState');
    history.replaceState(null, '', '/');
    replace.mockClear();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();
    settle();
    expect(replace).toHaveBeenCalledOnce();
  });

  it('a link carrying open rows arrives with them open', () => {
    history.replaceState(null, '', '/?open=cushy');
    render(Page, { props: { data } });
    expect(screen.getByText(/Full review on RunRepeat/)).toBeInTheDocument();
  });

  it('a link naming a shoe that has left the fleet opens nothing', () => {
    history.replaceState(null, '', '/?open=gone-shoe');
    render(Page, { props: { data } });
    expect(screen.queryByText(/Full review on RunRepeat/)).not.toBeInTheDocument();
  });

  // The whole reason the open set sits outside `ViewState`.
  it('an open row does not unmark the story', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    settle();
    expect(screen.getByRole('radio', { name: /Easy/, checked: true })).toBeInTheDocument();
    // `cushy` rather than `racer`: Easy gates carbon out, so the carbon shoe is not on screen.
    await fireEvent.click(rowFor('cushy'));
    expect(screen.getByRole('radio', { name: /Easy/, checked: true })).toBeInTheDocument();
  });
});

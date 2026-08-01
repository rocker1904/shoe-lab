import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page, { VIEW_WRITE_MS } from './Page.svelte';
import { TABLE_ANCHOR_ID } from './lib/anchor';
import { indexTests } from './lib/dataset';
import { VIEW_STORAGE_KEY } from './lib/persist';
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
    expect(screen.getAllByRole('button', { name: /^Toggle theme/ })).toHaveLength(1);
    // One live region, or the confirmation is announced twice or by the hidden copy.
    expect(screen.getAllByRole('status')).toHaveLength(1);
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

describe('Page persistence', () => {
  it('lets a shared link beat a previous session', () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'plate=carbon,plated-other'); // would show 2 shoes
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 1 of the 1 shoes');
    expect(location.search).toContain('plate=carbon');
  });
  it('restores a stored view on a bare URL and writes it back to the URL', () => {
    // without the write-back a returning visitor sees a filtered table behind a bare URL, and
    // copying the link shares the default view instead of what is on screen
    localStorage.setItem(VIEW_STORAGE_KEY, 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 1 of the 1 shoes');
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
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 5 of the 5 shoes');
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
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    expect(screen.getByTestId('receipt')).toHaveTextContent('Showing 4 of the 4 shoes');
  });
});

/**
 * The desktop half of 0014. jsdom's `matchMedia` stub never matches, so the phone half is measured
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
    // bar is unchanged and storage was never touched — the line added neither.
    expect(location.search).toBe('?sort=-brand');
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
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

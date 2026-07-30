import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import DetailPanel from './DetailPanel.svelte';
import { columnLabel } from '../lib/labels';
import { EASY, RACE, SCORE_DEFS } from '../lib/score-defs';
import { FLEET, TESTS, shoe } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';

const DATA: ShoesFile = { builtAt: 't', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
/** The panel now reads the view as well as the shoe, so the cases about the shoe's own copy share
 *  one baseline rather than repeating it. */
const VIEW = { data: DATA, columns: [EASY.keys.heel], stability: false };

describe('DetailPanel', () => {
  it('renders full details', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: shoe({
      slug: 'full', name: 'Full Shoe',
      details: { pros: ['Bouncy'], cons: ['Pricey'], intro: 'Great shoe.',
        whoShouldBuy: '<p>Everyone <strong>fast</strong></p>', whoShouldNotBuy: null, features: ['Rocker'] },
    }) } });
    expect(screen.getByText('Bouncy')).toBeInTheDocument();
    expect(screen.getByText('Pricey')).toBeInTheDocument();
    expect(screen.getByText('Great shoe.')).toBeInTheDocument();
    expect(screen.getByText('fast')).toBeInTheDocument();     // {@html} rendered
    expect(screen.getByText('Rocker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Full review/ })).toHaveAttribute('href', 'https://runrepeat.com/full');
  });
  it('shows not-yet-crawled message when details are null', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: shoe({ slug: 'bare', details: null }) } });
    expect(screen.getByText(/not yet crawled/i)).toBeInTheDocument();
  });
  it('escapes every field except the two sanitised buy blocks', () => {
    const { container } = render(DetailPanel, { props: { ...VIEW, shoe: shoe({
      slug: 'raw', name: '<img src=x>Raw',
      details: { pros: ['<b>pro</b>'], cons: ['<b>con</b>'], intro: '<script>alert(1)</script>',
        whoShouldBuy: null, whoShouldNotBuy: '<p>Nobody</p>', features: ['<i>feat</i>'] },
    }) } });
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('i')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<b>pro</b>')).toBeInTheDocument();
    expect(screen.getByText('<i>feat</i>')).toBeInTheDocument();
    expect(screen.getByText('Nobody')).toBeInTheDocument(); // sanitised block still renders as HTML
  });
});

const withDetails = (over: Record<string, unknown>) => shoe({
  slug: 'ghost-17', name: 'Ghost 17',
  details: { pros: [], cons: [], intro: '', whoShouldBuy: null, whoShouldNotBuy: null, features: [] },
  ...over,
});

// shoe-lab has no per-shoe page, so a sibling model can only link back to RunRepeat
// (docs/app.md §Model lineage).
describe('DetailPanel model lineage', () => {
  it('links both directions when the fleet knows them', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: withDetails({
      previousVersion: { slug: 'ghost-16', name: 'Brooks Ghost 16' },
      nextVersion: { slug: 'ghost-18', name: 'Brooks Ghost 18' },
    }) } });
    expect(screen.getByRole('link', { name: 'Brooks Ghost 16' })).toHaveAttribute('href', 'https://runrepeat.com/uk/ghost-16');
    expect(screen.getByRole('link', { name: 'Brooks Ghost 18' })).toHaveAttribute('href', 'https://runrepeat.com/uk/ghost-18');
    expect(screen.getByText(/Replaced/)).toBeInTheDocument();
    expect(screen.getByText(/Superseded by/)).toBeInTheDocument();
  });
  it('does not repeat the successor as the newest in line', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: withDetails({
      nextVersion: { slug: 'ghost-18', name: 'Brooks Ghost 18' },
      latestVersion: { slug: 'ghost-18', name: 'Brooks Ghost 18' },
    }) } });
    expect(screen.getAllByRole('link', { name: 'Brooks Ghost 18' })).toHaveLength(1);
    expect(screen.queryByText(/Newest in line/)).not.toBeInTheDocument();
  });
  it('shows the newest in line when it skips a generation', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: withDetails({
      nextVersion: { slug: 'cumulus-26', name: 'Cumulus 26' },
      latestVersion: { slug: 'cumulus-28', name: 'Cumulus 28' },
    }) } });
    expect(screen.getByText(/Newest in line/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cumulus 28' })).toBeInTheDocument();
  });
  it('renders no lineage list when there are no siblings', () => {
    const { container } = render(DetailPanel, { props: { ...VIEW, shoe: withDetails({}) } });
    expect(container.querySelector('.lineage')).toBeNull();
  });
});

describe('DetailPanel facts and review language', () => {
  it('lists each kept fact with its labels', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: withDetails({
      facts: { pace: [{ slug: 'tempo', text: 'Tempo' }, { slug: 'daily-running', text: 'Daily running' }] },
    }) } });
    expect(screen.getByText('pace')).toBeInTheDocument();
    expect(screen.getByText('Tempo')).toBeInTheDocument();
    expect(screen.getByText('Daily running')).toBeInTheDocument();
  });
  it('names the language when the review is not in English', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: withDetails({ reviewLanguage: 'es' }) } });
    expect(screen.getByText(/published this review in Spanish/)).toBeInTheDocument();
  });
  it('says nothing about language for an ordinary review', () => {
    render(DetailPanel, { props: { ...VIEW, shoe: withDetails({}) } });
    expect(screen.queryByText(/published this review in/)).not.toBeInTheDocument();
  });
});

/**
 * The reason the feature ships before the weights settle: a surprising rank has to be diagnosable
 * from the row itself rather than argued about (docs/app.md §The story scores).
 */
describe('DetailPanel Easy score breakdown', () => {
  const panel = (over: { slug?: string; columns?: string[]; stability?: boolean } = {}) => render(DetailPanel, {
    props: { shoe: FLEET.find((s) => s.slug === (over.slug ?? 'cushy'))!, data: DATA,
             columns: over.columns ?? [EASY.keys.heel], stability: over.stability ?? false },
  });

  it('breaks the Easy score into its terms, so a rank can be diagnosed', () => {
    const { container } = panel();
    expect(screen.getByText('Easy heel score')).toBeInTheDocument();
    const rows = [...container.querySelectorAll('.score-breakdown tbody tr')];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('Shock absorption');
  });

  // The panel reads the columns rather than a zone of its own, so it can never explain a zone the
  // table is not showing (docs/app.md §The story scores).
  it('breaks down every score column on screen, each named for its own zone', () => {
    const { container } = panel({ columns: [EASY.keys.heel, EASY.keys.forefoot] });
    expect([...container.querySelectorAll('.score-breakdown h4')].map((h) => h.textContent))
      .toEqual(['Easy heel score', 'Easy forefoot score']);
    // Each reads its own half: cushy's forefoot shock absorption is 115 against 140 at the heel.
    expect([...container.querySelectorAll('.score-breakdown tbody td.raw')].map((c) => c.textContent))
      .toEqual(['140', '4 = 3.2 / 0.8', '70', '115', '4 = 3.2 / 0.8', '55']);
  });

  it('shows no breakdown at all when the table shows no score', () => {
    const { container } = panel({ columns: ['score', 'weight'] });
    expect(container.querySelector('.score-breakdown')).toBeNull();
  });

  it('shows the raw reading beside the mapped term, so a capped term is still diagnosable', () => {
    // Two terms cap, so a mapped 1.0 cannot say what put the shoe there; a derived reading shows
    // its division for the same reason (docs/app.md §The story scores). cushy reads 140 shock
    // absorption, an outsole life of 3.2 / 0.8 — capped — 70% energy return, a 95/40 heel lever
    // and a heel counter of 4.
    const { container } = panel({ stability: true });
    expect([...container.querySelectorAll('.score-breakdown thead th')].map((h) => h.textContent))
      .toEqual(['Term', 'Reading', 'Mapped', 'Contribution', 'Share']);
    expect([...container.querySelectorAll('.score-breakdown tbody td.raw')].map((c) => c.textContent))
      .toEqual(['140', '4 = 3.2 / 0.8', '70', '2.38 = 95 / 40', '4']);
  });

  it('adds the two stability terms once the runner has opted in', () => {
    const { container } = panel({ stability: true });
    expect(container.querySelectorAll('.score-breakdown tbody tr')).toHaveLength(5);
  });

  it('says so plainly when a shoe cannot be scored', () => {
    panel({ slug: 'mystery' });
    expect(screen.getByText(/not scored/i)).toBeInTheDocument();
  });
});

describe('DetailPanel with every story on screen', () => {
  const allScoreColumns = SCORE_DEFS.flatMap((d) => [d.keys.heel, d.keys.forefoot]);
  const panel = (stability: boolean) => render(DetailPanel, {
    props: { shoe: FLEET.find((s) => s.slug === 'cushy')!, data: DATA,
             columns: allScoreColumns, stability },
  });

  it('renders one breakdown per score column, keyed by the column rather than the zone', () => {
    // Keying by zone would be a duplicate key with three stories on screen, and Svelte throws.
    const { container } = panel(false);
    expect([...container.querySelectorAll('.score-breakdown h4')].map((h) => h.textContent))
      .toEqual(allScoreColumns.map((k) => columnLabel(k, undefined)));
  });

  it('gives Race three rows and never a stability row, even when the preference is on', () => {
    const { container } = panel(true);
    const race = [...container.querySelectorAll('.score-breakdown')]
      .find((s) => s.querySelector('h4')!.textContent === columnLabel(RACE.keys.heel, undefined))!;
    const rows = [...race.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.textContent);
    expect(rows).toEqual(['Shock absorption', 'Energy return', 'Weight']);
  });

  it('lists the terms two stories share in the same order in both tables', () => {
    // One shared TERM_ORDER, so a runner comparing two breakdowns is not re-reading the same terms
    // in a different sequence.
    const { container } = panel(false);
    const order = (key: string) => {
      const s = [...container.querySelectorAll('.score-breakdown')]
        .find((x) => x.querySelector('h4')!.textContent === columnLabel(key, undefined))!;
      return [...s.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')!.textContent);
    };
    const easy = order(EASY.keys.heel).filter((t) => t !== 'Outsole durability');
    expect(order(RACE.keys.heel).filter((t) => t !== 'Weight')).toEqual(easy);
  });
});

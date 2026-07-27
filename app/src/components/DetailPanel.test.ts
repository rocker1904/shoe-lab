import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import DetailPanel from './DetailPanel.svelte';
import { shoe } from '../lib/test-fixtures';

describe('DetailPanel', () => {
  it('renders full details', () => {
    render(DetailPanel, { props: { shoe: shoe({
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
    render(DetailPanel, { props: { shoe: shoe({ slug: 'bare', details: null }) } });
    expect(screen.getByText(/not yet crawled/i)).toBeInTheDocument();
  });
  it('escapes every field except the two sanitised buy blocks', () => {
    const { container } = render(DetailPanel, { props: { shoe: shoe({
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
    render(DetailPanel, { props: { shoe: withDetails({
      previousVersion: { slug: 'ghost-16', name: 'Brooks Ghost 16' },
      nextVersion: { slug: 'ghost-18', name: 'Brooks Ghost 18' },
    }) } });
    expect(screen.getByRole('link', { name: 'Brooks Ghost 16' })).toHaveAttribute('href', 'https://runrepeat.com/uk/ghost-16');
    expect(screen.getByRole('link', { name: 'Brooks Ghost 18' })).toHaveAttribute('href', 'https://runrepeat.com/uk/ghost-18');
    expect(screen.getByText(/Replaced/)).toBeInTheDocument();
    expect(screen.getByText(/Superseded by/)).toBeInTheDocument();
  });
  it('does not repeat the successor as the newest in line', () => {
    render(DetailPanel, { props: { shoe: withDetails({
      nextVersion: { slug: 'ghost-18', name: 'Brooks Ghost 18' },
      latestVersion: { slug: 'ghost-18', name: 'Brooks Ghost 18' },
    }) } });
    expect(screen.getAllByRole('link', { name: 'Brooks Ghost 18' })).toHaveLength(1);
    expect(screen.queryByText(/Newest in line/)).not.toBeInTheDocument();
  });
  it('shows the newest in line when it skips a generation', () => {
    render(DetailPanel, { props: { shoe: withDetails({
      nextVersion: { slug: 'cumulus-26', name: 'Cumulus 26' },
      latestVersion: { slug: 'cumulus-28', name: 'Cumulus 28' },
    }) } });
    expect(screen.getByText(/Newest in line/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cumulus 28' })).toBeInTheDocument();
  });
  it('renders no lineage list when there are no siblings', () => {
    const { container } = render(DetailPanel, { props: { shoe: withDetails({}) } });
    expect(container.querySelector('.lineage')).toBeNull();
  });
});

describe('DetailPanel facts and review language', () => {
  it('lists each kept fact with its labels', () => {
    render(DetailPanel, { props: { shoe: withDetails({
      facts: { pace: [{ slug: 'tempo', text: 'Tempo' }, { slug: 'daily-running', text: 'Daily running' }] },
    }) } });
    expect(screen.getByText('pace')).toBeInTheDocument();
    expect(screen.getByText('Tempo')).toBeInTheDocument();
    expect(screen.getByText('Daily running')).toBeInTheDocument();
  });
  it('names the language when the review is not in English', () => {
    render(DetailPanel, { props: { shoe: withDetails({ reviewLanguage: 'es' }) } });
    expect(screen.getByText(/published this review in Spanish/)).toBeInTheDocument();
  });
  it('says nothing about language for an ordinary review', () => {
    render(DetailPanel, { props: { shoe: withDetails({}) } });
    expect(screen.queryByText(/published this review in/)).not.toBeInTheDocument();
  });
});

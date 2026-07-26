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

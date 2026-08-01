import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Header from './Header.svelte';

const props = { total: 450, builtAt: '2026-07-27T00:00:00Z' };

describe('Header', () => {
  it('states the size of the catalogue, not the size of the view', () => {
    render(Header, { props });
    // A regex, not the string: the count and the date share one line and therefore one element, and
    // Testing Library's default string matcher is exact against the whole of that element's text.
    expect(screen.getByText(/^450 shoes ·/)).toBeInTheDocument();
    // The receipt owns everything that responds to filtering; two counts a centimetre apart with
    // different denominators read as the app contradicting itself.
    expect(screen.queryByText(/of 450 shoes/)).toBeNull();
  });

  it('renders the build date for a human, not as an ISO stamp', () => {
    render(Header, { props });
    expect(screen.getByText(/27 Jul 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-07-27/)).toBeNull();
  });

  // The count and the credit are both facts about where the data came from, so they stack into one
  // block opposite the wordmark rather than the credit sitting inline among buttons, where it read as
  // a caption for whichever button followed it.
  it('stacks the catalogue fact and the credit into one provenance block', () => {
    const { container } = render(Header, { props });
    const prov = container.querySelector('.prov');
    expect(prov).not.toBeNull();
    expect(prov!.querySelector('.count')).not.toBeNull();
    expect(prov!.querySelector('.credit')).not.toBeNull();
  });

  // Structural, not decorative (docs/decisions.md §Be a good citizen toward RunRepeat).
  it('keeps the attribution a visible, immediately-clickable link', () => {
    render(Header, { props });
    const link = screen.getByRole('link', { name: /RunRepeat/ });
    expect(link).toHaveAttribute('href', 'https://runrepeat.com/catalog/running-shoes');
    expect(link).toBeVisible();
  });
});

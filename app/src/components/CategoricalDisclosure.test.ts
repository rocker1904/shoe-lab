import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import CategoricalDisclosure from './CategoricalDisclosure.svelte';

const children = createRawSnippet(() => ({
  render: () => '<p>Disclosure body</p>',
}));

describe('CategoricalDisclosure', () => {
  it('renders and toggles one named native disclosure around its body', async () => {
    const { container } = render(CategoricalDisclosure, {
      props: { label: 'Materials', summary: 'Any material', children },
    });
    const details = screen.getByRole('group', { name: 'Materials' }) as HTMLDetailsElement;
    const summary = details.querySelector(':scope > summary');
    expect(summary).toHaveTextContent('Any material');
    expect(summary).toBe(container.querySelector('summary'));
    expect(summary?.querySelector('svg')).toHaveAttribute('width', '10');
    expect(summary?.querySelector('svg')).toHaveAttribute('height', '10');
    expect(screen.getByText('Disclosure body')).toBeInTheDocument();
    expect(details.open).toBe(false);
    await fireEvent.click(summary!);
    expect(details.open).toBe(true);
  });
});

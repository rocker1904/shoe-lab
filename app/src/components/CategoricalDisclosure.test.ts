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
    const chevron = summary?.querySelector('svg');
    expect(chevron).toHaveAttribute('width', '10');
    expect(chevron).toHaveAttribute('height', '10');
    expect(chevron).toHaveAttribute('viewBox', '0 0 10 10');
    const mark = chevron?.querySelector('path');
    expect(mark).toHaveAttribute('d', 'M2 4l3 3 3-3');
    expect(mark).toHaveAttribute('stroke', 'currentColor');
    expect(mark).toHaveAttribute('stroke-width', '1.4');
    expect(mark).toHaveAttribute('stroke-linecap', 'round');
    expect(mark).toHaveAttribute('stroke-linejoin', 'round');
    expect(screen.getByText('Disclosure body')).toBeInTheDocument();
    expect(details.open).toBe(false);
    await fireEvent.click(summary!);
    expect(details.open).toBe(true);
  });
});

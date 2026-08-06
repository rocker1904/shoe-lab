import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { metricHelpOf, metricInterpretation } from '../lib/metric-help';
import MetricGuide, {
  type MetricGuideSection,
} from './MetricGuide.svelte';

const SECTIONS: MetricGuideSection[] = [
  { group: null, entries: [{ key: 'score', label: 'RunRepeat Score' }] },
  {
    group: 'Cushioning',
    entries: [
      { key: 'heel-stack', label: 'Heel stack' },
      { key: 'energy-return-heel', label: 'Energy return' },
    ],
  },
  { group: 'Weight', entries: [{ key: 'weight', label: 'Weight' }] },
];

const disclosures = () => screen.queryAllByRole('button', { expanded: false });

describe('MetricGuide', () => {
  it('exposes only read-only guide props', () => {
    expectTypeOf<ComponentProps<typeof MetricGuide>>().toEqualTypeOf<{
      sections: MetricGuideSection[];
      onback: () => void;
    }>();
  });

  it('preserves section and entry order while browsing', () => {
    render(MetricGuide, { props: { sections: SECTIONS, onback: vi.fn() } });

    expect(disclosures().map((button) => button.textContent?.trim())).toEqual([
      'RunRepeat Score',
      'Heel stack',
      'Energy return',
      'Weight',
    ]);
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'Metric guide',
      'Cushioning',
      'Weight',
    ]);
  });

  it('searches visible labels case-insensitively and flattens matches without reordering', async () => {
    const sections: MetricGuideSection[] = [
      {
        group: 'First',
        entries: [
          { key: 'score', label: 'RunRepeat Score' },
          { key: 'heel-stack', label: 'Stack score (2025 · retired)' },
        ],
      },
      { group: 'Second', entries: [{ key: 'weight', label: 'Weight' }] },
    ];
    render(MetricGuide, { props: { sections, onback: vi.fn() } });

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search metrics' }), {
      target: { value: 'sCoRe' },
    });

    expect(disclosures().map((button) => button.textContent?.trim())).toEqual([
      'RunRepeat Score',
      'Stack score (2025 · retired)',
    ]);
    expect(screen.queryByRole('heading', { name: 'First' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Second' })).not.toBeInTheDocument();

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search metrics' }), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  it('states an explicit empty result without removing search or Back', async () => {
    render(MetricGuide, { props: { sections: SECTIONS, onback: vi.fn() } });

    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search metrics' }), {
      target: { value: 'no such metric' },
    });

    expect(screen.getByText('No metrics match “no such metric”.')).toBeInTheDocument();
    expect(disclosures()).toHaveLength(0);
    expect(screen.getByRole('searchbox', { name: 'Search metrics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('focuses its non-sequential heading on mount, between Back and search in DOM order', async () => {
    render(MetricGuide, { props: { sections: SECTIONS, onback: vi.fn() } });
    const heading = screen.getByRole('heading', { name: 'Metric guide' });
    const back = screen.getByRole('button', { name: 'Back' });
    const search = screen.getByRole('searchbox', { name: 'Search metrics' });

    await waitFor(() => expect(heading).toHaveFocus());
    expect(search).not.toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(back.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens at most one owned fact, direction sentence and optional source', async () => {
    render(MetricGuide, {
      props: {
        sections: [{
          group: null,
          entries: [
            { key: 'heel-stack', label: 'Heel stack' },
            { key: 'score', label: 'RunRepeat Score' },
          ],
        }],
        onback: vi.fn(),
      },
    });
    const stack = screen.getByRole('button', { name: 'Heel stack' });
    const score = screen.getByRole('button', { name: 'RunRepeat Score' });

    expect(stack).toHaveAttribute('aria-expanded', 'false');
    expect(score).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(stack);
    expect(stack).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(metricHelpOf('heel-stack')!.text)).toBeInTheDocument();
    expect(screen.getByText(metricInterpretation('heel-stack'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /RunRepeat method/ })).toBeInTheDocument();

    await fireEvent.click(score);
    expect(stack).toHaveAttribute('aria-expanded', 'false');
    expect(score).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(metricHelpOf('heel-stack')!.text)).not.toBeInTheDocument();
    expect(screen.getByText(metricHelpOf('score')!.text)).toBeInTheDocument();
    expect(screen.getByText(metricInterpretation('score'))).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    await fireEvent.click(score);
    expect(score).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(metricHelpOf('score')!.text)).not.toBeInTheDocument();
  });

  it('does not reopen an explanation that search removed', async () => {
    render(MetricGuide, { props: { sections: SECTIONS, onback: vi.fn() } });
    const stack = screen.getByRole('button', { name: 'Heel stack' });
    const search = screen.getByRole('searchbox', { name: 'Search metrics' });

    await fireEvent.click(stack);
    expect(stack).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.input(search, { target: { value: 'weight' } });
    expect(screen.queryByText(metricHelpOf('heel-stack')!.text)).not.toBeInTheDocument();
    await fireEvent.input(search, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Heel stack' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('has no selection control or selection side effect', async () => {
    const onback = vi.fn();
    const { container } = render(MetricGuide, {
      props: { sections: SECTIONS, onback },
    });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Heel stack' }));
    expect(onback).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onback).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('input')).toHaveLength(1);
  });

  it('omits an unexpected unknown fact instead of inventing copy', () => {
    render(MetricGuide, {
      props: {
        sections: [{ group: 'Future', entries: [{ key: 'future-test', label: 'Future test' }] }],
        onback: vi.fn(),
      },
    });

    expect(screen.queryByRole('button', { name: 'Future test' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Future' })).not.toBeInTheDocument();
  });
});

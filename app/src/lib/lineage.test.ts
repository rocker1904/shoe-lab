import { describe, expect, it } from 'vitest';
import { generationLabel, metricEntries } from './lineage';
import { labTest } from './test-fixtures';

describe('generationLabel', () => {
  it('reads a method year off the slug suffix', () => {
    expect(generationLabel('midsole-softness-22', 'current')).toBe('2022 method');
    expect(generationLabel('breathability-25', 'current')).toBe('2025 method');
  });
  it('falls back to a relative label when no year can be derived', () => {
    // three real pairs carry no year on either side and share both name and units
    expect(generationLabel('toebox-width-widest-part', 'current')).toBe('current method');
    expect(generationLabel('toebox-width-at-the-widest-part', 'previous')).toBe('previous method');
  });
  it('does not read a trailing number that is not a plausible method year', () => {
    expect(generationLabel('shoe-test-5', 'current')).toBe('current method');
    expect(generationLabel('some-test-99', 'current')).toBe('current method');
  });
});

describe('metricEntries', () => {
  it('pairs a superseded test with its replacement, current first', () => {
    const e = metricEntries([
      labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', units: 'HA', updateId: 70 }),
      labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', units: 'AC', previousId: 11 }),
    ])[0]!;
    expect(e).toMatchObject({
      kind: 'pair', label: 'Midsole softness',
      current: { key: 'midsole-softness-22', units: 'AC', generation: '2022 method' },
      retired: { key: 'midsole-softness', units: 'HA', generation: 'original' },
    });
  });
  it('distinguishes a pair whose slugs carry no year and whose units match', () => {
    const e = metricEntries([
      labTest({ id: 27, slug: 'toebox-width-at-the-widest-part', name: 'Width / Fit', units: 'mm', updateId: 55 }),
      labTest({ id: 55, slug: 'toebox-width-widest-part', name: 'Width / Fit', units: 'mm', previousId: 27 }),
    ])[0]! as Extract<ReturnType<typeof metricEntries>[number], { kind: 'pair' }>;
    expect(e.current.generation).not.toBe(e.retired.generation);
  });
  it('dates the retired side too when its own slug carries a year', () => {
    const e = metricEntries([
      labTest({ id: 1, slug: 'grip-22', name: 'Grip', updateId: 2 }),
      labTest({ id: 2, slug: 'grip-25', name: 'Grip', previousId: 1 }),
    ])[0]! as Extract<ReturnType<typeof metricEntries>[number], { kind: 'pair' }>;
    expect(e.retired.generation).toBe('2022 method');
    expect(e.current.generation).toBe('2025 method');
  });
  it('produces one entry per pair, not two', () => {
    expect(metricEntries([
      labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 70 }),
      labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', previousId: 11 }),
    ])).toHaveLength(1);
  });
  it('colocates a primary with its secondaries and takes the primary group', () => {
    const e = metricEntries([
      labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', groupId: '3', chartLabel: 'Energy return', secondaryTestIds: [66] }),
      labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', groupId: null, primaryTestId: 65 }),
    ])[0]!;
    expect(e).toMatchObject({ kind: 'colocated', label: 'Energy return', groupId: '3' });
    expect((e as Extract<typeof e, { kind: 'colocated' }>).parts.map((p) => p.key))
      .toEqual(['energy-return-heel', 'energy-return-forefoot']);
  });
  it('ignores a secondary that is not in the published catalogue', () => {
    // real case: forefoot-traction names #61, which was dropped for having no readings
    const e = metricEntries([labTest({ id: 60, slug: 'forefoot-traction', name: 'Forefoot traction', secondaryTestIds: [61] })])[0]!;
    expect(e.kind).toBe('single');
  });
  it('keeps the present secondaries when only some are missing', () => {
    const e = metricEntries([
      labTest({ id: 65, slug: 'er-heel', name: 'ER heel', chartLabel: 'ER', secondaryTestIds: [66, 999] }),
      labTest({ id: 66, slug: 'er-fore', name: 'ER fore', primaryTestId: 65 }),
    ])[0]!;
    expect((e as Extract<typeof e, { kind: 'colocated' }>).parts).toHaveLength(2);
  });
  it('degrades a dangling updateId to a single rather than throwing', () => {
    expect(metricEntries([labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 999 })])[0]!.kind)
      .toBe('single');
  });
  it('ignores non-numeric tests entirely', () => {
    expect(metricEntries([labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option' })])).toEqual([]);
  });
  it('resolves a pair reached from the current generation first', () => {
    const e = metricEntries([
      labTest({ id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', previousId: 11 }),
      labTest({ id: 11, slug: 'midsole-softness', name: 'Midsole softness', updateId: 70 }),
    ]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: 'pair', current: { key: 'midsole-softness-22' } });
  });
  it('resolves a colocated entry reached from the secondary first', () => {
    const e = metricEntries([
      labTest({ id: 66, slug: 'er-fore', name: 'ER fore', primaryTestId: 65 }),
      labTest({ id: 65, slug: 'er-heel', name: 'ER heel', chartLabel: 'ER', secondaryTestIds: [66] }),
    ]);
    expect(e).toHaveLength(1);
    expect((e[0] as Extract<(typeof e)[number], { kind: 'colocated' }>).parts.map((p) => p.key))
      .toEqual(['er-heel', 'er-fore']);
  });
  it('never lists a test twice across all entries', () => {
    const keys = metricEntries([
      labTest({ id: 11, slug: 'a', name: 'A', updateId: 70 }), labTest({ id: 70, slug: 'a-22', name: 'A', previousId: 11 }),
      labTest({ id: 65, slug: 'b-heel', name: 'B heel', chartLabel: 'B', secondaryTestIds: [66] }), labTest({ id: 66, slug: 'b-fore', name: 'B fore', primaryTestId: 65 }),
      labTest({ id: 6, slug: 'c', name: 'C' }),
    ]).flatMap((e) => e.kind === 'single' ? [e.key] : e.kind === 'pair' ? [e.current.key, e.retired.key] : e.parts.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(5);
  });
});

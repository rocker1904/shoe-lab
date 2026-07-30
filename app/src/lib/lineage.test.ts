import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NUMERIC_TEST_TYPES } from './dataset';
import {
  CURATED_RANGE_KEYS, generationLabel, metricEntries, ZONE_PAIRS, zoneKey, swapZone, type ResolvedMetric,
} from './lineage';
import { labTest } from './test-fixtures';
import type { LabTest } from '../../../shared/types.js';

const colocatedOf = (e: ResolvedMetric) => e as Extract<ResolvedMetric, { kind: 'colocated' }>;

describe('generationLabel', () => {
  it('reads a method year off the slug suffix', () => {
    expect(generationLabel('midsole-softness-22', 'current')).toBe('2022 method');
    expect(generationLabel('breathability-25', 'current')).toBe('2025 method');
  });
  it('falls back to a relative label when no year can be derived', () => {
    // three real pairs carry no year on either zone and share both name and units
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
  it('dates the retired half too when its own slug carries a year', () => {
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
    // an unlinked-upstream, undeclared pairing: the catalogue path, which orders primary-first
    const e = metricEntries([
      labTest({ id: 60, slug: 'traction-heel', name: 'Traction heel', groupId: '3', chartLabel: 'Traction', secondaryTestIds: [61] }),
      labTest({ id: 61, slug: 'traction-forefoot', name: 'Traction forefoot', groupId: null, primaryTestId: 60 }),
    ])[0]!;
    expect(e).toMatchObject({ kind: 'colocated', label: 'Traction', groupId: '3' });
    expect(colocatedOf(e).parts.map((p) => p.key)).toEqual(['traction-heel', 'traction-forefoot']);
    expect(colocatedOf(e).parts.map((p) => p.zone)).toEqual([null, null]);
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
  it('emits one colocated entry per declared pair, forefoot first, under the declared label', () => {
    const e = metricEntries([
      labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm', groupId: '3' }),
      labTest({ id: 5, slug: 'forefoot-stack', name: 'Forefoot stack', units: 'mm', groupId: '9' }),
    ]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: 'colocated', label: 'Stack', groupId: '3' }); // the heel half's group
    expect(colocatedOf(e[0]!).parts.map((p) => p.key)).toEqual(['forefoot-stack', 'heel-stack']);
    expect(colocatedOf(e[0]!).parts.map((p) => p.zone)).toEqual(['forefoot', 'heel']);
  });
  it('keeps the full test name on each part, so the column picker can still tell them apart', () => {
    const e = metricEntries([
      labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm' }),
      labTest({ id: 5, slug: 'forefoot-stack', name: 'Forefoot stack', units: 'mm' }),
    ])[0]!;
    expect(colocatedOf(e).parts.map((p) => p.label)).toEqual(['Forefoot stack', 'Heel stack']);
  });
  it('does not emit a catalogue-linked declared pair twice', () => {
    const e = metricEntries([
      labTest({ id: 65, slug: 'energy-return-heel', name: 'Energy return heel', type: 'percent', groupId: '3', chartLabel: 'Energy return', secondaryTestIds: [66] }),
      labTest({ id: 66, slug: 'energy-return-forefoot', name: 'Energy return forefoot', type: 'percent', primaryTestId: 65 }),
    ]);
    expect(e).toHaveLength(1);
    // the declaration wins over the catalogue on order and label alike
    expect(colocatedOf(e[0]!).parts.map((p) => p.key)).toEqual(['energy-return-forefoot', 'energy-return-heel']);
    expect(e[0]!.label).toBe('Energy return');
  });
  it('degrades a declared pair with one half absent to a single', () => {
    const e = metricEntries([labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm' })]);
    expect(e).toEqual([{ kind: 'single', key: 'heel-stack', label: 'Heel stack', units: 'mm', groupId: null }]);
  });
  it('emits nothing for a declared pair whose slugs are both absent', () => {
    expect(metricEntries([labTest({ id: 24, slug: 'weight', name: 'Weight' })]).map((e) => e.label)).toEqual(['Weight']);
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

describe('zone pairs', () => {
  it('resolves each declared label to the slug of the runner\'s zone', () => {
    for (const pair of ZONE_PAIRS) {
      expect(zoneKey(pair.label, 'heel')).toBe(pair.heel);
      expect(zoneKey(pair.label, 'forefoot')).toBe(pair.forefoot);
    }
  });
  it('maps either half onto the requested zone and leaves an unpaired slug alone', () => {
    expect(swapZone('heel-stack', 'forefoot')).toBe('forefoot-stack');
    expect(swapZone('forefoot-stack', 'heel')).toBe('heel-stack');
    // not an exchange: a slug already on the requested zone stays put
    expect(swapZone('forefoot-stack', 'forefoot')).toBe('forefoot-stack');
    expect(swapZone('weight', 'forefoot')).toBe('weight');
  });
  // Criterion 8 says all four pairs render both halves. A render test would only ever cover the
  // pairs its own fixture catalogue happens to carry; this covers the declaration itself, which is
  // the property the prose argues for.
  it('curates both halves of every pair, so the sidebar cannot change shape with zone', () => {
    for (const pair of ZONE_PAIRS) {
      expect(CURATED_RANGE_KEYS, pair.label).toContain(pair.forefoot);
      expect(CURATED_RANGE_KEYS, pair.label).toContain(pair.heel);
    }
  });
  it('curates every key a story binds, so a story never seeds a hand-added row', () => {
    for (const key of ['msrpGbp', 'weight']) expect(CURATED_RANGE_KEYS).toContain(key);
  });
  it('lists no key twice', () => {
    expect(new Set(CURATED_RANGE_KEYS).size).toBe(CURATED_RANGE_KEYS.length);
  });
  it('lists each slug in exactly one pair', () => {
    const slugs = ZONE_PAIRS.flatMap((p) => [p.forefoot, p.heel]);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(ZONE_PAIRS.map((p) => p.label)).size).toBe(ZONE_PAIRS.length);
  });
});

/**
 * The declaration is authoritative but must *agree* with the catalogue rather than avoid it.
 * A test rather than a runtime throw: `metricEntries` is called on partial catalogues throughout
 * the suite, so a throwing validator would take down the app and most of its tests. Read from disk because
 * `app/tsconfig.json` covers only `src`, `../shared` and `scripts` and leaves `resolveJsonModule`
 * unset, so importing the JSON will not compile. Resolved from this file rather than from the cwd,
 * which vitest sets to `app/`, and through `fileURLToPath` because the jsdom environment replaces
 * the global `URL` with one `readFileSync` rejects. Failure mode:
 * docs/operations.md §Contract-drift runbook.
 */
describe('declared zone pairs against the published catalogue', () => {
  const tests: LabTest[] = JSON.parse(readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8')).tests;
  const bySlug = new Map(tests.map((t) => [t.slug, t]));

  it('names a numeric test on both zones of every pair', () => {
    for (const pair of ZONE_PAIRS) {
      for (const slug of [pair.forefoot, pair.heel]) {
        const t = bySlug.get(slug);
        expect(t, `${slug} is not in the catalogue`).toBeDefined();
        expect(NUMERIC_TEST_TYPES.has(t!.type), `${slug} is not rangeable`).toBe(true);
      }
    }
  });
  it('agrees with every catalogue link a declared pair carries', () => {
    for (const pair of ZONE_PAIRS) {
      const forefoot = bySlug.get(pair.forefoot)!;
      const heel = bySlug.get(pair.heel)!;
      // where upstream links the pair it must link these two and nothing else
      expect(heel.secondaryTestIds.filter((id) => id !== forefoot.id), `${pair.label} heel`).toEqual([]);
      expect(forefoot.secondaryTestIds, `${pair.label} forefoot`).toEqual([]);
      expect([null, heel.id]).toContain(forefoot.primaryTestId);
      expect(heel.primaryTestId).toBeNull();
    }
  });
  it('resolves every declared pair into one entry with both halves, forefoot first', () => {
    const entries = metricEntries(tests);
    for (const pair of ZONE_PAIRS) {
      const found = entries.filter((e) => e.kind === 'colocated' && e.parts.some((p) => p.key === pair.heel));
      expect(found, `${pair.label} does not resolve to one entry`).toHaveLength(1);
      expect(colocatedOf(found[0]!).parts.map((p) => p.key)).toEqual([pair.forefoot, pair.heel]);
    }
  });
});

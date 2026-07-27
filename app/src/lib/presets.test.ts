import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { applyPreset, PRESETS } from './presets';
import { applyFilters } from './filters';
import { FLEET, TESTS, shoe, labTest } from './test-fixtures';
import { parseView, serializeView } from './urlstate';

const idx = indexTests(TESTS);
const NOW = new Date('2026-07-26');

describe('presets', () => {
  it('declares at least the three built-ins', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(['easy-day-cruiser', 'tempo-plated', 'wide-toebox']));
  });
  it('easy-day-cruiser reproduces the user story on the fixture fleet', () => {
    const view = applyPreset('easy-day-cruiser', FLEET, idx, NOW);
    expect(view.filters.plate).toBe('none');
    expect(view.filters.releasedAfter).toBe('2024-07-26');
    expect(view.filters.ranges['heel-stack']).toEqual({ min: 36 });
    // fleet softness values: 40, 42, 30 -> median 40
    expect(view.filters.ranges['midsole-softness-22']).toEqual({ max: 40 });
    expect(view.sort).toEqual({ key: 'energy-return-heel', dir: 'desc' });
    const { visible } = applyFilters(FLEET, view.filters, idx);
    expect(visible.map((s) => s.slug)).toEqual(['cushy']);
  });
  it('throws on unknown preset id', () => {
    expect(() => applyPreset('nope', FLEET, idx, NOW)).toThrow();
  });
});

describe('preset determinism', () => {
  it('declares unique ids, all of which apply', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(() => applyPreset(p.id, FLEET, idx, NOW)).not.toThrow();
  });
  it('returns an equal but independent view on every call', () => {
    for (const p of PRESETS) {
      const a = applyPreset(p.id, FLEET, idx, NOW);
      const b = applyPreset(p.id, FLEET, idx, NOW);
      expect(a).toEqual(b);
      a.filters.ranges['weight'] = { min: 999 };
      a.columns.push('bogus');
      expect(applyPreset(p.id, FLEET, idx, NOW)).toEqual(b);
    }
  });
  it('survives a URL round trip', () => {
    // the real dataset has toebox-width-widest-part; the shared fixture does not
    const full = indexTests([...TESTS,
      labTest({ id: 900, slug: 'toebox-width-widest-part', name: 'Toebox width', units: 'mm' })]);
    for (const p of PRESETS) {
      const v = applyPreset(p.id, FLEET, full, NOW);
      expect(parseView(serializeView(v), full)).toEqual(v);
    }
  });
  it('derives the cut-off date in UTC, independent of the time of day', () => {
    expect(applyPreset('tempo-plated', FLEET, idx, new Date('2026-07-26T23:59:59Z')).filters.releasedAfter).toBe('2024-07-26');
    expect(applyPreset('tempo-plated', FLEET, idx, new Date('2026-07-26T00:00:00Z')).filters.releasedAfter).toBe('2024-07-26');
    // 29 Feb has no counterpart two years earlier; rolling into March is the safe direction (never too old)
    expect(applyPreset('tempo-plated', FLEET, idx, new Date('2028-02-29T12:00:00Z')).filters.releasedAfter).toBe('2026-03-01');
  });
  it('rounds a fractional softness median to one decimal place', () => {
    const fleet = [40, 42.5, 41, 30].map((v, i) => shoe({ slug: `s${i}`, values: { '70': v } }));
    // sorted 30, 40, 41, 42.5 -> median 40.5
    expect(applyPreset('easy-day-cruiser', fleet, idx, NOW).filters.ranges['midsole-softness-22']).toEqual({ max: 40.5 });
    const odd = [1, 2.24, 2.26].map((v, i) => shoe({ slug: `o${i}`, values: { '70': v } }));
    expect(applyPreset('easy-day-cruiser', odd, idx, NOW).filters.ranges['midsole-softness-22']).toEqual({ max: 2.2 });
  });
  it('omits the softness bound when no shoe has a reading', () => {
    const v = applyPreset('easy-day-cruiser', [shoe({ slug: 'bare' })], idx, NOW);
    expect(v.filters.ranges['midsole-softness-22']).toBeUndefined();
    expect(v.filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('tempo-plated keeps light plated shoes and drops heavy or unplated ones', () => {
    const fleet = [
      shoe({ slug: 'light-carbon', plate: 'carbon', values: { '24': 220 }, releasedAt: '2026-01-01' }),
      shoe({ slug: 'light-other', plate: 'plated-other', values: { '24': 249 }, releasedAt: '2026-01-01' }),
      shoe({ slug: 'heavy-carbon', plate: 'carbon', values: { '24': 280 }, releasedAt: '2026-01-01' }),
      shoe({ slug: 'light-unplated', plate: 'none', values: { '24': 200 }, releasedAt: '2026-01-01' }),
      shoe({ slug: 'old-carbon', plate: 'carbon', values: { '24': 200 }, releasedAt: '2023-01-01' }),
    ];
    const view = applyPreset('tempo-plated', fleet, idx, NOW);
    expect(view.filters).toMatchObject({ plate: 'plated', releasedAfter: '2024-07-26', ranges: { weight: { max: 250 } } });
    expect(view.sort).toEqual({ key: 'energy-return-heel', dir: 'desc' });
    expect(applyFilters(fleet, view.filters, idx).visible.map((s) => s.slug)).toEqual(['light-carbon', 'light-other']);
  });
  it('wide-toebox filters on toebox width and sorts by score', () => {
    const full = indexTests([...TESTS,
      labTest({ id: 900, slug: 'toebox-width-widest-part', name: 'Toebox width', units: 'mm' })]);
    const fleet = [
      shoe({ slug: 'roomy', values: { '900': 101 } }),
      shoe({ slug: 'exact', values: { '900': 98 } }),
      shoe({ slug: 'narrow', values: { '900': 95 } }),
    ];
    const view = applyPreset('wide-toebox', fleet, full, NOW);
    expect(view.filters.ranges).toEqual({ 'toebox-width-widest-part': { min: 98 } });
    expect(view.filters.plate).toBeUndefined();
    expect(view.sort).toEqual({ key: 'score', dir: 'desc' });
    expect(applyFilters(fleet, view.filters, full).visible.map((s) => s.slug)).toEqual(['roomy', 'exact']);
  });
});

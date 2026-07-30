import { describe, expect, it } from 'vitest';
import { projectZone, zoneOf } from './zone';
import { defaultColumns, defaultView, type ViewState } from './urlstate';
import type { Zone } from './lineage';
import { EASY } from './score-defs';

const base = (): ViewState => defaultView();
const withCols = (cols: string[]): ViewState => ({ ...base(), columns: cols });
const ZONES: Zone[] = ['heel', 'forefoot'];

describe('zoneOf', () => {
  it('reads heel from a heel-shaped view', () => {
    expect(zoneOf(base())).toBe('heel');
  });
  it('reads forefoot when every zone-paired key is forefoot', () => {
    expect(zoneOf(withCols(defaultColumns('forefoot')))).toBe('forefoot');
  });
  // `shock-absorption-forefoot` is absent from the test fixture, which is fine here and only
  // here: zone.ts is slug math over ZONE_PAIRS and never consults the catalogue.
  it('is null when the view mixes zones — the case that makes mixing legible', () => {
    expect(zoneOf(withCols(['score', 'heel-stack', 'shock-absorption-forefoot']))).toBeNull();
  });
  it('reads the zone from a bound as well as a column', () => {
    const v = withCols(['score']);
    v.filters.ranges['energy-return-forefoot'] = { min: 60 };
    expect(zoneOf(v)).toBe('forefoot');
  });
  it('reads the zone from the sort key', () => {
    expect(zoneOf({ ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' } })).toBe('heel');
  });
  it('is null when no zone-paired metric is used at all', () => {
    expect(zoneOf(withCols(['score', 'msrpGbp', 'weight']))).toBeNull();
  });
});

describe('projectZone', () => {
  it('turns one zone\'s plain table into the other\'s, exactly', () => {
    expect(projectZone(base(), 'forefoot').columns).toEqual(defaultColumns('forefoot'));
  });
  it('drops a bound on the half being left, and keeps every zoneless filter', () => {
    const v = withCols(['score', 'heel-stack']);
    v.filters.ranges['heel-stack'] = { min: 36 };
    v.filters.ranges['weight'] = { max: 250 };
    v.filters.search = 'nike';
    const next = projectZone(v, 'forefoot');
    expect(next.filters.ranges['heel-stack']).toBeUndefined();
    expect(next.filters.ranges['weight']).toEqual({ max: 250 });
    expect(next.filters.search).toBe('nike');
    expect(next.columns).toEqual(['score', 'forefoot-stack']);
  });
  it('keeps a bound already on the zone being chosen', () => {
    const v = base();
    v.filters.ranges['heel-stack'] = { min: 36 };
    expect(projectZone(v, 'heel').filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('maps both halves onto one column rather than exchanging them', () => {
    expect(projectZone(withCols(['score', 'heel-stack', 'forefoot-stack']), 'forefoot').columns)
      .toEqual(['score', 'forefoot-stack']);
  });
  it('moves the sort key too — a sort names no number, so it follows', () => {
    const v = { ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' as const } };
    expect(projectZone(v, 'forefoot').sort).toEqual({ key: 'forefoot-stack', dir: 'desc' });
  });
  it('gives a zone-free view that zone\'s measurements rather than doing nothing', () => {
    const v = withCols(['score', 'weight']);
    v.filters.ranges['heel-stack'] = { min: 36 };
    const next = projectZone(v, 'forefoot');
    expect(next.filters.ranges['heel-stack']).toBeUndefined();
    expect(next.columns).toEqual(['score', 'weight', 'forefoot-stack', 'energy-return-forefoot']);
  });
  // The invariant the whole design rests on: a click always lands the view on the zone clicked,
  // so the control is never left unlit and the mark can honestly read everything.
  it('always leaves the view committed to the zone chosen', () => {
    // One view per source `zoneOf` reads, or the totality claim rests on columns alone.
    const bound = withCols(['score']);
    bound.filters.ranges['energy-return-forefoot'] = { min: 60 };
    const views = [base(), withCols(defaultColumns('forefoot')),
      withCols(['score', 'heel-stack', 'shock-absorption-forefoot']), withCols(['score', 'weight']),
      bound, { ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' as const } }];
    for (const v of views) for (const s of ZONES) expect(zoneOf(projectZone(v, s))).toBe(s);
  });
});

describe('the Easy score columns are zone-paired like any other', () => {
  it('follows a zone click, so a table cannot mix a heel score with forefoot measurements', () => {
    // zone.ts's own rule: a column carries no number, so it follows rather than being dropped.
    // Before this, clicking Forefoot swapped the stack column and left "Easy heel score" beside it.
    const v = withCols([EASY.keys.heel, 'heel-stack']);
    expect(projectZone(v, 'forefoot').columns).toEqual([EASY.keys.forefoot, 'forefoot-stack']);
    expect(projectZone(v, 'heel').columns).toEqual([EASY.keys.heel, 'heel-stack']);
  });

  it('follows the sort key too', () => {
    const v: ViewState = { ...withCols([EASY.keys.heel]), sort: { key: EASY.keys.heel, dir: 'desc' } };
    expect(projectZone(v, 'forefoot').sort.key).toBe(EASY.keys.forefoot);
  });

  it('names a zone on its own, so a score-only table is not zoneless', () => {
    for (const zone of ZONES) expect(zoneOf(withCols([EASY.keys[zone]]))).toBe(zone);
    expect(zoneOf(withCols([EASY.keys.heel, EASY.keys.forefoot]))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { projectSide, sideOf } from './side';
import { defaultColumns, defaultView, type ViewState } from './urlstate';
import type { Side } from './lineage';

const base = (): ViewState => defaultView();
const withCols = (cols: string[]): ViewState => ({ ...base(), columns: cols });
const SIDES: Side[] = ['heel', 'forefoot'];

describe('sideOf', () => {
  it('reads heel from a heel-shaped view', () => {
    expect(sideOf(base())).toBe('heel');
  });
  it('reads forefoot when every side-paired key is forefoot', () => {
    expect(sideOf(withCols(defaultColumns('forefoot')))).toBe('forefoot');
  });
  // `shock-absorption-forefoot` is absent from the test fixture, which is fine here and only
  // here: side.ts is slug math over SIDE_PAIRS and never consults the catalogue.
  it('is null when the view mixes sides — the case that makes mixing legible', () => {
    expect(sideOf(withCols(['score', 'heel-stack', 'shock-absorption-forefoot']))).toBeNull();
  });
  it('reads the side from a bound as well as a column', () => {
    const v = withCols(['score']);
    v.filters.ranges['energy-return-forefoot'] = { min: 60 };
    expect(sideOf(v)).toBe('forefoot');
  });
  it('reads the side from the sort key', () => {
    expect(sideOf({ ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' } })).toBe('heel');
  });
  it('is null when no side-paired metric is used at all', () => {
    expect(sideOf(withCols(['score', 'msrpGbp', 'weight']))).toBeNull();
  });
});

describe('projectSide', () => {
  it('turns one side\'s plain table into the other\'s, exactly', () => {
    expect(projectSide(base(), 'forefoot').columns).toEqual(defaultColumns('forefoot'));
  });
  it('drops a bound on the half being left, and keeps every sideless filter', () => {
    const v = withCols(['score', 'heel-stack']);
    v.filters.ranges['heel-stack'] = { min: 36 };
    v.filters.ranges['weight'] = { max: 250 };
    v.filters.search = 'nike';
    const next = projectSide(v, 'forefoot');
    expect(next.filters.ranges['heel-stack']).toBeUndefined();
    expect(next.filters.ranges['weight']).toEqual({ max: 250 });
    expect(next.filters.search).toBe('nike');
    expect(next.columns).toEqual(['score', 'forefoot-stack']);
  });
  it('keeps a bound already on the side being chosen', () => {
    const v = base();
    v.filters.ranges['heel-stack'] = { min: 36 };
    expect(projectSide(v, 'heel').filters.ranges['heel-stack']).toEqual({ min: 36 });
  });
  it('maps both halves onto one column rather than exchanging them', () => {
    expect(projectSide(withCols(['score', 'heel-stack', 'forefoot-stack']), 'forefoot').columns)
      .toEqual(['score', 'forefoot-stack']);
  });
  it('moves the sort key too — a sort names no number, so it follows', () => {
    const v = { ...withCols(['score']), sort: { key: 'heel-stack', dir: 'desc' as const } };
    expect(projectSide(v, 'forefoot').sort).toEqual({ key: 'forefoot-stack', dir: 'desc' });
  });
  it('gives a side-free view that side\'s measurements rather than doing nothing', () => {
    const v = withCols(['score', 'weight']);
    v.filters.ranges['heel-stack'] = { min: 36 };
    const next = projectSide(v, 'forefoot');
    expect(next.filters.ranges['heel-stack']).toBeUndefined();
    expect(next.columns).toEqual(['score', 'weight', 'forefoot-stack', 'energy-return-forefoot']);
  });
  // The invariant the whole design rests on: a click always lands the view on the side clicked,
  // so the control is never left unlit and the mark can honestly read everything.
  it('always leaves the view committed to the side chosen', () => {
    const views = [base(), withCols(defaultColumns('forefoot')),
      withCols(['score', 'heel-stack', 'shock-absorption-forefoot']), withCols(['score', 'weight'])];
    for (const v of views) for (const s of SIDES) expect(sideOf(projectSide(v, s))).toBe(s);
  });
});

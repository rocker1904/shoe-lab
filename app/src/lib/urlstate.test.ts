import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { EASY_SCORE_KEYS } from './score';
import { defaultColumns, defaultView, parseView, sameValue, serializeView, type ViewState } from './urlstate';
import type { FilterState } from './filters';
import { TESTS, labTest } from './test-fixtures';

const idx = indexTests(TESTS);

describe('urlstate', () => {
  it('default view serialises to empty string', () => {
    expect(serializeView(defaultView())).toBe('');
  });
  it('round-trips a complex state', () => {
    const v: ViewState = {
      filters: {
        ranges: { 'heel-stack': { min: 36 }, msrpGbp: { max: 200 }, weight: { min: 200, max: 250 } },
        plate: ['none'], releasedAfter: '2024-07-26', brands: ['Nike', 'New Balance'], search: 'peg', discontinued: 'hide',
      },
      sort: { key: 'energy-return-heel', dir: 'desc' },
      columns: ['score', 'heel-stack'],
      generations: {},
      rows: [],
      stability: true,
    };
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
  it('parses open-ended and full ranges', () => {
    expect(parseView('r.heel-stack=36~', idx).filters.ranges['heel-stack']).toEqual({ min: 36 });
    expect(parseView('r.heel-stack=~40', idx).filters.ranges['heel-stack']).toEqual({ max: 40 });
    expect(parseView('r.heel-stack=36~40', idx).filters.ranges['heel-stack']).toEqual({ min: 36, max: 40 });
  });
  it('round-trips a plate selection as a comma-joined set', () => {
    const v = defaultView();
    v.filters.plate = ['none', 'plated-other'];
    expect(serializeView(v)).toBe('plate=none%2Cplated-other');
    expect(parseView(serializeView(v), idx).filters.plate).toEqual(['none', 'plated-other']);
  });
  it('keeps the valid members of a plate list and drops the rest', () => {
    expect(parseView('plate=none,bogus,carbon', idx).filters.plate).toEqual(['none', 'carbon']);
    expect(parseView('plate=none,none', idx).filters.plate).toEqual(['none']);
  });
  // The two inexact tokens the multi-select replaced. A URL carrying either is stale, not partial:
  // dropping it is what stops `plate=plated` quietly meaning something new.
  it.each(['plate=plated', 'plate=not-carbon', 'plate=plated,not-carbon'])('drops %s as unknown', (qs) => {
    expect(parseView(qs, idx)).toEqual(defaultView());
  });
  it('leaves an all-separator plate absent rather than empty, exactly like brands', () => {
    expect(parseView('plate=,,', idx).filters.plate).toBeUndefined();
    expect(parseView('plate=,,', idx)).toEqual(defaultView());
  });
  it('omits an empty plate selection from the URL', () => {
    const v = defaultView();
    v.filters.plate = [];
    expect(serializeView(v)).toBe('');
  });
  it('ignores unknown keys, unknown range targets, and garbage values', () => {
    const v = parseView('r.nonsense=1~2&bogus=1&r.heel-stack=abc~def&plate=titanium&sort=-nope', idx);
    expect(v).toEqual(defaultView());
  });
  it('sort minus prefix means desc', () => {
    expect(parseView('sort=-weight', idx).sort).toEqual({ key: 'weight', dir: 'desc' });
    expect(parseView('sort=name', idx).sort).toEqual({ key: 'name', dir: 'asc' });
  });
  it('round-trips randomised states', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const keys = ['heel-stack', 'weight', 'msrpGbp', 'score'];
    for (let i = 0; i < 50; i++) {
      const v = defaultView();
      for (const k of keys) if (rnd() > 0.5) v.filters.ranges[k] = { ...(rnd() > 0.4 ? { min: Math.round(rnd() * 100) } : {}), ...(rnd() > 0.4 ? { max: 100 + Math.round(rnd() * 100) } : {}) };
      if (rnd() > 0.5) v.filters.plate = [(['none', 'plated-other', 'carbon'] as const)[Math.floor(rnd() * 3)]!];
      if (rnd() > 0.5) v.sort = { key: keys[Math.floor(rnd() * keys.length)]!, dir: rnd() > 0.5 ? 'asc' : 'desc' };
      const parsed = parseView(serializeView(v), idx);
      // empty range bounds are dropped in serialisation — normalise before comparing
      for (const k of Object.keys(v.filters.ranges)) {
        if (v.filters.ranges[k]!.min === undefined && v.filters.ranges[k]!.max === undefined) delete v.filters.ranges[k];
      }
      // `score` is the one non-curated key here, so parsing seeds it as a hand-added row
      if (v.filters.ranges['score']) v.rows = ['score'];
      expect(parsed).toEqual(v);
    }
  });
});

describe('urlstate hostile input', () => {
  it('parses an empty or leading-? query string as the default view', () => {
    expect(parseView('', idx)).toEqual(defaultView());
    expect(parseView('?sort=name', idx).sort).toEqual({ key: 'name', dir: 'asc' });
  });
  it('defaultView hands out fresh objects', () => {
    // inline literal, not the live defaultColumns() reference: a leaked array would otherwise mutate the expectation too
    const columns = ['releasedAt', 'score', 'msrpGbp', 'heel-stack',
      'plate', 'energy-return-heel', 'toebox-width-widest-part', 'weight'];
    expect(defaultColumns('heel')).toEqual(columns);
    const a = defaultView();
    a.filters.ranges['weight'] = { min: 1 };
    a.columns.push('bogus');
    a.sort.key = 'weight';
    expect(defaultView()).toEqual({ filters: { ranges: {} }, sort: { key: 'score', dir: 'desc' }, columns, generations: {}, rows: [], stability: false });
    expect(defaultColumns('heel')).toEqual(columns);
  });
  it('resolves repeated keys to the last valid occurrence', () => {
    expect(parseView('r.heel-stack=10~&r.heel-stack=20~', idx).filters.ranges['heel-stack']).toEqual({ min: 20 });
    expect(parseView('sort=name&sort=-weight', idx).sort).toEqual({ key: 'weight', dir: 'desc' });
    // a later *invalid* value leaves the earlier valid one standing
    expect(parseView('sort=name&sort=-nope', idx).sort).toEqual({ key: 'name', dir: 'asc' });
  });
  it('round-trips values needing percent-encoding', () => {
    const v = defaultView();
    v.filters.search = 'R&D 100% "fast" +shoes~ø=?#';
    v.filters.brands = ['New Balance', 'ASICS'];
    const qs = serializeView(v);
    expect(qs).not.toContain(' ');
    expect(parseView(qs, idx)).toEqual(v);
  });
  it('round-trips numbers that stringify in exponent form', () => {
    const v = defaultView();
    v.filters.ranges['weight'] = { min: 1e-7, max: 1e21 };
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
  it.each([
    ['r.score=1e400~', 'overflows to Infinity'],
    ['r.score=~-1e400', 'underflows to -Infinity'],
    ['r.score=1e400~50', 'has one overflowing bound — a bad bound voids the whole range'],
    ['r.score=10~abc', 'has one unparseable bound'],
    ['r.heel-stack=~', 'has no bounds at all'],
    ['r.heel-stack=1~2~3', 'has too many separators'],
    ['r.heel-stack=1.2.3~', 'is not a number'],
    ['r.heel-stack=%2036~', 'is padded with whitespace'],
    ['r.heel-stack=NaN~', 'is NaN'],
    ['r.heel-stack=36', 'is missing the separator'],
    ['r.tongue-gusset-type=1~2', 'targets a non-numeric test'],
  ])('drops range %s (%s)', (qs) => {
    expect(parseView(qs, idx)).toEqual(defaultView());
  });
  it('keeps a huge but finite bound and re-serialises it losslessly', () => {
    const v = parseView('r.score=99999999999999999999999999~', idx);
    expect(v.filters.ranges['score']).toEqual({ min: 1e26 });
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
  it('round-trips a plate sort', () => {
    expect(parseView('sort=-plate', idx).sort).toEqual({ key: 'plate', dir: 'desc' });
    const v = defaultView();
    v.sort = { key: 'plate', dir: 'asc' };
    expect(serializeView(v)).toBe('sort=plate');
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
  it('rejects sort keys that are not numerically sortable', () => {
    expect(parseView('sort=tongue-gusset-type', idx).sort).toEqual(defaultView().sort);
    expect(parseView('sort=-', idx).sort).toEqual(defaultView().sort);
    expect(parseView('sort=', idx).sort).toEqual(defaultView().sort);
  });
  it.each(['disc=0', 'disc=true', 'disc=', 'disc=HIDE', 'brands=', 'brands=,,,', 'q=', 'after=26-07-2024', 'plate=NONE'])(
    'ignores %s', (qs) => { expect(parseView(qs, idx)).toEqual(defaultView()); });
  it.each(['hide', 'only'] as const)('round-trips disc=%s', (value) => {
    const v = defaultView();
    v.filters.discontinued = value;
    expect(serializeView(v)).toBe(`disc=${value}`);
    expect(parseView(serializeView(v), idx).filters.discontinued).toBe(value);
  });
  // The boolean this replaced could only ever hide; a stale link carrying it is not half-honoured.
  it('ignores the retired nodisc key', () => {
    expect(parseView('nodisc=1', idx)).toEqual(defaultView());
  });
  it('filters, dedupes and falls back on column lists', () => {
    // non-numeric tests are legitimate columns even though they are not rangeable
    expect(parseView('cols=score,score,bogus,tongue-gusset-type,plate', idx).columns)
      .toEqual(['score', 'tongue-gusset-type', 'plate']);
    const fallback = parseView('cols=bogus,alsobogus', idx).columns;
    fallback.push('leaked'); // the fallback must be a fresh array, so mutating it cannot corrupt the next default
    expect(parseView('cols=bogus,alsobogus', idx).columns).toEqual(['releasedAt', 'score', 'msrpGbp', 'heel-stack',
      'plate', 'energy-return-heel', 'toebox-width-widest-part', 'weight']);
    expect(serializeView(parseView(`cols=${defaultColumns('heel').join(',')}`, indexTests([...TESTS,
      labTest({ id: 900, slug: 'toebox-width-widest-part', name: 'Toebox', units: 'mm' })]))))
      .toBe('');
  });
  it('rejects name and brand as columns — they are sort fields, and the table renders them itself', () => {
    expect(parseView('cols=name,brand,score', idx).columns).toEqual(['score']);
  });
  it('omits ranges that are empty or not finite', () => {
    const v = defaultView();
    v.filters.ranges['weight'] = {};
    v.filters.ranges['score'] = { min: Number.NaN, max: Number.POSITIVE_INFINITY };
    expect(serializeView(v)).toBe('');
  });
  it('drops the whole range when one bound is non-finite, rather than widening it', () => {
    const v = defaultView();
    v.filters.ranges['weight'] = { min: Number.NaN, max: 5 };
    expect(serializeView(v)).toBe('');
    v.filters.ranges['weight'] = { min: 5, max: Number.POSITIVE_INFINITY };
    expect(serializeView(v)).toBe('');
  });
});

describe('generation choice', () => {
  it('round-trips a non-default generation', () => {
    const v = defaultView();
    v.generations['midsole-softness-22'] = 'midsole-softness';
    expect(parseView(serializeView(v), idx).generations).toEqual({ 'midsole-softness-22': 'midsole-softness' });
  });
  it('omits a choice that equals its key', () => {
    const v = defaultView();
    v.generations['midsole-softness-22'] = 'midsole-softness-22';
    expect(serializeView(v)).toBe('');
  });
  it('drops a choice naming a test that does not exist', () => {
    expect(parseView('gen.midsole-softness-22=made-up', idx).generations).toEqual({});
  });
  it('drops a choice keyed on a test that does not exist', () => {
    expect(parseView('gen.made-up=midsole-softness', idx).generations).toEqual({});
  });
  it('round-trips show-missing and omits it when unset', () => {
    const v = defaultView();
    v.filters.showMissing = true;
    expect(serializeView(v)).toContain('missing=1');
    expect(parseView(serializeView(v), idx).filters.showMissing).toBe(true);
    expect(serializeView(defaultView())).not.toContain('missing');
  });
  it('never admits both generations of a pair as ranges at once', () => {
    const v = parseView('r.midsole-softness=1~&r.midsole-softness-22=1~', idx);
    expect(Object.keys(v.filters.ranges)).toHaveLength(1);
  });
  it('never admits both generations of a pair as columns at once', () => {
    const v = parseView('cols=midsole-softness,midsole-softness-22', idx);
    expect(v.columns).toEqual(['midsole-softness-22']);
  });
});

describe('equality against the baseline', () => {
  it('is true for a freshly built default', () => {
    expect(sameValue(defaultView(), defaultView())).toBe(true);
  });
  it('is false once an empty range has been added, though it serialises to nothing', () => {
    const v = defaultView();
    v.filters.ranges['weight'] = {};
    expect(serializeView(v)).toBe('');     // the trap
    expect(sameValue(v, defaultView())).toBe(false);
  });
  it('is false for a changed sort, changed columns, or a generation choice', () => {
    const sort = defaultView(); sort.sort = { key: 'weight', dir: 'asc' };
    const cols = defaultView(); cols.columns = ['score'];
    const gen = defaultView(); gen.generations['midsole-softness-22'] = 'midsole-softness';
    for (const v of [sort, cols, gen]) expect(sameValue(v, defaultView())).toBe(false);
  });
  // Keyed by field name, not an array: a new FilterState field then fails typecheck —
  // which runs in verify — instead of silently going untested.
  const setters: Record<keyof FilterState, (f: FilterState) => void> = {
    ranges: (f) => { f.ranges['weight'] = {}; },
    plate: (f) => { f.plate = ['carbon']; },
    search: (f) => { f.search = 'nike'; },
    brands: (f) => { f.brands = ['ASICS']; },
    releasedAfter: (f) => { f.releasedAfter = '2024-01-01'; },
    discontinued: (f) => { f.discontinued = 'only'; },
    showMissing: (f) => { f.showMissing = true; },
  };

  it('is false for every filter field, not just the ones someone remembered', () => {
    for (const mutate of Object.values(setters)) {
      const v = defaultView();
      mutate(v.filters);
      expect(sameValue(v, defaultView())).toBe(false);
    }
  });

  it('is true again once a field is cleared, even though the key remains', () => {
    // `patch` structuredClones the snapshot, and structured clone keeps own properties
    // whose value is undefined — every sidebar clear path leaves the key behind. A
    // key-count comparison would never let the band re-expand.
    for (const [field, mutate] of Object.entries(setters)) {
      if (field === 'ranges') continue;              // ranges clear by deletion, not by undefined
      const v = defaultView();
      mutate(v.filters);
      (v.filters as unknown as Record<string, unknown>)[field] = undefined;
      expect(Object.keys(v.filters)).toContain(field);   // the key really is still there
      expect(sameValue(v, defaultView())).toBe(true);
    }
  });
});

describe('the side the view is about', () => {
  it('never writes a side key', () => {
    // `side=` as well as `strike=`: the shorthand is deferred, not built (BACKLOG.md), and one
    // encoding of the side is the property this asserts (docs/app.md §URL encoding).
    const qs = serializeView({ ...defaultView(), columns: defaultColumns('forefoot') });
    expect(qs).not.toContain('strike');
    expect(qs).not.toContain('side=');
  });
  it('carries the side in the columns instead', () => {
    const v = { ...defaultView(), columns: defaultColumns('forefoot') };
    expect(parseView(serializeView(v), idx).columns).toEqual(defaultColumns('forefoot'));
  });
  it('ignores a legacy strike key rather than honouring it', () => {
    // No compatibility branch: the tool was never shared, so no such link is in anyone's hands.
    expect(parseView('strike=forefoot', idx)).toEqual(defaultView());
  });
  it('round-trips a mixed-side view losslessly', () => {
    // Both halves must exist in the fixture, or parseView drops the column and the round trip is
    // not the thing under test.
    const v = { ...defaultView(), columns: ['score', 'heel-stack', 'forefoot-stack'] };
    v.filters.ranges['energy-return-forefoot'] = { min: 60 };
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
  it('names one half in the default columns, and only that half', () => {
    expect(defaultColumns('forefoot')).toContain('energy-return-forefoot');
    expect(defaultColumns('forefoot')).not.toContain('energy-return-heel');
    expect(defaultColumns('forefoot')).toContain('forefoot-stack');
    expect(defaultColumns('forefoot')).not.toContain('heel-stack');
    expect(defaultColumns('heel')).toContain('energy-return-heel');
    expect(defaultColumns('heel')).not.toContain('energy-return-forefoot');
    expect(defaultColumns('heel')).toContain('heel-stack');
    expect(defaultColumns('heel')).not.toContain('forefoot-stack');
  });
  it('defaults to six numeric columns so a phone fits them all', () => {
    const cols = defaultColumns('heel');
    expect(cols).not.toContain('midsole-softness-22');
    expect(cols.filter((c) => c !== 'releasedAt' && c !== 'plate')).toHaveLength(6);
  });
  // The columns are the only record of the side now, so a forefoot plain table rides in `cols` and
  // is emphatically not the baseline.
  it('carries a forefoot plain table through a URL round trip, as columns', () => {
    const v = { ...defaultView(), columns: defaultColumns('forefoot') };
    expect(serializeView(v)).toContain('cols=');
    expect(parseView(serializeView(v), idx)).toEqual(v);
    expect(sameValue(parseView(serializeView(v), idx), defaultView())).toBe(false);
  });
  it('still writes columns that differ from the baseline', () => {
    const v = { ...defaultView(), columns: ['score'] };
    expect(serializeView(v)).toContain('cols=score');
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
});

// Which rows are shown is its own state, because clearing a value and removing a row are two
// different actions (docs/app.md §Filters). It serialises, so a shared link shows the same controls.
describe('the hand-added row list', () => {
  it('round-trips, and stays absent when empty', () => {
    const v = defaultView();
    v.rows = ['stiffness'];
    const withStiffness = indexTests([...TESTS, labTest({ id: 99, slug: 'stiffness', name: 'Stiffness' })]);
    expect(serializeView(v)).toBe('rows=stiffness');
    expect(parseView(serializeView(v), withStiffness)).toEqual(v);
    expect(serializeView(defaultView())).not.toContain('rows');
  });
  it('dedupes, drops keys that are not rangeable, and treats all-separator as absent', () => {
    const withStiffness = indexTests([...TESTS, labTest({ id: 99, slug: 'stiffness', name: 'Stiffness' })]);
    expect(parseView('rows=stiffness,stiffness', withStiffness).rows).toEqual(['stiffness']);
    expect(parseView('rows=made-up,tongue-gusset-type', withStiffness).rows).toEqual([]);
    expect(parseView('rows=,,', withStiffness)).toEqual(defaultView());
  });
  it('drops a curated key, which is on screen anyway and could never be removed', () => {
    expect(parseView('rows=heel-stack', idx).rows).toEqual([]);
  });
  // Otherwise clearing a row that arrived by link would delete the key, leaving it neither active
  // nor listed — so clear would silently mean remove for exactly those rows.
  it('seeds itself from every active non-curated key', () => {
    const withStiffness = indexTests([...TESTS, labTest({ id: 99, slug: 'stiffness', name: 'Stiffness' })]);
    expect(parseView('r.stiffness=5~', withStiffness).rows).toEqual(['stiffness']);
    expect(parseView('r.heel-stack=36~', idx).rows).toEqual([]);   // curated: already on screen
  });
  it('is part of what makes a view non-default', () => {
    const v = defaultView();
    v.rows = ['stiffness'];
    expect(sameValue(v, defaultView())).toBe(false);
  });
});

describe('the stability preference', () => {
  it('defaults stability off', () => {
    expect(defaultView().stability).toBe(false);
  });

  it('serialises stability only when on, so a default view still has an empty query', () => {
    expect(serializeView(defaultView())).not.toContain('stab');
    expect(serializeView({ ...defaultView(), stability: true })).toContain('stab=1');
  });

  it('round-trips stability', () => {
    expect(parseView(serializeView({ ...defaultView(), stability: true }), idx).stability).toBe(true);
    expect(parseView('', idx).stability).toBe(false);
  });

  it('ignores a stab value that is not 1', () => {
    expect(parseView('stab=yes', idx).stability).toBe(false);
    expect(parseView('stab=0', idx).stability).toBe(false);
  });
});

describe('the synthetic Easy score as a view key', () => {
  it('accepts either side\'s score as a sort key and a column', () => {
    for (const key of Object.values(EASY_SCORE_KEYS)) {
      expect(parseView(`sort=-${key}`, idx).sort).toEqual({ key, dir: 'desc' });
      expect(parseView(`cols=${key},weight`, idx).columns).toEqual([key, 'weight']);
    }
  });
});

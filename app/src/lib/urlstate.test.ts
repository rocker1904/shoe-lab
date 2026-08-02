import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import type { Zone } from './lineage';
import { SCORE_DEFS } from './score-defs';
import { defaultColumns, defaultView, parseOpen, parseView, sameValue, serializeOpen, serializeView, upToColumnOrder, type ViewState } from './urlstate';
import type { FilterState } from './filters';
import { FLEET, TESTS, labTest } from './test-fixtures';

const ZONES: Zone[] = ['heel', 'forefoot'];

const idx = indexTests(TESTS);

describe('urlstate', () => {
  it('default view serialises to empty string', () => {
    expect(serializeView(defaultView())).toBe('');
  });
  it('round-trips a complex state', () => {
    const v: ViewState = {
      filters: {
        categorical: {},
        ranges: { 'heel-stack': { min: 36 }, msrpGbp: { max: 200 }, weight: { min: 200, max: 250 } },
        plate: ['none'], releasedAfter: '2024-07-01', brands: ['Nike', 'New Balance'], search: 'peg', discontinued: 'hide',
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
  /**
   * The other door into the same defect: a link replays through `parseView`, so a shared `q=++`
   * would empty its recipient's fleet on arrival with nothing on screen naming the cause. A query
   * with no non-whitespace character selects nothing and is therefore not a query
   * (docs/app.md §Filters).
   */
  it.each(['q=+', 'q=++', 'q=%09', 'q=%20%0A%20'])('drops a whitespace-only %s', (qs) => {
    expect(parseView(qs, idx)).toEqual(defaultView());
  });
  it('keeps the whitespace around a real query, so a two-word link round-trips', () => {
    expect(parseView('q=road+', idx).filters.search).toBe('road ');
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
    expect(defaultView()).toEqual({ filters: { categorical: {}, ranges: {} }, sort: { key: 'score', dir: 'desc' }, columns, generations: {}, rows: [], stability: false });
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
  // A categorical column sorts alphabetically by its label and its header offers that sort, so the
  // link has to carry it: writing a sort the parser drops makes Copy link lose the view
  // (docs/app.md §Columns are permissive, ranges and sorts are strict).
  it('round-trips a categorical sort', () => {
    expect(parseView('sort=-tongue-gusset-type', idx).sort).toEqual({ key: 'tongue-gusset-type', dir: 'desc' });
    const v = defaultView();
    v.sort = { key: 'removable-insole', dir: 'asc' };
    expect(serializeView(v)).toBe('sort=removable-insole');
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
  it('rejects sort keys that name no test at all', () => {
    expect(parseView('sort=not-a-test', idx).sort).toEqual(defaultView().sort);
    expect(parseView('sort=-', idx).sort).toEqual(defaultView().sort);
    expect(parseView('sort=', idx).sort).toEqual(defaultView().sort);
  });
  it.each(['disc=0', 'disc=true', 'disc=', 'disc=HIDE', 'brands=', 'brands=,,,', 'q=', 'after=26-07-2024', 'after=2024-13', 'after=2024-00', 'after=2024', 'plate=NONE'])(
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
  it('dedupes and falls back on column lists', () => {
    // non-numeric tests are legitimate columns even though they are not rangeable
    expect(parseView('cols=score,score,tongue-gusset-type,plate', idx).columns)
      .toEqual(['score', 'tongue-gusset-type', 'plate']);
    const fallback = parseView('cols=name,brand', idx).columns;
    fallback.push('leaked'); // the fallback must be a fresh array, so mutating it cannot corrupt the next default
    expect(parseView('cols=name,brand', idx).columns).toEqual(['releasedAt', 'score', 'msrpGbp', 'heel-stack',
      'plate', 'energy-return-heel', 'toebox-width-widest-part', 'weight']);
    expect(serializeView(parseView(`cols=${defaultColumns('heel').join(',')}`, indexTests([...TESTS,
      labTest({ id: 900, slug: 'toebox-width-widest-part', name: 'Toebox', units: 'mm' })]))))
      .toBe('');
  });
  it('rejects name and brand as columns — they are sort fields, and the table renders them itself', () => {
    expect(parseView('cols=name,brand,score', idx).columns).toEqual(['score']);
  });
  /**
   * The decided contract: `cols` is permissive about the *type* of test and about whether the slug
   * still exists, because a column the catalogue has dropped costs one blank cell where a bad range
   * hides the whole fleet (§Columns are permissive, ranges and sorts are strict). Filtering against
   * the live catalogue was the opposite — it silently rebuilt a two-column link as the default
   * eight, which is the one outcome the link's sender did not ask for.
   */
  it('keeps a slug the catalogue no longer holds, rather than rebuilding the default table', () => {
    expect(parseView('cols=releasedAt,score,gone-metric-slug', idx).columns)
      .toEqual(['releasedAt', 'score', 'gone-metric-slug']);
    expect(parseView('cols=gone-one,gone-two', idx).columns).toEqual(['gone-one', 'gone-two']);
    expect(parseView('cols=gone,gone,score', idx).columns).toEqual(['gone', 'score']);
  });
  /**
   * Permissive about the slug, not about the shape. A header renders an unknown key verbatim, so
   * what survives has to look like a catalogue slug and be no longer than one could be — the
   * longest the catalogue has ever carried is 38 characters, and the bound is 64.
   */
  it.each([
    'cols=<script>alert(1)</script>',
    'cols=UPPER,Mixed-Case',
    'cols=-leading,trailing-,dou--ble',
    'cols=has space,has.dot,has_underscore',
    'cols=../../etc/passwd',
    `cols=${'x'.repeat(65)}`,
  ])('drops a col that could never be a slug: %s', (qs) => {
    expect(parseView(qs, idx)).toEqual(defaultView());
  });
  it('keeps a slug right on the length bound and drops the one past it', () => {
    expect(parseView(`cols=${'x'.repeat(64)}`, idx).columns).toEqual(['x'.repeat(64)]);
    expect(parseView(`cols=${'x'.repeat(65)},score`, idx).columns).toEqual(['score']);
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
    categorical: (f) => { f.categorical['heel-tab'] = ['pull-tab']; },
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
      // Both records clear by deleting the key that held the value, not by going undefined.
      if (field === 'ranges' || field === 'categorical') continue;
      const v = defaultView();
      mutate(v.filters);
      (v.filters as unknown as Record<string, unknown>)[field] = undefined;
      expect(Object.keys(v.filters)).toContain(field);   // the key really is still there
      expect(sameValue(v, defaultView())).toBe(true);
    }
  });
});

/**
 * `c.<slug>` carries a feature selection. Strict on the key, because a key naming no categorical
 * test has no control to untick; deliberately unstrict on an enum value, because `data/` regenerates
 * on a schedule and a strict parse would silently narrow a shared link when upstream renames an
 * option slug (docs/app.md §URL encoding).
 */
describe('the feature selection token', () => {
  const withSelection = (sel: Record<string, string[]>) => {
    const v = defaultView();
    v.filters.categorical = sel;
    return v;
  };

  it('writes one token per selection and reads it back', () => {
    const v = withSelection({ 'tongue-gusset-type': ['both-sides-semi'], 'heel-tab': ['pull-tab'] });
    expect(parseView(serializeView(v), idx).filters.categorical)
      .toEqual({ 'tongue-gusset-type': ['both-sides-semi'], 'heel-tab': ['pull-tab'] });
    expect(serializeView(v)).toContain('c.tongue-gusset-type=both-sides-semi');
    expect(serializeView(v)).toContain('c.heel-tab=pull-tab');
  });

  it('writes nothing when nothing is selected, and parses back to the default view', () => {
    expect(serializeView(withSelection({}))).toBe('');
    expect(serializeView(withSelection({ 'heel-tab': [] }))).toBe('');
    expect(sameValue(parseView('', idx), defaultView())).toBe(true);
  });

  it('round-trips a multi-value selection in whatever order the state holds it', () => {
    for (const values of [['none', 'both-sides-semi'], ['both-sides-semi', 'none']]) {
      const qs = serializeView(withSelection({ 'tongue-gusset-type': values }));
      expect(parseView(qs, idx).filters.categorical['tongue-gusset-type'], qs).toEqual(values);
    }
  });

  it('dedupes values and keeps their arrival order, like brands', () => {
    expect(parseView('c.tongue-gusset-type=none,both-sides-semi,none', idx).filters.categorical)
      .toEqual({ 'tongue-gusset-type': ['none', 'both-sides-semi'] });
  });

  it('drops a key that names no categorical test in this catalogue', () => {
    // A numeric test and the slug the `plate` field owns are refused here as they are everywhere
    // else: neither has a control to untick.
    for (const qs of ['c.weight=250', 'c.plate=true', 'c.nonesuch=x']) {
      expect(parseView(qs, idx).filters.categorical, qs).toEqual({});
      expect(sameValue(parseView(qs, idx), defaultView()), qs).toBe(true);
    }
  });

  it('keeps an enum value the catalogue no longer declares, verbatim', () => {
    expect(parseView('c.tongue-gusset-type=bootie', idx).filters.categorical)
      .toEqual({ 'tongue-gusset-type': ['bootie'] });
  });

  it('takes only true or false for a bool test', () => {
    expect(parseView('c.removable-insole=true', idx).filters.categorical).toEqual({ 'removable-insole': ['true'] });
    expect(parseView('c.removable-insole=false', idx).filters.categorical).toEqual({ 'removable-insole': ['false'] });
    expect(parseView('c.removable-insole=yes', idx).filters.categorical).toEqual({});
  });

  it('collapses a bool carrying both values to absent, because no tri-state can show both', () => {
    expect(parseView('c.removable-insole=true,false', idx).filters.categorical).toEqual({});
    expect(sameValue(parseView('c.removable-insole=true,false', idx), defaultView())).toBe(true);
  });

  it('leaves an all-separator value absent rather than storing an empty selection', () => {
    // An empty array would keep `isDefaultView` false forever and never let `All` light again.
    for (const qs of ['c.tongue-gusset-type=,,', 'c.tongue-gusset-type=']) {
      expect(parseView(qs, idx).filters.categorical, qs).toEqual({});
    }
  });

  /**
   * `URLSearchParams` yields every occurrence of a key, so one selection can arrive spelled two
   * ways. They merge before any rule is applied, or the both-values collapse would depend on the
   * spelling — `c.x=true&c.x=false` selecting No where `c.x=true,false` refuses.
   */
  it('merges repeated keys for one slug instead of letting the last win', () => {
    const merged = parseView('c.heel-tab=pull-tab&c.heel-tab=none', idx).filters.categorical;
    expect(merged).toEqual({ 'heel-tab': ['pull-tab', 'none'] });
    expect(merged).toEqual(parseView('c.heel-tab=pull-tab,none', idx).filters.categorical);
  });

  it('collapses a bool spelled as two keys exactly as it collapses one key carrying both', () => {
    const twoKeys = parseView('c.removable-insole=true&c.removable-insole=false', idx).filters.categorical;
    expect(twoKeys).toEqual({});
    expect(twoKeys).toEqual(parseView('c.removable-insole=true,false', idx).filters.categorical);
  });

  it('dedupes across occurrences, not only within one', () => {
    expect(parseView('c.heel-tab=none&c.heel-tab=none', idx).filters.categorical)
      .toEqual({ 'heel-tab': ['none'] });
  });

  it('survives a full round trip beside every other filter', () => {
    const v = defaultView();
    v.filters.categorical = { 'tongue-gusset-type': ['none'], 'removable-insole': ['true'] };
    v.filters.brands = ['Brand'];
    v.filters.ranges['heel-stack'] = { min: 36 };
    v.filters.discontinued = 'hide';
    expect(parseView(serializeView(v), idx)).toEqual(v);
  });
});

describe('the zone the view is about', () => {
  it('never writes a zone key', () => {
    // The shorthand is deferred, not built (BACKLOG.md), and one encoding of the zone is the
    // property this asserts (docs/app.md §URL encoding).
    const qs = serializeView({ ...defaultView(), columns: defaultColumns('forefoot') });
    expect(qs).not.toContain('zone=');
  });
  it('carries the zone in the columns instead', () => {
    const v = { ...defaultView(), columns: defaultColumns('forefoot') };
    expect(parseView(serializeView(v), idx).columns).toEqual(defaultColumns('forefoot'));
  });
  it('round-trips a mixed-zone view losslessly', () => {
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
  // The columns are the only record of the zone now, so a forefoot plain table rides in `cols` and
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

describe('the synthetic story scores as view keys', () => {
  it('accepts every story score, either zone, as a sort key and a column', () => {
    for (const def of SCORE_DEFS) for (const zone of ZONES) {
      const key = def.keys[zone];
      expect(parseView(`sort=-${key}`, idx).sort).toEqual({ key, dir: 'desc' });
      expect(parseView(`cols=${key},weight`, idx).columns).toEqual([key, 'weight']);
    }
  });
});

describe('released-after is month-granular', () => {
  const idx = indexTests(TESTS);
  it('parses a month bound to the first of that month', () => {
    expect(parseView('after=2024-03', idx).filters.releasedAfter).toBe('2024-03-01');
  });
  it('normalises a day-precise bound from an older link inward, widening rather than narrowing', () => {
    expect(parseView('after=2024-03-15', idx).filters.releasedAfter).toBe('2024-03-01');
  });
  it('serialises the bound as a month, and round-trips', () => {
    const v = parseView('after=2024-03-15', idx);
    expect(serializeView(v)).toContain('after=2024-03');
    expect(parseView(serializeView(v), idx).filters.releasedAfter).toBe('2024-03-01');
  });
});

/**
 * The open detail panels ride in the same address as the view but through their own pair, so this
 * block owns both halves of that: the pair round-trips and validates, and neither encoding writes
 * or reads the other's token (docs/app.md §URL encoding).
 */
describe('open rows', () => {
  const SLUGS = new Set(FLEET.map((s) => s.slug));

  it('serialises nothing when no row is open', () => {
    expect(serializeOpen([])).toBe('');
  });
  it('round-trips an open set, in the order it was opened', () => {
    expect(parseOpen(serializeOpen(['racer', 'cushy']), SLUGS)).toEqual(['racer', 'cushy']);
  });
  it('drops a slug the catalogue no longer has', () => {
    expect(parseOpen('open=cushy,gone-shoe', SLUGS)).toEqual(['cushy']);
  });
  it('an all-separator value stays empty rather than becoming a member', () => {
    expect(parseOpen('open=,,', SLUGS)).toEqual([]);
  });
  it('dedupes a repeated slug', () => {
    expect(parseOpen('open=cushy,cushy', SLUGS)).toEqual(['cushy']);
  });
  it('reads nothing out of an address that carries no open token', () => {
    expect(parseOpen('q=nimbus', SLUGS)).toEqual([]);
  });
  // The two encodings compose into one address, so neither may write the other's token.
  it('serializeView never emits an open key', () => {
    const v = defaultView();
    v.filters.brands = ['Brand'];
    expect(serializeView(v)).not.toContain('open');
  });
  it('parseView ignores an open token', () => {
    expect(sameValue(parseView('open=cushy', idx), defaultView())).toBe(true);
  });
});

describe('upToColumnOrder', () => {
  it('returns the view itself when only column order differs from the target', () => {
    const target = defaultView();
    const v = { ...structuredClone(target), columns: [...target.columns].reverse() };
    expect(upToColumnOrder(v, target)).toBe(v);
  });
  it('returns the target when the column sets differ', () => {
    const target = defaultView();
    const missing = { ...structuredClone(target), columns: target.columns.slice(1) };
    expect(upToColumnOrder(missing, target)).toBe(target);
  });
  it('returns the target when anything beyond the columns differs', () => {
    const target = defaultView();
    const resorted = structuredClone(target);
    resorted.columns = [...target.columns].reverse();
    resorted.sort = { ...target.sort, dir: 'asc' };
    expect(upToColumnOrder(resorted, target)).toBe(target);
  });
});

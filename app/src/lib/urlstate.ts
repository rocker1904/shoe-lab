import type { Plate } from '../../../shared/types.js';
import { EMPTY_FILTERS, type FilterState } from './filters';
import type { SortState } from './sort';
import { FIELD_RANGE_KEYS, NUMERIC_TEST_TYPES, type TestIndex } from './dataset';
import { metricEntries, sideKey, type Side } from './lineage';

export interface ViewState {
  filters: FilterState; sort: SortState; columns: string[];
  /** Chosen generation of each superseded pair, keyed by the **current** generation's slug. A
   *  choice equal to its key is the default and never serialises (docs/app.md §URL encoding). */
  generations: Record<string, string>;
  /** Which end of the shoe the runner lands on. The baseline itself takes it, so nothing
   *  downstream special-cases it (docs/app.md §View and URL ownership). */
  strike: Side;
}

export const DEFAULT_SORT: SortState = { key: 'score', dir: 'desc' };
/** The strike is required rather than defaulted: a default would reinstate the silent heel
 *  assumption invisibly, at whichever call site forgot to pass one. */
export function defaultColumns(strike: Side): string[] {
  return ['releasedAt', 'score', 'msrpGbp', sideKey('Stack', strike), 'midsole-softness-22',
    'plate', sideKey('Energy return', strike), 'toebox-width-widest-part', 'weight'];
}
/**
 * Every value a shoe's `plate` can hold, in the order a selection is written. Both the filter UI
 * and `parseView` normalise to this order, so a link-borne selection still compares equal to the
 * story that would build it — story selection is a positional value comparison (docs/app.md §Presets).
 */
export const PLATES: Plate[] = ['none', 'plated-other', 'carbon'];
const SORT_FIELDS = new Set(['name', 'brand', 'releasedAt', 'score', 'msrpGbp', 'plate']);
/** ShoeTable renders name/brand itself, so they sort but have no cell to become a column (docs/app.md §Columns and sorting). */
const COLUMN_FIELDS = new Set(['releasedAt', 'score', 'msrpGbp', 'plate']);
/** Accepts everything `String(number)` can emit, including exponent form, so serialise/parse round-trips. */
const NUMBER_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function defaultView(strike: Side): ViewState {
  return { filters: { ...EMPTY_FILTERS, ranges: {} }, sort: { ...DEFAULT_SORT }, columns: defaultColumns(strike), generations: {}, strike };
}

/**
 * Structural equality with `undefined` treated as absent, so a cleared field that keeps its key
 * (structuredClone preserves own properties whose value is `undefined`) still compares equal.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/**
 * Whether the view is untouched — what the entry band's collapse is derived from (docs/app.md
 * §Presets). Deliberately not `serializeView(v) === ''`: an empty range row is view state that
 * does not serialise, so a view with a filter added from the Add-filter menu serialises to
 * nothing and is still not the default (docs/app.md §View and URL ownership).
 *
 * Compared wholesale rather than field by field so a new `FilterState` field cannot silently go
 * unchecked, and **by value rather than by key presence** — see `sameValue`.
 */
export function isDefaultView(v: ViewState): boolean {
  // Against **this runner's** baseline, so a view differing only in strike is still default and the
  // entry band survives a strike flip (docs/app.md §Presets).
  return sameValue(v, defaultView(v.strike));
}

/** Current-generation slug to retired-generation slug, for every pair the catalogue resolves. */
function pairsOf(idx: TestIndex): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const e of metricEntries([...idx.byId.values()])) {
    if (e.kind === 'pair') pairs.set(e.current.key, e.retired.key);
  }
  return pairs;
}

/** A present-but-non-finite bound is unserialisable; dropping just that side would silently widen the range. */
const finite = (n: number | undefined) => n === undefined || (typeof n === 'number' && Number.isFinite(n));

function parseBound(s: string): number | undefined | null {
  if (!s) return undefined;
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function serializeView(v: ViewState): string {
  const p = new URLSearchParams();
  for (const [key, b] of Object.entries(v.filters.ranges)) {
    if (b.min === undefined && b.max === undefined) continue;
    if (!finite(b.min) || !finite(b.max)) continue;
    p.set(`r.${key}`, `${b.min ?? ''}~${b.max ?? ''}`);
  }
  if (v.filters.plate?.length) p.set('plate', v.filters.plate.join(','));
  if (v.filters.releasedAfter) p.set('after', v.filters.releasedAfter);
  if (v.filters.brands?.length) p.set('brands', v.filters.brands.join(','));
  if (v.filters.search) p.set('q', v.filters.search);
  if (v.filters.discontinued) p.set('disc', v.filters.discontinued);
  if (v.filters.showMissing) p.set('missing', '1');
  if (v.sort.key !== DEFAULT_SORT.key || v.sort.dir !== DEFAULT_SORT.dir) {
    p.set('sort', v.sort.dir === 'desc' ? `-${v.sort.key}` : v.sort.key);
  }
  if (v.strike !== 'heel') p.set('strike', v.strike);
  if (v.columns.join(',') !== defaultColumns(v.strike).join(',')) p.set('cols', v.columns.join(','));
  for (const [key, chosen] of Object.entries(v.generations)) {
    if (chosen !== key) p.set(`gen.${key}`, chosen);
  }
  return p.toString();
}

export function parseView(qs: string, idx: TestIndex): ViewState {
  const p = new URLSearchParams(qs);
  // Read before the baseline is built, not in the loop below: the baseline is the runner's, so a
  // link carrying `strike=forefoot` and no `cols` would otherwise open heel-shaped — and, worse,
  // open with the band collapsed, because the view no longer equals its own baseline.
  const v = defaultView(p.getAll('strike').at(-1) === 'forefoot' ? 'forefoot' : 'heel');
  // Ranges and sorts take numeric keys only while columns stay permissive
  // (docs/app.md §Columns are permissive, ranges and sorts are strict).
  const numericTest = (k: string) => {
    const test = idx.bySlug.get(k);
    return !!test && NUMERIC_TEST_TYPES.has(test.type);
  };
  const validRangeKey = (k: string) => FIELD_RANGE_KEYS.has(k) || numericTest(k);
  const genRaw = new Map<string, string>();
  for (const [key, raw] of p.entries()) {
    if (key.startsWith('gen.')) {
      genRaw.set(key.slice(4), raw);
    } else if (key.startsWith('r.')) {
      const target = key.slice(2);
      if (!validRangeKey(target)) continue;
      const parts = raw.split('~');
      if (parts.length !== 2) continue;
      const min = parseBound(parts[0]!);
      const max = parseBound(parts[1]!);
      if (min === null || max === null) continue; // a malformed bound voids the whole range
      const b: { min?: number; max?: number } = {};
      if (min !== undefined) b.min = min;
      if (max !== undefined) b.max = max;
      if (b.min !== undefined || b.max !== undefined) v.filters.ranges[target] = b;
    } else if (key === 'plate' && raw) {
      // Same all-separator rule as `brands`: ",," stays absent rather than becoming an empty array.
      const picked = new Set(raw.split(','));
      const plates = PLATES.filter((x) => picked.has(x));
      if (plates.length) v.filters.plate = plates;
    } else if (key === 'after' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      v.filters.releasedAfter = raw;
    } else if (key === 'brands' && raw) {
      // an all-separator value (",,,") must stay absent, not become an empty array that no longer equals the default
      const brands = raw.split(',').filter(Boolean);
      if (brands.length) v.filters.brands = brands;
    } else if (key === 'q' && raw) {
      v.filters.search = raw;
    } else if (key === 'disc' && (raw === 'hide' || raw === 'only')) {
      v.filters.discontinued = raw;
    } else if (key === 'missing' && raw === '1') {
      v.filters.showMissing = true;
    } else if (key === 'sort') {
      const dir = raw.startsWith('-') ? 'desc' : 'asc';
      const k = raw.replace(/^-/, '');
      if (SORT_FIELDS.has(k) || numericTest(k)) v.sort = { key: k, dir };
    } else if (key === 'cols' && raw) {
      const cols = [...new Set(raw.split(','))].filter((c) => COLUMN_FIELDS.has(c) || idx.bySlug.has(c));
      if (cols.length) v.columns = cols;
    }
  }
  // A URL is the one place both generations of a pair can arrive together, so exclusion is settled
  // here rather than trusted from the caller. The current generation wins; the other is dropped.
  for (const [current, retired] of pairsOf(idx)) {
    if (genRaw.get(current) === retired) v.generations[current] = retired;
    if (v.filters.ranges[current] && v.filters.ranges[retired]) delete v.filters.ranges[retired];
    if (v.columns.includes(current) && v.columns.includes(retired)) v.columns = v.columns.filter((c) => c !== retired);
  }
  return v;
}

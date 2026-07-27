import { EMPTY_FILTERS, type FilterState } from './filters';
import type { SortState } from './sort';
import { FIELD_RANGE_KEYS, NUMERIC_TEST_TYPES, type TestIndex } from './dataset';
import { metricEntries } from './lineage';

export interface ViewState {
  filters: FilterState; sort: SortState; columns: string[];
  /** Chosen generation of each superseded pair, keyed by the **current** generation's slug. A
   *  choice equal to its key is the default and never serialises (docs/app.md §URL encoding). */
  generations: Record<string, string>;
}

export const DEFAULT_SORT: SortState = { key: 'score', dir: 'desc' };
export const DEFAULT_COLUMNS: string[] = [
  'releasedAt', 'score', 'msrpGbp', 'heel-stack', 'midsole-softness-22',
  'plate', 'energy-return-heel', 'toebox-width-widest-part', 'weight',
];
const PLATES = new Set(['none', 'plated', 'carbon', 'not-carbon']);
const SORT_FIELDS = new Set(['name', 'brand', 'releasedAt', 'score', 'msrpGbp', 'plate']);
/** ShoeTable renders name/brand itself, so they sort but have no cell to become a column (docs/app.md §Columns and sorting). */
const COLUMN_FIELDS = new Set(['releasedAt', 'score', 'msrpGbp', 'plate']);
/** Accepts everything `String(number)` can emit, including exponent form, so serialise/parse round-trips. */
const NUMBER_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function defaultView(): ViewState {
  return { filters: { ...EMPTY_FILTERS, ranges: {} }, sort: { ...DEFAULT_SORT }, columns: [...DEFAULT_COLUMNS], generations: {} };
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
  if (v.filters.plate) p.set('plate', v.filters.plate);
  if (v.filters.releasedAfter) p.set('after', v.filters.releasedAfter);
  if (v.filters.brands?.length) p.set('brands', v.filters.brands.join(','));
  if (v.filters.search) p.set('q', v.filters.search);
  if (v.filters.hideDiscontinued) p.set('nodisc', '1');
  if (v.filters.showMissing) p.set('missing', '1');
  if (v.sort.key !== DEFAULT_SORT.key || v.sort.dir !== DEFAULT_SORT.dir) {
    p.set('sort', v.sort.dir === 'desc' ? `-${v.sort.key}` : v.sort.key);
  }
  if (v.columns.join(',') !== DEFAULT_COLUMNS.join(',')) p.set('cols', v.columns.join(','));
  for (const [key, chosen] of Object.entries(v.generations)) {
    if (chosen !== key) p.set(`gen.${key}`, chosen);
  }
  return p.toString();
}

export function parseView(qs: string, idx: TestIndex): ViewState {
  const v = defaultView();
  const p = new URLSearchParams(qs);
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
    } else if (key === 'plate' && PLATES.has(raw)) {
      v.filters.plate = raw as FilterState['plate'];
    } else if (key === 'after' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      v.filters.releasedAfter = raw;
    } else if (key === 'brands' && raw) {
      // an all-separator value (",,,") must stay absent, not become an empty array that no longer equals the default
      const brands = raw.split(',').filter(Boolean);
      if (brands.length) v.filters.brands = brands;
    } else if (key === 'q' && raw) {
      v.filters.search = raw;
    } else if (key === 'nodisc' && raw === '1') {
      v.filters.hideDiscontinued = true;
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

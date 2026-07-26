import { EMPTY_FILTERS, type FilterState } from './filters';
import type { SortState } from './sort';
import { NUMERIC_TEST_TYPES, type TestIndex } from './dataset';

export interface ViewState { filters: FilterState; sort: SortState; columns: string[] }

export const DEFAULT_SORT: SortState = { key: 'score', dir: 'desc' };
export const DEFAULT_COLUMNS: string[] = [
  'releasedAt', 'score', 'msrpGbp', 'heel-stack', 'midsole-softness-22',
  'plate', 'energy-return-heel', 'toebox-width-widest-part', 'weight',
];
const FIELD_RANGE_KEYS = new Set(['score', 'msrpGbp']);
const PLATES = new Set(['none', 'plated', 'carbon']);
const SORT_FIELDS = new Set(['name', 'brand', 'releasedAt', 'score', 'msrpGbp']);
/** Accepts everything `String(number)` can emit, including exponent form, so serialise/parse round-trips. */
const NUMBER_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function defaultView(): ViewState {
  return { filters: { ...EMPTY_FILTERS, ranges: {} }, sort: { ...DEFAULT_SORT }, columns: [...DEFAULT_COLUMNS] };
}

const bound = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? String(n) : '');

/** '' -> undefined (open-ended); unparseable or non-finite -> null (reject); otherwise the number. */
function parseBound(s: string): number | undefined | null {
  if (!s) return undefined;
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function serializeView(v: ViewState): string {
  const p = new URLSearchParams();
  for (const [key, b] of Object.entries(v.filters.ranges)) {
    const min = bound(b.min);
    const max = bound(b.max);
    if (!min && !max) continue;
    p.set(`r.${key}`, `${min}~${max}`);
  }
  if (v.filters.plate) p.set('plate', v.filters.plate);
  if (v.filters.releasedAfter) p.set('after', v.filters.releasedAfter);
  if (v.filters.brands?.length) p.set('brands', v.filters.brands.join(','));
  if (v.filters.search) p.set('q', v.filters.search);
  if (v.filters.hideDiscontinued) p.set('nodisc', '1');
  if (v.sort.key !== DEFAULT_SORT.key || v.sort.dir !== DEFAULT_SORT.dir) {
    p.set('sort', v.sort.dir === 'desc' ? `-${v.sort.key}` : v.sort.key);
  }
  if (v.columns.join(',') !== DEFAULT_COLUMNS.join(',')) p.set('cols', v.columns.join(','));
  return p.toString();
}

export function parseView(qs: string, idx: TestIndex): ViewState {
  const v = defaultView();
  const p = new URLSearchParams(qs);
  // A range only makes sense against something numeric; an option/text test would hide the whole fleet as
  // "missing". Same for sorting, which reads numeric values only. Columns stay permissive — any test can be shown.
  const numericTest = (k: string) => {
    const test = idx.bySlug.get(k);
    return !!test && NUMERIC_TEST_TYPES.has(test.type);
  };
  const validRangeKey = (k: string) => FIELD_RANGE_KEYS.has(k) || numericTest(k);
  for (const [key, raw] of p.entries()) {
    if (key.startsWith('r.')) {
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
      v.filters.brands = raw.split(',').filter(Boolean);
    } else if (key === 'q' && raw) {
      v.filters.search = raw;
    } else if (key === 'nodisc' && raw === '1') {
      v.filters.hideDiscontinued = true;
    } else if (key === 'sort') {
      const dir = raw.startsWith('-') ? 'desc' : 'asc';
      const k = raw.replace(/^-/, '');
      if (SORT_FIELDS.has(k) || numericTest(k)) v.sort = { key: k, dir };
    } else if (key === 'cols' && raw) {
      const cols = [...new Set(raw.split(','))].filter((c) => c === 'plate' || SORT_FIELDS.has(c) || idx.bySlug.has(c));
      if (cols.length) v.columns = cols;
    }
  }
  return v;
}

import type { Plate } from '../../../shared/types.js';
import { isCategorical } from './categorical';
import { FIELD_RANGE_KEYS, NUMERIC_TEST_TYPES, type TestIndex } from './dataset';
import { CURATED_RANGE_KEYS, DERIVED_ZONE_PAIRS, metricEntries, ZONES, zoneOfKey, type Zone } from './lineage';
import { applyPreset, PRESETS } from './presets';
import { startOfMonth } from './release-date';
import { defForKey } from './score-defs';
import { DEFAULT_ZONE, defaultColumns, defaultView, type ViewState } from './view';

/**
 * Every value a shoe's `plate` can hold, in the order a selection is written. Both the filter UI
 * and `parseView` normalise to this order, so a link-borne selection still compares equal to the
 * story that would build it — story selection is a positional value comparison (docs/app.md §Presets).
 */
export const PLATES: Plate[] = ['none', 'plated-other', 'carbon'];
/** Every story's score column, derived so a further story is accepted as a sort key and a column
 *  without an edit here. */
const SCORE_KEYS = DERIVED_ZONE_PAIRS.flatMap((p) => [p.heel, p.forefoot]);
const SORT_FIELDS = new Set(['name', 'brand', 'releasedAt', 'score', 'msrpGbp', 'plate',
  ...SCORE_KEYS]);
/** ShoeTable renders name/brand itself, so they sort but have no cell to become a column (docs/app.md §Columns and sorting). */
const COLUMN_FIELDS = new Set(['releasedAt', 'score', 'msrpGbp', 'plate', ...SCORE_KEYS]);
/** Accepts everything `String(number)` can emit, including exponent form, so serialise/parse round-trips. */
const NUMBER_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/**
 * What a catalogue test slug looks like. `cols` is permissive about whether the slug still exists
 * — a column the catalogue has dropped prints nothing — but not about the shape, because a header
 * renders an unknown key verbatim. Lowercase hyphen-joined alphanumerics, and no longer than a
 * slug could plausibly be: the longest the catalogue has ever carried is 38 characters
 * (`difference-in-midsole-softness-in-cold`).
 * docs/app.md §Columns are permissive, ranges and sorts are strict
 */
const TEST_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LEN = 64;

/**
 * Structural equality with `undefined` treated as absent, so a cleared field that keeps its key
 * (structuredClone preserves own properties whose value is `undefined`) still compares equal.
 */
export function sameValue(a: unknown, b: unknown): boolean {
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
 * The target, unless `v` differs from it only in column order — then `v` already *is* the target
 * and is returned as-is. Column order is add-history, not intent: nothing in the app reorders
 * columns deliberately, so a control built as `setView(X(v))` and marked by `sameValue(v, X(v))`
 * must neither go unlit over an order it never offered to change nor, lit, reorder columns the
 * runner never chose. `All` and every story mark resolve through this
 * (docs/app.md §What All does, §Presets).
 */
export function upToColumnOrder(v: ViewState, target: ViewState): ViewState {
  const sorted = (view: ViewState) => ({ ...view, columns: [...view.columns].sort() });
  return sameValue(sorted(v), sorted(target)) ? v : target;
}

/** Current-generation slug to retired-generation slug, for every pair the catalogue resolves. */
function pairsOf(idx: TestIndex): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const e of metricEntries([...idx.byId.values()])) {
    if (e.kind === 'pair') pairs.set(e.current.key, e.retired.key);
  }
  return pairs;
}

/** A present-but-non-finite bound is unserialisable; dropping just that bound would silently widen the range. */
const finite = (n: number | undefined) => n === undefined || (typeof n === 'number' && Number.isFinite(n));

function parseBound(s: string): number | undefined | null {
  if (!s) return undefined;
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * One way of writing a view: the baseline its fields are read against, and the tokens naming that
 * baseline — written before every other token, because `parseView` reads them in a pre-pass.
 */
interface Candidate { view: ViewState; tokens: [string, string][] }

/**
 * Every baseline a link could name this view against, the default first — which is what gives a tie
 * to the longhand in `serializeView` below. There is no column diff and no second definition of what
 * makes a view Easy anywhere here: a candidate is proposed cheaply and then wins or loses on the
 * length of what it saves (docs/app.md §URL encoding).
 *
 * A score column is the thing that says which story a table is, and it names its own zone rather
 * than taking the derived one (docs/app.md §The story scores), so the columns are where the story
 * candidates come from — two score keys give two candidates rather than an ambiguity. The story ids
 * come from `PRESETS` and the zones from `ZONES`, neither restated here
 * (docs/policies.md §Vocabulary).
 *
 * Each candidate carries the view's own stability preference, so that a story the view matches is
 * the view exactly. `stab` is its own default-omitting token either way — it is never read against
 * a baseline, because the parse-side baseline is built with `stability: false` and the token layers
 * over it (docs/app.md §The story scores).
 */
function candidatesFor(v: ViewState): [Candidate, ...Candidate[]] {
  // `DEFAULT_ZONE` contributes no token: `zone=heel` parses, but writing it would be a second
  // spelling of a view that already has one.
  const zoneTokens = (z: Zone): [string, string][] => (z === DEFAULT_ZONE ? [] : [['zone', z]]);
  const rest: Candidate[] = [];
  for (const z of ZONES) {
    if (z === DEFAULT_ZONE) continue;
    rest.push({ view: { ...defaultView(), columns: defaultColumns(z) }, tokens: zoneTokens(z) });
  }
  for (const key of v.columns) {
    // Looked up in the same vocabulary `baselineFrom` validates `story=` against, rather than taken
    // straight off the score: the encoder must not write a value the parse would then drop.
    const story = PRESETS.find((preset) => preset.id === defForKey(key)?.id);
    const zone = zoneOfKey(key);
    if (!story || !zone) continue;
    rest.push({ view: applyPreset(story.id, zone, v.stability), tokens: [...zoneTokens(zone), ['story', story.id]] });
  }
  return [{ view: defaultView(), tokens: [] }, ...rest];
}

/**
 * The view written against one candidate: every field that differs from *that* baseline, after the
 * tokens naming it. Three fields are read against the baseline — the plate gate, the sort and the
 * columns — because those are the only ones any baseline sets away from the default, which is
 * asserted rather than read off `presets.ts` here (urlstate.test.ts, "has no baseline that sets a
 * field outside the three the encoding reads against it"). Everything else is default-omitting
 * exactly as it always was, which is what keeps a view carrying no shorthand byte-identical to the
 * address this app has already handed out.
 */
function encodeAgainst(v: ViewState, c: Candidate): string {
  const p = new URLSearchParams(c.tokens);
  for (const [key, b] of Object.entries(v.filters.ranges)) {
    if (b.min === undefined && b.max === undefined) continue;
    if (!finite(b.min) || !finite(b.max)) continue;
    p.set(`r.${key}`, `${b.min ?? ''}~${b.max ?? ''}`);
  }
  if (v.filters.plate?.length && v.filters.plate.join(',') !== c.view.filters.plate?.join(',')) {
    p.set('plate', v.filters.plate.join(','));
  }
  // Month granularity: the bound is always the first of a month, so the day carries no meaning.
  if (v.filters.releasedAfter) p.set('after', v.filters.releasedAfter.slice(0, 7));
  if (v.filters.brands?.length) p.set('brands', v.filters.brands.join(','));
  if (v.filters.search) p.set('q', v.filters.search);
  if (v.filters.discontinued) p.set('disc', v.filters.discontinued);
  // Written as the state holds them: the order inside a selection is the control's business, and
  // the parse keeps arrival order, so whatever the UI emits round-trips unchanged.
  for (const [slug, values] of Object.entries(v.filters.categorical)) {
    if (values.length) p.set(`c.${slug}`, values.join(','));
  }
  if (v.filters.showMissing) p.set('missing', '1');
  if (v.stability) p.set('stab', '1');
  if (v.sort.key !== c.view.sort.key || v.sort.dir !== c.view.sort.dir) {
    p.set('sort', v.sort.dir === 'desc' ? `-${v.sort.key}` : v.sort.key);
  }
  if (v.rows.length) p.set('rows', v.rows.join(','));
  // Order-sensitive, unlike the marks: `upToColumnOrder` decides whether a control is lit, where
  // this decides what a recipient sees, and a permutation of a story's columns is a column order the
  // runner chose (docs/app.md §URL encoding).
  if (v.columns.join(',') !== c.view.columns.join(',')) p.set('cols', v.columns.join(','));
  for (const [key, chosen] of Object.entries(v.generations)) {
    if (chosen !== key) p.set(`gen.${key}`, chosen);
  }
  return p.toString();
}

/**
 * The shortest of the ways this view can be written (docs/app.md §URL encoding). The default
 * baseline is always in the running and can never be inadmissible, so the result is never longer
 * than the address this app wrote before the shorthand existed.
 */
export function serializeView(v: ViewState): string {
  const [plain, ...shorthand] = candidatesFor(v);
  let best = encodeAgainst(v, plain);
  for (const c of shorthand) {
    // The one rule that drops a baseline: `plate` is default-omitting with no spelling for *absent*,
    // so a gate the view does not hold could never be cleared by a token below it. Merely differing
    // on the gate is fine — `plate=carbon` overrides it.
    if (c.view.filters.plate?.length && !v.filters.plate?.length) continue;
    const qs = encodeAgainst(v, c);
    // Strictly shorter, so a tie goes to the longhand: a tie means the shorthand bought nothing, and
    // a link that spells its columns out is the one that does not drift when a story is redefined.
    if (qs.length < best.length) best = qs;
  }
  return best;
}

/**
 * The view a link's `zone=`/`story=` shorthand names, before any longhand token layers over it —
 * `parseView`'s pre-pass, run once ahead of its own loop (docs/app.md §URL encoding). With neither
 * token present this is `defaultView()` exactly: `zone` falls back to `DEFAULT_ZONE`, which is the
 * same zone `defaultColumns` builds inside `defaultView` itself, so an address carrying no shorthand
 * still parses down to the byte it does today.
 *
 * Last occurrence wins for a duplicated key, matching every token below it: this loop assigns as it
 * iterates, so a `p.get()` read (first-wins) would disagree with the rest of `parseView`. Strict
 * rather than permissive, unlike `cols`: an unrecognised `zone` or `story` value drops that token —
 * leaving whichever valid occurrence, if any, came before it — rather than carrying it inert, because
 * a bad baseline rewrites the whole table where a bad column costs one cell
 * (docs/policies.md §State ownership and validation). The accepted values are both derived rather
 * than restated — zones from `ZONES`, story ids from `PRESETS` — for the same reason
 * (docs/policies.md §Vocabulary).
 *
 * `stability: false` here is only equivalent to omitting the argument because `applyPreset` reads it
 * for nothing but the field it assigns — asserted in presets.test.ts
 * ("applyPreset's stability argument changes nothing but stability"), not re-derived here — so the
 * `stab=1` token layering afterwards, in the loop below, reaches the same view either way.
 */
function baselineFrom(p: URLSearchParams): ViewState {
  let zone: Zone = DEFAULT_ZONE;
  let story: string | undefined;
  for (const [key, raw] of p.entries()) {
    if (key === 'zone') {
      const z = ZONES.find((candidate) => candidate === raw);
      if (z) zone = z;
    } else if (key === 'story' && PRESETS.some((preset) => preset.id === raw)) {
      story = raw;
    }
  }
  return story ? applyPreset(story, zone, false) : { ...defaultView(), columns: defaultColumns(zone) };
}

export function parseView(qs: string, idx: TestIndex): ViewState {
  const p = new URLSearchParams(qs);
  const v = baselineFrom(p);
  // Ranges take numeric keys only and sorts take every key that has an order, while columns stay
  // permissive (docs/app.md §Columns are permissive, ranges and sorts are strict). A categorical
  // column sorts by its label, and its header offers that sort, so a link has to survive it.
  const numericTest = (k: string) => {
    const test = idx.bySlug.get(k);
    return !!test && NUMERIC_TEST_TYPES.has(test.type);
  };
  const validRangeKey = (k: string) => FIELD_RANGE_KEYS.has(k) || numericTest(k);
  const validSortKey = (k: string) =>
    SORT_FIELDS.has(k) || numericTest(k) || isCategorical(idx.bySlug.get(k));
  const genRaw = new Map<string, string>();
  const facetRaw = new Map<string, string[]>();
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
    } else if (key.startsWith('c.')) {
      // Collected rather than resolved here: one selection can arrive spelled as two keys, and every
      // rule below is applied to the merged values so that none of them depends on the spelling.
      const target = key.slice(2);
      facetRaw.set(target, [...(facetRaw.get(target) ?? []), ...raw.split(',').filter(Boolean)]);
    } else if (key === 'plate' && raw) {
      // Same all-separator rule as `brands`: ",," stays absent rather than becoming an empty array.
      const picked = new Set(raw.split(','));
      const plates = PLATES.filter((x) => picked.has(x));
      if (plates.length) v.filters.plate = plates;
    } else if (key === 'after' && /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(raw)) {
      // A day-precise `after` from an older link normalises inward to the month start, which
      // widens the window rather than narrowing it — the safe direction for a filter.
      v.filters.releasedAfter = startOfMonth(raw);
    } else if (key === 'brands' && raw) {
      // an all-separator value (",,,") must stay absent, not become an empty array that no longer equals the default
      const brands = raw.split(',').filter(Boolean);
      if (brands.length) v.filters.brands = brands;
    } else if (key === 'q' && raw.trim()) {
      // The same rule the input applies, at the other door: a link replays through here, so a
      // shared `q=++` would otherwise open its recipient on an empty table with two invisible
      // characters as its only cause. Kept untrimmed, because the space between two words is part
      // of the query (docs/app.md §Filters).
      v.filters.search = raw;
    } else if (key === 'disc' && (raw === 'hide' || raw === 'only')) {
      v.filters.discontinued = raw;
    } else if (key === 'missing' && raw === '1') {
      v.filters.showMissing = true;
    } else if (key === 'stab' && raw === '1') {
      v.stability = true;
    } else if (key === 'sort') {
      const dir = raw.startsWith('-') ? 'desc' : 'asc';
      const k = raw.replace(/^-/, '');
      if (validSortKey(k)) v.sort = { key: k, dir };
    } else if (key === 'cols') {
      // `SORT_FIELDS` minus `COLUMN_FIELDS` is exactly `name` and `brand` — sortable, but rendered
      // by the table itself, so there is no cell for either to become. Derived rather than listed,
      // so a further sort-only field cannot arrive as a column by omission. Unlike every other
      // list-valued token, `cols` has no fallback when nothing survives (docs/app.md §URL encoding).
      v.columns = [...new Set(raw.split(','))].filter((c) => COLUMN_FIELDS.has(c) || idx.bySlug.has(c)
        || (!SORT_FIELDS.has(c) && c.length <= MAX_SLUG_LEN && TEST_SLUG_RE.test(c)));
    } else if (key === 'rows' && raw) {
      // A curated key is on screen anyway and offers no remove, so listing one would be a row that
      // could never be dropped — and a view that could never be default again.
      const rows = [...new Set(raw.split(',').filter(Boolean))]
        .filter((k) => validRangeKey(k) && !CURATED_RANGE_KEYS.includes(k));
      if (rows.length) v.rows = rows;
    }
  }
  // Every occurrence of a slug has been merged by here, so these rules read one selection whichever
  // way the link spelled it. Strict on the key — a slug naming no categorical test has no control to
  // untick and no cell to cost, so the token is dropped and the view falls back, the ranges posture.
  // The value is deliberately NOT strict for an option test: `data/` regenerates on a schedule, and
  // refusing a slug the catalogue has renamed would silently narrow a shared link with nothing on
  // screen saying why — the `brands` posture, for the `brands` reason.
  for (const [slug, arrived] of facetRaw) {
    const test = idx.bySlug.get(slug);
    if (!test || !isCategorical(test)) continue;
    const values = [...new Set(arrived)];
    // Arrival order is kept rather than normalised into display order, unlike `plate` two screens
    // up: a facet's display order is the catalogue's declared order, which lives in `categorical.ts`
    // and is not `parseView`'s to know. The cost is that a hand-built link can hold one selection in
    // an order clicking would not produce, so it is not `sameValue`-equal to the clicked one — no
    // preset or story binds a facet, and the first click re-emits in display order, which is why
    // this is a divergence rather than a defect.
    //
    // `true`/`false` are this app's words rather than the catalogue's, so a refresh cannot rename
    // them and they stay allowlisted. Both values collapse the key to absent: the tri-state has no
    // state that shows both, and a state no control can display is what this parse refuses.
    const kept = test.type === 'bool' ? values.filter((x) => x === 'true' || x === 'false') : values;
    if (test.type === 'bool' && kept.length !== 1) continue;
    // Nothing left stays absent rather than becoming an empty selection, which would keep
    // `isDefaultView` false forever (docs/app.md §Filters) — every list-valued token's rule.
    if (kept.length) v.filters.categorical[slug] = kept;
  }
  // A URL is the one place both generations of a pair can arrive together, so exclusion is settled
  // here rather than trusted from the caller. The current generation wins; the other is dropped.
  for (const [current, retired] of pairsOf(idx)) {
    if (genRaw.get(current) === retired) v.generations[current] = retired;
    if (v.filters.ranges[current] && v.filters.ranges[retired]) delete v.filters.ranges[retired];
    if (v.columns.includes(current) && v.columns.includes(retired)) v.columns = v.columns.filter((c) => c !== retired);
  }
  // A row on screen only because it is active must be listed, or clearing it would delete the key
  // and leave it neither active nor listed — making clear silently mean remove for exactly the rows
  // that arrived by link (docs/app.md §Filters). Safe for a story: every key a story binds is
  // curated, so `applyPreset` still round-trips with an empty list.
  for (const key of Object.keys(v.filters.ranges)) {
    if (!CURATED_RANGE_KEYS.includes(key) && !v.rows.includes(key)) v.rows.push(key);
  }
  return v;
}

/**
 * The open detail panels — what the runner is *reading*, which is not part of what they searched.
 * Deliberately not a `ViewState` field: the toolbar marks are `sameValue` comparisons of whole
 * views, so an open row in there would unmark the story the moment one was tapped
 * (docs/app.md §View and URL ownership).
 */
export function serializeOpen(open: string[]): string {
  if (!open.length) return '';
  const p = new URLSearchParams();
  p.set('open', open.join(','));
  return p.toString();
}

/**
 * The catalogue is passed in because this function's signature is free to take it — `parseView` is
 * locked to a `TestIndex` by its call sites and could never vouch for a shoe slug. So a slug that
 * has left the fleet is dropped rather than carried inert, which is the contract the rest of the
 * encoding already keeps (docs/app.md §URL encoding).
 */
export function parseOpen(qs: string, slugs: ReadonlySet<string>): string[] {
  const raw = new URLSearchParams(qs).get('open');
  if (!raw) return [];
  // The same all-separator rule `brands`, `plate` and `rows` follow: ",," is absent, not empty.
  return [...new Set(raw.split(',').filter(Boolean))].filter((slug) => slugs.has(slug));
}

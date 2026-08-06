import type { LabTest } from '../../../shared/types.js';
import { NUMERIC_TEST_TYPES } from './dataset';

/**
 * One choosable thing in the metric surface. Named `ResolvedMetric` rather than `MetricEntry`
 * because the components that render it import a `MetricRow` alongside, and a type sharing a
 * component's name is a duplicate identifier.
 */
export type ResolvedMetric =
  | { kind: 'single'; key: string; label: string; units: string; groupId: string | null; retired: boolean }
  | {
      kind: 'pair'; label: string; groupId: string | null;
      current: { key: string; units: string; generation: string; lifecycle: 'current'; retired: boolean };
      retired: { key: string; units: string; generation: string; lifecycle: 'retired'; retired: boolean };
    }
  | {
      kind: 'colocated'; label: string; groupId: string | null;
      /** `label` stays the full test name — `zone` is additive. The column picker renders `label`,
       *  and repurposing it would fill the picker with four checkboxes called "Forefoot". */
      parts: { key: string; label: string; units: string; zone: Zone | null; retired: boolean }[];
    };

export type FormalPair = Extract<ResolvedMetric, { kind: 'pair' }>;

/** Every view surface that can make one generation of a formal pair active. */
export interface GenerationEvidence {
  generations: Readonly<Record<string, string>>;
  ranges: Readonly<Record<string, unknown>>;
  rows: readonly string[];
  columns: readonly string[];
}

/**
 * The generation one formal pair presents everywhere. An explicit retired selection is the only
 * instruction stronger than active content; otherwise current content wins a hand-written
 * conflict, retired-only content selects retired, and a pair with no evidence starts current.
 */
export function effectiveGeneration(pair: FormalPair, evidence: GenerationEvidence) {
  if (evidence.generations[pair.current.key] === pair.retired.key) return pair.retired;
  const active = (key: string) => key in evidence.ranges
    || evidence.rows.includes(key)
    || evidence.columns.includes(key);
  if (active(pair.current.key)) return pair.current;
  if (active(pair.retired.key)) return pair.retired;
  return pair.current;
}

/** Which end of the shoe a reading describes, and which end the runner lands on. */
export type Zone = 'heel' | 'forefoot';
/** The two zones, in the order a runtime list of them is built — the type above has no runtime
 *  form of its own, and a second literal pair naming the same two values is a second home for one
 *  fact (docs/policies.md §Vocabulary). */
export const ZONES: readonly Zone[] = ['heel', 'forefoot'];

/**
 * Heel/forefoot pairs and the zone of each half. The catalogue links only two of these four and
 * carries no notion of zone at all, so the grouping is declared: `heel-padding-durability` has no
 * forefoot counterpart, `forefoot-traction`'s secondary is unpublished, and an upstream rename
 * must not silently regroup the sidebar (docs/app.md §Columns and sorting). Agreement with the
 * catalogue is asserted by `lineage.test.ts` rather than thrown at runtime — `metricEntries` is
 * called on partial catalogues throughout the suite, including single-half cases it must degrade
 * rather than reject, so a throwing validator would take down the app and most of its tests.
 */
export const ZONE_PAIRS = [
  { label: 'Stack', forefoot: 'forefoot-stack', heel: 'heel-stack' },
  { label: 'Energy return', forefoot: 'energy-return-forefoot', heel: 'energy-return-heel' },
  { label: 'Shock absorption', forefoot: 'shock-absorption-forefoot', heel: 'shock-absorption-heel' },
  { label: 'Midsole width', forefoot: 'midsole-width-in-the-forefoot', heel: 'midsole-width-in-the-heel' },
] as const satisfies readonly { label: string; forefoot: string; heel: string }[];

export type ZonePairLabel = (typeof ZONE_PAIRS)[number]['label'];

/**
 * Zone pairs the app computes rather than the catalogue publishes. Held apart from `ZONE_PAIRS`
 * because `metricEntries` resolves that list against the catalogue, so a key with no `LabTest`
 * behind it would drop out of the column picker — but they are zone-paired in every other sense,
 * so they follow a zone click and they name a zone. This is the one home of the score column keys:
 * `score.ts` reads them from here rather than declaring a second spelling.
 */
export const DERIVED_ZONE_PAIRS = [
  { label: 'Easy score', forefoot: 'easy-score-forefoot', heel: 'easy-score-heel' },
  { label: 'Tempo score', forefoot: 'tempo-score-forefoot', heel: 'tempo-score-heel' },
  { label: 'Race score', forefoot: 'race-score-forefoot', heel: 'race-score-heel' },
] as const satisfies readonly { label: string; forefoot: string; heel: string }[];

export type DerivedZonePairLabel = (typeof DERIVED_ZONE_PAIRS)[number]['label'];

/** Every zone pair, for code that cares only that a key has two halves. */
export const ALL_ZONE_PAIRS: readonly { label: string; forefoot: string; heel: string }[] =
  [...ZONE_PAIRS, ...DERIVED_ZONE_PAIRS];

/** The half of a declared pair that the runner's zone puts in use. */
export function zoneKey(label: ZonePairLabel, zone: Zone): string {
  return ZONE_PAIRS.find((p) => p.label === label)![zone];
}

/** As `zoneKey`, for a pair the app computes rather than the catalogue publishes. */
export function derivedZoneKey(label: DerivedZonePairLabel, zone: Zone): string {
  return DERIVED_ZONE_PAIRS.find((p) => p.label === label)![zone];
}

/**
 * The half of `slug`'s pair in `zone`, or `slug` itself when it names no zone. Deliberately
 * *not* an exchange: a view can hold both halves at once, and both must land on the same zone.
 * Computed pairs are included: a score column carries no number either, so "the Easy score" means
 * the same thing on both halves and follows the click like any other column.
 */
export function swapZone(slug: string, zone: Zone): string {
  const pair = ALL_ZONE_PAIRS.find((p) => p.forefoot === slug || p.heel === slug);
  return pair ? pair[zone] : slug;
}

/** Every key that names one half of a zone pair, and which half it is. Computed pairs count: a
 *  table showing only the Easy heel score is about the heel, and saying otherwise would leave the
 *  zone control unmarked on a view that names its zone in a column header. Lives here beside
 *  `swapZone`, which searches the same list, rather than in `zone.ts`: the score breakdown needs it
 *  too. */
const ZONE_OF_KEY = new Map<string, Zone>(
  ALL_ZONE_PAIRS.flatMap((p) => [[p.forefoot, 'forefoot'] as const, [p.heel, 'heel'] as const]));

/** The half `key` names, or null when it names no zone. Declared rather than inferred from the
 *  slug, as everything about a zone is here. */
export function zoneOfKey(key: string): Zone | null {
  return ZONE_OF_KEY.get(key) ?? null;
}

const DECLARED_BY_SLUG = new Map((ZONE_PAIRS as readonly { label: string; forefoot: string; heel: string }[])
  .flatMap((p) => [[p.forefoot, p] as const, [p.heel, p] as const]));

/**
 * The range filters the sidebar offers without being asked, **in the order it offers them**
 * (docs/app.md §Filters). Price leads because it is the bound almost every search has; then the
 * measurements a runner narrows on most; then the rest. This is **not** the set of terms the story
 * scores read — a filter row narrows a search, a term ranks one, and the two lists answer different
 * questions. Where they do coincide the row earns its place on its own: outsole durability is here
 * because "I want a shoe that lasts" is an ordinary thing to want, not because Easy weights it.
 * Both halves of every zone pair are listed, because a pair renders both rows whichever zone is
 * chosen — omitting one would make the sidebar change shape with the zone.
 * Lives here rather than in the sidebar because `parseView` needs it to tell a hand-added row from
 * a curated one, and a lib module must not import a component.
 */
export const CURATED_RANGE_KEYS = [
  'msrpGbp',
  'heel-stack', 'forefoot-stack',
  'energy-return-heel', 'energy-return-forefoot',
  'weight',
  'drop',
  'shock-absorption-heel', 'shock-absorption-forefoot',
  'outsole-durability',
  'midsole-width-in-the-heel', 'midsole-width-in-the-forefoot',
  'toebox-width-widest-part', 'toebox-width-big-toe', 'toebox-height',
];

/** The consequence shown wherever an unpaired retired method can be chosen or bounded. */
export const RETIRED_METHOD_CONSEQUENCE = 'Not used on newer shoes';

/** RunRepeat suffixes a revised method with its two-digit year. 20–29 only: a bare trailing number is a body part or a size, not a year. */
const METHOD_YEAR = /-(2\d)$/;

export function generationLabel(slug: string, lifecycle: 'current' | 'retired'): string {
  const m = METHOD_YEAR.exec(slug);
  return m ? `20${m[1]} · ${lifecycle}` : `${lifecycle} method`;
}

const isRetired = (test: LabTest): boolean => test.methodStatus === 'retired';

/**
 * Resolves the catalogue into the entries the UI offers: every numeric test appears in exactly
 * one, and a supersession or a heel/forefoot split collapses into a single choosable row.
 * Non-numeric tests are dropped — they cannot be ranged (docs/app.md §Filters).
 */
export function metricEntries(tests: LabTest[]): ResolvedMetric[] {
  const numeric = tests.filter((t) => NUMERIC_TEST_TYPES.has(t.type));
  const byId = new Map(numeric.map((t) => [t.id, t]));
  const bySlug = new Map(numeric.map((t) => [t.slug, t]));
  const at = (id: number | null): LabTest | undefined => (id === null ? undefined : byId.get(id));

  const out: ResolvedMetric[] = [];
  const claimed = new Set<number>();
  for (const t of numeric) {
    if (claimed.has(t.id)) continue;

    // The declaration is authoritative where it applies, so it is consulted before the catalogue's
    // own links: two of the four pairs are linked upstream and would otherwise be emitted
    // primary-first, under `chartLabel`, with no zone on either half.
    const declared = DECLARED_BY_SLUG.get(t.slug);
    const forefoot = declared && bySlug.get(declared.forefoot);
    const heel = declared && bySlug.get(declared.heel);
    if (declared && forefoot && heel) {
      claimed.add(forefoot.id);
      claimed.add(heel.id);
      // Neither declared-only pair has a catalogue primary and both halves share a group anyway,
      // so the heel half names the group.
      out.push({
        kind: 'colocated', label: declared.label, groupId: heel.groupId,
        parts: [zonePart(forefoot, 'forefoot'), zonePart(heel, 'heel')],
      });
      continue;
    }

    // Only previousId/updateId settle which reading is current; isNew reports false on both halves
    // of a pair (docs/scraping.md §Test lineage). A reference to an absent test degrades to a single.
    const update = at(t.updateId);
    const previous = at(t.previousId);
    const current = update ?? (previous ? t : undefined);
    const retired = update ? t : previous;
    if (current && retired) {
      claimed.add(current.id);
      claimed.add(retired.id);
      out.push({
        kind: 'pair', label: current.name, groupId: current.groupId,
        current: {
          key: current.slug, units: current.units, generation: generationLabel(current.slug, 'current'),
          lifecycle: 'current', retired: isRetired(current),
        },
        retired: {
          key: retired.slug, units: retired.units, generation: generationLabel(retired.slug, 'retired'),
          lifecycle: 'retired', retired: isRetired(retired),
        },
      });
      continue;
    }

    const primary = at(t.primaryTestId) ?? t;
    const secondaries = primary.secondaryTestIds.map(at).filter((s): s is LabTest => s !== undefined);
    if (secondaries.length) {
      const parts = [primary, ...secondaries];
      for (const p of parts) claimed.add(p.id);
      out.push({
        kind: 'colocated', label: primary.chartLabel ?? primary.name, groupId: primary.groupId,
        parts: parts.map((p) => zonePart(p, null)),
      });
      continue;
    }

    out.push({
      kind: 'single', key: t.slug, label: t.name, units: t.units, groupId: t.groupId, retired: isRetired(t),
    });
  }
  return out;
}

function zonePart(t: LabTest, zone: Zone | null) {
  return { key: t.slug, label: t.name, units: t.units, zone, retired: isRetired(t) };
}

import type { LabTest } from '../../../shared/types.js';
import { NUMERIC_TEST_TYPES } from './dataset';

/**
 * One choosable thing in the metric surface. Named `ResolvedMetric` rather than `MetricEntry`
 * because the components that render it import a `MetricRow` alongside, and a type sharing a
 * component's name is a duplicate identifier.
 */
export type ResolvedMetric =
  | { kind: 'single'; key: string; label: string; units: string; groupId: string | null }
  | {
      kind: 'pair'; label: string; groupId: string | null;
      current: { key: string; units: string; generation: string };
      retired: { key: string; units: string; generation: string };
    }
  | {
      kind: 'colocated'; label: string; groupId: string | null;
      parts: { key: string; label: string; units: string }[];
    };

/** RunRepeat suffixes a revised method with its two-digit year. 20–29 only: a bare trailing number is a body part or a size, not a year. */
const METHOD_YEAR = /-(2\d)$/;

export function generationLabel(slug: string, fallback: 'current' | 'previous'): string {
  const m = METHOD_YEAR.exec(slug);
  return m ? `20${m[1]} method` : `${fallback} method`;
}

/**
 * Resolves the catalogue into the entries the UI offers: every numeric test appears in exactly
 * one, and a supersession or a heel/forefoot split collapses into a single choosable row.
 * Non-numeric tests are dropped — they cannot be ranged (docs/app.md §Filters).
 */
export function metricEntries(tests: LabTest[]): ResolvedMetric[] {
  const numeric = tests.filter((t) => NUMERIC_TEST_TYPES.has(t.type));
  const byId = new Map(numeric.map((t) => [t.id, t]));
  const at = (id: number | null): LabTest | undefined => (id === null ? undefined : byId.get(id));

  const out: ResolvedMetric[] = [];
  const claimed = new Set<number>();
  for (const t of numeric) {
    if (claimed.has(t.id)) continue;

    // Only previousId/updateId settle which reading is current; isNew reports false on both sides
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
        current: { key: current.slug, units: current.units, generation: generationLabel(current.slug, 'current') },
        retired: { key: retired.slug, units: retired.units, generation: retiredGeneration(retired, current) },
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
        parts: parts.map((p) => ({ key: p.slug, label: p.name, units: p.units })),
      });
      continue;
    }

    out.push({ kind: 'single', key: t.slug, label: t.name, units: t.units, groupId: t.groupId });
  }
  return out;
}

/** A dated current method dates what it replaced too: the retired side is simply the original. */
function retiredGeneration(retired: LabTest, current: LabTest): string {
  if (METHOD_YEAR.test(retired.slug)) return generationLabel(retired.slug, 'previous');
  return METHOD_YEAR.test(current.slug) ? 'original' : generationLabel(retired.slug, 'previous');
}

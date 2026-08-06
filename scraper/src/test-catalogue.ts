import type { LabTest, TestsFile, TestType } from '../../shared/types.js';
import { isIdReferenceToken } from '../../shared/id-reference.js';
import { methodStatusOf } from './method-status.js';
import { PayloadError } from './page-payload.js';

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Only `option` tests declare choices, and only their English labels are kept — `config` also
 * carries per-locale translations and scoring weights, neither of which the app reads.
 */
function optionsOf(t: any): { value: string; name: string }[] | null {
  const raw = t?.config?.options;
  if (String(t?.type) !== 'option' || !Array.isArray(raw)) return null;
  const out = raw
    .filter((o: any) => typeof o?.value === 'string' && o.value !== '' && typeof o?.name === 'string')
    .map((o: any) => ({ value: String(o.value), name: String(o.name) }));
  return out.length > 0 ? out : null;
}

export function extractTestCatalogue(pageData: Record<string, any>, seedSlug: string, scrapedAt: string): TestsFile {
  const lt = pageData?.lab_tests;
  if (!lt?.tests || typeof lt.tests !== 'object') throw new PayloadError('lab_tests.tests missing');
  const groups: Record<string, string> = {};
  for (const [gid, g] of Object.entries<any>(lt.groups ?? {})) groups[gid] = String(g?.name ?? '');
  const groupOfTest = extractTestGroups(pageData);

  const tests: LabTest[] = Object.values<any>(lt.tests)
    .map((t): LabTest => {
      if (typeof t?.slug !== 'string' || !isIdReferenceToken(t.slug)) {
        throw new PayloadError(`test ${String(t?.id)} has invalid slug ${JSON.stringify(t?.slug)}`);
      }
      const slug = String(t.slug);
      const updateId = numOrNull(t.update_id);
      return {
        id: Number(t.id),
        slug,
        name: String(t.name),
        type: String(t.type) as TestType,
        units: String(t.units ?? ''),
        groupId: groupOfTest[String(Number(t.id))] ?? null,
        // The shared family name for a heel/forefoot pair ("Shock absorption"), blank on most
        // tests. It does not disambiguate a supersession — both generations carry the same one.
        chartLabel: t.chart_label ? String(t.chart_label) : null,
        isNew: t.is_new === true,
        previousId: numOrNull(t.previous_id),
        updateId,
        methodStatus: methodStatusOf({ slug, updateId }),
        primaryTestId: numOrNull(t.primary_test_id),
        secondaryTestIds: Array.isArray(t.secondary_test_ids)
          ? t.secondary_test_ids.filter((x: unknown) => typeof x === 'number')
          : [],
        options: optionsOf(t),
      };
    })
    .sort((a, b) => a.id - b.id);
  if (tests.length < 50) throw new PayloadError(`only ${tests.length} tests found (<50)`);
  return { scrapedAt, seedSlug, groups, tests };
}

/**
 * A page groups only the tests its own shoe was run for, so any single page leaves about half
 * the catalogue ungrouped. Every page carries its own map and the details crawl already fetches
 * them all, which is what makes the fleet-wide union free (docs/scraping.md §Test groups).
 */
export function extractTestGroups(pageData: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [gid, g] of Object.entries<any>(pageData?.lab_tests?.groups ?? {})) {
    for (const t of Array.isArray(g?.tests) ? g.tests : []) {
      if (typeof t?.id === 'number') out[String(t.id)] = gid;
    }
  }
  return out;
}

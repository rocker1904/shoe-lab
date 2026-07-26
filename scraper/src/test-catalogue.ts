import type { LabTest, TestsFile, TestType } from '../../shared/types.js';
import { PayloadError } from './page-payload.js';

export function extractTestCatalogue(pageData: Record<string, any>, seedSlug: string, scrapedAt: string): TestsFile {
  const lt = pageData?.lab_tests;
  if (!lt?.tests || typeof lt.tests !== 'object') throw new PayloadError('lab_tests.tests missing');
  const groups: Record<string, string> = {};
  const groupOfTest = new Map<number, string>();
  for (const [gid, g] of Object.entries<any>(lt.groups ?? {})) {
    groups[gid] = String(g?.name ?? '');
    for (const t of g?.tests ?? []) {
      if (typeof t?.id === 'number') groupOfTest.set(t.id, gid);
    }
  }
  const tests: LabTest[] = Object.values<any>(lt.tests)
    .map((t): LabTest => ({
      id: Number(t.id),
      slug: String(t.slug),
      name: String(t.name),
      type: String(t.type) as TestType,
      units: String(t.units ?? ''),
      groupId: groupOfTest.get(Number(t.id)) ?? null,
    }))
    .sort((a, b) => a.id - b.id);
  if (tests.length < 50) throw new PayloadError(`only ${tests.length} tests found (<50)`);
  return { scrapedAt, seedSlug, groups, tests };
}

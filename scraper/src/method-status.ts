import type { LabTest, MethodStatus } from '../../shared/types.js';

export const RETIRED_TEST_SLUGS: readonly string[] = [
  'outsole-hardness',
  'stiffness-in-cold',
  'difference-in-stiffness-in-cold',
];

const retiredSlugs = new Set(RETIRED_TEST_SLUGS);

export function methodStatusOf(test: Pick<LabTest, 'slug' | 'updateId'>): MethodStatus {
  return test.updateId !== null || retiredSlugs.has(test.slug) ? 'retired' : null;
}

export function validateMethodStatuses(next: LabTest[], previous?: LabTest[]): void {
  for (const test of next) {
    if (test.methodStatus !== null && test.methodStatus !== 'retired') {
      throw new Error(`${test.slug}: invalid methodStatus ${JSON.stringify(test.methodStatus)}`);
    }
    const resolved = methodStatusOf(test);
    if (test.methodStatus !== resolved) {
      throw new Error(`${test.slug}: methodStatus ${JSON.stringify(test.methodStatus)} disagrees with resolved ${JSON.stringify(resolved)}`);
    }
  }

  for (const slug of RETIRED_TEST_SLUGS) {
    const matches = next.filter((test) => test.slug === slug);
    if (matches.length !== 1) {
      throw new Error(`curated method ${slug} must resolve exactly once (found ${matches.length})`);
    }
    if (matches[0]!.updateId !== null) {
      throw new Error(`curated method ${slug} has updateId ${matches[0]!.updateId}; its registry entry is redundant`);
    }
  }

  if (!previous) return;
  const nextBySlug = new Map(next.map((test) => [test.slug, test]));
  for (const test of previous) {
    if (test.methodStatus !== 'retired') continue;
    const replacement = nextBySlug.get(test.slug);
    if (replacement && replacement.methodStatus !== 'retired') {
      throw new Error(`${test.slug}: previously published retired methodStatus was lost`);
    }
  }
}

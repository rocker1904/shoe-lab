import type { DetailRecord, DetailsFile, LabTest, MetricsFile, Plate, ReleaseYearsFile, Shoe, ShoesFile, TestsFile, Tombstone, VersionRef } from '../../shared/types.js';
import { isTombstone } from '../../shared/types.js';
import { csvLine } from './csv.js';
import { PLATE_OVERRIDES } from './plate-overrides.js';
import { REVIEW_LANGUAGE_OVERRIDES } from './review-language-overrides.js';
import { MIN_SHOES, ValidationError, validateShoesFile } from './validate.js';

const RUNNING_CATEGORY = 'running-shoes';
const CSV_TEST_TYPES = new Set(['float', 'score', 'percent', 'rating']);

// Only an explicit foreign category excludes; unknown stays in
// (docs/scraping.md §Non-running shoes).
function isRunningShoe(rec: DetailRecord | Tombstone | undefined): boolean {
  if (rec === undefined || isTombstone(rec)) return true;
  return rec.categorySlug === null || rec.categorySlug === RUNNING_CATEGORY;
}

export function plateFromRules(features: string[], hasPlateSection: boolean): Plate {
  if (features.some((f) => /carbon plate/i.test(f))) return 'carbon';
  if (hasPlateSection) return 'plated-other';
  return 'none';
}

export function derivePlate(slug: string, features: string[], hasPlateSection: boolean): Plate {
  return PLATE_OVERRIDES[slug]?.plate ?? plateFromRules(features, hasPlateSection);
}

/**
 * Inverts the fleet's `previousVersion` links. RunRepeat's own forward pointer (`last_version`)
 * names the *newest* model in the line and skips generations, so the direct successor is
 * derived here instead. Slug order makes the first claimant win deterministically if two shoes
 * ever name the same predecessor (docs/scraping.md §Model lineage).
 */
export function inverseVersionLinks(shoes: Array<{ slug: string; name: string; previousVersion: VersionRef | null }>): Map<string, VersionRef> {
  const next = new Map<string, VersionRef>();
  for (const s of shoes) {
    const prev = s.previousVersion?.slug;
    if (prev !== undefined && !next.has(prev)) next.set(prev, { slug: s.slug, name: s.name });
  }
  return next;
}

/**
 * A test with no reading anywhere is dropped from the published catalogue rather than skipped at
 * fetch time, so it returns by itself the moment RunRepeat runs it again
 * (docs/scraping.md §Empty tests).
 */
function publishedTests(tests: LabTest[], shoes: Shoe[], testGroups: Record<string, string> | undefined): LabTest[] {
  const populated = new Set<string>();
  for (const s of shoes) for (const id of Object.keys(s.values)) populated.add(id);
  return tests
    .filter((t) => populated.has(String(t.id)))
    .map((t) => ({ ...t, groupId: t.groupId ?? testGroups?.[String(t.id)] ?? null }));
}

// `releaseYears` deliberately does not feed builtAt (docs/scraping.md §Determinism).
export function buildDataset(tests: TestsFile, metrics: MetricsFile, details: DetailsFile, releaseYears?: ReleaseYearsFile): { shoesFile: ShoesFile; csv: string; ruleDerived: Map<string, Plate> } {
  let builtAt = metrics.scrapedAt;
  for (const rec of Object.values(details.shoes)) {
    if (rec.scrapedAt > builtAt) builtAt = rec.scrapedAt;
  }

  // Populated inside the map, so it covers the surviving fleet only: an override naming a
  // category-excluded shoe is genuinely stale and the gate should say so
  // (docs/scraping.md §Decisions).
  const ruleDerived = new Map<string, Plate>();
  const shoes: Shoe[] = Object.keys(metrics.shoes).sort().filter((slug) => isRunningShoe(details.shoes[slug])).map((slug) => {
    const m = metrics.shoes[slug]!;
    const rec = details.shoes[slug];
    const det = rec && !isTombstone(rec) ? rec : null;
    const features = det?.features ?? [];
    ruleDerived.set(slug, plateFromRules(features, det?.hasPlateSection === true));
    const year = releaseYears?.years[slug];
    const pageDate = det?.releasedAt ?? null;
    const releasedAt = pageDate ?? (year === undefined ? null : `${year}-01-01`);
    // Provenance rather than a precision flag: a boolean could not tell RunRepeat's own estimate
    // apart from a year we materialised ourselves, and only the second is fiction
    // (docs/scraping.md §Release-date provenance).
    const releaseDateSource = pageDate !== null
      ? (det!.preciseReleaseDate ? 'page' as const : 'page-estimated' as const)
      : (releasedAt === null ? null : 'listing' as const);
    return {
      slug,
      name: det?.name ?? m.name,
      brand: det?.brand ?? null,
      url: det?.runrepeatUrl ?? m.url,
      releasedAt,
      releaseDateSource,
      score: det?.score ?? null,
      msrpGbp: det?.msrpGbp ?? null,
      discontinued: det?.discontinued ?? false,
      plate: derivePlate(slug, features, det?.hasPlateSection === true),
      imageUrl: det?.imageUrl ?? null,
      values: m.values,
      details: det ? {
        pros: det.pros, cons: det.cons, intro: det.intro,
        whoShouldBuy: det.whoShouldBuy, whoShouldNotBuy: det.whoShouldNotBuy, features: det.features,
      } : null,
      facts: det?.facts ?? {},
      previousVersion: det?.previousVersion ?? null,
      nextVersion: null, // filled by inversion once the whole fleet is known
      latestVersion: det?.latestVersion ?? null,
      reviewLanguage: REVIEW_LANGUAGE_OVERRIDES[slug]?.language ?? null,
    };
  });

  // A renamed category would otherwise exclude the whole catalogue silently.
  if (shoes.length < MIN_SHOES) {
    throw new ValidationError(`only ${shoes.length} shoes left after category exclusion (<${MIN_SHOES})`);
  }

  const nextVersions = inverseVersionLinks(shoes);
  for (const s of shoes) s.nextVersion = nextVersions.get(s.slug) ?? null;

  const published = publishedTests(tests.tests, shoes, details.testGroups);
  const shoesFile: ShoesFile = { builtAt, source: 'RunRepeat', groups: tests.groups, tests: published, shoes };
  validateShoesFile(shoesFile);

  const csvTests = published.filter((t) => CSV_TEST_TYPES.has(t.type)).sort((a, b) => a.id - b.id);
  const header = ['slug', 'name', 'brand', 'releasedAt', 'releaseDateSource', 'score', 'msrpGbp', 'plate', 'discontinued', ...csvTests.map((t) => t.slug)];
  const lines = [csvLine(header)];
  for (const s of shoes) {
    lines.push(csvLine([
      s.slug, s.name, s.brand, s.releasedAt, s.releaseDateSource, s.score, s.msrpGbp, s.plate, s.discontinued,
      ...csvTests.map((t) => s.values[String(t.id)]),
    ]));
  }
  return { shoesFile, csv: lines.join('\n') + '\n', ruleDerived };
}

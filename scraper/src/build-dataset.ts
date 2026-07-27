import type { DetailRecord, DetailsFile, MetricsFile, Plate, ReleaseYearsFile, Shoe, ShoesFile, TestsFile, Tombstone } from '../../shared/types.js';
import { isTombstone } from '../../shared/types.js';
import { csvLine } from './csv.js';
import { PLATE_OVERRIDES } from './plate-overrides.js';
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
    const releasedAt = det?.releasedAt ?? (year === undefined ? null : `${year}-01-01`);
    return {
      slug,
      name: det?.name ?? m.name,
      brand: det?.brand ?? null,
      url: det?.runrepeatUrl ?? m.url,
      releasedAt,
      preciseReleaseDate: det?.releasedAt != null && det.preciseReleaseDate,
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
    };
  });

  // A renamed category would otherwise exclude the whole catalogue silently.
  if (shoes.length < MIN_SHOES) {
    throw new ValidationError(`only ${shoes.length} shoes left after category exclusion (<${MIN_SHOES})`);
  }

  const shoesFile: ShoesFile = { builtAt, source: 'RunRepeat', groups: tests.groups, tests: tests.tests, shoes };
  validateShoesFile(shoesFile);

  const csvTests = tests.tests.filter((t) => CSV_TEST_TYPES.has(t.type)).sort((a, b) => a.id - b.id);
  const header = ['slug', 'name', 'brand', 'releasedAt', 'score', 'msrpGbp', 'plate', 'discontinued', ...csvTests.map((t) => t.slug)];
  const lines = [csvLine(header)];
  for (const s of shoes) {
    lines.push(csvLine([
      s.slug, s.name, s.brand, s.releasedAt, s.score, s.msrpGbp, s.plate, s.discontinued,
      ...csvTests.map((t) => s.values[String(t.id)]),
    ]));
  }
  return { shoesFile, csv: lines.join('\n') + '\n', ruleDerived };
}

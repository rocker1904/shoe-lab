import type { DetailsFile, MetricsFile, MetricValue, Plate, Shoe, ShoesFile, TestsFile } from '../../shared/types.js';
import { isTombstone } from '../../shared/types.js';
import { csvLine } from './csv.js';
import { validateShoesFile } from './validate.js';

export const PLATE_TEST_ID = '69';
const CSV_TEST_TYPES = new Set(['float', 'score', 'percent', 'rating']);

export function derivePlate(features: string[], plateTestValue: MetricValue | undefined): Plate {
  if (features.some((f) => /carbon plate/i.test(f))) return 'carbon';
  if (plateTestValue === true || features.some((f) => /plate/i.test(f))) return 'plated-other';
  return 'none';
}

export function buildDataset(tests: TestsFile, metrics: MetricsFile, details: DetailsFile): { shoesFile: ShoesFile; csv: string } {
  let builtAt = metrics.scrapedAt;
  for (const rec of Object.values(details.shoes)) {
    if (rec.scrapedAt > builtAt) builtAt = rec.scrapedAt;
  }

  const shoes: Shoe[] = Object.keys(metrics.shoes).sort().map((slug) => {
    const m = metrics.shoes[slug]!;
    const rec = details.shoes[slug];
    const det = rec && !isTombstone(rec) ? rec : null;
    const features = det?.features ?? [];
    return {
      slug,
      name: det?.name ?? m.name,
      brand: det?.brand ?? null,
      url: det?.runrepeatUrl ?? m.url,
      releasedAt: det?.releasedAt ?? null,
      score: det?.score ?? null,
      msrpGbp: det?.msrpGbp ?? null,
      discontinued: det?.discontinued ?? false,
      plate: derivePlate(features, m.values[PLATE_TEST_ID]),
      imageUrl: det?.imageUrl ?? null,
      values: m.values,
      details: det ? {
        pros: det.pros, cons: det.cons, intro: det.intro,
        whoShouldBuy: det.whoShouldBuy, whoShouldNotBuy: det.whoShouldNotBuy, features: det.features,
      } : null,
    };
  });

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
  return { shoesFile, csv: lines.join('\n') + '\n' };
}

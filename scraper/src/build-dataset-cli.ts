import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetailsFile, MetricsFile, ReleaseYearsFile, TestsFile } from '../../shared/types.js';
import { buildDataset } from './build-dataset.js';
import { dataDir } from './data-files.js';
import { parseCuratedDates, validateCuratedDates } from './curated-dates.js';
import { validatePlateOverrides } from './validate.js';

const dirPath = fileURLToPath(new URL('../../data', import.meta.url));
const dir = dataDir(dirPath);
try {
  const tests = dir.read<TestsFile>('tests.json');
  const metrics = dir.read<MetricsFile>('metrics.json');
  if (!tests || !metrics) throw new Error('tests.json/metrics.json missing — run scrape:metrics first');
  const details = dir.read<DetailsFile>('details.json') ?? { shoes: {} };
  const releaseYears = dir.read<ReleaseYearsFile>('release-years.json') ?? undefined;
  // Hand-curated months live outside data/ because data/ is machine-generated and must not be
  // hand-edited (docs/decisions.md §Git is the database). Absent is fine: the file is optional.
  const curatedPath = fileURLToPath(new URL('../../curated/release-dates.jsonl', import.meta.url));
  const curated = existsSync(curatedPath) ? parseCuratedDates(readFileSync(curatedPath, 'utf8')) : new Map<string, string>();
  const { shoesFile, csv, ruleDerived, pageDated } = buildDataset(tests, metrics, details, releaseYears, curated);
  validatePlateOverrides(ruleDerived);
  validateCuratedDates(curated, pageDated);
  dir.write('shoes.json', shoesFile);
  writeFileSync(join(dirPath, 'shoes.csv'), csv);
  console.error(`ok: ${shoesFile.shoes.length} shoes`);
} catch (e) {
  console.error(e);
  process.exit(1);
}

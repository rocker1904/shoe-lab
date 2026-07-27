import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetailsFile, MetricsFile, ReleaseYearsFile, TestsFile } from '../../shared/types.js';
import { buildDataset } from './build-dataset.js';
import { dataDir } from './data-files.js';
import { validatePlateOverrides } from './validate.js';

const dirPath = fileURLToPath(new URL('../../data', import.meta.url));
const dir = dataDir(dirPath);
try {
  const tests = dir.read<TestsFile>('tests.json');
  const metrics = dir.read<MetricsFile>('metrics.json');
  if (!tests || !metrics) throw new Error('tests.json/metrics.json missing — run scrape:metrics first');
  const details = dir.read<DetailsFile>('details.json') ?? { shoes: {} };
  const releaseYears = dir.read<ReleaseYearsFile>('release-years.json') ?? undefined;
  const { shoesFile, csv, ruleDerived } = buildDataset(tests, metrics, details, releaseYears);
  validatePlateOverrides(ruleDerived);
  dir.write('shoes.json', shoesFile);
  writeFileSync(join(dirPath, 'shoes.csv'), csv);
  console.error(`ok: ${shoesFile.shoes.length} shoes`);
} catch (e) {
  console.error(e);
  process.exit(1);
}

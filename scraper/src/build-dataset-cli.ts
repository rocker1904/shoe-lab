import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetailsFile, MetricsFile, TestsFile } from '../../shared/types.js';
import { buildDataset } from './build-dataset.js';
import { dataDir } from './data-files.js';

const dirPath = fileURLToPath(new URL('../../data', import.meta.url));
const dir = dataDir(dirPath);
try {
  const tests = dir.read<TestsFile>('tests.json');
  const metrics = dir.read<MetricsFile>('metrics.json');
  if (!tests || !metrics) throw new Error('tests.json/metrics.json missing — run scrape:metrics first');
  const details = dir.read<DetailsFile>('details.json') ?? { shoes: {} };
  const { shoesFile, csv } = buildDataset(tests, metrics, details);
  dir.write('shoes.json', shoesFile);
  writeFileSync(join(dirPath, 'shoes.csv'), csv);
  console.error(`ok: ${shoesFile.shoes.length} shoes`);
} catch (e) {
  console.error(e);
  process.exit(1);
}

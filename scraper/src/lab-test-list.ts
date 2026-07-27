import type { LabTest, MetricValue } from '../../shared/types.js';
import { coerceValue, isEmptyValue } from './coerce.js';
import { PayloadError } from './page-payload.js';
import { slugFromUrl } from './slug.js';

export interface LabTestRow { name: string; url: string; value: MetricValue }

export function parseLabTestList(json: unknown, test: LabTest): Map<string, LabTestRow> {
  const rows = (json as any)?.rows;
  if (!Array.isArray(rows)) throw new PayloadError(`lab-test-list ${test.id}: rows missing`);
  const out = new Map<string, LabTestRow>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) throw new PayloadError(`lab-test-list ${test.id}: malformed row`);
    const [valCell, nameCell] = row as [any, any];
    const url = nameCell?.url;
    // The order of these three skips is load-bearing
    // (docs/scraping.md §Empty values are skipped before duplicates are resolved).
    if (typeof url !== 'string' || url === '') continue;
    if (isEmptyValue(valCell?.value)) continue;
    const slug = slugFromUrl(url);
    if (out.has(slug)) continue;
    out.set(slug, { name: String(nameCell?.text ?? slug), url, value: coerceValue(valCell.value, test.type) });
  }
  return out;
}

import type { Shoe } from '../../../shared/types.js';
import { numericValue, reviewUrl, type TestIndex } from './dataset';
import type { ScoreColumns } from './score';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cell(shoe: Shoe, col: string, idx: TestIndex, scores?: ScoreColumns): unknown {
  // Synthetic: a score depends on the view, so it arrives resolved under the column it fills, and an
  // unscored shoe leaves an empty cell rather than a zero, which would read as the worst in the fleet.
  const resolved = scores?.get(col);
  if (resolved) return resolved.get(shoe.slug);
  if (col === 'plate') return shoe.plate;
  if (col === 'releasedAt') return shoe.releasedAt;
  if (col === 'releaseDateSource') return shoe.releaseDateSource;
  if (col === 'name') return shoe.name;
  if (col === 'brand') return shoe.brand;
  const n = numericValue(shoe, col, idx);
  if (n !== undefined) return n;
  const test = idx.bySlug.get(col);
  return test ? shoe.values[String(test.id)] : undefined;
}

/**
 * `url` sits with the identity columns rather than among the chosen ones, and is emitted whatever
 * the view holds: this is a data export, not a rendering (docs/app.md §Number display), and a row
 * that has left the app has no other way back to the page its numbers came from.
 */
export function exportCsv(
  shoes: Shoe[], columns: string[], idx: TestIndex, scores?: ScoreColumns,
): string {
  // Provenance rides beside the date it qualifies rather than always: a source column with no
  // date column would be noise (docs/app.md §Release-date provenance).
  const withSource = columns.flatMap((c) => (c === 'releasedAt' ? [c, 'releaseDateSource'] : [c]));
  const header = ['slug', 'name', 'brand', 'url', ...withSource];
  const lines = [header.map(esc).join(',')];
  for (const s of shoes) {
    lines.push([s.slug, s.name, s.brand, reviewUrl(s.slug),
                ...withSource.map((c) => cell(s, c, idx, scores))].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

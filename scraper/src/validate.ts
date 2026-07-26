import type { DetailRecord, MetricsFile, ShoesFile, TestsFile, Tombstone } from '../../shared/types.js';
import { isTombstone } from '../../shared/types.js';

export class ValidationError extends Error {}

const NUMERIC = new Set(['float', 'score', 'percent', 'rating']);

export function validateMetrics(next: MetricsFile, prev: MetricsFile | null, tests: TestsFile): void {
  const count = Object.keys(next.shoes).length;
  if (count < 300) throw new ValidationError(`only ${count} shoes (<300)`);
  if (tests.tests.length < 50) throw new ValidationError(`only ${tests.tests.length} tests (<50)`);
  const typeOf = new Map(tests.tests.map((t) => [String(t.id), t.type]));
  for (const [slug, shoe] of Object.entries(next.shoes)) {
    for (const [testId, value] of Object.entries(shoe.values)) {
      const t = typeOf.get(testId);
      if (!t) throw new ValidationError(`${slug}: value for unknown test ${testId}`);
      const ok = NUMERIC.has(t) ? typeof value === 'number'
        : t === 'bool' ? typeof value === 'boolean'
        : typeof value === 'string';
      if (!ok) throw new ValidationError(`${slug}: test ${testId} has ${typeof value}, expected ${t}`);
    }
  }
  if (prev) {
    const prevCount = Object.keys(prev.shoes).length;
    if (prevCount > 0 && count < prevCount * 0.9) {
      throw new ValidationError(`shoe count shrank ${prevCount} -> ${count}`);
    }
    let prevPairs = 0;
    let vanished = 0;
    for (const [slug, shoe] of Object.entries(prev.shoes)) {
      for (const testId of Object.keys(shoe.values)) {
        prevPairs++;
        if (next.shoes[slug]?.values[testId] === undefined) vanished++;
      }
    }
    if (prevPairs > 0 && vanished / prevPairs > 0.2) {
      throw new ValidationError(`${vanished}/${prevPairs} (slug,test) pairs vanished (>20%)`);
    }
  }
}

export function validateDetailsRecord(rec: DetailRecord | Tombstone, slug: string): void {
  if (isTombstone(rec)) return;
  if (!rec.name) throw new ValidationError(`${slug}: empty name`);
  if (!Number.isInteger(rec.productId) || rec.productId <= 0) throw new ValidationError(`${slug}: bad productId`);
}

const PLATES = new Set(['carbon', 'plated-other', 'none']);

export function validateShoesFile(f: ShoesFile): void {
  if (!f.builtAt) throw new ValidationError('builtAt missing');
  if (!Array.isArray(f.tests) || !Array.isArray(f.shoes)) throw new ValidationError('tests/shoes must be arrays');
  for (const s of f.shoes) {
    if (!s.slug || !s.name) throw new ValidationError(`shoe missing slug/name: ${JSON.stringify(s.slug)}`);
    if (!s.values || typeof s.values !== 'object') throw new ValidationError(`${s.slug}: values missing`);
    if (!PLATES.has(s.plate)) throw new ValidationError(`${s.slug}: bad plate ${String(s.plate)}`);
  }
}

import type { MetricValue, TestType } from '../../shared/types.js';

export class CoercionError extends Error {}

export const METRIC_TYPES: ReadonlySet<TestType> = new Set(['float', 'score', 'percent', 'rating', 'bool']);

export function isEmptyValue(raw: unknown): boolean {
  return raw === null || raw === undefined || raw === '';
}

export function coerceValue(raw: unknown, type: TestType): MetricValue {
  switch (type) {
    case 'float':
    case 'score':
    case 'percent':
    case 'rating': {
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) throw new CoercionError(`not a number: ${String(raw)}`);
        return raw;
      }
      const s = String(raw).trim();
      // `s === ''` is not redundant: it catches whitespace-only, which `Number()` would read as 0
      // (docs/scraping.md §Whitespace-only numerics are rejected, not zeroed).
      if (isEmptyValue(raw) || s === '') throw new CoercionError(`not a number: ${String(raw)}`);
      const n = Number(s);
      if (!Number.isFinite(n)) throw new CoercionError(`not a number: ${String(raw)}`);
      return n;
    }
    case 'bool': {
      if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
      if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
      throw new CoercionError(`not a bool: ${String(raw)}`);
    }
    case 'option':
    case 'text':
      return String(raw);
  }
}

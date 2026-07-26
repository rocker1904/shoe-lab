const WRAPPERS = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef']);
// Index values per upstream devalue 5.1.1 src/constants.js:
// UNDEFINED -1, HOLE -2, NAN -3, POSITIVE_INFINITY -4, NEGATIVE_INFINITY -5, NEGATIVE_ZERO -6.
// A HOLE is a sparse-array gap, which reads back as undefined.
const SPECIALS = new Map<number, unknown>([
  [-1, undefined],
  [-2, undefined],
  [-3, NaN],
  [-4, Infinity],
  [-5, -Infinity],
  [-6, -0],
]);

export class DevalueError extends Error {}

export function decodeDevalue(payload: unknown[]): unknown {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new DevalueError('payload must be a non-empty array');
  }
  const memo = new Map<number, unknown>();
  const resolving = new Set<number>();

  const resolve = (idx: unknown): unknown => {
    if (typeof idx !== 'number' || !Number.isInteger(idx)) {
      throw new DevalueError(`invalid index: ${String(idx)}`);
    }
    if (idx < 0) {
      if (SPECIALS.has(idx)) return SPECIALS.get(idx);
      throw new DevalueError(`unknown special index ${idx}`);
    }
    if (idx >= payload.length) throw new DevalueError(`index ${idx} out of range`);
    if (memo.has(idx)) return memo.get(idx);
    if (resolving.has(idx)) throw new DevalueError(`cycle at index ${idx}`);
    resolving.add(idx);
    const v = payload[idx];
    let out: unknown;
    if (Array.isArray(v)) {
      const tag = v[0];
      if (v.length === 2 && typeof tag === 'string' && WRAPPERS.has(tag)) {
        out = resolve(v[1]);
      } else if (tag === 'Set') {
        out = v.slice(1).map((i) => resolve(i));
      } else if (tag === 'Map') {
        const m: Record<string, unknown> = {};
        for (let i = 1; i + 1 < v.length; i += 2) m[String(resolve(v[i]))] = resolve(v[i + 1]);
        out = m;
      } else if (tag === 'Date' && v.length === 2 && typeof v[1] === 'string') {
        out = v[1];
      } else {
        out = v.map((i) => resolve(i));
      }
    } else if (v && typeof v === 'object') {
      out = Object.fromEntries(Object.entries(v).map(([k, i]) => [k, resolve(i)]));
    } else {
      out = v;
    }
    resolving.delete(idx);
    memo.set(idx, out);
    return out;
  };

  return resolve(0);
}

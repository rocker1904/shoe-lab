import { describe, expect, it } from 'vitest';
import { decodeDevalue, DevalueError } from '../src/devalue.js';

describe('decodeDevalue', () => {
  it('resolves objects, arrays and literals', () => {
    // root {a: "x", b: [1, true]}
    const payload = [{ a: 1, b: 2 }, 'x', [3, 4], 1, true];
    expect(decodeDevalue(payload)).toEqual({ a: 'x', b: [1, true] });
  });
  it('unwraps all six wrapper kinds, nested', () => {
    for (const w of ['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef']) {
      const payload = [[w, 1], ['ShallowReactive', 2], { v: 3 }, 42];
      expect(decodeDevalue(payload)).toEqual({ v: 42 });
    }
  });
  it('handles Set, Map, Date markers', () => {
    const payload = [{ s: 1, m: 3, d: 6 }, ['Set', 2], 'a', ['Map', 4, 5], 'k', 9, ['Date', '2026-01-01T00:00:00Z']];
    expect(decodeDevalue(payload)).toEqual({ s: ['a'], m: { k: 9 }, d: '2026-01-01T00:00:00Z' });
  });
  it('maps negative special indices', () => {
    const payload = [{ u: -1, n: -2, p: -3, m: -4, z: -5 }];
    const out = decodeDevalue(payload) as Record<string, unknown>;
    expect(out.u).toBeUndefined();
    expect(out.n).toBeNaN();
    expect(out.p).toBe(Infinity);
    expect(out.m).toBe(-Infinity);
    expect(Object.is(out.z, -0)).toBe(true);
  });
  it('throws DevalueError on cycles, bad indices, empty payload', () => {
    expect(() => decodeDevalue([{ self: 0 }])).toThrow(DevalueError);
    expect(() => decodeDevalue([{ a: 99 }])).toThrow(DevalueError);
    expect(() => decodeDevalue([{ a: -6 }])).toThrow(DevalueError);
    expect(() => decodeDevalue([])).toThrow(DevalueError);
    expect(() => decodeDevalue([{ a: 'nope' as unknown as number }])).toThrow(DevalueError);
  });
  it('memoises shared references', () => {
    const payload = [{ x: 1, y: 1 }, { deep: 2 }, 'v'];
    const out = decodeDevalue(payload) as { x: object; y: object };
    expect(out.x).toEqual({ deep: 'v' });
    expect(out.y).toEqual(out.x);
  });
});

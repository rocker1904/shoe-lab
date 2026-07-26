import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical.js';

describe('canonicalJson', () => {
  it('sorts keys recursively and pretty-prints', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } })).toBe(
      JSON.stringify({ a: { c: 3, d: [2, { y: 2, z: 1 }] }, b: 1 }, null, 2) + '\n',
    );
  });
  it('is byte-stable across key insertion order', () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
  it('preserves arrays order and primitives', () => {
    expect(canonicalJson([3, 1, null, 'x'])).toBe(JSON.stringify([3, 1, null, 'x'], null, 2) + '\n');
  });
});

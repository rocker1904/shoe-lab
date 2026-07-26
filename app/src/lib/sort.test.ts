import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { sortShoes } from './sort';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);
const slugs = (arr: { slug: string }[]) => arr.map((s) => s.slug);

describe('sortShoes', () => {
  it('sorts numeric asc/desc with missing always last', () => {
    expect(slugs(sortShoes(FLEET, { key: 'heel-stack', dir: 'desc' }, idx))).toEqual(['cushy', 'racer', 'trainer', 'oldie', 'mystery']);
    expect(slugs(sortShoes(FLEET, { key: 'heel-stack', dir: 'asc' }, idx))).toEqual(['oldie', 'trainer', 'racer', 'cushy', 'mystery']);
  });
  it('sorts strings and dates', () => {
    expect(slugs(sortShoes(FLEET, { key: 'name', dir: 'asc' }, idx))[0]).toBe('cushy');
    expect(slugs(sortShoes(FLEET, { key: 'releasedAt', dir: 'desc' }, idx))[0]).toBe('racer');
    expect(slugs(sortShoes(FLEET, { key: 'releasedAt', dir: 'asc' }, idx)).at(-1)).toBe('mystery'); // null last even ascending
  });
  it('breaks ties by score desc and is stable', () => {
    const a = shoe({ slug: 'a', values: { '6': 35 }, score: 95 });
    const b = shoe({ slug: 'b', values: { '6': 35 }, score: 60 });
    expect(slugs(sortShoes([b, a], { key: 'heel-stack', dir: 'asc' }, idx))).toEqual(['a', 'b']);
  });
  it('does not mutate input', () => {
    const input = [...FLEET];
    sortShoes(input, { key: 'score', dir: 'desc' }, idx);
    expect(input.map((s) => s.slug)).toEqual(FLEET.map((s) => s.slug));
  });
});

describe('sortShoes edge cases', () => {
  it('handles empty and single-element input', () => {
    expect(sortShoes([], { key: 'score', dir: 'asc' }, idx)).toEqual([]);
    expect(slugs(sortShoes([FLEET[0]!], { key: 'nope', dir: 'asc' }, idx))).toEqual(['cushy']);
  });
  it('falls back to score desc when the key resolves for nobody', () => {
    expect(slugs(sortShoes(FLEET, { key: 'nope', dir: 'asc' }, idx)))
      .toEqual(['cushy', 'racer', 'trainer', 'oldie', 'mystery']); // unscored shoe last
  });
  it('breaks ties by score desc in descending sorts too', () => {
    const a = shoe({ slug: 'a', values: { '6': 35 }, score: 60 });
    const b = shoe({ slug: 'b', values: { '6': 35 }, score: 95 });
    expect(slugs(sortShoes([a, b], { key: 'heel-stack', dir: 'desc' }, idx))).toEqual(['b', 'a']);
  });
  it('sorts by price with equal prices tie-broken by score and unpriced shoes last', () => {
    expect(slugs(sortShoes(FLEET, { key: 'msrpGbp', dir: 'asc' }, idx)))
      .toEqual(['cushy', 'trainer', 'oldie', 'racer', 'mystery']);
  });
  it('puts shoes with no brand last, either direction', () => {
    const anon = shoe({ slug: 'anon', brand: null });
    expect(slugs(sortShoes([anon, FLEET[3]!, FLEET[0]!], { key: 'brand', dir: 'asc' }, idx)))
      .toEqual(['cushy', 'oldie', 'anon']);
    expect(slugs(sortShoes([anon, FLEET[3]!, FLEET[0]!], { key: 'brand', dir: 'desc' }, idx)))
      .toEqual(['oldie', 'cushy', 'anon']);
  });
  it('compares names case-insensitively', () => {
    // Raw ASCII would sort every capitalised name ahead of every lowercase one.
    const upper = shoe({ slug: 'zoom', name: 'Zoom Fly' });
    const lower = shoe({ slug: 'adidas', name: 'adidas Boston' });
    expect(slugs(sortShoes([upper, lower], { key: 'name', dir: 'asc' }, idx))).toEqual(['adidas', 'zoom']);
  });
});

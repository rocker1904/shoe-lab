import { describe, expect, it } from 'vitest';
import { slugFromUrl } from '../src/slug.js';

describe('slugFromUrl', () => {
  it.each([
    ['https://runrepeat.com/merrell-vapor-glove-6', 'merrell-vapor-glove-6'],
    ['https://runrepeat.com/uk/saucony-endorphin-azura', 'saucony-endorphin-azura'],
    ['https://runrepeat.com/es/some-shoe/', 'some-shoe'],
    ['/uk/nike-pegasus-41', 'nike-pegasus-41'],
    ['nike-pegasus-41', 'nike-pegasus-41'],
  ])('%s -> %s', (url, want) => expect(slugFromUrl(url)).toBe(want));
  it('throws on empty', () => {
    expect(() => slugFromUrl('https://runrepeat.com/')).toThrow();
    expect(() => slugFromUrl('')).toThrow();
  });
});

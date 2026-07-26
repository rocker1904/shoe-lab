import { describe, expect, it } from 'vitest';
import { csvEscape, csvLine } from '../src/csv.js';

describe('csv', () => {
  it('escapes commas, quotes, newlines; passes plain values through', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
    expect(csvEscape(32.7)).toBe('32.7');
    expect(csvEscape(true)).toBe('true');
    expect(csvEscape('naïve ünïcode')).toBe('naïve ünïcode');
  });
  it('joins lines', () => {
    expect(csvLine(['a', 1, null, 'x,y'])).toBe('a,1,,"x,y"');
  });
});

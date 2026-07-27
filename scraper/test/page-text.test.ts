import { describe, expect, it } from 'vitest';
import { decodeEntities, factValues } from '../src/page-text.js';

describe('decodeEntities', () => {
  it('decodes the named entities RunRepeat actually emits', () => {
    expect(decodeEntities('we&rsquo;ve tested')).toBe('we’ve tested');
    expect(decodeEntities('category&mdash;but the price')).toBe('category—but the price');
    expect(decodeEntities('wet &amp; dry tarmac')).toBe('wet & dry tarmac');
    expect(decodeEntities('d&eacute;j&agrave; vu')).toBe('déjà vu');
    expect(decodeEntities('una evoluci&oacute;n sutil')).toBe('una evolución sutil');
    expect(decodeEntities('&ldquo;quoted&rdquo;')).toBe('“quoted”');
    // Spelled by code point: a literal U+00A0 here would make the assertion pass vacuously
    expect(decodeEntities('a&nbsp;b')).toBe(`a${String.fromCodePoint(32)}b`);
  });
  it('decodes numeric entities in both bases', () => {
    expect(decodeEntities('it&#39;s &#x2014; here')).toBe("it's — here");
    expect(decodeEntities('&#8217;')).toBe('’');
  });
  it('decodes each entity exactly once, so escaped markup stays escaped', () => {
    // `&amp;lt;` is a literal "&lt;" in the source text; decoding twice would forge a tag
    expect(decodeEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(decodeEntities('&lt;b&gt;')).toBe('<b>');
  });
  it('leaves unknown and malformed entities untouched', () => {
    expect(decodeEntities('50 &widget; and Q&A')).toBe('50 &widget; and Q&A');
    expect(decodeEntities('&#xZZ;')).toBe('&#xZZ;');
    expect(decodeEntities('bare & ampersand')).toBe('bare & ampersand');
  });
  it('rejects out-of-range code points rather than throwing', () => {
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;');
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
  });
  it('passes through text with nothing to decode', () => {
    expect(decodeEntities('plain text')).toBe('plain text');
    expect(decodeEntities('')).toBe('');
  });
});

// A fact value's `text` is a string on some facts and an array of link objects on others
// (docs/scraping.md §Fact values). `String(v.text)` on the array shape yielded "[object Object]".
describe('factValues', () => {
  it('reads the flat string shape', () => {
    expect(factValues([{ slug: 'road', text: 'Road' }])).toEqual([{ slug: 'road', text: 'Road' }]);
  });
  it('flattens the nested link-array shape onto its own slugs', () => {
    const nested = [{ slug: 'pace', text: [{ slug: 'daily-running', text: 'Daily running' }, { slug: 'tempo', text: 'Tempo' }] }];
    expect(factValues(nested)).toEqual([
      { slug: 'daily-running', text: 'Daily running' },
      { slug: 'tempo', text: 'Tempo' },
    ]);
  });
  it('never yields "[object Object]" for any shape', () => {
    const shapes = [{ text: {} }, { text: [{}] }, { text: [1, 2] }, { text: 42 }, { text: null }, {}, null];
    for (const v of factValues(shapes)) expect(v.text).not.toContain('[object');
  });
  it('decodes entities and drops empty text', () => {
    expect(factValues([{ slug: 'a', text: 'Wet &amp; dry' }, { slug: 'b', text: '' }, { slug: 'c', text: '  ' }]))
      .toEqual([{ slug: 'a', text: 'Wet & dry' }]);
  });
  it('dedupes repeated values, keeping first-seen order', () => {
    // The width fact repeats a SKU width once per size run
    const dupes = [{ slug: 'w', text: [{ slug: 'standard', text: 'Normal' }, { slug: 'standard', text: 'Normal' }, { slug: 'wide', text: 'Wide' }] }];
    expect(factValues(dupes)).toEqual([{ slug: 'standard', text: 'Normal' }, { slug: 'wide', text: 'Wide' }]);
  });
  it('falls back to a slugified text when the value carries no slug', () => {
    expect(factValues([{ text: 'For beginners' }])).toEqual([{ slug: 'for-beginners', text: 'For beginners' }]);
  });
  it('returns an empty array for a missing or non-array fact', () => {
    expect(factValues(undefined)).toEqual([]);
    expect(factValues(null)).toEqual([]);
    expect(factValues('nope' as unknown)).toEqual([]);
  });
});

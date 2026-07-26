import { describe, expect, it } from 'vitest';
import { extractDetails } from '../src/extract-details.js';
import { PayloadError } from '../src/page-payload.js';
import { loadAzuraPageData } from './helpers.js';

describe('extractDetails', () => {
  const rec = extractDetails(loadAzuraPageData(), 'saucony-endorphin-azura', '2026-07-26T00:00:00Z');

  it('extracts core product fields from the real fixture', () => {
    expect(rec).toMatchObject({
      productId: 41068,
      name: 'Saucony Endorphin Azura',
      brand: 'Saucony',
      releasedAt: '2026-02-01',
      preciseReleaseDate: true,
      discontinued: false,
      runrepeatUrl: 'https://runrepeat.com/uk/saucony-endorphin-azura',
    });
    expect(rec.score).toBe(91);
    expect(rec.msrpGbp).toBe(150);
    expect(rec.imageUrl).toContain('/41068/');
    expect(rec.imageUrl).not.toContain('{SIZE}');
  });
  it('extracts editorial text', () => {
    expect(rec.pros.length).toBeGreaterThanOrEqual(5);
    expect(rec.pros.join(' ')).not.toContain('<span');
    expect(rec.cons.length).toBeGreaterThanOrEqual(2);
    expect(rec.intro).toContain('Endorphin Azura');
    expect(rec.whoShouldBuy).toContain('<');           // sanitised HTML, not plain text
    expect(rec.whoShouldBuy).not.toContain('<img');
    expect(rec.whoShouldNotBuy).toBeTruthy();
    expect(rec.whoShouldNotBuy).not.toContain('does not support the video tag');
    expect(rec.features).toContain('Removable insole');
  });
  it('throws PayloadError when product is missing', () => {
    expect(() => extractDetails({}, 'x', 't')).toThrow(PayloadError);
    expect(() => extractDetails({ product: { name: 'no id' } }, 'x', 't')).toThrow(PayloadError);
  });
  it('tolerates missing optional content', () => {
    const min = extractDetails({ product: { id: 1, name: 'Minimal' } }, 'minimal', 't');
    expect(min).toMatchObject({
      productId: 1, name: 'Minimal', brand: null, releasedAt: null, score: null,
      msrpGbp: null, imageUrl: null, pros: [], cons: [], intro: '',
      whoShouldBuy: null, whoShouldNotBuy: null, features: [],
    });
  });
});

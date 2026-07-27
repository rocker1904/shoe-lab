import { describe, expect, it } from 'vitest';
import { extractDetails } from '../src/extract-details.js';
import { PayloadError } from '../src/page-payload.js';
import { loadAzuraPageData, loadJsonFixture } from './helpers.js';

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

describe('extractDetails plate section', () => {
  const payloads = loadJsonFixture('plate-payloads.json');
  const extract = (key: string) => extractDetails(payloads[key], key, 't');

  it('is false when no plate section exists', () => {
    expect(extract('unplated').hasPlateSection).toBe(false);
  });
  it('is false for a carbon shoe with no plate section', () => {
    // 18 of the 70 carbon shoes have no section; carbon must not depend on this flag
    expect(extract('carbonNoSection').hasPlateSection).toBe(false);
    expect(extract('carbonNoSection').features).toContain('Carbon plate');
  });
  it('is true when a nested plate section exists', () => {
    expect(extract('platedOther').hasPlateSection).toBe(true);
  });
  it('finds the section under any parent, not just cushioning', () => {
    expect(extract('plateUnderStability').hasPlateSection).toBe(true);
  });
  it('is false when the lab content is missing entirely', () => {
    expect(extractDetails({ product: { id: 1, name: 'Minimal' } }, 'minimal', 't').hasPlateSection).toBe(false);
  });
  it('is false for the real unplated Azura fixture', () => {
    expect(extractDetails(loadAzuraPageData(), 'saucony-endorphin-azura', 't').hasPlateSection).toBe(false);
  });
});

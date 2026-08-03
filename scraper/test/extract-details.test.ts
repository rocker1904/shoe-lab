import { describe, expect, it } from 'vitest';
import { extractDetails } from '../src/extract-details.js';
import { PayloadError } from '../src/page-payload.js';
import { loadAzuraPageData, loadJsonFixture } from './helpers.js';

const rec = extractDetails(loadAzuraPageData(), 'saucony-endorphin-azura', '2026-07-26T00:00:00Z');

describe('extractDetails', () => {
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
  it('resolves the image size the payload declares, never a size of its own', () => {
    // A hardcoded width is well-formed and dead: the CDN 404s every size but the declared one.
    expect(rec.imageUrl).toContain('-720.jpg');
    expect(rec.imageUrl).not.toContain('{SIZE}');
  });
  it('returns no image rather than an unresolvable template', () => {
    const templated = { product: { id: 1, name: 'X', image: { url: 'https://x/y-{SIZE}.jpg' } } };
    expect(extractDetails(templated, 'x', 't').imageUrl).toBeNull();
  });
  it('keeps a url that carries no size token at all', () => {
    const plain = { product: { id: 1, name: 'X', image: { url: 'https://x/y.jpg' } } };
    expect(extractDetails(plain, 'x', 't').imageUrl).toBe('https://x/y.jpg');
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
      whoShouldBuy: null, whoShouldNotBuy: null, features: [], categorySlug: null,
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

// The three plain-text editorial fields reach the reader through plain interpolation, so an
// entity that survives extraction is rendered verbatim (docs/app.md §Sanitised-HTML boundary).
describe('extractDetails plain text', () => {
  const withText = (c: Record<string, unknown>) => extractDetails({ product: { id: 1, name: 'X' }, content: c }, 'x', 't');

  it('decodes entities in intro, pros and cons', () => {
    const rec = withText({
      intro_clean: 'we&rsquo;ve tested it&mdash;a lot',
      pros_clean: ['Grips both wet &amp; dry tarmac'],
      cons_clean: ['Doesn&rsquo;t stay in place'],
    });
    expect(rec.intro).toBe('we’ve tested it—a lot');
    expect(rec.pros).toEqual(['Grips both wet & dry tarmac']);
    expect(rec.cons).toEqual(['Doesn’t stay in place']);
  });
  it('decodes entities in the product and version names', () => {
    const rec = extractDetails({
      product: { id: 1, name: 'Nike Zoom&trade;', brand_name: 'Nike&reg;', previous_version: { slug: 'p', name: 'Zoom&trade; 1' } },
    }, 'x', 't');
    expect(rec.name).toBe('Nike Zoom™');
    expect(rec.brand).toBe('Nike®');
    expect(rec.previousVersion).toEqual({ slug: 'p', name: 'Zoom™ 1' });
  });
  it('leaves the sanitised-HTML fields alone, where entities are correct markup', () => {
    const rec = extractDetails({
      product: { id: 1, name: 'X' },
      content: { lab: { sections: [{ title: 'Who should buy', content: '<p>runners &amp; walkers</p>' }] } },
    }, 'x', 't');
    expect(rec.whoShouldBuy).toContain('&amp;');
  });
  it('decodes the real fixture rather than passing entities through', () => {
    expect(rec.intro).not.toMatch(/&[a-z]+;/);
    for (const line of [...rec.pros, ...rec.cons]) expect(line).not.toMatch(/&[a-z]+;/);
  });
});

describe('extractDetails facts', () => {
  const factPayload = (facts: unknown) => extractDetails({ product: { id: 1, name: 'X' }, features: facts }, 'x', 't');

  it('reads the kept facts from the real fixture with slugs and labels', () => {
    // A shoe carries as many pace labels as RunRepeat gave it; the Azura is both
    expect(rec.facts['pace']).toEqual([{ slug: 'tempo', text: 'Tempo' }, { slug: 'daily-running', text: 'Daily running' }]);
    expect(rec.facts['arch-support']).toEqual([{ slug: 'neutral', text: 'Neutral' }]);
    expect(rec.facts['strike-pattern']?.map((v) => v.slug)).toEqual(['heel-strike', 'forefoot-strike']);
    // width is the list of SKU widths on offer, not a measurement of this shoe
    expect(rec.facts['width']?.map((v) => v.text)).toContain('Normal');
  });
  it('never emits "[object Object]" from the nested link shape', () => {
    // The old String(v.text) cast produced this for every fact whose values nest one level
    const nested = [{ slug: 'pace', values: [{ slug: 'pace', text: [{ slug: 'tempo', text: 'Tempo' }] }] }];
    expect(factPayload(nested).facts['pace']).toEqual([{ slug: 'tempo', text: 'Tempo' }]);
    const junk = [{ slug: 'features', values: [{ text: [{}, {}] }] }];
    expect(factPayload(junk).features).toEqual([]);
  });
  it('keeps only the facts it was asked for, and omits empty ones', () => {
    const payload = [
      { slug: 'pace', values: [{ slug: 'tempo', text: 'Tempo' }] },
      { slug: 'season', values: [{ slug: 'winter', text: 'Winter' }] },
      { slug: 'width', values: [] },
    ];
    expect(Object.keys(factPayload(payload).facts)).toEqual(['pace']);
  });
  it('reads an empty fact map from a payload with no facts', () => {
    expect(factPayload(undefined).facts).toEqual({});
    expect(factPayload('nope').facts).toEqual({});
  });
});

// `last_version` names the newest model in the line and skips generations, so it is kept
// distinct from the direct predecessor rather than merged (docs/scraping.md §Model lineage).
describe('extractDetails model lineage', () => {
  it('reads both references when the payload carries them', () => {
    const r = extractDetails({
      product: { id: 1, name: 'X', previous_version: { id: 9, name: 'ASICS Gel Cumulus 25', slug: 'asics-gel-cumulus-25', score: 88 } },
      last_version: { id: 3, slug: 'asics-gel-cumulus-28', name: 'ASICS Gel Cumulus 28', url: '/uk/asics-gel-cumulus-28' },
    }, 'x', 't');
    expect(r.previousVersion).toEqual({ slug: 'asics-gel-cumulus-25', name: 'ASICS Gel Cumulus 25' });
    expect(r.latestVersion).toEqual({ slug: 'asics-gel-cumulus-28', name: 'ASICS Gel Cumulus 28' });
  });
  it('reads null for every shape that is not a usable reference', () => {
    for (const v of [undefined, null, {}, { slug: 'a' }, { name: 'B' }, { slug: '', name: 'B' }, { slug: 'a', name: 42 }]) {
      const r = extractDetails({ product: { id: 1, name: 'X', previous_version: v }, last_version: v }, 'x', 't');
      expect(r.previousVersion).toBeNull();
      expect(r.latestVersion).toBeNull();
    }
  });
});

// The category is what keeps hiking footwear out of the dataset
// (docs/scraping.md §Non-running shoes), so both sides of the split are pinned
// against real payloads, and every shape that is not a usable slug reads null.
describe('extractDetails categorySlug', () => {
  it('reads running-shoes from the real running-shoe fixture', () => {
    expect(extractDetails(loadAzuraPageData(), 'saucony-endorphin-azura', 't').categorySlug).toBe('running-shoes');
  });
  it('reads hiking-boots from a real hiking-boot payload', () => {
    const rec = extractDetails(loadJsonFixture('pagedata-hiking-boot.json'), 'danner-cascade-crest', 't');
    expect(rec.categorySlug).toBe('hiking-boots');
    expect(rec.name).toBe('Danner Cascade Crest');
  });
  it('reads null for every shape that is not a usable slug', () => {
    const product = { id: 1, name: 'Minimal' };
    for (const category of [undefined, null, {}, { slug: null }, { slug: '' }, { slug: 42 }, 'running-shoes']) {
      expect(extractDetails({ product, category }, 'x', 't').categorySlug).toBeNull();
    }
  });
});

describe('categorical readings taken from the page', () => {
  it('takes option and bool readings and leaves every numeric type to the metrics API', () => {
    const rec = extractDetails({
      product: { id: 1, name: 'Shoe' },
      lab_tests: { tests: {
        6: { id: 6, type: 'float', value: '40' },
        39: { id: 39, type: 'option', value: 'both-sides-semi' },
        40: { id: 40, type: 'option', value: 'none' },
        41: { id: 41, type: 'bool', value: '1' },
        45: { id: 45, type: 'bool', value: '0' },
        23: { id: 23, type: 'text', value: 'US 9' },
        50: { id: 50, type: 'option' },
        51: { id: 51, type: 'option', value: '' },
        52: { id: 52, type: 'bool', value: '' },
        53: { id: 53, type: 'bool', value: 'perhaps' },
      } },
    }, 'shoe', 'T');
    expect(rec.pageValues).toEqual({ 39: 'both-sides-semi', 40: 'none', 41: true, 45: false });
  });

  // The lab-test-list endpoint only ever returns the shoes that have the feature, so a `false`
  // exists nowhere but the page: roughly half the fleet has no reflective elements and the API says
  // nothing about any of them (docs/scraping.md §Readings taken from the page).
  it('keeps a false reading, which the metrics API can never express', () => {
    const rec = extractDetails({
      product: { id: 1, name: 'Shoe' },
      lab_tests: { tests: { 45: { id: 45, type: 'bool', value: '0' } } },
    }, 'shoe', 'T');
    expect(rec.pageValues['45']).toBe(false);
  });

  it('is an empty object when the page carries no categorical readings', () => {
    expect(extractDetails({ product: { id: 1, name: 'Shoe' } }, 'shoe', 'T').pageValues).toEqual({});
  });

  // The nested link shape RunRepeat already uses for facts: a bare cast would store the literal
  // reading "[object Object]" (docs/scraping.md §Fact values).
  it('drops an option reading that arrives in the nested link shape', () => {
    const rec = extractDetails({
      product: { id: 1, name: 'Shoe' },
      lab_tests: { tests: {
        39: { id: 39, type: 'option', value: [{ text: 'Both sides', slug: 'both-sides-semi' }] },
        40: { id: 40, type: 'option', value: { text: 'Pull tab', slug: 'pull-tab' } },
        41: { id: 41, type: 'bool', value: '1' },
      } },
    }, 'shoe', 'T');
    expect(rec.pageValues).toEqual({ 41: true });
  });
});

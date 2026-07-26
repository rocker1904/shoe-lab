import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPagePayload, PayloadError } from '../src/page-payload.js';
import { loadAzuraPageData, loadJsonFixture } from './helpers.js';

const html = readFileSync(new URL('./fixtures/raw/azura.html', import.meta.url), 'utf8');

describe('extractPagePayload', () => {
  it('extracts page_data from a real page', () => {
    const p = extractPagePayload(html);
    expect(p.pageType).toBe('product');
    expect(p.entityId).toBe(41068);
    expect(p.pageData.product.slug).toBe('saucony-endorphin-azura');
    expect(Object.keys(p.pageData.lab_tests.tests).length).toBeGreaterThan(50);
  });
  it('throws PayloadError when script tag is missing', () => {
    expect(() => extractPagePayload('<html><body>no payload</body></html>')).toThrow(PayloadError);
  });
  it('throws PayloadError on invalid JSON', () => {
    expect(() => extractPagePayload('<script id="__NUXT_DATA__">{oops</script>')).toThrow(PayloadError);
  });
  it('throws PayloadError when no entry has page_data', () => {
    const fake = `<script id="__NUXT_DATA__">${JSON.stringify([{ data: 1 }, { other: 2 }, 'x'])}</script>`;
    expect(() => extractPagePayload(fake)).toThrow(PayloadError);
  });
  it('wraps devalue decode failures as PayloadError', () => {
    const cyclic = `<script id="__NUXT_DATA__">${JSON.stringify([{ self: 0 }])}</script>`;
    expect(() => extractPagePayload(cyclic)).toThrow(PayloadError);
  });
});

describe('test helpers', () => {
  it('memoises the decoded azura page_data', () => {
    const a = loadAzuraPageData();
    expect(a.product.slug).toBe('saucony-endorphin-azura');
    expect(loadAzuraPageData()).toBe(a);
  });
  it('loads json fixtures by path', () => {
    expect(loadJsonFixture('raw/labtest5.json')).toBeTypeOf('object');
  });
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReleaseYearsFile } from '../../shared/types.js';
import { dataDir } from '../src/data-files.js';
import { PoliteHttp } from '../src/http.js';
import { parseReleaseYear, scrapeReleases } from '../src/release-dates.js';
import { loadJsonFixture } from './helpers.js';

const catdocs = loadJsonFixture('raw/catdocs.json');

function tmpDir() {
  return dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
}

function http(fetchImpl: typeof fetch): PoliteHttp {
  return new PoliteHttp({ fetchImpl, sleep: async () => {}, now: (() => { let t = 0; return () => (t += 2000); })() });
}

// Synthesised category products: every third one has no release-date fact, so the fleet
// mixes dated and undated shoes the way the live category API does.
function synth(from: number, count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => {
    const n = from + i;
    return {
      slug: `synth-${n}`,
      facts: n % 3 === 0 ? {} : {
        'release-date': {
          slug: 'release-date',
          value: [{ name: String(2019 + (n % 7)), slug: 'y' }, { name: 'Hide previous models', slug: 'hide-previous-models' }],
        },
      },
    };
  });
}

function paging(pageFor: (from: number) => unknown): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    urls.push(u);
    const from = Number(new URL(u).searchParams.get('from'));
    return new Response(JSON.stringify(pageFor(from)));
  }) as typeof fetch;
  return { fetchImpl, urls };
}

describe('parseReleaseYear', () => {
  it('reads the four-digit bucket from real category products', () => {
    expect(parseReleaseYear(catdocs.products[0])).toBe(2025);
    expect(parseReleaseYear(catdocs.products[1])).toBe(2024);
  });

  it('skips non-year options and takes the first year', () => {
    expect(parseReleaseYear({ facts: { 'release-date': { value: [{ name: 'Hide previous models' }, { name: '2023' }] } } })).toBe(2023);
  });

  it('accepts text-labelled options as well as name-labelled ones', () => {
    expect(parseReleaseYear({ facts: { 'release-date': { value: [{ text: '2021' }] } } })).toBe(2021);
  });

  it('returns null when there is no usable year', () => {
    expect(parseReleaseYear({ ...catdocs.products[0], facts: {} })).toBeNull();
    expect(parseReleaseYear({ facts: { 'release-date': { value: [] } } })).toBeNull();
    expect(parseReleaseYear({ facts: { 'release-date': { value: 'nope' } } })).toBeNull();
    expect(parseReleaseYear({ facts: { 'release-date': { value: [{ name: 'Spring 2024' }, { name: '25' }, {}] } } })).toBeNull();
    expect(parseReleaseYear({})).toBeNull();
    expect(parseReleaseYear(null)).toBeNull();
  });
});

describe('scrapeReleases', () => {
  it('pages the category API and writes years keyed by slug', async () => {
    const dir = tmpDir();
    const logged: string[] = [];
    // from=0 -> 2 real products + 28 synthetic; from=30..300 -> 30 synthetic each; from=330 -> empty.
    const { fetchImpl, urls } = paging((from) => {
      if (from === 0) return { products: [...catdocs.products, ...synth(0, 28)] };
      if (from <= 300) return { products: synth(from, 30) };
      return { products: [] };
    });

    const res = await scrapeReleases({ http: http(fetchImpl), dataDir: dir, log: (m) => logged.push(m) });

    expect(res.shoeCount).toBe(330);
    expect(res.yearCount).toBe(220);
    expect(urls).toHaveLength(12);              // 11 populated pages + the empty one that stops it
    expect(urls[0]).toContain('from=0&size=30');
    expect(urls[1]).toContain('from=30&size=30');
    expect(urls[0]).toContain('include=facts');
    expect(urls.at(-1)).toContain('from=330');
    expect(logged.length).toBeGreaterThan(0);

    const file = dir.read<ReleaseYearsFile>('release-years.json')!;
    expect(file.years['adidas-adizero-adios-pro-4']).toBe(2025);
    expect(file.years['nike-alphafly-3']).toBe(2024);
    expect(file.years['synth-1']).toBe(2020);
    expect(file.years['synth-3']).toBeUndefined();   // no release-date fact
    expect(file.scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stops when a page has no products key at all', async () => {
    const dir = tmpDir();
    const { fetchImpl, urls } = paging((from) => (from === 0 ? { products: synth(0, 30) } : { debug: {} }));
    await expect(scrapeReleases({ http: http(fetchImpl), dataDir: dir })).rejects.toThrow(/<300/);
    expect(urls).toHaveLength(2);
  });

  it('hard-stops after 100 pages', async () => {
    const dir = tmpDir();
    const { fetchImpl, urls } = paging((from) => ({ products: synth(from, 30) }));
    const res = await scrapeReleases({ http: http(fetchImpl), dataDir: dir });
    expect(urls).toHaveLength(100);
    expect(res.shoeCount).toBe(3000);
  });

  it('writes nothing when too few shoes are seen', async () => {
    const dir = tmpDir();
    const { fetchImpl } = paging((from) => (from === 0 ? { products: catdocs.products } : { products: [] }));
    await expect(scrapeReleases({ http: http(fetchImpl), dataDir: dir })).rejects.toThrow(/<300/);
    expect(dir.read('release-years.json')).toBeNull();
  });

  it('writes nothing when too few years are found', async () => {
    const dir = tmpDir();
    // 330 shoes, but only the first 50 carry a release-date fact.
    const { fetchImpl } = paging((from) => {
      if (from > 300) return { products: [] };
      return { products: synth(from, 30).map((p, i) => (from + i < 50 ? p : { slug: `bare-${from + i}`, facts: {} })) };
    });
    await expect(scrapeReleases({ http: http(fetchImpl), dataDir: dir })).rejects.toThrow(/<100/);
    expect(dir.read('release-years.json')).toBeNull();
  });

  it('ignores products without a slug', async () => {
    const dir = tmpDir();
    const { fetchImpl } = paging((from) => {
      if (from > 300) return { products: [] };
      return { products: [{ facts: {} }, ...synth(from, 30)] };
    });
    const res = await scrapeReleases({ http: http(fetchImpl), dataDir: dir });
    expect(res.shoeCount).toBe(330);
  });
});

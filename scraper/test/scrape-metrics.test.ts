import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MetricsFile, TestsFile } from '../../shared/types.js';
import { dataDir } from '../src/data-files.js';
import { PoliteHttp } from '../src/http.js';
import { scrapeMetrics } from '../src/scrape-metrics-main.js';

const azuraHtml = readFileSync(new URL('./fixtures/raw/azura.html', import.meta.url), 'utf8');
const labtest5 = readFileSync(new URL('./fixtures/raw/labtest5.json', import.meta.url), 'utf8');

function fakeFetch(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search*\n');
    if (u.includes('/uk/saucony-endorphin-azura')) return new Response(azuraHtml);
    if (u.includes('/api/product/lab-test-list/')) {
      expect(u).toContain('product_id=41068');
      // Bool-typed tests (removable-insole 41, reflective-elements 45, plate 69) must get
      // bool-shaped values or coerceValue throws; floats get the real fixture.
      const testId = /lab-test-list\/(\d+)/.exec(u)![1]!;
      if (['41', '45', '69'].includes(testId)) {
        return new Response(JSON.stringify({ headers: ['X', 'Name'], rows: [
          [{ value: '1' }, { text: 'Saucony Endorphin Azura', url: 'https://runrepeat.com/saucony-endorphin-azura' }],
        ] }));
      }
      return new Response(labtest5);
    }
    throw new Error(`unexpected url ${u}`);
  }) as typeof fetch;
}

describe('scrapeMetrics', () => {
  it('produces valid tests.json and metrics.json end to end', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    const http = new PoliteHttp({ fetchImpl: fakeFetch(), sleep: async () => {}, now: (() => { let t = 0; return () => (t += 2000); })() });
    const res = await scrapeMetrics({ http, dataDir: dir, seed: 'saucony-endorphin-azura' });
    expect(res.shoeCount).toBeGreaterThan(300);
    expect(res.testCount).toBeGreaterThanOrEqual(50);
    const tests = dir.read<TestsFile>('tests.json')!;
    const metrics = dir.read<MetricsFile>('metrics.json')!;
    expect(tests.tests.length).toBe(res.testCount);
    const azura = metrics.shoes['saucony-endorphin-azura']!;
    expect(azura.values['5']).toBe(32.7);
  });
  it('writes nothing when validation fails', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    // Two shoes only: validateMetrics rejects anything under 300. '1' coerces for every
    // metric type (numeric 1, bool true), so one payload shape serves all tests.
    const thin = JSON.stringify({ headers: ['X', 'Name'], rows: [
      [{ value: '1' }, { text: 'Azura', url: 'https://runrepeat.com/saucony-endorphin-azura' }],
      [{ value: '1' }, { text: 'Other', url: 'https://runrepeat.com/other-shoe' }],
    ] });
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search*\n');
      if (u.includes('/uk/saucony-endorphin-azura')) return new Response(azuraHtml);
      if (u.includes('/api/product/lab-test-list/')) return new Response(thin);
      throw new Error(`unexpected url ${u}`);
    }) as typeof fetch;
    const http = new PoliteHttp({ fetchImpl, sleep: async () => {}, now: (() => { let t = 0; return () => (t += 2000); })() });
    await expect(scrapeMetrics({ http, dataDir: dir, seed: 'saucony-endorphin-azura' })).rejects.toThrow(/<300/);
    expect(dir.read('tests.json')).toBeNull();
    expect(dir.read('metrics.json')).toBeNull();
  });

  it('aborts before any scraping when robots disallows our paths', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    const fetchImpl = (async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /\n');
      throw new Error('should not fetch anything else');
    }) as typeof fetch;
    const http = new PoliteHttp({ fetchImpl, sleep: async () => {} });
    await expect(scrapeMetrics({ http, dataDir: dir, seed: 'saucony-endorphin-azura' })).rejects.toThrow(/robots/i);
    expect(dir.read('tests.json')).toBeNull();
  });
});

/**
 * No page in the corpus carries the shape the catalogue gate exists for, so one is doctored here.
 * `__NUXT_DATA__` is a flat node list of devalue pointers, which makes "declared twice" literally
 * that: the same option node listed twice inside one test's options.
 */
function withRepeatedOption(html: string, testSlug: string): string {
  const flat = JSON.parse(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]!) as any[];
  const slugNode = flat.indexOf(testSlug);
  const test = flat.find((n) => n && !Array.isArray(n) && typeof n === 'object' && n.slug === slugNode);
  const options = flat[flat[test.config].options] as number[];
  options.push(options[0]!);
  return `<script id="__NUXT_DATA__">${JSON.stringify(flat)}</script>`;
}

// Catalogue-only, offline: the readings live behind the API and cannot be replayed from disk,
// so metrics.json must come through untouched (docs/scraping.md §Re-extracting from a corpus).
describe('scrapeMetrics from a corpus', () => {
  const corpus = fileURLToPath(new URL('./fixtures/raw', import.meta.url));

  it('rewrites tests.json from the local seed page without any request', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    const res = await scrapeMetrics({ dataDir: dir, seed: 'azura', corpusDir: corpus });
    expect(res.testCount).toBeGreaterThanOrEqual(50);
    const tests = dir.read<TestsFile>('tests.json')!;
    expect(tests.tests.find((t) => t.id === 11)?.updateId).toBe(70);
    expect(dir.read<MetricsFile>('metrics.json')).toBeNull();
  });
  it('leaves an existing metrics.json and its scrapedAt alone', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    const metrics: MetricsFile = { scrapedAt: '2026-01-01T00:00:00Z', shoes: { a: { name: 'A', url: 'u', values: {} } } };
    dir.write('metrics.json', metrics);
    dir.write('tests.json', { scrapedAt: '2026-02-02T00:00:00Z', seedSlug: 'azura', groups: {}, tests: [] });
    const res = await scrapeMetrics({ dataDir: dir, seed: 'azura', corpusDir: corpus });
    expect(res.shoeCount).toBe(1);
    expect(dir.read<MetricsFile>('metrics.json')).toEqual(metrics);
    expect(dir.read<TestsFile>('tests.json')!.scrapedAt).toBe('2026-02-02T00:00:00Z');
  });
  // The catalogue is rewritten while the readings stay put, so this path is the one that can
  // orphan them — a seed that dropped a test, or a --seed pointed at another shoe.
  it('refuses a catalogue that orphans readings already on disk, and writes nothing', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    dir.write('metrics.json', { scrapedAt: '2026-01-01T00:00:00Z', shoes: { a: { name: 'A', url: 'u', values: { '99999': 1 } } } });
    await expect(scrapeMetrics({ dataDir: dir, seed: 'azura', corpusDir: corpus })).rejects.toThrow(/unknown test 99999/);
    expect(dir.read('tests.json')).toBeNull();
  });

  // The catalogue is checked whether or not there are readings to check it against, because this
  // path writes tests.json either way and `data/` is the database
  // (docs/scraping.md §A duplicate option value fails the run).
  it('refuses a catalogue that declares one option value twice with no metrics.json at all', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    const doctored = mkdtempSync(join(tmpdir(), 'shoe-lab-corpus-'));
    writeFileSync(join(doctored, 'azura.html'), withRepeatedOption(azuraHtml, 'tongue-gusset-type'));
    await expect(scrapeMetrics({ dataDir: dir, seed: 'azura', corpusDir: doctored })).rejects.toThrow(/tongue-gusset-type/);
    expect(dir.read('tests.json')).toBeNull();
  });

  it('accepts a catalogue that still covers every reading on disk', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    dir.write('metrics.json', { scrapedAt: '2026-01-01T00:00:00Z', shoes: { a: { name: 'A', url: 'u', values: { '5': 32.7 } } } });
    await expect(scrapeMetrics({ dataDir: dir, seed: 'azura', corpusDir: corpus })).resolves.toBeTruthy();
    expect(dir.read<TestsFile>('tests.json')!.tests.length).toBeGreaterThanOrEqual(50);
  });

  it('throws rather than falling back to the network when the seed is not in the corpus', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    await expect(scrapeMetrics({ dataDir: dir, seed: 'no-such-shoe', corpusDir: corpus })).rejects.toThrow(/not in corpus/);
  });
  it('needs one of http or corpusDir', async () => {
    const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
    await expect(scrapeMetrics({ dataDir: dir, seed: 'azura' })).rejects.toThrow(/either http or corpusDir/);
  });
});

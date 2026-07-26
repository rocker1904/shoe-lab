import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

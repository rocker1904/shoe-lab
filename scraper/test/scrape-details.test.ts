import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataDir } from '../src/data-files.js';
import { PoliteHttp } from '../src/http.js';
import { scrapeDetails } from '../src/scrape-details-main.js';
import type { DetailsFile, MetricsFile } from '../../shared/types.js';

const azuraHtml = readFileSync(new URL('./fixtures/raw/azura.html', import.meta.url), 'utf8');

function setup(existingDetails?: DetailsFile) {
  const dir = dataDir(mkdtempSync(join(tmpdir(), 'shoe-lab-')));
  const metrics: MetricsFile = { scrapedAt: 't', shoes: {
    'saucony-endorphin-azura': { name: 'Azura', url: 'u', values: {} },
    'gone-shoe': { name: 'Gone', url: 'u', values: {} },
    'broken-shoe': { name: 'Broken', url: 'u', values: {} },
  } };
  dir.write('metrics.json', metrics);
  if (existingDetails) dir.write('details.json', existingDetails);
  const urls: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    urls.push(u);
    if (u.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search*\n');
    if (u.includes('saucony-endorphin-azura')) return new Response(azuraHtml);
    if (u.includes('gone-shoe')) return new Response('nope', { status: 404 });
    return new Response('<html>no payload</html>');
  }) as typeof fetch;
  const http = new PoliteHttp({ fetchImpl, sleep: async () => {} });
  return { dir, http, urls };
}

describe('scrapeDetails', () => {
  it('fetches missing shoes, tombstones 404s, records failures, writes results', async () => {
    const { dir, http } = setup();
    const res = await scrapeDetails({ http, dataDir: dir, now: () => 'T0' });
    expect(res.fetched).toEqual(['saucony-endorphin-azura']);
    expect(res.tombstoned).toEqual(['gone-shoe']);
    expect(res.failed.map((f) => f.slug)).toEqual(['broken-shoe']);
    const details = dir.read<DetailsFile>('details.json')!;
    expect((details.shoes['saucony-endorphin-azura'] as any).productId).toBe(41068);
    expect(details.shoes['gone-shoe']).toEqual({ gone: true, scrapedAt: 'T0' });
    expect(details.shoes['broken-shoe']).toBeUndefined();
  });
  it('is incremental: second run fetches nothing', async () => {
    const { dir, http } = setup();
    await scrapeDetails({ http, dataDir: dir, now: () => 'T0' });
    const second = setup(dir.read<DetailsFile>('details.json')!);
    const res = await scrapeDetails({ http: second.http, dataDir: second.dir, now: () => 'T1' });
    expect(res.fetched).toEqual([]);
    expect(res.tombstoned).toEqual([]);
    // only broken-shoe is still absent, so it is retried; azura + tombstone are not
    expect(second.urls.filter((u) => u.includes('azura'))).toEqual([]);
    expect(res.skipped).toBe(2);
  });
  it('--slug targets exactly one shoe and preserves other records', async () => {
    const existing: DetailsFile = { shoes: { 'gone-shoe': { gone: true, scrapedAt: 'OLD' } } };
    const { dir, http } = setup(existing);
    await scrapeDetails({ http, dataDir: dir, slug: 'saucony-endorphin-azura', now: () => 'T2' });
    const details = dir.read<DetailsFile>('details.json')!;
    expect(details.shoes['gone-shoe']).toEqual({ gone: true, scrapedAt: 'OLD' });
    expect((details.shoes['saucony-endorphin-azura'] as any).scrapedAt).toBe('T2');
  });
  it('forceAll refetches everything', async () => {
    const { dir, http } = setup({ shoes: { 'saucony-endorphin-azura': { gone: true, scrapedAt: 'OLD' } } });
    const res = await scrapeDetails({ http, dataDir: dir, forceAll: true, now: () => 'T3' });
    expect(res.fetched).toEqual(['saucony-endorphin-azura']);
    expect((dir.read<DetailsFile>('details.json')!.shoes['saucony-endorphin-azura'] as any).productId).toBe(41068);
  });
  it('aborts before fetching any page when robots disallows shoe paths', async () => {
    const { dir } = setup();
    const urls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /\n');
      throw new Error('should not fetch shoe pages');
    }) as typeof fetch;
    const http = new PoliteHttp({ fetchImpl, sleep: async () => {} });
    await expect(scrapeDetails({ http, dataDir: dir, now: () => 'T4' })).rejects.toThrow(/robots/i);
    expect(urls).toHaveLength(1);
  });
});

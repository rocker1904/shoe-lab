import { readFileSync } from 'node:fs';
import type { DetailRecord, LabTest, Shoe } from '../../shared/types.js';
import { extractPagePayload } from '../src/page-payload.js';

// Factories, so a new field on a shared type is one edit here rather than one per fixture.
export function labTest(over: Partial<LabTest> & Pick<LabTest, 'id' | 'slug'>): LabTest {
  return {
    name: over.slug, type: 'float', units: '', groupId: null,
    chartLabel: null, isNew: false, previousId: null, updateId: null,
    primaryTestId: null, secondaryTestIds: [], options: null,
    ...over,
  };
}

export function detailRecord(over: Partial<DetailRecord> = {}): DetailRecord {
  return {
    scrapedAt: '2026-07-21T00:00:00Z', productId: 7, name: 'Shoe', brand: null,
    releasedAt: null, preciseReleaseDate: false, score: null, msrpGbp: null,
    discontinued: false, imageUrl: null, runrepeatUrl: 'https://runrepeat.com/uk/shoe',
    features: [], pros: [], cons: [], intro: '', hasPlateSection: false,
    whoShouldBuy: null, whoShouldNotBuy: null, categorySlug: null,
    facts: {}, optionValues: {}, previousVersion: null, latestVersion: null,
    ...over,
  };
}

export function shoe(over: Partial<Shoe> & Pick<Shoe, 'slug'>): Shoe {
  return {
    name: over.slug, brand: null, url: `https://runrepeat.com/uk/${over.slug}`,
    releasedAt: null, releaseDateSource: null, score: null, msrpGbp: null,
    discontinued: false, plate: 'none', imageUrl: null, values: {}, details: null,
    facts: {}, previousVersion: null, nextVersion: null, latestVersion: null, reviewLanguage: null,
    ...over,
  };
}

let cached: Record<string, any> | null = null;

export function loadAzuraPageData(): Record<string, any> {
  if (!cached) {
    const html = readFileSync(new URL('./fixtures/raw/azura.html', import.meta.url), 'utf8');
    cached = extractPagePayload(html).pageData;
  }
  return cached;
}

export function loadJsonFixture(name: string): any {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

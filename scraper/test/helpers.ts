import { readFileSync } from 'node:fs';
import { extractPagePayload } from '../src/page-payload.js';

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

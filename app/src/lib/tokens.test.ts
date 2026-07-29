import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolved through `fileURLToPath` rather than `new URL(...)` because the jsdom environment
// replaces the global `URL` with one `readFileSync` rejects (lineage.test.ts says the same).
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../app.css'), 'utf8');
const componentDir = join(here, '../components');

describe('design tokens', () => {
  it('defines the wash endpoints for both themes', () => {
    for (const v of ['#b0b6bf', '#4a86f0', '#454b54', '#2b6cb0']) {
      expect(css).toContain(v);
    }
  });

  it('drops --tint-strength, because the endpoint is the cap', () => {
    expect(css).not.toContain('--tint-strength');
  });

  it('defines the full spacing, radius and type scales', () => {
    for (const t of ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6',
                     '--r-sm', '--r-md', '--r-full',
                     '--t-xs', '--t-sm', '--t-md', '--t-lg', '--t-xl',
                     '--chrome', '--divider', '--shadow-sticky', '--shadow-dialog']) {
      expect(css, `${t} missing`).toContain(`${t}:`);
    }
  });

  it('leaves no component choosing its own font size or radius', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(componentDir).filter((n) => n.endsWith('.svelte'))) {
      const src = readFileSync(join(componentDir, f), 'utf8');
      const style = src.slice(src.indexOf('<style>'));
      // A literal rem font-size or px radius means the scale was bypassed.
      if (/font-size:\s*[\d.]+rem/.test(style)) offenders.push(`${f} font-size`);
      if (/border-radius:\s*\d+px/.test(style)) offenders.push(`${f} border-radius`);
    }
    expect(offenders).toEqual([]);
  });
});

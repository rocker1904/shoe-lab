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

  it('self-hosts both faces and names them as tokens', () => {
    expect(css).toContain('@font-face');
    // Relative, so Vite fingerprints them and the Pages subpath survives (Task 1 Step 2).
    expect(css).toContain("url('./assets/fonts/inter-tight.woff2')");
    expect(css).toContain("url('./assets/fonts/jetbrains-mono.woff2')");
    expect(css).toContain('--font-ui:');
    expect(css).toContain('--font-mono:');
  });

  it('never asks a third party for a font, nor for one from the site root', () => {
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
    // A leading slash resolves off the Pages subpath and 404s in production only.
    expect(css).not.toMatch(/url\(['"]?\/fonts/);
  });

  it('leaves no component choosing its own font size, radius or face', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(componentDir).filter((n) => n.endsWith('.svelte'))) {
      const src = readFileSync(join(componentDir, f), 'utf8');
      const style = src.slice(src.indexOf('<style>'));
      // A literal rem font-size, px radius, or font family means the scale was bypassed.
      if (/font-size:\s*[\d.]+rem/.test(style)) offenders.push(`${f} font-size`);
      if (/border-radius:\s*\d+px/.test(style)) offenders.push(`${f} border-radius`);
      // Capture the VALUE and test it. A negative lookahead behind `\s*` cannot work here:
      // `\s*` backtracks to zero width and the lookahead is then evaluated against " var(…)",
      // which does not begin with `var(`, so `/font-family:\s*(?!var\(|inherit)/` matches every
      // compliant rule. It reads correct and is exactly backwards.
      // `font: inherit` and `font-family: inherit` are not a choice of face, so they pass.
      for (const m of style.matchAll(/font-family:\s*([^;}]+)/g)) {
        const value = m[1]!.trim();
        if (!value.startsWith('var(') && value !== 'inherit') offenders.push(`${f} font-family`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

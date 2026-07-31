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
  it('defines the ranked and neutral wash fills for both themes', () => {
    for (const v of ['--wash-blue:', '--wash-grey:']) expect(css).toContain(v);
    // The fill is not the accent: a large translucent area needs less chroma than a small solid mark.
    expect(css).toContain('hsl(211 84% 50%)');
    expect(css).toContain('hsl(211 70% 44%)');
  });

  it('defines the accent, a darker solid variant, and the one ink allowed on it', () => {
    expect(css).toContain('hsl(211 84% 46%)');
    expect(css).toContain('hsl(211 70% 54%)');
    expect(css).toContain('--accent-solid:');
    expect(css).toContain('hsl(211 84% 44%)');
    // A token rather than a literal `#fff` in each component that fills with the accent: the pass
    // exists to move colour choices into app.css, and the guard below is what keeps them there.
    // docs/app.md §Theming names the readers; a count here would be a second home for that list.
    expect(css).toContain('--on-accent:');
  });

  it('leaves no component writing a raw white onto an accent fill', () => {
    // `--accent-solid` and `#fff` are a pair, and a pair split across files drifts. The literal is
    // banned outright rather than checked for adjacency, because adjacency is not greppable.
    const offenders: string[] = [];
    for (const f of readdirSync(componentDir).filter((n) => n.endsWith('.svelte'))) {
      const style = readFileSync(join(componentDir, f), 'utf8');
      if (/color:\s*#(fff|ffffff)\b/i.test(style.slice(style.indexOf('<style>')))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps --hist-dim at the values wash.test.ts holds to 3:1', () => {
    // The token and the literal in wash.test.ts are one fact in two files; drifting them apart is
    // how a flat mark gets lightened into invisibility with nothing failing. Light moved off
    // #8b929d because that value cleared 3:1 only against --surface, and the sidebar's bars sit on
    // --bg above 800px (2.88:1) and in a --border-soft track in the pickers (2.70:1).
    expect(css).toContain('--hist-dim: #7f8794');
    expect(css).toContain('--hist-dim: #6b7482');
  });

  it('keeps --text-dim at the value wash.test.ts holds to 4.5:1', () => {
    // One fact in two files, pinned from both sides like --hist-dim. Light moved off #6a7280
    // because that value cleared only --surface: on the segmented groups' --bg track it measured
    // 4.44:1 and under a chosen setup card's description it measured 4.28:1.
    expect(css).toContain('--text-dim: #5f6673');
    expect(css).toContain('--text-dim: #98a0ab');
  });

  it('keeps the divider visibly darker than the border it is not', () => {
    // A border-coloured hairline is invisible against --chrome, which is the whole reason this
    // token exists — SetupStrip.svelte says so at its own divider.
    expect(css).toContain('--divider: #c9c9c3');
    expect(css).not.toMatch(/--divider:\s*var\(--border\)/);
  });

  it('defines the elevation, surface and focus tokens', () => {
    for (const t of ['--shadow-panel', '--shadow-sticky', '--shadow-dialog', '--focus-ring',
                     '--scrim', '--well', '--border-soft']) {
      expect(css, `${t} missing`).toContain(`${t}:`);
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
    // Relative, so Vite fingerprints them and the Pages subpath survives; `app.css` owns why, and
    // the failure it prevents shows up only in production.
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

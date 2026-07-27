import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// `svelte/no-at-html-tags` already fails a careless new sink, but it is silenced by an inline
// disable — so it cannot catch a *deliberate* one added with a disable comment attached. This
// pins the exact expressions instead, which is the part that carries the security weight
// (docs/app.md §Sanitised-HTML boundary).
const SRC = join(process.cwd(), 'src');

function svelteSources(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.svelte')) out.push({ file: relative(SRC, p), text: readFileSync(p, 'utf8') });
    }
  };
  walk(SRC);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe('sanitised-HTML boundary', () => {
  const sinks = svelteSources().flatMap(({ file, text }) =>
    [...text.matchAll(/\{@html\s+([^}]+)\}/g)].map((m) => ({ file, expr: m[1]!.trim() })));

  it('renders {@html} from exactly the two build-time-sanitised fields', () => {
    expect(sinks).toEqual([
      { file: join('components', 'DetailPanel.svelte'), expr: 'shoe.details.whoShouldBuy' },
      { file: join('components', 'DetailPanel.svelte'), expr: 'shoe.details.whoShouldNotBuy' },
    ]);
  });

  it('finds some components to check, so a bad glob cannot pass vacuously', () => {
    expect(svelteSources().length).toBeGreaterThanOrEqual(10);
  });
});

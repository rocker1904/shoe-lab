#!/usr/bin/env node
// Fails CI on dead doc pointers and on a doc index that no longer matches docs/.
// Zero deps, run from the repo root: `npm run check:docs`.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const SCAN = /\.(md|ts|svelte|mjs|js|yml|yaml|css|html)$/;
/**
 * `docs/superpowers/` is frozen: spec and plan artifacts recording what was decided at the time,
 * which docs/ then supersedes (CLAUDE.md). Their pointers name headings as those headings stood
 * then, so a live rename dangles one — and the fix would be editing history to match the present,
 * which is the one thing a frozen artifact must not do. The index check below already excludes
 * them for the same reason.
 */
const FROZEN = 'docs/superpowers/';
// Untracked-but-not-ignored files count too, so a new doc is checked before it is committed.
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && SCAN.test(f) && !f.includes('node_modules/') && !f.startsWith(FROZEN));

// Pointer syntax: docs/README.md, contract §Pointer syntax. The heading may wrap onto the
// next line, so the separator spans newlines; the class stops it at sentence punctuation.
const POINTER = /(docs\/[\w./-]+\.md)(?:\s+§([^\n()`'";|]+))?/g;
const errors = [];
const headingCache = new Map();

function headingsOf(path) {
  if (!headingCache.has(path)) {
    const set = new Set();
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.startsWith('#')) continue;
      const text = line.replace(/^#+\s*/, '').trim();
      set.add(text);
      // Headings may carry a trailing decision date; pointers never do (no parens allowed).
      set.add(text.replace(/\s*\([^)]*\)$/, ''));
    }
    headingCache.set(path, set);
  }
  return headingCache.get(path);
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(POINTER)) {
    const [, target, rawHeading] = m;
    const where = `${file}:${lineOf(m.index)}`;
    if (!existsSync(target)) {
      errors.push(`${where}: pointer to missing file ${target}`);
      continue;
    }
    if (rawHeading === undefined) continue;
    // Prose runs on after a pointer ("§Rules, rule 5"), so try the longest reading first and
    // trim trailing words until one names a real heading.
    const words = rawHeading.trim().split(/\s+/);
    let resolved = false;
    while (words.length && !resolved) {
      resolved = headingsOf(target).has(words.join(' ').replace(/[.,:]+$/, ''));
      if (!resolved) words.pop();
    }
    if (!resolved) errors.push(`${where}: ${target} has no heading "${rawHeading.trim()}"`);
  }
}

// Doc-index parity. docs/README.md is the contract itself, linked from CLAUDE.md's "Start here"
// rather than indexed as a domain doc; docs/superpowers/ is frozen history and not a directory
// entry here, so a non-recursive read excludes it.
const claude = readFileSync('CLAUDE.md', 'utf8');
const indexed = [...claude.matchAll(/^\|\s*([\w./-]+\.md)\s*\|/gm)].map((m) => m[1]);
const actual = readdirSync('docs')
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => `docs/${f}`);

for (const row of indexed) {
  if (!existsSync(row)) errors.push(`CLAUDE.md doc index lists ${row}, which does not exist`);
}
for (const doc of actual) {
  if (!indexed.includes(doc)) errors.push(`${doc} exists but is missing from the CLAUDE.md doc index`);
}

if (errors.length) {
  console.error(`check:docs failed (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.error(`check:docs ok: ${files.length} files scanned, ${indexed.length} indexed docs`);

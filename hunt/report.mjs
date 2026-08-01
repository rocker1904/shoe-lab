// The queue. One file per finding so parallel agents never race an append, and a refusal to file
// anything without a reproduction — that refusal IS the evidence bar, enforced rather than
// remembered, and it is what buys us out of paying a second agent to verify every claim.
import { writeFileSync, appendFileSync, mkdirSync, readdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The instrument is tracked under hunt/; everything it writes goes to .hunt/, which is gitignored.
// Keeping the queue out of git is deliberate: check:docs scans untracked-but-unignored files for
// dead doc pointers, so a finding that correctly reports a broken pointer would fail the build.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HUNT = join(ROOT, '.hunt');
const FINDINGS = join(HUNT, 'findings');
const SURFACES = ['app-desktop', 'app-phone', 'app-any', 'scraper', 'data', 'docs', 'ops'];
const SEVERITIES = ['S1', 'S2', 'S3', 'S4'];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * File a finding. Every field below is required; `repro` especially, because a finding nobody can
 * re-run is a suspicion wearing a finding's clothes — send those to suspect() instead.
 *
 * @param {{title, surface, severity, repro, expected, actual, wave, agent,
 *          detail?, owningDoc?, shots?: {file, reason}[]}} f
 */
export function file(f) {
  for (const k of ['title', 'surface', 'severity', 'repro', 'expected', 'actual', 'agent']) {
    if (!f[k] || !String(f[k]).trim()) throw new Error(`finding needs a non-empty ${k}`);
  }
  if (!SURFACES.includes(f.surface)) throw new Error(`surface must be one of ${SURFACES.join(', ')}`);
  if (!SEVERITIES.includes(f.severity)) throw new Error(`severity must be one of ${SEVERITIES.join(', ')}`);

  mkdirSync(FINDINGS, { recursive: true });
  const slug = slugify(f.title);

  // O_EXCL rather than max+1: two agents reading the directory at the same instant would otherwise
  // both pick the same number and one would overwrite the other's proven work.
  let id = readdirSync(FINDINGS).length + 1;
  let path;
  for (;;) {
    path = join(FINDINGS, `${String(id).padStart(4, '0')}-${slug}.md`);
    try { closeSync(openSync(path, 'wx')); break; } catch { id++; }
  }

  const body = `---
id: ${String(id).padStart(4, '0')}
title: ${f.title}
surface: ${f.surface}
severity: ${f.severity}
wave: ${f.wave ?? '?'}
agent: ${f.agent}
status: new
---

## What is wrong

${f.detail ?? f.title}

## Reproduction

${f.repro}

## Expected

${f.expected}

## Actual

${f.actual}
${f.owningDoc ? `\n## Owning doc\n\n${f.owningDoc}\n` : ''}${
  f.shots?.length ? `\n## Pixels\n\n${f.shots.map((s) => `- \`${s.file}\` — ${s.reason}`).join('\n')}\n` : ''
}`;

  writeFileSync(path, body);
  appendFileSync(join(HUNT, 'INDEX.md'), `- ${String(id).padStart(4, '0')} [${f.severity}] [${f.surface}] ${f.title}\n`);
  return path;
}

/** Something you believe but cannot demonstrate. One line, costs nobody anything, swept later if ever. */
export function suspect(line, agent = '?') {
  appendFileSync(join(HUNT, 'suspicions.md'), `- (${agent}) ${line}\n`);
}

/** Titles only — cheap enough for every agent to read before filing, which is what stops five journeys filing the same toolbar bug. */
export function index() {
  const path = join(HUNT, 'INDEX.md');
  return existsSync(path) ? readdirSync(FINDINGS).length : 0;
}

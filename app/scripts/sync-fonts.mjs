// Copies the two faces into src/assets so Vite fingerprints and rewrites them. `src/`, not
// `public/`: vite.config.ts sets `base: './'` for the Pages subpath, and Vite leaves root-absolute
// public/ references alone — so a public font would 404 in production and only in production.
// Mirrors app/scripts/sync-data.mjs: a build-time copy, not an import, because a bundled font is
// fetched only after the JS bundle parses.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../src/assets/fonts');
mkdirSync(out, { recursive: true });

const FACES = [
  ['@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2', 'inter-tight.woff2'],
  ['@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 'jetbrains-mono.woff2'],
];

for (const [from, to] of FACES) {
  copyFileSync(join(here, '../../node_modules', from), join(out, to));
  console.log(`sync-fonts: ${to}`);
}

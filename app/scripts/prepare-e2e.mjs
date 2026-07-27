// The e2e run must not depend on whatever the scraper last produced: swap the built dataset for a
// small fixture with known rows so the smoke expectations are stable.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../e2e/fixtures/shoes.json', import.meta.url)), 'utf8'),
);

writeFileSync(fileURLToPath(new URL('../dist/shoes.json', import.meta.url)), JSON.stringify(fixture));

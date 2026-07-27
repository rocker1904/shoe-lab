// The e2e run must not depend on whatever the scraper last produced: swap the built dataset for a
// small fixture with known rows so the smoke expectations are stable.
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

copyFileSync(
  fileURLToPath(new URL('../e2e/fixtures/shoes.json', import.meta.url)),
  fileURLToPath(new URL('../dist/shoes.json', import.meta.url)),
);

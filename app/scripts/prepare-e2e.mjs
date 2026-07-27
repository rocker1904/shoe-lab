// The e2e run must not depend on whatever the scraper last produced: swap the built dataset for a
// small fixture with known rows so the smoke expectations are stable.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../e2e/fixtures/shoes.json', import.meta.url)), 'utf8'),
);

// The easy-day-cruiser preset only keeps shoes released in the last two years, and `cushy` is the one
// shoe the smoke test expects it to match. A literal date in the fixture would age out of that window and
// fail the suite on a fixed future day, so stamp it relative to today here — which keeps the committed
// fixture static and still mirroring test-fixtures.ts FLEET. Every other shoe keeps its fixture date:
// they are excluded by plate or by sitting far outside the window, so neither is on the clock.
const now = new Date();
const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate()));
const cushy = fixture.shoes.find((s) => s.slug === 'cushy');
cushy.releasedAt = sixMonthsAgo.toISOString().slice(0, 10);

writeFileSync(fileURLToPath(new URL('../dist/shoes.json', import.meta.url)), JSON.stringify(fixture));

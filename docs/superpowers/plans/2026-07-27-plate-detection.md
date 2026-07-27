# Non-carbon Plate Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop nylon and PEBA plated shoes reading as unplated, by deriving `plate` from the presence of a per-shoe "Plate" review section rather than from RunRepeat's carbon-only structured vocabulary.

**Architecture:** The details crawl extracts one new boolean per shoe (`hasPlateSection`). `build:dataset` derives `plate` from that plus the existing carbon feature string, with a small hand-maintained override map for the three shoes RunRepeat tags wrongly. Backfill runs offline against a local page corpus, so the change costs zero live requests.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node 24, Vitest, zero runtime dependencies.

**Design spec:** docs/superpowers/specs/2026-07-27-plate-detection-design.md — read §2 before starting; it records evidence that is expensive to re-derive.

## Global Constraints

- **Zero runtime dependencies** in `scraper/` — vendored code only (docs/decisions.md §Fewer dependencies).
- **No live network in tests, ever.** Tests use fixtures and injected `fetchImpl` only (docs/decisions.md §Testing bar: adversarial, no live network).
- **TDD**: the failing test is written and *observed failing* before implementation.
- **`npm run verify` must pass before every commit.** It runs check:docs + typecheck + lint + test:coverage.
- Coverage thresholds: lines ≥ 90, branches ≥ 85 on `scraper/src`.
- **`build:dataset` reads no clock** — determinism is load-bearing (docs/scraping.md §Determinism).
- Datasets key shoes by slug; metric values key by test id as a string.
- **Comments are WHY-only**; a rule that spans files points at its owning doc (docs/README.md §Rules).
- Commit subjects are concise and single-line, with no embedded measurements. End each commit body with `Co-Authored-By: <name of the model writing the commit> <noreply@anthropic.com>`.
- The local corpus at `.corpus/pages/<slug>.html` is gitignored and already populated with all 464 pages. Do not re-crawl it.

## File Structure

| File | Responsibility |
|---|---|
| `shared/types.ts` | modify — add `hasPlateSection` to `DetailRecord` |
| `scraper/src/extract-details.ts` | modify — detect the plate section in the lab content tree |
| `scraper/src/plate-overrides.ts` | **create** — hand-maintained corrections, source not data |
| `scraper/src/build-dataset.ts` | modify — split the plate rule from the override lookup |
| `scraper/src/validate.ts` | modify — fail on stale or redundant overrides |
| `scraper/src/scrape-details-main.ts` | modify — offline corpus source |
| `scraper/src/scrape-details.ts` | modify — `--from-corpus` flag |
| `scraper/test/fixtures/plate-payloads.json` | **create** — trimmed payloads, one per rule branch |

**Payload shape you are extracting from** (established across all 464 pages — do not re-derive):

`pageData.content.lab.sections` is an array of top-level sections. The plate section is **always exactly two levels deep** — `sections[i].sections[j].section_id === 'plate'`. It never appears at the top level and never deeper than two. Its parent varies: `cushioning` (86 pages), `stability` (2), `flexibility-stiffness` (1). 89 of 464 pages have one.

---

### Task 1: Extract `hasPlateSection`

**Files:**
- Modify: `shared/types.ts:13-20` (the `DetailRecord` interface)
- Modify: `scraper/src/extract-details.ts:22-40` (the returned object)
- Create: `scraper/test/fixtures/plate-payloads.json`
- Test: `scraper/test/extract-details.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DetailRecord.hasPlateSection: boolean`. Task 2 reads it; Task 4 backfills it.

- [ ] **Step 1: Create the trimmed fixtures**

These are minimal `pageData` objects, one per branch. Full pages are ~1 MB and deliberately not used here.

Create `scraper/test/fixtures/plate-payloads.json`:

```json
{
  "unplated": {
    "product": { "id": 1001, "name": "Plain Trainer" },
    "features": [{ "slug": "features", "values": [{ "text": "Rocker" }] }],
    "content": { "lab": { "sections": [
      { "section_id": "cushioning", "title": "Cushioning", "sections": [
        { "section_id": "midsole-softness", "title": "Midsole softness", "content": "<p>soft</p>" }
      ] }
    ] } }
  },
  "carbonNoSection": {
    "product": { "id": 1002, "name": "Carbon Racer" },
    "features": [{ "slug": "features", "values": [{ "text": "Carbon plate" }, { "text": "Rocker" }] }],
    "content": { "lab": { "sections": [
      { "section_id": "cushioning", "title": "Cushioning", "sections": [] }
    ] } }
  },
  "platedOther": {
    "product": { "id": 1003, "name": "Nylon Trainer" },
    "features": [{ "slug": "features", "values": [{ "text": "Rocker" }] }],
    "content": { "lab": { "sections": [
      { "section_id": "cushioning", "title": "Cushioning", "sections": [
        { "section_id": "plate", "title": "Plate", "content": "<p>features a nylon plate</p>" }
      ] }
    ] } }
  },
  "plateUnderStability": {
    "product": { "id": 1004, "name": "Stability Plated" },
    "features": [{ "slug": "features", "values": [] }],
    "content": { "lab": { "sections": [
      { "section_id": "cushioning", "title": "Cushioning", "sections": [] },
      { "section_id": "stability", "title": "Stability", "sections": [
        { "section_id": "plate", "title": "Plate", "content": "<p>a plastic plate</p>" }
      ] }
    ] } }
  }
}
```

- [ ] **Step 2: Write the failing test**

First extend the existing helpers import on line 4 — do **not** add a second import of the same module, lint will reject it:

```ts
import { loadAzuraPageData, loadJsonFixture } from './helpers.js';
```

Then append to `scraper/test/extract-details.test.ts`:

```ts
describe('extractDetails plate section', () => {
  const payloads = loadJsonFixture('plate-payloads.json');
  const extract = (key: string) => extractDetails(payloads[key], key, 't');

  it('is false when no plate section exists', () => {
    expect(extract('unplated').hasPlateSection).toBe(false);
  });
  it('is false for a carbon shoe with no plate section', () => {
    // 18 of the 70 carbon shoes have no section; carbon must not depend on this flag
    expect(extract('carbonNoSection').hasPlateSection).toBe(false);
    expect(extract('carbonNoSection').features).toContain('Carbon plate');
  });
  it('is true when a nested plate section exists', () => {
    expect(extract('platedOther').hasPlateSection).toBe(true);
  });
  it('finds the section under any parent, not just cushioning', () => {
    expect(extract('plateUnderStability').hasPlateSection).toBe(true);
  });
  it('is false when the lab content is missing entirely', () => {
    expect(extractDetails({ product: { id: 1, name: 'Minimal' } }, 'minimal', 't').hasPlateSection).toBe(false);
  });
  it('is false for the real unplated Azura fixture', () => {
    expect(extractDetails(loadAzuraPageData(), 'saucony-endorphin-azura', 't').hasPlateSection).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npm -w scraper run test -- extract-details`
Expected: FAIL — `hasPlateSection` is `undefined`, not `false`.

- [ ] **Step 4: Add the field to the type**

In `shared/types.ts`, inside `DetailRecord`, after the `features: string[];` entry on line 18:

```ts
  features: string[]; pros: string[]; cons: string[]; intro: string;
  hasPlateSection: boolean;
```

- [ ] **Step 5: Implement the detection**

In `scraper/src/extract-details.ts`, after the `featuresFact` line (line 20), add:

```ts
  // The plate section sits one level inside a parent section, and the parent varies by shoe
  // (docs/scraping.md §Data quirks).
  const hasPlateSection = sections.some((s: any) =>
    s?.section_id === 'plate'
    || (Array.isArray(s?.sections) && s.sections.some((n: any) => n?.section_id === 'plate')));
```

Then add `hasPlateSection,` to the returned object, directly after the `features:` line.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npm -w scraper run test -- extract-details`
Expected: PASS, all cases.

- [ ] **Step 7: Fix the type error in the other test file**

`scraper/test/build-dataset.test.ts` constructs `DetailRecord` literals in `baseInputs()`. Adding a required field breaks typecheck. Add `hasPlateSection: false,` to **both** full records — `shoe-000` (after its `features:` line) and `ghost-shoe`. Do not touch the `shoe-001` tombstone; tombstones have no such field.

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts scraper/src/extract-details.ts scraper/test/fixtures/plate-payloads.json scraper/test/extract-details.test.ts scraper/test/build-dataset.test.ts
git commit -m "Extract whether a shoe has a plate review section"
```

---

### Task 2: Override map and the plate rule

**Files:**
- Create: `scraper/src/plate-overrides.ts`
- Modify: `scraper/src/build-dataset.ts:6-13` (constant and `derivePlate`), `:40` (the call site)
- Test: `scraper/test/build-dataset.test.ts:41-51` (the `derivePlate` block)

**Interfaces:**
- Consumes: `DetailRecord.hasPlateSection` from Task 1.
- Produces:
  - `PLATE_OVERRIDES: Record<string, { plate: Plate; note: string }>`
  - `plateFromRules(features: string[], hasPlateSection: boolean): Plate` — rules only, no overrides. Task 3 uses this.
  - `derivePlate(slug: string, features: string[], hasPlateSection: boolean): Plate` — overrides then rules.

- [ ] **Step 1: Write the failing test**

Replace the whole existing `describe('derivePlate', ...)` block at `scraper/test/build-dataset.test.ts:41-51` with:

```ts
describe('plateFromRules', () => {
  it('covers the full truth table', () => {
    expect(plateFromRules(['Carbon plate'], false)).toBe('carbon');
    expect(plateFromRules(['carbon PLATE x'], false)).toBe('carbon');
    expect(plateFromRules(['Carbon plate'], true)).toBe('carbon');   // carbon wins over the section
    expect(plateFromRules([], true)).toBe('plated-other');
    expect(plateFromRules([], false)).toBe('none');
    expect(plateFromRules(['Rocker'], false)).toBe('none');
  });
  it('ignores plate words other than carbon, which the vocabulary never emits', () => {
    // "Carbon plate" is the only plate string RunRepeat uses; a section is what marks the rest
    expect(plateFromRules(['Nylon plate'], false)).toBe('none');
  });
});

describe('derivePlate overrides', () => {
  it('lets an override beat the rules in both directions', () => {
    expect(derivePlate('salomon-s-lab-spectur', [], true)).toBe('carbon');
    expect(derivePlate('anta-zone-2-90', [], true)).toBe('none');
  });
  it('falls through to the rules for every other shoe', () => {
    expect(derivePlate('some-other-shoe', [], true)).toBe('plated-other');
    expect(derivePlate('some-other-shoe', ['Carbon plate'], false)).toBe('carbon');
    expect(derivePlate('some-other-shoe', [], false)).toBe('none');
  });
  it('every override cites its evidence', () => {
    for (const [slug, o] of Object.entries(PLATE_OVERRIDES)) {
      expect(o.note, `${slug} must explain itself`).toMatch(/\S{20,}/);
    }
  });
});
```

Update the import at the top of the file to:

```ts
import { buildDataset, derivePlate, plateFromRules } from '../src/build-dataset.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm -w scraper run test -- build-dataset`
Expected: FAIL — `plateFromRules` is not exported and `plate-overrides.js` does not exist.

- [ ] **Step 3: Create the override map**

Create `scraper/src/plate-overrides.ts`:

```ts
import type { Plate } from '../../shared/types.js';

export interface PlateOverride { plate: Plate; note: string }

// Corrections to RunRepeat's own tagging, hand-maintained — docs/scraping.md §Decisions.
export const PLATE_OVERRIDES: Record<string, PlateOverride> = {
  'salomon-s-lab-spectur': {
    plate: 'carbon',
    note: 'Review: "the plate is made of carbon fibre ... called the energyBLADE Carbon", but the plate fact is unset.',
  },
  'skechers-aero-tempo': {
    plate: 'carbon',
    note: 'Review: "a carbon-infused, H-shaped plate", but the plate fact is unset.',
  },
  'anta-zone-2-90': {
    plate: 'none',
    note: 'Has a Plate section that describes an absence — "ANTA skipped the carbon plate". Confirmed unplated; the only known section-present-but-unplated shoe.',
  },
};
```

- [ ] **Step 4: Rewrite the rule**

This deletes **two** inputs, not one. Alongside `PLATE_TEST_ID`, today's rule also has
`|| features.some((f) => /plate/i.test(f))` → `plated-other`, which the spec never
discusses. Dropping it is safe and checked: across all 464 corpus pages, **zero shoes
carry a `plate` feature string other than "Carbon plate"**, so the branch is
unreachable on real data and the fleet counts in Task 5 Step 3 would catch it if that
ever stopped being true.

In `scraper/src/build-dataset.ts`, delete line 6 (`export const PLATE_TEST_ID = '69';`) and replace the whole `derivePlate` function with:

```ts
export function plateFromRules(features: string[], hasPlateSection: boolean): Plate {
  if (features.some((f) => /carbon plate/i.test(f))) return 'carbon';
  if (hasPlateSection) return 'plated-other';
  return 'none';
}

export function derivePlate(slug: string, features: string[], hasPlateSection: boolean): Plate {
  return PLATE_OVERRIDES[slug]?.plate ?? plateFromRules(features, hasPlateSection);
}
```

Add to the imports at the top of the file:

```ts
import { PLATE_OVERRIDES } from './plate-overrides.js';
```

Remove `MetricValue` from the type import on line 1 if nothing else uses it — typecheck will tell you.

- [ ] **Step 5: Update the call site**

In `scraper/src/build-dataset.ts`, line 40 currently reads:

```ts
      plate: derivePlate(features, m.values[PLATE_TEST_ID]),
```

Replace with:

```ts
      plate: derivePlate(slug, features, det?.hasPlateSection === true),
```

`=== true` matters: records written before Task 4's backfill have no such field, and they must read `false`, not `undefined`.

- [ ] **Step 6: Fix the now-wrong CSV expectation**

`scraper/test/build-dataset.test.ts:249-252` asserts `shoe-002` is `plated-other` because its synthetic test 69 is `true`. Test 69 no longer feeds the rule. `shoe-002` has no details record, so it is now `none`. Replace those lines with:

```ts
    expect(one.startsWith('shoe-001,Shoe 1,,,,,none,false,')).toBe(true);
    // no details record means no plate section, so a metrics-only shoe reads none
    const two = csv.split('\n').find((l) => l.startsWith('shoe-002,'))!;
    expect(two.startsWith('shoe-002,Shoe 2,,,,,none,false,')).toBe(true);
```

- [ ] **Step 7: Run the full suite**

Run: `npm run verify`
Expected: PASS. If another test asserts a `plated-other` that came from test 69, update it the same way — `shoe-000` keeps `carbon` from its `Carbon plate` feature and must not change.

- [ ] **Step 8: Commit**

```bash
git add scraper/src/plate-overrides.ts scraper/src/build-dataset.ts scraper/test/build-dataset.test.ts
git commit -m "Derive plate from the review section, with hand-maintained overrides"
```

---

### Task 3: Fail the build on stale or redundant overrides

**Files:**
- Modify: `scraper/src/validate.ts` (new exported function, after `validateShoesFile`)
- Modify: `scraper/src/build-dataset.ts` (collect rule values, return them)
- Modify: `scraper/src/build-dataset-cli.ts` (run the gate before writing)
- Test: `scraper/test/validate.test.ts`, `scraper/test/build-dataset.test.ts`

**Interfaces:**
- Consumes: `PLATE_OVERRIDES` and `plateFromRules` from Task 2.
- Produces:
  - `validatePlateOverrides(ruleDerived: Map<string, Plate>): void`, throwing `ValidationError`.
  - `buildDataset` gains a third return key, `ruleDerived: Map<string, Plate>`.

**The gate runs in the CLI, not inside `buildDataset`.** The stale check fails any
override slug the dataset does not contain, and all 20 `buildDataset` call sites in
`build-dataset.test.ts` build a synthetic fleet (`shoe-000`…, `ghost-shoe`) holding
none of the three override slugs — gating inside `buildDataset` would fail every one
of them. Padding the fixtures does not rescue it: give the three slugs metrics rows
with no details and `anta-zone-2-90` derives `none`, tripping the *redundancy* branch
instead, and any fixture that encodes today's override list breaks the next time an
override is added or removed. So `buildDataset` stays pure and returns the rule-only
values; the CLI gates on them before it writes, which is where
docs/scraping.md §Validation gates puts a gate anyway ("run before anything is
written, so a failed gate means … untouched `data/`").

- [ ] **Step 1: Write the failing test**

First amend the existing imports at the top of `scraper/test/validate.test.ts`. Extend line 2 rather than adding a second import of the same module, and add `Plate` to the existing type import on line 3:

```ts
import { ValidationError, validateDetailsRecord, validateMetrics, validatePlateOverrides, validateShoesFile } from '../src/validate.js';
import type { MetricsFile, Plate, ShoesFile, TestsFile } from '../../shared/types.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';
```

Then append:

```ts
describe('validatePlateOverrides', () => {
  // every override slug present, and none agreeing with the rules
  const healthy = (): Map<string, Plate> => {
    const m = new Map<string, Plate>();
    for (const [slug, o] of Object.entries(PLATE_OVERRIDES)) {
      m.set(slug, o.plate === 'none' ? 'plated-other' : 'none');
    }
    return m;
  };

  it('passes when every override is present and still needed', () => {
    expect(() => validatePlateOverrides(healthy())).not.toThrow();
  });
  it('rejects an override whose shoe is no longer in the dataset', () => {
    const m = healthy();
    m.delete(Object.keys(PLATE_OVERRIDES)[0]!);
    expect(() => validatePlateOverrides(m)).toThrow(/no longer in the dataset|stale/i);
  });
  it('rejects an override the rules now derive on their own', () => {
    const m = healthy();
    const [slug, o] = Object.entries(PLATE_OVERRIDES)[0]!;
    m.set(slug, o.plate);
    expect(() => validatePlateOverrides(m)).toThrow(/redundant/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm -w scraper run test -- validate`
Expected: FAIL — `validatePlateOverrides` is not exported.

- [ ] **Step 3: Implement the gate**

Add `PLATE_OVERRIDES` to the imports at the **top** of `scraper/src/validate.ts` —
every other file in `scraper/src` keeps its imports there, and a mid-file import
reads as an accident even though ESM allows it:

```ts
import { PLATE_OVERRIDES } from './plate-overrides.js';
```

Then append the function itself:

```ts
// Both cases are fatal rather than warnings: a silently stale override is the failure mode the
// override list exists to avoid (docs/scraping.md §Decisions).
export function validatePlateOverrides(ruleDerived: Map<string, Plate>): void {
  for (const [slug, o] of Object.entries(PLATE_OVERRIDES)) {
    if (!ruleDerived.has(slug)) {
      throw new ValidationError(`plate override for ${slug} is stale: no longer in the dataset`);
    }
    if (ruleDerived.get(slug) === o.plate) {
      throw new ValidationError(`plate override for ${slug} is redundant: the rules already derive ${o.plate}`);
    }
  }
}
```

Add `Plate` to the type import on line 1 of that file.

- [ ] **Step 4: Return the rule-only values from `buildDataset`**

In `scraper/src/build-dataset.ts`, inside `buildDataset`, collect the rule-only value per shoe while mapping. Immediately before the existing `const shoes: Shoe[] = ...` add:

```ts
  const ruleDerived = new Map<string, Plate>();
```

Inside the `.map((slug) => {` body, directly after `const features = det?.features ?? [];` add:

```ts
    ruleDerived.set(slug, plateFromRules(features, det?.hasPlateSection === true));
```

Widen the return type and the final `return` to carry it:

```ts
export function buildDataset(...): { shoesFile: ShoesFile; csv: string; ruleDerived: Map<string, Plate> } {
```

```ts
  return { shoesFile, csv: lines.join('\n') + '\n', ruleDerived };
```

Existing callers destructure only the keys they want, so nothing else breaks.

- [ ] **Step 5: Run the gate in the CLI**

In `scraper/src/build-dataset-cli.ts`, take the third key and gate on it *before* either write:

```ts
  const { shoesFile, csv, ruleDerived } = buildDataset(tests, metrics, details, releaseYears);
  validatePlateOverrides(ruleDerived);
  dir.write('shoes.json', shoesFile);
```

Add the import:

```ts
import { validatePlateOverrides } from './validate.js';
```

The CLI is outside the coverage `include` (`scraper/vitest.config.ts`), so this wiring carries no coverage cost — Step 6 is what proves `buildDataset` hands over the right map.

- [ ] **Step 6: Cover the handover**

`ruleDerived` is the only untested seam between the two halves. Append to the `describe('buildDataset', ...)` block in `scraper/test/build-dataset.test.ts`:

```ts
  it('returns the rule-only plate for every shoe, before overrides', () => {
    const { metrics, details } = baseInputs();
    const { ruleDerived } = buildDataset(tests, metrics, details);
    expect(ruleDerived.size).toBe(320);
    expect(ruleDerived.get('shoe-000')).toBe('carbon'); // its 'Carbon plate' feature
    expect(ruleDerived.get('shoe-002')).toBe('none');   // no details record, so no section
  });
```

- [ ] **Step 7: Run the full suite**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scraper/src/validate.ts scraper/src/build-dataset.ts scraper/src/build-dataset-cli.ts scraper/test/validate.test.ts scraper/test/build-dataset.test.ts
git commit -m "Fail the build on a stale or redundant plate override"
```

---

### Task 4: Offline backfill via `--from-corpus`

**Files:**
- Modify: `scraper/src/scrape-details-main.ts:11-18` (options), `:42-62` (the fetch loop)
- Modify: `scraper/src/scrape-details.ts` (flag plumbing)
- Modify: `CLAUDE.md` (commands line)
- Modify: `docs/scraping.md` (§Politeness)
- Test: `scraper/test/scrape-details.test.ts`

**Interfaces:**
- Consumes: `extractDetails` from Task 1.
- Produces: `ScrapeDetailsOptions.corpusDir?: string`, and `http` becomes optional.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('scrapeDetails', ...)` block in `scraper/test/scrape-details.test.ts`:

```ts
  it('reads pages from a corpus directory and makes no network call at all', async () => {
    const { dir } = setup();
    const corpus = mkdtempSync(join(tmpdir(), 'shoe-corpus-'));
    writeFileSync(join(corpus, 'saucony-endorphin-azura.html'), azuraHtml);

    // no `http` is passed: if the corpus path touched the network it would throw
    const res = await scrapeDetails({ dataDir: dir, corpusDir: corpus, forceAll: true, now: () => 'T5' });

    expect(res.fetched).toEqual(['saucony-endorphin-azura']);
    const rec = dir.read<DetailsFile>('details.json')!.shoes['saucony-endorphin-azura'] as any;
    expect(rec.productId).toBe(41068);
    expect(rec.hasPlateSection).toBe(false);
  });

  it('skips corpus slugs with no file instead of failing them', async () => {
    const { dir } = setup();
    const corpus = mkdtempSync(join(tmpdir(), 'shoe-corpus-'));
    const res = await scrapeDetails({ dataDir: dir, corpusDir: corpus, forceAll: true, now: () => 'T6' });
    expect(res.fetched).toEqual([]);
    expect(res.failed).toEqual([]);
  });

  it('throws when the corpus directory itself is absent', async () => {
    const { dir } = setup();
    // a missing *file* is a skip; a missing *directory* is a typo, and skipping 464 shoes
    // silently would look exactly like a successful backfill
    await expect(scrapeDetails({ dataDir: dir, corpusDir: join(tmpdir(), 'shoe-corpus-nope'), forceAll: true, now: () => 'T7' }))
      .rejects.toThrow(/corpus directory/i);
  });

  it('refuses to run with neither http nor corpusDir', async () => {
    const { dir } = setup();
    await expect(scrapeDetails({ dataDir: dir, forceAll: true, now: () => 'T8' }))
      .rejects.toThrow(/http or corpusDir/i);
  });

  it('keeps the original scrapedAt when re-extracting the same page from the corpus', async () => {
    const { dir, http } = setup();
    await scrapeDetails({ http, dataDir: dir, now: () => 'T0' });
    const corpus = mkdtempSync(join(tmpdir(), 'shoe-corpus-'));
    writeFileSync(join(corpus, 'saucony-endorphin-azura.html'), azuraHtml);

    await scrapeDetails({ dataDir: dir, corpusDir: corpus, forceAll: true, now: () => 'T9' });

    const rec = dir.read<DetailsFile>('details.json')!.shoes['saucony-endorphin-azura'] as any;
    expect(rec.scrapedAt).toBe('T0');        // the page was fetched then; re-reading disk is not a fetch
    expect(rec.hasPlateSection).toBe(false); // but the extractor really did re-run
  });
```

Extend the `node:fs` import at the top of the file to `import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';`.

The last three tests exist because `scrape-details-main.ts` is inside the coverage `include` and each adds a branch: the two guards that keep the zero-requests promise structural rather than incidental, and the `scrapedAt` fallback.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm -w scraper run test -- scrape-details`
Expected: FAIL — `corpusDir` is not a known option, and `http` is required.

- [ ] **Step 3: Make `http` optional and add `corpusDir`**

In `scraper/src/scrape-details-main.ts`, change the options interface:

```ts
export interface ScrapeDetailsOptions {
  http?: PoliteHttp;
  dataDir: DataDir;
  corpusDir?: string;
  forceAll?: boolean;
  slug?: string;
  now?: () => string;
  log?: (msg: string) => void;
}
```

Add to the imports:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
```

and add `isTombstone` to the existing `shared/types.js` import, which is currently type-only — Step 4 needs it as a value.

- [ ] **Step 4: Branch the page source**

In `scrape-details-main.ts`, replace the robots-gate block and the body of the `for` loop's fetch. The robots gate becomes:

```ts
  // The corpus path reads from disk and must never construct a request, so the robots gate —
  // which exists to permit live crawling — does not apply to it (docs/scraping.md §Politeness).
  if (opts.corpusDir) {
    if (!existsSync(opts.corpusDir)) throw new Error(`corpus directory not found: ${opts.corpusDir}`);
  } else if (targets.length > 0) {
    if (!http) throw new Error('scrapeDetails needs either http or corpusDir');
    const rules = parseRobots(await http.getText(`${BASE}/robots.txt`));
    if (!isPathAllowed(rules, '/uk/example-shoe')) throw new Error('robots.txt disallows shoe pages; aborting politely');
  }
```

The directory check is an addition to the design spec's §8, which only says a *slug*
with no file is skipped. A mistyped or wrongly-relative `--from-corpus` would
otherwise skip all 464 shoes, exit 0, and print a line that reads like a clean run.
Missing file → skip; missing directory → stop.

Inside the loop, replace `const html = await http.getText(...)` with:

```ts
      let html: string;
      let scrapedAt = now();
      if (opts.corpusDir) {
        const file = join(opts.corpusDir, `${slug}.html`);
        if (!existsSync(file)) { result.skipped++; continue; }
        html = readFileSync(file, 'utf8');
        // `scrapedAt` records when RunRepeat was read, and re-reading disk is not reading
        // RunRepeat — so the original timestamp stands (docs/scraping.md §Determinism).
        const prior = details.shoes[slug];
        if (prior && !isTombstone(prior)) scrapedAt = prior.scrapedAt;
      } else {
        html = await http!.getText(`${BASE}/uk/${slug}`);
      }
```

and pass it through, replacing the `now()` argument on the next line:

```ts
      const rec = extractDetails(extractPagePayload(html).pageData, slug, scrapedAt);
```

Leave the 404-tombstone `now()` at line 56 alone: a tombstone records when the 404 was
*observed*, which only ever happens on the live path.

- [ ] **Step 5: Plumb the flag**

In `scraper/src/scrape-details.ts`, replace the `scrapeDetails({...})` call's first two option lines with:

```ts
const corpusDir = argOf('--from-corpus');

scrapeDetails({
  http: corpusDir ? undefined : new PoliteHttp(),
  corpusDir,
```

Keep the rest of the call unchanged.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npm run verify`
Expected: PASS. The existing robots-abort test must still pass — it does not set `corpusDir`.

- [ ] **Step 7: Document the new path**

In `CLAUDE.md`, in the **Commands** bullet, change the scraper command list so `scrape:details` reads:

```
scrape:details (--from-corpus <dir> re-extracts from local pages, no network)
```

In `docs/scraping.md` §Politeness, the **Request budget** bullet currently claims
`--force-all` ≈ 465 unconditionally, which the new flag makes false. Amend that
clause to:

```markdown
  `--force-all` ≈ 465 (one page per catalogued shoe) or 0 with `--from-corpus`,
```

Then add, at the end of the same bullet list:

```markdown
- **`scrape:details --from-corpus <dir>` makes no requests at all.** It re-extracts
  from pages already on disk and never constructs a client, so an extractor change
  costs a local re-run rather than a crawl. It is not an exception to the rule above;
  it is outside it. The directory must exist — a missing page is skipped, a missing
  corpus aborts, so a mistyped path cannot look like a clean run. Records keep their
  original `scrapedAt` (§Determinism).
```

Finally, in `docs/scraping.md` §Determinism, after the paragraph defining `builtAt`,
add:

```markdown
`scrapedAt` dates the *fetch*, not the record, so `--from-corpus` re-extraction
preserves whatever the live crawl stamped. `builtAt` therefore answers "how old is
the data" rather than "when did the extractor last run" — the latter is what git
already records. A re-extraction that changed only derived fields moves no dates,
which is also what keeps its data commit legible.
```

- [ ] **Step 8: Commit**

```bash
git add scraper/src/scrape-details-main.ts scraper/src/scrape-details.ts scraper/test/scrape-details.test.ts CLAUDE.md docs/scraping.md
git commit -m "Re-extract details from a local page corpus without crawling"
```

---

### Task 5: Backfill the dataset and finish the docs

**Files:**
- Modify: `data/details.json`, `data/shoes.json`, `data/shoes.csv` (generated — never hand-edited)
- Modify: `docs/scraping.md` (§Data quirks, §Decisions)
- Modify: `BACKLOG.md` (remove item 1)

**Interfaces:**
- Consumes: everything above.
- Produces: the corrected dataset.

- [ ] **Step 1: Re-extract every record from the corpus**

`npm -w scraper` runs the script with cwd `<repo>/scraper`, not the repo root, so a
relative `--from-corpus` resolves against `scraper/`. The corpus lives at the repo
root. Run from the repo root:

```bash
npm -w scraper run scrape:details -- --force-all --from-corpus ../.corpus/pages
```

Expected: `fetched=464 tombstoned=0 skipped=0 failed=0`. This makes **zero** network requests. Task 4's directory check means a wrong path aborts rather than skipping all 464 silently — if it aborts, fix the path; do not fall back to crawling, ask first.

- [ ] **Step 2: Rebuild the dataset**

```bash
npm -w scraper run build:dataset
```

- [ ] **Step 3: Verify the counts match the spec**

```bash
node -e 'const d=require("./data/shoes.json");const t={};for(const s of d.shoes)t[s.plate]=(t[s.plate]||0)+1;console.log(t)'
```

Expected exactly: `{ none: 358, carbon: 72, 'plated-other': 34 }`.

Then spot-check the shoes named in the spec's acceptance criteria:

```bash
node -e 'const d=require("./data/shoes.json");for(const s of ["saucony-endorphin-speed-5","hoka-mach-x-2","brooks-hyperion-max-4","saucony-endorphin-azura","nike-pegasus-41","nike-alphafly-3","asics-metaspeed-sky-paris","salomon-s-lab-spectur","skechers-aero-tempo","anta-zone-2-90"])console.log(s,d.shoes.find(x=>x.slug===s)?.plate)'
```

Expected: `plated-other` for the first three; `none` for Azura and Pegasus 41; `carbon` for Alphafly 3, Metaspeed Sky Paris, S/Lab Spectur and Aero Tempo; `none` for Anta Zone 2 90.

**If any count differs, stop and report rather than adjusting the expected numbers.** They come from the full-corpus analysis in the spec, and a mismatch means a rule bug.

- [ ] **Step 4: Confirm the build is still deterministic**

```bash
npm -w scraper run build:dataset && git diff --stat -- data/shoes.json
```

Expected: no diff from the second run — running the build twice changes nothing.

- [ ] **Step 5: Update the owning doc**

In `docs/scraping.md` §Data quirks, replace the existing plate bullet entirely with:

```markdown
- **Plate detection reads the review section, not the vocabulary.** RunRepeat's
  structured plate fact and its features list both name carbon and nothing else —
  across the whole fleet the fact takes only `carbon-plate`, `false` or absent, so
  nylon and PEBA shoes are untagged. What distinguishes them is that plated shoes
  get a per-shoe "Plate" review section, nested one level inside a parent section
  that varies by shoe. So: carbon feature wins, else a plate section means
  `plated-other`, else `none`. The review prose names the material but cannot be
  parsed for it — most carbon mentions in those sections are negations
  ("rather than carbon fibre"), so a regex that catches the real ones catches more
  false ones. Roughly three shoes in the fleet are tagged wrongly at source and are
  corrected by hand (§Decisions).
```

Then add a new entry at the end of docs/scraping.md §Decisions:

```markdown
### Plate overrides are hand-maintained source, not data
`scraper/src/plate-overrides.ts` corrects the handful of shoes RunRepeat tags
wrongly — a carbon plate its own review describes but its fact omits, or a plate
section that describes an absence. It lives in source rather than `data/` because
`data/` is machine-generated and must not be hand-edited
(docs/decisions.md §Git is the database); in source it gets review, typechecking
and tests. Each entry cites the review sentence justifying it. The list is
corrected by hand when new shoes are reviewed, and `build:dataset` fails if an
entry goes stale or becomes redundant, so it cannot rot silently. Do not grow it
into a general data-patching mechanism: if a whole class of shoes is wrong, fix
the rule.
```

- [ ] **Step 6: Remove the finished backlog item**

In `BACKLOG.md`, delete item 1 ("Fix non-carbon plate detection") and renumber the remaining items so they run 1..10 with no gaps or repeats. Item 2 becomes item 1; update the intro line "items 1–2 fix what the dataset says" to "item 1 fixes what the dataset says". Check the reference in the new item 8 ("Item 2 extracts the per-shoe `category_slug`") and renumber it to match.

- [ ] **Step 7: Verify and commit**

```bash
npm run verify
```

Expected: PASS.

```bash
git add data docs/scraping.md BACKLOG.md
git commit -m "Backfill plate detection across the fleet"
```

Expect the data commit to touch every record but say something narrow: all 464 gain
`hasPlateSection`, 35 shoes change `plate` in `shoes.json`/`shoes.csv`, and **`builtAt`
does not move** — no page was refetched, so no date changes. Four records also drift a
second field (`features` ×3, `whoShouldNotBuy` ×1) because the corpus snapshot is not
byte-identical to the original crawl; that is real and worth a glance in the diff, which
is exactly what preserving `scrapedAt` keeps visible. If `builtAt` *does* move, the
corpus path fell back to `now()` somewhere — find out why before committing.

---

## Verification checklist

Run before declaring the plan complete:

- [ ] `npm run verify` passes.
- [ ] `npm -w app run e2e` passes. It cannot observe this change — e2e serves its own
      committed `app/e2e/fixtures/shoes.json`, and the `Shoe` shape is unchanged — so
      run it as a regression check on CI's one step outside `verify`, not as evidence
      that the backfill worked. Task 5 Steps 3–4 are that evidence.
- [ ] `data/shoes.json` reads `none: 358, carbon: 72, plated-other: 34`.
- [ ] Running `build:dataset` twice produces no diff.
- [ ] The backfill made zero network requests, and `builtAt` is unchanged — the two
      are the same claim seen from either end.
- [ ] `grep -rn "PLATE_TEST_ID" scraper/` returns nothing.

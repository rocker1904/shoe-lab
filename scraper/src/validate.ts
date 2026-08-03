import type { DetailRecord, DetailsFile, LabTest, MetricsFile, Plate, Shoe, ShoesFile, TestsFile, Tombstone } from '../../shared/types.js';
import { isTombstone } from '../../shared/types.js';
import { PLATE_OVERRIDES } from './plate-overrides.js';

export class ValidationError extends Error {}

const NUMERIC = new Set(['float', 'score', 'percent', 'rating']);

/** The absolute shoe-count floor, applied both before and after the join (docs/scraping.md §Validation gates). */
export const MIN_SHOES = 300;

interface CatalogueEntry { type: LabTest['type']; choices: Set<string> | null }

/**
 * The by-test-id index every value gate needs, built so that a catalogue no index can represent
 * fails the run on the way in: a value declared twice inside one `option` test has no downstream
 * resolution (docs/scraping.md §A duplicate option value fails the run), and a test declared twice
 * under one id or one slug has none either (docs/scraping.md §A test declared twice fails the run).
 * Every path that writes a catalogue goes through here: a test nothing reads yet still reaches
 * `data/`.
 */
function indexCatalogue(tests: LabTest[]): Map<string, CatalogueEntry> {
  const index = new Map<string, CatalogueEntry>();
  const slugs = new Set<string>();
  for (const t of tests) {
    // The repeated id is the fault nothing downstream reports (docs/scraping.md §A test declared twice fails the run).
    if (index.has(String(t.id))) throw new ValidationError(`test id ${t.id} declared twice (${t.slug})`);
    if (slugs.has(t.slug)) throw new ValidationError(`test slug ${t.slug} declared twice (id ${t.id})`);
    slugs.add(t.slug);
    let choices: Set<string> | null = null;
    if (t.options) {
      choices = new Set();
      for (const o of t.options) {
        if (choices.has(o.value)) throw new ValidationError(`test ${t.slug} declares option ${JSON.stringify(o.value)} twice`);
        choices.add(o.value);
      }
    }
    index.set(String(t.id), { type: t.type, choices });
  }
  return index;
}

/**
 * Every reading names a test the catalogue has, and matches that test's declared type. Separate
 * from the floors below because the catalogue can be rewritten without the readings moving —
 * `scrape:metrics --from-corpus` does exactly that (docs/scraping.md §Re-extracting from a corpus).
 */
export function validateValuesAgainstCatalogue(shoes: MetricsFile['shoes'], tests: TestsFile): void {
  const index = indexCatalogue(tests.tests);
  for (const [slug, shoe] of Object.entries(shoes)) {
    for (const [testId, value] of Object.entries(shoe.values)) {
      const t = index.get(testId)?.type;
      if (!t) throw new ValidationError(`${slug}: value for unknown test ${testId}`);
      const ok = NUMERIC.has(t) ? typeof value === 'number'
        : t === 'bool' ? typeof value === 'boolean'
        : typeof value === 'string';
      if (!ok) throw new ValidationError(`${slug}: test ${testId} has ${typeof value}, expected ${t}`);
    }
  }
}

export function validateMetrics(next: MetricsFile, prev: MetricsFile | null, tests: TestsFile): void {
  const count = Object.keys(next.shoes).length;
  if (count < MIN_SHOES) throw new ValidationError(`only ${count} shoes (<${MIN_SHOES})`);
  if (tests.tests.length < 50) throw new ValidationError(`only ${tests.tests.length} tests (<50)`);
  validateValuesAgainstCatalogue(next.shoes, tests);
  if (prev) {
    const prevCount = Object.keys(prev.shoes).length;
    if (prevCount > 0 && count < prevCount * 0.9) {
      throw new ValidationError(`shoe count shrank ${prevCount} -> ${count}`);
    }
    let prevPairs = 0;
    let vanished = 0;
    for (const [slug, shoe] of Object.entries(prev.shoes)) {
      for (const testId of Object.keys(shoe.values)) {
        prevPairs++;
        if (next.shoes[slug]?.values[testId] === undefined) vanished++;
      }
    }
    if (prevPairs > 0 && vanished / prevPairs > 0.2) {
      throw new ValidationError(`${vanished}/${prevPairs} (slug,test) pairs vanished (>20%)`);
    }
  }
}

export function validateDetailsRecord(rec: DetailRecord | Tombstone, slug: string): void {
  if (isTombstone(rec)) return;
  if (!rec.name) throw new ValidationError(`${slug}: empty name`);
  if (!Number.isInteger(rec.productId) || rec.productId <= 0) throw new ValidationError(`${slug}: bad productId`);
}

const PLATES = new Set(['carbon', 'plated-other', 'none']);

export function validateShoesFile(f: ShoesFile): void {
  if (!f.builtAt) throw new ValidationError('builtAt missing');
  if (!Array.isArray(f.tests) || !Array.isArray(f.shoes)) throw new ValidationError('tests/shoes must be arrays');
  // A published `option` reading has to name one of the choices its test declares, or the app
  // prints a value it cannot label and offers it as a filter beside the vocabulary it is not in.
  // The index is the same one the metrics paths build, so the join cannot publish a catalogue
  // shape they would have refused to write.
  const index = indexCatalogue(f.tests);
  for (const s of f.shoes) {
    if (!s.slug || !s.name) throw new ValidationError(`shoe missing slug/name: ${JSON.stringify(s.slug)}`);
    if (!s.values || typeof s.values !== 'object') throw new ValidationError(`${s.slug}: values missing`);
    if (!PLATES.has(s.plate)) throw new ValidationError(`${s.slug}: bad plate ${String(s.plate)}`);
    for (const [testId, value] of Object.entries(s.values)) {
      // Published tests are the catalogue's, filtered to those with a reading — so a reading no
      // published test claims is one the catalogue itself has lost.
      const entry = index.get(testId);
      if (!entry) throw new ValidationError(`${s.slug}: value for unknown test ${testId}`);
      const choices = entry.choices;
      if (choices && !choices.has(String(value))) {
        throw new ValidationError(`${s.slug}: test ${testId} has ${JSON.stringify(value)}, not a declared option`);
      }
    }
  }
}

/** Bounds on how far one run may move the fleet — derivation in docs/scraping.md §Validation gates. */
const MIN_FLEET_RATIO = 0.95;
const MAX_VANISHED_PAIRS = 0.05;
const MIN_PLATE_CLASS_RATIO = 0.75;
const PLATE_CLASS_FLOOR = 20;
const MIN_PROSE_RATIO = 0.9;

const PROSE_FIELDS = ['pros', 'cons', 'intro'] as const;

function plateCounts(shoes: Shoe[]): Map<Plate, number> {
  const out = new Map<Plate, number>();
  for (const s of shoes) out.set(s.plate, (out.get(s.plate) ?? 0) + 1);
  return out;
}

function proseShare(shoes: Shoe[], field: typeof PROSE_FIELDS[number]): number {
  if (shoes.length === 0) return 0;
  return shoes.filter((s) => (s.details?.[field].length ?? 0) > 0).length / shoes.length;
}

/**
 * Previous-run-relative bounds on the aggregates a fleet-wide payload drift moves. `extractDetails`
 * degrades field by field on purpose — a missing block is a null, not a throw — so a renamed or
 * moved key reaches the join as a fleet of empty fields that every absolute gate accepts. Only the
 * comparison with what was published last time can see it. Thresholds and why each is where it is:
 * docs/scraping.md §Validation gates.
 */
export function validateFleetAgainstPrevious(next: ShoesFile, prev: ShoesFile, details: DetailsFile): void {
  if (next.shoes.length < prev.shoes.length * MIN_FLEET_RATIO) {
    throw new ValidationError(`fleet shrank ${prev.shoes.length} -> ${next.shoes.length} (below ${MIN_FLEET_RATIO * 100}%)`);
  }

  // A shoe joins the fleet on the strength of a page read since the last build. One whose record
  // was already on disk then was excluded by a rule that has stopped biting — the category
  // discriminator going null fleet-wide reads exactly like this (§Non-running shoes).
  const published = new Set(prev.shoes.map((s) => s.slug));
  for (const s of next.shoes) {
    if (published.has(s.slug)) continue;
    const rec = Object.hasOwn(details.shoes, s.slug) ? details.shoes[s.slug] : undefined;
    if (rec && rec.scrapedAt <= prev.builtAt) {
      throw new ValidationError(`${s.slug} readmitted on a details record older than the previous build`);
    }
  }

  const valuesOf = new Map(next.shoes.map((s) => [s.slug, s.values]));
  let pairs = 0;
  let vanished = 0;
  for (const s of prev.shoes) {
    for (const testId of Object.keys(s.values)) {
      pairs++;
      if (valuesOf.get(s.slug)?.[testId] === undefined) vanished++;
    }
  }
  if (pairs > 0 && vanished / pairs > MAX_VANISHED_PAIRS) {
    throw new ValidationError(`${vanished}/${pairs} published (slug,test) pairs vanished (>${MAX_VANISHED_PAIRS * 100}%)`);
  }

  const platesNow = plateCounts(next.shoes);
  for (const [plate, was] of plateCounts(prev.shoes)) {
    // A class the fleet barely has cannot lose a meaningful share of itself.
    if (was < PLATE_CLASS_FLOOR) continue;
    const now = platesNow.get(plate) ?? 0;
    if (now < was * MIN_PLATE_CLASS_RATIO) throw new ValidationError(`plate ${plate} fell ${was} -> ${now}`);
  }

  for (const field of PROSE_FIELDS) {
    const was = proseShare(prev.shoes, field);
    const now = proseShare(next.shoes, field);
    if (was > 0 && now < was * MIN_PROSE_RATIO) {
      throw new ValidationError(`${field} present on ${(now * 100).toFixed(1)}% of shoes, was ${(was * 100).toFixed(1)}%`);
    }
  }
}

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

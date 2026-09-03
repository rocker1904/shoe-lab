import type { DetailRecord, DetailsFile, LabTest, MetricsFile, Plate, Shoe, ShoesFile, TestsFile, Tombstone } from '../../shared/types.js';
import { isIdReferenceToken } from '../../shared/id-reference.js';
import { methodStatusOf, validateMethodStatuses } from './method-status.js';
import { PLATE_OVERRIDES } from './plate-overrides.js';
import { sanitizeHtml } from './sanitize.js';

export class ValidationError extends Error {}

const NUMERIC = new Set(['float', 'score', 'percent', 'rating']);
const TEST_TYPES = new Set(['float', 'score', 'percent', 'bool', 'rating', 'option', 'text']);
const RELEASE_SOURCES = new Set(['page', 'curated', 'page-estimated', 'listing']);

/** The absolute shoe-count floor, applied both before and after the join (docs/scraping.md §Validation gates). */
export const MIN_SHOES = 300;

interface CatalogueEntry { type: LabTest['type']; choices: Set<string> | null }

type JsonObject = Record<string, unknown>;

function objectAt(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} must be an object`);
  }
  return value as JsonObject;
}

function stringAt(value: unknown, path: string, nonEmpty = false): string {
  if (typeof value !== 'string' || (nonEmpty && value === '')) {
    throw new ValidationError(`${path} must be ${nonEmpty ? 'a non-empty string' : 'a string'}`);
  }
  return value;
}

function nullableStringAt(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringAt(value, path);
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`${path} must be a boolean`);
  return value;
}

function finiteNumberAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${path} must be a finite number`);
  }
  return value;
}

function nullableFiniteNumberAt(value: unknown, path: string): number | null {
  if (value === null) return null;
  return finiteNumberAt(value, path);
}

function positiveIntegerAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${path} must be a positive integer`);
  }
  return value;
}

function nullablePositiveIntegerAt(value: unknown, path: string): number | null {
  if (value === null) return null;
  return positiveIntegerAt(value, path);
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ValidationError(`${path} must be an array`);
  return value;
}

function stringArrayAt(value: unknown, path: string): string[] {
  const values = arrayAt(value, path);
  for (let i = 0; i < values.length; i++) stringAt(values[i], `${path}[${i}]`);
  return values as string[];
}

function stringRecordAt(value: unknown, path: string): Record<string, string> {
  const record = objectAt(value, path);
  for (const [key, item] of Object.entries(record)) stringAt(item, `${path}.${key}`);
  return record as Record<string, string>;
}

function isGregorianDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
}

function nullableDateAt(value: unknown, path: string): string | null {
  if (value === null) return null;
  const date = stringAt(value, path);
  if (!isGregorianDate(date)) throw new ValidationError(`${path} must be a real YYYY-MM-DD`);
  return date;
}

function nullableSanitizedHtmlAt(value: unknown, path: string): string | null {
  const html = nullableStringAt(value, path);
  if (html !== null && sanitizeHtml(html) !== html) {
    throw new ValidationError(`${path} must already be sanitised HTML`);
  }
  return html;
}

function versionRefAt(value: unknown, path: string): void {
  if (value === null) return;
  const ref = objectAt(value, path);
  stringAt(ref.slug, `${path}.slug`, true);
  stringAt(ref.name, `${path}.name`, true);
}

function factsAt(value: unknown, path: string): void {
  const facts = objectAt(value, path);
  for (const [factSlug, rawValues] of Object.entries(facts)) {
    const values = arrayAt(rawValues, `${path}.${factSlug}`);
    const slugs = new Set<string>();
    for (let i = 0; i < values.length; i++) {
      const factPath = `${path}.${factSlug}[${i}]`;
      const fact = objectAt(values[i], factPath);
      const slug = stringAt(fact.slug, `${path}.${factSlug}.slug`, true);
      stringAt(fact.text, `${path}.${factSlug}.text`, true);
      if (slugs.has(slug)) throw new ValidationError(`${path}.${factSlug}.slug ${JSON.stringify(slug)} declared twice`);
      slugs.add(slug);
    }
  }
}

function validateLabTests(value: unknown, groups: Record<string, string>, path: string): LabTest[] {
  const rawTests = arrayAt(value, path);
  const tests = rawTests as LabTest[];
  for (let i = 0; i < rawTests.length; i++) {
    const testPath = `${path}[${i}]`;
    const test = objectAt(rawTests[i], testPath);
    const id = positiveIntegerAt(test.id, `${testPath}.id`);
    if (typeof test.slug !== 'string' || !isIdReferenceToken(test.slug)) {
      throw new ValidationError(`test id ${id} has invalid slug ${JSON.stringify(test.slug)}`);
    }
    const slug = test.slug;
    stringAt(test.name, `${testPath}.name`);
    const type = stringAt(test.type, `${testPath}.type`);
    if (!TEST_TYPES.has(type)) throw new ValidationError(`${testPath}.type has invalid value ${JSON.stringify(type)}`);
    stringAt(test.units, `${testPath}.units`);
    const groupId = nullableStringAt(test.groupId, `${testPath}.groupId`);
    if (groupId !== null && !Object.hasOwn(groups, groupId)) {
      throw new ValidationError(`${testPath}.groupId ${JSON.stringify(groupId)} is not declared`);
    }
    nullableStringAt(test.chartLabel, `${testPath}.chartLabel`);
    booleanAt(test.isNew, `${testPath}.isNew`);
    nullablePositiveIntegerAt(test.previousId, `${testPath}.previousId`);
    nullablePositiveIntegerAt(test.updateId, `${testPath}.updateId`);
    if (test.methodStatus !== null && test.methodStatus !== 'retired') {
      throw new ValidationError(`${testPath}.methodStatus has invalid value ${JSON.stringify(test.methodStatus)}`);
    }
    nullablePositiveIntegerAt(test.primaryTestId, `${testPath}.primaryTestId`);
    const secondary = arrayAt(test.secondaryTestIds, `${testPath}.secondaryTestIds`);
    const secondaryIds = new Set<number>();
    for (let j = 0; j < secondary.length; j++) {
      const secondaryId = positiveIntegerAt(secondary[j], `${testPath}.secondaryTestIds[${j}]`);
      if (secondaryId === id) throw new ValidationError(`${testPath}.secondaryTestIds names its own test id ${id}`);
      if (secondaryIds.has(secondaryId)) throw new ValidationError(`${testPath}.secondaryTestIds repeats ${secondaryId}`);
      secondaryIds.add(secondaryId);
    }
    if (test.options !== null) {
      const options = arrayAt(test.options, `${testPath}.options`);
      if (type !== 'option') throw new ValidationError(`${testPath}.options is present on non-option test ${slug}`);
      for (let j = 0; j < options.length; j++) {
        const optionPath = `${testPath}.options[${j}]`;
        const option = objectAt(options[j], optionPath);
        stringAt(option.value, `${optionPath}.value`, true);
        stringAt(option.name, `${optionPath}.name`);
      }
    }
  }

  return tests;
}

function validateTestsFileShape(value: unknown): TestsFile {
  const file = objectAt(value, 'catalogue');
  stringAt(file.scrapedAt, 'catalogue.scrapedAt');
  stringAt(file.seedSlug, 'catalogue.seedSlug');
  const groups = stringRecordAt(file.groups, 'catalogue.groups');
  validateLabTests(file.tests, groups, 'catalogue.tests');
  return value as TestsFile;
}

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
    const resolvedStatus = methodStatusOf(t);
    if (t.methodStatus !== resolvedStatus) {
      throw new ValidationError(`${t.slug}: methodStatus ${JSON.stringify(t.methodStatus)} disagrees with resolved ${JSON.stringify(resolvedStatus)}`);
    }
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

function validatedCatalogueIndex(tests: TestsFile, previousTests?: TestsFile | null): Map<string, CatalogueEntry> {
  validateTestsFileShape(tests);
  validateMethodStatuses(tests.tests, previousTests?.tests);
  return indexCatalogue(tests.tests);
}

/** The live crawl calls this before readings so a known-invalid catalogue spends no lab-list requests. */
export function validateCatalogue(tests: TestsFile, previousTests?: TestsFile | null): void {
  validatedCatalogueIndex(tests, previousTests);
}

/**
 * Every reading names a test the catalogue has, and matches that test's declared type. Separate
 * from the floors below because the catalogue can be rewritten without the readings moving —
 * `scrape:metrics --from-corpus` does exactly that (docs/scraping.md §Re-extracting from a corpus).
 */
export function validateValuesAgainstCatalogue(shoes: MetricsFile['shoes'], tests: TestsFile, previousTests?: TestsFile | null): void {
  const index = validatedCatalogueIndex(tests, previousTests);
  const records = objectAt(shoes, 'shoes');
  for (const [slug, rawShoe] of Object.entries(records)) {
    if (slug === '') throw new ValidationError('shoe slug must be non-empty');
    const shoe = objectAt(rawShoe, `${slug}`);
    stringAt(shoe.name, `${slug}.name`, true);
    stringAt(shoe.url, `${slug}.url`, true);
    const values = objectAt(shoe.values, `${slug}.values`);
    for (const [testId, value] of Object.entries(values)) {
      const entry = index.get(testId);
      if (!entry) throw new ValidationError(`${slug}: value for unknown test ${testId}`);
      validateReading(value, entry, `${slug}: test ${testId}`);
    }
  }
}

function validateReading(value: unknown, entry: CatalogueEntry, path: string): void {
  const type = entry.type;
  const ok = NUMERIC.has(type) ? typeof value === 'number' && Number.isFinite(value)
    : type === 'bool' ? typeof value === 'boolean'
    : typeof value === 'string';
  if (!ok) throw new ValidationError(`${path} has invalid value, expected ${type}`);
}

export function validateMetrics(next: MetricsFile, prev: MetricsFile | null, tests: TestsFile, previousTests?: TestsFile | null): void {
  const file = objectAt(next, 'metrics');
  stringAt(file.scrapedAt, 'metrics.scrapedAt');
  objectAt(file.shoes, 'metrics.shoes');
  validateValuesAgainstCatalogue(next.shoes, tests, previousTests);
  const count = Object.keys(next.shoes).length;
  if (count < MIN_SHOES) throw new ValidationError(`only ${count} shoes (<${MIN_SHOES})`);
  if (tests.tests.length < 50) throw new ValidationError(`only ${tests.tests.length} tests (<50)`);
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
  const record = objectAt(rec, slug);
  if (record.gone === true) {
    stringAt(record.scrapedAt, `${slug}.scrapedAt`);
    return;
  }
  stringAt(record.scrapedAt, `${slug}.scrapedAt`);
  positiveIntegerAt(record.productId, `${slug}.productId`);
  stringAt(record.name, `${slug}.name`, true);
  nullableStringAt(record.brand, `${slug}.brand`);
  nullableDateAt(record.releasedAt, `${slug}.releasedAt`);
  booleanAt(record.preciseReleaseDate, `${slug}.preciseReleaseDate`);
  nullableFiniteNumberAt(record.score, `${slug}.score`);
  nullableFiniteNumberAt(record.msrpGbp, `${slug}.msrpGbp`);
  booleanAt(record.discontinued, `${slug}.discontinued`);
  nullableStringAt(record.imageUrl, `${slug}.imageUrl`);
  stringAt(record.runrepeatUrl, `${slug}.runrepeatUrl`, true);
  stringArrayAt(record.features, `${slug}.features`);
  stringArrayAt(record.pros, `${slug}.pros`);
  stringArrayAt(record.cons, `${slug}.cons`);
  stringAt(record.intro, `${slug}.intro`);
  booleanAt(record.hasPlateSection, `${slug}.hasPlateSection`);
  nullableSanitizedHtmlAt(record.whoShouldBuy, `${slug}.whoShouldBuy`);
  nullableSanitizedHtmlAt(record.whoShouldNotBuy, `${slug}.whoShouldNotBuy`);
  nullableStringAt(record.categorySlug, `${slug}.categorySlug`);
  factsAt(record.facts, `${slug}.facts`);
  const pageValues = objectAt(record.pageValues, `${slug}.pageValues`);
  for (const [testId, value] of Object.entries(pageValues)) {
    if (typeof value !== 'string' && typeof value !== 'boolean') {
      throw new ValidationError(`${slug}.pageValues.${testId} must be a string or boolean`);
    }
  }
  versionRefAt(record.previousVersion, `${slug}.previousVersion`);
  versionRefAt(record.latestVersion, `${slug}.latestVersion`);
}

const PLATES = new Set(['carbon', 'plated-other', 'none']);

export function validateShoesFile(f: ShoesFile): void {
  const file = objectAt(f, 'shoes file');
  stringAt(file.builtAt, 'builtAt', true);
  if (file.source !== 'RunRepeat') throw new ValidationError(`source must be "RunRepeat"`);
  const groups = stringRecordAt(file.groups, 'groups');
  const tests = validateLabTests(file.tests, groups, 'tests');
  const shoes = arrayAt(file.shoes, 'shoes');
  // A published `option` reading has to name one of the choices its test declares, or the app
  // prints a value it cannot label and offers it as a filter beside the vocabulary it is not in.
  // The index is the same one the metrics paths build, so the join cannot publish a catalogue
  // shape they would have refused to write.
  const index = indexCatalogue(tests);
  const slugs = new Set<string>();
  for (let i = 0; i < shoes.length; i++) {
    const rawShoe = objectAt(shoes[i], `shoes[${i}]`);
    const slug = stringAt(rawShoe.slug, `shoes[${i}].slug`, true);
    if (slugs.has(slug)) throw new ValidationError(`shoe slug ${JSON.stringify(slug)} declared twice`);
    slugs.add(slug);
    stringAt(rawShoe.name, `${slug}.name`, true);
    nullableStringAt(rawShoe.brand, `${slug}.brand`);
    stringAt(rawShoe.url, `${slug}.url`, true);
    const releasedAt = nullableDateAt(rawShoe.releasedAt, `${slug}.releasedAt`);
    const releaseSource = rawShoe.releaseDateSource;
    if (releaseSource !== null && (typeof releaseSource !== 'string' || !RELEASE_SOURCES.has(releaseSource))) {
      throw new ValidationError(`${slug}.releaseDateSource has invalid value ${JSON.stringify(releaseSource)}`);
    }
    if (releasedAt !== null && releaseSource === null) throw new ValidationError(`${slug}.releaseDateSource is null for a date`);
    if (releasedAt === null && releaseSource !== null) throw new ValidationError(`${slug}.releasedAt is null for source ${releaseSource}`);
    if (releaseSource === 'curated' && !releasedAt!.endsWith('-01')) {
      throw new ValidationError(`${slug}: curated releasedAt must be the first of a month`);
    }
    if (releaseSource === 'listing' && !releasedAt!.endsWith('-01-01')) {
      throw new ValidationError(`${slug}: listing releasedAt must be the first of a year`);
    }
    nullableFiniteNumberAt(rawShoe.score, `${slug}.score`);
    nullableFiniteNumberAt(rawShoe.msrpGbp, `${slug}.msrpGbp`);
    booleanAt(rawShoe.discontinued, `${slug}.discontinued`);
    if (typeof rawShoe.plate !== 'string' || !PLATES.has(rawShoe.plate)) {
      throw new ValidationError(`${slug}.plate has invalid value ${String(rawShoe.plate)}`);
    }
    nullableStringAt(rawShoe.imageUrl, `${slug}.imageUrl`);
    const values = objectAt(rawShoe.values, `${slug}.values`);
    if (rawShoe.details !== null) {
      const details = objectAt(rawShoe.details, `${slug}.details`);
      stringArrayAt(details.pros, `${slug}.details.pros`);
      stringArrayAt(details.cons, `${slug}.details.cons`);
      stringAt(details.intro, `${slug}.details.intro`);
      nullableSanitizedHtmlAt(details.whoShouldBuy, `${slug}.details.whoShouldBuy`);
      nullableSanitizedHtmlAt(details.whoShouldNotBuy, `${slug}.details.whoShouldNotBuy`);
      stringArrayAt(details.features, `${slug}.details.features`);
    }
    factsAt(rawShoe.facts, `${slug}.facts`);
    versionRefAt(rawShoe.previousVersion, `${slug}.previousVersion`);
    versionRefAt(rawShoe.nextVersion, `${slug}.nextVersion`);
    versionRefAt(rawShoe.latestVersion, `${slug}.latestVersion`);
    nullableStringAt(rawShoe.reviewLanguage, `${slug}.reviewLanguage`);
    for (const [testId, value] of Object.entries(values)) {
      // Published tests are the catalogue's, filtered to those with a reading — so a reading no
      // published test claims is one the catalogue itself has lost.
      const entry = index.get(testId);
      if (!entry) throw new ValidationError(`${slug}: value for unknown test ${testId}`);
      validateReading(value, entry, `${slug}: test ${testId}`);
      const choices = entry.choices;
      if (choices && !choices.has(String(value))) {
        throw new ValidationError(`${slug}: test ${testId} has ${JSON.stringify(value)}, not a declared option`);
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

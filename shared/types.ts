export type TestType = 'float' | 'score' | 'percent' | 'bool' | 'rating' | 'option' | 'text';
/**
 * `previousId`/`updateId` are RunRepeat's own supersession chain and `primaryTestId`/
 * `secondaryTestIds` its heel/forefoot pairing; both are carried raw for a later presentation
 * pass (docs/scraping.md §Test lineage). Readings are **not** comparable across a supersession.
 */
export interface LabTest {
  id: number; slug: string; name: string; type: TestType; units: string; groupId: string | null;
  chartLabel: string | null; isNew: boolean;
  previousId: number | null; updateId: number | null;
  primaryTestId: number | null; secondaryTestIds: number[];
  /** Declared choices for an `option` test. Readings store the `value` slug, so this is what turns
   *  `both-sides-semi` into "Both sides (semi)" (docs/scraping.md §Option-typed readings). */
  options: { value: string; name: string }[] | null;
}
export interface TestsFile {
  scrapedAt: string; seedSlug: string;
  groups: Record<string, string>;
  tests: LabTest[];
}
export type MetricValue = number | string | boolean;
export interface MetricsShoe { name: string; url: string; values: Record<string, MetricValue> }
export interface MetricsFile { scrapedAt: string; shoes: Record<string, MetricsShoe> }
/** One value of one editorial fact, slug-keyed so display text can change without breaking state. */
export interface FactValue { slug: string; text: string }
/** A sibling model. Every reference RunRepeat emits names a shoe the catalogue also covers. */
export interface VersionRef { slug: string; name: string }
export interface DetailRecord {
  scrapedAt: string; productId: number; name: string; brand: string | null;
  releasedAt: string | null; preciseReleaseDate: boolean;
  score: number | null; msrpGbp: number | null; discontinued: boolean;
  imageUrl: string | null; runrepeatUrl: string;
  features: string[]; pros: string[]; cons: string[]; intro: string;
  hasPlateSection: boolean;
  whoShouldBuy: string | null; whoShouldNotBuy: string | null;
  /** RunRepeat's own category; null when the page did not state one (docs/scraping.md §Non-running shoes). */
  categorySlug: string | null;
  /** Editorial facts keyed by fact slug — RunRepeat's labels, not measurements (docs/scraping.md §Editorial facts). */
  facts: Record<string, FactValue[]>;
  /** `option`-typed readings the page carries, keyed by test id as string. The metrics API never
   *  fetches these, so the page is the only source (docs/scraping.md §Option-typed readings). */
  optionValues: Record<string, string>;
  /** The immediately preceding model. `latestVersion` is the newest in the line and may skip generations. */
  previousVersion: VersionRef | null;
  latestVersion: VersionRef | null;
}
export interface Tombstone { gone: true; scrapedAt: string }
export interface DetailsFile {
  shoes: Record<string, DetailRecord | Tombstone>;
  /** Test id (as string) to group id, unioned over every page crawled (docs/scraping.md §Test groups). */
  testGroups?: Record<string, string>;
}
/** The year-only fallback behind every imprecise `releasedAt` (docs/scraping.md §Release-year supplement). */
export interface ReleaseYearsFile { scrapedAt: string; years: Record<string, number> }
export type Plate = 'carbon' | 'plated-other' | 'none';
export interface ShoeDetails {
  pros: string[]; cons: string[]; intro: string;
  whoShouldBuy: string | null; whoShouldNotBuy: string | null; features: string[];
}
/**
 * Where a shoe's `releasedAt` came from, in precedence order — `page` is RunRepeat's own
 * confirmed date, `curated` a hand-researched month we cited, `page-estimated` RunRepeat's own
 * date flagged imprecise, `listing` a year from the category listing materialised as 1 January
 * (docs/scraping.md §Release-date provenance). Null only when no source had a date at all.
 */
export type ReleaseDateSource = 'page' | 'curated' | 'page-estimated' | 'listing';
export interface Shoe {
  slug: string; name: string; brand: string | null; url: string;
  releasedAt: string | null; releaseDateSource: ReleaseDateSource | null;
  score: number | null; msrpGbp: number | null;
  discontinued: boolean; plate: Plate; imageUrl: string | null;
  values: Record<string, MetricValue>;
  details: ShoeDetails | null;
  facts: Record<string, FactValue[]>;
  /** `nextVersion` is derived by inverting the fleet's `previousVersion` links, not scraped. */
  previousVersion: VersionRef | null;
  nextVersion: VersionRef | null;
  latestVersion: VersionRef | null;
  /**
   * BCP-47 tag of the editorial prose when it is not the page's own en-GB — RunRepeat has
   * published a handful of reviews in the wrong language (docs/scraping.md §Review language).
   */
  reviewLanguage: string | null;
}
export interface ShoesFile {
  builtAt: string; source: 'RunRepeat';
  groups: Record<string, string>; tests: LabTest[]; shoes: Shoe[];
}
export function isTombstone(r: DetailRecord | Tombstone): r is Tombstone {
  return 'gone' in r && r.gone === true;
}

import { ValidationError } from './validate.js';

/**
 * A hand-curated release month, cited. The file is JSONL rather than a TypeScript module because
 * it holds hundreds of entries with prose quotes: appends are safe, diffs are one line per shoe,
 * and a malformed quote is a validation error rather than a syntax error that breaks the build
 * (docs/scraping.md §Curated release months).
 */
export interface CuratedDate {
  slug: string;
  /** `YYYY-MM`, or null when the shoe was looked at and no month could be evidenced. */
  month: string | null;
  reliability: string;
  sources?: { url?: string; quote?: string }[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** `unresolved*` rows are kept in the file as a record of what was searched, and carry no month. */
const USABLE = new Set(['ok', 'suspect']);

/**
 * Parses the curated file into slug → `YYYY-MM`, keeping only rows that can actually date a shoe.
 * Throws rather than skipping on malformed input: a curated month outranks RunRepeat's own data,
 * so a row we cannot read is a reason to stop, not to shrug (docs/scraping.md §Validation gates).
 */
export function parseCuratedDates(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    let row: CuratedDate;
    try {
      row = JSON.parse(line) as CuratedDate;
    } catch {
      throw new ValidationError(`curated line ${i + 1}: not valid JSON`);
    }
    if (typeof row.slug !== 'string' || row.slug === '') {
      throw new ValidationError(`curated line ${i + 1}: missing slug`);
    }
    if (out.has(row.slug)) throw new ValidationError(`curated: duplicate slug ${row.slug}`);
    if (row.month === null || row.month === undefined) {
      out.set(row.slug, ''); // seen, deliberately undated — recorded so the slug still counts as known
      continue;
    }
    if (!MONTH.test(row.month)) {
      throw new ValidationError(`curated ${row.slug}: month ${row.month} is not YYYY-MM`);
    }
    if (!USABLE.has(row.reliability)) {
      throw new ValidationError(`curated ${row.slug}: month present but reliability is ${row.reliability}`);
    }
    // A month that outranks RunRepeat has to be traceable, or the provenance means nothing.
    const cited = (row.sources ?? []).some((s) => typeof s?.url === 'string' && s.url.startsWith('https://')
      && typeof s?.quote === 'string' && s.quote.trim() !== '');
    if (!cited) throw new ValidationError(`curated ${row.slug}: month present but no cited https source`);
    out.set(row.slug, row.month);
  }
  return out;
}

/**
 * Both cases are fatal rather than warnings, for the reason plate overrides are
 * (docs/scraping.md §Decisions): a curated file that silently diverges from the fleet is worse
 * than a red build, because it outranks the scraped data wherever it applies.
 */
export function validateCuratedDates(curated: Map<string, string>, pageDated: Map<string, boolean>): void {
  for (const [slug, month] of curated) {
    if (!pageDated.has(slug)) {
      throw new ValidationError(`curated entry for ${slug} is stale: no longer in the dataset`);
    }
    // `page` outranks `curated`, so an entry on a precisely-dated shoe can never take effect.
    if (month !== '' && pageDated.get(slug) === true) {
      throw new ValidationError(`curated entry for ${slug} is unusable: the page already gives a precise date`);
    }
  }
}

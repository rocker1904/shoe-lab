import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, derivePlate, plateFromRules } from '../src/build-dataset.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';
import { REVIEW_LANGUAGE_OVERRIDES } from '../src/review-language-overrides.js';
import { ValidationError } from '../src/validate.js';
import type { DetailRecord, DetailsFile, MetricsFile, ReleaseYearsFile, ShoesFile, TestsFile } from '../../shared/types.js';
import { detailRecord, labTest } from './helpers.js';

const tests: TestsFile = {
  scrapedAt: '2026-07-20T00:00:00Z', seedSlug: 's',
  groups: { '3': 'Cushioning', '5': 'Stability' },
  tests: [
    labTest({ id: 6, slug: 'heel-stack', name: 'Heel stack', units: 'mm', groupId: '3' }),
    labTest({ id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option' }),
    labTest({ id: 69, slug: 'plate', name: 'Plate', type: 'bool' }),
    // Ungrouped by the seed but grouped by other pages, and never read by any shoe: the two
    // build-time catalogue rules (group overlay, empty-test drop) both bite here.
    labTest({ id: 17, slug: 'torsional-rigidity', name: 'Torsional rigidity', type: 'score' }),
    ...Array.from({ length: 52 }, (_, i) => labTest({ id: 100 + i, slug: `t${i}`, name: `T${i}` })),
  ],
};

function baseInputs(): { metrics: MetricsFile; details: DetailsFile } {
  const metrics: MetricsFile = { scrapedAt: '2026-07-20T00:00:00Z', shoes: {} };
  for (let i = 0; i < 320; i++) {
    metrics.shoes[`shoe-${String(i).padStart(3, '0')}`] = {
      // t0 is read by odd shoes only, so it survives the empty-test drop while still being
      // absent from some rows — that is what an empty CSV cell has to come from now.
      name: `Shoe ${i}`, url: `https://runrepeat.com/shoe-${i}`,
      values: i % 2 === 1 ? { '6': 30 + (i % 10), '69': false, '100': i } : { '6': 30 + (i % 10), '69': true },
    };
  }
  const details: DetailsFile = { shoes: {
    'shoe-000': detailRecord({
      scrapedAt: '2026-07-22T00:00:00Z', productId: 1, name: 'Shoe Zero Deluxe', brand: 'Brand', releasedAt: '2025-06-01',
      preciseReleaseDate: true, score: 90, msrpGbp: 150,
      runrepeatUrl: 'https://runrepeat.com/uk/shoe-000', features: ['Carbon plate', 'Rocker'],
      pros: ['good'], cons: ['bad'], intro: 'intro', whoShouldBuy: '<p>you</p>',
      categorySlug: 'running-shoes',
    }),
    'shoe-001': { gone: true, scrapedAt: '2026-07-21T00:00:00Z' },
    'ghost-shoe': detailRecord({
      scrapedAt: '2026-07-19T00:00:00Z', productId: 9, name: 'Ghost', discontinued: true,
      runrepeatUrl: 'https://runrepeat.com/uk/ghost-shoe',
    }),
  } };
  return { metrics, details };
}

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
      // A quoted review sentence is what lets a later reader audit the entry without refetching
      // the page (docs/scraping.md §Decisions).
      expect(o.note, `${slug} must quote the review it rests on`).toMatch(/"[^"]{20,}"/);
    }
  });
});

describe('buildDataset', () => {
  it('joins details onto metrics, keeps metrics-only shoes, drops details-only', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(shoesFile.shoes).toHaveLength(320);
    const zero = shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.name).toBe('Shoe Zero Deluxe');
    expect(zero.plate).toBe('carbon');
    expect(zero.details?.pros).toEqual(['good']);
    const one = shoesFile.shoes.find((s) => s.slug === 'shoe-001')!;
    expect(one.details).toBeNull();          // tombstone -> no details
    expect(one.name).toBe('Shoe 1');         // falls back to metrics name
    expect(shoesFile.shoes.find((s) => s.slug === 'ghost-shoe')).toBeUndefined();
  });
  // shoe-000 is even, so metrics read it as `true` for test 69; the page disagrees, and answers
  // for 39, which the metrics API never fetches
  // (docs/scraping.md §Readings taken from the page).
  it('fills a value the metrics API has no row for, and loses every collision with it', () => {
    const { metrics, details } = baseInputs();
    (details.shoes['shoe-000'] as DetailRecord).pageValues = { '39': 'both-sides-semi', '69': false };
    const zero = buildDataset(tests, metrics, details).shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.values['39']).toBe('both-sides-semi');
    expect(zero.values['69']).toBe(true);
  });
  it('is deterministic and time-independent', () => {
    const a = buildDataset(tests, baseInputs().metrics, baseInputs().details);
    const b = buildDataset(tests, baseInputs().metrics, baseInputs().details);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.shoesFile.builtAt).toBe('2026-07-22T00:00:00Z'); // max scrapedAt of inputs
    expect(a.shoesFile.shoes.map((s) => s.slug)).toEqual([...a.shoesFile.shoes.map((s) => s.slug)].sort());
  });
  it('emits CSV with fixed + numeric-test columns only', () => {
    const { metrics, details } = baseInputs();
    const { csv } = buildDataset(tests, metrics, details);
    const lines = csv.trimEnd().split('\n');
    const header = lines[0]!.split(',');
    expect(header.slice(0, 9)).toEqual(['slug', 'name', 'brand', 'releasedAt', 'releaseDateSource', 'score', 'msrpGbp', 'plate', 'discontinued']);
    expect(header).toContain('heel-stack');
    expect(header).not.toContain('tongue-gusset-type'); // option type excluded
    expect(header).not.toContain('plate,plate');
    expect(lines).toHaveLength(1 + 320);
    const zeroLine = lines.find((l) => l.startsWith('shoe-000,'))!;
    expect(zeroLine).toContain('Shoe Zero Deluxe');
    expect(zeroLine).toContain('carbon');
  });
  it('returns the rule-only plate for every shoe, before overrides', () => {
    const { metrics, details } = baseInputs();
    const { ruleDerived } = buildDataset(tests, metrics, details);
    expect(ruleDerived.size).toBe(320);
    expect(ruleDerived.get('shoe-000')).toBe('carbon'); // its 'Carbon plate' feature
    expect(ruleDerived.get('shoe-002')).toBe('none');   // no details record, so no section
  });
});

// Byte-identical output over unchanged inputs is what makes a refresh commit readable
// (docs/scraping.md §Determinism), so key order, the clock and repeat runs are all attacked here.
describe('buildDataset determinism', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function reverseKeys<T extends object>(o: Record<string, T>): Record<string, T> {
    const out: Record<string, T> = {};
    for (const k of Object.keys(o).reverse()) out[k] = o[k]!;
    return out;
  }

  it('is independent of input key insertion order', () => {
    const straight = baseInputs();
    const shuffled = baseInputs();
    shuffled.metrics.shoes = reverseKeys(shuffled.metrics.shoes);
    shuffled.details.shoes = reverseKeys(shuffled.details.shoes);
    // also reverse the per-shoe value key order
    for (const slug of Object.keys(shuffled.metrics.shoes)) {
      const s = shuffled.metrics.shoes[slug]!;
      s.values = reverseKeys(s.values as unknown as Record<string, never>) as typeof s.values;
    }

    const a = buildDataset(tests, straight.metrics, straight.details);
    const b = buildDataset(tests, shuffled.metrics, shuffled.details);
    expect(b.csv).toBe(a.csv);
    expect(JSON.stringify(b.shoesFile)).toBe(JSON.stringify(a.shoesFile));
    expect([...b.ruleDerived]).toEqual([...a.ruleDerived]); // JSON.stringify would render a Map as {}
  });

  it('does not read the wall clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const a = buildDataset(tests, baseInputs().metrics, baseInputs().details);
    vi.setSystemTime(new Date('2031-12-31T23:59:59Z'));
    const b = buildDataset(tests, baseInputs().metrics, baseInputs().details);
    expect(b.shoesFile.builtAt).toBe(a.shoesFile.builtAt);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('does not mutate its inputs', () => {
    // The shared `tests` const may already have been passed through buildDataset by
    // earlier cases, so clone AND re-establish the id-ascending order a catalogue is
    // built with; otherwise an in-place reorder would look idempotent and hide itself.
    const freshTests = structuredClone(tests);
    freshTests.tests.sort((a, b) => a.id - b.id);
    const { metrics, details } = baseInputs();
    const testsBefore = JSON.stringify(freshTests);
    const metricsBefore = JSON.stringify(metrics);
    const detailsBefore = JSON.stringify(details);
    const { shoesFile } = buildDataset(freshTests, metrics, details);
    expect(JSON.stringify(freshTests)).toBe(testsBefore);
    expect(JSON.stringify(metrics)).toBe(metricsBefore);
    expect(JSON.stringify(details)).toBe(detailsBefore);
    // the published catalogue keeps the original (id-ascending) order of the tests it keeps
    const publishedIds = shoesFile.tests.map((t) => t.id);
    expect(publishedIds).toEqual([...publishedIds].sort((a, b) => a - b));
    expect(publishedIds).toEqual(freshTests.tests.map((t) => t.id).filter((id) => publishedIds.includes(id)));
  });

  it('takes builtAt from tombstone scrapedAt when it is the newest', () => {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-001'] = { gone: true, scrapedAt: '2026-07-25T00:00:00Z' };
    expect(buildDataset(tests, metrics, details).shoesFile.builtAt).toBe('2026-07-25T00:00:00Z');
  });

  it('falls back to metrics.scrapedAt when details is empty', () => {
    const { metrics } = baseInputs();
    expect(buildDataset(tests, metrics, { shoes: {} }).shoesFile.builtAt).toBe('2026-07-20T00:00:00Z');
  });
});

// A year-derived date must never overwrite a real one scraped from a shoe page
// (docs/scraping.md §Release-year supplement).
describe('buildDataset release-year supplement', () => {
  function releaseYears(years: Record<string, number>): ReleaseYearsFile {
    return { scrapedAt: '2026-07-26T12:00:00Z', years };
  }

  it('fills releasedAt from the year bucket and sources it to the listing', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile, csv } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-005': 2025 }));
    const five = shoesFile.shoes.find((s) => s.slug === 'shoe-005')!;
    expect(five.releasedAt).toBe('2025-01-01');
    expect(five.releaseDateSource).toBe('listing');
    expect(csv.split('\n').find((l) => l.startsWith('shoe-005,'))).toContain('2025-01-01');
  });

  it('prefers the details date over the year bucket', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-000': 2019 }));
    const zero = shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.releasedAt).toBe('2025-06-01');
    expect(zero.releaseDateSource).toBe('page');
  });

  it('uses the year when the details record has no date of its own', () => {
    const { metrics, details } = baseInputs();
    const rec = details.shoes['shoe-000']!;
    if (!('gone' in rec)) rec.releasedAt = null;
    const { shoesFile } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-000': 2022, 'shoe-001': 2020 }));
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-000')!.releasedAt).toBe('2022-01-01');
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-000')!.releaseDateSource).toBe('listing');
    // tombstoned details record: the year still applies
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-001')!.releasedAt).toBe('2020-01-01');
  });

  it('sources a details date RunRepeat flagged imprecise as page-estimated, keeping its month', () => {
    const { metrics, details } = baseInputs();
    const rec = details.shoes['shoe-000']!;
    if (!('gone' in rec)) rec.preciseReleaseDate = false;
    const zero = buildDataset(tests, metrics, details).shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.releasedAt).toBe('2025-06-01');
    expect(zero.releaseDateSource).toBe('page-estimated');
  });

  it('leaves shoes with neither source null, with no provenance at all', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-005': 2025 }));
    const two = shoesFile.shoes.find((s) => s.slug === 'shoe-002')!;
    expect(two.releasedAt).toBeNull();
    expect(two.releaseDateSource).toBeNull();
    // omitting the argument entirely behaves the same
    expect(buildDataset(tests, metrics, details).shoesFile.shoes.find((s) => s.slug === 'shoe-005')!.releasedAt).toBeNull();
  });

  it('stays deterministic and does not let the years file move builtAt', () => {
    const years = releaseYears({ 'shoe-005': 2025, 'shoe-006': 2024 });
    const a = buildDataset(tests, baseInputs().metrics, baseInputs().details, years);
    const b = buildDataset(tests, baseInputs().metrics, baseInputs().details, releaseYears({ 'shoe-006': 2024, 'shoe-005': 2025 }));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.shoesFile.builtAt).toBe('2026-07-22T00:00:00Z'); // not the 2026-07-26 years scrapedAt
  });
});

// A lab-test-list response is the whole lab-tested catalogue, so hiking footwear
// rides in on it (docs/scraping.md §Non-running shoes).
describe('buildDataset non-running exclusion', () => {
  function detail(slug: string, categorySlug: string | null): DetailRecord {
    return detailRecord({ name: `Real ${slug}`, brand: 'B', runrepeatUrl: `https://runrepeat.com/uk/${slug}`, categorySlug });
  }
  const slugs = (f: ShoesFile): Set<string> => new Set(f.shoes.map((s) => s.slug));

  it('drops shoes whose details record names a foreign category', () => {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-010'] = detail('shoe-010', 'hiking-boots');
    details.shoes['shoe-011'] = detail('shoe-011', 'hiking-shoes');
    details.shoes['shoe-012'] = detail('shoe-012', 'running-shoes');
    const { shoesFile, csv } = buildDataset(tests, metrics, details);
    expect(shoesFile.shoes).toHaveLength(318);
    expect(slugs(shoesFile).has('shoe-010')).toBe(false);
    expect(slugs(shoesFile).has('shoe-011')).toBe(false);
    expect(slugs(shoesFile).has('shoe-012')).toBe(true);
    expect(csv.split('\n').filter((l) => /^shoe-01[012],/.test(l)).map((l) => l.split(',')[0])).toEqual(['shoe-012']);
  });

  it('keeps a shoe with no details record, a tombstone, or a null category', () => {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-010'] = detail('shoe-010', null);
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(shoesFile.shoes).toHaveLength(320);
    expect(slugs(shoesFile).has('shoe-010')).toBe(true);   // null category -> absence of evidence
    expect(slugs(shoesFile).has('shoe-001')).toBe(true);   // tombstone
    expect(slugs(shoesFile).has('shoe-002')).toBe(true);   // no details record at all
  });

  it('matches the category exactly rather than by substring', () => {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-010'] = detail('shoe-010', 'trail-running-shoes');
    details.shoes['shoe-011'] = detail('shoe-011', 'Running-Shoes');
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(slugs(shoesFile).has('shoe-010')).toBe(false);
    expect(slugs(shoesFile).has('shoe-011')).toBe(false);
  });

  it('fails the run rather than writing a gutted dataset when the category vocabulary moves', () => {
    const { metrics, details } = baseInputs();
    for (let i = 10; i < 300; i++) {
      const slug = `shoe-${String(i).padStart(3, '0')}`;
      details.shoes[slug] = detail(slug, 'road-running-shoes');
    }
    expect(() => buildDataset(tests, metrics, details)).toThrow(ValidationError);
  });

  it('leaves builtAt on the newest details record even when that shoe is excluded', () => {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-010'] = { ...detail('shoe-010', 'hiking-boots'), scrapedAt: '2026-07-30T00:00:00Z' };
    expect(buildDataset(tests, metrics, details).shoesFile.builtAt).toBe('2026-07-30T00:00:00Z');
  });
});

describe('buildDataset CSV cells', () => {
  it('emits empty cells for missing metric values and escapes fixed columns', () => {
    const { metrics, details } = baseInputs();
    metrics.shoes['shoe-000']!.name = 'Comma, "Quoted" Shoe';
    const det = details.shoes['shoe-000']!;
    if (!('gone' in det)) det.name = 'Comma, "Quoted" Shoe';

    const { csv } = buildDataset(tests, metrics, details);
    const lines = csv.split('\n');
    expect(lines.at(-1)).toBe(''); // trailing newline, no CRLF
    expect(csv).not.toContain('\r');

    const header = lines[0]!.split(',');
    // heel-stack and t0: every other catalogue test is either non-numeric or read by no shoe
    expect(header.slice(9)).toEqual(['heel-stack', 't0']);
    expect(new Set(header).size).toBe(header.length); // no duplicate column names

    const zero = lines.find((l) => l.startsWith('shoe-000,'))!;
    expect(zero).toContain('"Comma, ""Quoted"" Shoe"');
    // 6 fixed cells after the escaped name, heel-stack=30, then t0's empty cell
    expect(zero.endsWith(',30,')).toBe(true);
  });

  it('leaves brand/releasedAt/score/msrpGbp empty and discontinued false for metrics-only shoes', () => {
    const { metrics, details } = baseInputs();
    const { csv } = buildDataset(tests, metrics, details);
    const one = csv.split('\n').find((l) => l.startsWith('shoe-001,'))!;
    expect(one.startsWith('shoe-001,Shoe 1,,,,,,none,false,')).toBe(true);
    // no details record means no plate section, so a metrics-only shoe reads none
    const two = csv.split('\n').find((l) => l.startsWith('shoe-002,'))!;
    expect(two.startsWith('shoe-002,Shoe 2,,,,,,none,false,')).toBe(true);
  });
});

// A test nobody was measured for is noise in the column picker, the CSV header and the
// filter menu alike (docs/scraping.md §Empty tests).
describe('buildDataset empty-test drop', () => {
  it('publishes only the tests some surviving shoe was read for', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(shoesFile.tests.map((t) => t.id)).toEqual([6, 69, 100]);
  });
  it('brings a test back by itself once a reading appears', () => {
    const { metrics, details } = baseInputs();
    metrics.shoes['shoe-000']!.values['17'] = 4;
    expect(buildDataset(tests, metrics, details).shoesFile.tests.map((t) => t.id)).toContain(17);
  });
  it('ignores readings that belong only to an excluded shoe', () => {
    // insulation was populated by hiking boots alone, so dropping them empties it
    const { metrics, details } = baseInputs();
    metrics.shoes['shoe-010']!.values['17'] = 4;
    details.shoes['shoe-010'] = detailRecord({ categorySlug: 'hiking-boots' });
    expect(buildDataset(tests, metrics, details).shoesFile.tests.map((t) => t.id)).not.toContain(17);
  });
});

// A page groups only the tests its own shoe was run for, so the seed alone leaves about half
// the catalogue in the app's "Other" bucket (docs/scraping.md §Test groups).
describe('buildDataset test-group overlay', () => {
  it('fills a groupId the seed catalogue left null', () => {
    const { metrics, details } = baseInputs();
    metrics.shoes['shoe-000']!.values['17'] = 4;
    details.testGroups = { '17': '5' };
    const t17 = buildDataset(tests, metrics, details).shoesFile.tests.find((t) => t.id === 17)!;
    expect(t17.groupId).toBe('5');
  });
  it('never overwrites a groupId the catalogue already states', () => {
    const { metrics, details } = baseInputs();
    details.testGroups = { '6': '9' };
    const t6 = buildDataset(tests, metrics, details).shoesFile.tests.find((t) => t.id === 6)!;
    expect(t6.groupId).toBe('3');
  });
  it('leaves groupId null when neither source knows', () => {
    const { metrics, details } = baseInputs();
    expect(buildDataset(tests, metrics, details).shoesFile.tests.find((t) => t.id === 69)!.groupId).toBeNull();
    expect(buildDataset(tests, metrics, { ...details, testGroups: undefined }).shoesFile.tests.find((t) => t.id === 69)!.groupId).toBeNull();
  });
  it('does not mutate the catalogue it was handed', () => {
    const { metrics, details } = baseInputs();
    details.testGroups = { '6': '9', '69': '3' };
    const before = JSON.stringify(tests);
    buildDataset(tests, metrics, details);
    expect(JSON.stringify(tests)).toBe(before);
  });
});

describe('buildDataset model lineage', () => {
  function withVersions(): { metrics: MetricsFile; details: DetailsFile } {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-003'] = detailRecord({ name: 'Shoe Three', previousVersion: { slug: 'shoe-002', name: 'Shoe Two' } });
    details.shoes['shoe-004'] = detailRecord({ name: 'Shoe Four', previousVersion: { slug: 'shoe-003', name: 'Shoe Three' }, latestVersion: { slug: 'shoe-009', name: 'Shoe Nine' } });
    return { metrics, details };
  }
  const find = (f: ShoesFile, slug: string) => f.shoes.find((s) => s.slug === slug)!;

  it('derives nextVersion by inverting the fleet previousVersion links', () => {
    const { metrics, details } = withVersions();
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(find(shoesFile, 'shoe-002').nextVersion).toEqual({ slug: 'shoe-003', name: 'Shoe Three' });
    expect(find(shoesFile, 'shoe-003').nextVersion).toEqual({ slug: 'shoe-004', name: 'Shoe Four' });
    expect(find(shoesFile, 'shoe-004').nextVersion).toBeNull();   // nothing supersedes it
    expect(find(shoesFile, 'shoe-003').previousVersion).toEqual({ slug: 'shoe-002', name: 'Shoe Two' });
  });
  it('keeps latestVersion separate, since it may skip generations', () => {
    const { metrics, details } = withVersions();
    const four = find(buildDataset(tests, metrics, details).shoesFile, 'shoe-004');
    expect(four.latestVersion).toEqual({ slug: 'shoe-009', name: 'Shoe Nine' });
    expect(four.nextVersion).toBeNull();
  });
  it('resolves two claimants on the same predecessor deterministically', () => {
    const { metrics, details } = withVersions();
    details.shoes['shoe-005'] = detailRecord({ name: 'Shoe Five', previousVersion: { slug: 'shoe-002', name: 'Shoe Two' } });
    const a = buildDataset(tests, metrics, details).shoesFile;
    const b = buildDataset(tests, baseInputs().metrics, structuredClone(details)).shoesFile;
    expect(find(a, 'shoe-002').nextVersion).toEqual({ slug: 'shoe-003', name: 'Shoe Three' }); // lowest slug wins
    expect(find(b, 'shoe-002').nextVersion).toEqual(find(a, 'shoe-002').nextVersion);
  });
  it('never links to an excluded shoe it cannot show', () => {
    const { metrics, details } = withVersions();
    details.shoes['shoe-003'] = detailRecord({ name: 'Shoe Three', categorySlug: 'hiking-boots', previousVersion: { slug: 'shoe-002', name: 'Shoe Two' } });
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(find(shoesFile, 'shoe-002').nextVersion).toBeNull();
  });
});

describe('buildDataset facts and review language', () => {
  it('carries the fact map through from the details record', () => {
    const { metrics, details } = baseInputs();
    details.shoes['shoe-003'] = detailRecord({ facts: { pace: [{ slug: 'tempo', text: 'Tempo' }] } });
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-003')!.facts).toEqual({ pace: [{ slug: 'tempo', text: 'Tempo' }] });
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-002')!.facts).toEqual({}); // no details record
  });
  it('flags the reviews RunRepeat published in the wrong language', () => {
    const { metrics, details } = baseInputs();
    metrics.shoes['brooks-ghost-16'] = { name: 'Brooks Ghost 16', url: 'https://runrepeat.com/uk/brooks-ghost-16', values: { '6': 34 } };
    const { shoesFile } = buildDataset(tests, metrics, details);
    expect(shoesFile.shoes.find((s) => s.slug === 'brooks-ghost-16')!.reviewLanguage).toBe('es');
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-000')!.reviewLanguage).toBeNull();
  });
  it('every language override cites the prose it rests on', () => {
    for (const [slug, o] of Object.entries(REVIEW_LANGUAGE_OVERRIDES)) {
      expect(o.note, `${slug} must quote the review it rests on`).toMatch(/"[^"]{20,}"/);
      expect(o.language).toMatch(/^[a-z]{2}(-[A-Za-z0-9]+)*$/);
    }
  });
});

describe('curated release months', () => {
  const curated = (m: Record<string, string>) => new Map(Object.entries(m));
  const years = (y: Record<string, number>): ReleaseYearsFile => ({ scrapedAt: '2026-07-20T00:00:00Z', years: y });

  it('uses a curated month over a listing year, materialised as the first of the month', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, years({ 'shoe-005': 2025 }),
      curated({ 'shoe-005': '2025-09' }));
    const five = shoesFile.shoes.find((s) => s.slug === 'shoe-005')!;
    expect(five.releasedAt).toBe('2025-09-01');
    expect(five.releaseDateSource).toBe('curated');
  });

  it('uses a curated month over a page date RunRepeat flagged imprecise', () => {
    const { metrics, details } = baseInputs();
    const rec = details.shoes['shoe-000']!;
    if (!('gone' in rec)) rec.preciseReleaseDate = false;
    const { shoesFile } = buildDataset(tests, metrics, details, undefined, curated({ 'shoe-000': '2024-02' }));
    const zero = shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.releasedAt).toBe('2024-02-01');
    expect(zero.releaseDateSource).toBe('curated');
  });

  it('never overrides a precise page date, which RunRepeat states outright', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, undefined, curated({ 'shoe-000': '2024-02' }));
    const zero = shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.releasedAt).toBe('2025-06-01');
    expect(zero.releaseDateSource).toBe('page');
  });

  it('dates a shoe that had no date at all', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, undefined, curated({ 'shoe-002': '2021-05' }));
    const two = shoesFile.shoes.find((s) => s.slug === 'shoe-002')!;
    expect(two.releasedAt).toBe('2021-05-01');
    expect(two.releaseDateSource).toBe('curated');
  });

  it('leaves a seen-but-undated entry to fall through to the year below it', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, years({ 'shoe-005': 2025 }),
      curated({ 'shoe-005': '' }));
    const five = shoesFile.shoes.find((s) => s.slug === 'shoe-005')!;
    expect(five.releasedAt).toBe('2025-01-01');
    expect(five.releaseDateSource).toBe('listing');
  });

  it('reports which shoes carry a precise page date so the curated gate can see the fleet', () => {
    const { metrics, details } = baseInputs();
    const { pageDated } = buildDataset(tests, metrics, details);
    expect(pageDated.get('shoe-000')).toBe(true);
    expect(pageDated.get('shoe-002')).toBe(false);
  });
});

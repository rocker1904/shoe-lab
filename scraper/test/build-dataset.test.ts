import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, derivePlate, plateFromRules } from '../src/build-dataset.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';
import { ValidationError } from '../src/validate.js';
import type { DetailRecord, DetailsFile, MetricsFile, ReleaseYearsFile, ShoesFile, TestsFile } from '../../shared/types.js';

const tests: TestsFile = {
  scrapedAt: '2026-07-20T00:00:00Z', seedSlug: 's',
  groups: { '3': 'Cushioning' },
  tests: [
    { id: 6, slug: 'heel-stack', name: 'Heel stack', type: 'float', units: 'mm', groupId: '3' },
    { id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option', units: '', groupId: null },
    { id: 69, slug: 'plate', name: 'Plate', type: 'bool', units: '', groupId: null },
    ...Array.from({ length: 52 }, (_, i) => ({ id: 100 + i, slug: `t${i}`, name: `T${i}`, type: 'float' as const, units: '', groupId: null })),
  ],
};

function baseInputs(): { metrics: MetricsFile; details: DetailsFile } {
  const metrics: MetricsFile = { scrapedAt: '2026-07-20T00:00:00Z', shoes: {} };
  for (let i = 0; i < 320; i++) {
    metrics.shoes[`shoe-${String(i).padStart(3, '0')}`] = {
      name: `Shoe ${i}`, url: `https://runrepeat.com/shoe-${i}`, values: { '6': 30 + (i % 10), '69': i % 2 === 0 },
    };
  }
  const details: DetailsFile = { shoes: {
    'shoe-000': {
      scrapedAt: '2026-07-22T00:00:00Z', productId: 1, name: 'Shoe Zero Deluxe', brand: 'Brand', releasedAt: '2025-06-01',
      preciseReleaseDate: true, score: 90, msrpGbp: 150, discontinued: false, imageUrl: null,
      runrepeatUrl: 'https://runrepeat.com/uk/shoe-000', features: ['Carbon plate', 'Rocker'],
      hasPlateSection: false,
      pros: ['good'], cons: ['bad'], intro: 'intro', whoShouldBuy: '<p>you</p>', whoShouldNotBuy: null,
      categorySlug: 'running-shoes',
    },
    'shoe-001': { gone: true, scrapedAt: '2026-07-21T00:00:00Z' },
    'ghost-shoe': {
      scrapedAt: '2026-07-19T00:00:00Z', productId: 9, name: 'Ghost', brand: null, releasedAt: null,
      preciseReleaseDate: false, score: null, msrpGbp: null, discontinued: true, imageUrl: null,
      runrepeatUrl: 'https://runrepeat.com/uk/ghost-shoe', features: [], hasPlateSection: false,
      pros: [], cons: [], intro: '',
      whoShouldBuy: null, whoShouldNotBuy: null, categorySlug: null,
    },
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
    expect(header.slice(0, 8)).toEqual(['slug', 'name', 'brand', 'releasedAt', 'score', 'msrpGbp', 'plate', 'discontinued']);
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
    // the catalogue is passed through in its original (id-ascending) order
    expect(shoesFile.tests.map((t) => t.id)).toEqual(freshTests.tests.map((t) => t.id));
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

  it('fills releasedAt from the year bucket and marks it imprecise', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile, csv } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-005': 2025 }));
    const five = shoesFile.shoes.find((s) => s.slug === 'shoe-005')!;
    expect(five.releasedAt).toBe('2025-01-01');
    expect(five.preciseReleaseDate).toBe(false);
    expect(csv.split('\n').find((l) => l.startsWith('shoe-005,'))).toContain('2025-01-01');
  });

  it('prefers the details date over the year bucket', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-000': 2019 }));
    const zero = shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.releasedAt).toBe('2025-06-01');
    expect(zero.preciseReleaseDate).toBe(true);
  });

  it('uses the year when the details record has no date of its own', () => {
    const { metrics, details } = baseInputs();
    const rec = details.shoes['shoe-000']!;
    if (!('gone' in rec)) rec.releasedAt = null;
    const { shoesFile } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-000': 2022, 'shoe-001': 2020 }));
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-000')!.releasedAt).toBe('2022-01-01');
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-000')!.preciseReleaseDate).toBe(false);
    // tombstoned details record: the year still applies
    expect(shoesFile.shoes.find((s) => s.slug === 'shoe-001')!.releasedAt).toBe('2020-01-01');
  });

  it('keeps an imprecise details date imprecise', () => {
    const { metrics, details } = baseInputs();
    const rec = details.shoes['shoe-000']!;
    if (!('gone' in rec)) rec.preciseReleaseDate = false;
    const zero = buildDataset(tests, metrics, details).shoesFile.shoes.find((s) => s.slug === 'shoe-000')!;
    expect(zero.releasedAt).toBe('2025-06-01');
    expect(zero.preciseReleaseDate).toBe(false);
  });

  it('leaves shoes with neither source null and imprecise', () => {
    const { metrics, details } = baseInputs();
    const { shoesFile } = buildDataset(tests, metrics, details, releaseYears({ 'shoe-005': 2025 }));
    const two = shoesFile.shoes.find((s) => s.slug === 'shoe-002')!;
    expect(two.releasedAt).toBeNull();
    expect(two.preciseReleaseDate).toBe(false);
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
    return {
      scrapedAt: '2026-07-21T00:00:00Z', productId: 7, name: `Real ${slug}`, brand: 'B', releasedAt: null,
      preciseReleaseDate: false, score: null, msrpGbp: null, discontinued: false, imageUrl: null,
      runrepeatUrl: `https://runrepeat.com/uk/${slug}`, features: [], hasPlateSection: false,
      pros: [], cons: [], intro: '',
      whoShouldBuy: null, whoShouldNotBuy: null, categorySlug,
    };
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
    expect(header).toHaveLength(8 + 53); // heel-stack + 52 synthetic float tests
    expect(new Set(header).size).toBe(header.length); // no duplicate column names

    const zero = lines.find((l) => l.startsWith('shoe-000,'))!;
    expect(zero).toContain('"Comma, ""Quoted"" Shoe"');
    // 6 fixed cells after the escaped name, heel-stack=30, then 52 empty cells
    expect(zero.endsWith(',30' + ','.repeat(52))).toBe(true);
  });

  it('leaves brand/releasedAt/score/msrpGbp empty and discontinued false for metrics-only shoes', () => {
    const { metrics, details } = baseInputs();
    const { csv } = buildDataset(tests, metrics, details);
    const one = csv.split('\n').find((l) => l.startsWith('shoe-001,'))!;
    expect(one.startsWith('shoe-001,Shoe 1,,,,,none,false,')).toBe(true);
    // no details record means no plate section, so a metrics-only shoe reads none
    const two = csv.split('\n').find((l) => l.startsWith('shoe-002,'))!;
    expect(two.startsWith('shoe-002,Shoe 2,,,,,none,false,')).toBe(true);
  });
});

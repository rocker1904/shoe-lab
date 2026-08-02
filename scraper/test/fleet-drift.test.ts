import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/build-dataset.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';
import { ValidationError, validatePlateOverrides } from '../src/validate.js';
import type { DetailsFile, MetricsFile, ShoesFile, TestsFile } from '../../shared/types.js';
import { detailRecord, labTest } from './helpers.js';

/**
 * A fleet shaped like the real one, because these gates are ratios: 464 catalogued shoes of which
 * 14 are hiking footwear, editorial prose on every page, a carbon minority and a smaller
 * plated-other one, and two categorical readings per shoe that only the page carries. The three
 * plate-override slugs are present with the plates the override list expects the rules to derive,
 * so its own gate is exercised alongside these (docs/scraping.md §Decisions).
 */
const CATALOGUED = 464;
const HIKING = 14;
// The override list is the real one, and each overridden shoe is built so the rules derive
// something other than its override — which is what its own gate demands (§Decisions). The rest of
// the fleet supplies the rule-derived plates, so the published totals follow from both.
const OVERRIDES = Object.entries(PLATE_OVERRIDES);
const RULE_CARBON = [OVERRIDES.length, OVERRIDES.length + 70];
const RULE_PLATE_SECTION = [RULE_CARBON[1]!, RULE_CARBON[1]! + 33];
const CARBON = 70 + OVERRIDES.filter(([, o]) => o.plate === 'carbon').length;
const PLATED_OTHER = 33 + OVERRIDES.filter(([, o]) => o.plate === 'plated-other').length;
const CRAWLED_AT = '2026-07-20T00:00:00Z';

const tests: TestsFile = {
  scrapedAt: CRAWLED_AT, seedSlug: 'seed', groups: {},
  tests: [
    labTest({ id: 6, slug: 'heel-stack', units: 'mm' }),
    labTest({ id: 12, slug: 'weight', units: 'g' }),
    labTest({ id: 39, slug: 'tongue-gusset-type', type: 'option', options: [{ value: 'both-sides-semi', name: 'Both sides' }] }),
    labTest({ id: 45, slug: 'reflective-elements', type: 'bool' }),
    labTest({ id: 55, slug: 'insulation' }), // hiking-only, so the exclusion empties it
  ],
};

const slugAt = (i: number): string => OVERRIDES[i]?.[0] ?? `shoe-${String(i).padStart(3, '0')}`;

function fleet(): { metrics: MetricsFile; details: DetailsFile } {
  const metrics: MetricsFile = { scrapedAt: CRAWLED_AT, shoes: {} };
  const details: DetailsFile = { shoes: {} };
  for (let i = 0; i < CATALOGUED; i++) {
    const slug = slugAt(i);
    const hiking = i >= CATALOGUED - HIKING;
    metrics.shoes[slug] = {
      name: `Shoe ${i}`, url: `https://runrepeat.com/uk/${slug}`,
      values: hiking ? { '6': 30, '12': 280, '55': 3 } : { '6': 30 + (i % 10), '12': 240 + i },
    };
    const override = OVERRIDES[i]?.[1];
    details.shoes[slug] = detailRecord({
      scrapedAt: CRAWLED_AT, productId: i + 1, name: `Shoe ${i}`,
      runrepeatUrl: `https://runrepeat.com/uk/${slug}`,
      categorySlug: hiking ? 'hiking-boots' : 'running-shoes',
      features: override === undefined && i >= RULE_CARBON[0]! && i < RULE_CARBON[1]! ? ['Carbon plate'] : [],
      hasPlateSection: override === undefined
        ? i >= RULE_PLATE_SECTION[0]! && i < RULE_PLATE_SECTION[1]!
        : override.plate === 'none',
      pros: ['light'], cons: ['pricey'], intro: 'A shoe.',
      pageValues: { '39': 'both-sides-semi', '45': i % 2 === 0 },
    });
  }
  return { metrics, details };
}

const baseline = (): ShoesFile => {
  const { metrics, details } = fleet();
  return buildDataset(tests, metrics, details).shoesFile;
};

type Inputs = { metrics: MetricsFile; details: DetailsFile };

const build = (mutate: (f: Inputs) => void, previous: ShoesFile): { shoes: number; carbon: number } => {
  const inputs = fleet();
  mutate(inputs);
  const { shoesFile, ruleDerived } = buildDataset(tests, inputs.metrics, inputs.details, undefined, undefined, previous);
  validatePlateOverrides(ruleDerived);
  return { shoes: shoesFile.shoes.length, carbon: shoesFile.shoes.filter((s) => s.plate === 'carbon').length };
};

describe('the fleet a healthy run produces', () => {
  it('excludes the hiking footwear and publishes the rest', () => {
    const prev = baseline();
    expect(prev.shoes.length).toBe(CATALOGUED - HIKING);
    expect(prev.shoes.filter((s) => s.plate === 'carbon').length).toBe(CARBON);
    expect(prev.shoes.filter((s) => s.plate === 'plated-other').length).toBe(PLATED_OTHER);
    expect(prev.tests.map((t) => t.slug)).not.toContain('insulation');
  });

  it('rebuilds unchanged against its own output', () => {
    const prev = baseline();
    expect(build(() => {}, prev)).toEqual({ shoes: CATALOGUED - HIKING, carbon: CARBON });
  });

  it('accepts a shoe that joined since the previous build', () => {
    const prev = baseline();
    expect(build(({ metrics, details }) => {
      metrics.shoes['brand-new-shoe'] = { name: 'New', url: 'https://runrepeat.com/uk/brand-new-shoe', values: { '6': 31 } };
      details.shoes['brand-new-shoe'] = detailRecord({
        scrapedAt: '2026-07-27T00:00:00Z', name: 'New', categorySlug: 'running-shoes',
        pros: ['light'], cons: ['pricey'], intro: 'A shoe.',
      });
    }, prev)).toEqual({ shoes: CATALOGUED - HIKING + 1, carbon: CARBON });
  });
});

/**
 * The nine fleet-wide payload drifts a hunt measured against the real dataset, as the shapes a
 * site redesign produces: a renamed key, a moved block, a dropped block. Five of them built a
 * green `shoes.json` before these gates existed.
 */
describe('fleet-wide payload drift', () => {
  const drifts: Array<[string, (f: Inputs) => void]> = [
    ['category.slug field renamed (all null)', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r)) r.categorySlug = null; }],
    ['running category renamed upstream', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r) && r.categorySlug === 'running-shoes') r.categorySlug = 'road-running-shoes'; }],
    ['plate sections nested deeper (all false)', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r)) r.hasPlateSection = false; }],
    ['features list renamed (all empty)', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r)) r.features = []; }],
    ['lab_tests gone (pageValues emptied)', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r)) r.pageValues = {}; }],
    ['pros/cons/intro renamed (all empty)', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r)) { r.pros = []; r.cons = []; r.intro = ''; } }],
    ['name field renamed (all empty)', (f) => { for (const r of Object.values(f.details.shoes)) if (!('gone' in r)) r.name = ''; }],
    ['every details record becomes a tombstone', (f) => { for (const k of Object.keys(f.details.shoes)) f.details.shoes[k] = { gone: true, scrapedAt: CRAWLED_AT }; }],
    ['one shoe loses its category', (f) => { (f.details.shoes['shoe-100'] as { categorySlug: string | null }).categorySlug = null; }],
  ];

  it.each(drifts.slice(0, 8))('fails the run: %s', (_name, mutate) => {
    expect(() => build(mutate, baseline())).toThrow(ValidationError);
  });

  // The bound has to be wide enough that a real refresh survives it, so a single shoe moving is
  // not a drift — only a fleet-wide one is.
  it('still builds when a single shoe drifts', () => {
    expect(() => build(drifts[8]![1], baseline())).not.toThrow();
  });
});

describe('gates are skipped without a previous run', () => {
  it('builds a first dataset with no previous shoes.json to compare against', () => {
    const { metrics, details } = fleet();
    for (const r of Object.values(details.shoes)) if (!('gone' in r)) { r.pros = []; r.cons = []; r.intro = ''; }
    expect(() => buildDataset(tests, metrics, details)).not.toThrow();
  });
});

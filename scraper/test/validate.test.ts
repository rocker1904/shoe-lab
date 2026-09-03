import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ValidationError, validateCatalogue, validateDetailsRecord, validateFleetAgainstPrevious, validateMetrics, validatePlateOverrides, validateShoesFile, validateValuesAgainstCatalogue } from '../src/validate.js';
import type { DetailRecord, DetailsFile, MetricsFile, Plate, Shoe, ShoesFile, TestsFile } from '../../shared/types.js';
import { methodStatusOf } from '../src/method-status.js';
import { PLATE_OVERRIDES } from '../src/plate-overrides.js';
import { detailRecord, labTest, prototypePropertyNames, shoe } from './helpers.js';

function makeMetrics(shoeCount: number, testIds: number[] = [5, 6]): MetricsFile {
  const shoes: MetricsFile['shoes'] = {};
  for (let i = 0; i < shoeCount; i++) {
    shoes[`shoe-${i}`] = {
      name: `Shoe ${i}`, url: `https://runrepeat.com/shoe-${i}`,
      values: Object.fromEntries(testIds.map((id) => [String(id), 30 + i])),
    };
  }
  return { scrapedAt: '2026-07-26T00:00:00Z', shoes };
}
const tests: TestsFile = {
  scrapedAt: '2026-07-26T00:00:00Z', seedSlug: 's', groups: {},
  tests: Array.from({ length: 55 }, (_, i) => {
    const curated = ['outsole-hardness', 'stiffness-in-cold', 'difference-in-stiffness-in-cold'][i];
    return labTest({
      id: i + 1, slug: curated ?? `t${i + 1}`, name: `T${i + 1}`, units: 'mm',
      methodStatus: curated === undefined ? null : 'retired',
    });
  }),
};

function expectMutationRejected<T>(
  base: T,
  validate: (value: T) => void,
  cases: Array<[field: string, mutate: (value: any) => void, owner?: string]>,
): void {
  for (const [field, mutate, owner] of cases) {
    const malformed = structuredClone(base);
    mutate(malformed);
    expect(() => validate(malformed), field).toThrow(new RegExp(owner ? `${owner}.*${field}` : field));
  }
}

describe('complete runtime schemas', () => {
  it('rejects every malformed TestsFile and LabTest field at the catalogue gate', () => {
    expectMutationRejected(tests, (value) => validateCatalogue(value), [
      ['scrapedAt', (f) => { f.scrapedAt = 1; }],
      ['seedSlug', (f) => { f.seedSlug = null; }],
      ['groups', (f) => { f.groups = []; }],
      ['groups', (f) => { f.groups.g = 1; }],
      ['tests', (f) => { f.tests = {}; }],
      ['id', (f) => { f.tests[4].id = Number.NaN; }],
      ['slug', (f) => { f.tests[4].slug = 7; }],
      ['name', (f) => { f.tests[4].name = null; }, 'test t5'],
      ['type', (f) => { f.tests[4].type = 'numeric'; }, 'test t5'],
      ['units', (f) => { f.tests[4].units = false; }, 'test t5'],
      ['groupId', (f) => { f.tests[4].groupId = 1; }, 'test t5'],
      ['groupId', (f) => { f.tests[4].groupId = 'missing'; }, 'test t5'],
      ['chartLabel', (f) => { f.tests[4].chartLabel = 1; }, 'test t5'],
      ['isNew', (f) => { f.tests[4].isNew = 'false'; }, 'test t5'],
      ['previousId', (f) => { f.tests[4].previousId = '4'; }, 'test t5'],
      ['updateId', (f) => { f.tests[4].updateId = 1.5; }, 'test t5'],
      ['methodStatus', (f) => { delete f.tests[4].methodStatus; }, 'test t5'],
      ['primaryTestId', (f) => { f.tests[4].primaryTestId = 0; }, 'test t5'],
      ['secondaryTestIds', (f) => { f.tests[4].secondaryTestIds = null; }, 'test t5'],
      ['secondaryTestIds', (f) => { f.tests[4].secondaryTestIds = [6, 6]; }, 'test t5'],
      ['secondaryTestIds', (f) => { f.tests[4].secondaryTestIds = [5]; }, 'test t5'],
      ['options', (f) => { f.tests[4].options = {}; }, 'test t5'],
      ['options', (f) => { f.tests[4].options = [{ value: 'one', name: 'One' }]; }, 'test t5'],
      ['options', (f) => { f.tests[4].type = 'option'; f.tests[4].options = [{ value: 1, name: 'One' }]; }, 'test t5'],
      ['options', (f) => { f.tests[4].type = 'option'; f.tests[4].options = [{ value: 'one', name: 1 }]; }, 'test t5'],
    ]);
  });

  it('rejects dangling and non-reciprocal relationships in a full catalogue', () => {
    const base = structuredClone(tests);
    base.tests[4]!.updateId = 6;
    base.tests[4]!.methodStatus = 'retired';
    base.tests[5]!.previousId = 5;
    base.tests[6]!.secondaryTestIds = [8];
    base.tests[7]!.primaryTestId = 7;
    expect(() => validateCatalogue(base)).not.toThrow();
    expectMutationRejected(base, validateCatalogue, [
      ['previousId', (f) => { f.tests[4].updateId = null; f.tests[4].methodStatus = null; f.tests[5].previousId = 999; }, 'test t6'],
      ['updateId', (f) => { f.tests[4].updateId = 999; f.tests[5].previousId = null; }, 'test t5'],
      ['updateId', (f) => { f.tests[5].previousId = null; }, 'test t5'],
      ['previousId', (f) => { f.tests[4].updateId = null; f.tests[4].methodStatus = null; }, 'test t6'],
      ['primaryTestId', (f) => { f.tests[6].secondaryTestIds = []; f.tests[7].primaryTestId = 999; }, 'test t8'],
      ['secondaryTestIds', (f) => { f.tests[6].secondaryTestIds = [999]; f.tests[7].primaryTestId = null; }, 'test t7'],
      ['primaryTestId', (f) => { f.tests[6].secondaryTestIds = []; }, 'test t8'],
      ['secondaryTestIds', (f) => { f.tests[7].primaryTestId = null; }, 'test t7'],
    ]);
  });

  it('rejects self-referential and cyclic supersession chains in a full catalogue', () => {
    const selfLoop = structuredClone(tests);
    selfLoop.tests[4]!.previousId = 5;
    selfLoop.tests[4]!.updateId = 5;
    selfLoop.tests[4]!.methodStatus = 'retired';
    expect(() => validateCatalogue(selfLoop)).toThrow(/test t5 \(id 5\).*supersession.*5.*5/);

    const reciprocalCycle = structuredClone(tests);
    reciprocalCycle.tests[4]!.previousId = 6;
    reciprocalCycle.tests[4]!.updateId = 6;
    reciprocalCycle.tests[4]!.methodStatus = 'retired';
    reciprocalCycle.tests[5]!.previousId = 5;
    reciprocalCycle.tests[5]!.updateId = 5;
    reciprocalCycle.tests[5]!.methodStatus = 'retired';
    expect(() => validateCatalogue(reciprocalCycle)).toThrow(/supersession.*5.*6.*5/);
  });

  it('allows the published catalogue subset to reference an empty test that was dropped', () => {
    const file: ShoesFile = {
      builtAt: 't', source: 'RunRepeat', groups: {},
      tests: [labTest({ id: 60, slug: 'forefoot-traction', secondaryTestIds: [61] })],
      shoes: [shoe({ slug: 'shoe', values: { '60': 1 } })],
    };
    expect(() => validateShoesFile(file)).not.toThrow();
  });

  it('rejects malformed complete metric records and non-finite readings', () => {
    const base = makeMetrics(400);
    expectMutationRejected(base, (value) => validateMetrics(value, null, tests), [
      ['scrapedAt', (f) => { f.scrapedAt = false; }],
      ['shoes', (f) => { f.shoes = []; }],
      ['slug', (f) => { f.shoes[''] = f.shoes['shoe-0']; delete f.shoes['shoe-0']; }],
      ['name', (f) => { f.shoes['shoe-0'].name = 1; }],
      ['url', (f) => { f.shoes['shoe-0'].url = null; }],
      ['values', (f) => { f.shoes['shoe-0'].values = []; }],
      ['test 5', (f) => { f.shoes['shoe-0'].values['5'] = Number.POSITIVE_INFINITY; }],
    ]);
  });

  it('does not let inherited shoe records hide vanished prototype-shaped metric pairs', () => {
    const keys = prototypePropertyNames();
    const values = Object.fromEntries(tests.tests.map((test) => [String(test.id), 1]));
    const normal = makeMetrics(300, []);
    const prev: MetricsFile = {
      scrapedAt: '2026-07-25T00:00:00Z',
      shoes: Object.fromEntries([
        ...Object.entries(normal.shoes),
        ...keys.map((slug) => [slug, { name: `Hostile ${slug}`, url: `https://runrepeat.com/${slug}`, values }]),
      ]),
    };
    const inherited = Object.fromEntries(keys.map((slug) => [slug, { values }]));
    const next: MetricsFile = {
      scrapedAt: '2026-07-26T00:00:00Z',
      shoes: Object.assign(Object.create(inherited), normal.shoes),
    };

    expect(() => validateMetrics(next, prev, tests)).toThrow(/published|pairs vanished/);
  });

  it('checks the complete metric-shoe shape on the catalogue-only rewrite path', () => {
    const base = { one: { name: 'One', url: 'https://runrepeat.com/one', values: { '5': 1 } } };
    expectMutationRejected(base, (value) => validateValuesAgainstCatalogue(value, tests), [
      ['one', (f) => { Object.assign(f, { one: null }); }],
      ['name', (f) => { f.one.name = null; }],
      ['url', (f) => { f.one.url = 1; }],
      ['values', (f) => { f.one.values = null; }],
      ['test 5', (f) => { f.one.values['5'] = Number.NaN; }],
    ]);
  });

  it('rejects every malformed DetailRecord and Tombstone field', () => {
    const base = detailRecord({
      releasedAt: '2024-02-29', score: 150, msrpGbp: -1,
      imageUrl: 'https://cdn.runrepeat.com/a.jpg', categorySlug: 'running-shoes',
      whoShouldBuy: '<p>Runner</p>', whoShouldNotBuy: '<p>Walker</p>',
      facts: { pace: [{ slug: 'daily-running', text: 'Daily running' }] },
      pageValues: { '39': 'none', '45': false },
      previousVersion: { slug: 'shoe-1', name: 'Shoe 1' },
      latestVersion: { slug: 'shoe-3', name: 'Shoe 3' },
    });
    const check = (value: DetailRecord) => validateDetailsRecord(value, 'shoe');
    expectMutationRejected(base, check, [
      ['scrapedAt', (r) => { r.scrapedAt = null; }],
      ['productId', (r) => { r.productId = Number.NaN; }],
      ['name', (r) => { r.name = 1; }],
      ['brand', (r) => { r.brand = false; }],
      ['releasedAt', (r) => { r.releasedAt = '2023-02-29'; }],
      ['preciseReleaseDate', (r) => { r.preciseReleaseDate = 1; }],
      ['score', (r) => { r.score = Number.POSITIVE_INFINITY; }],
      ['msrpGbp', (r) => { r.msrpGbp = Number.NaN; }],
      ['discontinued', (r) => { r.discontinued = 'false'; }],
      ['imageUrl', (r) => { r.imageUrl = 1; }],
      ['runrepeatUrl', (r) => { r.runrepeatUrl = false; }],
      ['features', (r) => { r.features = [1]; }],
      ['pros', (r) => { r.pros = null; }],
      ['cons', (r) => { r.cons = [false]; }],
      ['intro', (r) => { r.intro = null; }],
      ['hasPlateSection', (r) => { r.hasPlateSection = 0; }],
      ['whoShouldBuy', (r) => { r.whoShouldBuy = '<script>bad()</script>'; }],
      ['whoShouldNotBuy', (r) => { r.whoShouldNotBuy = 1; }],
      ['categorySlug', (r) => { r.categorySlug = 1; }],
      ['facts', (r) => { r.facts = []; }],
      ['facts.pace.slug', (r) => { r.facts.pace[0].slug = ''; }],
      ['facts.pace.text', (r) => { r.facts.pace[0].text = 1; }],
      ['facts.pace.slug', (r) => { r.facts.pace.push({ slug: 'daily-running', text: 'Daily' }); }],
      ['pageValues', (r) => { r.pageValues = []; }],
      ['pageValues.39', (r) => { r.pageValues['39'] = 1; }],
      ['previousVersion.slug', (r) => { r.previousVersion.slug = ''; }],
      ['latestVersion.name', (r) => { r.latestVersion.name = null; }],
    ]);
    expect(() => validateDetailsRecord({ gone: true, scrapedAt: 1 } as any, 'gone'))
      .toThrow(/gone.*scrapedAt/);
  });

  it('rejects every malformed ShoesFile, Shoe and ShoeDetails field', () => {
    const base: ShoesFile = {
      builtAt: '2026-07-26T00:00:00Z', source: 'RunRepeat', groups: {}, tests: tests.tests,
      shoes: [shoe({
        slug: 'a', name: 'A', brand: 'Brand', url: 'https://runrepeat.com/a',
        releasedAt: '2024-02-29', releaseDateSource: 'page', score: 150, msrpGbp: -1,
        imageUrl: 'https://cdn.runrepeat.com/a.jpg', values: { '5': 1 },
        details: { pros: ['P'], cons: ['C'], intro: 'I', whoShouldBuy: '<p>Runner</p>', whoShouldNotBuy: null, features: ['F'] },
        facts: { pace: [{ slug: 'daily-running', text: 'Daily running' }] },
        previousVersion: { slug: 'prev', name: 'Previous' }, nextVersion: { slug: 'next', name: 'Next' },
        latestVersion: { slug: 'latest', name: 'Latest' }, reviewLanguage: 'es',
      })],
    };
    expectMutationRejected(base, validateShoesFile, [
      ['builtAt', (f) => { f.builtAt = null; }],
      ['source', (f) => { f.source = 'Elsewhere'; }],
      ['groups', (f) => { f.groups = []; }],
      ['groups', (f) => { f.groups.g = false; }],
      ['tests', (f) => { f.tests = {}; }],
      ['methodStatus', (f) => { f.tests[4].updateId = 6; }],
      ['shoes', (f) => { f.shoes = {}; }],
      ['slug', (f) => { f.shoes[0].slug = 1; }],
      ['name', (f) => { f.shoes[0].name = null; }],
      ['brand', (f) => { f.shoes[0].brand = false; }],
      ['url', (f) => { f.shoes[0].url = 1; }],
      ['releasedAt', (f) => { f.shoes[0].releasedAt = '2024-04-31'; }],
      ['releaseDateSource', (f) => { f.shoes[0].releaseDateSource = 'estimate'; }],
      ['releaseDateSource', (f) => { f.shoes[0].releaseDateSource = null; }],
      ['releasedAt', (f) => { f.shoes[0].releasedAt = null; }],
      ['curated', (f) => { f.shoes[0].releaseDateSource = 'curated'; f.shoes[0].releasedAt = '2024-02-02'; }],
      ['listing', (f) => { f.shoes[0].releaseDateSource = 'listing'; f.shoes[0].releasedAt = '2024-02-01'; }],
      ['score', (f) => { f.shoes[0].score = Number.NaN; }],
      ['msrpGbp', (f) => { f.shoes[0].msrpGbp = Number.POSITIVE_INFINITY; }],
      ['discontinued', (f) => { f.shoes[0].discontinued = 0; }],
      ['plate', (f) => { f.shoes[0].plate = 'metal'; }],
      ['imageUrl', (f) => { f.shoes[0].imageUrl = 1; }],
      ['values', (f) => { f.shoes[0].values = []; }],
      ['test 5', (f) => { f.shoes[0].values['5'] = Number.NEGATIVE_INFINITY; }],
      ['details', (f) => { f.shoes[0].details = {}; }],
      ['details.pros', (f) => { f.shoes[0].details.pros = [1]; }],
      ['details.cons', (f) => { f.shoes[0].details.cons = null; }],
      ['details.intro', (f) => { f.shoes[0].details.intro = 1; }],
      ['details.whoShouldBuy', (f) => { f.shoes[0].details.whoShouldBuy = '<iframe></iframe>'; }],
      ['details.whoShouldNotBuy', (f) => { f.shoes[0].details.whoShouldNotBuy = 1; }],
      ['details.features', (f) => { f.shoes[0].details.features = [false]; }],
      ['facts', (f) => { f.shoes[0].facts = null; }],
      ['facts.pace.slug', (f) => { f.shoes[0].facts.pace[0].slug = ''; }],
      ['facts.pace.text', (f) => { f.shoes[0].facts.pace[0].text = null; }],
      ['facts.pace.slug', (f) => { f.shoes[0].facts.pace.push({ slug: 'daily-running', text: 'Daily' }); }],
      ['previousVersion.slug', (f) => { f.shoes[0].previousVersion.slug = ''; }],
      ['nextVersion.name', (f) => { f.shoes[0].nextVersion.name = 1; }],
      ['latestVersion', (f) => { f.shoes[0].latestVersion = {}; }],
      ['reviewLanguage', (f) => { f.shoes[0].reviewLanguage = 1; }],
    ]);
    const duplicate = structuredClone(base);
    duplicate.shoes.push(structuredClone(duplicate.shoes[0]!));
    expect(() => validateShoesFile(duplicate)).toThrow(/slug.*twice/);
  });

  it('accepts null optional content, extra properties and finite values outside familiar ranges', () => {
    const catalogue = structuredClone(tests) as any;
    catalogue.extra = true;
    catalogue.tests[4].extra = true;
    validateCatalogue(catalogue);

    const metrics = makeMetrics(400) as any;
    metrics.extra = true;
    metrics.shoes['shoe-0'].extra = true;
    metrics.shoes['shoe-0'].values['5'] = -1e200;
    validateMetrics(metrics, null, tests);

    const detail = detailRecord({ score: 150, msrpGbp: -1 }) as any;
    detail.extra = true;
    validateDetailsRecord(detail, 'shoe');

    const file: ShoesFile = {
      builtAt: 't', source: 'RunRepeat', groups: {}, tests: tests.tests,
      shoes: [shoe({ slug: 'shoe', score: 150, msrpGbp: -1, values: { '5': 1e200 } })],
    };
    (file as any).extra = true;
    (file.shoes[0] as any).extra = true;
    validateShoesFile(file);
  });

  it('accepts every committed file at its owning validation entry point', () => {
    const catalogue = JSON.parse(readFileSync(new URL('../../data/tests.json', import.meta.url), 'utf8')) as TestsFile;
    const metrics = JSON.parse(readFileSync(new URL('../../data/metrics.json', import.meta.url), 'utf8')) as MetricsFile;
    const details = JSON.parse(readFileSync(new URL('../../data/details.json', import.meta.url), 'utf8')) as DetailsFile;
    const shoes = JSON.parse(readFileSync(new URL('../../data/shoes.json', import.meta.url), 'utf8')) as ShoesFile;
    validateCatalogue(catalogue);
    validateValuesAgainstCatalogue(metrics.shoes, catalogue);
    validateMetrics(metrics, null, catalogue);
    for (const [slug, record] of Object.entries(details.shoes)) validateDetailsRecord(record, slug);
    validateShoesFile(shoes);
  });
});

describe('validateMetrics', () => {
  it('passes a healthy first run', () => {
    expect(() => validateMetrics(makeMetrics(400), null, tests)).not.toThrow();
  });
  it('rejects shoe count below absolute floor', () => {
    expect(() => validateMetrics(makeMetrics(299), null, tests)).toThrow(ValidationError);
  });
  it('rejects too few tests', () => {
    const few = { ...tests, tests: tests.tests.slice(0, 49) };
    expect(() => validateMetrics(makeMetrics(400), null, few)).toThrow(ValidationError);
  });
  it('rejects wrong value type for declared test type', () => {
    const m = makeMetrics(400);
    m.shoes['shoe-0']!.values['5'] = 'not-a-number';
    expect(() => validateMetrics(m, null, tests)).toThrow(ValidationError);
  });
  it('rejects >10% shrink vs previous run', () => {
    expect(() => validateMetrics(makeMetrics(350), makeMetrics(400), tests)).toThrow(ValidationError);
    expect(() => validateMetrics(makeMetrics(370), makeMetrics(400), tests)).not.toThrow();
  });
  it('rejects >20% vanished (slug,test) pairs even at stable count', () => {
    const prev = makeMetrics(400, [5, 6, 8, 9]);
    const next = makeMetrics(400, [5]); // 75% of pairs vanished
    expect(() => validateMetrics(next, prev, tests)).toThrow(ValidationError);
  });
});

describe('validateMetrics boundaries', () => {
  it('accepts exactly the absolute floors (300 shoes, 50 tests)', () => {
    const fifty = { ...tests, tests: tests.tests.slice(0, 50) };
    expect(() => validateMetrics(makeMetrics(300, [5, 6]), null, fifty)).not.toThrow();
  });
  it('accepts exactly 90% of the previous count and rejects one below', () => {
    expect(() => validateMetrics(makeMetrics(360), makeMetrics(400), tests)).not.toThrow();
    expect(() => validateMetrics(makeMetrics(359), makeMetrics(400), tests)).toThrow(ValidationError);
  });
  it('accepts exactly 20% vanished pairs and rejects a hair more', () => {
    const prev = makeMetrics(400, [5, 6, 7, 8, 9]);
    const exact = makeMetrics(400, [5, 6, 7, 8]); // 400/2000 pairs gone
    expect(() => validateMetrics(exact, prev, tests)).not.toThrow();
    const over = structuredClone(exact);
    delete over.shoes['shoe-0']!.values['8']; // 401/2000 pairs gone
    expect(() => validateMetrics(over, prev, tests)).toThrow(ValidationError);
  });
  it('ignores the shrink check when the previous file was empty', () => {
    const empty: MetricsFile = { scrapedAt: '2026-07-25T00:00:00Z', shoes: {} };
    expect(() => validateMetrics(makeMetrics(400), empty, tests)).not.toThrow();
  });
  it('enforces bool, option and text value types', () => {
    const typed: TestsFile = {
      ...tests,
      tests: tests.tests.map((t) =>
        t.id === 1 ? { ...t, type: 'bool' as const }
        : t.id === 2 ? { ...t, type: 'option' as const }
        : t.id === 3 ? { ...t, type: 'text' as const }
        : t),
    };
    const ok = makeMetrics(400, []);
    for (const shoe of Object.values(ok.shoes)) {
      shoe.values = { '1': true, '2': 'both-sides-semi', '3': '270', '5': 32.7 };
    }
    expect(() => validateMetrics(ok, null, typed)).not.toThrow();
    for (const [testId, bad] of [['1', 'yes'], ['2', 3], ['3', 270], ['5', '32.7']] as const) {
      const m = structuredClone(ok);
      m.shoes['shoe-0']!.values[testId] = bad;
      expect(() => validateMetrics(m, null, typed)).toThrow(ValidationError);
    }
  });
  it('rejects a value for a test missing from the catalogue', () => {
    const m = makeMetrics(400);
    m.shoes['shoe-0']!.values['999'] = 1;
    expect(() => validateMetrics(m, null, tests)).toThrow(ValidationError);
  });
});

describe('method status catalogue gates', () => {
  it('rejects malformed status on the corpus catalogue gate', () => {
    const malformed = structuredClone(tests);
    (malformed.tests[4] as any).methodStatus = 'current';
    expect(() => validateValuesAgainstCatalogue({}, malformed)).toThrow(/methodStatus.*current/);
  });

  it('rejects a formal source disagreement on the live metrics gate', () => {
    const mismatched = structuredClone(tests);
    mismatched.tests[4]!.updateId = 999;
    expect(() => validateMetrics(makeMetrics(400), null, mismatched)).toThrow(/methodStatus/);
  });

  it('rejects loss of a retirement from the previous live catalogue', () => {
    const previous = structuredClone(tests);
    previous.tests[4]!.methodStatus = 'retired';
    expect(() => validateMetrics(makeMetrics(400), null, tests, previous)).toThrow(/t5.*retired/);
  });

  it('ignores absent status in a pre-feature previous catalogue', () => {
    const previous = structuredClone(tests);
    delete (previous.tests[4] as any).methodStatus;
    expect(() => validateMetrics(makeMetrics(400), null, tests, previous)).not.toThrow();
  });
});

describe('validateCatalogue', () => {
  it('accepts a complete catalogue without needing readings', () => {
    expect(() => validateCatalogue(tests)).not.toThrow();
  });

  it('rejects a lost published retirement without needing readings', () => {
    const previous = structuredClone(tests);
    previous.tests[4]!.methodStatus = 'retired';
    expect(() => validateCatalogue(tests, previous)).toThrow(/t5.*retired/);
  });

  it('rejects structural faults without needing readings', () => {
    const duplicateId = { ...tests, tests: [...tests.tests, labTest({ id: 5, slug: 'heel-stack-clone' })] };
    expect(() => validateCatalogue(duplicateId)).toThrow(/test id 5 declared twice/);

    const duplicateOption = {
      ...tests,
      tests: [...tests.tests, labTest({
        id: 139,
        slug: 'tongue-gusset-type',
        type: 'option',
        options: [
          { value: 'both-sides-semi', name: 'Both sides (semi)' },
          { value: 'both-sides-semi', name: 'Both sides, semi' },
        ],
      })],
    };
    expect(() => validateCatalogue(duplicateOption)).toThrow(/tongue-gusset-type.*"both-sides-semi"/);
  });
});

// Every path that writes a catalogue indexes it through the same gate, because the shape is fatal
// downstream and the metrics paths see tests no shoe reads yet
// (docs/scraping.md §A duplicate option value fails the run).
describe('duplicate option values in the catalogue', () => {
  const gusset = (...values: string[]): TestsFile => ({
    ...tests,
    tests: [...tests.tests, labTest({
      id: 139, slug: 'tongue-gusset-type', type: 'option',
      options: values.map((value, i) => ({ value, name: `Choice ${i}` })),
    })],
  });

  it('fails the metrics crawl on a test no shoe has a reading for', () => {
    // makeMetrics reads tests 5 and 6 only, so nothing points at 139 — the catalogue alone is wrong.
    expect(() => validateMetrics(makeMetrics(400), null, gusset('both-sides-semi', 'both-sides-semi')))
      .toThrow(ValidationError);
    expect(() => validateMetrics(makeMetrics(400), null, gusset('both-sides-semi', 'none'))).not.toThrow();
  });

  it('fails the corpus rewrite with no readings on disk at all', () => {
    expect(() => validateValuesAgainstCatalogue({}, gusset('both-sides-semi', 'both-sides-semi')))
      .toThrow(ValidationError);
  });

  it('names the test by slug and shows the duplicated value', () => {
    expect(() => validateValuesAgainstCatalogue({}, gusset('both-sides-semi', 'both-sides-semi')))
      .toThrow(/tongue-gusset-type.*"both-sides-semi"/);
  });
});

// A test repeated under one id or one slug fails the same gate, and the id case is the one nothing
// downstream reports (docs/scraping.md §A test declared twice fails the run).
describe('duplicate tests in the catalogue', () => {
  const plus = (...extra: Parameters<typeof labTest>[0][]): TestsFile => ({ ...tests, tests: [...tests.tests, ...extra.map(labTest)] });

  it('rejects two tests sharing an id', () => {
    expect(() => validateValuesAgainstCatalogue({}, plus({ id: 5, slug: 'heel-stack-clone' }))).toThrow(/\b5\b/);
  });

  it('rejects two tests sharing a slug', () => {
    expect(() => validateValuesAgainstCatalogue({}, plus({ id: 900, slug: 't5' }))).toThrow(/t5/);
  });

  it('accepts a catalogue whose ids and slugs are all distinct', () => {
    expect(() => validateValuesAgainstCatalogue({}, plus({ id: 900, slug: 't900' }))).not.toThrow();
  });

  it('rejects both at the join too', () => {
    const good: ShoesFile = {
      builtAt: '2026-07-26T00:00:00Z', source: 'RunRepeat', groups: {}, tests: tests.tests,
      shoes: [shoe({ slug: 'a', values: { '5': 1 } })],
    };
    expect(() => validateShoesFile({ ...good, tests: [...tests.tests, labTest({ id: 5, slug: 'clone' })] })).toThrow(ValidationError);
    expect(() => validateShoesFile({ ...good, tests: [...tests.tests, labTest({ id: 900, slug: 't5' })] })).toThrow(ValidationError);
  });

  // A gate has to hold on the catalogue we actually ship, or it reddens the weekly refresh instead
  // of the payload change that deserves it.
  it('accepts the committed catalogue', () => {
    const real = JSON.parse(readFileSync(new URL('../../data/tests.json', import.meta.url), 'utf8')) as TestsFile;
    for (const test of real.tests) test.methodStatus = methodStatusOf(test);
    expect(() => validateValuesAgainstCatalogue({}, real)).not.toThrow();
  });
});

describe('test slugs in the catalogue', () => {
  it('rejects empty or ASCII-whitespace slugs on every catalogue validation path', () => {
    for (const slug of ['', 'heel stack', 'heel\tstack', 'heel\nstack', 'heel\fstack', 'heel\rstack']) {
      const malformed = { ...tests, tests: tests.tests.map((t, i) => i !== 4 ? t : { ...t, slug }) };
      expect(() => validateValuesAgainstCatalogue({}, malformed), JSON.stringify(slug))
        .toThrow(/invalid slug/);
    }
  });

  it('accepts punctuation and non-ASCII space that remain one id reference', () => {
    for (const slug of ['heel_stack.v2', 'heel\u00a0stack']) {
      const valid = { ...tests, tests: tests.tests.map((t, i) => i !== 4 ? t : { ...t, slug }) };
      expect(() => validateValuesAgainstCatalogue({}, valid), JSON.stringify(slug)).not.toThrow();
    }
  });
});

describe('validateDetailsRecord', () => {
  it('passes tombstones and complete records, rejects broken ones', () => {
    expect(() => validateDetailsRecord({ gone: true, scrapedAt: 't' }, 's')).not.toThrow();
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: 0, name: 'X' } as any, 's')).toThrow(ValidationError);
    expect(() => validateDetailsRecord({ scrapedAt: 't', productId: 5, name: '' } as any, 's')).toThrow(ValidationError);
  });
  it('accepts a real record and rejects non-integer or negative productIds', () => {
    expect(() => validateDetailsRecord(detailRecord({ productId: 1, name: 'X' }), 's')).not.toThrow();
    expect(() => validateDetailsRecord(detailRecord({ productId: 1.5, name: 'X' }), 's')).toThrow(ValidationError);
    expect(() => validateDetailsRecord(detailRecord({ productId: -3, name: 'X' }), 's')).toThrow(ValidationError);
    const missing = detailRecord({ name: 'X' }) as any;
    delete missing.productId;
    expect(() => validateDetailsRecord(missing, 's')).toThrow(ValidationError);
  });
});

describe('validateShoesFile', () => {
  const good: ShoesFile = {
    builtAt: '2026-07-26T00:00:00Z', source: 'RunRepeat', groups: {}, tests: tests.tests,
    shoes: [shoe({ slug: 'a', name: 'A', url: 'https://runrepeat.com/a', values: { '5': 1 } })],
  };
  it('passes a valid file and rejects bad plate', () => {
    expect(() => validateShoesFile(good)).not.toThrow();
    const bad = structuredClone(good);
    (bad.shoes[0] as any).plate = 'titanium';
    expect(() => validateShoesFile(bad)).toThrow(ValidationError);
  });
  it('rejects malformed method status in the joined catalogue', () => {
    const bad = structuredClone(good);
    (bad.tests[4] as any).methodStatus = 'current';
    expect(() => validateShoesFile(bad)).toThrow(/methodStatus.*current/);
  });
  it('rejects missing name/slug/values', () => {
    const bad = structuredClone(good);
    (bad.shoes[0] as any).values = null;
    expect(() => validateShoesFile(bad)).toThrow(ValidationError);
  });
  it('rejects an empty builtAt and non-array tests/shoes', () => {
    expect(() => validateShoesFile({ ...good, builtAt: '' })).toThrow(ValidationError);
    expect(() => validateShoesFile({ ...good, tests: null as any })).toThrow(ValidationError);
    expect(() => validateShoesFile({ ...good, shoes: null as any })).toThrow(ValidationError);
  });
  it('rejects blank slug or name and accepts the other plate values', () => {
    for (const field of ['slug', 'name'] as const) {
      const bad = structuredClone(good);
      (bad.shoes[0] as any)[field] = '';
      expect(() => validateShoesFile(bad)).toThrow(ValidationError);
    }
    for (const plate of ['carbon', 'plated-other'] as const) {
      const f = structuredClone(good);
      f.shoes[0]!.plate = plate;
      expect(() => validateShoesFile(f)).not.toThrow();
    }
  });
  it('accepts a file with no shoes yet still checks structure', () => {
    expect(() => validateShoesFile({ ...good, shoes: [] })).not.toThrow();
  });

  // The rule §Validation gates states unqualified — it held on the metrics path alone until a
  // catalogue rewrite proved it could be broken at the join.
  it('rejects a reading for a test the published catalogue does not contain', () => {
    const orphaned = structuredClone(good);
    orphaned.shoes[0]!.values['999'] = 1;
    expect(() => validateShoesFile(orphaned)).toThrow(ValidationError);
  });

  // A categorical reading outside its declared choices is unlabellable — the app would print the
  // raw value and offer it as a filter choice next to the vocabulary it is not in
  // (docs/scraping.md §Readings taken from the page).
  it('rejects an option reading the test does not declare', () => {
    const withOptions: ShoesFile = {
      ...good,
      tests: [labTest({ id: 39, slug: 'tongue-gusset-type', type: 'option', options: [{ value: 'both-sides-semi', name: 'Both sides (semi)' }] })],
      shoes: [shoe({ slug: 'a', values: { '39': 'both-sides-semi' } })],
    };
    expect(() => validateShoesFile(withOptions)).not.toThrow();
    for (const bad of ['[object Object]', 'invented-slug'] as const) {
      const f = structuredClone(withOptions);
      f.shoes[0]!.values['39'] = bad;
      expect(() => validateShoesFile(f)).toThrow(ValidationError);
    }
  });

  // The join re-checks the catalogue it publishes, so a duplicate cannot arrive by the shorter
  // route either (docs/scraping.md §A duplicate option value fails the run).
  it('rejects an option test that declares the same value twice', () => {
    const duplicated: ShoesFile = {
      ...good,
      tests: [labTest({
        id: 39, slug: 'tongue-gusset-type', type: 'option',
        options: [{ value: 'both-sides-semi', name: 'Both sides (semi)' }, { value: 'both-sides-semi', name: 'Both sides, semi' }],
      })],
      shoes: [shoe({ slug: 'a', values: { '39': 'both-sides-semi' } })],
    };
    expect(() => validateShoesFile(duplicated)).toThrow(ValidationError);
    expect(() => validateShoesFile(duplicated)).toThrow(/tongue-gusset-type.*"both-sides-semi"/);
  });

  it('leaves an option test that declares no choices unchecked', () => {
    const noVocab: ShoesFile = {
      ...good,
      tests: [labTest({ id: 39, slug: 'tongue-gusset-type', type: 'option' })],
      shoes: [shoe({ slug: 'a', values: { '39': 'anything' } })],
    };
    expect(() => validateShoesFile(noVocab)).not.toThrow();
  });
});

// Each bound is stated as a number here so upstream drift fails the build rather than the reader
// arguing about what "a big change" is (docs/scraping.md §Validation gates).
describe('validateFleetAgainstPrevious boundaries', () => {
  const fleetOf = (n: number, make: (i: number) => Partial<Shoe> = () => ({})): ShoesFile => ({
    builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: tests.tests,
    shoes: Array.from({ length: n }, (_, i) => shoe({ slug: `shoe-${i}`, values: { '5': 1 }, ...make(i) })),
  });
  const noDetails: DetailsFile = { shoes: {} };
  const check = (next: ShoesFile, prev: ShoesFile, details: DetailsFile = noDetails): void =>
    validateFleetAgainstPrevious(next, prev, details);

  it('accepts exactly 95% of the previous fleet and rejects one below', () => {
    expect(() => check(fleetOf(380), fleetOf(400))).not.toThrow();
    expect(() => check(fleetOf(379), fleetOf(400))).toThrow(ValidationError);
  });

  it('accepts exactly 5% vanished (slug,test) pairs and rejects a hair more', () => {
    const prev = fleetOf(400, () => ({ values: { '5': 1, '6': 2, '7': 3, '8': 4, '9': 5 } })); // 2000 pairs
    const exact = fleetOf(400, (i): Partial<Shoe> => ({ values: i < 100 ? { '5': 1, '6': 2, '7': 3, '8': 4 } : { '5': 1, '6': 2, '7': 3, '8': 4, '9': 5 } }));
    expect(() => check(exact, prev)).not.toThrow();
    const over = structuredClone(exact);
    delete over.shoes[100]!.values['9'];
    expect(() => check(over, prev)).toThrow(ValidationError);
  });

  it('treats every prototype-shaped slug as present only when the next fleet owns it', () => {
    const keys = prototypePropertyNames();
    const values = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i + 1), i]));
    for (const key of keys) {
      const unchanged = fleetOf(399, () => ({ values: {} }));
      unchanged.shoes.push(shoe({ slug: key, values }));
      expect(() => check(unchanged, structuredClone(unchanged)), key).not.toThrow();

      const next = fleetOf(400, () => ({ values: {} }));
      expect(() => check(next, unchanged), key).toThrow(/100\/100.*pairs vanished/);
    }
  });

  it('accepts a plate class at exactly 75% of its previous count and rejects one below', () => {
    const prev = fleetOf(400, (i) => ({ plate: i < 40 ? 'carbon' as const : 'none' as const }));
    expect(() => check(fleetOf(400, (i) => ({ plate: i < 30 ? 'carbon' as const : 'none' as const })), prev)).not.toThrow();
    expect(() => check(fleetOf(400, (i) => ({ plate: i < 29 ? 'carbon' as const : 'none' as const })), prev)).toThrow(ValidationError);
  });

  it('ignores a plate class the previous run had fewer than 20 of', () => {
    const prev = fleetOf(400, (i) => ({ plate: i < 19 ? 'plated-other' as const : 'none' as const }));
    expect(() => check(fleetOf(400), prev)).not.toThrow();
  });

  it('accepts prose on exactly 90% of the previous share and rejects one shoe below', () => {
    const withProse = (n: number) => (i: number) => (i < n ? { details: { pros: ['p'], cons: ['c'], intro: 'i', whoShouldBuy: null, whoShouldNotBuy: null, features: [] } } : {});
    const prev = fleetOf(400, withProse(400));
    expect(() => check(fleetOf(400, withProse(360)), prev)).not.toThrow();
    expect(() => check(fleetOf(400, withProse(359)), prev)).toThrow(ValidationError);
  });

  it('rejects a shoe readmitted on a record that predates the previous build', () => {
    const prev = fleetOf(400);
    const next = fleetOf(401);
    const at = (scrapedAt: string): DetailsFile => ({ shoes: { 'shoe-400': detailRecord({ scrapedAt }) } });
    expect(() => check(next, prev, at('2026-07-20T00:00:00Z'))).toThrow(ValidationError);
    expect(() => check(next, prev, at('2026-07-20T00:00:01Z'))).not.toThrow();
    expect(() => check(next, prev)).not.toThrow(); // no record yet: genuinely new, not readmitted
  });

  it('rejects a readmission on a stale tombstone too', () => {
    expect(() => check(fleetOf(401), fleetOf(400), { shoes: { 'shoe-400': { gone: true, scrapedAt: '2026-07-19T00:00:00Z' } } }))
      .toThrow(ValidationError);
  });
});

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

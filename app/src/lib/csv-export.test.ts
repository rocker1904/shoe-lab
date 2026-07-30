import { describe, expect, it } from 'vitest';
import { exportCsv } from './csv-export';
import { indexTests } from './dataset';
import { EASY } from './score-defs';
import { FLEET, TESTS, shoe } from './test-fixtures';

const idx = indexTests(TESTS);

describe('exportCsv', () => {
  it('exports header plus one row per shoe with selected columns', () => {
    const csv = exportCsv(FLEET.slice(0, 2), ['score', 'heel-stack', 'plate'], idx);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('slug,name,brand,url,score,heel-stack,plate');
    expect(lines[1]).toBe('cushy,cushy,Brand,https://runrepeat.com/uk/cushy,92,40,none');
    expect(lines).toHaveLength(3);
  });
  // A data export, not a rendering: the row that leaves the app must still be able to get back to
  // the page it came from (docs/app.md §Number display).
  it('carries a link back to RunRepeat on every row, whatever the columns are', () => {
    const csv = exportCsv(FLEET, ['weight'], idx);
    expect(csv.split('\n')[0]).toContain('url');
    for (const s of FLEET) expect(csv).toContain(`https://runrepeat.com/uk/${s.slug}`);
  });
  it('escapes and handles missing values', () => {
    const tricky = shoe({ slug: 'tricky', name: 'Says "hi", loudly', score: null, values: {} });
    const csv = exportCsv([tricky], ['score', 'heel-stack'], idx);
    expect(csv.trimEnd().split('\n')[1]).toBe('tricky,"Says ""hi"", loudly",Brand,https://runrepeat.com/uk/tricky,,');
  });
  it('quotes embedded newlines and carriage returns', () => {
    const s = shoe({ slug: 'multi', name: 'Line one\nline two\rmore' });
    expect(exportCsv([s], [], idx).split('\n')[1]).toBe('multi,"Line one');
    expect(exportCsv([s], [], idx)).toContain('"Line one\nline two\rmore"');
  });
  it('exports non-numeric test columns from raw values and blanks unknown columns', () => {
    const s = shoe({ slug: 'gusset', values: { '39': 'Full gusset', '6': 38 } });
    const csv = exportCsv([s], ['tongue-gusset-type', 'heel-stack', 'not-a-column'], idx);
    expect(csv.trimEnd().split('\n')).toEqual([
      'slug,name,brand,url,tongue-gusset-type,heel-stack,not-a-column',
      'gusset,gusset,Brand,https://runrepeat.com/uk/gusset,Full gusset,38,',
    ]);
  });
  it('blanks null brand, score and release date', () => {
    const s = shoe({ slug: 'sparse', brand: null, score: null, releasedAt: null, msrpGbp: null });
    expect(exportCsv([s], ['releasedAt', 'score', 'msrpGbp'], idx).trimEnd().split('\n')[1]).toBe('sparse,sparse,,https://runrepeat.com/uk/sparse,,,');
  });
  it('stringifies boolean values', () => {
    const s = shoe({ slug: 'flagged', values: { '39': false } });
    expect(exportCsv([s], ['tongue-gusset-type'], idx).trimEnd().split('\n')[1]).toBe('flagged,flagged,Brand,https://runrepeat.com/uk/flagged,false');
  });
  it('emits header only for an empty fleet and always ends with a newline', () => {
    expect(exportCsv([], ['score'], idx)).toBe('slug,name,brand,url,score\n');
    expect(exportCsv(FLEET, ['score'], idx).endsWith('\n')).toBe(true);
  });
  it('supports name and brand as explicit extra columns', () => {
    const csv = exportCsv([shoe({ slug: 'dup', name: 'Dup', brand: 'Nike' })], ['name', 'brand'], idx);
    expect(csv.trimEnd().split('\n')[1]).toBe('dup,Dup,Nike,https://runrepeat.com/uk/dup,Dup,Nike');
  });
  it('quotes a column name that needs escaping', () => {
    expect(exportCsv([], ['odd,name'], idx)).toBe('slug,name,brand,url,"odd,name"\n');
  });
});

describe('exportCsv and the Easy score', () => {
  it('emits each side\'s score under its own raw key', () => {
    const csv = exportCsv([FLEET.find((s) => s.slug === 'cushy')!],
                          [EASY.keys.heel, EASY.keys.forefoot], idx,
                          new Map([[EASY.keys.heel, new Map([['cushy', 87.4]])],
                                   [EASY.keys.forefoot, new Map([['cushy', 71.2]])]]));
    expect(csv.split('\n')[0]).toContain(`${EASY.keys.heel},${EASY.keys.forefoot}`);
    expect(csv.split('\n')[1]).toContain('87.4,71.2');
  });

  it('emits an empty cell for an unscored shoe rather than a zero', () => {
    const csv = exportCsv([FLEET.find((s) => s.slug === 'mystery')!], [EASY.keys.heel], idx,
                          new Map([[EASY.keys.heel, new Map()]]));
    const row = csv.split('\n')[1]!;
    expect(row.endsWith(',')).toBe(true);
    expect(row).not.toMatch(/,0$/);
  });
});

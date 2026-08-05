import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ShoesFile } from '../../../shared/types.js';
import { METRIC_HELP, metricHelpOf, metricInterpretation } from './metric-help';

const published = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../data/shoes.json'), 'utf8')) as ShoesFile;
const validKeys = new Set([
  ...published.tests.filter((t) => ['float', 'score', 'percent', 'rating'].includes(t.type))
    .map((t) => t.slug),
  'msrpGbp', 'score',
]);

describe('metricHelpOf', () => {
  it('returns no metadata for an unknown future metric', () => {
    expect(metricHelpOf('future-upstream-test')).toBeUndefined();
  });

  it('keeps every authored fact non-empty and every source on RunRepeat HTTPS', () => {
    for (const [key, fact] of Object.entries(METRIC_HELP)) {
      expect(fact.text.trim(), key).not.toBe('');
      if (!fact.source) continue;
      const url = new URL(fact.source.href);
      expect(url.protocol, key).toBe('https:');
      expect(url.hostname, key).toBe('runrepeat.com');
      expect(fact.source.label.trim(), key).not.toBe('');
    }
  });

  it('rejects authored keys outside the published range surface', () => {
    for (const key of Object.keys(METRIC_HELP)) expect(validKeys.has(key), key).toBe(true);
  });

  it('keeps RunRepeat Score as the sole intentionally unsourced fact', () => {
    expect(Object.entries(METRIC_HELP).filter(([, fact]) => !fact.source).map(([key]) => key))
      .toEqual(['score']);
  });

  it('states the sharp measurements directly', () => {
    expect(metricHelpOf('outsole-durability')?.text).toMatch(/Dremel.*dent depth/i);
    expect(metricHelpOf('drop')?.text).toMatch(/heel stack.*minus.*forefoot stack/i);
    expect(metricHelpOf('torsional-rigidity-23')?.text).toMatch(/torque.*10°/i);
    expect(metricHelpOf('flexibility-stiffness')?.text).toMatch(/force.*30°/i);
  });

  it('keeps changed methods distinct and shares location-only families', () => {
    expect(metricHelpOf('breathability')?.text).not.toBe(metricHelpOf('breathability-25')?.text);
    expect(metricHelpOf('midsole-softness')?.text).not.toBe(metricHelpOf('midsole-softness-22')?.text);
    expect(metricHelpOf('energy-return-heel')).toBe(metricHelpOf('energy-return-forefoot'));
    expect(metricHelpOf('shock-absorption-heel')).toBe(metricHelpOf('shock-absorption-forefoot'));
  });

  it('distinguishes MSRP from a live regional offer', () => {
    const price = metricHelpOf('msrpGbp')!;
    expect(price.text).toMatch(/manufacturer.s suggested retail price|MSRP/i);
    expect(price.text).toMatch(/not.*current (offer|price)/i);
    expect(price.text).toMatch(/GBP/i);
    expect(price.source?.href).toContain('behind-the-price-tag');
    expect(metricHelpOf('price')).toBe(price);
  });

  it('calls RunRepeat Score their verdict without inventing a derivation', () => {
    const score = metricHelpOf('score')!;
    expect(score.text).toMatch(/RunRepeat.s.*0.?100 verdict/i);
    expect(score.text).toMatch(/not.*Shoe Lab/i);
    expect(score.source).toBeUndefined();
  });

  it('distinguishes the internal-length and owner-vote fit methods', () => {
    expect(metricHelpOf('internal-length')?.text).toMatch(/caliper/i);
    expect(metricHelpOf('internal-length')?.text).not.toMatch(/gel mould/i);
    expect(metricHelpOf('size-rating')?.text).toMatch(/owner.*votes/i);
  });
});

describe('metricInterpretation', () => {
  it('derives its wording from the direction registry', () => {
    expect(metricInterpretation('energy-return-heel')).toBe('Higher readings are better.');
    expect(metricInterpretation('outsole-durability')).toBe('Lower readings are better.');
    expect(metricInterpretation('drop')).toBe('Neither end is universally better.');
    expect(metricInterpretation('future-upstream-test')).toBe('Neither end is universally better.');
  });
});

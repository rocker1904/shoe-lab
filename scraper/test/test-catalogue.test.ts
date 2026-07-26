import { describe, expect, it } from 'vitest';
import { PayloadError } from '../src/page-payload.js';
import { extractTestCatalogue } from '../src/test-catalogue.js';
import { loadAzuraPageData } from './helpers.js';

describe('extractTestCatalogue', () => {
  it('extracts all tests with group mapping from the real fixture', () => {
    const tf = extractTestCatalogue(loadAzuraPageData(), 'saucony-endorphin-azura', '2026-07-26T00:00:00Z');
    expect(tf.tests.length).toBeGreaterThanOrEqual(60);
    expect(tf.seedSlug).toBe('saucony-endorphin-azura');
    const heel = tf.tests.find((t) => t.slug === 'heel-stack');
    expect(heel).toMatchObject({ id: 6, type: 'float', units: 'mm' });
    expect(tf.groups[heel!.groupId!]).toBe('Cushioning');
    // sorted by id ascending
    expect([...tf.tests].map((t) => t.id)).toEqual([...tf.tests].map((t) => t.id).sort((a, b) => a - b));
  });
  it('throws PayloadError when lab_tests missing or too few tests', () => {
    expect(() => extractTestCatalogue({}, 's', 't')).toThrow(PayloadError);
    expect(() => extractTestCatalogue({ lab_tests: { tests: { '1': { id: 1, slug: 'x', name: 'X', type: 'float', units: '' } }, groups: {} } }, 's', 't')).toThrow(PayloadError);
  });
});

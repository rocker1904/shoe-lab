import { describe, expect, it } from 'vitest';
import { PayloadError } from '../src/page-payload.js';
import { parseLabTestList } from '../src/lab-test-list.js';
import { loadJsonFixture } from './helpers.js';
import type { LabTest } from '../../shared/types.js';

const forefootStack: LabTest = { id: 5, slug: 'forefoot-stack', name: 'Forefoot stack', type: 'float', units: 'mm', groupId: '3' };

describe('parseLabTestList', () => {
  it('parses the real fixture into slug-keyed rows', () => {
    const rows = parseLabTestList(loadJsonFixture('raw/labtest5.json'), forefootStack);
    expect(rows.size).toBeGreaterThan(300);
    const azura = rows.get('saucony-endorphin-azura');
    expect(azura?.value).toBe(32.7);
    expect(azura?.name).toBe('Saucony Endorphin Azura');
  });
  it('skips rows with empty values or missing urls, keeps first duplicate', () => {
    const rows = parseLabTestList(loadJsonFixture('labtest-edge.json'), forefootStack);
    expect([...rows.keys()]).toEqual(['shoe-a']);
    expect(rows.get('shoe-a')?.value).toBe(10.5);
  });
  it('throws PayloadError on missing rows or malformed row', () => {
    const broken = loadJsonFixture('labtest-broken.json');
    expect(() => parseLabTestList(broken.noRows, forefootStack)).toThrow(PayloadError);
    expect(() => parseLabTestList(broken.malformedRow, forefootStack)).toThrow(PayloadError);
  });
});

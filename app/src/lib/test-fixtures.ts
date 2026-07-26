import type { LabTest, Shoe } from '../../../shared/types.js';

export const TESTS: LabTest[] = [
  { id: 6, slug: 'heel-stack', name: 'Heel stack', type: 'float', units: 'mm', groupId: '3' },
  { id: 24, slug: 'weight', name: 'Weight', type: 'float', units: 'g', groupId: '10' },
  { id: 65, slug: 'energy-return-heel', name: 'Energy return (heel)', type: 'percent', units: '', groupId: '3' },
  { id: 70, slug: 'midsole-softness-22', name: 'Midsole softness', type: 'float', units: 'AC', groupId: '3' },
  { id: 39, slug: 'tongue-gusset-type', name: 'Tongue gusset', type: 'option', units: '', groupId: null },
];

export function shoe(overrides: Partial<Shoe> & { slug: string }): Shoe {
  return {
    name: overrides.slug, brand: 'Brand', url: `https://runrepeat.com/${overrides.slug}`,
    releasedAt: '2025-01-01', preciseReleaseDate: true, score: 80, msrpGbp: 140, discontinued: false,
    plate: 'none', imageUrl: null, values: {}, details: null,
    ...overrides,
  };
}

export const FLEET: Shoe[] = [
  shoe({ slug: 'cushy', values: { '6': 40, '65': 70, '70': 40 }, plate: 'none', releasedAt: '2025-06-01', score: 92 }),
  shoe({ slug: 'racer', values: { '6': 39, '65': 75, '70': 42 }, plate: 'carbon', releasedAt: '2026-01-01', score: 90, msrpGbp: 250 }),
  shoe({ slug: 'trainer', values: { '6': 35, '65': 60, '70': 30 }, plate: 'plated-other', releasedAt: '2023-05-01', score: 85 }),
  shoe({ slug: 'oldie', values: { '6': 30, '65': 55 }, releasedAt: '2021-01-01', score: 70, discontinued: true, brand: 'Other' }),
  shoe({ slug: 'mystery', values: {}, releasedAt: null, preciseReleaseDate: false, score: null, msrpGbp: null }),
];

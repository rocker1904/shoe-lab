export type TestType = 'float' | 'score' | 'percent' | 'bool' | 'rating' | 'option' | 'text';
export interface LabTest {
  id: number; slug: string; name: string; type: TestType; units: string; groupId: string | null;
}
export interface TestsFile {
  scrapedAt: string; seedSlug: string;
  groups: Record<string, string>;
  tests: LabTest[];
}
export type MetricValue = number | string | boolean;
export interface MetricsShoe { name: string; url: string; values: Record<string, MetricValue> }
export interface MetricsFile { scrapedAt: string; shoes: Record<string, MetricsShoe> }
export interface DetailRecord {
  scrapedAt: string; productId: number; name: string; brand: string | null;
  releasedAt: string | null; preciseReleaseDate: boolean;
  score: number | null; msrpGbp: number | null; discontinued: boolean;
  imageUrl: string | null; runrepeatUrl: string;
  features: string[]; pros: string[]; cons: string[]; intro: string;
  whoShouldBuy: string | null; whoShouldNotBuy: string | null;
}
export interface Tombstone { gone: true; scrapedAt: string }
export interface DetailsFile { shoes: Record<string, DetailRecord | Tombstone> }
export type Plate = 'carbon' | 'plated-other' | 'none';
export interface ShoeDetails {
  pros: string[]; cons: string[]; intro: string;
  whoShouldBuy: string | null; whoShouldNotBuy: string | null; features: string[];
}
export interface Shoe {
  slug: string; name: string; brand: string | null; url: string;
  releasedAt: string | null; score: number | null; msrpGbp: number | null;
  discontinued: boolean; plate: Plate; imageUrl: string | null;
  values: Record<string, MetricValue>;
  details: ShoeDetails | null;
}
export interface ShoesFile {
  builtAt: string; source: 'RunRepeat';
  groups: Record<string, string>; tests: LabTest[]; shoes: Shoe[];
}
export function isTombstone(r: DetailRecord | Tombstone): r is Tombstone {
  return 'gone' in r && r.gone === true;
}

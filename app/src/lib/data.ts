import type { ShoesFile } from '../../../shared/types.js';

export async function loadShoes(fetchImpl: typeof fetch = fetch): Promise<ShoesFile> {
  const res = await fetchImpl('shoes.json');
  if (!res.ok) throw new Error(`Failed to load data: HTTP ${res.status}`);
  return res.json() as Promise<ShoesFile>;
}

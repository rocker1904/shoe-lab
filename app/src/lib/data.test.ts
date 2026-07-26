import { describe, expect, it } from 'vitest';
import { loadShoes } from './data';

describe('loadShoes', () => {
  it('fetches and returns the dataset', async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({ builtAt: 't', source: 'RunRepeat', groups: {}, tests: [], shoes: [] }),
      )) as unknown as typeof fetch;
    const data = await loadShoes(fake);
    expect(data.builtAt).toBe('t');
  });
  it('throws a descriptive error on HTTP failure', async () => {
    const fake = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    await expect(loadShoes(fake)).rejects.toThrow(/503/);
  });
});

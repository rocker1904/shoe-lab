import { describe, expect, it } from 'vitest';
import { HttpStatusError, PoliteHttp } from '../src/http.js';

function harness(responses: Array<{ status: number; body?: string } | Error>) {
  const calls: Array<{ url: string; ua: string | undefined }> = [];
  const sleeps: number[] = [];
  let clock = 0;
  const http = new PoliteHttp({
    fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), ua: new Headers(init?.headers).get('user-agent') ?? undefined });
      const next = responses.shift();
      if (!next) throw new Error('unexpected extra request');
      if (next instanceof Error) throw next;
      // 204 and 304 are null-body statuses: giving Response one throws before the client sees it.
      const nullBody = next.status === 204 || next.status === 304;
      return new Response(nullBody ? null : next.body ?? 'ok', { status: next.status });
    }) as typeof fetch,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    now: () => clock,
  });
  return { http, calls, sleeps, tick: (ms: number) => { clock += ms; } };
}

describe('PoliteHttp', () => {
  it('sends the user-agent and returns text', async () => {
    const { http, calls } = harness([{ status: 200, body: 'hello' }]);
    expect(await http.getText('https://x/a')).toBe('hello');
    expect(calls[0]?.ua).toContain('shoe-lab/');
  });
  it('spaces consecutive requests by at least minIntervalMs', async () => {
    const { http, sleeps, tick } = harness([{ status: 200 }, { status: 200 }, { status: 200 }]);
    await http.getText('https://x/1');
    tick(200);
    await http.getText('https://x/2'); // only 200ms elapsed -> sleep 800
    await http.getText('https://x/3'); // no time elapsed -> sleep 1000
    expect(sleeps).toEqual([800, 1000]);
  });
  it('retries 5xx with backoff schedule then succeeds', async () => {
    const { http, sleeps } = harness([{ status: 500 }, { status: 502 }, { status: 200, body: 'ok' }]);
    expect(await http.getText('https://x/a')).toBe('ok');
    expect(sleeps).toEqual([5000, 25000]);
  });
  it('retries network errors and fails after exhausting retries', async () => {
    const { http, sleeps } = harness([new Error('boom'), new Error('boom'), new Error('boom'), new Error('boom')]);
    await expect(http.getText('https://x/a')).rejects.toThrow('boom');
    expect(sleeps).toEqual([5000, 25000, 120000]);
  });
  it('fails with HttpStatusError after exhausting retries on 5xx', async () => {
    const { http, calls, sleeps } = harness([
      { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 },
    ]);
    const err = await http.getText('https://x/a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpStatusError);
    expect((err as HttpStatusError).status).toBe(500);
    expect(calls.length).toBe(4);
    expect(sleeps).toEqual([5000, 25000, 120000]);
  });
  it('reports the final status on the exhausted-retry HttpStatusError', async () => {
    const { http } = harness([
      { status: 500 }, { status: 500 }, { status: 500 }, { status: 503 },
    ]);
    await expect(http.getText('https://x/a')).rejects.toMatchObject({
      status: 503,
      url: 'https://x/a',
    });
  });
  it('fails 4xx immediately without retry', async () => {
    const { http, calls } = harness([{ status: 404 }]);
    await expect(http.getText('https://x/a')).rejects.toThrow(HttpStatusError);
    expect(calls.length).toBe(1);
  });
  // fetch follows redirects itself, so a 3xx that reaches here is a 304 or a redirect it could
  // not follow — an answer, and retrying it three times is 150 s and three requests for the
  // same answer.
  it('fails 3xx immediately without retry', async () => {
    for (const status of [301, 304, 308]) {
      const { http, calls, sleeps } = harness([{ status }]);
      await expect(http.getText('https://x/a')).rejects.toThrow(HttpStatusError);
      expect(calls.length).toBe(1);
      expect(sleeps).toEqual([]);
    }
  });
  it('parses JSON', async () => {
    const { http } = harness([{ status: 200, body: '{"a":1}' }]);
    expect(await http.getJson<{ a: number }>('https://x/a')).toEqual({ a: 1 });
  });
});

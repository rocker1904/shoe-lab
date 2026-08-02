export const USER_AGENT = 'shoe-lab/0.1 (personal comparison tool; contact: https://github.com/rocker1904/shoe-lab)';

export class HttpStatusError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export interface PoliteHttpOptions {
  userAgent?: string;
  minIntervalMs?: number;
  retryDelaysMs?: number[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class PoliteHttp {
  private readonly ua: string;
  private readonly minInterval: number;
  private readonly retryDelays: number[];
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private last: number | null = null;

  constructor(opts: PoliteHttpOptions = {}) {
    this.ua = opts.userAgent ?? USER_AGENT;
    this.minInterval = opts.minIntervalMs ?? 1000;
    this.retryDelays = opts.retryDelaysMs ?? [5000, 25000, 120000];
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  async getText(url: string): Promise<string> {
    return (await this.request(url)).text();
  }

  async getJson<T = unknown>(url: string): Promise<T> {
    return (await this.request(url)).json() as Promise<T>;
  }

  private async throttle(): Promise<void> {
    if (this.last !== null) {
      const wait = this.last + this.minInterval - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    // Stamped before the request, never after it: the gap is start-to-start (docs/scraping.md §Politeness).
    this.last = this.now();
  }

  private async request(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      let res: Response | null = null;
      let err: unknown = null;
      try {
        res = await this.fetchImpl(url, { headers: { 'user-agent': this.ua } });
      } catch (e) {
        err = e;
      }
      if (res?.ok) return res;
      // Only a 5xx or a network error is a transient. fetch follows redirects itself, so a 3xx
      // here is an answer too — retrying one costs 150 s and three requests to be told it again.
      if (res && res.status < 500) throw new HttpStatusError(res.status, url);
      const delay = this.retryDelays[attempt];
      if (delay === undefined) {
        if (res) throw new HttpStatusError(res.status, url);
        throw err;
      }
      await this.sleep(delay);
    }
  }
}

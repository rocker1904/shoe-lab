import { render, screen } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import App, { SKELETON_AFTER_MS } from './App.svelte';

/** `readFileSync(new URL(...))` does not resolve under jsdom, so the path is built the long way. */
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('renders the error state with a retry button when loading fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('nope', { status: 503 })),
  );
  render(App);
  // Nothing at all at first: a placeholder that flashes for a 200ms fetch is worse than the text
  // it replaced.
  expect(screen.queryByRole('status')).toBeNull();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/HTTP 503/);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('shows the skeleton only once the fetch is genuinely slow', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // Never resolves: the point is what is on screen while the fetch is still outstanding.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  render(App);
  expect(screen.queryByRole('status')).toBeNull();

  vi.advanceTimersByTime(SKELETON_AFTER_MS);
  await tick();
  expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i);
});

// Shared links previewed as nothing at all: no title worth reading and no icon.
it('gives a shared link a title and an icon to preview', () => {
  const html = readFileSync(join(appDir, 'index.html'), 'utf8');
  expect(html).toMatch(/<title>.*Shoe Lab.*<\/title>/);
  expect(html).toContain('rel="icon"');
  expect(readFileSync(join(appDir, 'public/favicon.svg'), 'utf8')).toContain('<svg');
});

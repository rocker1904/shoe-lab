import { render, screen } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import App, { SKELETON_AFTER_MS } from './App.svelte';
import { DEFAULT_ZONE, defaultColumns } from './lib/view';

/** `readFileSync(new URL(...))` does not resolve under jsdom, so the path is built the long way. */
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  history.replaceState(null, '', '/');
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

it('shapes the skeleton like the table that replaces it', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // Never resolves: the point is what is on screen while the fetch is still outstanding.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  const { container } = render(App);
  vi.advanceTimersByTime(SKELETON_AFTER_MS);
  await tick();
  // The point of the skeleton is that the layout does not jump when data arrives, so its shape is
  // a contract with the table: one panel, a header band, a row per shoe, no thumbnail column.
  expect(container.querySelector('.skeleton')).not.toBeNull();
  expect(container.querySelector('.skeleton .head')).not.toBeNull();
  expect(container.querySelectorAll('.skeleton .row')).toHaveLength(8);
  expect(container.querySelector('.skeleton .bar.row')).toBeNull();   // the old flat-stack shape

  // The column count is the half of the contract jsdom can hold: it is a DOM fact, not a layout
  // one. The geometry — left edge, width and header band — is measured against the real table in
  // `e2e/smoke.spec.ts`, because none of it exists here.
  const cells = defaultColumns(DEFAULT_ZONE).length + 1;                // + the name column
  for (const row of container.querySelectorAll('.skeleton .row')) {
    expect(row.querySelectorAll('i')).toHaveLength(cells);
  }
  expect(container.querySelectorAll('.skeleton .head .h-names i')).toHaveLength(cells);
});

/**
 * The room above the table is reserved by the real bands rather than by a constant, so what jsdom
 * can hold is which bands are there and that none of them is reachable — the heights are measured
 * against the real page in `e2e/smoke.spec.ts`.
 */
it.each([
  ['a bare arrival', '/', 1],
  ['a link that carries filters', '/?plate=carbon', 0],
] as const)('reserves the strip for %s', async (_who, path, strips) => {
  history.replaceState(null, '', path);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  const { container } = render(App);
  vi.advanceTimersByTime(SKELETON_AFTER_MS);
  await tick();

  expect(container.querySelector('.reserve header')).not.toBeNull();
  expect(container.querySelector('.reserve [data-testid="toolbar"]')).not.toBeNull();
  expect(container.querySelectorAll('.reserve [data-testid="setup-strip"]')).toHaveLength(strips);
  // Reserved, never offered: every one of these controls would do nothing if it were pressed.
  for (const band of container.querySelectorAll('.reserve')) expect(band).toHaveAttribute('inert');
});

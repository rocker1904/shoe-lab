import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../Page.svelte';
import SetupStrip from './SetupStrip.svelte';
import { FLEET, TESTS } from '../lib/test-fixtures';
import type { ShoesFile } from '../../../shared/types.js';
import type { Zone } from '../lib/lineage';

const data: ShoesFile = { builtAt: '2026-07-20T00:00:00Z', source: 'RunRepeat', groups: {}, tests: TESTS, shoes: FLEET };
const props = {
  zone: 'heel' as Zone | null, selected: null as string | null,
  onzone: vi.fn(), onstory: vi.fn(), onabout: vi.fn(),
};

describe('SetupStrip', () => {
  it('asks both questions once, as six cards', () => {
    render(SetupStrip, { props: { ...props } });
    const names = screen.getAllByRole('button').filter((b) => b.classList.contains('card'))
      .map((b) => b.querySelector('.name')?.textContent);
    expect(names).toEqual(['Heel', 'Forefoot', 'All', 'Easy', 'Tempo', 'Race']);
  });

  // A scored story's count is its pool rather than a shortlist, so no card carries one
  // (docs/app.md §The toolbar).
  it('counts nothing, on either kind of card', () => {
    render(SetupStrip, { props: { ...props } });
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveTextContent(/\d/);
  });

  it('describes each story in a line, which the toolbar has no room for', () => {
    render(SetupStrip, { props: { ...props } });
    expect(screen.getByRole('button', { name: /Easy/ })).toHaveTextContent('Cushioned, durable, no carbon');
    // Pinned for all three: these lines name what each score ranks on, so a story's terms changing
    // without the copy changing is exactly the drift worth failing on.
    expect(screen.getByRole('button', { name: /Tempo/ })).toHaveTextContent('Lively, light, lasts the season');
    expect(screen.getByRole('button', { name: /Race/ })).toHaveTextContent('Fastest, lightest, one day only');
    expect(screen.getByRole('button', { name: /All/ })).toHaveTextContent('Everything in the catalogue');
  });

  // Neither label makes a claim about the person: "I land on my heel" tells a curious browser they
  // are being mislabelled, where these describe what the control does (docs/app.md §Presets).
  it('labels the groups by what they do, not by who the runner is', () => {
    render(SetupStrip, { props: { ...props } });
    expect(screen.getByText('Measured at')).toBeInTheDocument();
    expect(screen.getByText('Built for')).toBeInTheDocument();
    expect(screen.queryByText(/I land on/)).toBeNull();
  });

  it('reports the card that was picked', async () => {
    const onzone = vi.fn();
    const onstory = vi.fn();
    render(SetupStrip, { props: { ...props, onzone, onstory } });
    await fireEvent.click(screen.getByRole('button', { name: /^Forefoot/ }));
    expect(onzone).toHaveBeenCalledWith('forefoot');
    await fireEvent.click(screen.getByRole('button', { name: /Race/ }));
    expect(onstory).toHaveBeenCalledWith('race');
  });

  it('marks the chosen zone and the chosen story, and nothing else', () => {
    render(SetupStrip, { props: { ...props, selected: 'tempo' } });
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.querySelector('.name')?.textContent))
      .toEqual(['Heel', 'Tempo']);
  });

  // Anchored regexes, matching the file's own convention: the card carries a reserved count span
  // as well as its name.
  it('presses neither card when the view commits to no zone', () => {
    render(SetupStrip, { props: { ...props, zone: null } });
    for (const name of [/^Heel/, /^Forefoot/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  // One body of explanation to keep true, offered in words on the screen where a first arrival is
  // standing rather than in a punctuation mark.
  it('invites the About panel instead of explaining each group itself', async () => {
    const onabout = vi.fn();
    render(SetupStrip, { props: { ...props, onabout } });
    expect(screen.queryByRole('button', { name: /^About Measured at/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^About Built for/ })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: /Read about this table/ }));
    expect(onabout).toHaveBeenCalled();
  });

  it('carries no title attribute — a tooltip is the mechanism this replaces', () => {
    render(SetupStrip, { props: { ...props } });
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveAttribute('title');
  });
});

describe('Page setup strip', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  it('shows on a bare arrival', () => {
    render(Page, { props: { data } });
    expect(screen.getByTestId('setup-strip')).toBeInTheDocument();
  });

  it('stays hidden when a link carries filters', () => {
    history.replaceState(null, '', '/?plate=carbon');
    render(Page, { props: { data } });
    expect(screen.queryByTestId('setup-strip')).toBeNull();
  });

  // Every bare arrival is a fresh start, so a filtered session last week says nothing about this
  // one: the address bar is the only thing that can collapse the strip.
  it('shows on a bare arrival even after a previous filtered session', () => {
    localStorage.setItem('shoe-lab.view.v4', 'plate=carbon');
    render(Page, { props: { data } });
    expect(screen.getByTestId('setup-strip')).toBeInTheDocument();
  });

  it('survives a zone change, which is the other half of the same question', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getAllByRole('button', { name: /^Forefoot/ })[0]!);
    expect(screen.getByTestId('setup-strip')).toBeInTheDocument();
  });

  it('collapses for good once a story is chosen', async () => {
    render(Page, { props: { data } });
    await fireEvent.click(screen.getByRole('button', { name: /^Easy/ }));
    // The collapse is a height transition, so the node outlives the click by its duration.
    await waitFor(() => expect(screen.queryByTestId('setup-strip')).toBeNull());
    await fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(screen.queryByTestId('setup-strip')).toBeNull();   // does not return
  });
});

// `fileURLToPath`, because the jsdom environment replaces the global `URL` with one `readFileSync`
// rejects (tokens.test.ts and labels.test.ts say the same).
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'SetupStrip.svelte'), 'utf8');

it('marks a chosen card without filling it, so hover and selected stay different states', () => {
  // `.card:hover` and `.card.on` set the same border AND the same tint today, so a hovered card is
  // indistinguishable from the chosen one. Hover keeps the border; only selected tints.
  const hover = src.match(/\.card:hover \{[^}]*\}/)![0];
  expect(hover).toContain('border-color');
  expect(hover).not.toContain('background');
  expect(src).toMatch(/\.card\.on \{[^}]*background: var\(--accent-dim\)/);
  // The 2px border and its padding compensation existed only to stop the card resizing.
  expect(src).not.toContain('border-width: 2px');
});

it('leaves the focus ring to the one rule in app.css', () => {
  expect(src).not.toContain('outline-offset');
});

import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Header from './Header.svelte';

const props = {
  total: 450, visible: 150, builtAt: '2026-07-20T00:00:00Z', theme: 'auto' as const,
  onexport: vi.fn(), ontheme: vi.fn(),
};

/** jsdom implements no clipboard at all, so it has to be planted rather than spied on. */
function stubClipboard(writeText = vi.fn(async () => {})) {
  const saved = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return { writeText, restore: () => {
    if (saved) Object.defineProperty(navigator, 'clipboard', saved);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  } };
}
const settled = () => new Promise((r) => setTimeout(r, 0));

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe('Header', () => {
  // Shareable URLs are a stated goal of the project with no affordance at all until now.
  it('copies the current view, and says so', async () => {
    const clip = stubClipboard();
    restore = clip.restore;
    render(Header, { props });
    // The region is on the page before there is anything to say: a live region created together
    // with its text is not reliably announced, so only the text may arrive late.
    expect(screen.getByRole('status').textContent).toBe('');
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(clip.writeText).toHaveBeenCalledWith(location.href);
    // The confirmation is its own live region, so the button keeps one accessible name and the
    // outcome is announced rather than swapped in under it.
    expect(await screen.findByRole('status')).toHaveTextContent(/copied/i);
  });

  it('claims nothing when the clipboard refuses', async () => {
    const clip = stubClipboard(vi.fn(async () => { throw new Error('denied'); }));
    restore = clip.restore;
    render(Header, { props });
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await settled();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('copies nothing where there is no clipboard, rather than throwing', async () => {
    const saved = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    restore = () => { if (saved) Object.defineProperty(navigator, 'clipboard', saved); };
    render(Header, { props });
    await fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await settled();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

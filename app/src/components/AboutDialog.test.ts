import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AboutDialog from './AboutDialog.svelte';
import { SCORE_DEFS } from '../lib/score-defs';

describe('AboutDialog', () => {
  it('is a modal dialog named for what it explains', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog', { name: 'About this table' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
  });

  // Three sections, one per control on the setup row it explains. The headings are the labels the
  // reader has already seen on screen, so the panel reads as a key to that row.
  it('carries one section per control on the setup row', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog');
    for (const heading of ['Measured at', 'Easy, Tempo and Race', 'Stability']) {
      expect(within(dlg).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  // `story` is this project's word for a preset, not a runner's. It appears nowhere a runner reads.
  it('never says story', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    expect(screen.getByRole('dialog').textContent).not.toMatch(/story|stories/i);
  });

  // The claim "every number here was measured rather than given by a reviewer" is contradicted
  // twice on the same screen: the RunRepeat Score column is a reviewer's verdict, and the Easy,
  // Tempo and Race columns are computed by us. The panel distinguishes the two instead.
  it('says whose each score is rather than claiming everything is measured', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent(/RunRepeat Score column is their verdict, not ours/i);
    expect(dlg.textContent).not.toMatch(/every number/i);
  });

  it('states what the scores exclude and why a shoe can have none', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveTextContent(/price and release date are not factored in/i);
    expect(dlg).toHaveTextContent(/unscored, and sorts last/i);
  });

  // A panel that talks about whose data this is links to them: the attribution is structural
  // rather than decorative (docs/decisions.md §Be a good citizen toward RunRepeat).
  it('links to RunRepeat', () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const link = within(screen.getByRole('dialog')).getByRole('link', { name: /RunRepeat/ });
    expect(link).toHaveAttribute('href', 'https://runrepeat.com/catalog/running-shoes');
  });

  // The Stability section names Easy and Tempo by hand, where the caption it replaces derived them
  // from the definitions that declare a stable variant. Prose is worth the trade — but a fourth
  // stable story would leave the panel quietly claiming two, so the derivation becomes a guard
  // instead of an interpolation, failing here with the sentence to edit rather than in a reader's
  // face (docs/app.md §The story scores).
  it('names by hand exactly the stories that declare a stable variant', () => {
    expect(SCORE_DEFS.filter((d) => d.stable).map((d) => d.id)).toEqual(['easy', 'tempo']);
  });

  it('closes on the Close button, on Escape and on an outside press', async () => {
    const onclose = vi.fn();
    render(AboutDialog, { props: { onclose } });
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalledTimes(1);

    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(2);

    await fireEvent.click(screen.getByTestId('about-scrim'));
    expect(onclose).toHaveBeenCalledTimes(3);
  });

  // `aria-modal` tells a screen reader the rest of the page is inert; without a trap, Tab walks
  // straight out of it and the promise is a lie. The panel holds exactly two stops — the credit
  // link and Close — so a Tab from either end has to land on the other rather than on `<body>`.
  it('traps Tab inside itself and opens on the Close button', async () => {
    render(AboutDialog, { props: { onclose: vi.fn() } });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /RunRepeat/ }));
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
  });
});

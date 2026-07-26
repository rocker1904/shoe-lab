import { render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import App from './App.svelte';

it('renders the error state with a retry button when loading fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('nope', { status: 503 })),
  );
  render(App);
  expect(screen.getByText(/Loading shoe data/)).toBeInTheDocument();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/HTTP 503/);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredView, VIEW_STORAGE_KEY, writeStoredView } from './persist';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('persist', () => {
  it('reads back what it wrote', () => {
    writeStoredView('plate=carbon&sort=-weight');
    expect(readStoredView()).toBe('plate=carbon&sort=-weight');
  });
  it('returns null when nothing has been stored', () => {
    expect(readStoredView()).toBeNull();
  });
  it('keeps an empty query string distinguishable from nothing stored', () => {
    writeStoredView('');
    expect(readStoredView()).toBe('');
  });
  it('never reads a value stored under a different schema version', () => {
    // derived from the live key so it stays honest across a bump: the old key is simply
    // never read again, and there are no migrations
    expect(VIEW_STORAGE_KEY).toMatch(/\d+$/);
    const older = VIEW_STORAGE_KEY.replace(/\d+$/, (n) => String(Number(n) - 1));
    const newer = VIEW_STORAGE_KEY.replace(/\d+$/, (n) => String(Number(n) + 1));
    localStorage.setItem(older, 'plate=carbon');
    localStorage.setItem(newer, 'plate=none');
    expect(readStoredView()).toBeNull();
  });
  // Storage access throws outright where it is blocked (embedded frames, hard privacy settings)
  // rather than returning null, and losing a saved view must never cost the page.
  it('returns null instead of throwing when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStoredView()).toBeNull();
  });
  it('swallows a throwing write rather than failing the caller', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => writeStoredView('plate=carbon')).not.toThrow();
  });
});

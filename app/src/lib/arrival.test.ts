import { afterEach, describe, expect, it } from 'vitest';
import { isBareArrival } from './arrival';

afterEach(() => history.replaceState(null, '', '/'));

describe('isBareArrival', () => {
  it('is true with no query string', () => {
    history.replaceState(null, '', '/');
    expect(isBareArrival()).toBe(true);
  });
  it('is true for a lone question mark, which carries nothing', () => {
    history.replaceState(null, '', '/?');
    expect(isBareArrival()).toBe(true);
  });
  it('is false once the address carries anything at all', () => {
    history.replaceState(null, '', '/?plate=carbon');
    expect(isBareArrival()).toBe(false);
    // including a token the app never reads: something was sent, so this is not a fresh start
    history.replaceState(null, '', '/?utm_source=twitter');
    expect(isBareArrival()).toBe(false);
  });
  // The whole point of the change: storage no longer answers for the view, so nothing a previous
  // session left in the browser can make a bare address read as anything but a fresh start.
  it('ignores a view left in storage by an older build', () => {
    localStorage.setItem('shoe-lab.view.v4', 'plate=carbon');
    history.replaceState(null, '', '/');
    expect(isBareArrival()).toBe(true);
    localStorage.clear();
  });
});

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
  it('is false once the address carries a token this app owns', () => {
    for (const qs of ['plate=carbon', 'r.weight=~250', 'q=nova', 'sort=-weight', 'cols=score',
                      'stab=1', 'gen.midsole-softness-22=midsole-softness', 'open=some-shoe',
                      // A feature selection is something sent, like every other filter: a link
                      // carrying only one must not open on the strip a bare address gets.
                      'c.heel-tab=none', 'c.removable-insole=true']) {
      history.replaceState(null, '', `/?${qs}`);
      expect(isBareArrival(), qs).toBe(false);
    }
  });
  /**
   * A token this app does not own is not "something sent". A link forwarded through a newsletter
   * arrives wearing these, they say nothing about the fleet, and the runner must get the arrival
   * the bare address would have given them (docs/app.md §View and URL ownership).
   */
  it('is true for tokens the app does not own, alone or beside each other', () => {
    for (const qs of ['utm_source=twitter', 'fbclid=xyz', 'utm_source=n&utm_medium=email&ref=x']) {
      history.replaceState(null, '', `/?${qs}`);
      expect(isBareArrival(), qs).toBe(true);
    }
  });
  /** The canonical address is what `Page.svelte` asks about, and it only ever holds owned keys —
   *  so a link whose every token parsing dropped canonicalises to nothing and reads as bare. */
  it('reads a composed address as bare exactly when it is empty', () => {
    expect(isBareArrival('')).toBe(true);
    expect(isBareArrival('plate=carbon')).toBe(false);
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
